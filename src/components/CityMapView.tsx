import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Navigation,
  MapPin,
  Phone,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Crosshair,
  SlidersHorizontal,
  X,
  Camera,
  Lightbulb,
} from 'lucide-react';
import {
  CityPoi,
  CommunityReport,
  MapLayerCategory,
  SosIncident,
} from '../types/urbanshield.ts';
import { InteractiveCityMap, CATEGORY_STYLE_MAP } from './InteractiveCityMap.tsx';
import { haversineDistanceKm } from '../data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';
import {
  GeocodingSuggestion,
  searchLocationsCached,
} from '../services/gisClientService.ts';

interface CityMapViewProps {
  userLocation: { lat: number; lng: number };
  onRequestBrowserLocation: () => void;
  pois: CityPoi[];
  reports: CommunityReport[];
  sosIncidents: SosIncident[];
  onNavigateToPoi: (poi: CityPoi) => void;
}

export const LAYER_DEFINITIONS: Array<{
  id: MapLayerCategory;
  label: string;
  colorHex: string;
}> = [
  { id: 'hospital', label: 'Hospitals', colorHex: '#EF4444' },
  { id: 'clinic', label: 'Clinics', colorHex: '#F87171' },
  { id: 'pharmacy', label: 'Pharmacies', colorHex: '#10B981' },
  { id: 'police', label: 'Police Stations', colorHex: '#3B82F6' },
  { id: 'fuel', label: 'Petrol Pumps', colorHex: '#F59E0B' },
  { id: 'restaurant', label: 'Restaurants', colorHex: '#F97316' },
  { id: 'cafe', label: 'Cafes', colorHex: '#FB923C' },
  { id: 'shop', label: 'Shops', colorHex: '#A855F7' },
  { id: 'transport', label: 'Public Transport', colorHex: '#00D2FF' },
  { id: 'education', label: 'Educational', colorHex: '#6366F1' },
  { id: 'cctv', label: 'CCTV Infrastructure', colorHex: '#14B8A6' },
  { id: 'streetlight', label: 'Streetlights', colorHex: '#FACC15' },
  { id: 'incident', label: 'Community Reports', colorHex: '#E11D48' },
  { id: 'crime_hotspot', label: 'Historical Crime Hotspots', colorHex: '#DC2626' },
];

