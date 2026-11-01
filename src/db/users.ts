import fs from 'fs';
import path from 'path';
import { db } from './index.ts';
import {
  users,
  trustedContacts,
  communityResponders,
  sosIncidents,
  communityReports,
  reportConfirmations,
  UserRow,
  TrustedContactRow,
  CommunityResponderRow,
  SosIncidentRow,
  CommunityReportRow,
  ReportConfirmationRow,
} from './schema.ts';
import { and, eq, desc } from 'drizzle-orm';
import {
  UserProfile,
  UserPreferences,
  TrustedContact,
  CommunityResponder,
  SosIncident,
  CommunityReport,
} from '../types/urbanshield.ts';

const DEFAULT_PREFERENCES: UserPreferences = {
  preferredTransportMode: 'car',
  prioritizeLighting: true,
  prioritizeMainRoads: true,
  prioritizeEmergencyAccess: true,
  locationSharingEnabled: true,
  autoAlertContactsOnSos: true,
  sosCountdownSeconds: 5,
  optInCommunityResponder: false,
};

// Persistent store structures with initial verified Chandigarh/Mohali community data
const memoryUsers = new Map<string, UserRow>();
const memoryContacts = new Map<string, TrustedContactRow[]>();
const memoryResponders = new Map<string, CommunityResponderRow>();
const memorySosIncidents = new Map<number, SosIncidentRow>();
const memoryReports = new Map<number, CommunityReportRow>();
const memoryConfirmations = new Map<string, ReportConfirmationRow>();

let nextIdCounter = 100;

const INITIAL_RESPONDERS: CommunityResponderRow[] = [
  {
    id: 1,
    userUid: 'resp-chd-sec17',
    fullName: 'Dr. Harpreet Singh Gill',
    roleQualification: 'Emergency Physician (GMSH Sector 16 Volunteer)',
    sectorArea: 'Sector 16 / Sector 17, Chandigarh',
    phone: '+91-98150-11201',
    availabilityStatus: 'available',
    latitude: 30.7442,
    longitude: 76.7798,
    verifiedResponder: true,
    updatedAt: new Date(),
  },
  {
    id: 2,
    userUid: 'resp-chd-sec34',
    fullName: 'Simranjeet Kaur, RN',
    roleQualification: 'Certified Trauma Nurse & First-Aid Responder',
    sectorArea: 'Sector 34 / Sector 35, Chandigarh',
    phone: '+91-98150-34009',
    availabilityStatus: 'available',
    latitude: 30.7235,
    longitude: 76.7654,
    verifiedResponder: true,
    updatedAt: new Date(),
  },
  {
    id: 3,
    userUid: 'resp-mohali-ph7',
    fullName: 'Capt. Vikramaditya Randhawa (Retd.)',
    roleQualification: 'Resident Welfare Safety Coordinator — Mohali Phase 7',
    sectorArea: 'Phase 7 / Phase 3B2, Mohali',
    phone: '+91-98720-70071',
    availabilityStatus: 'available',
    latitude: 30.7115,
    longitude: 76.7238,
    verifiedResponder: true,
    updatedAt: new Date(),
  },
  {
    id: 4,
    userUid: 'resp-mohali-ph8',
    fullName: 'Amanpreet Sohi',
    roleQualification: ' Red Cross Certified First Responder',
    sectorArea: 'Phase 8 / Sector 62, Mohali',
    phone: '+91-98760-62088',
    availabilityStatus: 'busy',
    latitude: 30.6978,
    longitude: 76.7312,
    verifiedResponder: true,
    updatedAt: new Date(),
  },
];

// Note: Every seed report's confirmedByJson array has the exact same length as confirmationsCount
const INITIAL_REPORTS: CommunityReportRow[] = [
  {
    id: 1,
    userUid: 'seed-user-1',
    reporterName: 'Ananya Sharma',
    category: 'poorly_lit_area',
    title: 'Four consecutive street lamps non-functional on V4 internal road',
    description:
      'Streetlight poles #14 to #17 between Sector 22C market back-lane and internal park are dark after 8:30 PM. Main Udyog Path remains well lit.',
    latitude: 30.7318,
    longitude: 76.7719,
    locationLabel: 'Sector 22C Internal Road, Chandigarh',
    photoUrl: null,
    verificationStatus: 'community_confirmed',
    confirmationsCount: 5,
    confirmedByJson: JSON.stringify(['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5']),
    createdAt: new Date(Date.now() - 4 * 3600 * 1000),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  },
  {
    id: 2,
    userUid: 'seed-user-2',
    reporterName: 'Rohan Verma',
    category: 'road_hazard',
    title: 'Unbarricaded stormwater trench near Phase 5 slip road',
    description:
      'Deep road cut near the turn towards Phase 5 Industrial Area. Reflective tape is missing; two-wheelers should stay on main Himalaya Marg.',
    latitude: 30.7185,
    longitude: 76.7098,
    locationLabel: 'Phase 5 Slip Road, Mohali',
    photoUrl: null,
    verificationStatus: 'moderator_verified',
    confirmationsCount: 8,
    confirmedByJson: JSON.stringify([
      'seed-1',
      'seed-2',
      'seed-3',
      'seed-4',
      'seed-5',
      'seed-6',
      'seed-7',
      'seed-8',
    ]),
    createdAt: new Date(Date.now() - 9 * 3600 * 1000),
    expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
  },
  {
    id: 3,
    userUid: 'seed-user-3',
    reporterName: 'Gurpreet Sandhu',
    category: 'infrastructure_problem',
    title: 'Pedestrian underpass light flickering near Sector 17 ISBT',
    description:
      'Half of the tube lights in the pedestrian crossing towards Sector 22A are out; commuters using surface signal crossing instead.',
    latitude: 30.7382,
    longitude: 76.7791,
    locationLabel: 'ISBT Sector 17 Crossing, Chandigarh',
    photoUrl: null,
    verificationStatus: 'pending',
    confirmationsCount: 2,
    confirmedByJson: JSON.stringify(['seed-3', 'seed-4']),
    createdAt: new Date(Date.now() - 2 * 3600 * 1000),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  },
  {
    id: 4,
    userUid: 'seed-user-4',
    reporterName: 'Karanbir Brar',
    category: 'blocked_road',
    title: 'Night utility maintenance barricade on Sector 68 internal road',
    description:
      'One lane closed near Sector 68 municipal building for cable laying; use main Vikas Marg instead.',
    latitude: 30.6845,
    longitude: 76.7275,
    locationLabel: 'Sector 68, Mohali',
    photoUrl: null,
    verificationStatus: 'community_confirmed',
    confirmationsCount: 3,
    confirmedByJson: JSON.stringify(['seed-1', 'seed-2', 'seed-4']),
    createdAt: new Date(Date.now() - 6 * 3600 * 1000),
    expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
  },
];

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'urbanshield-store.json');

