import {
  CityPoi,
  MapLayerCategory,
  ResolvedLocation,
  SmartRouteOption,
  TravelMode,
} from '../types/urbanshield.ts';
import {
  VERIFIED_CHANDIGARH_MOHALI_POIS,
  DOCUMENTED_CCTV_COVERAGE_ZONES,
  DOCUMENTED_STREETLIGHT_CORRIDORS,
  haversineDistanceKm,
} from '../data/chandigarhMohaliBaseline.ts';
import {
  getAllHistoricalCrimeRecords,
  computeRouteCrimeExposure,
} from './historicalCrimeService.ts';

const ATTRIBUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';

export function getGoogleMapsApiKey(): string {
  return (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_PLATFORM_API_KEY ||
    ''
  ).trim();
}

/**
 * Standard Google Polyline Algorithm Decoder
 * Returns array of [lng, lat] coordinates for GeoJSON / Polyline compatibility
 */
export function decodeEncodedPolyline(encoded: string): [number, number][] {
  const poly: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index <= len);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && index <= len);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    poly.push([lng / 1e5, lat / 1e5]);
  }
  return poly;
}

/**
 * Normalizes a Chandigarh / Mohali location query so partial queries like
 * "Sector 17", "Phase 8", "CGC University", "Airport Road" resolve accurately
 * within the Chandigarh-Mohali-Tricity region.
 */
export function normalizeChandigarhMohaliQuery(raw: string): string {
  const clean = raw.trim();
  const lower = clean.toLowerCase();

  // Common Tricity aliases to ensure unambiguous geocoding
  if (lower.includes('cgc') && !lower.includes('landran')) {
    return `${clean}, Landran, Mohali, Punjab, India`;
  }
  if (lower === 'chandigarh university' || lower.includes('chandigarh university')) {
    if (!lower.includes('gharuan') && !lower.includes('mohali')) {
      return `${clean}, NH-05 Gharuan, Mohali, Punjab, India`;
    }
  }
  if (lower.includes('phase ') && !lower.includes('mohali') && !lower.includes('industrial')) {
    return `${clean}, SAS Nagar Mohali, Punjab, India`;
  }
  if (
    lower.includes('chandigarh') ||
    lower.includes('mohali') ||
    lower.includes('sas nagar') ||
    lower.includes('kharar') ||
    lower.includes('landran') ||
    lower.includes('zirakpur') ||
    lower.includes('panchkula')
  ) {
    return lower.includes('india') ? clean : `${clean}, India`;
  }
  return `${clean}, Chandigarh Mohali, India`;
}

function isWithinTricityBounds(lat: number, lng: number): boolean {
  return lat >= 30.45 && lat <= 30.95 && lng >= 76.40 && lng <= 77.05;
}

export interface SearchLocationResult {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  type: string;
  source: string;
  quotaExceeded?: boolean;
}

/**
 * Searches locations using Google Places API (New) Text Search + Google Geocoding API
 * with fallback to OpenStreetMap Nominatim if quota is exhausted.
 */
