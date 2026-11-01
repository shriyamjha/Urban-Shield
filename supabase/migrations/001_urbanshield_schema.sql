-- ============================================================================
-- URBANSHIELD: CHANDIGARH & MOHALI SAFETY AND CITY INTELLIGENCE PLATFORM
-- PostgreSQL + PostGIS Schema & Row Level Security (RLS) Migration
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 1. USERS PROFILE TABLE
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE,
  phone TEXT,
  full_name TEXT NOT NULL,
  auth_provider TEXT NOT NULL DEFAULT 'email',
  is_moderator BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USER PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  home_city TEXT NOT NULL DEFAULT 'Chandigarh',
  default_sector TEXT NOT NULL DEFAULT 'Sector 17, Chandigarh',
  route_preference TEXT NOT NULL DEFAULT 'recommended',
  sos_countdown_seconds INTEGER NOT NULL DEFAULT 5,
  auto_share_location_on_sos BOOLEAN NOT NULL DEFAULT TRUE,
  volunteer_as_responder BOOLEAN NOT NULL DEFAULT FALSE,
  responder_role TEXT DEFAULT 'Volunteer First Responder',
  enabled_map_layers JSONB NOT NULL DEFAULT '["police","hospital","pharmacy","bus_stop","railway_station","fuel_24h","community_reports"]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. EMERGENCY CONTACTS TABLE
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  relationship TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  notify_sms BOOLEAN NOT NULL DEFAULT TRUE,
  notify_push BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. POINTS OF INTEREST (POIs) WITH POSTGIS GEOMETRY
CREATE TABLE IF NOT EXISTS public.points_of_interest (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  city TEXT NOT NULL CHECK (city IN ('Chandigarh', 'Mohali')),
  sector_or_phase TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  phone TEXT,
  opening_hours TEXT,
  is_24_hours BOOLEAN NOT NULL DEFAULT FALSE,
  verified_source TEXT NOT NULL DEFAULT 'OSM_Overpass',
  confidence_score INTEGER NOT NULL DEFAULT 90,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pois_geom ON public.points_of_interest USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_pois_category ON public.points_of_interest (category);

-- 5. STREETLIGHTS INFRASTRUCTURE TABLE (OPTIONAL OPEN DATA LAYER)
CREATE TABLE IF NOT EXISTS public.streetlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  city TEXT NOT NULL,
  sector_or_phase TEXT NOT NULL,
  road_name TEXT,
  status TEXT NOT NULL DEFAULT 'functional',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  source_dataset TEXT NOT NULL DEFAULT 'Municipal_Open_Data',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streetlights_geom ON public.streetlights USING GIST (geom);

-- 6. HISTORICAL CRIME STATISTICS (ADMINISTRATIVE / JURISDICTION LEVEL)
CREATE TABLE IF NOT EXISTS public.crime_statistics (
  id TEXT PRIMARY KEY,
  city TEXT NOT NULL CHECK (city IN ('Chandigarh', 'Mohali')),
  district_name TEXT NOT NULL,
  jurisdiction_label TEXT NOT NULL,
  granularity TEXT NOT NULL CHECK (granularity IN ('district_aggregate', 'police_station_jurisdiction', 'insufficient_sector_data')),
  year INTEGER NOT NULL,
  source_publication TEXT NOT NULL,
  source_url TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  boundary_radius_meters INTEGER NOT NULL DEFAULT 1800,
  metrics JSONB NOT NULL,
  limitations_note TEXT NOT NULL,
  data_availability_status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. COMMUNITY SAFETY & INFRASTRUCTURE REPORTS
CREATE TABLE IF NOT EXISTS public.community_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reporter_name TEXT NOT NULL,
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
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  location_label TEXT NOT NULL,
  photo_url TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'pending',
    'community_confirmed',
    'moderator_verified',
    'resolved'
  )),
  confirmations_count INTEGER NOT NULL DEFAULT 1,
  confirmed_by_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days')
);

CREATE INDEX IF NOT EXISTS idx_community_reports_geom ON public.community_reports USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_community_reports_status ON public.community_reports (verification_status);
CREATE INDEX IF NOT EXISTS idx_community_reports_expires ON public.community_reports (expires_at);

-- 7B. COMMUNITY REPORT CONFIRMATIONS (NORMALIZED 1-PER-USER UNIQUE CONSTRAINT)
CREATE TABLE IF NOT EXISTS public.report_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES public.community_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_report_confirmation_user UNIQUE (report_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_confirmations_report ON public.report_confirmations (report_id);
CREATE INDEX IF NOT EXISTS idx_report_confirmations_user ON public.report_confirmations (user_id);

-- 8. SOS INCIDENTS TABLE
CREATE TABLE IF NOT EXISTS public.sos_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) STORED,
  area_label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
  notes TEXT,
  share_url TEXT NOT NULL,
  notified_contacts_count INTEGER NOT NULL DEFAULT 0,
  notified_responders_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sos_incidents_geom ON public.sos_incidents USING GIST (geom);

-- 9. SOS RESPONDER ACKNOWLEDGEMENTS TABLE
CREATE TABLE IF NOT EXISTS public.sos_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES public.sos_incidents(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  responder_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('acknowledged', 'declined')),
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. SAVED ROUTES TABLE
CREATE TABLE IF NOT EXISTS public.saved_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  origin_label TEXT NOT NULL,
  destination_label TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  selected_classification TEXT NOT NULL,
  distance_meters INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  overall_activity_score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_of_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streetlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crime_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_routes ENABLE ROW LEVEL SECURITY;

-- Users can read & update only their own profile
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- User Preferences
CREATE POLICY "Users manage own preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Emergency Contacts
CREATE POLICY "Users manage own emergency contacts" ON public.emergency_contacts
  FOR ALL USING (auth.uid() = user_id);

-- Public Read-Only Access for POIs, Streetlights, and Crime Statistics
CREATE POLICY "Public read access for POIs" ON public.points_of_interest
  FOR SELECT USING (true);
CREATE POLICY "Public read access for Streetlights" ON public.streetlights
  FOR SELECT USING (true);
CREATE POLICY "Public read access for Crime Statistics" ON public.crime_statistics
  FOR SELECT USING (true);

-- Community Reports: Anyone can read non-expired reports, authenticated users can insert,
-- and only report owners or moderators can update report status
CREATE POLICY "Anyone can view active community reports" ON public.community_reports
  FOR SELECT USING (expires_at > NOW());
CREATE POLICY "Authenticated users can create community reports" ON public.community_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners and moderators can update community reports" ON public.community_reports
  FOR UPDATE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_moderator = TRUE
    )
  );

-- Report Confirmations: Anyone can read confirmations; authenticated users can insert/delete only their own confirmation
CREATE POLICY "Anyone can view report confirmations" ON public.report_confirmations
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users can confirm once per report" ON public.report_confirmations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authenticated users can remove own confirmation" ON public.report_confirmations
  FOR DELETE USING (auth.uid() = user_id);

-- SOS Incidents: Owner and verified responders can view
CREATE POLICY "Users and responders can view active SOS incidents" ON public.sos_incidents
  FOR SELECT USING (auth.uid() = user_id OR status = 'active');
CREATE POLICY "Users can create own SOS incident" ON public.sos_incidents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own SOS incident" ON public.sos_incidents
  FOR UPDATE USING (auth.uid() = user_id);

-- Saved Routes
CREATE POLICY "Users manage own saved routes" ON public.saved_routes
  FOR ALL USING (auth.uid() = user_id);
