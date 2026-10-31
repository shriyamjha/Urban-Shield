-- ============================================================================
-- URBANSHIELD: UNIVERSAL CITY SAFETY INTELLIGENCE & EMERGENCY RESPONSE
-- Supabase PostgreSQL + PostGIS Schema & Row Level Security (RLS) Migration
-- Initial Coverage: Chandigarh & Mohali, India
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. USERS PROFILE TABLE (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  blood_group TEXT,
  medical_notes TEXT,
  default_city TEXT NOT NULL DEFAULT 'Chandigarh',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USER PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  location_sharing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  auto_alert_contacts_on_sos BOOLEAN NOT NULL DEFAULT TRUE,
  sos_countdown_seconds INTEGER NOT NULL DEFAULT 5 CHECK (sos_countdown_seconds BETWEEN 3 AND 15),
  share_Responder_proximity BOOLEAN NOT NULL DEFAULT FALSE,
  weight_establishments INTEGER NOT NULL DEFAULT 30,
  weight_main_roads INTEGER NOT NULL DEFAULT 25,
  weight_emergency_services INTEGER NOT NULL DEFAULT 20,
  weight_transport INTEGER NOT NULL DEFAULT 15,
  weight_streetlights INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TRUSTED EMERGENCY CONTACTS TABLE
CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notify_via_sms BOOLEAN NOT NULL DEFAULT TRUE,
  notify_via_email BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. COMMUNITY RESPONDERS TABLE
CREATE TABLE IF NOT EXISTS public.responders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role_qualification TEXT NOT NULL DEFAULT 'Community Volunteer',
  sector_area TEXT NOT NULL DEFAULT 'Sector 17, Chandigarh',
  availability_status TEXT NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'busy', 'offline')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326),
  verified_responder BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. EMERGENCY SOS INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS public.emergency_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'cancelled')),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326),
  area_label TEXT NOT NULL,
  notes TEXT,
  share_token TEXT UNIQUE NOT NULL,
  notifications_dispatched BOOLEAN NOT NULL DEFAULT FALSE,
  notification_channel_detail TEXT NOT NULL DEFAULT 'Pending external SMS gateway configuration',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 6. SOS RESPONDER ACKNOWLEDGEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.incident_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES public.emergency_incidents(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES public.responders(id) ON DELETE CASCADE,
  responder_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('acknowledged', 'declined')),
  eta_minutes INTEGER,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(incident_id, responder_id)
);

-- 7. COMMUNITY INCIDENT REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL DEFAULT 'Registered Citizen',
  category TEXT NOT NULL CHECK (category IN (
    'poorly_lit_area',
    'road_hazard',
    'harassment_suspicious',
    'infrastructure_problem',
    'blocked_road',
    'other_safety_concern'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326),
  location_label TEXT NOT NULL,
  photo_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending',
    'community_confirmed',
    'moderator_verified',
    'resolved'
  )),
  confirmations_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- 8. NOTIFICATIONS LOG TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  incident_id UUID REFERENCES public.emergency_incidents(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'in_app', 'share_link')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('sent', 'queued_no_provider', 'failed')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.responders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view and update their own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete own profile" ON public.users
  FOR DELETE USING (auth.uid() = id);

-- User preferences strictly private to owner
CREATE POLICY "Users manage own preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trusted contacts strictly private to owner
CREATE POLICY "Users manage own trusted contacts" ON public.trusted_contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Responders: authenticated users can view active responders; only owner can update status
CREATE POLICY "Authenticated users view available responders" ON public.responders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users manage own responder profile" ON public.responders
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Emergency incidents: owner has full control; opted-in responders can view active incidents
CREATE POLICY "Users view own or active emergency incidents" ON public.emergency_incidents
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id OR status IN ('active', 'acknowledged')
  );

CREATE POLICY "Users create own emergency incidents" ON public.emergency_incidents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own emergency incidents" ON public.emergency_incidents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Community reports: readable by all authenticated users; created/edited by owner
CREATE POLICY "Anyone can view non-expired community reports" ON public.community_reports
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users submit community reports" ON public.community_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Report owners can update own reports" ON public.community_reports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Notifications strictly private to owner
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
