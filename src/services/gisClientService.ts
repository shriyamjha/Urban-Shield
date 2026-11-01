import {
  CityPoi,
  HistoricalCrimeRecord,
  SavedLocation,
  SmartRouteOption,
  TravelMode,
} from '../types/urbanshield.ts';
import {
  CHANDIGARH_MOHALI_GAZETTEER,
  VERIFIED_CHANDIGARH_MOHALI_POIS,
} from '../data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

const STORAGE_PREFIX = 'urbanshield_cache_v3_';
const SAVED_LOCATIONS_KEY = 'urbanshield_saved_locations_v1';

export const TRICITY_BOUNDS = {
  minLat: 30.55,
  maxLat: 30.88,
  minLng: 76.5,
  maxLng: 76.95,
};

export function isWithinTricityBounds(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= TRICITY_BOUNDS.minLat &&
    lat <= TRICITY_BOUNDS.maxLat &&
    lng >= TRICITY_BOUNDS.minLng &&
    lng <= TRICITY_BOUNDS.maxLng
  );
}

/**
 * Verifies latitude and longitude ordering.
 * In Chandigarh/Mohali, latitude is ~30.55–30.88° N and longitude is ~76.50–76.95° E.
 * If coordinates were accidentally swapped as [lng, lat], corrects them to [lat, lng].
 */
export function ensureLatLngOrder(
  latOrLng: number,
  lngOrLat: number
): { lat: number; lng: number; wasSwapped: boolean } {
  if (
    latOrLng >= TRICITY_BOUNDS.minLng &&
    latOrLng <= TRICITY_BOUNDS.maxLng &&
    lngOrLat >= TRICITY_BOUNDS.minLat &&
    lngOrLat <= TRICITY_BOUNDS.maxLat
  ) {
    return { lat: lngOrLat, lng: latOrLng, wasSwapped: true };
  }
  return { lat: latOrLng, lng: lngOrLat, wasSwapped: false };
}

function haversineDistanceKmClient(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Scores a candidate location against a user query, enforcing exact Sector/Phase
 * numbers, city affinity, and preferring precise places over broad centroids.
 */
export function scoreLocationCandidate(
  query: string,
  candidateName: string,
  candidateType: string = ''
): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[,()\-/._]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const qNorm = norm(query);
  const cNorm = norm(candidateName);
  if (!qNorm || !cNorm) return 0;

  let score = 0;

  if (cNorm === qNorm) {
    score += 130;
  } else if (cNorm.startsWith(qNorm)) {
    score += 95;
  } else if (cNorm.includes(qNorm)) {
    score += 75;
  }

  // Exact Sector number check (e.g. "Sector 22" vs "Sector 22A" vs "Sector 17")
  const qSectorMatch = qNorm.match(/\bsector\s+(\d+[a-z]?)\b/i);
  if (qSectorMatch) {
    const qSector = qSectorMatch[1].toLowerCase();
    const qBaseDigits = qSector.replace(/[a-z]/g, '');
    const exactSectorRegex = new RegExp(`\\bsector\\s+${qSector}\\b`, 'i');
    const subSectorRegex = new RegExp(`\\bsector\\s+${qBaseDigits}[a-z]\\b`, 'i');
    if (exactSectorRegex.test(cNorm)) {
      score += 140;
      // Prefer the primary sector entry ("Sector 22, Chandigarh") over a sub-sector when query has no letter suffix
      if (!/[a-z]$/i.test(qSector) && !subSectorRegex.test(cNorm.split('(')[0] || '')) {
        score += 35;
      }
    } else if (subSectorRegex.test(cNorm)) {
      score += 90;
    } else {
      return -100;
    }
  }

  // Exact Phase number check (e.g. "Phase 8 Mohali")
  const qPhaseMatch = qNorm.match(/\bphase\s+(\d+[a-z0-9]*)\b/i);
  if (qPhaseMatch) {
    const qPhase = qPhaseMatch[1].toLowerCase();
    const exactPhaseRegex = new RegExp(`\\bphase\\s+${qPhase}\\b`, 'i');
    if (exactPhaseRegex.test(cNorm)) {
      score += 140;
    } else {
      return -100;
    }
  }

  // Token matching
  const stopWords = new Set(['in', 'near', 'the', 'to', 'from', 'at', 'of', 'and', 'india']);
  const qTokens = qNorm.split(' ').filter((t) => t.length >= 2 && !stopWords.has(t));
  let matchedTokens = 0;
  for (const token of qTokens) {
    if (cNorm.includes(token)) {
      matchedTokens++;
      score += 18;
    }
  }

  if (qTokens.length > 0 && matchedTokens === qTokens.length) {
    score += 55;
  } else if (qTokens.length >= 2 && matchedTokens === 0) {
    return -50;
  }

  // City match
  if (qNorm.includes('chandigarh') && cNorm.includes('chandigarh')) score += 25;
  if (
    (qNorm.includes('mohali') || qNorm.includes('sas nagar')) &&
    (cNorm.includes('mohali') || cNorm.includes('sas nagar'))
  ) {
    score += 25;
  }

  // Prefer specific places/landmarks over broad administrative boundaries
  if (candidateType === 'administrative' || candidateType === 'city' || candidateType === 'state') {
    score -= 30;
  }

  return score;
}

