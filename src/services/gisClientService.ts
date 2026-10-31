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

const STORAGE_PREFIX = 'urbanshield_cache_v2_';
const SAVED_LOCATIONS_KEY = 'urbanshield_saved_locations_v1';

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
}

/**
 * Searches Chandigarh & Mohali locations with local Gazetteer instant matching,
 * persistent caching (24h TTL), and deduplicated Nominatim API requests.
 */
export async function searchLocationsCached(
  query: string,
  signal?: AbortSignal
): Promise<GeocodingSuggestion[]> {
  const clean = query.trim();
  if (!clean) return [];

  const qLower = clean.toLowerCase();
  const localMatches: GeocodingSuggestion[] = CHANDIGARH_MOHALI_GAZETTEER.filter((item) =>
    item.name.toLowerCase().includes(qLower)
  ).map((item) => ({
    ...item,
    source: 'Chandigarh/Mohali Gazetteer' as const,
  }));

  if (clean.length < 3) {
    return localMatches.slice(0, 6);
  }

  const cacheKey = `geocode:${qLower}`;
  const cached = getCached<GeocodingSuggestion[]>(cacheKey);
  if (cached) {
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
        return localMatches;
      }
      const data = await res.json();
      const remoteResults: GeocodingSuggestion[] = (data.results || []).map((r: any) => ({
        id: String(r.id),
        name: r.name,
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        type: r.type || 'location',
        source: 'Nominatim OSM' as const,
      }));

      // Merge local gazetteer matches with Nominatim results without duplicates
      const merged = [...localMatches];
      for (const rem of remoteResults) {
        const isDup = merged.some(
          (m) =>
            Math.abs(m.latitude - rem.latitude) < 0.002 &&
            Math.abs(m.longitude - rem.longitude) < 0.002
        );
        if (!isDup) {
          merged.push(rem);
        }
      }

      const finalSlice = merged.slice(0, 8);
      setCached(cacheKey, finalSlice, 24 * 60 * 60 * 1000); // 24 hour cache
      return finalSlice;
    } catch {
      return localMatches;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestPromise);
  return requestPromise;
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
 * Calculates routes independent of the map rendering library.
 * Uses persistent 15-minute cache + in-flight request deduplication.
 */
export async function calculateSmartRoutesCached(
  params: CalculateRoutesParams,
  signal?: AbortSignal
): Promise<{ routes: SmartRouteOption[]; note?: string }> {
  const key = [
    'routes',
    params.startLat.toFixed(4),
    params.startLng.toFixed(4),
    params.endLat.toFixed(4),
    params.endLng.toFixed(4),
    params.mode,
    params.isNightJourney ? 'night' : 'day',
    Object.values(params.weights).join('-'),
  ].join(':');

  const cached = getCached<{ routes: SmartRouteOption[]; note?: string }>(key);
  if (cached && cached.routes.length > 0) {
    return cached;
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<{ routes: SmartRouteOption[]; note?: string }>;
  }

  const reqPromise = (async () => {
    try {
      const res = await fetch('/api/gis/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal,
      });

      if (!res.ok) {
        throw new Error(`Routing HTTP ${res.status}`);
      }

      const data = await res.json();
      const result = {
        routes: (data.routes || []) as SmartRouteOption[],
        note: data.note as string | undefined,
      };

      if (result.routes.length > 0) {
        setCached(key, result, 15 * 60 * 1000); // 15 minute cache
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
