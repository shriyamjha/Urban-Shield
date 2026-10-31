import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import {
  UserProfile,
  UserPreferences,
  TrustedContact,
  SosIncident,
  CommunityResponder,
} from '../types/urbanshield.ts';

interface AuthContextValue {
  user: UserProfile | null;
  preferences: UserPreferences | null;
  contacts: TrustedContact[];
  sosHistory: SosIncident[];
  responderProfile: CommunityResponder | null;
  token: string | null;
  loading: boolean;
  emailVerificationPreview: string | null;
  signInWithGooglePopup: () => Promise<void>;
  loginWithGoogle: (profile: {
    email: string;
    fullName: string;
    avatarUrl?: string;
  }) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => Promise<{ verificationCode?: string }>;
  sendMobileOtp: (
    countryCode: string,
    mobileNumber: string
  ) => Promise<{
    phone: string;
    deliveryStatus: string;
    verificationCodePreview?: string;
    smsGatewayConfigured: boolean;
  }>;
  verifyMobileOtp: (countryCode: string, mobileNumber: string, otp: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ resetCodePreview?: string; message: string }>;
  confirmPasswordReset: (email: string, code: string, newPassword: string) => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  updateProfile: (
    updates: Partial<UserProfile> & { preferences?: Partial<UserPreferences> }
  ) => Promise<void>;
  addContact: (contact: Partial<TrustedContact>) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_TOKEN_KEY = 'urbanshield_session_token';
const SESSION_UID_KEY = 'urbanshield_user_uid';
const SESSION_EMAIL_KEY = 'urbanshield_user_email';

function saveSessionMeta(tok: string | null, u?: UserProfile | null) {
  try {
    if (tok) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, tok);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
    if (u?.id) {
      sessionStorage.setItem(SESSION_UID_KEY, u.id);
    } else if (tok === null) {
      sessionStorage.removeItem(SESSION_UID_KEY);
    }
    if (u?.email) {
      sessionStorage.setItem(SESSION_EMAIL_KEY, u.email);
    } else if (tok === null) {
      sessionStorage.removeItem(SESSION_EMAIL_KEY);
    }
  } catch {
    // Ignore storage quota / sandbox restrictions
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [sosHistory, setSosHistory] = useState<SosIncident[]>([]);
  const [responderProfile, setResponderProfile] = useState<CommunityResponder | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [emailVerificationPreview, setEmailVerificationPreview] = useState<string | null>(null);

  const buildAuthHeaders = useCallback(
    (activeToken?: string | null, extraContentType = false): Record<string, string> => {
      const tok = activeToken ?? token ?? '';
      let storedUid = user?.id || '';
      let storedEmail = user?.email || '';
      try {
        if (!storedUid) storedUid = sessionStorage.getItem(SESSION_UID_KEY) || '';
        if (!storedEmail) storedEmail = sessionStorage.getItem(SESSION_EMAIL_KEY) || '';
      } catch {
        // Ignore
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tok}`,
      };
      if (storedUid) headers['X-User-Uid'] = storedUid;
      if (storedEmail) headers['X-User-Email'] = storedEmail;
      if (extraContentType) headers['Content-Type'] = 'application/json';
      return headers;
    },
    [token, user]
  );

  const loadBundleWithToken = useCallback(
    async (activeToken: string, hintUid?: string, hintEmail?: string) => {
      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${activeToken}`,
        };
        if (hintUid) headers['X-User-Uid'] = hintUid;
        if (hintEmail) headers['X-User-Email'] = hintEmail;

        const res = await fetch('/api/auth/me', { headers });
        if (res.ok) {
          const data = await res.json();
          const finalToken = data.token || activeToken;
          setToken(finalToken);
          setUser(data.user);
          setPreferences(data.preferences);
          setContacts(data.contacts || []);
          setSosHistory(data.sosHistory || []);
          setResponderProfile(data.responderProfile || null);
          saveSessionMeta(finalToken, data.user);
        }
      } catch (err) {
        console.error('Session verification error:', err);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          setToken(idToken);
          await loadBundleWithToken(
            idToken,
            firebaseUser.uid,
            firebaseUser.email || undefined
          );
        } catch (err) {
          console.error('Failed to retrieve Firebase ID token:', err);
        }
      } else {
        try {
          const savedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
          const savedUid = sessionStorage.getItem(SESSION_UID_KEY) || undefined;
          const savedEmail = sessionStorage.getItem(SESSION_EMAIL_KEY) || undefined;
          if (savedToken) {
            await loadBundleWithToken(savedToken, savedUid, savedEmail);
          }
        } catch {
          // Ignore storage error
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadBundleWithToken]);

