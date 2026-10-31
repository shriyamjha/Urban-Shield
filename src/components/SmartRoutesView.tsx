import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  ArrowLeftRight,
  Clock,
  Footprints,
  Bike,
  Car,
  Moon,
  Sun,
  ChevronDown,
  ChevronUp,
  Sliders,
  Crosshair,
  Bookmark,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  CityPoi,
  CommunityReport,
  MapLayerCategory,
  SavedLocation,
  SmartRouteOption,
  TravelMode,
} from '../types/urbanshield.ts';
import { ROUTE_PRESETS, CHANDIGARH_CENTER } from '../data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';
import {
  calculateSmartRoutesCached,
  GeocodingSuggestion,
  getSavedLocations,
  saveUserLocationBookmark,
  searchLocationsCached,
} from '../services/gisClientService.ts';
import { InteractiveCityMap } from './InteractiveCityMap.tsx';

interface SmartRoutesViewProps {
  userLocation: { lat: number; lng: number };
  pois: CityPoi[];
  reports: CommunityReport[];
  initialDestination?: CityPoi | null;
  onActiveRouteChange?: (summary: string) => void;
}

export const SmartRoutesView: React.FC<SmartRoutesViewProps> = ({
  userLocation,
  pois,
  reports,
  initialDestination,
  onActiveRouteChange,
}) => {
  // Default to Test Journey #1: Chandigarh Railway Station -> CGC University Mohali
  const [startName, setStartName] = useState(
    'Chandigarh Junction Railway Station, Daria, Chandigarh'
  );
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number }>({
    lat: 30.7019,
    lng: 76.8219,
  });

  const [endName, setEndName] = useState(
    initialDestination?.name || 'CGC University (Landran Campus), Sector 112, Mohali'
  );
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number }>({
    lat: initialDestination?.latitude || 30.6869,
    lng: initialDestination?.longitude || 76.6634,
  });

  const [mode, setMode] = useState<TravelMode>('car');
  const [departureTime, setDepartureTime] = useState('22:00');
  const [isNightJourney, setIsNightJourney] = useState(true);

  const [routes, setRoutes] = useState<SmartRouteOption[]>([]);
  const [routeNote, setRouteNote] = useState<string | undefined>(undefined);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-recommended');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autocomplete states with debouncing
  const [originSuggestions, setOriginSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [activeAutocomplete, setActiveAutocomplete] = useState<'origin' | 'dest' | null>(null);
  const [searchingGeocode, setSearchingGeocode] = useState(false);

  // Map overlay toggles on Smart Routes map
  const [showCrimeOverlay, setShowCrimeOverlay] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [showWeightsModal, setShowWeightsModal] = useState(false);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => getSavedLocations());

  const [weights, setWeights] = useState({
    establishments: 30,
    mainRoads: 25,
    emergencyServices: 20,
    transport: 15,
    streetlights: 10,
  });

  const routeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialDestination) {
      setEndName(initialDestination.name);
      setEndCoords({
        lat: initialDestination.latitude,
        lng: initialDestination.longitude,
      });
    }
  }, [initialDestination]);

  // Debounced Origin Autocomplete
  useEffect(() => {
    if (activeAutocomplete !== 'origin') return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingGeocode(true);
      const results = await searchLocationsCached(startName, ctrl.signal);
      setOriginSuggestions(results);
      setSearchingGeocode(false);
    }, 320);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [startName, activeAutocomplete]);

  // Debounced Destination Autocomplete
  useEffect(() => {
    if (activeAutocomplete !== 'dest') return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSearchingGeocode(true);
      const results = await searchLocationsCached(endName, ctrl.signal);
      setDestSuggestions(results);
      setSearchingGeocode(false);
    }, 320);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [endName, activeAutocomplete]);

  const executeRouteCalculation = async () => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    routeAbortRef.current = ctrl;

    setLoading(true);
    setError(null);
    try {
      const res = await calculateSmartRoutesCached(
        {
          startLat: startCoords.lat,
          startLng: startCoords.lng,
          endLat: endCoords.lat,
          endLng: endCoords.lng,
          startName,
          endName,
          mode,
          departureTime,
          isNightJourney,
          weights,
        },
        ctrl.signal
      );

      setRoutes(res.routes);
      setRouteNote(res.note);

      if (res.routes.length > 0) {
        const rec = res.routes.find((r) => r.isRecommended) || res.routes[0];
        setSelectedRouteId(rec.id);
        if (onActiveRouteChange) {
          onActiveRouteChange(
            `${startName} → ${endName} [${mode.toUpperCase()}, ${
              isNightJourney ? 'Night' : 'Day'
            } ${departureTime}]: ${rec.label} (${(rec.distanceMeters / 1000).toFixed(
              1
            )} km, ~${Math.round(rec.durationSeconds / 60)} min, Night Activity Score: ${
              rec.nightActivity.overallScore ?? 'Insufficient data'
            }/100, Help Points: ${rec.documentedHelpPointsCount}, Max Gap: ${
              rec.longestGapBetweenHelpPointsKm
            } km)`
          );
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError('Unable to calculate route geometry right now. Please verify locations.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeRouteCalculation();
  }, [
    startCoords.lat,
    startCoords.lng,
    endCoords.lat,
    endCoords.lng,
    mode,
    isNightJourney,
  ]);

  const handleSwapEndpoints = () => {
    const tempName = startName;
    const tempCoords = { ...startCoords };
    setStartName(endName);
    setStartCoords({ ...endCoords });
    setEndName(tempName);
    setEndCoords(tempCoords);
  };

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0] || null;

  const activeMapLayers = new Set<MapLayerCategory>([
    'hospital',
    'clinic',
    'police',
    'pharmacy',
    'fuel',
    'cctv',
    'streetlight',
    'incident',
    ...(showCrimeOverlay ? (['crime_hotspot'] as MapLayerCategory[]) : []),
  ]);

  return (
    <div className="space-y-4">
      {/* PART 4.1 — COMPACT JOURNEY HEADER (Aevy TV / NightWise Minimalist Black Layout) */}
      <section className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
        {/* Top Row: Corridor Title + Transport Modes + Departure Time + Night Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E222A]">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-sm font-semibold text-white tracking-tight">
              Smart Route Intelligence
            </h1>
            <span className="text-[#4B5563]">·</span>
            <span className="text-xs text-[#8A909E]">
              OSRM Road Geometry & Documented Corridor Activity
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Transport Mode Selector */}
            <div className="flex items-center bg-[#08090B] border border-[#22262E] rounded-md p-0.5">
              {[
                { id: 'car' as TravelMode, label: 'Driving', icon: Car },
                { id: 'foot' as TravelMode, label: 'Walking', icon: Footprints },
                { id: 'bike' as TravelMode, label: 'Cycling', icon: Bike },
              ].map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-[#181A1F] text-[#00D2FF] border border-[#00D2FF]/40'
                        : 'text-[#8A909E] hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Departure Time Input */}
            <div className="flex items-center gap-1.5 bg-[#08090B] border border-[#22262E] rounded-md px-2.5 py-1 text-xs">
              <Clock className="w-3.5 h-3.5 text-[#8A909E]" />
              <input
                type="time"
                value={departureTime}
                onChange={(e) => {
                  const val = e.target.value;
                  setDepartureTime(val);
                  const hour = parseInt(val.split(':')[0] || '22', 10);
                  setIsNightJourney(hour >= 19 || hour < 6);
                }}
                className="bg-transparent font-mono text-xs text-white focus:outline-none"
              />
            </div>

            {/* Night Journey Toggle */}
            <button
              type="button"
              onClick={() => setIsNightJourney(!isNightJourney)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isNightJourney
                  ? 'bg-[#181A1F] border-[#F59E0B]/50 text-[#F59E0B]'
                  : 'bg-[#08090B] border-[#22262E] text-[#8A909E] hover:text-white'
              }`}
            >
              {isNightJourney ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
              <span>{isNightJourney ? 'Night Journey (Active)' : 'Daytime Journey'}</span>
            </button>

            {/* Weights Modal Button */}
            <button
              type="button"
              onClick={() => setShowWeightsModal(!showWeightsModal)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#08090B] hover:bg-[#181A1F] border border-[#22262E] text-xs text-[#8A909E] hover:text-white cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Weights</span>
            </button>
          </div>
        </div>

        {/* Middle Row: Origin + Swap + Destination + Calculate Button */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
          {/* Origin Input */}
          <div className="lg:col-span-5 relative">
            <div className="flex items-center gap-2 bg-[#181A1F] border border-[#262A34] focus-within:border-[#00D2FF] rounded-md px-3 py-2">
              <span className="w-4 h-4 rounded bg-[#00D2FF] text-[#08090B] font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                A
              </span>
              <input
                type="text"
                value={startName}
                onFocus={() => setActiveAutocomplete('origin')}
                onBlur={() => setTimeout(() => setActiveAutocomplete(null), 200)}
                onChange={(e) => setStartName(e.target.value)}
                placeholder="Enter origin in Chandigarh or Mohali..."
                className="w-full bg-transparent text-xs text-white placeholder:text-[#6B7280] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setStartName('Current GPS Location');
                  setStartCoords({ lat: userLocation.lat, lng: userLocation.lng });
                }}
                title="Use my current GPS coordinates"
                className="text-[#8A909E] hover:text-[#00D2FF] cursor-pointer shrink-0"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeAutocomplete === 'origin' && originSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#111316] border border-[#262A34] rounded-md shadow-2xl max-h-56 overflow-y-auto divide-y divide-[#1E222A]">
                {originSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={() => {
                      setStartName(s.name);
                      setStartCoords({ lat: s.latitude, lng: s.longitude });
                      setActiveAutocomplete(null);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-[#181A1F] flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <span className="text-white truncate">{s.name}</span>
                    <span className="text-[10px] font-mono text-[#8A909E] shrink-0">
                      {s.source}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="lg:col-span-1 flex justify-center">
            <button
              type="button"
              onClick={handleSwapEndpoints}
              title="Swap Origin and Destination"
              className="p-2 rounded-md bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#8A909E] hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Destination Input */}
          <div className="lg:col-span-4 relative">
            <div className="flex items-center gap-2 bg-[#181A1F] border border-[#262A34] focus-within:border-[#F59E0B] rounded-md px-3 py-2">
              <span className="w-4 h-4 rounded bg-[#F59E0B] text-[#08090B] font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                B
              </span>
              <input
                type="text"
                value={endName}
                onFocus={() => setActiveAutocomplete('dest')}
                onBlur={() => setTimeout(() => setActiveAutocomplete(null), 200)}
                onChange={(e) => setEndName(e.target.value)}
                placeholder="Enter destination in Chandigarh or Mohali..."
                className="w-full bg-transparent text-xs text-white placeholder:text-[#6B7280] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const next = saveUserLocationBookmark({
                    label: endName.split(',')[0],
                    address: endName,
                    latitude: endCoords.lat,
                    longitude: endCoords.lng,
                    category: 'custom',
                  });
                  setSavedLocations(next);
                }}
                title="Save destination to bookmarks"
                className="text-[#8A909E] hover:text-[#F59E0B] cursor-pointer shrink-0"
              >
                <Bookmark className="w-3.5 h-3.5" />
              </button>
            </div>

            {activeAutocomplete === 'dest' && destSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#111316] border border-[#262A34] rounded-md shadow-2xl max-h-56 overflow-y-auto divide-y divide-[#1E222A]">
                {destSuggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onMouseDown={() => {
                      setEndName(s.name);
                      setEndCoords({ lat: s.latitude, lng: s.longitude });
                      setActiveAutocomplete(null);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-[#181A1F] flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <span className="text-white truncate">{s.name}</span>
                    <span className="text-[10px] font-mono text-[#8A909E] shrink-0">
                      {s.source}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Calculate Action */}
          <div className="lg:col-span-2">
            <button
              type="button"
              onClick={executeRouteCalculation}
              disabled={loading}
              className="w-full py-2 px-3 rounded-md bg-[#00D2FF] hover:bg-[#38BDF8] text-[#08090B] font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              {loading ? 'Calculating...' : 'Calculate Routes'}
            </button>
          </div>
        </div>

        {/* Bottom Row: 5 Benchmark Corridors & Saved Bookmarks */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
          <span className="text-[#8A909E] font-mono mr-1">Corridors:</span>
          {ROUTE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setStartName(preset.start.name);
                setStartCoords({ lat: preset.start.lat, lng: preset.start.lng });
                setEndName(preset.end.name);
                setEndCoords({ lat: preset.end.lat, lng: preset.end.lng });
              }}
              className="px-2 py-0.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#262A34] text-[#D1D5DB] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Optional Scoring Weight Customizer */}
        {showWeightsModal && (
          <div className="p-3 rounded-md bg-[#08090B] border border-[#22262E] grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {[
              { key: 'establishments', label: 'Commercial Activity (%)' },
              { key: 'mainRoads', label: 'Main-Road Coverage (%)' },
              { key: 'emergencyServices', label: 'Emergency Proximity (%)' },
              { key: 'transport', label: 'Transit Access (%)' },
              { key: 'streetlights', label: 'Lighting & CCTV (%)' },
            ].map((item) => (
              <div key={item.key} className="space-y-1">
                <label className="block text-[10px] text-[#8A909E]">{item.label}</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={weights[item.key as keyof typeof weights]}
                  onChange={(e) =>
                    setWeights((prev) => ({
                      ...prev,
                      [item.key]: Number(e.target.value),
                    }))
                  }
                  className="w-full bg-[#111316] border border-[#262A34] rounded px-2 py-1 font-mono text-xs text-white"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="p-3 rounded-md bg-red-950/40 border border-red-500/40 text-xs text-red-200">
          {error}
        </div>
      )}

      {routeNote && (
        <div className="px-3 py-2 rounded-md bg-[#111316] border border-[#22262E] text-[11px] text-[#8A909E] flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-[#00D2FF] shrink-0" />
          <span>{routeNote}</span>
        </div>
      )}

      {/* PART 4.2 — ROUTE COMPARISON CARDS (Recommended in Gold/Amber #F59E0B, Fastest, Higher Activity) */}
      <section
        className={`grid grid-cols-1 ${
          routes.length === 1
            ? 'md:grid-cols-1'
            : routes.length === 2
            ? 'md:grid-cols-2'
            : 'md:grid-cols-3'
        } gap-3`}
      >
        {routes.map((route) => {
          const isSelected = route.id === selectedRoute?.id;
          const isRec = route.isRecommended;
          const distKm = (route.distanceMeters / 1000).toFixed(1);
          const mins = Math.max(1, Math.round(route.durationSeconds / 60));
          const emergencyCount =
            route.nearbyPoisCount.hospitals +
            route.nearbyPoisCount.police +
            route.nearbyPoisCount.pharmacies;

          return (
            <button
              key={route.id}
              type="button"
              onClick={() => setSelectedRouteId(route.id)}
              className={`p-4 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? isRec
                    ? 'bg-[#111316] border-[#F59E0B] shadow-[0_0_0_1px_rgba(245,158,11,0.3)]'
                    : 'bg-[#111316] border-[#00D2FF] shadow-[0_0_0_1px_rgba(0,210,255,0.3)]'
                  : 'bg-[#111316]/80 hover:bg-[#111316] border-[#22262E]'
              }`}
            >
              <div className="space-y-2">
                {/* Top Kicker (Zero-Pill Unboxed Metadata Discipline) */}
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span
                    className={
                      isRec
                        ? 'text-[#F59E0B] font-semibold'
                        : route.type === 'fastest'
                        ? 'text-[#00D2FF] font-semibold'
                        : 'text-emerald-400 font-semibold'
                    }
                  >
                    {isRec ? '★ RECOMMENDED ROUTE' : route.label.toUpperCase()}
                  </span>
                  <span className="text-[#8A909E] tabular-nums">
                    Confidence: {route.nightActivity.confidencePercentage}% (
                    {route.nightActivity.confidenceTier})
                  </span>
                </div>

                {/* Primary Metrics Row: Duration, Distance, Night Activity Score */}
                <div className="flex items-baseline justify-between gap-2 pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xl font-bold text-white tabular-nums">
                      {mins} min
                    </span>
                    <span className="font-mono text-xs text-[#8A909E] tabular-nums">
                      ({distKm} km)
                    </span>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-mono text-lg font-bold tabular-nums ${
                        isRec ? 'text-[#F59E0B]' : 'text-[#00D2FF]'
                      }`}
                    >
                      {route.nightActivity.overallScore !== null
                        ? `${route.nightActivity.overallScore}/100`
                        : 'Insufficient data'}
                    </span>
                    <div className="text-[10px] font-mono text-[#8A909E]">
                      Night Activity Score
                    </div>
                  </div>
                </div>

                {/* Why Recommended / Route Explanation */}
                <p className="text-xs text-[#D1D5DB] leading-relaxed">
                  {route.recommendationReason}
                </p>
              </div>

              {/* Compact 4-Metric Telemetry Grid */}
              <div className="mt-3 pt-2.5 border-t border-[#1E222A] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono tabular-nums">
                <div>
                  <div className="text-[#8A909E] text-[10px]">Emergency POIs</div>
                  <div className="text-white font-semibold">{emergencyCount} nearby</div>
                </div>
                <div>
                  <div className="text-[#8A909E] text-[10px]">Help Points</div>
                  <div className="text-white font-semibold">
                    {route.documentedHelpPointsCount} nodes
                  </div>
                </div>
                <div>
                  <div className="text-[#8A909E] text-[10px]">Main-Road Cov.</div>
                  <div className="text-white font-semibold">{route.mainRoadCoveragePercent}%</div>
                </div>
                <div>
                  <div className="text-[#8A909E] text-[10px]">Max Help Gap</div>
                  <div className="text-white font-semibold">
                    {route.longestGapBetweenHelpPointsKm} km
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* PART 4.3 — MAJOR MAP VIEWPORT + TRANSPARENT NIGHT ACTIVITY SCORING SIDEBAR */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Map Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111316] border border-[#22262E] rounded-md px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-[#D1D5DB]">
              <Navigation className="w-3.5 h-3.5 text-[#F59E0B]" />
              <span className="font-medium">
                Active Corridor: {selectedRoute?.summaryRoads || 'Calculating...'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-[#8A909E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCrimeOverlay}
                  onChange={(e) => setShowCrimeOverlay(e.target.checked)}
                />
                <span>Overlay Historical Crime Jurisdictions</span>
              </label>
            </div>
          </div>

          <InteractiveCityMap
            center={CHANDIGARH_CENTER}
            userLocation={userLocation}
            pois={pois}
            reports={reports}
            crimeRecords={showCrimeOverlay ? HISTORICAL_CRIME_DATABASE : []}
            activeLayers={activeMapLayers}
            selectedPoi={null}
            onSelectPoi={() => {}}
            routes={routes}
            selectedRouteId={selectedRoute?.id}
            onSelectRoute={(id) => setSelectedRouteId(id)}
            originCoords={{ lat: startCoords.lat, lng: startCoords.lng, label: startName }}
            destinationCoords={{ lat: endCoords.lat, lng: endCoords.lng, label: endName }}
            heightClass="h-[500px]"
          />
        </div>

        {/* Right Column (4 cols): Transparent Night Activity Score Model (Part 9) */}
        <div className="lg:col-span-4 bg-[#111316] border border-[#22262E] rounded-lg p-4 flex flex-col justify-between space-y-4">
          {selectedRoute ? (
            <>
              <div className="space-y-3">
                <div className="pb-2.5 border-b border-[#1E222A]">
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#8A909E]">
                    <span>TRANSPARENT SCORING MODEL</span>
                    <span>CONFIDENCE: {selectedRoute.nightActivity.confidencePercentage}%</span>
                  </div>
                  <h2 className="font-display text-sm font-semibold text-white mt-1">
                    {selectedRoute.nightActivity.scoreStatusLabel}
                  </h2>
                </div>

                {/* 4 Explicit Epistemic Dimensions (Activity, Infrastructure, Historical Crime, Confidence) */}
                <div className="space-y-2.5 text-xs">
                  <div className="p-2.5 rounded bg-[#181A1F] border border-[#262A34] space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#00D2FF]">1. Documented Activity</span>
                      <span className="text-white tabular-nums">
                        {selectedRoute.nightActivity.factors.establishmentsScore}/100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {selectedRoute.nightActivity.activitySummary}
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-[#181A1F] border border-[#262A34] space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#F59E0B]">2. Infrastructure Availability</span>
                      <span className="text-white tabular-nums">
                        {selectedRoute.nightActivity.factors.streetlightScore}/100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {selectedRoute.nightActivity.infrastructureSummary}
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-[#181A1F] border border-[#262A34] space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-emerald-400">3. Emergency & Transit Access</span>
                      <span className="text-white tabular-nums">
                        {selectedRoute.nightActivity.factors.emergencyScore}/100
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {selectedRoute.nearbyPoisCount.hospitals} hospitals/clinics ·{' '}
                      {selectedRoute.nearbyPoisCount.police} police stations ·{' '}
                      {selectedRoute.nearbyPoisCount.pharmacies} pharmacies ·{' '}
                      {selectedRoute.nearbyPoisCount.transportStops} transit stops.
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-[#181A1F] border border-[#262A34] space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-rose-400">4. Historical Crime Context</span>
                      <span className="text-[#8A909E]">PS-Level</span>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF]">
                      {selectedRoute.nightActivity.historicalCrimeExposure}
                    </p>
                  </div>
                </div>
              </div>

              {/* Epistemic Honesty Note */}
              <div className="pt-2.5 border-t border-[#1E222A] space-y-1.5 text-[11px] text-[#8A909E]">
                <div className="flex items-center gap-1.5 text-white font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#00D2FF] shrink-0" />
                  <span>Activity vs. Personal Safety Distinction</span>
                </div>
                <p className="leading-relaxed">
                  Higher commercial or road activity does not guarantee personal safety. Missing
                  OpenStreetMap tags indicate unmapped data rather than confirmed absence of
                  streetlights or CCTV.
                </p>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-[#8A909E]">
              Select or calculate a route to inspect corridor intelligence.
            </div>
          )}
        </div>
      </section>

      {/* PART 4.4 — COMPACT EXPANDABLE ROUTE DETAILS SECTION */}
      {selectedRoute && (
        <section className="bg-[#111316] border border-[#22262E] rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="w-full px-4 py-3 bg-[#181A1F] hover:bg-[#1E222A] flex items-center justify-between text-xs font-medium text-white cursor-pointer"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display font-semibold">
                Corridor Facility & Help-Point Audit — {selectedRoute.label}
              </span>
              <span className="text-[#6B7280]">·</span>
              <span className="font-mono text-[#00D2FF] tabular-nums">
                Longest Gap Between Documented Help Points:{' '}
                {selectedRoute.longestGapBetweenHelpPointsKm} km
              </span>
              <span className="text-[#6B7280]">·</span>
              <span className="font-mono text-[#8A909E] tabular-nums">
                Infrastructure Data Confidence: {selectedRoute.nightActivity.confidencePercentage}%
              </span>
            </div>
            {detailsExpanded ? (
              <ChevronUp className="w-4 h-4 text-[#8A909E]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[#8A909E]" />
            )}
          </button>

          {detailsExpanded && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {[
                {
                  title: 'Nearby Hospitals & Clinics',
                  items: selectedRoute.nearbyFacilities.hospitals,
                  emptyNote:
                    'No hospital mapped within 650m corridor (nearest city hospital reachable via arterial connector).',
                },
                {
                  title: 'Police Stations',
                  items: selectedRoute.nearbyFacilities.police,
                  emptyNote:
                    'No police station building within 650m corridor; covered by territorial PCR patrol jurisdiction.',
                },
                {
                  title: 'Pharmacies',
                  items: selectedRoute.nearbyFacilities.pharmacies,
                  emptyNote:
                    'No pharmacy node tagged in OSM within 650m; sub-sector chemist shops may be unmapped.',
                },
                {
                  title: 'Petrol Pumps (24/7 Help Points)',
                  items: selectedRoute.nearbyFacilities.fuel,
                  emptyNote:
                    'No fuel station mapped within 650m of this specific alignment.',
                },
                {
                  title: 'Commercial Establishments',
                  items: selectedRoute.nearbyFacilities.commercial,
                  emptyNote:
                    'Limited OSM commercial tags along this stretch (unmapped shops may still exist).',
                },
              ].map((group) => (
                <div
                  key={group.title}
                  className="bg-[#08090B] border border-[#22262E] rounded-md p-3 space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-[#1E222A] pb-1.5">
                    <span className="font-semibold text-white">{group.title}</span>
                    <span className="font-mono text-[11px] text-[#00D2FF] tabular-nums">
                      {group.items.length}
                    </span>
                  </div>
                  {group.items.length === 0 ? (
                    <p className="text-[11px] text-[#8A909E] leading-relaxed">{group.emptyNote}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {group.items.map((fac) => (
                        <div
                          key={fac.id}
                          className="p-1.5 rounded bg-[#111316] border border-[#1E222A] space-y-0.5"
                        >
                          <div className="text-[11px] font-medium text-white truncate">
                            {fac.name}
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-[#8A909E]">
                            <span>{fac.distanceFromRouteMeters}m from route</span>
                            <span>{fac.openingHours || 'Hours unverified'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