export const CityMapView: React.FC<CityMapViewProps> = ({
  userLocation,
  onRequestBrowserLocation,
  pois,
  reports,
  sosIncidents,
  onNavigateToPoi,
}) => {
  const [mapCenter, setMapCenter] = useState<[number, number]>([
    userLocation.lng,
    userLocation.lat,
  ]);
  const [mapZoom, setMapZoom] = useState<number>(13);

  // Default to essential + infrastructure layers so map stays clean and scannable
  const [activeLayers, setActiveLayers] = useState<Set<MapLayerCategory>>(
    () =>
      new Set([
        'hospital',
        'clinic',
        'pharmacy',
        'police',
        'fuel',
        'transport',
        'cctv',
        'streetlight',
        'incident',
      ])
  );

  const [selectedPoi, setSelectedPoi] = useState<CityPoi | null>(pois[0] || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  // Debounced geocoding autocomplete (Part 8 & Part 12)
  useEffect(() => {
    const clean = searchQuery.trim();
    if (clean.length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await searchLocationsCached(clean, ctrl.signal);
      setSuggestions(res);
      setSearching(false);
    }, 340);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [searchQuery]);

  const toggleLayer = (cat: MapLayerCategory) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const setPresetLayers = (preset: 'all' | 'emergency' | 'infrastructure' | 'commercial') => {
    if (preset === 'all') {
      setActiveLayers(new Set(LAYER_DEFINITIONS.map((l) => l.id)));
    } else if (preset === 'emergency') {
      setActiveLayers(new Set(['hospital', 'clinic', 'pharmacy', 'police', 'incident']));
    } else if (preset === 'infrastructure') {
      setActiveLayers(new Set(['cctv', 'streetlight', 'transport', 'fuel', 'police']));
    } else {
      setActiveLayers(new Set(['restaurant', 'cafe', 'shop', 'fuel', 'pharmacy', 'education']));
    }
  };

  const enrichedPois = useMemo(() => {
    return pois
      .map((p) => ({
        ...p,
        distanceKm: Number(
          haversineDistanceKm(
            userLocation.lat,
            userLocation.lng,
            p.latitude,
            p.longitude
          ).toFixed(2)
        ),
      }))
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99));
  }, [pois, userLocation]);

  const filteredListPois = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedPois.filter((p) => {
      if (!activeLayers.has(p.category)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q))
      );
    });
  }, [enrichedPois, activeLayers, searchQuery]);

  const cctvStats = useMemo(() => {
    const cctvs = pois.filter((p) => p.category === 'cctv');
    return {
      verifiedCameras: cctvs.filter((p) => p.cctvClass === 'verified_camera').length,
      documentedJunctions: cctvs.filter((p) => p.cctvClass === 'documented_junction').length,
      surveillanceZones: cctvs.filter((p) => p.cctvClass === 'surveillance_zone').length,
    };
  }, [pois]);

  const lightingStats = useMemo(() => {
    const lights = pois.filter((p) => p.category === 'streetlight');
    return {
      verifiedIndividual: lights.filter((p) => p.streetlightClass === 'verified_streetlight').length,
      lightingCorridors: lights.filter((p) => p.streetlightClass === 'lighting_corridor').length,
      estimatedCoverage: lights.filter((p) => p.streetlightClass === 'estimated_coverage').length,
    };
  }, [pois]);

  const selectedPoiDistanceKm = selectedPoi
    ? haversineDistanceKm(
        userLocation.lat,
        userLocation.lng,
        selectedPoi.latitude,
        selectedPoi.longitude
      ).toFixed(2)
    : null;

  return (
    <div className="space-y-4">
      {/* Top Bar: Search + Quick Sector/Corridor Jumps */}
      <section className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[#8A909E] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Chandigarh & Mohali sectors, hospitals, police stations, universities..."
            className="w-full bg-[#181A1F] border border-[#262A34] focus:border-[#00D2FF] rounded-md pl-9 pr-8 py-1.5 text-xs text-white placeholder:text-[#6B7280] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSuggestions([]);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A909E] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Autocomplete Dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#111316] border border-[#262A34] rounded-md shadow-2xl max-h-60 overflow-y-auto divide-y divide-[#1E222A]">
              {suggestions.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => {
                    setMapCenter([res.longitude, res.latitude]);
                    setMapZoom(15);
                    setSelectedPoi({
                      id: `search-${res.id}`,
                      name: res.name.split(',')[0],
                      category: 'shop',
                      latitude: res.latitude,
                      longitude: res.longitude,
                      address: res.name,
                      source: 'OpenStreetMap / Overpass API',
                      verified: true,
                    });
                    setSuggestions([]);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#181A1F] flex items-center justify-between gap-2 text-xs cursor-pointer"
                >
                  <span className="text-white truncate">{res.name}</span>
                  <span className="text-[10px] font-mono text-[#00D2FF] shrink-0">
                    {res.latitude.toFixed(3)}, {res.longitude.toFixed(3)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { label: 'Sector 17 Chd', lng: 76.7834, lat: 30.7411 },
            { label: 'Sector 22 Chd', lng: 76.7741, lat: 30.7339 },
            { label: 'Phase 8 Mohali', lng: 76.7318, lat: 30.6952 },
            { label: 'CGC Landran', lng: 76.6634, lat: 30.6869 },
            { label: 'Airport', lng: 76.7885, lat: 30.6735 },
          ].map((loc) => (
            <button
              key={loc.label}
              type="button"
              onClick={() => {
                setMapCenter([loc.lng, loc.lat]);
                setMapZoom(14);
              }}
              className="px-2.5 py-1.5 rounded-md bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#D1D5DB] hover:text-white transition-colors whitespace-nowrap cursor-pointer"
            >
              {loc.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onRequestBrowserLocation();
              setMapCenter([userLocation.lng, userLocation.lat]);
              setMapZoom(14);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#181A1F] hover:bg-[#22262E] border border-[#00D2FF]/40 text-[#00D2FF] whitespace-nowrap cursor-pointer"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>My GPS</span>
          </button>
        </div>
      </section>

      {/* 14 Independent Toggleable GIS Map Layers */}
      <section className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1E222A]">
          <div className="flex items-center gap-2 text-xs font-medium text-white">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#00D2FF]" />
            <span>City Intelligence Layers ({activeLayers.size}/14 Active)</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setPresetLayers('emergency')}
              className="px-2 py-0.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#D1D5DB] cursor-pointer"
            >
              Emergency Only
            </button>
            <button
              type="button"
              onClick={() => setPresetLayers('infrastructure')}
              className="px-2 py-0.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#D1D5DB] cursor-pointer"
            >
              CCTV & Lighting
            </button>
            <button
              type="button"
              onClick={() => setPresetLayers('commercial')}
              className="px-2 py-0.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#D1D5DB] cursor-pointer"
            >
              Commercial Activity
            </button>
            <button
              type="button"
              onClick={() => setPresetLayers('all')}
              className="px-2 py-0.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#00D2FF] cursor-pointer"
            >
              Enable All 14
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {LAYER_DEFINITIONS.map((layer) => {
            const active = activeLayers.has(layer.id);
            const code = CATEGORY_STYLE_MAP[layer.id]?.shortCode || '•';
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#181A1F] border-[#00D2FF]/50 text-white'
                    : 'bg-[#08090B] border-[#1E222A] text-[#6B7280] hover:text-[#9CA3AF]'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full text-[8px] font-mono font-bold text-[#08090B] flex items-center justify-center"
                  style={{ backgroundColor: layer.colorHex }}
                >
                  {code}
                </span>
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main Split: Leaflet Map + Selected Location Inspector & Directory */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-8">
          <InteractiveCityMap
            center={mapCenter}
            zoom={mapZoom}
            userLocation={userLocation}
            pois={enrichedPois}
            reports={reports}
            sosIncidents={sosIncidents}
            crimeRecords={
              activeLayers.has('crime_hotspot') ? HISTORICAL_CRIME_DATABASE : []
            }
            activeLayers={activeLayers}
            selectedPoi={selectedPoi}
            onSelectPoi={(poi) => setSelectedPoi(poi)}
            heightClass="h-[540px]"
          />
        </div>

        {/* Right Column: Selected Feature Details + Directory */}
        <div className="lg:col-span-4 flex flex-col gap-3 h-[540px]">
          <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 shrink-0">
            {selectedPoi ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[#00D2FF] uppercase">{selectedPoi.category}</span>
                  <span className="text-[#8A909E] tabular-nums">
                    {selectedPoiDistanceKm} km away
                  </span>
                </div>

                <h3 className="font-display text-sm font-semibold text-white leading-snug">
                  {selectedPoi.name}
                </h3>

                <div className="space-y-1.5 pt-2 border-t border-[#1E222A] text-xs text-[#D1D5DB]">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#8A909E] shrink-0 mt-0.5" />
                    <span>
                      {selectedPoi.address || 'Street address not documented in OpenStreetMap'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#8A909E] shrink-0" />
                    <span className="font-mono text-[11px]">
                      {selectedPoi.phone || 'Phone not documented in OSM'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-[#8A909E] shrink-0" />
                    <span className="text-[11px]">
                      {selectedPoi.openingHours
                        ? `Documented Hours: ${selectedPoi.openingHours}`
                        : 'Opening hours not documented in OSM'}
                    </span>
                  </div>

                  {selectedPoi.coverageNote && (
                    <div className="p-2 rounded bg-[#181A1F] border border-[#262A34] text-[11px] text-[#F59E0B]">
                      {selectedPoi.coverageNote}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-[11px] text-[#8A909E]">
                    {selectedPoi.verified ? (
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    <span>Source: {selectedPoi.source}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigateToPoi(selectedPoi)}
                  className="w-full mt-1 py-2 px-3 rounded-md bg-[#00D2FF] hover:bg-[#38BDF8] text-[#08090B] font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Calculate Route Here</span>
                </button>
              </div>
            ) : (
              <div className="text-xs text-[#8A909E] py-6 text-center">
                Select any marker on the map to inspect verified metadata.
              </div>
            )}
          </div>

          {/* Scrollable Directory */}
          <div className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1E222A] text-xs">
              <span className="font-semibold text-white">
                Active Layer Directory ({filteredListPois.length})
              </span>
              <span className="text-[11px] font-mono text-[#8A909E]">Nearest first</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredListPois.map((poi) => (
                <button
                  key={poi.id}
                  type="button"
                  onClick={() => {
                    setSelectedPoi(poi);
                    setMapCenter([poi.longitude, poi.latitude]);
                  }}
                  className={`w-full p-2.5 rounded-md border text-left transition-colors cursor-pointer ${
                    selectedPoi?.id === poi.id
                      ? 'bg-[#181A1F] border-[#00D2FF]/50'
                      : 'bg-[#08090B] hover:bg-[#181A1F] border-[#1E222A]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-white truncate">{poi.name}</span>
                    <span className="text-[11px] font-mono tabular-nums text-[#00D2FF] shrink-0">
                      {poi.distanceKm} km
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-[#8A909E] truncate">
                    {poi.category.toUpperCase()} · {poi.address || 'Chandigarh / Mohali'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PART 7 — CCTV AND STREETLIGHT INFRASTRUCTURE INTELLIGENCE AUDIT */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#1E222A] pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Camera className="w-3.5 h-3.5 text-[#14B8A6]" />
              <span>CCTV Infrastructure Classification (Chandigarh & Mohali)</span>
            </div>
            <span className="text-[10px] font-mono text-[#8A909E]">ICCC + OSM</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center font-mono">
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-sm font-bold text-white tabular-nums">
                {cctvStats.verifiedCameras}
              </div>
              <div className="text-[10px] text-[#8A909E]">Verified Cameras</div>
            </div>
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-sm font-bold text-[#14B8A6] tabular-nums">
                {cctvStats.documentedJunctions}
              </div>
              <div className="text-[10px] text-[#8A909E]">ICCC Junctions</div>
            </div>
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-sm font-bold text-[#00D2FF] tabular-nums">
                {cctvStats.surveillanceZones}
              </div>
              <div className="text-[10px] text-[#8A909E]">Surveillance Zones</div>
            </div>
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-xs font-semibold text-[#F59E0B] pt-0.5">Partial OSM</div>
              <div className="text-[10px] text-[#8A909E]">Sub-Sector Lanes</div>
            </div>
          </div>
          <p className="text-[11px] text-[#8A909E] leading-relaxed">
            Chandigarh Smart City ICCC operates extensive intersection surveillance across V2/V3
            arterials. Absent OpenStreetMap camera nodes in internal sectors indicate unmapped
            public records, not confirmed absence of cameras.
          </p>
        </div>

        <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#1E222A] pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Lightbulb className="w-3.5 h-3.5 text-[#FACC15]" />
              <span>Streetlight Coverage Classification</span>
            </div>
            <span className="text-[10px] font-mono text-[#8A909E]">MC Chd + GMADA</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center font-mono">
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-sm font-bold text-white tabular-nums">
                {lightingStats.verifiedIndividual}
              </div>
              <div className="text-[10px] text-[#8A909E]">Verified Poles</div>
            </div>
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-sm font-bold text-[#FACC15] tabular-nums">
                {lightingStats.lightingCorridors}
              </div>
              <div className="text-[10px] text-[#8A909E]">Lit Corridors</div>
            </div>
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-sm font-bold text-[#00D2FF] tabular-nums">
                {lightingStats.estimatedCoverage}
              </div>
              <div className="text-[10px] text-[#8A909E]">Est. Highway</div>
            </div>
            <div className="p-2 rounded bg-[#08090B] border border-[#1E222A]">
              <div className="text-xs font-semibold text-[#8A909E] pt-0.5">Unmapped</div>
              <div className="text-[10px] text-[#8A909E]">V5/V6 Internal</div>
            </div>
          </div>
          <p className="text-[11px] text-[#8A909E] leading-relaxed">
            OpenStreetMap does not record every individual streetlamp pole in Chandigarh and Mohali.
            UrbanShield evaluates documented arterial lighting corridors alongside verified OSM lamp
            nodes and never assigns zero lighting scores due to unmapped poles.
          </p>
        </div>
      </section>
    </div>
  );
};