  const refreshSession = useCallback(async () => {
    if (token) {
      await loadBundleWithToken(token, user?.id, user?.email);
    }
  }, [token, user, loadBundleWithToken]);

  const signInWithGooglePopup = async () => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await result.user.getIdToken();
    setToken(idToken);
    await loadBundleWithToken(idToken, result.user.uid, result.user.email || undefined);
  };

  const loginWithGoogle = async (profile: {
    email: string;
    fullName: string;
    avatarUrl?: string;
  }) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Google authentication failed.');
    }
    setToken(data.token);
    setUser(data.user);
    setPreferences(data.preferences);
    setContacts(data.contacts || []);
    saveSessionMeta(data.token, data.user);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Unable to sign in.');
    }
    setToken(data.token);
    setUser(data.user);
    setPreferences(data.preferences);
    setContacts(data.contacts || []);
    saveSessionMeta(data.token, data.user);
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, fullName, phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed.');
    }
    setToken(data.token);
    setUser(data.user);
    setPreferences(data.preferences);
    setContacts(data.contacts || []);
    saveSessionMeta(data.token, data.user);
    if (data.emailVerificationCodePreview) {
      setEmailVerificationPreview(data.emailVerificationCodePreview);
    }
    return { verificationCode: data.emailVerificationCodePreview };
  };

  const sendMobileOtp = async (countryCode: string, mobileNumber: string) => {
    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode, mobileNumber }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to send OTP.');
    }
    return data;
  };

  const verifyMobileOtp = async (countryCode: string, mobileNumber: string, otp: string) => {
    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode, mobileNumber, otp }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'OTP verification failed.');
    }
    setToken(data.token);
    setUser(data.user);
    setPreferences(data.preferences);
    setContacts(data.contacts || []);
    saveSessionMeta(data.token, data.user);
  };

  const requestPasswordReset = async (email: string) => {
    const res = await fetch('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to request password reset.');
    }
    return data;
  };

  const confirmPasswordReset = async (email: string, code: string, newPassword: string) => {
    const res = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Password reset failed.');
    }
  };

  const verifyEmailCode = async (code: string) => {
    if (!token && !user) throw new Error('Not authenticated');
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: buildAuthHeaders(token, true),
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Invalid verification code.');
    }
    setUser(data.user);
    setEmailVerificationPreview(null);
  };

  const updateProfile = async (
    updates: Partial<UserProfile> & { preferences?: Partial<UserPreferences> }
  ) => {
    if (!token && !user) throw new Error('Not authenticated');
    const res = await fetch('/api/auth/profile', {
      method: 'PUT',
      headers: buildAuthHeaders(token, true),
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile.');
    }
    setUser(data.user);
    if (data.preferences) {
      setPreferences(data.preferences);
    }
  };

  const addContact = async (contact: Partial<TrustedContact>) => {
    if (!token && !user) throw new Error('Not authenticated');
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: buildAuthHeaders(token, true),
      body: JSON.stringify(contact),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to add trusted contact.');
    }
    setContacts(data.contacts || []);
  };

  const removeContact = async (id: string) => {
    if (!token && !user) throw new Error('Not authenticated');
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'DELETE',
      headers: buildAuthHeaders(token, false),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to remove contact.');
    }
    setContacts(data.contacts || []);
  };

  const logout = async () => {
    await firebaseSignOut(auth).catch(() => null);
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: buildAuthHeaders(token, false),
      }).catch(() => null);
    }
    saveSessionMeta(null, null);
    setToken(null);
    setUser(null);
    setPreferences(null);
    setContacts([]);
  };

  const deleteAccount = async () => {
    if (!token && !user) return;
    const res = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: buildAuthHeaders(token, false),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete account.');
    }
    await firebaseSignOut(auth).catch(() => null);
    saveSessionMeta(null, null);
    setToken(null);
    setUser(null);
    setPreferences(null);
    setContacts([]);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        preferences,
        contacts,
        sosHistory,
        responderProfile,
        token,
        loading,
        emailVerificationPreview,
        signInWithGooglePopup,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        sendMobileOtp,
        verifyMobileOtp,
        requestPasswordReset,
        confirmPasswordReset,
        verifyEmailCode,
        updateProfile,
        addContact,
        removeContact,
        logout,
        deleteAccount,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