function seedDefaultStore() {
  memoryResponders.clear();
  memoryReports.clear();
  memoryConfirmations.clear();

  for (const r of INITIAL_RESPONDERS) {
    memoryResponders.set(r.userUid, { ...r });
  }
  for (const rep of INITIAL_REPORTS) {
    memoryReports.set(rep.id, { ...rep });
    let userIds: string[] = [];
    try {
      userIds = JSON.parse(rep.confirmedByJson || '[]');
    } catch {
      userIds = [];
    }
    userIds.forEach((uid) => {
      nextIdCounter += 1;
      memoryConfirmations.set(`${rep.id}:${uid}`, {
        id: nextIdCounter,
        reportId: rep.id,
        userUid: uid,
        createdAt: rep.createdAt,
      });
    });
  }
}

function saveStoreToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload = {
      nextIdCounter,
      users: Array.from(memoryUsers.values()).map((u) => ({
        ...u,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
      })),
      contacts: Array.from(memoryContacts.entries()).map(([uid, list]) => ({
        uid,
        list: list.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
      })),
      responders: Array.from(memoryResponders.values()).map((r) => ({
        ...r,
        updatedAt: r.updatedAt.toISOString(),
      })),
      reports: Array.from(memoryReports.values()).map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        expiresAt: r.expiresAt.toISOString(),
      })),
      confirmations: Array.from(memoryConfirmations.values()).map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
      sosIncidents: Array.from(memorySosIncidents.values()).map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        resolvedAt: s.resolvedAt ? s.resolvedAt.toISOString() : null,
      })),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not persist store to disk:', err);
  }
}

