export type PoiCategory =
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
  | 'incident';

export type MapLayerCategory = PoiCategory | 'incident' | 'crime_hotspot';

export type CctvClassification =
  | 'verified_camera'
  | 'corridor_zone'
  | 'municipal_documented_zone'
  | 'documented_junction'
  | 'surveillance_zone';

export type StreetlightClassification =
  | 'verified_streetlight'
  | 'arterial_lit_corridor'
  | 'undocumented_corridor'
  | 'lighting_corridor'
  | 'estimated_coverage';

export interface CityPoi {
  id: string;
  name: string;
  category: PoiCategory;
  latitude: number;
  longitude: number;
  address?: string;
  phone?: string;
  openingHours?: string;
  operator?: string;
  source: string;
  verified: boolean;
  coverageNote?: string;
  cctvClass?: CctvClassification;
  streetlightClass?: StreetlightClassification;
}

export type CrimeGeographicGranularity =
  | 'district'
  | 'police_station'
  | 'sector_locality'
  | 'insufficient_data';

export type CrimeGranularity = CrimeGeographicGranularity;

export type CrimeCategoryType = string;

export interface HistoricalCrimeRecord {
  id: string;
  year: number;
  district: 'Chandigarh UT' | 'SAS Nagar (Mohali)';
  policeStation: string;
  sectorOrLocality: string;
  crimeCategory: CrimeCategoryType;
  incidentCount: number | null;
  ratePer100k?: number;
  geographicGranularity: CrimeGeographicGranularity;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  source: string;
  verificationStatus:
    | 'Official Published Aggregate'
    | 'Police Station Jurisdiction Summary'
    | 'Police Station Jurisdictional Summary'
    | 'Insufficient Public Granular Data';
  notes: string;
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

export type TravelMode = 'foot' | 'bike' | 'car';

export interface RouteFacilityDetail {
  id: string;
  name: string;
  category: PoiCategory;
  distanceFromRouteMeters: number;
  address?: string;
  openingHours?: string;
  phone?: string;
  classificationNote?: string;
}

export interface NightActivityFactorBreakdown {
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
}

export interface NightActivityBreakdown {
  overallScore: number | null;
  scoreStatusLabel: string;
  confidencePercentage: number;
  confidenceTier: 'High' | 'Moderate' | 'Partial OSM Coverage' | 'Insufficient Data';
  activitySummary: string;
  infrastructureSummary: string;
  historicalCrimeExposure: string;
  factors: NightActivityFactorBreakdown;
  weightsUsed: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
  missingDataNotes: string[];
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
  trafficStatus: string;
  nightActivity: NightActivityBreakdown;
}

export interface TrustedContact {
  id: string;
  userId?: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  notifyViaSms: boolean;
  isPrimary?: boolean;
}

export type ResponderStatus = 'available' | 'busy' | 'offline';

export interface CommunityResponder {
  id: string;
  userId: string;
  fullName: string;
  roleQualification: string;
  sectorArea: string;
  phone: string;
  availabilityStatus: ResponderStatus;
  latitude: number;
  longitude: number;
  verifiedResponder: boolean;
}

export interface SosIncidentResponse {
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
  status: 'active' | 'acknowledged' | 'resolved' | 'cancelled';
  latitude: number;
  longitude: number;
  areaLabel: string;
  notes?: string;
  shareToken: string;
  notificationsDispatched: boolean;
  notificationChannelDetail: string;
  notifiedContactsCount: number;
  createdAt: string;
  resolvedAt?: string;
  responses: SosIncidentResponse[];
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
  hourlyForecast: Array<{
    time: string;
    tempC: number;
    rainProb: number;
    visibilityKm: number | null;
  }>;
}

export interface SavedLocation {
  id: string;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  category?: 'home' | 'work' | 'college' | 'hospital' | 'custom' | string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  bloodGroup?: string;
  medicalNotes?: string;
  defaultCity: 'Chandigarh' | 'Mohali';
  avatarUrl?: string;
  authProvider: 'email' | 'phone' | 'google';
  emailVerified: boolean;
  phoneVerified: boolean;
  onboardingCompleted: boolean;
  isModerator?: boolean;
  createdAt: string;
}

export interface UserPreferences {
  userId?: string;
  preferredTransportMode: TravelMode;
  prioritizeLighting: boolean;
  prioritizeMainRoads: boolean;
  prioritizeEmergencyAccess: boolean;
  locationSharingEnabled: boolean;
  autoAlertContactsOnSos: boolean;
  sosCountdownSeconds: number;
  optInCommunityResponder: boolean;
  shareResponderProximity?: boolean;
  weights?: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
}

export type NavigationSection =
  | 'overview'
  | 'routes'
  | 'map'
  | 'crime'
  | 'reports'
  | 'conditions'
  | 'sos'
  | 'profile';