export async function searchLocationsGoogleAndOsm(
  query: string,
  limit = 6
): Promise<{ results: SearchLocationResult[]; quotaExceeded: boolean }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { results: [], quotaExceeded: false };

  const normalizedQuery = normalizeChandigarhMohaliQuery(cleanQuery);
  const apiKey = getGoogleMapsApiKey();
  let quotaExceeded = false;

  // 1. Try Google Places API (New) Text Search
  if (apiKey) {
    try {
      const placesResp = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.types',
        },
        body: JSON.stringify({
          textQuery: normalizedQuery,
          maxResultCount: limit,
          locationBias: {
            circle: {
              center: { latitude: 30.7233, longitude: 76.7550 },
              radius: 38000.0,
            },
          },
          internalUsageAttributionIds: [ATTRIBUTION_ID],
        }),
      });

      if (placesResp.status === 429) {
        quotaExceeded = true;
      } else if (placesResp.ok) {
        const data = (await placesResp.json()) as {
          places?: Array<{
            id?: string;
            displayName?: { text?: string };
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
            types?: string[];
          }>;
          error?: { status?: string };
        };
        if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
          quotaExceeded = true;
        } else if (data.places && data.places.length > 0) {
          const valid = data.places
            .filter(
              (p) =>
                typeof p.location?.latitude === 'number' &&
                typeof p.location?.longitude === 'number' &&
                isWithinTricityBounds(p.location.latitude, p.location.longitude)
            )
            .map((p, idx) => ({
              id: p.id || `gplace-${idx}`,
              name: p.displayName?.text || p.formattedAddress?.split(',')[0] || cleanQuery,
              address: p.formattedAddress || `${cleanQuery}, Chandigarh / Mohali`,
              latitude: p.location!.latitude!,
              longitude: p.location!.longitude!,
              type: p.types?.[0] || 'establishment',
              source: 'Google Places API (New)',
            }));

          if (valid.length > 0) {
            return { results: valid.slice(0, limit), quotaExceeded };
          }
        }
      } else {
        const errBody = await placesResp.json().catch(() => ({}));
        if ((errBody as any)?.error?.status === 'RESOURCE_EXHAUSTED') {
          quotaExceeded = true;
        }
      }
    } catch {
      // Fall through to Google Geocoding API
    }

    // 2. Try Google Geocoding API REST Endpoint
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        normalizedQuery
      )}&bounds=30.50,76.45|30.90,77.00&region=in&key=${encodeURIComponent(
        apiKey
      )}&solution_id=${ATTRIBUTION_ID}`;

      const geoResp = await fetch(geoUrl);
      if (geoResp.status === 429) {
        quotaExceeded = true;
      } else if (geoResp.ok) {
        const geoData = (await geoResp.json()) as {
          status?: string;
          results?: Array<{
            place_id?: string;
            formatted_address?: string;
            geometry?: { location?: { lat?: number; lng?: number } };
            types?: string[];
          }>;
        };

        if (geoData.status === 'OVER_QUERY_LIMIT') {
          quotaExceeded = true;
        } else if (geoData.results && geoData.results.length > 0) {
          const validGeo = geoData.results
            .filter(
              (r) =>
                typeof r.geometry?.location?.lat === 'number' &&
                typeof r.geometry?.location?.lng === 'number' &&
                isWithinTricityBounds(r.geometry.location.lat, r.geometry.location.lng)
            )
            .map((r, idx) => ({
              id: r.place_id || `ggeo-${idx}`,
              name: r.formatted_address?.split(',')[0] || cleanQuery,
              address: r.formatted_address || `${cleanQuery}, Chandigarh / Mohali`,
              latitude: r.geometry!.location!.lat!,
              longitude: r.geometry!.location!.lng!,
              type: r.types?.[0] || 'geocode',
              source: 'Google Geocoding API',
            }));

          if (validGeo.length > 0) {
            return { results: validGeo.slice(0, limit), quotaExceeded };
          }
        }
      }
    } catch {
      // Fall through to Nominatim
    }
  }

  // 3. Fallback to OpenStreetMap Nominatim (bounded to Tricity)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      normalizedQuery
    )}&viewbox=76.45,30.92,77.00,30.50&bounded=0&limit=${limit}&addressdetails=1`;

    const nomResp = await fetch(nomUrl, {
      headers: {
        'User-Agent': 'UrbanShield-CitySafety-GIS/2.0',
        Accept: 'application/json',
      },
    });

    if (nomResp.ok) {
      const nomData = (await nomResp.json()) as Array<{
        place_id: number;
        display_name: string;
        lat: string;
        lon: string;
        type?: string;
      }>;

      const filteredNom = nomData
        .map((item) => ({
          id: `nom-${item.place_id}`,
          name: item.display_name.split(',')[0].trim(),
          address: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
          type: item.type || 'location',
          source: 'OpenStreetMap Nominatim',
        }))
        .filter((item) => isWithinTricityBounds(item.latitude, item.longitude));

      if (filteredNom.length > 0) {
        return { results: filteredNom.slice(0, limit), quotaExceeded };
      }
    }
  } catch {
    // Fall through to baseline lookup
  }

  // 4. Check verified baseline POIs if query matches a facility name
  const qLower = cleanQuery.toLowerCase();
  const poiMatches = VERIFIED_CHANDIGARH_MOHALI_POIS.filter(
    (p) =>
      p.name.toLowerCase().includes(qLower) ||
      (p.address && p.address.toLowerCase().includes(qLower))
  ).map((p) => ({
    id: p.id,
    name: p.name,
    address: p.address || `${p.name}, Chandigarh/Mohali`,
    latitude: p.latitude,
    longitude: p.longitude,
    type: p.category,
    source: p.source,
  }));

  return { results: poiMatches.slice(0, limit), quotaExceeded };
}

/**
 * Resolves a single origin or destination string dynamically to accurate coordinates.
 */
export async function resolveLocationDynamic(
  query: string
): Promise<{ location: ResolvedLocation | null; quotaExceeded: boolean }> {
  const { results, quotaExceeded } = await searchLocationsGoogleAndOsm(query, 3);
  if (results.length > 0) {
    const top = results[0];
    let displayName = top.name
      .replace(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*,?\s*/i, '')
      .trim();
    if (
      !displayName ||
      /^(state highway|nh\s*\d+|unnamed road|chandigarh|mohali)$/i.test(displayName)
    ) {
      displayName = query.trim();
    }
    return {
      location: {
        name: displayName,
        address: top.address,
        latitude: top.latitude,
        longitude: top.longitude,
        placeId: top.id,
        source: top.source,
      },
      quotaExceeded,
    };
  }
  return { location: null, quotaExceeded };
}

/**
 * Fetches nearby essential and commercial places from Google Places API (New) (`places:searchNearby`)
 */
let cachedGooglePlacesPois: CityPoi[] = [];
let lastGooglePlacesFetch = 0;