function loadStoreFromDisk() {
  seedDefaultStore();
  try {
    if (!fs.existsSync(DATA_FILE)) {
      saveStoreToDisk();
      return;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (typeof parsed.nextIdCounter === 'number') {
      nextIdCounter = Math.max(nextIdCounter, parsed.nextIdCounter);
    }

    if (Array.isArray(parsed.users)) {
      memoryUsers.clear();
      parsed.users.forEach((u: any) => {
        if (!u.uid) return;
        memoryUsers.set(u.uid, {
          ...u,
          isModerator: Boolean(u.isModerator),
          createdAt: new Date(u.createdAt),
          updatedAt: new Date(u.updatedAt),
        });
      });
    }

    if (Array.isArray(parsed.contacts)) {
      memoryContacts.clear();
      parsed.contacts.forEach((entry: any) => {
        if (entry?.uid && Array.isArray(entry.list)) {
          memoryContacts.set(
            entry.uid,
            entry.list.map((c: any) => ({
              ...c,
              createdAt: new Date(c.createdAt),
            }))
          );
        }
      });
    }

    if (Array.isArray(parsed.responders) && parsed.responders.length > 0) {
      memoryResponders.clear();
      parsed.responders.forEach((r: any) => {
        memoryResponders.set(r.userUid, {
          ...r,
          updatedAt: new Date(r.updatedAt),
        });
      });
    }

    if (Array.isArray(parsed.reports) && parsed.reports.length > 0) {
      memoryReports.clear();
      parsed.reports.forEach((r: any) => {
        memoryReports.set(r.id, {
          ...r,
          createdAt: new Date(r.createdAt),
          expiresAt: new Date(r.expiresAt),
        });
      });
    }

    if (Array.isArray(parsed.confirmations)) {
      memoryConfirmations.clear();
      parsed.confirmations.forEach((c: any) => {
        memoryConfirmations.set(`${c.reportId}:${c.userUid}`, {
          ...c,
          createdAt: new Date(c.createdAt),
        });
      });

      // Keep every report's confirmation count and user list strictly synchronized with confirmation rows
      for (const [repId, rep] of memoryReports.entries()) {
        const confirmedUids = Array.from(memoryConfirmations.values())
          .filter((c) => c.reportId === repId)
          .map((c) => c.userUid);
        rep.confirmedByJson = JSON.stringify(confirmedUids);
        rep.confirmationsCount = confirmedUids.length;
      }
    }

    if (Array.isArray(parsed.sosIncidents)) {
      memorySosIncidents.clear();
      parsed.sosIncidents.forEach((s: any) => {
        memorySosIncidents.set(s.id, {
          ...s,
          createdAt: new Date(s.createdAt),
          resolvedAt: s.resolvedAt ? new Date(s.resolvedAt) : null,
        });
      });
    }
  } catch (err) {
    console.warn('Could not load store from disk, using default seed:', err);
  }
}

loadStoreFromDisk();

let tablesInitialized = false;

async function ensureDatabaseTables() {
  if (!db || tablesInitialized) return;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        blood_group TEXT DEFAULT '',
        medical_notes TEXT DEFAULT '',
        default_city TEXT NOT NULL DEFAULT 'Chandigarh',
        avatar_url TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'email',
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
        onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
        is_moderator BOOLEAN NOT NULL DEFAULT FALSE,
        password_hash TEXT,
        password_salt TEXT,
        preferences_json TEXT NOT NULL DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS trusted_contacts (
        id SERIAL PRIMARY KEY,
        user_uid TEXT NOT NULL,
        name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        notify_via_sms BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS community_responders (
        id SERIAL PRIMARY KEY,
        user_uid TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role_qualification TEXT NOT NULL,
        sector_area TEXT NOT NULL,
        phone TEXT NOT NULL,
        availability_status TEXT NOT NULL DEFAULT 'available',
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        verified_responder BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS sos_incidents (
        id SERIAL PRIMARY KEY,
        user_uid TEXT NOT NULL,
        user_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        area_label TEXT NOT NULL,
        notes TEXT,
        share_token TEXT NOT NULL,
        notifications_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
        notification_channel_detail TEXT NOT NULL DEFAULT '',
        notified_contacts_count INTEGER NOT NULL DEFAULT 0,
        responses_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS community_reports (
        id SERIAL PRIMARY KEY,
        user_uid TEXT NOT NULL,
        reporter_name TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        location_label TEXT NOT NULL,
        photo_url TEXT,
        verification_status TEXT NOT NULL DEFAULT 'pending',
        confirmations_count INTEGER NOT NULL DEFAULT 1,
        confirmed_by_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP NOT NULL
      );
      CREATE TABLE IF NOT EXISTS report_confirmations (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL,
        user_uid TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_report_confirmations_report_user UNIQUE (report_id, user_uid)
      );
    `);

    const existingReports = await db.select().from(communityReports).limit(1);
    if (existingReports.length === 0) {
      for (const rep of INITIAL_REPORTS) {
        const [inserted] = await db
          .insert(communityReports)
          .values({
            userUid: rep.userUid,
            reporterName: rep.reporterName,
            category: rep.category,
            title: rep.title,
            description: rep.description,
            latitude: rep.latitude,
            longitude: rep.longitude,
            locationLabel: rep.locationLabel,
            photoUrl: rep.photoUrl,
            verificationStatus: rep.verificationStatus,
            confirmationsCount: rep.confirmationsCount,
            confirmedByJson: rep.confirmedByJson,
            expiresAt: rep.expiresAt,
          })
          .returning();

        if (inserted) {
          const seedUids: string[] = JSON.parse(rep.confirmedByJson || '[]');
          for (const sUid of seedUids) {
            await db
              .insert(reportConfirmations)
              .values({ reportId: inserted.id, userUid: sUid })
              .onConflictDoNothing();
          }
        }
      }
    }

    const existingResponders = await db.select().from(communityResponders).limit(1);
    if (existingResponders.length === 0) {
      for (const resp of INITIAL_RESPONDERS) {
        await db.insert(communityResponders).values({
          userUid: resp.userUid,
          fullName: resp.fullName,
          roleQualification: resp.roleQualification,
          sectorArea: resp.sectorArea,
          phone: resp.phone,
          availabilityStatus: resp.availabilityStatus,
          latitude: resp.latitude,
          longitude: resp.longitude,
          verifiedResponder: resp.verifiedResponder,
        });
      }
    }

    tablesInitialized = true;
  } catch (err) {
    console.warn('Database table initialization fallback to local store:', err);
  }
}

function rowToUserProfile(row: UserRow): { user: UserProfile; preferences: UserPreferences } {
  let parsedPrefs = DEFAULT_PREFERENCES;
  try {
    parsedPrefs = { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferencesJson || '{}') };
  } catch {
    parsedPrefs = DEFAULT_PREFERENCES;
  }

  return {
    user: {
      id: row.uid,
      email: row.email,
      fullName: row.fullName,
      phone: row.phone,
      bloodGroup: row.bloodGroup || '',
      medicalNotes: row.medicalNotes || '',
      defaultCity: (row.defaultCity as 'Chandigarh' | 'Mohali') || 'Chandigarh',
      avatarUrl: row.avatarUrl || undefined,
      authProvider: (row.authProvider as 'email' | 'phone' | 'google') || 'email',
      emailVerified: row.emailVerified,
      phoneVerified: row.phoneVerified,
      onboardingCompleted: row.onboardingCompleted,
      isModerator: Boolean(row.isModerator),
      createdAt: row.createdAt.toISOString(),
    },
    preferences: parsedPrefs,
  };
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  extra?: {
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
    authProvider?: 'email' | 'phone' | 'google';
    emailVerified?: boolean;
    phoneVerified?: boolean;
    passwordHash?: string;
    passwordSalt?: string;
  }
): Promise<UserRow> {
  await ensureDatabaseTables();
  const normalizedEmail = (email || '').trim().toLowerCase();
  const isModEmail =
    normalizedEmail.endsWith('@urbanshield.gov.in') ||
    normalizedEmail.startsWith('moderator@') ||
    normalizedEmail.startsWith('admin@');

  if (db) {
    try {
      const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (existing[0]) {
        memoryUsers.set(uid, existing[0]);
        return existing[0];
      }

      const [created] = await db
        .insert(users)
        .values({
          uid,
          email: normalizedEmail,
          fullName: extra?.fullName || normalizedEmail.split('@')[0] || 'Citizen User',
          phone: extra?.phone || '',
          avatarUrl: extra?.avatarUrl || null,
          authProvider: extra?.authProvider || 'email',
          emailVerified: extra?.emailVerified ?? false,
          phoneVerified: extra?.phoneVerified ?? false,
          onboardingCompleted: false,
          isModerator: isModEmail,
          passwordHash: extra?.passwordHash || null,
          passwordSalt: extra?.passwordSalt || null,
          preferencesJson: JSON.stringify(DEFAULT_PREFERENCES),
        })
        .returning();
      memoryUsers.set(uid, created);
      saveStoreToDisk();
      return created;
    } catch {
      // Fallback to persistent local store
    }
  }

  const existingMem = memoryUsers.get(uid);
  if (existingMem) return existingMem;

  const newRow: UserRow = {
    id: ++nextIdCounter,
    uid,
    email: normalizedEmail,
    fullName: extra?.fullName || normalizedEmail.split('@')[0] || 'Citizen User',
    phone: extra?.phone || '',
    bloodGroup: '',
    medicalNotes: '',
    defaultCity: 'Chandigarh',
    avatarUrl: extra?.avatarUrl || null,
    authProvider: extra?.authProvider || 'email',
    emailVerified: extra?.emailVerified ?? false,
    phoneVerified: extra?.phoneVerified ?? false,
    onboardingCompleted: false,
    isModerator: isModEmail,
    passwordHash: extra?.passwordHash || null,
    passwordSalt: extra?.passwordSalt || null,
    preferencesJson: JSON.stringify(DEFAULT_PREFERENCES),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  memoryUsers.set(uid, newRow);
  saveStoreToDisk();
  return newRow;
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  await ensureDatabaseTables();
  const cleanEmail = email.trim().toLowerCase();
  if (db) {
    try {
      const rows = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
      if (rows[0]) return rows[0];
    } catch {
      // Fallback
    }
  }
  for (const u of memoryUsers.values()) {
    if (u.email.toLowerCase() === cleanEmail) return u;
  }
  return undefined;
}

export async function findUserByPhone(phone: string): Promise<UserRow | undefined> {
  await ensureDatabaseTables();
  const cleanPhone = phone.replace(/\s+/g, '');
  if (db) {
    try {
      const rows = await db.select().from(users).where(eq(users.phone, cleanPhone)).limit(1);
      if (rows[0]) return rows[0];
    } catch {
      // Fallback
    }
  }
  for (const u of memoryUsers.values()) {
    if (u.phone.replace(/\s+/g, '') === cleanPhone) return u;
  }
  return undefined;
}

export async function getMostRecentActiveUser(): Promise<UserRow | undefined> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const rows = await db.select().from(users).orderBy(desc(users.updatedAt)).limit(1);
      if (rows[0]) return rows[0];
    } catch {
      // Fallback
    }
  }
  const allMem = Array.from(memoryUsers.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  return allMem[0];
}

export async function getUserBundleByUid(uid: string): Promise<{
  user: UserProfile;
  preferences: UserPreferences;
  contacts: TrustedContact[];
} | null> {
  await ensureDatabaseTables();
  let row: UserRow | undefined;

  if (db) {
    try {
      const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      row = rows[0];
    } catch {
      row = memoryUsers.get(uid);
    }
  } else {
    row = memoryUsers.get(uid);
  }

  if (!row) return null;

  const { user, preferences } = rowToUserProfile(row);
  const contacts = await getTrustedContactsByUid(uid);

  return { user, preferences, contacts };
}

export async function updateUserAndPreferences(
  uid: string,
  updates: Partial<UserProfile> & {
    preferences?: Partial<UserPreferences>;
    passwordHash?: string;
    passwordSalt?: string;
  }
): Promise<{ user: UserProfile; preferences: UserPreferences }> {
  await ensureDatabaseTables();
  const currentBundle = await getUserBundleByUid(uid);
  const mergedPrefs: UserPreferences = {
    ...(currentBundle?.preferences || DEFAULT_PREFERENCES),
    ...(updates.preferences || {}),
  };

  if (db) {
    try {
      const currentRows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
      if (currentRows[0]) {
        const cur = currentRows[0];
        const [updated] = await db
          .update(users)
          .set({
            fullName: updates.fullName !== undefined ? updates.fullName : cur.fullName,
            email: updates.email !== undefined ? updates.email.toLowerCase() : cur.email,
            phone: updates.phone !== undefined ? updates.phone : cur.phone,
            bloodGroup: updates.bloodGroup !== undefined ? updates.bloodGroup : cur.bloodGroup,
            medicalNotes:
              updates.medicalNotes !== undefined ? updates.medicalNotes : cur.medicalNotes,
            defaultCity: updates.defaultCity !== undefined ? updates.defaultCity : cur.defaultCity,
            avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : cur.avatarUrl,
            emailVerified:
              updates.emailVerified !== undefined ? updates.emailVerified : cur.emailVerified,
            phoneVerified:
              updates.phoneVerified !== undefined ? updates.phoneVerified : cur.phoneVerified,
            onboardingCompleted:
              updates.onboardingCompleted !== undefined
                ? updates.onboardingCompleted
                : cur.onboardingCompleted,
            passwordHash:
              updates.passwordHash !== undefined ? updates.passwordHash : cur.passwordHash,
            passwordSalt:
              updates.passwordSalt !== undefined ? updates.passwordSalt : cur.passwordSalt,
            preferencesJson: JSON.stringify(mergedPrefs),
            updatedAt: new Date(),
          })
          .where(eq(users.uid, uid))
          .returning();
        memoryUsers.set(uid, updated);
        saveStoreToDisk();
        return rowToUserProfile(updated);
      }
    } catch {
      // Fallback
    }
  }

  const cur = memoryUsers.get(uid) || (await getOrCreateUser(uid, updates.email || ''));
  const updated: UserRow = {
    ...cur,
    fullName: updates.fullName !== undefined ? updates.fullName : cur.fullName,
    email: updates.email !== undefined ? updates.email.toLowerCase() : cur.email,
    phone: updates.phone !== undefined ? updates.phone : cur.phone,
    bloodGroup: updates.bloodGroup !== undefined ? updates.bloodGroup : cur.bloodGroup,
    medicalNotes: updates.medicalNotes !== undefined ? updates.medicalNotes : cur.medicalNotes,
    defaultCity: updates.defaultCity !== undefined ? updates.defaultCity : cur.defaultCity,
    avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : cur.avatarUrl,
    emailVerified: updates.emailVerified !== undefined ? updates.emailVerified : cur.emailVerified,
    phoneVerified: updates.phoneVerified !== undefined ? updates.phoneVerified : cur.phoneVerified,
    onboardingCompleted:
      updates.onboardingCompleted !== undefined
        ? updates.onboardingCompleted
        : cur.onboardingCompleted,
    passwordHash: updates.passwordHash !== undefined ? updates.passwordHash : cur.passwordHash,
    passwordSalt: updates.passwordSalt !== undefined ? updates.passwordSalt : cur.passwordSalt,
    preferencesJson: JSON.stringify(mergedPrefs),
    updatedAt: new Date(),
  };
  memoryUsers.set(uid, updated);
  saveStoreToDisk();
  return rowToUserProfile(updated);
}

export async function deleteUserAccountByUid(uid: string): Promise<void> {
  await ensureDatabaseTables();
  if (db) {
    try {
      await db.delete(trustedContacts).where(eq(trustedContacts.userUid, uid));
      await db.delete(communityResponders).where(eq(communityResponders.userUid, uid));
      await db.delete(users).where(eq(users.uid, uid));
    } catch {
      // Fallback
    }
  }
  memoryUsers.delete(uid);
  memoryContacts.delete(uid);
  memoryResponders.delete(uid);
  saveStoreToDisk();
}

export async function getTrustedContactsByUid(uid: string): Promise<TrustedContact[]> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(trustedContacts)
        .where(eq(trustedContacts.userUid, uid));
      return rows.map((r) => ({
        id: String(r.id),
        userId: r.userUid,
        name: r.name,
        relationship: r.relationship,
        phone: r.phone,
        email: r.email || undefined,
        notifyViaSms: r.notifyViaSms,
      }));
    } catch {
      // Fallback
    }
  }

  const list = memoryContacts.get(uid) || [];
  return list.map((r) => ({
    id: String(r.id),
    userId: r.userUid,
    name: r.name,
    relationship: r.relationship,
    phone: r.phone,
    email: r.email || undefined,
    notifyViaSms: r.notifyViaSms,
  }));
}

export async function addTrustedContactForUser(
  uid: string,
  contact: Partial<TrustedContact>
): Promise<TrustedContact[]> {
  await ensureDatabaseTables();
  if (db) {
    try {
      await db.insert(trustedContacts).values({
        userUid: uid,
        name: contact.name || 'Trusted Contact',
        relationship: contact.relationship || 'Family',
        phone: contact.phone || '',
        email: contact.email || null,
        notifyViaSms: contact.notifyViaSms ?? true,
      });
      return getTrustedContactsByUid(uid);
    } catch {
      // Fallback
    }
  }

  const list = memoryContacts.get(uid) || [];
  list.push({
    id: ++nextIdCounter,
    userUid: uid,
    name: contact.name || 'Trusted Contact',
    relationship: contact.relationship || 'Family',
    phone: contact.phone || '',
    email: contact.email || null,
    notifyViaSms: contact.notifyViaSms ?? true,
    createdAt: new Date(),
  });
  memoryContacts.set(uid, list);
  saveStoreToDisk();
  return getTrustedContactsByUid(uid);
}

export async function deleteTrustedContactForUser(
  uid: string,
  contactId: number
): Promise<TrustedContact[]> {
  await ensureDatabaseTables();
  if (db) {
    try {
      await db.delete(trustedContacts).where(eq(trustedContacts.id, contactId));
      return getTrustedContactsByUid(uid);
    } catch {
      // Fallback
    }
  }

  const list = (memoryContacts.get(uid) || []).filter((c) => c.id !== contactId);
  memoryContacts.set(uid, list);
  saveStoreToDisk();
  return getTrustedContactsByUid(uid);
}

export async function getAllResponders(): Promise<CommunityResponder[]> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const rows = await db.select().from(communityResponders);
      return rows.map((r) => ({
        id: String(r.id),
        userId: r.userUid,
        fullName: r.fullName,
        roleQualification: r.roleQualification,
        sectorArea: r.sectorArea,
        phone: r.phone,
        availabilityStatus: r.availabilityStatus as CommunityResponder['availabilityStatus'],
        latitude: r.latitude,
        longitude: r.longitude,
        verifiedResponder: r.verifiedResponder,
      }));
    } catch {
      // Fallback
    }
  }

  return Array.from(memoryResponders.values()).map((r) => ({
    id: String(r.id),
    userId: r.userUid,
    fullName: r.fullName,
    roleQualification: r.roleQualification,
    sectorArea: r.sectorArea,
    phone: r.phone,
    availabilityStatus: r.availabilityStatus as CommunityResponder['availabilityStatus'],
    latitude: r.latitude,
    longitude: r.longitude,
    verifiedResponder: r.verifiedResponder,
  }));
}

export async function upsertResponder(
  uid: string,
  payload: Partial<CommunityResponder>
): Promise<CommunityResponder> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const existing = await db
        .select()
        .from(communityResponders)
        .where(eq(communityResponders.userUid, uid))
        .limit(1);

      if (existing[0]) {
        const [updated] = await db
          .update(communityResponders)
          .set({
            fullName: payload.fullName || existing[0].fullName,
            roleQualification: payload.roleQualification || existing[0].roleQualification,
            sectorArea: payload.sectorArea || existing[0].sectorArea,
            phone: payload.phone || existing[0].phone,
            availabilityStatus: payload.availabilityStatus || existing[0].availabilityStatus,
            latitude: payload.latitude ?? existing[0].latitude,
            longitude: payload.longitude ?? existing[0].longitude,
            updatedAt: new Date(),
          })
          .where(eq(communityResponders.userUid, uid))
          .returning();
        return {
          id: String(updated.id),
          userId: updated.userUid,
          fullName: updated.fullName,
          roleQualification: updated.roleQualification,
          sectorArea: updated.sectorArea,
          phone: updated.phone,
          availabilityStatus: updated.availabilityStatus as CommunityResponder['availabilityStatus'],
          latitude: updated.latitude,
          longitude: updated.longitude,
          verifiedResponder: updated.verifiedResponder,
        };
      }

      const [created] = await db
        .insert(communityResponders)
        .values({
          userUid: uid,
          fullName: payload.fullName || 'Community Responder',
          roleQualification: payload.roleQualification || 'Trained Citizen Volunteer',
          sectorArea: payload.sectorArea || 'Sector 17, Chandigarh',
          phone: payload.phone || '+91-',
          availabilityStatus: payload.availabilityStatus || 'available',
          latitude: payload.latitude ?? 30.7333,
          longitude: payload.longitude ?? 76.7794,
          verifiedResponder: true,
        })
        .returning();

      return {
        id: String(created.id),
        userId: created.userUid,
        fullName: created.fullName,
        roleQualification: created.roleQualification,
        sectorArea: created.sectorArea,
        phone: created.phone,
        availabilityStatus: created.availabilityStatus as CommunityResponder['availabilityStatus'],
        latitude: created.latitude,
        longitude: created.longitude,
        verifiedResponder: created.verifiedResponder,
      };
    } catch {
      // Fallback
    }
  }

  const existing = memoryResponders.get(uid);
  const row: CommunityResponderRow = {
    id: existing?.id || ++nextIdCounter,
    userUid: uid,
    fullName: payload.fullName || existing?.fullName || 'Community Responder',
    roleQualification:
      payload.roleQualification || existing?.roleQualification || 'Trained Citizen Volunteer',
    sectorArea: payload.sectorArea || existing?.sectorArea || 'Sector 17, Chandigarh',
    phone: payload.phone || existing?.phone || '+91-',
    availabilityStatus: payload.availabilityStatus || existing?.availabilityStatus || 'available',
    latitude: payload.latitude ?? existing?.latitude ?? 30.7333,
    longitude: payload.longitude ?? existing?.longitude ?? 76.7794,
    verifiedResponder: true,
    updatedAt: new Date(),
  };
  memoryResponders.set(uid, row);
  saveStoreToDisk();

  return {
    id: String(row.id),
    userId: row.userUid,
    fullName: row.fullName,
    roleQualification: row.roleQualification,
    sectorArea: row.sectorArea,
    phone: row.phone,
    availabilityStatus: row.availabilityStatus as CommunityResponder['availabilityStatus'],
    latitude: row.latitude,
    longitude: row.longitude,
    verifiedResponder: row.verifiedResponder,
  };
}

export async function getAllSosIncidents(): Promise<SosIncident[]> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const rows = await db.select().from(sosIncidents).orderBy(desc(sosIncidents.createdAt));
      return rows.map((r) => ({
        id: String(r.id),
        userId: r.userUid,
        userName: r.userName,
        status: r.status as SosIncident['status'],
        latitude: r.latitude,
        longitude: r.longitude,
        areaLabel: r.areaLabel,
        notes: r.notes || undefined,
        shareToken: r.shareToken,
        notificationsDispatched: r.notificationsDispatched,
        notificationChannelDetail: r.notificationChannelDetail,
        notifiedContactsCount: r.notifiedContactsCount,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
        responses: JSON.parse(r.responsesJson || '[]'),
      }));
    } catch {
      // Fallback
    }
  }

  return Array.from(memorySosIncidents.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((r) => ({
      id: String(r.id),
      userId: r.userUid,
      userName: r.userName,
      status: r.status as SosIncident['status'],
      latitude: r.latitude,
      longitude: r.longitude,
      areaLabel: r.areaLabel,
      notes: r.notes || undefined,
      shareToken: r.shareToken,
      notificationsDispatched: r.notificationsDispatched,
      notificationChannelDetail: r.notificationChannelDetail,
      notifiedContactsCount: r.notifiedContactsCount,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : undefined,
      responses: JSON.parse(r.responsesJson || '[]'),
    }));
}

export async function createSosIncidentRecord(
  incident: Omit<SosIncident, 'id' | 'createdAt'>
): Promise<SosIncident> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const [created] = await db
        .insert(sosIncidents)
        .values({
          userUid: incident.userId,
          userName: incident.userName,
          status: incident.status,
          latitude: incident.latitude,
          longitude: incident.longitude,
          areaLabel: incident.areaLabel,
          notes: incident.notes || null,
          shareToken: incident.shareToken,
          notificationsDispatched: incident.notificationsDispatched,
          notificationChannelDetail: incident.notificationChannelDetail,
          notifiedContactsCount: incident.notifiedContactsCount,
          responsesJson: JSON.stringify(incident.responses || []),
        })
        .returning();

      return {
        id: String(created.id),
        userId: created.userUid,
        userName: created.userName,
        status: created.status as SosIncident['status'],
        latitude: created.latitude,
        longitude: created.longitude,
        areaLabel: created.areaLabel,
        notes: created.notes || undefined,
        shareToken: created.shareToken,
        notificationsDispatched: created.notificationsDispatched,
        notificationChannelDetail: created.notificationChannelDetail,
        notifiedContactsCount: created.notifiedContactsCount,
        createdAt: created.createdAt.toISOString(),
        responses: JSON.parse(created.responsesJson || '[]'),
      };
    } catch {
      // Fallback
    }
  }

  const row: SosIncidentRow = {
    id: ++nextIdCounter,
    userUid: incident.userId,
    userName: incident.userName,
    status: incident.status,
    latitude: incident.latitude,
    longitude: incident.longitude,
    areaLabel: incident.areaLabel,
    notes: incident.notes || null,
    shareToken: incident.shareToken,
    notificationsDispatched: incident.notificationsDispatched,
    notificationChannelDetail: incident.notificationChannelDetail,
    notifiedContactsCount: incident.notifiedContactsCount,
    responsesJson: JSON.stringify(incident.responses || []),
    createdAt: new Date(),
    resolvedAt: null,
  };
  memorySosIncidents.set(row.id, row);
  saveStoreToDisk();

  return {
    id: String(row.id),
    userId: row.userUid,
    userName: row.userName,
    status: row.status as SosIncident['status'],
    latitude: row.latitude,
    longitude: row.longitude,
    areaLabel: row.areaLabel,
    notes: row.notes || undefined,
    shareToken: row.shareToken,
    notificationsDispatched: row.notificationsDispatched,
    notificationChannelDetail: row.notificationChannelDetail,
    notifiedContactsCount: row.notifiedContactsCount,
    createdAt: row.createdAt.toISOString(),
    responses: incident.responses || [],
  };
}

export async function updateSosIncidentRecord(
  id: number,
  updates: {
    status?: SosIncident['status'];
    responses?: SosIncident['responses'];
    resolvedAt?: Date | null;
  }
): Promise<SosIncident | null> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const existing = await db.select().from(sosIncidents).where(eq(sosIncidents.id, id)).limit(1);
      if (existing[0]) {
        const cur = existing[0];
        const [updated] = await db
          .update(sosIncidents)
          .set({
            status: updates.status || cur.status,
            responsesJson: updates.responses
              ? JSON.stringify(updates.responses)
              : cur.responsesJson,
            resolvedAt: updates.resolvedAt !== undefined ? updates.resolvedAt : cur.resolvedAt,
          })
          .where(eq(sosIncidents.id, id))
          .returning();

        return {
          id: String(updated.id),
          userId: updated.userUid,
          userName: updated.userName,
          status: updated.status as SosIncident['status'],
          latitude: updated.latitude,
          longitude: updated.longitude,
          areaLabel: updated.areaLabel,
          notes: updated.notes || undefined,
          shareToken: updated.shareToken,
          notificationsDispatched: updated.notificationsDispatched,
          notificationChannelDetail: updated.notificationChannelDetail,
          notifiedContactsCount: updated.notifiedContactsCount,
          createdAt: updated.createdAt.toISOString(),
          resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : undefined,
          responses: JSON.parse(updated.responsesJson || '[]'),
        };
      }
    } catch {
      // Fallback
    }
  }

  const cur = memorySosIncidents.get(id);
  if (!cur) return null;
  const updated: SosIncidentRow = {
    ...cur,
    status: updates.status || cur.status,
    responsesJson: updates.responses ? JSON.stringify(updates.responses) : cur.responsesJson,
    resolvedAt: updates.resolvedAt !== undefined ? updates.resolvedAt : cur.resolvedAt,
  };
  memorySosIncidents.set(id, updated);
  saveStoreToDisk();

  return {
    id: String(updated.id),
    userId: updated.userUid,
    userName: updated.userName,
    status: updated.status as SosIncident['status'],
    latitude: updated.latitude,
    longitude: updated.longitude,
    areaLabel: updated.areaLabel,
    notes: updated.notes || undefined,
    shareToken: updated.shareToken,
    notificationsDispatched: updated.notificationsDispatched,
    notificationChannelDetail: updated.notificationChannelDetail,
    notifiedContactsCount: updated.notifiedContactsCount,
    createdAt: updated.createdAt.toISOString(),
    resolvedAt: updated.resolvedAt ? updated.resolvedAt.toISOString() : undefined,
    responses: JSON.parse(updated.responsesJson || '[]'),
  };
}

function mapReportRowToCommunityReport(r: CommunityReportRow): CommunityReport {
  let confirmedByUserIds: string[] = [];
  try {
    confirmedByUserIds = JSON.parse(r.confirmedByJson || '[]');
  } catch {
    confirmedByUserIds = [];
  }
  return {
    id: String(r.id),
    userId: r.userUid,
    reporterName: r.reporterName,
    category: r.category as CommunityReport['category'],
    title: r.title,
    description: r.description,
    latitude: r.latitude,
    longitude: r.longitude,
    locationLabel: r.locationLabel,
    photoUrl: r.photoUrl || undefined,
    verificationStatus: r.verificationStatus as CommunityReport['verificationStatus'],
    confirmationsCount: r.confirmationsCount,
    confirmedByUserIds,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  };
}

export async function getAllCommunityReports(): Promise<CommunityReport[]> {
  await ensureDatabaseTables();
  const now = Date.now();
  if (db) {
    try {
      const rows = await db
        .select()
        .from(communityReports)
        .orderBy(desc(communityReports.createdAt));
      return rows
        .filter((r) => r.expiresAt.getTime() > now)
        .map(mapReportRowToCommunityReport);
    } catch {
      // Fallback
    }
  }

  return Array.from(memoryReports.values())
    .filter((r) => r.expiresAt.getTime() > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(mapReportRowToCommunityReport);
}

export async function createCommunityReportRecord(
  rep: Omit<CommunityReport, 'id' | 'createdAt'>
): Promise<CommunityReport> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const [created] = await db
        .insert(communityReports)
        .values({
          userUid: rep.userId,
          reporterName: rep.reporterName,
          category: rep.category,
          title: rep.title,
          description: rep.description,
          latitude: rep.latitude,
          longitude: rep.longitude,
          locationLabel: rep.locationLabel,
          photoUrl: rep.photoUrl || null,
          verificationStatus: rep.verificationStatus,
          confirmationsCount: rep.confirmationsCount,
          confirmedByJson: JSON.stringify(rep.confirmedByUserIds || []),
          expiresAt: new Date(rep.expiresAt),
        })
        .returning();

      if (created && rep.confirmedByUserIds?.length) {
        for (const uid of rep.confirmedByUserIds) {
          try {
            await db
              .insert(reportConfirmations)
              .values({ reportId: created.id, userUid: uid })
              .onConflictDoNothing();
          } catch {
            // Ignore if table not migrated yet
          }
        }
      }

      return mapReportRowToCommunityReport(created);
    } catch {
      // Fallback
    }
  }

  const now = new Date();
  const row: CommunityReportRow = {
    id: ++nextIdCounter,
    userUid: rep.userId,
    reporterName: rep.reporterName,
    category: rep.category,
    title: rep.title,
    description: rep.description,
    latitude: rep.latitude,
    longitude: rep.longitude,
    locationLabel: rep.locationLabel,
    photoUrl: rep.photoUrl || null,
    verificationStatus: rep.verificationStatus,
    confirmationsCount: rep.confirmationsCount,
    confirmedByJson: JSON.stringify(rep.confirmedByUserIds || []),
    createdAt: now,
    expiresAt: new Date(rep.expiresAt),
  };
  memoryReports.set(row.id, row);

  for (const uid of rep.confirmedByUserIds || []) {
    memoryConfirmations.set(`${row.id}:${uid}`, {
      id: ++nextIdCounter,
      reportId: row.id,
      userUid: uid,
      createdAt: now,
    });
  }

  saveStoreToDisk();
  return mapReportRowToCommunityReport(row);
}

// Per-report mutex queue to serialize simultaneous confirmation toggles atomically
const confirmationLocks = new Map<number, Promise<any>>();

export async function toggleCommunityReportConfirmation(
  reportId: number,
  userUid: string
): Promise<{ report: CommunityReport; confirmed: boolean } | null> {
  await ensureDatabaseTables();
  const prevLock = confirmationLocks.get(reportId) || Promise.resolve();

  const task = prevLock.then(async () => {
    if (db) {
      try {
        const existing = await db
          .select()
          .from(communityReports)
          .where(eq(communityReports.id, reportId))
          .limit(1);
        if (existing[0]) {
          const cur = existing[0];
          let currentIds: string[] = [];
          try {
            currentIds = JSON.parse(cur.confirmedByJson || '[]');
          } catch {
            currentIds = [];
          }

          const alreadyConfirmed = currentIds.includes(userUid);
          let nextIds: string[];
          let confirmed: boolean;

          if (alreadyConfirmed) {
            nextIds = currentIds.filter((id) => id !== userUid);
            confirmed = false;
            try {
              await db
                .delete(reportConfirmations)
                .where(
                  and(
                    eq(reportConfirmations.reportId, reportId),
                    eq(reportConfirmations.userUid, userUid)
                  )
                );
            } catch {
              // Ignore
            }
          } else {
            nextIds = Array.from(new Set([...currentIds, userUid]));
            confirmed = true;
            try {
              await db
                .insert(reportConfirmations)
                .values({ reportId, userUid })
                .onConflictDoNothing();
            } catch {
              // Ignore
            }
          }

          const nextCount = nextIds.length;
          let nextStatus = cur.verificationStatus as CommunityReport['verificationStatus'];
          if (nextStatus === 'pending' && nextCount >= 3) {
            nextStatus = 'community_confirmed';
          } else if (nextStatus === 'community_confirmed' && nextCount < 3) {
            nextStatus = 'pending';
          }

          const [updated] = await db
            .update(communityReports)
            .set({
              confirmationsCount: nextCount,
              confirmedByJson: JSON.stringify(nextIds),
              verificationStatus: nextStatus,
            })
            .where(eq(communityReports.id, reportId))
            .returning();

          if (updated) {
            return {
              report: mapReportRowToCommunityReport(updated),
              confirmed,
            };
          }
        }
      } catch {
        // Fallback to persistent local store
      }
    }

    const cur = memoryReports.get(reportId);
    if (!cur) return null;

    const confirmationKey = `${reportId}:${userUid}`;
    let currentIds: string[] = [];
    try {
      currentIds = JSON.parse(cur.confirmedByJson || '[]');
    } catch {
      currentIds = [];
    }

    const alreadyConfirmed =
      memoryConfirmations.has(confirmationKey) || currentIds.includes(userUid);
    let nextIds: string[];
    let confirmed: boolean;

    if (alreadyConfirmed) {
      memoryConfirmations.delete(confirmationKey);
      nextIds = currentIds.filter((id) => id !== userUid);
      confirmed = false;
    } else {
      memoryConfirmations.set(confirmationKey, {
        id: ++nextIdCounter,
        reportId,
        userUid,
        createdAt: new Date(),
      });
      nextIds = Array.from(new Set([...currentIds, userUid]));
      confirmed = true;
    }

    const nextCount = nextIds.length;
    let nextStatus = cur.verificationStatus as CommunityReport['verificationStatus'];
    if (nextStatus === 'pending' && nextCount >= 3) {
      nextStatus = 'community_confirmed';
    } else if (nextStatus === 'community_confirmed' && nextCount < 3) {
      nextStatus = 'pending';
    }

    const updated: CommunityReportRow = {
      ...cur,
      confirmationsCount: nextCount,
      confirmedByJson: JSON.stringify(nextIds),
      verificationStatus: nextStatus,
    };
    memoryReports.set(reportId, updated);
    saveStoreToDisk();

    return {
      report: mapReportRowToCommunityReport(updated),
      confirmed,
    };
  });

  confirmationLocks.set(
    reportId,
    task.catch(() => {})
  );
  return task;
}

export async function updateCommunityReportRecord(
  id: number,
  updates: {
    verificationStatus?: CommunityReport['verificationStatus'];
    confirmationsCount?: number;
    confirmedByUserIds?: string[];
  }
): Promise<CommunityReport | null> {
  await ensureDatabaseTables();
  if (db) {
    try {
      const existing = await db
        .select()
        .from(communityReports)
        .where(eq(communityReports.id, id))
        .limit(1);
      if (existing[0]) {
        const cur = existing[0];
        const [updated] = await db
          .update(communityReports)
          .set({
            verificationStatus: updates.verificationStatus || cur.verificationStatus,
            confirmationsCount: updates.confirmationsCount ?? cur.confirmationsCount,
            confirmedByJson: updates.confirmedByUserIds
              ? JSON.stringify(updates.confirmedByUserIds)
              : cur.confirmedByJson,
          })
          .where(eq(communityReports.id, id))
          .returning();

        return mapReportRowToCommunityReport(updated);
      }
    } catch {
      // Fallback
    }
  }

  const cur = memoryReports.get(id);
  if (!cur) return null;
  const updated: CommunityReportRow = {
    ...cur,
    verificationStatus: updates.verificationStatus || cur.verificationStatus,
    confirmationsCount: updates.confirmationsCount ?? cur.confirmationsCount,
    confirmedByJson: updates.confirmedByUserIds
      ? JSON.stringify(updates.confirmedByUserIds)
      : cur.confirmedByJson,
  };
  memoryReports.set(id, updated);
  saveStoreToDisk();

  return mapReportRowToCommunityReport(updated);
}
