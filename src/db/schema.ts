import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. USERS TABLE (Using Firebase Auth UID as unique identifier)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  phone: text('phone').notNull().default(''),
  fullName: text('full_name').notNull().default(''),
  avatarUrl: text('avatar_url'),
  authProvider: text('auth_provider').notNull().default('google'),
  emailVerified: boolean('email_verified').notNull().default(false),
  phoneVerified: boolean('phone_verified').notNull().default(false),
  onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
  bloodGroup: text('blood_group'),
  medicalNotes: text('medical_notes'),
  defaultCity: text('default_city').notNull().default('Chandigarh'),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 2. USER PREFERENCES TABLE
export const userPreferences = pgTable('user_preferences', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  locationSharingEnabled: boolean('location_sharing_enabled').notNull().default(true),
  autoAlertContactsOnSos: boolean('auto_alert_contacts_on_sos').notNull().default(true),
  sosCountdownSeconds: integer('sos_countdown_seconds').notNull().default(5),
  shareResponderProximity: boolean('share_responder_proximity').notNull().default(true),
  weightEstablishments: integer('weight_establishments').notNull().default(30),
  weightMainRoads: integer('weight_main_roads').notNull().default(25),
  weightEmergencyServices: integer('weight_emergency_services').notNull().default(20),
  weightTransport: integer('weight_transport').notNull().default(15),
  weightStreetlights: integer('weight_streetlights').notNull().default(10),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. TRUSTED EMERGENCY CONTACTS TABLE
export const trustedContacts = pgTable('trusted_contacts', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  relationship: text('relationship').notNull().default('Family'),
  phone: text('phone').notNull(),
  email: text('email'),
  isPrimary: boolean('is_primary').notNull().default(false),
  notifyViaSms: boolean('notify_via_sms').notNull().default(true),
  notifyViaEmail: boolean('notify_via_email').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. COMMUNITY RESPONDERS TABLE
export const responders = pgTable('responders', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull().unique(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull(),
  roleQualification: text('role_qualification').notNull().default('Community Safety Volunteer'),
  sectorArea: text('sector_area').notNull().default('Sector 17, Chandigarh'),
  availabilityStatus: text('availability_status').notNull().default('available'),
  latitude: doublePrecision('latitude').notNull().default(30.7333),
  longitude: doublePrecision('longitude').notNull().default(76.7794),
  verifiedResponder: boolean('verified_responder').notNull().default(true),
  acknowledgedCount: integer('acknowledged_count').notNull().default(0),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 5. EMERGENCY SOS INCIDENTS TABLE
export const emergencyIncidents = pgTable('emergency_incidents', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  userName: text('user_name').notNull(),
  status: text('status').notNull().default('active'),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  areaLabel: text('area_label').notNull(),
  notes: text('notes'),
  shareToken: text('share_token').notNull(),
  notificationsDispatched: boolean('notifications_dispatched').notNull().default(false),
  notificationChannelDetail: text('notification_channel_detail').notNull(),
  notifiedContactsCount: integer('notified_contacts_count').notNull().default(0),
  responsesJson: text('responses_json').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

// 6. COMMUNITY INCIDENT REPORTS TABLE
export const communityReports = pgTable('community_reports', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  reporterName: text('reporter_name').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  locationLabel: text('location_label').notNull(),
  photoUrl: text('photo_url'),
  verificationStatus: text('verification_status').notNull().default('pending'),
  confirmationsCount: integer('confirmations_count').notNull().default(1),
  confirmedByJson: text('confirmed_by_json').notNull().default('[]'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

// 7. HISTORICAL CRIME STATISTICS TABLE (NCRB, Chandigarh Statistical Abstract, Police Station & Sector Records)
export const historicalCrimeStatistics = pgTable('historical_crime_statistics', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull(),
  district: text('district').notNull(),
  policeStation: text('police_station'),
  sector: text('sector'),
  crimeCategory: text('crime_category').notNull(),
  incidentCount: integer('incident_count').notNull(),
  geographicLevel: text('geographic_level').notNull(), // 'district' | 'police_station' | 'sector' | 'point'
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  boundaryGeojson: text('boundary_geojson'),
  sourceName: text('source_name').notNull(),
  sourceUrl: text('source_url').notNull(),
  verificationStatus: text('verification_status').notNull().default('official_verified'),
  notes: text('notes'),
  importedAt: timestamp('imported_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.uid],
    references: [userPreferences.userUid],
  }),
  contacts: many(trustedContacts),
}));

export const trustedContactsRelations = relations(trustedContacts, ({ one }) => ({
  user: one(users, {
    fields: [trustedContacts.userUid],
    references: [users.uid],
  }),
}));

