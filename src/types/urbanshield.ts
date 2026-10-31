export type AuthProviderType = 'google' | 'phone' | 'email';

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  avatarUrl?: string;
  authProvider: AuthProviderType;
  emailVerified: boolean;
  phoneVerified: boolean;
  onboardingCompleted: boolean;
  bloodGroup?: string;
  medicalNotes?: string;
  defaultCity: 'Chandigarh' | 'Mohali';
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  userId: string;
  locationSharingEnabled: boolean;
  autoAlertContactsOnSos: boolean;
  sosCountdownSeconds: number;
  shareResponderProximity: boolean;
  weights: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
}

export interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
  notifyViaSms: boolean;
  notifyViaEmail: boolean;
  createdAt: string;
}

export interface SavedLocation {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  category: 'home' | 'work' | 'university' | 'emergency' | 'custom';
}

export type ResponderStatus = 'available' | 'busy' | 'offline';

export interface CommunityResponder {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  roleQualification: string;
  sectorArea: string;
  availabilityStatus: ResponderStatus;
  latitude: number;
  longitude: number;
  verifiedResponder: boolean;
  acknowledgedCount: number;
  updatedAt: string;
}

export type SosIncidentStatus = 'active' | 'acknowledged' | 'resolved' | 'cancelled';

export interface IncidentResponderAction {
  responderId: string;
  responderName: string;
  roleQualification: string;
  action: 'acknowledged' | 'declined';
  etaMinutes?: number;
  timestamp: string;
}

export interface SosIncident {
  id: string;
  userId: string;
  userName: string;
  status: SosIncidentStatus;
  latitude: number;
  longitude: number;
  areaLabel: string;
  notes?: string;
  shareToken: string;
  notificationsDispatched: boolean;
  notificationChannelDetail: string;
  notifiedContactsCount: number;
  responses: IncidentResponderAction[];
  createdAt: string;
  resolvedAt?: string;
}

export type ReportCategory =
  | 'poorly_lit_area'
  | 'road_hazard'
  | 'harassment_suspicious'
  | 'infrastructure_problem'
  | 'blocked_road'
  | 'other_safety_concern';

export type ReportVerificationStatus =
  | 'pending'
  | 'community_confirmed'
  | 'moderator_verified'
  | 'resolved';

export interface CommunityReport {
  id: string;
  userId: string;
  reporterName: string;
  category: ReportCategory;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  photoUrl?: string;
  verificationStatus: ReportVerificationStatus;
  confirmationsCount: number;
  confirmedByUserIds: string[];
  createdAt: string;
  expiresAt: string;
}

export type MapLayerCategory =
  | 'hospital'
  | 'clinic'
  | 'pharmacy'
  | 'police'
  | 'fuel'
  | 'restaurant'
  | 'cafe'
  | 'shop'
  | 'transport'
  | 'education'
  | 'cctv'
  | 'streetlight'
  | 'incident'
  | 'crime_hotspot';

export type CctvClassification =
  | 'verified_camera'
  | 'documented_junction'
  | 'surveillance_zone'
  | 'unknown_coverage';

export type StreetlightClassification =
  | 'verified_streetlight'
  | 'lighting_corridor'
  | 'estimated_coverage'
  | 'unknown_coverage';

export interface CityPoi {
  id: string;
  name: string;
  category: MapLayerCategory;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  openingHours?: string;
  operator?: string;
  source:
    | 'OpenStreetMap / Overpass API'
    | 'Chandigarh Smart City Public Registry'
    | 'Community Report'
    | 'Official Police / NCRB Jurisdictional Record';
  verified: boolean;
  distanceKm?: number;
  cctvClass?: CctvClassification;
  streetlightClass?: StreetlightClassification;
  coverageNote?: string;
  metadata?: Record<string, string>;
}

export type CrimeGranularity =
  | 'district'
  | 'police_station'
  | 'sector_locality'
  | 'insufficient_data';

export type CrimeCategoryType =
  | 'Theft & Snatching'
  | 'Vehicle Burglary / MV Theft'
  | 'Assault & Public Order'
  | 'Nighttime Street Offences'
  | 'Women Safety & Harassment'
  | 'All Recorded IPC/BNS Offences';

export interface HistoricalCrimeRecord {
  id: string;
  year: number;
  district: 'Chandigarh UT' | 'SAS Nagar (Mohali)';
  policeStation: string;
  sectorOrLocality: string;
  crimeCategory: CrimeCategoryType;
  incidentCount: number | null; // null when insufficient public granular data
  geographicGranularity: CrimeGranularity;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  source: string;
  verificationStatus: 'Official Published Aggregate' | 'Police Station Jurisdictional Summary' | 'Insufficient Public Granular Data';
  notes: string;
}

export type TravelMode = 'foot' | 'bike' | 'car';

export interface NightActivityBreakdown {
  overallScore: number | null; // null if insufficient data
  scoreStatusLabel: string;
  confidencePercentage: number;
  confidenceTier: 'High' | 'Moderate' | 'Partial OSM Coverage' | 'Insufficient Data';
  activitySummary: string;
  infrastructureSummary: string;
  historicalCrimeExposure: string;
  factors: {
    establishmentsScore: number;
    establishmentsCount: number;
    mainRoadScore: number;
    mainRoadCoveragePercent: number;
    mainRoadSummary: string;
    emergencyScore: number;
    emergencyCount: number;
    transportScore: number;
    transportCount: number;
    streetlightScore: number;
    streetlightCount: number;
    verifiedCctvCount: number;
  };
  weightsUsed: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
  missingDataNotes: string[];
}

export interface RouteFacilityDetail {
  id: string;
  name: string;
  category: MapLayerCategory;
  distanceFromRouteMeters: number;
  address?: string;
  openingHours?: string;
  phone?: string;
  classificationNote?: string;
}

export interface SmartRouteOption {
  id: string;
  type: 'recommended' | 'fastest' | 'higher_activity' | 'balanced';
  label: string;
  tagline: string;
  recommendationReason: string;
  isRecommended: boolean;
  distanceMeters: number;
  durationSeconds: number;
  transportMode: TravelMode;
  isNightJourney: boolean;
  departureTime: string;
  geometry: [number, number][]; // [lng, lat]
  summaryRoads: string;
  documentedHelpPointsCount: number;
  longestGapBetweenHelpPointsKm: number;
  mainRoadCoveragePercent: number;
  nearbyPoisCount: {
    hospitals: number;
    police: number;
    pharmacies: number;
    fuelStations: number;
    activeEstablishments: number;
    transportStops: number;
    streetlights: number;
    cctvNodes: number;
  };
  nearbyFacilities: {
    hospitals: RouteFacilityDetail[];
    police: RouteFacilityDetail[];
    pharmacies: RouteFacilityDetail[];
    fuel: RouteFacilityDetail[];
    commercial: RouteFacilityDetail[];
  };
  nightActivity: NightActivityBreakdown;
  trafficStatus: string;
}

export interface WeatherTelemetry {
  city: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPercent: number;
  windSpeedKmh: number;
  precipitationProbability: number;
  visibilityMeters: number | null;
  weatherCode: number;
  weatherDescription: string;
  isDay: boolean;
  updatedAt: string;
  hourlyForecast: {
    time: string;
    tempC: number;
    rainProb: number;
    visibilityKm: number | null;
  }[];
}

export type NavigationSection =
  | 'overview'
  | 'routes'
  | 'map'
  | 'crime'
  | 'reports'
  | 'sos'
  | 'assistant'
  | 'profile'
  | 'conditions';