export async function fetchGoogleNearbyPois(
  lat = 30.7280,
  lng = 76.7650,
  radiusMeters = 8500
): Promise<{ pois: CityPoi[]; quotaExceeded: boolean }> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return { pois: [], quotaExceeded: false };
  }

  if (
    Date.now() - lastGooglePlacesFetch < 10 * 60 * 1000 &&
    cachedGooglePlacesPois.length > 0
  ) {
    return { pois: cachedGooglePlacesPois, quotaExceeded: false };
  }

  let quotaExceeded = false;
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.regularOpeningHours,places.nationalPhoneNumber',
      },
      body: JSON.stringify({
        includedTypes: [
          'hospital',
          'police',
          'pharmacy',
          'gas_station',
          'restaurant',
          'shopping_mall',
          'bus_station',
          'train_station',
          'university',
        ],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: Math.min(radiusMeters, 25000),
          },
        },
        internalUsageAttributionIds: [ATTRIBUTION_ID],
      }),
    });

    if (response.status === 429) {
      return { pois: cachedGooglePlacesPois, quotaExceeded: true };
    }

    if (response.ok) {
      const data = (await response.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          types?: string[];
          regularOpeningHours?: { weekdayDescriptions?: string[]; openNow?: boolean };
          nationalPhoneNumber?: string;
        }>;
        error?: { status?: string };
      };

      if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
        return { pois: cachedGooglePlacesPois, quotaExceeded: true };
      }

      const mapped: CityPoi[] = [];
      for (const p of data.places || []) {
        if (
          typeof p.location?.latitude !== 'number' ||
          typeof p.location?.longitude !== 'number'
        ) {
          continue;
        }
        const types = p.types || [];
        let category: MapLayerCategory = 'shop';
        if (types.includes('hospital') || types.includes('doctor')) category = 'hospital';
        else if (types.includes('police')) category = 'police';
        else if (types.includes('pharmacy') || types.includes('drugstore')) category = 'pharmacy';
        else if (types.includes('gas_station')) category = 'fuel';
        else if (types.includes('restaurant') || types.includes('cafe')) category = 'restaurant';
        else if (
          types.includes('bus_station') ||
          types.includes('train_station') ||
          types.includes('transit_station')
        ) {
          category = 'transport';
        } else if (types.includes('university') || types.includes('school')) {
          category = 'education';
        }

        const hoursText =
          p.regularOpeningHours?.weekdayDescriptions?.[0] ||
          (typeof p.regularOpeningHours?.openNow === 'boolean'
            ? p.regularOpeningHours.openNow
              ? 'Open now (Google Places)'
              : 'Closed now (Google Places)'
            : undefined);

        mapped.push({
          id: `gplace-${p.id || Math.random().toString(36).slice(2, 8)}`,
          name: p.displayName?.text || 'Verified Facility',
          category,
          latitude: p.location.latitude,
          longitude: p.location.longitude,
          address: p.formattedAddress,
          phone: p.nationalPhoneNumber,
          openingHours: hoursText,
          source: 'Google Places API (New)',
          verified: true,
        });
      }

      if (mapped.length > 0) {
        cachedGooglePlacesPois = mapped;
        lastGooglePlacesFetch = Date.now();
      }
      return { pois: mapped, quotaExceeded };
    } else {
      const errJson = await response.json().catch(() => ({}));
      if ((errJson as any)?.error?.status === 'RESOURCE_EXHAUSTED') {
        quotaExceeded = true;
      }
    }
  } catch {
    // Return cached POIs
  }

  return { pois: cachedGooglePlacesPois, quotaExceeded };
}

interface RawComputedRoute {
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][]; // [lng, lat]
  summaryRoads: string;
  provider: 'Google Routes API' | 'OSRM Road Network';
}

/**
 * Calls Google Routes API v2 (`routes.googleapis.com/directions/v2:computeRoutes`)
 */
async function callGoogleRoutesApiV2(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  mode: TravelMode,
  intermediateWaypoint?: { lat: number; lng: number }
): Promise<{ routes: RawComputedRoute[]; quotaExceeded: boolean }> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return { routes: [], quotaExceeded: false };

  let quotaExceeded = false;
  const travelModeMap: Record<TravelMode, string> = {
    car: 'DRIVE',
    foot: 'WALK',
    bike: 'BICYCLE',
  };

  const requestTravelMode = travelModeMap[mode] || 'DRIVE';

  const bodyPayload: Record<string, unknown> = {
    origin: {
      location: {
        latLng: { latitude: startLat, longitude: startLng },
      },
    },
    destination: {
      location: {
        latLng: { latitude: endLat, longitude: endLng },
      },
    },
    travelMode: requestTravelMode,
    computeAlternativeRoutes: !intermediateWaypoint,
    languageCode: 'en-US',
    units: 'METRIC',
  };

  if (requestTravelMode === 'DRIVE') {
    bodyPayload.routingPreference = 'TRAFFIC_AWARE';
  }

  if (intermediateWaypoint) {
    bodyPayload.intermediates = [
      {
        location: {
          latLng: {
            latitude: intermediateWaypoint.lat,
            longitude: intermediateWaypoint.lng,
          },
        },
        via: true,
      },
    ];
  }

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-Maps-Solution-ID': ATTRIBUTION_ID,
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.routeLabels,routes.legs.steps.navigationInstruction',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (response.status === 429) {
      return { routes: [], quotaExceeded: true };
    }

    if (response.ok) {
      const data = (await response.json()) as {
        routes?: Array<{
          distanceMeters?: number;
          duration?: string;
          description?: string;
          polyline?: { encodedPolyline?: string };
          legs?: Array<{
            steps?: Array<{
              navigationInstruction?: { instructions?: string };
            }>;
          }>;
        }>;
        error?: { status?: string };
      };

      if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
        return { routes: [], quotaExceeded: true };
      }

      const parsed: RawComputedRoute[] = [];
      for (const r of data.routes || []) {
        const encoded = r.polyline?.encodedPolyline;
        if (!encoded) continue;
        const coords = decodeEncodedPolyline(encoded);
        if (coords.length < 2) continue;

        const durSec = r.duration ? parseInt(r.duration.replace('s', ''), 10) || 600 : 600;
        const distMeters = r.distanceMeters || 1000;

        let roadDesc = r.description || '';
        if (!roadDesc && r.legs?.[0]?.steps) {
          const stepNames = r.legs[0].steps
            .map((s) => s.navigationInstruction?.instructions || '')
            .filter(Boolean)
            .slice(0, 3)
            .join(' → ');
          roadDesc = stepNames || 'Chandigarh-Mohali Arterial Road Network';
        }

        parsed.push({
          distanceMeters: distMeters,
          durationSeconds: durSec,
          geometry: coords,
          summaryRoads: roadDesc || 'Chandigarh-Mohali Arterial Corridor',
          provider: 'Google Routes API',
        });
      }

      if (parsed.length > 0) {
        return { routes: parsed, quotaExceeded: false };
      }

      // If BICYCLE mode returned 0 routes in Google Routes API for India, retry with DRIVE geometry and adjust cycling speed
      if (mode === 'bike') {
        const driveFallback = await callGoogleRoutesApiV2(
          startLat,
          startLng,
          endLat,
          endLng,
          'car',
          intermediateWaypoint
        );
        return {
          routes: driveFallback.routes.map((rt) => ({
            ...rt,
            durationSeconds: Math.max(60, Math.round((rt.distanceMeters / 1000 / 16.5) * 3600)),
          })),
          quotaExceeded: driveFallback.quotaExceeded,
        };
      }
    } else {
      const errJson = await response.json().catch(() => ({}));
      if ((errJson as any)?.error?.status === 'RESOURCE_EXHAUSTED') {
        quotaExceeded = true;
      }
    }
  } catch {
    // Fallback handled by caller
  }

  return { routes: [], quotaExceeded };
}

