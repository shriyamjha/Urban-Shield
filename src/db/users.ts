import { eq, desc, and } from 'drizzle-orm';
import { db } from './index.ts';
import {
  users,
  userPreferences,
  trustedContacts,
  responders,
  emergencyIncidents,
  communityReports,
} from './schema.ts';
import {
  UserProfile,
  UserPreferences,
  TrustedContact,
  CommunityResponder,
  SosIncident,
  CommunityReport,
} from '../types/urbanshield.ts';

function mapDbUserToProfile(row: typeof users.$inferSelect): UserProfile {
  return {
    id: row.uid,
    email: row.email,
    phone: row.phone,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl || undefined,
    authProvider: (row.authProvider as UserProfile['authProvider']) || 'google',
    emailVerified: row.emailVerified,
    phoneVerified: row.phoneVerified,
    onboardingCompleted: row.onboardingCompleted,
    bloodGroup: row.bloodGroup || undefined,
    medicalNotes: row.medicalNotes || undefined,
    defaultCity: (row.defaultCity as 'Chandigarh' | 'Mohali') || 'Chandigarh',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDbPrefs(row: typeof userPreferences.$inferSelect): UserPreferences {
  return {
    userId: row.userUid,
    locationSharingEnabled: row.locationSharingEnabled,
    autoAlertContactsOnSos: row.autoAlertContactsOnSos,
    sosCountdownSeconds: row.sosCountdownSeconds,
    shareResponderProximity: row.shareResponderProximity,
    weights: {
      establishments: row.weightEstablishments,
      mainRoads: row.weightMainRoads,
      emergencyServices: row.weightEmergencyServices,
      transport: row.weightTransport,
      streetlights: row.weightStreetlights,
    },
  };
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  extra?: {
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
    authProvider?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    passwordHash?: string;
    passwordSalt?: string;
  }
) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        fullName: extra?.fullName || email.split('@')[0] || 'Citizen',
        phone: extra?.phone || '',
        avatarUrl: extra?.avatarUrl,
        authProvider: extra?.authProvider || 'google',
        emailVerified: extra?.emailVerified ?? true,
        phoneVerified: extra?.phoneVerified ?? false,
        passwordHash: extra?.passwordHash,
        passwordSalt: extra?.passwordSalt,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    const userRow = result[0];

    // Ensure preferences row exists
    await db
      .insert(userPreferences)
      .values({
        userUid: uid,
      })
      .onConflictDoNothing({
        target: userPreferences.userUid,
      });

    return mapDbUserToProfile(userRow);
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function findUserByEmail(email: string) {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()));
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in findUserByEmail:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function findUserByPhone(phone: string) {
  try {
    const rows = await db.select().from(users).where(eq(users.phone, phone));
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in findUserByPhone:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getMostRecentActiveUser() {
  try {
    const rows = await db
      .select()
      .from(users)
      .orderBy(desc(users.updatedAt))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database query failed in getMostRecentActiveUser:', error);
    return null;
  }
}

export async function getUserBundleByUid(uid: string) {
  try {
    const userRows = await db.select().from(users).where(eq(users.uid, uid));
    if (!userRows.length) return null;

    let prefRows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userUid, uid));

    if (!prefRows.length) {
      prefRows = await db
        .insert(userPreferences)
        .values({ userUid: uid })
        .onConflictDoUpdate({
          target: userPreferences.userUid,
          set: { updatedAt: new Date() },
        })
        .returning();
    }

    const contactRows = await db
      .select()
      .from(trustedContacts)
      .where(eq(trustedContacts.userUid, uid))
      .orderBy(desc(trustedContacts.createdAt));

    const incidentRows = await db
      .select()
      .from(emergencyIncidents)
      .where(eq(emergencyIncidents.userUid, uid))
      .orderBy(desc(emergencyIncidents.createdAt));

    const responderRows = await db
      .select()
      .from(responders)
      .where(eq(responders.userUid, uid));

    return {
      user: mapDbUserToProfile(userRows[0]),
      preferences: mapDbPrefs(prefRows[0]),
      contacts: contactRows.map(
        (c): TrustedContact => ({
          id: String(c.id),
          userId: c.userUid,
          name: c.name,
          relationship: c.relationship,
          phone: c.phone,
          email: c.email || undefined,
          isPrimary: c.isPrimary,
          notifyViaSms: c.notifyViaSms,
          notifyViaEmail: c.notifyViaEmail,
          createdAt: c.createdAt.toISOString(),
        })
      ),
      sosHistory: incidentRows.map(mapDbIncident),
      responderProfile: responderRows[0] ? mapDbResponder(responderRows[0]) : null,
    };
  } catch (error) {
    console.error('Database query failed in getUserBundleByUid:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function updateUserAndPreferences(
  uid: string,
  updates: Partial<UserProfile> & {
    preferences?: Partial<UserPreferences>;
    passwordHash?: string;
    passwordSalt?: string;
  }
) {
  try {
    const userSet: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.fullName !== undefined) userSet.fullName = updates.fullName;
    if (updates.email !== undefined) userSet.email = updates.email;
    if (updates.phone !== undefined) userSet.phone = updates.phone;
    if (updates.avatarUrl !== undefined) userSet.avatarUrl = updates.avatarUrl;
    if (updates.bloodGroup !== undefined) userSet.bloodGroup = updates.bloodGroup;
    if (updates.medicalNotes !== undefined) userSet.medicalNotes = updates.medicalNotes;
    if (updates.defaultCity !== undefined) userSet.defaultCity = updates.defaultCity;
    if (updates.onboardingCompleted !== undefined) {
      userSet.onboardingCompleted = updates.onboardingCompleted;
    }
    if (updates.emailVerified !== undefined) userSet.emailVerified = updates.emailVerified;
    if (updates.phoneVerified !== undefined) userSet.phoneVerified = updates.phoneVerified;
    if (updates.passwordHash !== undefined) userSet.passwordHash = updates.passwordHash;
    if (updates.passwordSalt !== undefined) userSet.passwordSalt = updates.passwordSalt;

    const updatedUsers = await db
      .update(users)
      .set(userSet)
      .where(eq(users.uid, uid))
      .returning();

    if (updates.preferences) {
      const p = updates.preferences;
      const prefSet: Record<string, unknown> = { updatedAt: new Date() };
      if (p.locationSharingEnabled !== undefined) {
        prefSet.locationSharingEnabled = p.locationSharingEnabled;
      }
      if (p.autoAlertContactsOnSos !== undefined) {
        prefSet.autoAlertContactsOnSos = p.autoAlertContactsOnSos;
      }
      if (p.sosCountdownSeconds !== undefined) {
        prefSet.sosCountdownSeconds = p.sosCountdownSeconds;
      }
      if (p.weights) {
        prefSet.weightEstablishments = p.weights.establishments;
        prefSet.weightMainRoads = p.weights.mainRoads;
        prefSet.weightEmergencyServices = p.weights.emergencyServices;
        prefSet.weightTransport = p.weights.transport;
        prefSet.weightStreetlights = p.weights.streetlights;
      }

      await db
        .update(userPreferences)
        .set(prefSet)
        .where(eq(userPreferences.userUid, uid));
    }

    const prefRows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userUid, uid));

    return {
      user: mapDbUserToProfile(updatedUsers[0]),
      preferences: prefRows[0] ? mapDbPrefs(prefRows[0]) : undefined,
    };
  } catch (error) {
    console.error('Database query failed in updateUserAndPreferences:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteUserAccountByUid(uid: string) {
  try {
    await db.delete(trustedContacts).where(eq(trustedContacts.userUid, uid));
    await db.delete(userPreferences).where(eq(userPreferences.userUid, uid));
    await db.delete(responders).where(eq(responders.userUid, uid));
    await db.delete(emergencyIncidents).where(eq(emergencyIncidents.userUid, uid));
    await db.delete(users).where(eq(users.uid, uid));
  } catch (error) {
    console.error('Database query failed in deleteUserAccountByUid:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function addTrustedContactForUser(
  uid: string,
  payload: Partial<TrustedContact>
) {
  try {
    await db.insert(trustedContacts).values({
      userUid: uid,
      name: payload.name || 'Trusted Contact',
      relationship: payload.relationship || 'Family',
      phone: payload.phone || '',
      email: payload.email,
      isPrimary: Boolean(payload.isPrimary),
      notifyViaSms: payload.notifyViaSms !== false,
      notifyViaEmail: Boolean(payload.notifyViaEmail),
    });

    const rows = await db
      .select()
      .from(trustedContacts)
      .where(eq(trustedContacts.userUid, uid))
      .orderBy(desc(trustedContacts.createdAt));

    return rows.map(
      (c): TrustedContact => ({
        id: String(c.id),
        userId: c.userUid,
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        email: c.email || undefined,
        isPrimary: c.isPrimary,
        notifyViaSms: c.notifyViaSms,
        notifyViaEmail: c.notifyViaEmail,
        createdAt: c.createdAt.toISOString(),
      })
    );
  } catch (error) {
    console.error('Database query failed in addTrustedContactForUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteTrustedContactForUser(uid: string, contactId: number) {
  try {
    await db
      .delete(trustedContacts)
      .where(and(eq(trustedContacts.id, contactId), eq(trustedContacts.userUid, uid)));

    const rows = await db
      .select()
      .from(trustedContacts)
      .where(eq(trustedContacts.userUid, uid))
      .orderBy(desc(trustedContacts.createdAt));

    return rows.map(
      (c): TrustedContact => ({
        id: String(c.id),
        userId: c.userUid,
        name: c.name,
        relationship: c.relationship,
        phone: c.phone,
        email: c.email || undefined,
        isPrimary: c.isPrimary,
        notifyViaSms: c.notifyViaSms,
        notifyViaEmail: c.notifyViaEmail,
        createdAt: c.createdAt.toISOString(),
      })
    );
  } catch (error) {
    console.error('Database query failed in deleteTrustedContactForUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

function mapDbResponder(r: typeof responders.$inferSelect): CommunityResponder {
  return {
    id: String(r.id),
    userId: r.userUid,
    fullName: r.fullName,
    phone: r.phone,
    roleQualification: r.roleQualification,
    sectorArea: r.sectorArea,
    availabilityStatus: r.availabilityStatus as CommunityResponder['availabilityStatus'],
    latitude: r.latitude,
    longitude: r.longitude,
    verifiedResponder: r.verifiedResponder,
    acknowledgedCount: r.acknowledgedCount,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function mapDbIncident(inc: typeof emergencyIncidents.$inferSelect): SosIncident {
  let parsedResponses = [];
  try {
    parsedResponses = JSON.parse(inc.responsesJson || '[]');
  } catch {
    parsedResponses = [];
  }
  return {
    id: String(inc.id),
    userId: inc.userUid,
    userName: inc.userName,
    status: inc.status as SosIncident['status'],
    latitude: inc.latitude,
    longitude: inc.longitude,
    areaLabel: inc.areaLabel,
    notes: inc.notes || undefined,
    shareToken: inc.shareToken,
    notificationsDispatched: inc.notificationsDispatched,
    notificationChannelDetail: inc.notificationChannelDetail,
    notifiedContactsCount: inc.notifiedContactsCount,
    responses: parsedResponses,
    createdAt: inc.createdAt.toISOString(),
    resolvedAt: inc.resolvedAt ? inc.resolvedAt.toISOString() : undefined,
  };
}

function mapDbReport(rep: typeof communityReports.$inferSelect): CommunityReport {
  let confirmedIds: string[] = [];
  try {
    confirmedIds = JSON.parse(rep.confirmedByJson || '[]');
  } catch {
    confirmedIds = [];
  }
  return {
    id: String(rep.id),
    userId: rep.userUid,
    reporterName: rep.reporterName,
    category: rep.category as CommunityReport['category'],
    title: rep.title,
    description: rep.description,
    latitude: rep.latitude,
    longitude: rep.longitude,
    locationLabel: rep.locationLabel,
    photoUrl: rep.photoUrl || undefined,
    verificationStatus: rep.verificationStatus as CommunityReport['verificationStatus'],
    confirmationsCount: rep.confirmationsCount,
    confirmedByUserIds: confirmedIds,
    createdAt: rep.createdAt.toISOString(),
    expiresAt: rep.expiresAt.toISOString(),
  };
}

export async function getAllResponders(): Promise<CommunityResponder[]> {
  try {
    const rows = await db.select().from(responders).orderBy(desc(responders.updatedAt));
    return rows.map(mapDbResponder);
  } catch (error) {
    console.error('Database query failed in getAllResponders:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertResponder(
  userUid: string,
  payload: Partial<CommunityResponder>
): Promise<CommunityResponder> {
  try {
    const rows = await db
      .insert(responders)
      .values({
        userUid,
        fullName: payload.fullName || 'Citizen Responder',
        phone: payload.phone || '+91',
        roleQualification: payload.roleQualification || 'Community Safety Volunteer',
        sectorArea: payload.sectorArea || 'Sector 17, Chandigarh',
        availabilityStatus: payload.availabilityStatus || 'available',
        latitude: payload.latitude ?? 30.7333,
        longitude: payload.longitude ?? 76.7794,
        verifiedResponder: true,
      })
      .onConflictDoUpdate({
        target: responders.userUid,
        set: {
          fullName: payload.fullName || 'Citizen Responder',
          phone: payload.phone || '+91',
          roleQualification: payload.roleQualification || 'Community Safety Volunteer',
          sectorArea: payload.sectorArea || 'Sector 17, Chandigarh',
          availabilityStatus: payload.availabilityStatus || 'available',
          latitude: payload.latitude ?? 30.7333,
          longitude: payload.longitude ?? 76.7794,
          updatedAt: new Date(),
        },
      })
      .returning();

    return mapDbResponder(rows[0]);
  } catch (error) {
    console.error('Database query failed in upsertResponder:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getAllSosIncidents(): Promise<SosIncident[]> {
  try {
    const rows = await db
      .select()
      .from(emergencyIncidents)
      .orderBy(desc(emergencyIncidents.createdAt));
    return rows.map(mapDbIncident);
  } catch (error) {
    console.error('Database query failed in getAllSosIncidents:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createSosIncidentRecord(
  payload: Omit<SosIncident, 'id' | 'createdAt'>
): Promise<SosIncident> {
  try {
    const rows = await db
      .insert(emergencyIncidents)
      .values({
        userUid: payload.userId,
        userName: payload.userName,
        status: payload.status,
        latitude: payload.latitude,
        longitude: payload.longitude,
        areaLabel: payload.areaLabel,
        notes: payload.notes,
        shareToken: payload.shareToken,
        notificationsDispatched: payload.notificationsDispatched,
        notificationChannelDetail: payload.notificationChannelDetail,
        notifiedContactsCount: payload.notifiedContactsCount,
        responsesJson: JSON.stringify(payload.responses || []),
      })
      .returning();

    return mapDbIncident(rows[0]);
  } catch (error) {
    console.error('Database query failed in createSosIncidentRecord:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function updateSosIncidentRecord(
  id: number,
  updates: { status?: SosIncident['status']; responses?: SosIncident['responses']; resolvedAt?: Date }
): Promise<SosIncident | null> {
  try {
    const setObj: Record<string, unknown> = {};
    if (updates.status) setObj.status = updates.status;
    if (updates.responses) setObj.responsesJson = JSON.stringify(updates.responses);
    if (updates.resolvedAt) setObj.resolvedAt = updates.resolvedAt;

    const rows = await db
      .update(emergencyIncidents)
      .set(setObj)
      .where(eq(emergencyIncidents.id, id))
      .returning();

    return rows[0] ? mapDbIncident(rows[0]) : null;
  } catch (error) {
    console.error('Database query failed in updateSosIncidentRecord:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getAllCommunityReports(): Promise<CommunityReport[]> {
  try {
    const rows = await db
      .select()
      .from(communityReports)
      .orderBy(desc(communityReports.createdAt));
    return rows.map(mapDbReport);
  } catch (error) {
    console.error('Database query failed in getAllCommunityReports:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function createCommunityReportRecord(
  payload: Omit<CommunityReport, 'id' | 'createdAt'>
): Promise<CommunityReport> {
  try {
    const rows = await db
      .insert(communityReports)
      .values({
        userUid: payload.userId,
        reporterName: payload.reporterName,
        category: payload.category,
        title: payload.title,
        description: payload.description,
        latitude: payload.latitude,
        longitude: payload.longitude,
        locationLabel: payload.locationLabel,
        photoUrl: payload.photoUrl,
        verificationStatus: payload.verificationStatus,
        confirmationsCount: payload.confirmationsCount,
        confirmedByJson: JSON.stringify(payload.confirmedByUserIds || []),
        expiresAt: new Date(payload.expiresAt),
      })
      .returning();

    return mapDbReport(rows[0]);
  } catch (error) {
    console.error('Database query failed in createCommunityReportRecord:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function updateCommunityReportRecord(
  id: number,
  updates: {
    verificationStatus?: CommunityReport['verificationStatus'];
    confirmationsCount?: number;
    confirmedByUserIds?: string[];
  }
): Promise<CommunityReport | null> {
  try {
    const setObj: Record<string, unknown> = {};
    if (updates.verificationStatus) setObj.verificationStatus = updates.verificationStatus;
    if (updates.confirmationsCount !== undefined) {
      setObj.confirmationsCount = updates.confirmationsCount;
    }
    if (updates.confirmedByUserIds) {
      setObj.confirmedByJson = JSON.stringify(updates.confirmedByUserIds);
    }

    const rows = await db
      .update(communityReports)
      .set(setObj)
      .where(eq(communityReports.id, id))
      .returning();

    return rows[0] ? mapDbReport(rows[0]) : null;
  } catch (error) {
    console.error('Database query failed in updateCommunityReportRecord:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
