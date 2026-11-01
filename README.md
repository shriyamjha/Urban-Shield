# UrbanShield — Night-Time Safety & Smart Route Intelligence Platform

**UrbanShield** is a full-stack civic safety and night-time route intelligence web application currently operational across **Chandigarh UT** and **SAS Nagar (Mohali)**, engineered to scale across Indian metropolitan corridors.

---

## 1. Project Overview & Problem Statement

### Why the Fastest Route Is Not Always the Safest Route at Night
Conventional navigation platforms (such as Google Maps) optimize strictly for minimum estimated travel time (`Fastest Route`). After dark (8:00 PM – 5:00 AM), the fastest shortcut between two points frequently routes commuters, pedestrians, and two-wheelers through unlit internal sector cuts (V4/V5/V6 roads), closed commercial markets, and long isolated stretches with zero emergency help points.

**UrbanShield** solves this by evaluating multiple genuine road-network alternatives between any two points and recommending the **Safest Night Route** based on verifiable spatial evidence:
- **24/7 Emergency Facility Proximity**: Hospitals, clinics, police stations, night pharmacies, and 24/7 fuel stations within a 650m corridor.
- **Primary Arterial Main-Road Share (%)**: Preference for illuminated primary avenues (*Madhya Marg, Dakshin Marg, Jan Marg, Himalaya Marg, Udyog Path, Airport Road PR-7*).
- **Longest Help-Point Gap Analysis**: Computes the maximum unassisted distance (in meters/km) between consecutive documented help points.
- **Crowdsourced Citizen Hazard Integration**: Incorporates community-confirmed streetlight outages and road hazards in real time.

---

## 2. Main Features

1. **Smart Routes (3-Tier Night Route Classification)**
   - Compares **Safest Route (Recommended)**, **Fastest Route** (strictly guaranteed to have the lowest travel duration), and **Higher Activity Route** across Walking, Two-Wheeler/Cycling, and Driving modes.
   - Displays transparent time/distance trade-offs (e.g., *"+2 extra minutes for 86% main-road share and 9 verified help points"*).
2. **City Intelligence GIS Map**
   - Built on **Leaflet + OpenStreetMap** (CARTO Dark Matter & Esri World Imagery satellite toggle) with 14 independent infrastructure layers and 1-click emergency routing.
3. **Historical Crime Context (Granularity-Preserved)**
   - Integrates official **NCRB** and **Chandigarh / Punjab Police** statistical summaries while strictly distinguishing District Aggregates (`4,500m` radius) and Police Station Jurisdictions (`1,800m–2,200m` radius) from street-level pins.
4. **Community Safety Reports & Confirmation Persistence**
   - Authenticated citizens can submit geo-tagged safety and infrastructure reports and toggle confirmations (`1 per user` enforced via `UNIQUE(report_id, user_id)` constraint, atomic server mutex, and optimistic UI updates with rollback).
   - Role-gated moderation restricts `moderator_verified` status changes to verified responders and moderators.
5. **Emergency SOS Dispatch & Live Weather Telemetry**
   - 5-second accidental-trigger countdown modal, browser GPS lock, Trusted Emergency Contact management, nearby Verified Community Responder alerts via WebSocket, and live **Open-Meteo** fog/visibility advisories.

---

## 3. Technology Stack

- **Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS 4, Lucide Icons
- **Mapping & GIS**: Leaflet 1.9, React-Leaflet 5, OpenStreetMap, CARTO Dark Matter, Esri World Imagery
- **Backend**: Node.js, Express 4, WebSocket (`ws`)
- **Database & Persistence**: PostgreSQL + PostGIS, Drizzle ORM, Supabase Row Level Security (RLS) migration (`supabase/migrations/001_urbanshield_schema.sql`), plus persistent disk store fallback (`.data/urbanshield-store.json`)

---

## 4. Architecture

```text
├── public/
│   └── assets/aistudio/                 # Attached UI reference screenshots
├── supabase/
│   └── migrations/001_urbanshield_schema.sql # PostGIS + RLS schema & report_confirmations table
├── src/
│   ├── components/                      # Modular React views (SmartRoutes, CityMap, Reports, SOS, Profile)
│   ├── context/AuthContext.tsx          # Session, profile, and trusted contacts context
│   ├── data/                            # Verified Chandigarh & Mohali POI baseline + NCRB crime data
│   ├── db/                              # Drizzle ORM schema (schema.ts) & atomic persistence (users.ts)
│   ├── middleware/auth.ts               # Stateless HMAC session & Firebase/JWT auth middleware
│   ├── services/                        # GIS and routing client service
│   └── types/urbanshield.ts             # End-to-end TypeScript domain contracts
└── server.ts                            # Full-stack Express + Vite + WebSocket + GIS/Routing server
```

---

## 5. Installation Instructions

```bash
# 1. Clone the repository
git clone https://github.com/shriyamjha/Urban-Shield.git
cd Urban-Shield

# 2. Install dependencies
npm install

# 3. Copy the environment configuration template
cp .env.example .env
```

---

## 6. Environment Variables

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Client (`VITE_`) | Public Supabase project URL (optional if using Cloud SQL/local store) |
| `VITE_SUPABASE_ANON_KEY` | Client (`VITE_`) | Public Supabase anonymous key (enforced by RLS policies) |
| `PORT` | Server-Only | HTTP & WebSocket server port (default `3000`) |
| `SESSION_SECRET` | Server-Only | Secret key for HMAC-SHA256 stateless session tokens |
| `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DATABASE`, `SQL_PORT` | Server-Only | Optional PostgreSQL connection parameters for Drizzle ORM |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Server-Only | Optional Twilio SMS credentials for live OTP & SOS SMS dispatch |

---

## 7. Development Commands

```bash
# Start full-stack Express + Vite development server on http://localhost:3000
npm run dev

# Run TypeScript compiler type-check
npm run lint

# Push Drizzle schema to PostgreSQL (when SQL_HOST is configured)
npm run db:push
```

---

## 8. Production Build Instructions

```bash
# Build optimized production frontend bundle into dist/
npm run build

# Start production server
NODE_ENV=production npm start
```

---

## 9. External API Dependencies

- **OpenStreetMap & CARTO / Esri Tile Servers**: Map rendering (no paid Google Maps API key required).
- **OSRM (`routing.openstreetmap.de` & `router.project-osrm.org`)**: Multi-modal road geometry and turn-by-turn duration calculation.
- **OpenStreetMap Nominatim & Overpass API**: Bounded Tri-City geocoding and live POI enrichment with local baseline fallback.
- **Open-Meteo API**: Real-time weather, precipitation, wind, and night visibility telemetry for Chandigarh and Mohali.

---

## 10. Known Limitations

- **Geographic Scope**: Currently optimized and geo-fenced for the **Chandigarh–Mohali Tri-City Corridor** (`30.55°N–30.88°N, 76.50°E–76.95°E`), with Phase 2/3 expansion planned for Panchkula, Delhi NCR, and Bengaluru.
- **Streetlight Pole Granularity**: OpenStreetMap pole-by-pole streetlamp tags are partial; UrbanShield combines verified OSM nodes with primary arterial road lighting classifications.
- **SMS Gateway Demo Mode**: When `TWILIO_ACCOUNT_SID` is not configured in `.env`, OTP codes and SOS tracking links are explicitly displayed in preview mode rather than dispatched via carrier SMS.
