import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  doublePrecision,
  boolean,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').default('').notNull(),
  phone: text('phone').default('').notNull(),
  bloodGroup: text('blood_group').default(''),
  medicalNotes: text('medical_notes').default(''),
  defaultCity: text('default_city').default('Chandigarh').notNull(),
  avatarUrl: text('avatar_url'),
  authProvider: text('auth_provider').default('email').notNull(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  phoneVerified: boolean('phone_verified').default(false).notNull(),
  onboardingCompleted: boolean('onboarding_completed').default(false).notNull(),
  isModerator: boolean('is_moderator').default(false).notNull(),
  passwordHash: text('password_hash'),
  passwordSalt: text('password_salt'),
  preferencesJson: text('preferences_json').default('{}').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const trustedContacts = pgTable('trusted_contacts', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  name: text('name').notNull(),
  relationship: text('relationship').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  notifyViaSms: boolean('notify_via_sms').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const communityResponders = pgTable('community_responders', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull().unique(),
  fullName: text('full_name').notNull(),
  roleQualification: text('role_qualification').notNull(),
  sectorArea: text('sector_area').notNull(),
  phone: text('phone').notNull(),
  availabilityStatus: text('availability_status').default('available').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  verifiedResponder: boolean('verified_responder').default(true).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sosIncidents = pgTable('sos_incidents', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid').notNull(),
  userName: text('user_name').notNull(),
  status: text('status').default('active').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  areaLabel: text('area_label').notNull(),
  notes: text('notes'),
  shareToken: text('share_token').notNull(),
  notificationsDispatched: boolean('notifications_dispatched').default(false).notNull(),
  notificationChannelDetail: text('notification_channel_detail').default('').notNull(),
  notifiedContactsCount: integer('notified_contacts_count').default(0).notNull(),
  responsesJson: text('responses_json').default('[]').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

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
  verificationStatus: text('verification_status').default('pending').notNull(),
  confirmationsCount: integer('confirmations_count').default(1).notNull(),
  confirmedByJson: text('confirmed_by_json').default('[]').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
});

export const reportConfirmations = pgTable(
  'report_confirmations',
  {
    id: serial('id').primaryKey(),
    reportId: integer('report_id').notNull(),
    userUid: text('user_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    reportUserUnique: uniqueIndex('uq_report_confirmations_report_user').on(
      table.reportId,
      table.userUid
    ),
  })
);

export type UserRow = typeof users.$inferSelect;
export type TrustedContactRow = typeof trustedContacts.$inferSelect;
export type CommunityResponderRow = typeof communityResponders.$inferSelect;
export type SosIncidentRow = typeof sosIncidents.$inferSelect;
export type CommunityReportRow = typeof communityReports.$inferSelect;
export type ReportConfirmationRow = typeof reportConfirmations.$inferSelect;