function getCached<T>(key: string): T | null {
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > now) {
    return mem.data as T;
  }

  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (parsed && parsed.expiresAt > now) {
        memoryCache.set(key, parsed);
        return parsed.data;
      }
      localStorage.removeItem(STORAGE_PREFIX + key);
    }
  } catch {
    // Ignore storage read errors
  }

  return null;
}

function setCached<T>(key: string, data: T, ttlMs: number): void {
  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttlMs,
  };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Ignore storage quota warnings
  }
}

export interface GeocodingSuggestion {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type: string;
  source: 'Nominatim OSM' | 'Chandigarh/Mohali Gazetteer';
  matchScore?: number;
}

/**
 * Searches Chandigarh & Mohali locations with local Gazetteer token-aware matching,
 * persistent caching (24h TTL), and deduplicated Nominatim API requests.
 */
export async function searchLocationsCached(
  query: string,
  signal?: AbortSignal
): Promise<GeocodingSuggestion[]> {
  const clean = query.trim();
  if (!clean) return [];

  const qLower = clean.toLowerCase();

  const localMatches: GeocodingSuggestion[] = CHANDIGARH_MOHALI_GAZETTEER.map((item) => {
    const { lat, lng } = ensureLatLngOrder(item.latitude, item.longitude);
    const matchScore = scoreLocationCandidate(clean, item.name, item.type);
    return {
      ...item,
      latitude: lat,
      longitude: lng,
      source: 'Chandigarh/Mohali Gazetteer' as const,
      matchScore,
    };
  })
    .filter((item) => (item.matchScore ?? 0) > 15 && isWithinTricityBounds(item.latitude, item.longitude))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  if (clean.length < 3) {
    return localMatches.slice(0, 6);
  }

  const cacheKey = `geocode:${qLower}`;
  const cached = getCached<GeocodingSuggestion[]>(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey) as Promise<GeocodingSuggestion[]>;
  }

  const requestPromise = (async () => {
    try {
      const res = await fetch(`/api/gis/search?q=${encodeURIComponent(clean)}`, {
        signal,
      });
      if (!res.ok) {
        return localMatches.slice(0, 8);
      }
      const data = await res.json();
      const remoteResults: GeocodingSuggestion[] = (data.results || [])
        .map((r: any) => {
          const { lat, lng } = ensureLatLngOrder(Number(r.latitude), Number(r.longitude));
          const source: GeocodingSuggestion['source'] =
            r.source === 'Chandigarh/Mohali Gazetteer'
              ? 'Chandigarh/Mohali Gazetteer'
              : 'Nominatim OSM';
          const matchScore =
            typeof r.matchScore === 'number'
              ? r.matchScore
              : scoreLocationCandidate(clean, String(r.name || ''), String(r.type || 'location'));
          return {
            id: String(r.id),
            name: String(r.name),
            latitude: lat,
            longitude: lng,
            type: String(r.type || 'location'),
            source,
            matchScore,
          };
        })
        .filter(
          (r: GeocodingSuggestion) =>
            isWithinTricityBounds(r.latitude, r.longitude) && (r.matchScore ?? 0) > 0
        );

      // Merge local gazetteer matches with Nominatim results without duplicates
      const merged = [...localMatches];
      for (const rem of remoteResults) {
        const isDup = merged.some(
          (m) =>
            (Math.abs(m.latitude - rem.latitude) < 0.0018 &&
              Math.abs(m.longitude - rem.longitude) < 0.0018) ||
            m.name.toLowerCase() === rem.name.toLowerCase()
        );
        if (!isDup) {
          merged.push(rem);
        }
      }

      merged.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

      const finalSlice = merged.slice(0, 8);
      if (finalSlice.length > 0) {
        setCached(cacheKey, finalSlice, 24 * 60 * 60 * 1000);
      }
      return finalSlice;
    } catch {
      return localMatches.slice(0, 8);
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

export interface LocationResolutionResult {
  status: 'resolved' | 'ambiguous' | 'not_found';
  resolved?: GeocodingSuggestion;
  candidates: GeocodingSuggestion[];
  reason?: string;
}

/**
 * Resolves a user-entered location string into verified coordinates.
 * Refuses out-of-bounds or unrelated matches and requests clarification
 * when multiple distinct locations match ambiguously.
 */
export async function resolveLocationQuery(
  query: string,
  signal?: AbortSignal
): Promise<LocationResolutionResult> {
  const clean = query.trim();
  if (!clean) {
    return {
      status: 'not_found',
      candidates: [],
      reason: 'Please enter a valid origin or destination in Chandigarh or Mohali.',
    };
  }

  const results = await searchLocationsCached(clean, signal);
  const valid = results
    .map((r) => ({
      ...r,
      matchScore: r.matchScore ?? scoreLocationCandidate(clean, r.name, r.type),
    }))
    .filter((r) => isWithinTricityBounds(r.latitude, r.longitude) && (r.matchScore ?? 0) >= 25)
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  if (valid.length === 0) {
    return {
      status: 'not_found',
      candidates: [],
      reason: `No verified match in Chandigarh or Mohali for "${clean}". Please specify a sector, phase, or landmark.`,
    };
  }

  const top = valid[0];
  if (valid.length === 1) {
    return {
      status: 'resolved',
      resolved: top,
      candidates: valid,
    };
  }

  const second = valid[1];
  const topScore = top.matchScore ?? 0;
  const secondScore = second.matchScore ?? 0;
  const distBetweenTopTwoKm = haversineDistanceKmClient(
    top.latitude,
    top.longitude,
    second.latitude,
    second.longitude
  );

  // If the top match is significantly stronger OR the top candidates refer to the same immediate locality (< 0.85 km)
  if (topScore >= 135 || topScore - secondScore >= 25 || distBetweenTopTwoKm < 0.85) {
    return {
      status: 'resolved',
      resolved: top,
      candidates: valid,
    };
  }

  // Multiple distinct locations with close scores -> request user clarification
  const distinctCandidates: GeocodingSuggestion[] = [top];
  for (const cand of valid.slice(1)) {
    const isFarEnough = distinctCandidates.every(
      (existing) =>
        haversineDistanceKmClient(
          existing.latitude,
          existing.longitude,
          cand.latitude,
          cand.longitude
        ) >= 0.5
    );
    if (isFarEnough && (cand.matchScore ?? 0) >= topScore - 30) {
      distinctCandidates.push(cand);
    }
    if (distinctCandidates.length >= 4) break;
  }

  if (distinctCandidates.length <= 1) {
    return {
      status: 'resolved',
      resolved: top,
      candidates: valid,
    };
  }

  return {
    status: 'ambiguous',
    candidates: distinctCandidates,
    reason: `Multiple locations match "${clean}". Please select the exact location:`,
  };
}

export interface CalculateRoutesParams {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  startName?: string;
  endName?: string;
  mode: TravelMode;
  departureTime: string;
  isNightJourney: boolean;
  weights: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
}

/**
 * Validates and enforces route classification invariants:
 * - durationSeconds is positive and represents actual seconds (duration_minutes = durationSeconds / 60)
 * - fastestRoute.durationSeconds <= everyOtherRoute.durationSeconds
 */
export function enforceClientRouteClassificationInvariants(
  routes: SmartRouteOption[]
): SmartRouteOption[] {
  if (!routes || routes.length <= 1) return routes ? [...routes] : [];

  const cloned = routes.map((r) => ({ ...r }));

  // Find actual minimum travel duration among all genuine returned routes
  let minDurationSec = Infinity;
  let actualFastestIdx = 0;
  cloned.forEach((r, idx) => {
    if (r.durationSeconds < minDurationSec) {
      minDurationSec = r.durationSeconds;
      actualFastestIdx = idx;
    }
  });

  const currentFastestIdx = cloned.findIndex((r) => r.type === 'fastest');

  // Guarantee fastestRoute.durationSeconds <= everyOtherRoute.durationSeconds
  if (
    currentFastestIdx !== -1 &&
    currentFastestIdx !== actualFastestIdx &&
    cloned[currentFastestIdx].durationSeconds > minDurationSec
  ) {
    const fastTarget = cloned[actualFastestIdx];
    const prevFast = cloned[currentFastestIdx];

    const tempType = fastTarget.type;
    const tempLabel = fastTarget.label;
    const tempId = fastTarget.id;
    const tempRec = fastTarget.isRecommended;

    fastTarget.type = 'fastest';
    fastTarget.label = 'Fastest route';
    fastTarget.id = 'route-fastest';
    fastTarget.isRecommended = false;

    prevFast.type = tempType;
    prevFast.label = tempLabel;
    prevFast.id = tempId;
    prevFast.isRecommended = tempRec;
  }

  return cloned;
}

/**
 * Calculates routes independent of the map rendering library.
 * Uses persistent 15-minute cache + in-flight request deduplication.
 */
export async function calculateSmartRoutesCached(
  params: CalculateRoutesParams,
  signal?: AbortSignal
): Promise<{ routes: SmartRouteOption[]; note?: string }> {
  const normStart = ensureLatLngOrder(params.startLat, params.startLng);
  const normEnd = ensureLatLngOrder(params.endLat, params.endLng);

  const normalizedParams: CalculateRoutesParams = {
    ...params,
    startLat: normStart.lat,
    startLng: normStart.lng,
    endLat: normEnd.lat,
    endLng: normEnd.lng,
  };

  const key = [
    'routes_v3',
    normalizedParams.startLat.toFixed(5),
    normalizedParams.startLng.toFixed(5),
    normalizedParams.endLat.toFixed(5),
    normalizedParams.endLng.toFixed(5),
    normalizedParams.mode,
    normalizedParams.isNightJourney ? 'night' : 'day',
    Object.values(normalizedParams.weights).join('-'),
  ].join(':');

  const cached = getCached<{ routes: SmartRouteOption[]; note?: string }>(key);
  if (cached && cached.routes.length > 0) {
    return {
      ...cached,
      routes: enforceClientRouteClassificationInvariants(cached.routes),
    };
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<{ routes: SmartRouteOption[]; note?: string }>;
  }

  const reqPromise = (async () => {
    try {
      const res = await fetch('/api/gis/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedParams),
        signal,
      });

      if (!res.ok) {
        throw new Error(`Routing HTTP ${res.status}`);
      }

      const data = await res.json();
      const validatedRoutes = enforceClientRouteClassificationInvariants(
        (data.routes || []) as SmartRouteOption[]
      );

      const result = {
        routes: validatedRoutes,
        note: data.note as string | undefined,
      };

      if (result.routes.length > 0) {
        setCached(key, result, 15 * 60 * 1000);
      }
      return result;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, reqPromise);
  return reqPromise;
}

/**
 * Fetches City Intelligence POIs with 15-minute persistent cache.
 */
export async function fetchCityPoisCached(): Promise<CityPoi[]> {
  const cacheKey = 'city_pois_all';
  const cached = getCached<CityPoi[]>(cacheKey);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const res = await fetch('/api/gis/pois');
    if (res.ok) {
      const data = await res.json();
      if (data.pois?.length) {
        setCached(cacheKey, data.pois, 15 * 60 * 1000);
        return data.pois;
      }
    }
  } catch {
    // Fallback to verified baseline
  }
  return VERIFIED_CHANDIGARH_MOHALI_POIS;
}

export function getHistoricalCrimeData(): HistoricalCrimeRecord[] {
  return HISTORICAL_CRIME_DATABASE;
}

export function getSavedLocations(): SavedLocation[] {
  try {
    const raw = localStorage.getItem(SAVED_LOCATIONS_KEY);
    if (raw) {
      return JSON.parse(raw) as SavedLocation[];
    }
  } catch {
    // Ignore read error
  }
  return [
    {
      id: 'saved-1',
      label: 'Sector 17 Plaza',
      address: 'Sector 17E, Chandigarh',
      latitude: 30.7411,
      longitude: 76.7834,
      category: 'work',
    },
    {
      id: 'saved-2',
      label: 'PGIMER Emergency Gate',
      address: 'Madhya Marg, Sector 12, Chandigarh',
      latitude: 30.7649,
      longitude: 76.7752,
      category: 'emergency',
    },
    {
      id: 'saved-3',
      label: 'CGC University Mohali',
      address: 'Sector 112, Landran, SAS Nagar (Mohali)',
      latitude: 30.6869,
      longitude: 76.6634,
      category: 'university',
    },
  ];
}

export function saveUserLocationBookmark(loc: Omit<SavedLocation, 'id'>): SavedLocation[] {
  const current = getSavedLocations();
  const next: SavedLocation[] = [
    {
      ...loc,
      id: `loc_${Date.now()}`,
    },
    ...current,
  ];
  try {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(next));
  } catch {
    // Ignore write error
  }
  return next;
}

export function removeUserLocationBookmark(id: string): SavedLocation[] {
  const next = getSavedLocations().filter((l) => l.id !== id);
  try {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(next));
  } catch {
    // Ignore write error
  }
  return next;
}