/**
 * Fallback real road-network routing via OSRM if Google Routes API quota is exceeded
 */
async function callOsrmRoadNetwork(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  mode: TravelMode,
  intermediateWaypoint?: { lat: number; lng: number }
): Promise<RawComputedRoute[]> {
  const osrmProfile = mode === 'foot' ? 'foot' : mode === 'bike' ? 'bike' : 'driving';
  const waypoints = intermediateWaypoint
    ? `${startLng},${startLat};${intermediateWaypoint.lng},${intermediateWaypoint.lat};${endLng},${endLat}`
    : `${startLng},${startLat};${endLng},${endLat}`;
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${waypoints}?overview=full&geometries=geojson&alternatives=${
    intermediateWaypoint ? 'false' : 'true'
  }&steps=true`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = (await resp.json()) as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs?: Array<{ summary?: string }>;
      }>;
    };

    const speedMultiplier = mode === 'foot' ? 4.8 : mode === 'bike' ? 16.5 : 34;
    return (data.routes || [])
      .filter((r) => r.geometry?.coordinates?.length >= 2)
      .map((r) => ({
        distanceMeters: Math.round(r.distance),
        durationSeconds:
          mode === 'car'
            ? Math.round(r.duration)
            : Math.max(60, Math.round((r.distance / 1000 / speedMultiplier) * 3600)),
        geometry: r.geometry.coordinates,
        summaryRoads:
          r.legs?.map((l) => l.summary).filter(Boolean).join(' / ') ||
          'Chandigarh-Mohali Road Network',
        provider: 'OSRM Road Network' as const,
      }));
  } catch {
    return [];
  }
}

/**
 * Computes real route alternatives using Google Routes API v2 + real POI scoring
 * along each route's actual decoded road polyline.
 */
export async function computeSmartRoutesWithGoogleMaps(params: {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  mode: TravelMode;
  corridorRadiusKm?: number;
  weights?: {
    establishments: number;
    mainRoads: number;
    emergencyServices: number;
    transport: number;
    streetlights: number;
  };
  allPois: CityPoi[];
}): Promise<{
  routes: SmartRouteOption[];
  nearbyAlongRoutes: CityPoi[];
  quotaExceeded: boolean;
}> {
  const {
    startLat,
    startLng,
    endLat,
    endLng,
    mode,
    corridorRadiusKm = 1.2,
    weights,
    allPois,
  } = params;

  const rawWeights = weights || {
    establishments: 30,
    mainRoads: 25,
    emergencyServices: 20,
    transport: 15,
    streetlights: 10,
  };
  const totalWeight =
    rawWeights.establishments +
      rawWeights.mainRoads +
      rawWeights.emergencyServices +
      rawWeights.transport +
      rawWeights.streetlights || 100;

  const normWeights = {
    establishments: Math.round((rawWeights.establishments / totalWeight) * 100),
    mainRoads: Math.round((rawWeights.mainRoads / totalWeight) * 100),
    emergencyServices: Math.round((rawWeights.emergencyServices / totalWeight) * 100),
    transport: Math.round((rawWeights.transport / totalWeight) * 100),
    streetlights: Math.round((rawWeights.streetlights / totalWeight) * 100),
  };

  // Select the most relevant active commercial/hospital hub near the midpoint of the journey
  const midLat = (startLat + endLat) / 2;
  const midLng = (startLng + endLng) / 2;
  const activeHubs = [
    { name: 'Sector 17 Commercial Plaza & Madhya Marg', lat: 30.7411, lng: 76.7834 },
    { name: 'Sector 35C Himalaya Marg Commercial Hub', lat: 30.7253, lng: 76.7608 },
    { name: 'Phase 3B2 / Phase 7 Mohali Main Commercial Corridor', lat: 30.7138, lng: 76.7242 },
    { name: 'Phase 8 / Fortis Hospital Sector 62 Corridor, Mohali', lat: 30.6955, lng: 76.7315 },
    { name: 'Sector 32 GMCH & Dakshin Marg Hub', lat: 30.7076, lng: 76.7794 },
    { name: 'Phase 6 Max Hospital / Chandigarh-Kharar Highway Hub', lat: 30.7364, lng: 76.7176 },
  ];

  // Pick a hub that isn't identical to origin or destination
  const candidateHubs = activeHubs
    .filter(
      (h) =>
        haversineDistanceKm(startLat, startLng, h.lat, h.lng) > 0.6 &&
        haversineDistanceKm(endLat, endLng, h.lat, h.lng) > 0.6
    )
    .sort(
      (a, b) =>
        haversineDistanceKm(midLat, midLng, a.lat, a.lng) -
        haversineDistanceKm(midLat, midLng, b.lat, b.lng)
    );
  const chosenHub = candidateHubs[0] || activeHubs[0];

  // Fetch nearby places around midpoint from Google Places API (New) to enrich POIs along the corridor
  const { pois: googleMidPois, quotaExceeded: placesQuota } = await fetchGoogleNearbyPois(
    midLat,
    midLng,
    Math.max(4500, Math.min(20000, haversineDistanceKm(startLat, startLng, endLat, endLng) * 700))
  );

  const combinedPois: CityPoi[] = [...allPois];
  for (const gp of googleMidPois) {
    const exists = combinedPois.some(
      (p) =>
        p.category === gp.category &&
        haversineDistanceKm(p.latitude, p.longitude, gp.latitude, gp.longitude) < 0.09
    );
    if (!exists) combinedPois.push(gp);
  }

  // 1. Primary + Alternative Routes from Google Routes API v2
  const [primaryGoogle, hubGoogle] = await Promise.all([
    callGoogleRoutesApiV2(startLat, startLng, endLat, endLng, mode),
    callGoogleRoutesApiV2(startLat, startLng, endLat, endLng, mode, {
      lat: chosenHub.lat,
      lng: chosenHub.lng,
    }),
  ]);

  let quotaExceeded = placesQuota || primaryGoogle.quotaExceeded || hubGoogle.quotaExceeded;
  let candidateRoutes: RawComputedRoute[] = [...primaryGoogle.routes];

  if (hubGoogle.routes.length > 0) {
    const hubRt = hubGoogle.routes[0];
    candidateRoutes.push({
      ...hubRt,
      summaryRoads: `${hubRt.summaryRoads} (via ${chosenHub.name})`,
    });
  }

  // If Google Routes API returned fewer than 2 routes, supplement with real road routes from OSRM
  if (candidateRoutes.length < 2) {
    const [osrmDirect, osrmHub] = await Promise.all([
      callOsrmRoadNetwork(startLat, startLng, endLat, endLng, mode),
      callOsrmRoadNetwork(startLat, startLng, endLat, endLng, mode, {
        lat: chosenHub.lat,
        lng: chosenHub.lng,
      }),
    ]);
    for (const r of osrmDirect) candidateRoutes.push(r);
    if (osrmHub.length > 0) {
      candidateRoutes.push({
        ...osrmHub[0],
        summaryRoads: `${osrmHub[0].summaryRoads} (via ${chosenHub.name})`,
      });
    }
  }

  // Deduplicate routes so identical road geometries are not repeated
  const uniqueRawRoutes: RawComputedRoute[] = [];
  for (const rt of candidateRoutes) {
    if (rt.geometry.length < 2) continue;
    const isDuplicate = uniqueRawRoutes.some(
      (u) =>
        Math.abs(u.distanceMeters - rt.distanceMeters) < 90 &&
        Math.abs(u.durationSeconds - rt.durationSeconds) < 25
    );
    if (!isDuplicate) {
      uniqueRawRoutes.push(rt);
    }
  }

  // If we still only have 1 or 2 routes, try a secondary arterial hub so all 3 route options use real road polylines
  if (uniqueRawRoutes.length < 3 && candidateHubs.length > 1) {
    const secondHub = candidateHubs[1];
    const secondHubGoogle = await callGoogleRoutesApiV2(
      startLat,
      startLng,
      endLat,
      endLng,
      mode,
      { lat: secondHub.lat, lng: secondHub.lng }
    );
    const extraRoutes =
      secondHubGoogle.routes.length > 0
        ? secondHubGoogle.routes
        : await callOsrmRoadNetwork(startLat, startLng, endLat, endLng, mode, {
            lat: secondHub.lat,
            lng: secondHub.lng,
          });
    if (extraRoutes.length > 0) {
      const candidate = {
        ...extraRoutes[0],
        summaryRoads: `${extraRoutes[0].summaryRoads} (via ${secondHub.name})`,
      };
      const isDup = uniqueRawRoutes.some(
        (u) => Math.abs(u.distanceMeters - candidate.distanceMeters) < 90
      );
      if (!isDup) uniqueRawRoutes.push(candidate);
    }
  }

  const allNearbyMatchedMap = new Map<string, CityPoi>();
  const allCrimeRecords = await getAllHistoricalCrimeRecords().catch(() => []);

  function scoreRawRoute(raw: RawComputedRoute, idx: number) {
    const coords = raw.geometry;
    const step = Math.max(1, Math.floor(coords.length / 36));
    const sampled = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);

    const matchedIds = new Set<string>();
    const routePois: CityPoi[] = [];
    const counts = {
      hospitals: 0,
      police: 0,
      pharmacies: 0,
      activeEstablishments: 0,
      transportStops: 0,
      streetlights: 0,
    };

    let verifiedStreetlightNodes = 0;
    let verifiedCctvJunctions = 0;
    let estimatedTotalJunctionCameras = 0;

    for (const poi of combinedPois) {
      for (const [lng, lat] of sampled) {
        if (haversineDistanceKm(lat, lng, poi.latitude, poi.longitude) <= 0.65) {
          if (!matchedIds.has(poi.id)) {
            matchedIds.add(poi.id);
            routePois.push(poi);
            allNearbyMatchedMap.set(poi.id, poi);
            if (poi.category === 'hospital') counts.hospitals++;
            else if (poi.category === 'police') counts.police++;
            else if (poi.category === 'pharmacy') counts.pharmacies++;
            else if (
              poi.category === 'restaurant' ||
              poi.category === 'shop' ||
              poi.category === 'fuel'
            ) {
              counts.activeEstablishments++;
            } else if (poi.category === 'transport') counts.transportStops++;
            else if (poi.category === 'streetlight' || poi.category === 'streetlight_corridor') {
              counts.streetlights++;
              if (poi.category === 'streetlight') verifiedStreetlightNodes++;
            } else if (poi.category === 'cctv' || poi.category === 'cctv_zone') {
              counts.streetlights++;
              if (poi.category === 'cctv') {
                verifiedCctvJunctions++;
                estimatedTotalJunctionCameras += poi.cameraCount || 1;
              }
            }
          }
          break;
        }
      }
    }

    // Check intersection with Documented Streetlight Corridors & Unknown Lighting Zones
    const documentedLightingCorridorsMatched: string[] = [];
    let unknownLightingMatches = 0;
    for (const corr of DOCUMENTED_STREETLIGHT_CORRIDORS) {
      let matched = false;
      for (const [cLng, cLat] of corr.pathCoords) {
        for (const [rLng, rLat] of sampled) {
          if (haversineDistanceKm(rLat, rLng, cLat, cLng) <= 0.75) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) {
        if (corr.coverageType === 'unknown_lighting_zone') {
          unknownLightingMatches++;
        } else {
          documentedLightingCorridorsMatched.push(corr.name);
        }
      }
    }

    // Check intersection with Documented CCTV Surveillance Zones & Unknown CCTV Zones
    const documentedSurveillanceZonesMatched: string[] = [];
    let unknownCctvMatches = 0;
    for (const zone of DOCUMENTED_CCTV_COVERAGE_ZONES) {
      let matched = false;
      for (const [rLng, rLat] of sampled) {
        if (
          haversineDistanceKm(rLat, rLng, zone.centerLat, zone.centerLng) <=
          zone.radiusMeters / 1000
        ) {
          matched = true;
          break;
        }
      }
      if (matched) {
        if (zone.coverageType === 'unknown_coverage_zone') {
          unknownCctvMatches++;
        } else {
          documentedSurveillanceZonesMatched.push(zone.name);
        }
      }
    }

    const unknownCoverageSegments = unknownLightingMatches + unknownCctvMatches;

    // Calculate real longest gap between mapped help points along the route polyline
    const helpPois = routePois.filter(
      (p) =>
        p.category === 'hospital' ||
        p.category === 'police' ||
        p.category === 'pharmacy' ||
        p.category === 'fuel' ||
        p.category === 'restaurant' ||
        p.category === 'shop'
    );

    let longestGapBetweenHelpPointsKm: number | null = null;
    if (coords.length >= 2) {
      let currentGapKm = 0;
      let maxGapKm = 0;
      for (let i = 1; i < coords.length; i++) {
        const [prevLng, prevLat] = coords[i - 1];
        const [curLng, curLat] = coords[i];
        const segKm = haversineDistanceKm(prevLat, prevLng, curLat, curLng);
        const hasNearbyHelp = helpPois.some(
          (hp) => haversineDistanceKm(curLat, curLng, hp.latitude, hp.longitude) <= 0.55
        );
        if (hasNearbyHelp) {
          if (currentGapKm > maxGapKm) maxGapKm = currentGapKm;
          currentGapKm = 0;
        } else {
          currentGapKm += segKm;
        }
      }
      if (currentGapKm > maxGapKm) maxGapKm = currentGapKm;
      longestGapBetweenHelpPointsKm = Number(Math.max(0.2, maxGapKm).toFixed(1));
    }

    const summaryLower = raw.summaryRoads.toLowerCase();
    const isMajorArterial =
      summaryLower.includes('marg') ||
      summaryLower.includes('nh') ||
      summaryLower.includes('highway') ||
      summaryLower.includes('udyog') ||
      summaryLower.includes('purv') ||
      summaryLower.includes('dakshin') ||
      summaryLower.includes('madhya') ||
      summaryLower.includes('himalaya') ||
      summaryLower.includes('airport') ||
      summaryLower.includes('sh12a') ||
      summaryLower.includes('via ');

    // Determine Epistemic Streetlight & CCTV Score without penalizing unmapped OSM poles
    let streetlightBasis:
      | 'verified_nodes'
      | 'documented_corridor'
      | 'estimated_arterial'
      | 'unknown' = 'estimated_arterial';
    let streetlightExplanation = '';
    let streetlightScore = 72;

    if (documentedLightingCorridorsMatched.length > 0 && verifiedStreetlightNodes > 0) {
      streetlightBasis = 'verified_nodes';
      streetlightScore = Math.min(
        96,
        78 + documentedLightingCorridorsMatched.length * 5 + verifiedStreetlightNodes * 2
      );
      streetlightExplanation = `Backed by ${documentedLightingCorridorsMatched.length} documented municipal LED corridor(s) (${documentedLightingCorridorsMatched
        .slice(0, 2)
        .join(', ')}) and ${verifiedStreetlightNodes} individually mapped OSM lighting node(s).`;
    } else if (documentedLightingCorridorsMatched.length > 0) {
      streetlightBasis = 'documented_corridor';
      streetlightScore = Math.min(92, 76 + documentedLightingCorridorsMatched.length * 5);
      streetlightExplanation = `Backed by documented municipal lighting corridor(s): ${documentedLightingCorridorsMatched.join(
        ', '
      )} (MC Chandigarh / EESL or GMADA records). Individual OSM pole count is not used as a penalty.`;
    } else if (unknownCoverageSegments > 0 && !isMajorArterial) {
      streetlightBasis = 'unknown';
      streetlightScore = 66;
      streetlightExplanation =
        'Parts of this route traverse segments with unverified pole-level lighting records in open municipal registries. Marked as Unknown (not assumed unlit) with reduced data confidence.';
    } else if (isMajorArterial) {
      streetlightBasis = 'estimated_arterial';
      streetlightScore = 75 + (unknownCoverageSegments > 0 ? -5 : 4);
      streetlightExplanation =
        unknownCoverageSegments > 0
          ? 'Estimated from arterial road classification (major junctions illuminated; intermediate semi-urban segments have unverified pole-level open data).'
          : 'Estimated from Chandigarh/Mohali V2/V3 arterial road classification under MC Chandigarh / EESL & GMADA municipal LED deployment.';
    } else {
      streetlightBasis = 'unknown';
      streetlightScore = 68;
      streetlightExplanation =
        'Individual pole-level lighting records are not published for all internal sub-lanes; scored neutrally as Unknown rather than zero.';
    }

    let cctvBasis:
      | 'verified_junctions'
      | 'documented_zone'
      | 'estimated_corridor'
      | 'unknown' = 'unknown';
    let cctvExplanation = '';
    if (verifiedCctvJunctions > 0) {
      cctvBasis = 'verified_junctions';
      cctvExplanation = `Passes ${verifiedCctvJunctions} verified multi-camera CCTV junction(s) (~${estimatedTotalJunctionCameras} directional ANPR/PTZ/RLVD cameras) and ${documentedSurveillanceZonesMatched.length} documented surveillance zone(s).`;
    } else if (documentedSurveillanceZonesMatched.length > 0) {
      cctvBasis = 'documented_zone';
      cctvExplanation = `Intersects documented Smart City / Police surveillance zone(s): ${documentedSurveillanceZonesMatched.join(
        ', '
      )}.`;
    } else {
      cctvBasis = 'unknown';
      cctvExplanation =
        'No multi-camera ICCC junction directly on this segment; individual private/RWA or institutional cameras remain unmapped in public registries (Unknown coverage).';
    }

    // Bonus for verified multi-camera CCTV junctions along route
    if (verifiedCctvJunctions > 0) {
      streetlightScore = Math.min(98, streetlightScore + Math.min(8, verifiedCctvJunctions * 3));
    }

    const mainRoadBias = isMajorArterial ? 88 : 74;
    const totalEst = counts.activeEstablishments + counts.pharmacies;
    const establishmentsScore = Math.min(100, Math.round(36 + totalEst * 10));
    const mainRoadScore = Math.min(
      100,
      Math.max(
        52,
        mainRoadBias +
          documentedLightingCorridorsMatched.length * 3 +
          (idx === 1 ? 4 : 0)
      )
    );
    const emergencyTotal = counts.hospitals + counts.police + counts.pharmacies;
    const emergencyScore = Math.min(100, Math.round(34 + emergencyTotal * 13));
    const transportScore = Math.min(100, Math.round(32 + counts.transportStops * 16));

    const overallScore = Math.round(
      (establishmentsScore * normWeights.establishments +
        mainRoadScore * normWeights.mainRoads +
        emergencyScore * normWeights.emergencyServices +
        transportScore * normWeights.transport +
        streetlightScore * normWeights.streetlights) /
        100
    );

    // Data confidence reflects whether infrastructure is verified/documented vs unknown
    let confidencePercentage = raw.provider === 'Google Routes API' ? 88 : 80;
    if (documentedLightingCorridorsMatched.length > 0 || verifiedCctvJunctions > 0) {
      confidencePercentage += 4;
    }
    if (unknownCoverageSegments > 0) {
      confidencePercentage -= Math.min(14, unknownCoverageSegments * 6);
    }
    if (cctvBasis === 'unknown' && streetlightBasis === 'unknown') {
      confidencePercentage -= 8;
    }
    confidencePercentage = Math.max(58, Math.min(96, confidencePercentage));

    const mainRoadCoveragePercentage = isMajorArterial
      ? Math.min(94, 76 + documentedLightingCorridorsMatched.length * 5)
      : 62;

    const crimeExposure = computeRouteCrimeExposure({
      routeGeometry: coords,
      routeDistanceMeters: raw.distanceMeters,
      allCrimeRecords,
      corridorRadiusKm,
    });

    return {
      raw,
      counts: {
        ...counts,
        streetlights:
          verifiedStreetlightNodes +
          documentedLightingCorridorsMatched.length +
          verifiedCctvJunctions,
      },
      routePois,
      overallScore,
      confidencePercentage,
      longestGapBetweenHelpPointsKm,
      mainRoadCoveragePercentage,
      crimeExposure,
      infrastructureIntelligence: {
        streetlightBasis,
        streetlightExplanation,
        cctvBasis,
        cctvExplanation,
        verifiedStreetlightNodes,
        documentedLightingCorridorsMatched,
        verifiedCctvJunctions,
        estimatedTotalJunctionCameras,
        documentedSurveillanceZonesMatched,
        unknownCoverageSegments,
      },
      factors: {
        establishmentsScore,
        establishmentsCount: totalEst,
        mainRoadScore,
        mainRoadSummary: raw.summaryRoads,
        emergencyScore,
        emergencyCount: emergencyTotal,
        transportScore,
        transportCount: counts.transportStops,
        streetlightScore,
        streetlightCount:
          verifiedStreetlightNodes +
          documentedLightingCorridorsMatched.length +
          verifiedCctvJunctions,
      },
    };
  }

  const scoredCandidates = uniqueRawRoutes.map((r, i) => scoreRawRoute(r, i));

  if (scoredCandidates.length === 0) {
    return { routes: [], nearbyAlongRoutes: [], quotaExceeded };
  }

  // Sort to assign roles accurately from real returned routes:
  // 1. FASTEST ROUTE: lowest durationSeconds
  const byDuration = [...scoredCandidates].sort(
    (a, b) => a.raw.durationSeconds - b.raw.durationSeconds
  );
  const fastestCand = byDuration[0];

  // 2. HIGHER ACTIVITY ROUTE: highest Night Activity Score (preferring distinct route if available)
  const remainingForActivity = scoredCandidates.filter((c) => c !== fastestCand);
  const byActivity = (remainingForActivity.length > 0 ? remainingForActivity : scoredCandidates).sort(
    (a, b) => b.overallScore - a.overallScore
  );
  const activityCand = byActivity[0];

  // 3. BALANCED ROUTE: remaining distinct route or best trade-off between duration and activity score
  const remainingForBalanced = scoredCandidates.filter(
    (c) => c !== fastestCand && c !== activityCand
  );
  const balancedCand =
    remainingForBalanced[0] ||
    (scoredCandidates.length > 1 ? scoredCandidates[1] : scoredCandidates[0]);

  const fastestMins = Math.max(1, Math.round(fastestCand.raw.durationSeconds / 60));
  const fastestEstCount =
    fastestCand.counts.activeEstablishments + fastestCand.counts.pharmacies;

  function buildComparisonQuote(
    cand: ReturnType<typeof scoreRawRoute>,
    type: SmartRouteOption['type']
  ): string {
    const mins = Math.max(1, Math.round(cand.raw.durationSeconds / 60));
    const diffMins = Math.max(0, mins - fastestMins);
    const estTotal = cand.counts.activeEstablishments + cand.counts.pharmacies;
    const emergTotal = cand.counts.hospitals + cand.counts.police + cand.counts.pharmacies;
    const diffEst = estTotal - fastestEstCount;

    if (type === 'fastest') {
      return `Direct path via ${cand.raw.summaryRoads} (${mins} min) with ${estTotal} mapped establishments, ${emergTotal} emergency facilities, and ${cand.infrastructureIntelligence.documentedLightingCorridorsMatched.length} documented lighting corridor(s).`;
    }

    if (type === 'higher_activity') {
      const timePhrase =
        diffMins === 0
          ? 'Same estimated travel time as the fastest route'
          : `Approximately ${diffMins} minute${diffMins === 1 ? '' : 's'} longer than the fastest route`;
      const estPhrase =
        diffEst > 0
          ? `passes through ${diffEst} more mapped commercial establishments (${estTotal} total)`
          : `passes ${estTotal} mapped commercial establishments and ${emergTotal} emergency facilities`;
      return `${timePhrase}, but ${estPhrase} and maintains ${cand.mainRoadCoveragePercentage}% main-road coverage via ${cand.raw.summaryRoads}.`;
    }

    const timePhrase =
      diffMins === 0
        ? 'Matches the fastest travel time'
        : `Approximately ${diffMins} minute${diffMins === 1 ? '' : 's'} slower than the fastest route`;
    return `${timePhrase} while balancing ${estTotal} nearby establishments, ${emergTotal} emergency nodes, and documented arterial road access via ${cand.raw.summaryRoads}.`;
  }

  function buildSmartRouteOption(
    cand: ReturnType<typeof scoreRawRoute>,
    id: string,
    type: SmartRouteOption['type'],
    label: string,
    tagline: string
  ): SmartRouteOption {
    const missingNotes: string[] = [
      cand.infrastructureIntelligence.streetlightExplanation,
      cand.infrastructureIntelligence.cctvExplanation,
    ];
    if (cand.infrastructureIntelligence.unknownCoverageSegments > 0) {
      missingNotes.push(
        `${cand.infrastructureIntelligence.unknownCoverageSegments} corridor segment(s) lack disaggregated pole-level municipal open data and are treated as Unknown (reducing data confidence rather than assuming zero lighting).`
      );
    }

    return {
      id,
      type,
      label,
      tagline,
      comparisonVsFastestText: buildComparisonQuote(cand, type),
      distanceMeters: Math.round(cand.raw.distanceMeters),
      durationSeconds: Math.round(cand.raw.durationSeconds),
      geometry: cand.raw.geometry,
      summaryRoads: cand.raw.summaryRoads,
      nearbyPoisCount: cand.counts,
      nearbyFacilitiesList: cand.routePois.slice(0, 14),
      crimeExposure: cand.crimeExposure,
      trafficStatus:
        cand.raw.provider === 'Google Routes API'
          ? `Calculated via Google Routes API (${mode.toUpperCase()} mode)`
          : `Calculated via OpenStreetMap Road Network (${mode.toUpperCase()} mode)`,
      nightActivity: {
        overallScore: cand.overallScore,
        confidencePercentage: cand.confidencePercentage,
        factors: cand.factors,
        weightsUsed: normWeights,
        longestGapBetweenHelpPointsKm: cand.longestGapBetweenHelpPointsKm,
        mainRoadCoveragePercentage: cand.mainRoadCoveragePercentage,
        infrastructureIntelligence: cand.infrastructureIntelligence,
        missingDataNotes: missingNotes,
      },
    };
  }

  const finalRoutes: SmartRouteOption[] = [
    buildSmartRouteOption(
      fastestCand,
      'route-fastest',
      'fastest',
      'Fastest Route',
      `Shortest travel time (${Math.max(1, Math.round(fastestCand.raw.durationSeconds / 60))} min) via ${fastestCand.raw.summaryRoads}`
    ),
  ];

  if (activityCand !== fastestCand) {
    finalRoutes.push(
      buildSmartRouteOption(
        activityCand,
        'route-activity',
        'higher_activity',
        'Higher Activity Route',
        `Higher nearby commercial & emergency density (${activityCand.overallScore}/100 Activity) via ${activityCand.raw.summaryRoads}`
      )
    );
  }

  if (balancedCand !== fastestCand && balancedCand !== activityCand) {
    finalRoutes.push(
      buildSmartRouteOption(
        balancedCand,
        'route-balanced',
        'balanced',
        'Balanced Route',
        `Balances travel time and arterial road access via ${balancedCand.raw.summaryRoads}`
      )
    );
  }

  return {
    routes: finalRoutes,
    nearbyAlongRoutes: Array.from(allNearbyMatchedMap.values()),
    quotaExceeded,
  };
}
