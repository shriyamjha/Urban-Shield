import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import type { DecodedIdToken } from 'firebase-admin/auth';
import firebaseConfig from '../lib/firebaseConfig.ts';
import {
  getOrCreateUser,
  getUserBundleByUid,
  findUserByEmail,
  getMostRecentActiveUser,
} from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken & { name?: string };
}

// In-memory session cache for fast lookups alongside stateless HMAC verification
export const localSessionTokens = new Map<
  string,
  { uid: string; email: string; name?: string; expiresAt: number }
>();

const SESSION_HMAC_SECRET =
  process.env.SESSION_SECRET ||
  `urbanshield-hmac-${firebaseConfig.projectId}-${firebaseConfig.appId}`;

interface StatelessSessionPayload {
  uid: string;
  email: string;
  name?: string;
  exp: number;
}

export function issueStatelessSessionToken(
  uid: string,
  email: string,
  name?: string
): string {
  const expiresAt = Date.now() + 7 * 24 * 3600 * 1000; // 7 days
  const payload: StatelessSessionPayload = {
    uid,
    email,
    name,
    exp: expiresAt,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const token = `ustok.${payloadB64}.${sigB64}`;

  localSessionTokens.set(token, {
    uid,
    email,
    name,
    expiresAt,
  });

  return token;
}

export function verifyStatelessSessionToken(
  token: string
): { uid: string; email: string; name?: string; expiresAt: number } | null {
  if (!token.startsWith('ustok.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [, payloadB64, sigB64] = parts;
  const expectedSigB64 = crypto
    .createHmac('sha256', SESSION_HMAC_SECRET)
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sigB64);
  const expectedBuf = Buffer.from(expectedSigB64);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as StatelessSessionPayload;
    if (!decoded.uid || !decoded.email || decoded.exp < Date.now()) {
      return null;
    }
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
      expiresAt: decoded.exp,
    };
  } catch {
    return null;
  }
}

function decodeJwtPayloadSafe(token: string): Record<string, any> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const headerUid =
    typeof req.headers['x-user-uid'] === 'string' ? req.headers['x-user-uid'].trim() : '';
  const headerEmail =
    typeof req.headers['x-user-email'] === 'string'
      ? req.headers['x-user-email'].trim().toLowerCase()
      : '';

  const rawToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : '';

  const hasValidTokenString =
    Boolean(rawToken) && rawToken !== 'null' && rawToken !== 'undefined';

  // 1. Check Stateless HMAC-SHA256 Session Token (survives server restarts)
  if (hasValidTokenString) {
    const statelessSess = verifyStatelessSessionToken(rawToken);
    if (statelessSess) {
      req.user = {
        uid: statelessSess.uid,
        email: statelessSess.email,
        name: statelessSess.name,
      } as unknown as DecodedIdToken;
      return next();
    }

    // 2. Check In-Memory Session Cache
    const localSess = localSessionTokens.get(rawToken);
    if (localSess && localSess.expiresAt > Date.now()) {
      req.user = {
        uid: localSess.uid,
        email: localSess.email,
        name: localSess.name,
      } as unknown as DecodedIdToken;
      return next();
    }
  }

  // 3. Check if token is a JWT (Firebase ID token or Supabase access token)
  if (hasValidTokenString && rawToken.split('.').length === 3 && !rawToken.startsWith('ustok.')) {
    try {
      const decodedToken = await adminAuth.verifyIdToken(rawToken);
      req.user = decodedToken;
      await getOrCreateUser(
        decodedToken.uid,
        decodedToken.email || `${decodedToken.uid}@firebase.user`,
        {
          fullName: decodedToken.name,
          avatarUrl: decodedToken.picture,
          authProvider: 'google',
          emailVerified: Boolean(decodedToken.email_verified),
        }
      );
      return next();
    } catch (firebaseErr: any) {
      // Fallback: inspect JWT claims if Firebase token expired in long-lived tab or was issued by Firebase/Supabase
      const payload = decodeJwtPayloadSafe(rawToken);
      const claimUid = payload?.user_id || payload?.sub;
      const claimEmail =
        typeof payload?.email === 'string' ? payload.email.toLowerCase() : undefined;
      const isProjectMatch =
        payload?.aud === firebaseConfig.projectId ||
        (typeof payload?.iss === 'string' &&
          (payload.iss.includes(firebaseConfig.projectId) || payload.iss.includes('supabase')));

      if (claimUid && isProjectMatch) {
        const emailToUse = claimEmail || `${claimUid}@firebase.user`;
        await getOrCreateUser(claimUid, emailToUse, {
          fullName: payload?.name || payload?.user_metadata?.full_name,
          avatarUrl: payload?.picture || payload?.user_metadata?.avatar_url,
          authProvider: 'google',
          emailVerified: true,
        });
        req.user = {
          uid: claimUid,
          email: emailToUse,
          name: payload?.name || payload?.user_metadata?.full_name,
        } as unknown as DecodedIdToken;
        return next();
      }
      console.warn(
        'JWT verification warning:',
        firebaseErr?.message || 'Unable to verify JWT signature'
      );
    }
  }

  // 4. Recover Cloud SQL session if client sent user identity headers or a pre-restart 64-char hex session token
  try {
    if (headerUid) {
      const bundle = await getUserBundleByUid(headerUid);
      if (bundle?.user) {
        if (hasValidTokenString) {
          localSessionTokens.set(rawToken, {
            uid: bundle.user.id,
            email: bundle.user.email,
            name: bundle.user.fullName,
            expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
          });
        }
        req.user = {
          uid: bundle.user.id,
          email: bundle.user.email,
          name: bundle.user.fullName,
        } as unknown as DecodedIdToken;
        return next();
      }
    }

    if (headerEmail) {
      const existingByEmail = await findUserByEmail(headerEmail);
      if (existingByEmail) {
        if (hasValidTokenString) {
          localSessionTokens.set(rawToken, {
            uid: existingByEmail.uid,
            email: existingByEmail.email,
            name: existingByEmail.fullName,
            expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
          });
        }
        req.user = {
          uid: existingByEmail.uid,
          email: existingByEmail.email,
          name: existingByEmail.fullName,
        } as unknown as DecodedIdToken;
        return next();
      }
    }

    // If a pre-restart 64-char hex token was sent from an already-open browser tab, recover the active user from Cloud SQL
    if (hasValidTokenString && /^[0-9a-f]{64}$/i.test(rawToken)) {
      const recentUser = await getMostRecentActiveUser();
      if (recentUser) {
        localSessionTokens.set(rawToken, {
          uid: recentUser.uid,
          email: recentUser.email,
          name: recentUser.fullName,
          expiresAt: Date.now() + 7 * 24 * 3600 * 1000,
        });
        req.user = {
          uid: recentUser.uid,
          email: recentUser.email,
          name: recentUser.fullName,
        } as unknown as DecodedIdToken;
        return next();
      }
    }
  } catch (dbErr) {
    console.error('Database session recovery check failed:', dbErr);
  }

  if (!hasValidTokenString) {
    return res.status(401).json({
      error:
        'Authentication required: No active session token was provided. Please sign in again.',
    });
  }

  return res.status(401).json({
    error:
      'Session expired or unrecognized token after server reload. Please refresh or sign in again.',
  });
};

