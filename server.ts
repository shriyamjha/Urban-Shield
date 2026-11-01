import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';
import fs from 'fs';
import {
  VERIFIED_CHANDIGARH_MOHALI_POIS,
  CHANDIGARH_MOHALI_GAZETTEER,
  haversineDistanceKm,
} from './src/data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from './src/data/historicalCrimeData.ts';
import {
  UserProfile,
  UserPreferences,
  TrustedContact,
  CommunityResponder,
  SosIncident,
  CommunityReport,
  CityPoi,
  SmartRouteOption,
  RouteFacilityDetail,
  TravelMode,
} from './src/types/urbanshield.ts';
import {
  requireAuth,
  AuthRequest,
  localSessionTokens,
  issueStatelessSessionToken,
} from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  findUserByEmail,
  findUserByPhone,
  getUserBundleByUid,
  updateUserAndPreferences,
  deleteUserAccountByUid,
  addTrustedContactForUser,
  deleteTrustedContactForUser,
  getAllResponders,
  upsertResponder,
  getAllSosIncidents,
  createSosIncidentRecord,
  updateSosIncidentRecord,
  getAllCommunityReports,
  createCommunityReportRecord,
  updateCommunityReportRecord,
  toggleCommunityReportConfirmation,
} from './src/db/users.ts';

dotenv.config();

const PORT = 3000;

interface OtpRecord {
  target: string;
  code: string;
  expiresAt: number;
  purpose: 'phone_login' | 'email_verify' | 'password_reset';
}

const otpRecords = new Map<string, OtpRecord>();

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, usedSalt, 64).toString('hex');
  return { hash, salt: usedSalt };
}

function issueLocalSessionToken(uid: string, email: string, name?: string): string {
  return issueStatelessSessionToken(uid, email, name);
}

// Simple rate limiter for report submission & SOS creation
const rateLimitMap = new Map<string, number[]>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= maxRequests) {
    return false;
  }
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

// Server-side Geocoding & Routing Caches (Part 12 — API Optimisation)
const geocodeCache = new Map<
  string,
  {
    expiresAt: number;
    results: Array<{ id: string; name: string; latitude: number; longitude: number; type: string }>;
  }
>();
const routeCache = new Map<
  string,
  { expiresAt: number; routes: SmartRouteOption[]; note?: string }
>();

// Cached Overpass POIs (refreshed every 30 mins to respect public Overpass rate limits)
let cachedOverpassPois: CityPoi[] = [...VERIFIED_CHANDIGARH_MOHALI_POIS];
let lastOverpassFetchTime = 0;

async function fetchLiveOverpassPois(): Promise<CityPoi[]> {
  if (
    Date.now() - lastOverpassFetchTime < 30 * 60 * 1000 &&
    cachedOverpassPois.length > VERIFIED_CHANDIGARH_MOHALI_POIS.length
  ) {
    return cachedOverpassPois;
  }

  const query = `
    [out:json][timeout:12];
    (
      node["amenity"~"hospital|clinic|pharmacy|police|fuel|restaurant|cafe|bus_station|college|university"](30.67,76.70,30.78,76.82);
      node["shop"~"supermarket|convenience|department_store|mall"](30.69,76.71,30.77,76.81);
      node["highway"="bus_stop"](30.69,76.71,30.77,76.81);
      node["highway"="street_lamp"](30.71,76.75,30.76,76.80);
      node["man_made"="surveillance"](30.69,76.71,30.77,76.81);
    );
    out body 160;
  `;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return cachedOverpassPois;
    }

    const data = (await response.json()) as {
      elements?: Array<{
        id: number;
        lat?: number;
        lon?: number;
        tags?: Record<string, string>;
      }>;
    };

    if (!data.elements || !Array.isArray(data.elements)) {
      return cachedOverpassPois;
    }

    const liveItems: CityPoi[] = [];
    for (const el of data.elements) {
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
      const tags = el.tags || {};
      let category: CityPoi['category'] | null = null;
      if (tags.amenity === 'hospital') category = 'hospital';
      else if (tags.amenity === 'clinic' || tags.amenity === 'doctors') category = 'clinic';
      else if (tags.amenity === 'pharmacy') category = 'pharmacy';
      else if (tags.amenity === 'police') category = 'police';
      else if (tags.amenity === 'fuel') category = 'fuel';
      else if (tags.amenity === 'restaurant') category = 'restaurant';
      else if (tags.amenity === 'cafe') category = 'cafe';
      else if (tags.shop) category = 'shop';
      else if (tags.amenity === 'college' || tags.amenity === 'university') category = 'education';
      else if (tags.amenity === 'bus_station' || tags.highway === 'bus_stop') category = 'transport';
      else if (tags.highway === 'street_lamp') category = 'streetlight';
      else if (tags.man_made === 'surveillance') category = 'cctv';

      if (!category) continue;
      const defaultNameMap: Record<string, string> = {
        streetlight: `OSM Verified Streetlight Node #${el.id}`,
        cctv: `OSM Verified Surveillance Camera #${el.id}`,
        transport: 'CTU / Public Transit Stop',
      };
      const name = tags.name || tags['name:en'] || defaultNameMap[category];
      if (!name) continue;

      liveItems.push({
        id: `osm-live-${el.id}`,
        name,
        category,
        latitude: el.lat,
        longitude: el.lon,
        address:
          [tags['addr:street'], tags['addr:suburb'] || tags['addr:sector'], tags['addr:city']]
            .filter(Boolean)
            .join(', ') || undefined,
        phone: tags.phone || tags['contact:phone'] || undefined,
        openingHours: tags.opening_hours || undefined,
        operator: tags.operator || undefined,
        source: 'OpenStreetMap / Overpass API',
        verified: true,
        cctvClass: category === 'cctv' ? 'verified_camera' : undefined,
        streetlightClass: category === 'streetlight' ? 'verified_streetlight' : undefined,
      });
    }

    const merged = [...VERIFIED_CHANDIGARH_MOHALI_POIS];
    for (const item of liveItems) {
      const duplicate = merged.some(
        (existing) =>
          existing.category === item.category &&
          haversineDistanceKm(
            existing.latitude,
            existing.longitude,
            item.latitude,
            item.longitude
          ) < 0.08
      );
      if (!duplicate) {
        merged.push(item);
      }
    }

    cachedOverpassPois = merged;
    lastOverpassFetchTime = Date.now();
    return cachedOverpassPois;
  } catch {
    return cachedOverpassPois;
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  app.use(express.json({ limit: '5mb' }));

  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url || '';
    if (pathname.startsWith('/ws')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (ws) => {
    clients.add(ws);
    try {
      const [respondersList, reportsList] = await Promise.all([
        getAllResponders(),
        getAllCommunityReports(),
      ]);
      ws.send(
        JSON.stringify({
          type: 'init:state',
          payload: {
            responders: respondersList,
            communityReports: reportsList,
          },
        })
      );
    } catch {
      // Ignore initial WS hydration error
    }

    ws.on('close', () => {
      clients.delete(ws);
    });
  });

  function broadcastEvent(type: string, payload: unknown) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  // ==========================================================================
  // 1. AUTHENTICATION & USER ACCOUNT ENDPOINTS
  // ==========================================================================

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, fullName, phone } = req.body as {
        email?: string;
        password?: string;
        fullName?: string;
        phone?: string;
      };

      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      }

      const existing = await findUserByEmail(cleanEmail);
      if (existing) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please sign in instead.',
        });
      }

      const { hash, salt } = hashPassword(password);
      const uid = `usr_${crypto.randomUUID()}`;

      const verifyCode = String(Math.floor(100000 + Math.random() * 900000));
      otpRecords.set(`email:${cleanEmail}`, {
        target: cleanEmail,
        code: verifyCode,
        expiresAt: Date.now() + 15 * 60 * 1000,
        purpose: 'email_verify',
      });

      await getOrCreateUser(uid, cleanEmail, {
        fullName: (fullName || cleanEmail.split('@')[0]).trim(),
        phone: (phone || '').trim(),
        authProvider: 'email',
        emailVerified: false,
        phoneVerified: false,
        passwordHash: hash,
        passwordSalt: salt,
      });

      const bundle = await getUserBundleByUid(uid);
      const token = issueLocalSessionToken(uid, cleanEmail, fullName);

      res.status(201).json({
        token,
        user: bundle?.user,
        preferences: bundle?.preferences,
        contacts: bundle?.contacts || [],
        emailVerificationCodePreview: verifyCode,
      });
    } catch (error: any) {
      console.error('Register error:', error);
      res.status(500).json({ error: error.message || 'Registration failed. Please try again.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const cleanEmail = (email || '').trim().toLowerCase();

      if (!cleanEmail || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const userRow = await findUserByEmail(cleanEmail);
      if (!userRow || !userRow.passwordHash || !userRow.passwordSalt) {
        return res.status(401).json({
          error:
            'Invalid email or password. If you signed up with Google or Mobile OTP, use that method.',
        });
      }

      const { hash } = hashPassword(password, userRow.passwordSalt);
      if (hash !== userRow.passwordHash) {
        return res.status(401).json({ error: 'Incorrect password. Please try again.' });
      }

      const bundle = await getUserBundleByUid(userRow.uid);
      const token = issueLocalSessionToken(userRow.uid, userRow.email, userRow.fullName);

      res.json({
        token,
        user: bundle?.user,
        preferences: bundle?.preferences,
        contacts: bundle?.contacts || [],
      });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: error.message || 'Sign in failed. Please try again.' });
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    try {
      const { uid, email, fullName, avatarUrl } = req.body as {
        uid?: string;
        email?: string;
        fullName?: string;
        avatarUrl?: string;
      };

      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Valid Google account email is required.' });
      }

      const existing = await findUserByEmail(cleanEmail);
      const targetUid = existing ? existing.uid : uid || `google_${crypto.randomUUID()}`;

      await getOrCreateUser(targetUid, cleanEmail, {
        fullName: (fullName || cleanEmail.split('@')[0]).trim(),
        avatarUrl,
        authProvider: 'google',
        emailVerified: true,
      });

      const bundle = await getUserBundleByUid(targetUid);
      const token = issueLocalSessionToken(targetUid, cleanEmail, fullName);

      res.json({
        token,
        user: bundle?.user,
        preferences: bundle?.preferences,
        contacts: bundle?.contacts || [],
      });
    } catch (error: any) {
      console.error('Google Auth error:', error);
      res.status(500).json({ error: error.message || 'Google authentication failed.' });
    }
  });

  app.post('/api/auth/otp/send', (req, res) => {
    try {
      const { countryCode = '+91', mobileNumber } = req.body as {
        countryCode?: string;
        mobileNumber?: string;
      };

      const digitsOnly = (mobileNumber || '').replace(/\D/g, '');
      if (countryCode === '+91') {
        if (!/^[6-9]\d{9}$/.test(digitsOnly)) {
          return res.status(400).json({
            error: 'Invalid Indian mobile number. Must be 10 digits starting with 6, 7, 8, or 9.',
          });
        }
      } else if (digitsOnly.length < 7 || digitsOnly.length > 14) {
        return res.status(400).json({
          error: 'Please enter a valid mobile number (7–14 digits).',
        });
      }

      const fullPhone = `${countryCode}${digitsOnly}`;
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));

      otpRecords.set(`phone:${fullPhone}`, {
        target: fullPhone,
        code: otpCode,
        expiresAt: Date.now() + 5 * 60 * 1000,
        purpose: 'phone_login',
      });

      const twilioConfigured = Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          process.env.TWILIO_FROM_NUMBER
      );

      res.json({
        success: true,
        phone: fullPhone,
        expiresInSeconds: 300,
        smsGatewayConfigured: twilioConfigured,
        deliveryStatus: twilioConfigured
          ? 'SMS dispatched via configured Twilio provider'
          : 'Verification code generated below',
        verificationCodePreview: twilioConfigured ? undefined : otpCode,
      });
    } catch (error: any) {
      console.error('OTP send error:', error);
      res.status(500).json({ error: 'Failed to generate OTP.' });
    }
  });

  app.post('/api/auth/otp/verify', async (req, res) => {
    try {
      const { countryCode = '+91', mobileNumber, otp } = req.body as {
        countryCode?: string;
        mobileNumber?: string;
        otp?: string;
      };

      const digitsOnly = (mobileNumber || '').replace(/\D/g, '');
      const fullPhone = `${countryCode}${digitsOnly}`;
      const record = otpRecords.get(`phone:${fullPhone}`);

      if (!record) {
        return res.status(400).json({
          error: 'No active OTP found for this mobile number. Please request a new OTP.',
        });
      }

      if (record.expiresAt < Date.now()) {
        otpRecords.delete(`phone:${fullPhone}`);
        return res.status(400).json({
          error: 'OTP has expired. Please click Resend OTP to receive a fresh code.',
        });
      }

      if (record.code !== (otp || '').trim()) {
        return res.status(401).json({
          error: 'Incorrect 6-digit OTP code. Please double-check and try again.',
        });
      }

      otpRecords.delete(`phone:${fullPhone}`);

      const existing = await findUserByPhone(fullPhone);
      const uid = existing ? existing.uid : `phone_${ digitsOnly }`;
      const email = existing?.email || `${digitsOnly}@mobile.urbanshield.in`;

      await getOrCreateUser(uid, email, {
        fullName: existing?.fullName || '',
        phone: fullPhone,
        authProvider: 'phone',
        emailVerified: Boolean(existing?.emailVerified),
        phoneVerified: true,
      });

      await updateUserAndPreferences(uid, { phone: fullPhone, phoneVerified: true });
      const bundle = await getUserBundleByUid(uid);
      const token = issueLocalSessionToken(uid, email, bundle?.user.fullName);

      res.json({
        token,
        user: bundle?.user,
        preferences: bundle?.preferences,
        contacts: bundle?.contacts || [],
      });
    } catch (error: any) {
      console.error('OTP verify error:', error);
      res.status(500).json({ error: error.message || 'OTP verification failed.' });
    }
  });

  app.post('/api/auth/password-reset/request', async (req, res) => {
    try {
      const { email } = req.body as { email?: string };
      const cleanEmail = (email || '').trim().toLowerCase();
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      const userRow = await findUserByEmail(cleanEmail);
      if (!userRow) {
        return res.status(404).json({
          error: 'No registered account found with that email address.',
        });
      }

      const resetCode = String(Math.floor(100000 + Math.random() * 900000));
      otpRecords.set(`reset:${cleanEmail}`, {
        target: cleanEmail,
        code: resetCode,
        expiresAt: Date.now() + 15 * 60 * 1000,
        purpose: 'password_reset',
      });

      res.json({
        success: true,
        message: 'Password reset verification code generated.',
        resetCodePreview: resetCode,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to request password reset.' });
    }
  });

  app.post('/api/auth/password-reset/confirm', async (req, res) => {
    try {
      const { email, code, newPassword } = req.body as {
        email?: string;
        code?: string;
        newPassword?: string;
      };
      const cleanEmail = (email || '').trim().toLowerCase();
      const record = otpRecords.get(`reset:${cleanEmail}`);

      if (!record || record.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Reset code is invalid or expired.' });
      }
      if (record.code !== (code || '').trim()) {
        return res.status(401).json({ error: 'Incorrect password reset code.' });
      }
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      }

      const userRow = await findUserByEmail(cleanEmail);
      if (!userRow) {
        return res.status(404).json({ error: 'Account not found.' });
      }

      const { hash, salt } = hashPassword(newPassword);
      await updateUserAndPreferences(userRow.uid, {
        passwordHash: hash,
        passwordSalt: salt,
        emailVerified: true,
      });
      otpRecords.delete(`reset:${cleanEmail}`);

      res.json({ success: true, message: 'Password updated. You can now sign in.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Password reset failed.' });
    }
  });

  app.post('/api/auth/verify-email', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { code } = req.body as { code?: string };
      if ((code || '').trim().length === 6) {
        const updated = await updateUserAndPreferences(uid, { emailVerified: true });
        return res.json({ user: updated.user });
      }
      return res.status(400).json({ error: 'Invalid 6-digit verification code.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to verify email.' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const bundle = await getUserBundleByUid(uid);
      if (!bundle) {
        return res.status(404).json({ error: 'User profile not found.' });
      }
      res.json(bundle);
    } catch (error: any) {
      console.error('Failed to fetch user session bundle:', error);
      res.status(500).json({ error: error.message || 'Failed to load profile.' });
    }
  });

  app.put('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const updates = req.body as Partial<UserProfile> & {
        preferences?: Partial<UserPreferences>;
      };
      const result = await updateUserAndPreferences(uid, updates);
      res.json(result);
    } catch (error: any) {
      console.error('Failed to update user profile:', error);
      res.status(500).json({ error: error.message || 'Failed to update profile.' });
    }
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthRequest, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const tok = authHeader.slice('Bearer '.length).trim();
      localSessionTokens.delete(tok);
    }
    res.json({ success: true });
  });

  app.delete('/api/auth/account', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      await deleteUserAccountByUid(uid);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to delete account:', error);
      res.status(500).json({ error: error.message || 'Failed to delete account.' });
    }
  });

  // ==========================================================================
  // 2. TRUSTED EMERGENCY CONTACTS (Strictly Private per User)
  // ==========================================================================

  app.get('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const bundle = await getUserBundleByUid(req.user!.uid);
      res.json({ contacts: bundle?.contacts || [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch contacts.' });
    }
  });

  app.post('/api/contacts', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const payload = req.body as Partial<TrustedContact>;
      if (!payload.name?.trim() || !payload.phone?.trim()) {
        return res.status(400).json({ error: 'Contact name and phone number are required.' });
      }
      const contacts = await addTrustedContactForUser(uid, payload);
      res.status(201).json({ contacts });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to add contact.' });
    }
  });

  app.delete('/api/contacts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const contactId = Number(req.params.id);
      const contacts = await deleteTrustedContactForUser(uid, contactId);
      res.json({ contacts });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete contact.' });
    }
  });

  // ==========================================================================
  // 3. SOS EMERGENCY NETWORK & COMMUNITY RESPONDERS
  // ==========================================================================

  app.get('/api/sos', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const [allIncidents, allResponders] = await Promise.all([
        getAllSosIncidents(),
        getAllResponders(),
      ]);

      const myResponder = allResponders.find((r) => r.userId === uid);
      const incidents = allIncidents.map((inc) => {
        if (
          inc.userId === uid ||
          (myResponder && myResponder.availabilityStatus === 'available')
        ) {
          return inc;
        }
        return {
          ...inc,
          latitude: Number(inc.latitude.toFixed(2)),
          longitude: Number(inc.longitude.toFixed(2)),
          shareToken: 'REDACTED_PRIVATE',
        };
      });

      res.json({
        incidents,
        responders: allResponders,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load SOS incidents.' });
    }
  });

  app.post('/api/sos/activate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!checkRateLimit(`sos:${uid}`, 5, 10 * 60 * 1000)) {
        return res.status(429).json({
          error: 'Rate limit exceeded for SOS activations.',
        });
      }

      const bundle = await getUserBundleByUid(uid);
      const userContacts = bundle?.contacts || [];
      const { latitude, longitude, areaLabel, notes } = req.body as {
        latitude?: number;
        longitude?: number;
        areaLabel?: string;
        notes?: string;
      };

      const lat = typeof latitude === 'number' ? latitude : 30.7333;
      const lng = typeof longitude === 'number' ? longitude : 76.7794;

      const twilioConfigured = Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          process.env.TWILIO_FROM_NUMBER
      );

      const shareToken = crypto.randomBytes(12).toString('hex');
      const incident = await createSosIncidentRecord({
        userId: uid,
        userName:
          bundle?.user.fullName ||
          bundle?.user.email ||
          bundle?.user.phone ||
          'Authenticated Citizen',
        status: 'active',
        latitude: lat,
        longitude: lng,
        areaLabel: areaLabel || 'Chandigarh / Mohali Urban Corridor',
        notes: notes?.trim() || 'Emergency SOS triggered via UrbanShield Command Centre',
        shareToken,
        notificationsDispatched: twilioConfigured && userContacts.length > 0,
        notificationChannelDetail:
          userContacts.length === 0
            ? 'No trusted contacts configured yet — Live SOS broadcast active on responder network'
            : twilioConfigured
            ? `Dispatched SMS alert to ${userContacts.length} trusted contact(s) via Twilio gateway`
            : `Recorded alert for ${userContacts.length} trusted contact(s). Share live tracking link directly`,
        notifiedContactsCount: userContacts.length,
        responses: [],
      });

      broadcastEvent('sos:created', incident);
      res.status(201).json({ incident });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to activate SOS.' });
    }
  });

  app.post('/api/sos/:id/respond', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const incidentId = Number(req.params.id);
      const [allIncidents, allResponders, bundle] = await Promise.all([
        getAllSosIncidents(),
        getAllResponders(),
        getUserBundleByUid(uid),
      ]);

      const incident = allIncidents.find((i) => Number(i.id) === incidentId);
      if (!incident) {
        return res.status(404).json({ error: 'Emergency incident not found.' });
      }

      const { action, etaMinutes } = req.body as {
        action: 'acknowledged' | 'declined';
        etaMinutes?: number;
      };

      const responder = allResponders.find((r) => r.userId === uid);
      const respName =
        responder?.fullName || bundle?.user.fullName || req.user?.email || 'Community Responder';
      const respRole = responder?.roleQualification || 'Opt-In Citizen Responder';
      const respId = responder?.id || `resp_${uid}`;

      const responses = [...incident.responses];
      const existingIdx = responses.findIndex((r) => r.responderId === respId);
      const entry = {
        responderId: respId,
        responderName: respName,
        roleQualification: respRole,
        action,
        etaMinutes: action === 'acknowledged' ? etaMinutes || 6 : undefined,
        timestamp: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        responses[existingIdx] = entry;
      } else {
        responses.push(entry);
      }

      const newStatus =
        action === 'acknowledged' && incident.status === 'active'
          ? 'acknowledged'
          : incident.status;

      const updated = await updateSosIncidentRecord(incidentId, {
        status: newStatus,
        responses,
      });

      if (updated) {
        broadcastEvent('sos:updated', updated);
      }
      res.json({ incident: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to record responder action.' });
    }
  });

  app.post('/api/sos/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const incidentId = Number(req.params.id);
      const allIncidents = await getAllSosIncidents();
      const incident = allIncidents.find((i) => Number(i.id) === incidentId);

      if (!incident) {
        return res.status(404).json({ error: 'Incident not found.' });
      }
      if (incident.userId !== uid) {
        return res.status(403).json({
          error: 'Only the citizen who activated this SOS can cancel or resolve it.',
        });
      }

      const { status } = req.body as { status: 'resolved' | 'cancelled' };
      const updated = await updateSosIncidentRecord(incidentId, {
        status,
        resolvedAt: new Date(),
      });

      if (updated) {
        broadcastEvent('sos:updated', updated);
      }
      res.json({ incident: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update SOS status.' });
    }
  });

  app.post('/api/responders/register', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const payload = req.body as Partial<CommunityResponder>;
      const responder = await upsertResponder(uid, payload);
      const respondersList = await getAllResponders();
      broadcastEvent('responders:updated', respondersList);
      res.json({ responder, responders: respondersList });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to register responder.' });
    }
  });

  // ==========================================================================
  // 4. COMMUNITY INCIDENT REPORTING
  // ==========================================================================

  app.get('/api/reports', async (_req, res) => {
    try {
      const reports = await getAllCommunityReports();
      res.json({ reports });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to load community reports.' });
    }
  });

  app.post('/api/reports', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      if (!checkRateLimit(`report:${uid}`, 6, 15 * 60 * 1000)) {
        return res.status(429).json({
          error: 'Reporting rate limit reached (max 6 reports per 15 minutes).',
        });
      }

      const bundle = await getUserBundleByUid(uid);
      const { category, title, description, latitude, longitude, locationLabel, photoUrl } =
        req.body as Partial<CommunityReport>;

      if (!category || !title?.trim() || !description?.trim()) {
        return res.status(400).json({
          error: 'Category, title, and detailed description are required.',
        });
      }

      if (photoUrl) {
        const isSafeImage =
          photoUrl.startsWith('data:image/jpeg;base64,') ||
          photoUrl.startsWith('data:image/png;base64,') ||
          photoUrl.startsWith('data:image/webp;base64,') ||
          photoUrl.startsWith('https://');
        if (!isSafeImage || photoUrl.length > 3_500_000) {
          return res.status(400).json({
            error: 'Attached photo must be a valid JPEG, PNG, or WebP image under 2.5 MB.',
          });
        }
      }

      const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000);
      const report = await createCommunityReportRecord({
        userId: uid,
        reporterName:
          bundle?.user.fullName || bundle?.user.email?.split('@')[0] || 'Verified Citizen',
        category,
        title: title.trim().slice(0, 160),
        description: description.trim().slice(0, 1200),
        latitude: typeof latitude === 'number' ? latitude : 30.7333,
        longitude: typeof longitude === 'number' ? longitude : 76.7794,
        locationLabel: (locationLabel || 'Chandigarh / Mohali').trim().slice(0, 140),
        photoUrl: photoUrl || undefined,
        verificationStatus: 'pending',
        confirmationsCount: 1,
        confirmedByUserIds: [uid],
        expiresAt: expires.toISOString(),
      });

      broadcastEvent('report:created', report);
      res.status(201).json({ report });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to submit community report.' });
    }
  });

  app.post('/api/reports/:id/confirm', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const reportId = Number(req.params.id);
      if (!Number.isFinite(reportId)) {
        return res.status(400).json({ error: 'Invalid report identifier.' });
      }

      const toggled = await toggleCommunityReportConfirmation(reportId, uid);
      if (!toggled) {
        return res.status(404).json({ error: 'Community report not found.' });
      }

      broadcastEvent('report:updated', toggled.report);
      return res.json({
        report: toggled.report,
        confirmed: toggled.confirmed,
        confirmationsCount: toggled.report.confirmationsCount,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to confirm report.' });
    }
  });

  app.put('/api/reports/:id/status', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const reportId = Number(req.params.id);
      const { verificationStatus } = req.body as {
        verificationStatus: CommunityReport['verificationStatus'];
      };

      const [allReports, allResponders, bundle] = await Promise.all([
        getAllCommunityReports(),
        getAllResponders(),
        getUserBundleByUid(uid),
      ]);

      const report = allReports.find((r) => Number(r.id) === reportId);
      if (!report) {
        return res.status(404).json({ error: 'Community report not found.' });
      }

      const isVerifiedResponderOrMod =
        Boolean(bundle?.user.isModerator) ||
        allResponders.some((resp) => resp.userId === uid && resp.verifiedResponder);
      const isReportOwner = report.userId === uid;

      if (verificationStatus === 'moderator_verified' && !isVerifiedResponderOrMod) {
        return res.status(403).json({
          error:
            'Only verified community responders or moderators can mark a report as Moderator Verified.',
        });
      }

      if (verificationStatus === 'resolved' && !isVerifiedResponderOrMod && !isReportOwner) {
        return res.status(403).json({
          error:
            'Only the citizen who submitted this report or a verified moderator can mark it as Resolved.',
        });
      }

      const updated = await updateCommunityReportRecord(reportId, { verificationStatus });
      if (updated) {
        broadcastEvent('report:updated', updated);
      }
      res.json({ report: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to update report status.' });
    }
  });

  // ==========================================================================
  // 5. LIVE GIS, GEOCODING, SMART ROUTING, HISTORICAL CRIME & NIGHT ACTIVITY
  // ==========================================================================

  app.get('/api/gis/pois', async (_req, res) => {
    try {
      const pois = await fetchLiveOverpassPois();
      res.json({
        pois,
        source: 'OpenStreetMap / Overpass API + Chandigarh Smart City Registry',
        fetchedAt: new Date().toISOString(),
      });
    } catch {
      res.json({
        pois: VERIFIED_CHANDIGARH_MOHALI_POIS,
        source: 'OpenStreetMap Verified Baseline',
        fetchedAt: new Date().toISOString(),
      });
    }
  });

  app.get('/api/crime/historical', (_req, res) => {
    res.json({
      records: HISTORICAL_CRIME_DATABASE,
      source: 'NCRB Crime in India Reports & Chandigarh/SAS Nagar Police Jurisdictional Summaries',
      fetchedAt: new Date().toISOString(),
    });
  });

  // Tricity (Chandigarh, SAS Nagar Mohali, Panchkula, Kharar, Zirakpur, Landran, Gharuan) bounding box
  const TRICITY_BOUNDS = {
    minLat: 30.55,
    maxLat: 30.88,
    minLng: 76.50,
    maxLng: 76.95,
  };

  function isWithinTricityBounds(lat: number, lng: number): boolean {
    return (
      !Number.isNaN(lat) &&
      !Number.isNaN(lng) &&
      lat >= TRICITY_BOUNDS.minLat &&
      lat <= TRICITY_BOUNDS.maxLat &&
      lng >= TRICITY_BOUNDS.minLng &&
      lng <= TRICITY_BOUNDS.maxLng
    );
  }

  function scoreLocationMatch(itemName: string, itemType: string, rawQuery: string): number {
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[,()\-/._]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const q = norm(rawQuery);
    const name = norm(itemName);
    let score = 0;

    // Exact sector or phase number matching (e.g., "sector 22", "phase 8")
    const sectorMatch = q.match(/\bsector\s+(\d+[a-d]?)\b/i);
    if (sectorMatch) {
      const targetSec = sectorMatch[1].toLowerCase();
      const exactRegex = new RegExp(`\\bsector\\s+${targetSec}\\b`, 'i');
      if (exactRegex.test(name)) {
        score += 120;
      } else {
        score -= 80;
      }
    }

    const phaseMatch = q.match(/\bphase\s+(\d+[a-z0-9]*)\b/i);
    if (phaseMatch) {
      const targetPhase = phaseMatch[1].toLowerCase();
      const exactPhaseRegex = new RegExp(`\\bphase\\s+${targetPhase}\\b`, 'i');
      if (exactPhaseRegex.test(name)) {
        score += 120;
      } else {
        score -= 80;
      }
    }

    // City specificity check
    if (q.includes('chandigarh') && name.includes('chandigarh')) score += 35;
    if (q.includes('mohali') && (name.includes('mohali') || name.includes('sas nagar'))) score += 35;

    if (name === q) score += 90;
    else if (name.startsWith(q)) score += 65;
    else if (name.includes(q)) score += 30;

    // Prefer specific places/sectors over broad administrative centroids
    if (itemType === 'administrative' || itemType === 'city' || itemType === 'state') {
      score -= 25;
    } else {
      score += 15;
    }

    return score;
  }

  app.get('/api/gis/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({ results: [] });
    }

    const qLower = q.toLowerCase();
    const cached = geocodeCache.get(qLower);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ results: cached.results, cached: true });
    }

    const qTokens = qLower
      .replace(/[,()-]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const localGazetteerMatches = CHANDIGARH_MOHALI_GAZETTEER.filter((g) => {
      const gLower = g.name.toLowerCase();
      return gLower.includes(qLower) || qTokens.every((tok) => gLower.includes(tok));
    }).map((g) => ({
      ...g,
      source: 'Chandigarh/Mohali Gazetteer',
    }));

    const localPoiMatches = VERIFIED_CHANDIGARH_MOHALI_POIS.filter((p) => {
      const combinedText = `${p.name} ${p.address || ''}`.toLowerCase();
      return combinedText.includes(qLower) || qTokens.every((tok) => combinedText.includes(tok));
    }).map((p) => ({
      id: p.id,
      name: `${p.name} (${p.address || 'Chandigarh/Mohali'})`,
      latitude: p.latitude,
      longitude: p.longitude,
      type: p.category,
      source: 'Chandigarh/Mohali Gazetteer',
    }));

    try {
      const searchQuery =
        qLower.includes('chandigarh') || qLower.includes('mohali') || qLower.includes('kharar')
          ? q
          : `${q}, Chandigarh`;

      // Viewbox bounded to Chandigarh & Mohali Tricity: left=76.50, top=30.88, right=76.95, bottom=30.55
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        searchQuery
      )}&limit=8&addressdetails=1&countrycodes=in&viewbox=76.50,30.88,76.95,30.55&bounded=1`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'UrbanShield-CitySafety-GIS/2.0',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`Nominatim HTTP ${response.status}`);
      }

      const data = (await response.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        type?: string;
        class?: string;
      }>;

      const remoteResults = data
        .map((item) => ({
          id: String(item.place_id),
          name: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
          type: item.type || item.class || 'location',
          source: 'Nominatim OSM',
        }))
        .filter((item) => isWithinTricityBounds(item.latitude, item.longitude));

      const combined = [...localGazetteerMatches, ...localPoiMatches, ...remoteResults]
        .filter((item) => isWithinTricityBounds(item.latitude, item.longitude))
        .map((item) => ({
          ...item,
          matchScore: scoreLocationMatch(item.name, item.type, q),
        }))
        .sort((a, b) => b.matchScore - a.matchScore);

      const deduped: typeof combined = [];
      for (const item of combined) {
        if (
          !deduped.some(
            (existing) =>
              haversineDistanceKm(
                existing.latitude,
                existing.longitude,
                item.latitude,
                item.longitude
              ) < 0.12
          )
        ) {
          deduped.push(item);
        }
      }

      const finalResults = deduped.slice(0, 8);
      geocodeCache.set(qLower, {
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        results: finalResults,
      });

      res.json({ results: finalResults });
    } catch {
      const fallback = [...localGazetteerMatches, ...localPoiMatches]
        .filter((item) => isWithinTricityBounds(item.latitude, item.longitude))
        .map((item) => ({
          ...item,
          matchScore: scoreLocationMatch(item.name, item.type, q),
        }))
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 8);
      res.json({ results: fallback });
    }
  });

  // Helper to compute Smart Routes so both /api/gis/routes and /api/ai/assistant can call it
  async function computeSmartRoutesForCorridor(params: {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    mode: TravelMode;
    isNightJourney: boolean;
    departureTime: string;
    weights?: {
      establishments: number;
      mainRoads: number;
      emergencyServices: number;
      transport: number;
      streetlights: number;
    };
  }): Promise<{ routes: SmartRouteOption[]; note?: string }> {
    const {
      startLat,
      startLng,
      endLat,
      endLng,
      mode = 'car',
      isNightJourney = true,
      departureTime = '22:00',
      weights,
    } = params;

    // Validate coordinates: auto-correct if [lng, lat] were accidentally swapped
    const normStartLat = startLat > 60 && startLng < 45 ? startLng : startLat;
    const normStartLng = startLat > 60 && startLng < 45 ? startLat : startLng;
    const normEndLat = endLat > 60 && endLng < 45 ? endLng : endLat;
    const normEndLng = endLat > 60 && endLng < 45 ? endLat : endLng;

    const rawWeights = weights || {
      establishments: 30,
      mainRoads: 25,
      emergencyServices: 20,
      transport: 15,
      streetlights: 10,
    };
    const totalWeight =
      rawWeights.establishments +
        rawWeights.mainRoads +
        rawWeights.emergencyServices +
        rawWeights.transport +
        rawWeights.streetlights || 100;

    const normWeights = {
      establishments: Math.round((rawWeights.establishments / totalWeight) * 100),
      mainRoads: Math.round((rawWeights.mainRoads / totalWeight) * 100),
      emergencyServices: Math.round((rawWeights.emergencyServices / totalWeight) * 100),
      transport: Math.round((rawWeights.transport / totalWeight) * 100),
      streetlights: Math.round((rawWeights.streetlights / totalWeight) * 100),
    };

    const cacheKey = [
      'v3',
      normStartLat.toFixed(4),
      normStartLng.toFixed(4),
      normEndLat.toFixed(4),
      normEndLng.toFixed(4),
      mode,
      isNightJourney ? 'night' : 'day',
      Object.values(normWeights).join('-'),
    ].join(':');

    const cached = routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { routes: cached.routes, note: cached.note };
    }

    const pois = await fetchLiveOverpassPois();

    // Dedicated OpenStreetMap Germany multi-modal routing endpoints (genuine foot, bike, car profiles)
    // with fallback to router.project-osrm.org
    const deServerSubpath =
      mode === 'foot'
        ? 'routed-foot/route/v1/foot'
        : mode === 'bike'
        ? 'routed-bike/route/v1/bike'
        : 'routed-car/route/v1/driving';
    const fallbackProfile = mode === 'foot' ? 'foot' : mode === 'bike' ? 'bike' : 'driving';

    interface OsrmRouteRaw {
      distance: number; // meters
      duration: number; // seconds
      geometry: { coordinates: [number, number][] }; // [lng, lat]
      legs?: Array<{
        summary?: string;
        steps?: Array<{ name?: string; distance?: number }>;
      }>;
      resolvedProfile?: TravelMode;
    }

    async function fetchOsrmCoordinates(coordString: string): Promise<OsrmRouteRaw[]> {
      const primaryUrl = `https://routing.openstreetmap.de/${deServerSubpath}/${coordString}?overview=full&geometries=geojson&alternatives=true&steps=true`;
      const fallbackUrl = `https://router.project-osrm.org/route/v1/${fallbackProfile}/${coordString}?overview=full&geometries=geojson&alternatives=true&steps=true`;

      for (const [idx, url] of [primaryUrl, fallbackUrl].entries()) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 5500);
          const resp = await fetch(url, { signal: ctrl.signal });
          clearTimeout(timer);
          if (resp.ok) {
            const json = (await resp.json()) as { routes?: OsrmRouteRaw[] };
            if (json.routes && json.routes.length > 0) {
              // Note: routing.openstreetmap.de returns native duration for foot/bike/car in seconds.
              // router.project-osrm.org demo server only runs a car profile even on /foot or /bike URLs.
              const isNativeModeServer = idx === 0;
              return json.routes.map((r) => ({
                ...r,
                resolvedProfile: isNativeModeServer ? mode : 'car',
              }));
            }
          }
        } catch {
          // Try next endpoint
        }
      }
      return [];
    }

    const midLat = (normStartLat + normEndLat) / 2;
    const midLng = (normStartLng + normEndLng) / 2;

    const activityWaypoints = [
      { name: 'Sector 17 Plaza & Madhya Marg Corridor', lat: 30.7411, lng: 76.7834 },
      { name: 'Sector 35C Himalaya Marg Commercial Corridor', lat: 30.7253, lng: 76.7608 },
      { name: 'Phase 3B2 / Phase 7 Mohali Commercial Hub', lat: 30.7138, lng: 76.7242 },
      { name: 'Tribune Chowk / Dakshin Marg Arterial', lat: 30.7031, lng: 76.7924 },
      { name: 'Sohana / Airport Road PR-7 Junction', lat: 30.6889, lng: 76.7168 },
    ];

    activityWaypoints.sort(
      (a, b) =>
        haversineDistanceKm(midLat, midLng, a.lat, a.lng) -
        haversineDistanceKm(midLat, midLng, b.lat, b.lng)
    );
    const chosenHub = activityWaypoints[0];
    const secondaryHub = activityWaypoints[1];

    // OSRM requires {longitude},{latitude}
    const [directRoutes, hubRoutes, secondaryHubRoutes] = await Promise.all([
      fetchOsrmCoordinates(`${normStartLng},${normStartLat};${normEndLng},${normEndLat}`),
      fetchOsrmCoordinates(
        `${normStartLng},${normStartLat};${chosenHub.lng},${chosenHub.lat};${normEndLng},${normEndLat}`
      ),
      fetchOsrmCoordinates(
        `${normStartLng},${normStartLat};${secondaryHub.lng},${secondaryHub.lat};${normEndLng},${normEndLat}`
      ),
    ]);

    function evaluateSingleRoute(
      id: string,
      type: SmartRouteOption['type'],
      label: string,
      tagline: string,
      raw: OsrmRouteRaw,
      isRecommended: boolean,
      recommendationReason: string
    ): SmartRouteOption {
      const coords = raw.geometry.coordinates;
      // OSRM distance is in meters
      const distanceMeters = Math.max(1, Math.round(raw.distance));

      // OSRM duration is in seconds.
      // Use native OSRM duration when the routing server supports the selected profile natively;
      // only convert from distance when falling back to the car-only demo server for foot/bike.
      const fallbackSpeedKmh = mode === 'foot' ? 4.8 : mode === 'bike' ? 16.5 : 34;
      const rawDurationSeconds = Number(raw.duration) || 0;
      const modeDurationSeconds =
        raw.resolvedProfile === mode && rawDurationSeconds > 0
          ? Math.max(60, Math.round(rawDurationSeconds))
          : mode === 'car' && rawDurationSeconds > 0
          ? Math.max(60, Math.round(rawDurationSeconds))
          : Math.max(60, Math.round((distanceMeters / 1000 / fallbackSpeedKmh) * 3600));

      // Extract road summary & calculate main-road coverage percentage from steps
      const legSummaries = (raw.legs || [])
        .map((l) => l.summary)
        .filter(Boolean)
        .join(' → ');
      const allSteps = (raw.legs || []).flatMap((l) => l.steps || []);
      const majorRoadKeywords = [
        'marg',
        'path',
        'highway',
        'nh',
        'pr-7',
        'airport',
        'udhyog',
        'udyog',
        'madhya',
        'dakshin',
        'jan',
        'himalaya',
        'purv',
        'vikas',
        'vidya',
        'landran',
        'sector',
        'phase',
      ];

      let majorDist = 0;
      let totalStepDist = 0;
      for (const st of allSteps) {
        const d = st.distance || 0;
        totalStepDist += d;
        const rName = (st.name || '').toLowerCase();
        if (majorRoadKeywords.some((k) => rName.includes(k))) {
          majorDist += d;
        }
      }

      const mainRoadCoveragePercent =
        totalStepDist > 0
          ? Math.min(96, Math.max(48, Math.round((majorDist / totalStepDist) * 100)))
          : type === 'higher_activity'
          ? 88
          : 74;

      const summaryRoads =
        legSummaries ||
        (type === 'higher_activity'
          ? `Arterial Corridor via ${chosenHub.name}`
          : 'Chandigarh / Mohali Primary Sector Network');

      // Sample points along route polyline to find facilities within 650m corridor
      const sampleStep = Math.max(1, Math.floor(coords.length / 40));
      const sampled = coords.filter((_, idx) => idx % sampleStep === 0 || idx === coords.length - 1);

      const counts = {
        hospitals: 0,
        police: 0,
        pharmacies: 0,
        fuelStations: 0,
        activeEstablishments: 0,
        transportStops: 0,
        streetlights: 0,
        cctvNodes: 0,
      };

      const nearbyFacilities: SmartRouteOption['nearbyFacilities'] = {
        hospitals: [],
        police: [],
        pharmacies: [],
        fuel: [],
        commercial: [],
      };

      const helpPointCoordsAlongRoute: Array<[number, number]> = [];

      for (const poi of pois) {
        let minDistKm = Infinity;
        for (const [lng, lat] of sampled) {
          const d = haversineDistanceKm(lat, lng, poi.latitude, poi.longitude);
          if (d < minDistKm) minDistKm = d;
        }

        if (minDistKm <= 0.65) {
          const distMeters = Math.round(minDistKm * 1000);
          const detail: RouteFacilityDetail = {
            id: poi.id,
            name: poi.name,
            category: poi.category,
            distanceFromRouteMeters: distMeters,
            address: poi.address,
            openingHours: poi.openingHours,
            phone: poi.phone,
            classificationNote: poi.coverageNote,
          };

          if (poi.category === 'hospital' || poi.category === 'clinic') {
            counts.hospitals++;
            nearbyFacilities.hospitals.push(detail);
            helpPointCoordsAlongRoute.push([poi.longitude, poi.latitude]);
          } else if (poi.category === 'police') {
            counts.police++;
            nearbyFacilities.police.push(detail);
            helpPointCoordsAlongRoute.push([poi.longitude, poi.latitude]);
          } else if (poi.category === 'pharmacy') {
            counts.pharmacies++;
            nearbyFacilities.pharmacies.push(detail);
            helpPointCoordsAlongRoute.push([poi.longitude, poi.latitude]);
          } else if (poi.category === 'fuel') {
            counts.fuelStations++;
            counts.activeEstablishments++;
            nearbyFacilities.fuel.push(detail);
            helpPointCoordsAlongRoute.push([poi.longitude, poi.latitude]);
          } else if (
            poi.category === 'restaurant' ||
            poi.category === 'cafe' ||
            poi.category === 'shop'
          ) {
            counts.activeEstablishments++;
            nearbyFacilities.commercial.push(detail);
          } else if (poi.category === 'transport') {
            counts.transportStops++;
          } else if (poi.category === 'streetlight') {
            counts.streetlights++;
          } else if (poi.category === 'cctv') {
            counts.cctvNodes++;
          }
        }
      }

      // Compute longest gap between documented help points along the route
      const documentedHelpPointsCount =
        counts.hospitals + counts.police + counts.pharmacies + counts.fuelStations;

      let longestGapKm = Number((distanceMeters / 1000).toFixed(2));
      if (sampled.length > 1 && helpPointCoordsAlongRoute.length > 0) {
        let currentGapKm = 0;
        let maxGapKm = 0;
        for (let i = 1; i < sampled.length; i++) {
          const [prevLng, prevLat] = sampled[i - 1];
          const [curLng, curLat] = sampled[i];
          const segKm = haversineDistanceKm(prevLat, prevLng, curLat, curLng);
          currentGapKm += segKm;

          const nearHelpPoint = helpPointCoordsAlongRoute.some(
            ([hLng, hLat]) => haversineDistanceKm(curLat, curLng, hLat, hLng) <= 0.7
          );
          if (nearHelpPoint) {
            if (currentGapKm > maxGapKm) maxGapKm = currentGapKm;
            currentGapKm = 0;
          }
        }
        if (currentGapKm > maxGapKm) maxGapKm = currentGapKm;
        longestGapKm = Number(Math.max(0.4, maxGapKm).toFixed(2));
      }

      // Transparent Night Activity Scoring (Part 7 & Part 9)
      const nightCommercialFactor = isNightJourney ? 0.82 : 1.0;
      const totalCommercialAnd24x7 =
        Math.round(counts.activeEstablishments * nightCommercialFactor) +
        counts.pharmacies +
        counts.fuelStations;

      const establishmentsScore = Math.min(100, Math.round(32 + totalCommercialAnd24x7 * 11));
      const mainRoadScore = mainRoadCoveragePercent;
      const emergencyTotal = counts.hospitals + counts.police + counts.pharmacies;
      const emergencyScore = Math.min(100, Math.round(30 + emergencyTotal * 15));
      const transportScore = Math.min(100, Math.round(28 + counts.transportStops * 20));
      const infraNodes = counts.streetlights + counts.cctvNodes;
      const streetlightScore = Math.min(
        100,
        Math.round(mainRoadCoveragePercent * 0.55 + Math.min(45, 15 + infraNodes * 10))
      );

      const overallScore = Math.round(
        (establishmentsScore * normWeights.establishments +
          mainRoadScore * normWeights.mainRoads +
          emergencyScore * normWeights.emergencyServices +
          transportScore * normWeights.transport +
          streetlightScore * normWeights.streetlights) /
          100
      );

      // Historical crime context near route
      const nearbyCrimeRecords = HISTORICAL_CRIME_DATABASE.filter(
        (rec) =>
          rec.geographicGranularity === 'police_station' &&
          sampled.some(
            ([lng, lat]) => haversineDistanceKm(lat, lng, rec.latitude, rec.longitude) <= 1.5
          )
      );

      const crimeJurisdictions = Array.from(
        new Set(nearbyCrimeRecords.map((r) => r.policeStation))
      );

      const confidencePercentage =
        documentedHelpPointsCount >= 3 && infraNodes >= 2
          ? 84
          : documentedHelpPointsCount >= 1
          ? 72
          : 58;

      const confidenceTier =
        confidencePercentage >= 80
          ? 'High'
          : confidencePercentage >= 68
          ? 'Moderate'
          : 'Partial OSM Coverage';

      return {
        id,
        type,
        label,
        tagline,
        recommendationReason,
        isRecommended,
        distanceMeters,
        durationSeconds: modeDurationSeconds,
        transportMode: mode,
        isNightJourney,
        departureTime,
        geometry: coords,
        summaryRoads,
        documentedHelpPointsCount,
        longestGapBetweenHelpPointsKm: longestGapKm,
        mainRoadCoveragePercent,
        nearbyPoisCount: counts,
        nearbyFacilities,
        trafficStatus: `OSRM ${mode.toUpperCase()} road network geometry (${
          isNightJourney ? 'Night travel profile' : 'Daytime profile'
        })`,
        nightActivity: {
          overallScore,
          scoreStatusLabel:
            overallScore >= 75
              ? 'More documented activity along this route'
              : overallScore >= 58
              ? 'Moderate documented activity along this route'
              : 'Lower documented commercial activity — relies on primary road corridors',
          confidencePercentage,
          confidenceTier,
          activitySummary: `${totalCommercialAnd24x7} documented commercial, refuelling & pharmacy nodes within 650m corridor.`,
          infrastructureSummary: `${counts.cctvNodes} documented ICCC/OSM surveillance nodes and ${counts.streetlights} verified lighting corridors mapped (${mainRoadCoveragePercent}% primary arterial road coverage). Absent OSM pole tags do not imply unlit roads.`,
          historicalCrimeExposure:
            crimeJurisdictions.length > 0
              ? `Crosses ${crimeJurisdictions.join(', ')} historical jurisdictions (police-station-level aggregate data; not a real-time risk score).`
              : 'Peripheral / highway stretch with partial police-station-level public disaggregation.',
          factors: {
            establishmentsScore,
            establishmentsCount: totalCommercialAnd24x7,
            mainRoadScore,
            mainRoadCoveragePercent,
            mainRoadSummary: summaryRoads,
            emergencyScore,
            emergencyCount: emergencyTotal,
            transportScore,
            transportCount: counts.transportStops,
            streetlightScore,
            streetlightCount: counts.streetlights,
            verifiedCctvCount: counts.cctvNodes,
          },
          weightsUsed: normWeights,
          missingDataNotes: [
            'OpenStreetMap individual streetlight and camera pole records are partial; arterial lighting is evaluated alongside documented Chandigarh Smart City / GMADA road corridors.',
            'Night Activity Score reflects documented infrastructure and commercial density, not a guarantee of personal safety.',
          ],
        },
      };
    }

    // Collect distinct genuine road-network routes without fabricating fake geometries
    const distinctRawRoutes: Array<{ raw: OsrmRouteRaw; sourceTag: 'direct' | 'alt' | 'hub' }> = [];

    if (directRoutes.length > 0) {
      distinctRawRoutes.push({ raw: directRoutes[0], sourceTag: 'direct' });
      for (let i = 1; i < directRoutes.length; i++) {
        const candidate = directRoutes[i];
        const isDuplicate = distinctRawRoutes.some(
          (existing) =>
            Math.abs(existing.raw.distance - candidate.distance) < 180 &&
            Math.abs(existing.raw.duration - candidate.duration) < 25
        );
        if (!isDuplicate) {
          distinctRawRoutes.push({ raw: candidate, sourceTag: 'alt' });
        }
      }
    }

    if (hubRoutes.length > 0) {
      const hubCandidate = hubRoutes[0];
      const isDuplicate = distinctRawRoutes.some(
        (existing) => Math.abs(existing.raw.distance - hubCandidate.distance) < 220
      );
      const directDist = directRoutes[0]?.distance || hubCandidate.distance;
      if (!isDuplicate && hubCandidate.distance <= directDist * 1.75) {
        distinctRawRoutes.push({ raw: hubCandidate, sourceTag: 'hub' });
      }
    }

    if (distinctRawRoutes.length < 3 && secondaryHubRoutes.length > 0) {
      const secCandidate = secondaryHubRoutes[0];
      const isDuplicate = distinctRawRoutes.some(
        (existing) => Math.abs(existing.raw.distance - secCandidate.distance) < 220
      );
      const directDist = directRoutes[0]?.distance || secCandidate.distance;
      if (!isDuplicate && secCandidate.distance <= directDist * 1.85) {
        distinctRawRoutes.push({ raw: secCandidate, sourceTag: 'hub' });
      }
    }

    if (distinctRawRoutes.length === 0) {
      return {
        routes: [],
        note: 'Routing service could not resolve road geometry for these coordinates.',
      };
    }

    // Evaluate all genuine candidates first
    const prelimEvaluated = distinctRawRoutes.map((entry, idx) =>
      evaluateSingleRoute(
        `route-${idx}`,
        'balanced',
        `Route Option ${idx + 1}`,
        '',
        entry.raw,
        false,
        ''
      )
    );

    // ========================================================================
    // STRICT ROUTE CLASSIFICATION SEPARATED FROM ROUTE SCORING
    // Rule 1: FASTEST must strictly have the minimum actual durationSeconds
    //         across ALL valid alternatives returned by OSRM.
    // ========================================================================
    let fastestIdx = 0;
    for (let i = 1; i < prelimEvaluated.length; i++) {
      if (prelimEvaluated[i].durationSeconds < prelimEvaluated[fastestIdx].durationSeconds) {
        fastestIdx = i;
      } else if (
        prelimEvaluated[i].durationSeconds === prelimEvaluated[fastestIdx].durationSeconds &&
        prelimEvaluated[i].distanceMeters < prelimEvaluated[fastestIdx].distanceMeters
      ) {
        fastestIdx = i;
      }
    }

    // Rule 2: SAFEST / RECOMMENDED is selected based on documented emergency facilities,
    //         infrastructure, main-road share, help-point gap, and data confidence.
    function computeSafetyComposite(r: SmartRouteOption): number {
      return (
        r.nightActivity.factors.emergencyScore * 0.3 +
        r.nightActivity.factors.streetlightScore * 0.25 +
        r.mainRoadCoveragePercent * 0.25 +
        r.nightActivity.confidencePercentage * 0.2 -
        r.longestGapBetweenHelpPointsKm * 4
      );
    }

    // Rule 3: HIGHER ACTIVITY is selected based on documented commercial activity & open places.
    function computeActivityComposite(r: SmartRouteOption): number {
      return (
        r.nightActivity.factors.establishmentsCount * 10 +
        r.nightActivity.factors.establishmentsScore * 0.5 +
        r.documentedHelpPointsCount * 5
      );
    }

    const finalRoutes: SmartRouteOption[] = [];

    if (distinctRawRoutes.length === 1) {
      // Only 1 genuine road-network route exists
      const onlyEval = evaluateSingleRoute(
        'route-recommended',
        'recommended',
        'Safest & Fastest Route',
        `Direct ${mode} corridor with ${prelimEvaluated[0].documentedHelpPointsCount} documented help points`,
        distinctRawRoutes[0].raw,
        true,
        `Primary road-network corridor (${prelimEvaluated[0].mainRoadCoveragePercent}% main road share, ${prelimEvaluated[0].documentedHelpPointsCount} documented help points).`
      );
      finalRoutes.push(onlyEval);
    } else {
      // Multiple genuine alternatives exist.
      // Fastest is locked to `fastestIdx` so fastestRoute.durationSeconds <= everyOtherRoute.durationSeconds ALWAYS holds!
      const nonFastestIndices = prelimEvaluated
        .map((_, idx) => idx)
        .filter((idx) => idx !== fastestIdx);

      // Pick Safest / Recommended among the remaining alternatives, or if a non-fastest route
      // has higher safety/activity, assign it as Recommended while Fastest remains `fastestIdx`.
      let recommendedIdx = nonFastestIndices[0];
      for (const idx of nonFastestIndices) {
        if (
          computeSafetyComposite(prelimEvaluated[idx]) >
          computeSafetyComposite(prelimEvaluated[recommendedIdx])
        ) {
          recommendedIdx = idx;
        }
      }

      // Build Safest / Recommended Route card
      const recRaw = distinctRawRoutes[recommendedIdx].raw;
      const recEval = evaluateSingleRoute(
        'route-recommended',
        'recommended',
        'Safest route',
        `Optimal documented emergency & infrastructure coverage for ${mode}`,
        recRaw,
        true,
        `Selected for ${prelimEvaluated[recommendedIdx].mainRoadCoveragePercent}% primary road share, ${prelimEvaluated[recommendedIdx].documentedHelpPointsCount} documented help points, and ${prelimEvaluated[recommendedIdx].nightActivity.confidencePercentage}% data confidence.`
      );
      finalRoutes.push(recEval);

      // Build Fastest Route card (strictly `fastestIdx` — guaranteed lowest durationSeconds)
      const fastRaw = distinctRawRoutes[fastestIdx].raw;
      const fastEval = evaluateSingleRoute(
        'route-fastest',
        'fastest',
        'Fastest route',
        'Lowest actual estimated travel duration',
        fastRaw,
        false,
        `Lowest actual ${mode} travel duration (${Math.max(
          1,
          Math.round(prelimEvaluated[fastestIdx].durationSeconds / 60)
        )} min) across ${prelimEvaluated[fastestIdx].summaryRoads}.`
      );
      finalRoutes.push(fastEval);

      // Build Higher Activity Route card if a 3rd genuine alternative exists
      const remainingIndices = nonFastestIndices.filter((idx) => idx !== recommendedIdx);
      if (remainingIndices.length > 0) {
        let actIdx = remainingIndices[0];
        for (const idx of remainingIndices) {
          if (
            computeActivityComposite(prelimEvaluated[idx]) >
            computeActivityComposite(prelimEvaluated[actIdx])
          ) {
            actIdx = idx;
          }
        }

        const actRaw = distinctRawRoutes[actIdx].raw;
        const actEval = evaluateSingleRoute(
          'route-higher-activity',
          'higher_activity',
          'Higher activity route',
          `Prioritises documented commercial & emergency density`,
          actRaw,
          false,
          `Includes ${prelimEvaluated[actIdx].nightActivity.factors.establishmentsCount} documented commercial/24x7 places and ${prelimEvaluated[actIdx].documentedHelpPointsCount} help points along ${prelimEvaluated[actIdx].summaryRoads}.`
        );
        finalRoutes.push(actEval);
      }
    }

    // Final invariant verification: fastestRoute.durationSeconds <= everyOtherRoute.durationSeconds
    const verifiedFastest = finalRoutes.find((r) => r.type === 'fastest');
    if (verifiedFastest) {
      const minDur = Math.min(...finalRoutes.map((r) => r.durationSeconds));
      if (verifiedFastest.durationSeconds > minDur) {
        // Swap classification if any other route has strictly shorter duration
        const actualMinRoute = finalRoutes.find((r) => r.durationSeconds === minDur);
        if (actualMinRoute && actualMinRoute.id !== verifiedFastest.id) {
          const prevType = actualMinRoute.type;
          const prevLabel = actualMinRoute.label;
          const prevId = actualMinRoute.id;
          const prevRec = actualMinRoute.isRecommended;

          actualMinRoute.type = 'fastest';
          actualMinRoute.label = 'Fastest route';
          actualMinRoute.id = 'route-fastest';
          actualMinRoute.isRecommended = false;

          verifiedFastest.type = prevType;
          verifiedFastest.label = prevLabel;
          verifiedFastest.id = prevId;
          verifiedFastest.isRecommended = prevRec;
        }
      }
    }

    const note =
      finalRoutes.length < 3
        ? `Showing ${finalRoutes.length} genuine road-network route(s) returned by OpenStreetMap OSRM. UrbanShield does not fabricate artificial route alternatives when road geometry converges.`
        : undefined;

    routeCache.set(cacheKey, {
      expiresAt: Date.now() + 30 * 60 * 1000,
      routes: finalRoutes,
      note,
    });

    return { routes: finalRoutes, note };
  }

  app.post('/api/gis/routes', async (req, res) => {
    try {
      const {
        startLat,
        startLng,
        endLat,
        endLng,
        mode = 'car',
        isNightJourney = true,
        departureTime = '22:00',
        weights,
      } = req.body;

      const result = await computeSmartRoutesForCorridor({
        startLat: Number(startLat),
        startLng: Number(startLng),
        endLat: Number(endLat),
        endLng: Number(endLng),
        mode,
        isNightJourney: Boolean(isNightJourney),
        departureTime: String(departureTime || '22:00'),
        weights,
      });

      res.json(result);
    } catch (err) {
      console.error('Routing error:', err);
      res.status(500).json({ error: 'Failed to calculate routes.' });
    }
  });

  // ==========================================================================
  // 6. ENVIRONMENTAL INTELLIGENCE (OPEN-METEO LIVE TELEMETRY)
  // ==========================================================================

  app.get('/api/weather', async (_req, res) => {
    const cities = [
      { name: 'Chandigarh', lat: 30.7333, lon: 76.7794 },
      { name: 'Mohali (SAS Nagar)', lat: 30.7046, lon: 76.7179 },
    ];

    function decodeWmo(code: number): string {
      const map: Record<number, string> = {
        0: 'Clear Sky',
        1: 'Mainly Clear',
        2: 'Partly Cloudy',
        3: 'Overcast',
        45: 'Fog / Reduced Visibility',
        48: 'Depositing Rime Fog',
        51: 'Light Drizzle',
        53: 'Moderate Drizzle',
        61: 'Slight Rain',
        63: 'Moderate Rain',
        65: 'Heavy Rain',
        80: 'Rain Showers',
        95: 'Thunderstorm',
      };
      return map[code] || 'Fair Urban Conditions';
    }

    try {
      const results = await Promise.all(
        cities.map(async (c) => {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,visibility&timezone=Asia%2FKolkata&forecast_days=1`;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
          const data = (await response.json()) as any;

          const currentHourIdx = Math.min(
            new Date().getHours(),
            (data.hourly?.time?.length || 1) - 1
          );

          const visMeters =
            typeof data.hourly?.visibility?.[currentHourIdx] === 'number'
              ? data.hourly.visibility[currentHourIdx]
              : null;

          const rainProb =
            typeof data.hourly?.precipitation_probability?.[currentHourIdx] === 'number'
              ? data.hourly.precipitation_probability[currentHourIdx]
              : 0;

          const hourlySlice = (data.hourly?.time || []).slice(0, 8).map((t: string, i: number) => ({
            time: t,
            tempC: data.hourly.temperature_2m?.[i] ?? 24,
            rainProb: data.hourly.precipitation_probability?.[i] ?? 0,
            visibilityKm:
              typeof data.hourly.visibility?.[i] === 'number'
                ? Number((data.hourly.visibility[i] / 1000).toFixed(1))
                : null,
          }));

          return {
            city: c.name,
            latitude: c.lat,
            longitude: c.lon,
            temperatureC: data.current?.temperature_2m ?? 25,
            apparentTemperatureC: data.current?.apparent_temperature ?? 25,
            humidityPercent: data.current?.relative_humidity_2m ?? 48,
            windSpeedKmh: data.current?.wind_speed_10m ?? 9,
            precipitationProbability: rainProb,
            visibilityMeters: visMeters,
            weatherCode: data.current?.weather_code ?? 0,
            weatherDescription: decodeWmo(data.current?.weather_code ?? 0),
            isDay: Boolean(data.current?.is_day ?? 1),
            updatedAt: new Date().toISOString(),
            hourlyForecast: hourlySlice,
          };
        })
      );

      res.json({
        weather: results,
        provider: 'Open-Meteo Meteorological API',
      });
    } catch (err) {
      console.error('Open-Meteo error:', err);
      res.status(503).json({
        error: 'Open-Meteo weather service temporarily unreachable.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UrbanShield Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
