import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Clock,
  Footprints,
  Bike,
  Car,
  Moon,
  Sun,
  Crosshair,
  Bookmark,
  Check,
  MapPin,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
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
import {
  calculateSmartRoutesCached,
  ensureLatLngOrder,
  GeocodingSuggestion,
  getSavedLocations,
  resolveLocationQuery,
  saveUserLocationBookmark,
  searchLocationsCached,
} from '../services/gisClientService.ts';
import { InteractiveCityMap } from './InteractiveCityMap.tsx';
import { ExpandableDetails } from './ui/ProgressivePrimitives.tsx';

interface SmartRoutesViewProps {
  userLocation: { lat: number; lng: number };
  pois: CityPoi[];
  reports: CommunityReport[];
  initialDestination?: CityPoi | null;
}

export const SmartRoutesView: React.FC<SmartRoutesViewProps> = ({
  userLocation,
  pois,
  reports,
  initialDestination,
}) => {
  // Default to Test Case #1: Chandigarh Junction Railway Station -> Sector 22, Chandigarh
  const defaultOriginName = 'Chandigarh Junction Railway Station, Daria, Chandigarh';
  const defaultOriginCoords = { lat: 30.7019, lng: 76.8219 };

  const defaultDestName =
    initialDestination?.name || 'Sector 22, Chandigarh (Shastri Market / Aroma Point)';
  const defaultDestCoords = {
    lat: initialDestination?.latitude || 30.7336,
    lng: initialDestination?.longitude || 76.7745,
  };

  const [startName, setStartName] = useState(defaultOriginName);
  const [resolvedOriginName, setResolvedOriginName] = useState(defaultOriginName);
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number }>(defaultOriginCoords);
  const [originDirty, setOriginDirty] = useState(false);

  const [endName, setEndName] = useState(defaultDestName);
  const [originalUserDestInput, setOriginalUserDestInput] = useState(
    initialDestination?.name || 'Sector 22, Chandigarh'
  );
  const [resolvedDestName, setResolvedDestName] = useState(defaultDestName);
  const [endCoords, setEndCoords] = useState<{ lat: number; lng: number }>(defaultDestCoords);
  const [finalRoutingDestCoords, setFinalRoutingDestCoords] = useState<{
    lat: number;
    lng: number;
  }>(defaultDestCoords);
  const [destDirty, setDestDirty] = useState(false);

  // Ambiguous location clarification state
  const [clarificationPrompt, setClarificationPrompt] = useState<{
    field: 'origin' | 'dest';
    query: string;
    reason: string;
    candidates: GeocodingSuggestion[];
  } | null>(null);

  const [mode, setMode] = useState<TravelMode>('car');
  const [departureTime, setDepartureTime] = useState('22:00');
  const [isNightJourney, setIsNightJourney] = useState(true);

  const [routes, setRoutes] = useState<SmartRouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-recommended');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Journey editor & full screen map toggles
  const [isEditingJourney, setIsEditingJourney] = useState(false);
  const [isMapFullScreen, setIsMapFullScreen] = useState(false);

  // Autocomplete states with debouncing
  const [originSuggestions, setOriginSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<GeocodingSuggestion[]>([]);
  const [activeAutocomplete, setActiveAutocomplete] = useState<'origin' | 'dest' | null>(null);
  const [, setSearchingGeocode] = useState(false);
  const [, setSavedLocations] = useState<SavedLocation[]>(() => getSavedLocations());

  const [weights] = useState({
    establishments: 30,
    mainRoads: 25,
    emergencyServices: 20,
    transport: 15,
    streetlights: 10,
  });

  const routeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (initialDestination) {
      const norm = ensureLatLngOrder(initialDestination.latitude, initialDestination.longitude);
      setEndName(initialDestination.name);
      setOriginalUserDestInput(initialDestination.name);
      setResolvedDestName(initialDestination.name);
      setEndCoords({ lat: norm.lat, lng: norm.lng });
      setFinalRoutingDestCoords({ lat: norm.lat, lng: norm.lng });
      setDestDirty(false);
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
    }, 220);

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
    }, 220);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [endName, activeAutocomplete]);

  const executeRouteCalculation = async (
    overrideOrigin?: { name: string; lat: number; lng: number },
    overrideDest?: { name: string; lat: number; lng: number }
  ) => {
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    routeAbortRef.current = ctrl;

    const rawOrig = overrideOrigin || {
      name: resolvedOriginName,
      lat: startCoords.lat,
      lng: startCoords.lng,
    };
    const rawDest = overrideDest || {
      name: resolvedDestName,
      lat: endCoords.lat,
      lng: endCoords.lng,
    };

    const normOrig = ensureLatLngOrder(rawOrig.lat, rawOrig.lng);
    const normDest = ensureLatLngOrder(rawDest.lat, rawDest.lng);

    // Record exact final routing destination coordinates for the diagnostic and map marker
    setFinalRoutingDestCoords({ lat: normDest.lat, lng: normDest.lng });

    setLoading(true);
    setError(null);
    try {
      const res = await calculateSmartRoutesCached(
        {
          startLat: normOrig.lat,
          startLng: normOrig.lng,
          endLat: normDest.lat,
          endLng: normDest.lng,
          startName: rawOrig.name,
          endName: rawDest.name,
          mode,
          departureTime,
          isNightJourney,
          weights,
        },
        ctrl.signal
      );

      setRoutes(res.routes);

      if (res.routes.length > 0) {
        const rec = res.routes.find((r) => r.isRecommended) || res.routes[0];
        setSelectedRouteId(rec.id);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError('Unable to calculate route geometry right now. Please verify locations.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Resolves any user-typed origin/destination text that has not yet been selected
   * from autocomplete so stale coordinates from previous searches are NEVER reused.
   */
  const resolveAndApplyJourneyInputs = async () => {
    setError(null);
    setClarificationPrompt(null);

    let nextOrigin = {
      name: resolvedOriginName,
      lat: startCoords.lat,
      lng: startCoords.lng,
    };
    let nextDest = {
      name: resolvedDestName,
      lat: endCoords.lat,
      lng: endCoords.lng,
    };

    if (originDirty) {
      const resOrig = await resolveLocationQuery(startName);
      if (resOrig.status === 'not_found') {
        setError(resOrig.reason || `Origin "${startName}" could not be verified.`);
        return;
      }
      if (resOrig.status === 'ambiguous') {
        setClarificationPrompt({
          field: 'origin',
          query: startName,
          reason: resOrig.reason || 'Multiple origin locations match. Please clarify:',
          candidates: resOrig.candidates,
        });
        return;
      }
      if (resOrig.resolved) {
        const norm = ensureLatLngOrder(resOrig.resolved.latitude, resOrig.resolved.longitude);
        nextOrigin = {
          name: resOrig.resolved.name,
          lat: norm.lat,
          lng: norm.lng,
        };
        setStartName(resOrig.resolved.name);
        setResolvedOriginName(resOrig.resolved.name);
        setStartCoords({ lat: norm.lat, lng: norm.lng });
        setOriginDirty(false);
      }
    }

    if (destDirty) {
      const userEnteredDest = endName.trim();
      setOriginalUserDestInput(userEnteredDest);
      const resDest = await resolveLocationQuery(userEnteredDest);
      if (resDest.status === 'not_found') {
        setError(resDest.reason || `Destination "${userEnteredDest}" could not be verified.`);
        return;
      }
      if (resDest.status === 'ambiguous') {
        setClarificationPrompt({
          field: 'dest',
          query: userEnteredDest,
          reason: resDest.reason || 'Multiple destination locations match. Please clarify:',
          candidates: resDest.candidates,
        });
        return;
      }
      if (resDest.resolved) {
        const norm = ensureLatLngOrder(resDest.resolved.latitude, resDest.resolved.longitude);
        nextDest = {
          name: resDest.resolved.name,
          lat: norm.lat,
          lng: norm.lng,
        };
        setEndName(resDest.resolved.name);
        setResolvedDestName(resDest.resolved.name);
        setEndCoords({ lat: norm.lat, lng: norm.lng });
        setFinalRoutingDestCoords({ lat: norm.lat, lng: norm.lng });
        setDestDirty(false);
      }
    }

    await executeRouteCalculation(nextOrigin, nextDest);
    setIsEditingJourney(false);
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

  const handleSelectRoute = (route: SmartRouteOption) => {
    setSelectedRouteId(route.id);
  };

  const handleSwapEndpoints = () => {
    const tempStartName = resolvedOriginName;
    const tempStartCoords = { ...startCoords };

    const tempEndName = resolvedDestName;
    const tempEndCoords = { ...endCoords };

    setStartName(tempEndName);
    setResolvedOriginName(tempEndName);
    setStartCoords(tempEndCoords);
    setOriginDirty(false);

    setEndName(tempStartName);
    setOriginalUserDestInput(tempStartName);
    setResolvedDestName(tempStartName);
    setEndCoords(tempStartCoords);
    setFinalRoutingDestCoords(tempStartCoords);
    setDestDirty(false);
    setClarificationPrompt(null);
  };

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || routes[0] || null;
  const fastestRoute =
    routes.find((r) => r.type === 'fastest') ||
    routes.reduce(
      (min, r) => (!min || r.durationSeconds < min.durationSeconds ? r : min),
      routes[0] as SmartRouteOption | undefined
    );

  const shortOriginName = resolvedOriginName.split(',')[0].trim();
  const shortDestName = resolvedDestName.split(',')[0].trim();

  // Keep map clean with only emergency help points and incidents so routes remain the focal point
  const activeMapLayers = new Set<MapLayerCategory>(['hospital', 'police', 'incident']);

  const getDisplayRouteTitle = (route: SmartRouteOption) => {
    if (route.isRecommended && route.type === 'fastest') return 'Safest & fastest route';
    if (route.isRecommended) return 'Safest route';
    if (route.type === 'fastest') return 'Fastest route';
    return 'Higher activity route';
  };

  const getCardActionLabel = (route: SmartRouteOption, isSelected: boolean) => {
    const base = route.isRecommended
      ? 'safest route'
      : route.type === 'fastest'
      ? 'fastest route'
      : 'higher activity route';
    return isSelected ? `Selected ${base}` : `Select ${base}`;
  };

  const getDynamicNarrative = (route: SmartRouteOption) => {
    const routeMins = Math.max(1, Math.round(route.durationSeconds / 60));
    const fastMins = fastestRoute
      ? Math.max(1, Math.round(fastestRoute.durationSeconds / 60))
      : routeMins;
    const extraMins = Math.max(0, routeMins - fastMins);

    if (route.isRecommended) {
      if (extraMins > 0) {
        return `For ${extraMins} extra minute${
          extraMins === 1 ? '' : 's'
        }, this route has a shorter observed low-activity stretch, more places listed as open per kilometre and a higher main-road share.`;
      }
      return `Matches the fastest travel duration while maintaining a shorter observed low-activity stretch, more places listed as open per kilometre and ${route.mainRoadCoveragePercent}% main-road share.`;
    }

    if (route.type === 'fastest') {
      return `Lowest estimated ${
        mode === 'car' ? 'driving' : mode === 'foot' ? 'walking' : 'cycling'
      } duration (${routeMins} min) across ${route.summaryRoads} with ${
        route.mainRoadCoveragePercent
      }% primary road share.`;
    }

    return `Prioritises active commercial corridors (${route.summaryRoads}) with ${route.nightActivity.factors.establishmentsCount} open places and ${route.documentedHelpPointsCount} help points along the route.`;
  };

  const formatGapLabel = (gapKm: number) => {
    const meters = Math.round(gapKm * 1000);
    if (meters < 1000) {
      return `~${Math.max(100, Math.round(meters / 50) * 50)} m`;
    }
    return `~${gapKm.toFixed(1)} km`;
  };

  return (
    <div className="w-full text-[#F5F7FA] space-y-5">
      {/* Main Minimalist Two-Column Layout: Compact Left Panel + Large Map on the Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN: Compact Route Selection Panel */}
        <div
          className={`${
            isMapFullScreen ? 'hidden' : 'lg:col-span-5 xl:col-span-4'
          } flex flex-col justify-between bg-[#0A0C0F] border border-white/[0.07] rounded-2xl p-5 space-y-4 transition-all duration-200`}
        >
          <div className="space-y-4">
            {/* Top Row: "<- Edit journey" & Mode / Time Quick Pill */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsEditingJourney((prev) => !prev)}
                className="urbanshield-interactive-btn inline-flex items-center gap-2 text-xs text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer group"
              >
                <ArrowLeft className="w-3.5 h-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
                <span>{isEditingJourney ? 'Close journey editor' : 'Edit journey'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingJourney((prev) => !prev)}
                className="urbanshield-interactive-btn inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.08] bg-[#101317] hover:bg-[#15191E] text-[11px] text-[#F5F7FA] cursor-pointer"
              >
                {isNightJourney ? (
                  <Moon className="w-3 h-3 text-[#00D9F5]" />
                ) : (
                  <Sun className="w-3 h-3 text-[#F59E0B]" />
                )}
                <span className="font-mono tabular-nums">{departureTime}</span>
                <span className="text-[#929AA5]">·</span>
                <span className="capitalize">
                  {mode === 'car' ? 'Drive' : mode === 'foot' ? 'Walk' : 'Bike'}
                </span>
                <SlidersHorizontal className="w-3 h-3 text-[#929AA5] ml-0.5" />
              </button>
            </div>

            {/* Header Title & Corridor Subtitle */}
            <div className="space-y-1">
              <h1 className="urbanshield-heading-enter font-display text-2xl font-bold tracking-tight text-[#F5F7FA]">
                Your route options
              </h1>
              <button
                type="button"
                onClick={() => setIsEditingJourney(true)}
                className="urbanshield-subtext-enter flex items-center gap-2 text-xs text-[#929AA5] hover:text-[#F5F7FA] transition-colors duration-150 text-left cursor-pointer max-w-full"
              >
                <span className="truncate max-w-[160px] sm:max-w-[200px]">{shortOriginName}</span>
                <span className="text-[#929AA5] shrink-0">→</span>
                <span className="truncate max-w-[160px] sm:max-w-[200px]">{shortDestName}</span>
              </button>
            </div>

            {/* Collapsible Journey Input Drawer */}
            {isEditingJourney && (
              <div className="p-3.5 rounded-xl bg-[#101317] border border-white/[0.08] space-y-3 urbanshield-card-enter">
                {/* Transport Mode & Time Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center bg-[#050607] border border-white/[0.07] rounded-lg p-0.5">
                    {[
                      { id: 'car' as TravelMode, label: 'Drive', icon: Car },
                      { id: 'foot' as TravelMode, label: 'Walk', icon: Footprints },
                      { id: 'bike' as TravelMode, label: 'Bike', icon: Bike },
                    ].map((m) => {
                      const Icon = m.icon;
                      const active = mode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMode(m.id)}
                          className={`urbanshield-interactive-btn flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-[#15191E] text-[#00D9F5] border border-[#00D9F5]/40'
                              : 'text-[#929AA5] hover:text-[#F5F7FA]'
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                          <span>{m.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 bg-[#050607] border border-white/[0.07] rounded-lg px-2 py-1 text-[11px]">
                      <Clock className="w-3 h-3 text-[#929AA5]" />
                      <input
                        type="time"
                        value={departureTime}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDepartureTime(val);
                          const hour = parseInt(val.split(':')[0] || '22', 10);
                          setIsNightJourney(hour >= 19 || hour < 6);
                        }}
                        className="bg-transparent font-mono text-[11px] text-[#F5F7FA] focus:outline-none"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsNightJourney(!isNightJourney)}
                      className={`urbanshield-interactive-btn p-1.5 rounded-lg border cursor-pointer ${
                        isNightJourney
                          ? 'bg-[#15191E] border-[#00D9F5]/40 text-[#00D9F5]'
                          : 'bg-[#050607] border-white/[0.07] text-[#929AA5] hover:text-[#F5F7FA]'
                      }`}
                      title={
                        isNightJourney ? 'Night journey scoring active' : 'Daytime scoring active'
                      }
                    >
                      {isNightJourney ? (
                        <Moon className="w-3.5 h-3.5" />
                      ) : (
                        <Sun className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Origin Input */}
                <div className="relative">
                  <div className="flex items-center gap-2 bg-[#050607] border border-white/[0.08] focus-within:border-[#00D9F5] rounded-lg px-2.5 py-2">
                    <span className="w-4 h-4 rounded-full bg-[#3B82F6] text-white font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                      A
                    </span>
                    <input
                      type="text"
                      value={startName}
                      onFocus={() => setActiveAutocomplete('origin')}
                      onBlur={() => setTimeout(() => setActiveAutocomplete(null), 200)}
                      onChange={(e) => {
                        setStartName(e.target.value);
                        setOriginDirty(true);
                        setClarificationPrompt(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setActiveAutocomplete(null);
                          resolveAndApplyJourneyInputs();
                        }
                      }}
                      placeholder="Origin in Chandigarh or Mohali..."
                      className="w-full bg-transparent text-xs text-[#F5F7FA] placeholder:text-[#929AA5]/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const norm = ensureLatLngOrder(userLocation.lat, userLocation.lng);
                        setStartName('Current GPS Location');
                        setResolvedOriginName('Current GPS Location');
                        setStartCoords({ lat: norm.lat, lng: norm.lng });
                        setOriginDirty(false);
                        setClarificationPrompt(null);
                      }}
                      title="Use current GPS location"
                      className="text-[#929AA5] hover:text-[#00D9F5] cursor-pointer shrink-0"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {activeAutocomplete === 'origin' && originSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#101317] border border-white/[0.09] rounded-lg shadow-2xl max-h-48 overflow-y-auto divide-y divide-white/[0.05]">
                      {originSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={() => {
                            const norm = ensureLatLngOrder(s.latitude, s.longitude);
                            setStartName(s.name);
                            setResolvedOriginName(s.name);
                            setStartCoords({ lat: norm.lat, lng: norm.lng });
                            setOriginDirty(false);
                            setClarificationPrompt(null);
                            setActiveAutocomplete(null);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-[#15191E] flex items-center justify-between gap-2 text-xs cursor-pointer"
                        >
                          <span className="text-[#F5F7FA] truncate">{s.name}</span>
                          <span className="text-[10px] font-mono text-[#929AA5] shrink-0">
                            {s.source === 'Nominatim OSM' ? 'OSM' : 'Verified'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Destination Input + Swap */}
                <div className="relative">
                  <div className="flex items-center gap-2 bg-[#050607] border border-white/[0.08] focus-within:border-[#00D9F5] rounded-lg px-2.5 py-2">
                    <span className="w-4 h-4 rounded-full bg-[#FF4148] text-white font-mono text-[9px] font-bold flex items-center justify-center shrink-0">
                      B
                    </span>
                    <input
                      type="text"
                      value={endName}
                      onFocus={() => setActiveAutocomplete('dest')}
                      onBlur={() => setTimeout(() => setActiveAutocomplete(null), 200)}
                      onChange={(e) => {
                        setEndName(e.target.value);
                        setOriginalUserDestInput(e.target.value);
                        setDestDirty(true);
                        setClarificationPrompt(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setActiveAutocomplete(null);
                          resolveAndApplyJourneyInputs();
                        }
                      }}
                      placeholder="Destination in Chandigarh or Mohali..."
                      className="w-full bg-transparent text-xs text-[#F5F7FA] placeholder:text-[#929AA5]/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSwapEndpoints}
                      title="Swap Origin & Destination"
                      className="text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer shrink-0"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = saveUserLocationBookmark({
                          label: resolvedDestName.split(',')[0],
                          address: resolvedDestName,
                          latitude: endCoords.lat,
                          longitude: endCoords.lng,
                          category: 'custom',
                        });
                        setSavedLocations(next);
                      }}
                      title="Bookmark destination"
                      className="text-[#929AA5] hover:text-[#00D9F5] cursor-pointer shrink-0"
                    >
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {activeAutocomplete === 'dest' && destSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#101317] border border-white/[0.09] rounded-lg shadow-2xl max-h-48 overflow-y-auto divide-y divide-white/[0.05]">
                      {destSuggestions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={() => {
                            const norm = ensureLatLngOrder(s.latitude, s.longitude);
                            setOriginalUserDestInput(
                              destDirty && endName.trim() ? endName.trim() : s.name
                            );
                            setEndName(s.name);
                            setResolvedDestName(s.name);
                            setEndCoords({ lat: norm.lat, lng: norm.lng });
                            setFinalRoutingDestCoords({ lat: norm.lat, lng: norm.lng });
                            setDestDirty(false);
                            setClarificationPrompt(null);
                            setActiveAutocomplete(null);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-[#15191E] flex items-center justify-between gap-2 text-xs cursor-pointer"
                        >
                          <span className="text-[#F5F7FA] truncate">{s.name}</span>
                          <span className="text-[10px] font-mono text-[#929AA5] shrink-0">
                            {s.source === 'Nominatim OSM' ? 'OSM' : 'Verified'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clarification Selector when multiple locations match ambiguously */}
                {clarificationPrompt && (
                  <div className="p-2.5 rounded-lg bg-[#15191E] border border-[#00D9F5]/40 space-y-2">
                    <div className="text-[11px] text-[#00D9F5] font-medium">
                      {clarificationPrompt.reason}
                    </div>
                    <div className="space-y-1">
                      {clarificationPrompt.candidates.map((cand) => (
                        <button
                          key={cand.id}
                          type="button"
                          onClick={() => {
                            const norm = ensureLatLngOrder(cand.latitude, cand.longitude);
                            if (clarificationPrompt.field === 'origin') {
                              setStartName(cand.name);
                              setResolvedOriginName(cand.name);
                              setStartCoords({ lat: norm.lat, lng: norm.lng });
                              setOriginDirty(false);
                            } else {
                              setEndName(cand.name);
                              setResolvedDestName(cand.name);
                              setEndCoords({ lat: norm.lat, lng: norm.lng });
                              setFinalRoutingDestCoords({ lat: norm.lat, lng: norm.lng });
                              setDestDirty(false);
                            }
                            setClarificationPrompt(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded bg-[#0A0C0F] hover:bg-[#101317] border border-white/[0.08] text-left flex items-center justify-between gap-2 text-[11px] text-[#F5F7FA] cursor-pointer"
                        >
                          <span className="truncate">{cand.name}</span>
                          <span className="font-mono text-[10px] text-[#929AA5] shrink-0">
                            {cand.latitude.toFixed(4)}, {cand.longitude.toFixed(4)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Preset Corridors + Update Action */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1">
                    {ROUTE_PRESETS.slice(0, 4).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          const normOrig = ensureLatLngOrder(preset.start.lat, preset.start.lng);
                          const normDest = ensureLatLngOrder(preset.end.lat, preset.end.lng);
                          setStartName(preset.start.name);
                          setResolvedOriginName(preset.start.name);
                          setStartCoords({ lat: normOrig.lat, lng: normOrig.lng });
                          setOriginDirty(false);

                          setOriginalUserDestInput(preset.end.name.split('(')[0].trim());
                          setEndName(preset.end.name);
                          setResolvedDestName(preset.end.name);
                          setEndCoords({ lat: normDest.lat, lng: normDest.lng });
                          setFinalRoutingDestCoords({ lat: normDest.lat, lng: normDest.lng });
                          setDestDirty(false);
                          setClarificationPrompt(null);
                          setError(null);
                        }}
                        className="px-2 py-0.5 rounded bg-[#050607] hover:bg-[#15191E] border border-white/[0.07] text-[10px] text-[#929AA5] hover:text-[#F5F7FA] transition-colors duration-150 cursor-pointer whitespace-nowrap"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={resolveAndApplyJourneyInputs}
                    className="urbanshield-interactive-btn px-3 py-1 rounded-md bg-[#00D9F5] hover:bg-[#00D9F5]/90 text-[#050607] font-semibold text-[11px] cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-[#FF4148]/10 border border-[#FF4148]/30 text-xs text-[#FF4148]">
                {error}
              </div>
            )}

            {/* THREE COMPACT ROUTE CARDS */}
            <div className="space-y-3">
              {loading && routes.length === 0
                ? [0, 1, 2].map((skeletonIdx) => (
                    <div
                      key={skeletonIdx}
                      className="p-4 rounded-xl bg-[#101317] border border-white/[0.06] animate-pulse space-y-2.5"
                    >
                      <div className="h-4 w-44 bg-[#15191E] rounded" />
                      <div className="h-3 w-full bg-[#15191E] rounded" />
                      <div className="h-3 w-4/5 bg-[#15191E] rounded" />
                      <div className="h-8 w-full bg-[#15191E] rounded-lg mt-2" />
                    </div>
                  ))
                : routes.slice(0, 3).map((route, idx) => {
                    const isSelected = route.id === selectedRoute?.id;
                    const isRec = route.isRecommended;
                    const distKm = (route.distanceMeters / 1000).toFixed(1);
                    const mins = Math.max(1, Math.round(route.durationSeconds / 60));
                    const openPlacesCount =
                      route.nightActivity.factors.establishmentsCount +
                      route.nearbyPoisCount.hospitals +
                      route.nearbyPoisCount.police;

                    return (
                      <div
                        key={route.id}
                        onClick={() => handleSelectRoute(route)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectRoute(route);
                          }
                        }}
                        className={`urbanshield-card-enter stagger-${
                          idx + 1
                        } urbanshield-surface-hover group relative rounded-xl p-4 text-left cursor-pointer select-none ${
                          isRec
                            ? isSelected
                              ? 'bg-[#101317] border border-[#00D9F5] shadow-[0_0_24px_-6px_rgba(0,217,245,0.22)]'
                              : 'bg-[#101317]/80 border border-[#00D9F5]/40 hover:border-[#00D9F5]'
                            : isSelected
                            ? 'bg-[#101317] border border-white/50 shadow-[0_0_18px_-8px_rgba(255,255,255,0.16)]'
                            : 'bg-[#101317]/60 border border-white/[0.06] hover:border-white/[0.15] hover:bg-[#101317]'
                        }`}
                      >
                        {/* Title Line: e.g. "Safest route · 12 min · 4.7 km" */}
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline flex-wrap gap-x-1.5">
                            <span
                              className={`font-display text-base font-bold tracking-tight ${
                                isRec ? 'text-[#00D9F5]' : 'text-[#F5F7FA]'
                              }`}
                            >
                              {getDisplayRouteTitle(route)}
                            </span>
                            <span className="text-[#F5F7FA] font-display text-base font-bold">
                              ·
                            </span>
                            <span className="font-mono text-base font-bold text-[#F5F7FA] tabular-nums">
                              {mins} min
                            </span>
                            <span className="text-[#929AA5] text-xs font-mono tabular-nums">
                              · {distKm} km
                            </span>
                          </div>

                          {route.nightActivity.overallScore !== null && (
                            <span
                              className={`font-mono text-[11px] tabular-nums shrink-0 ${
                                isRec ? 'text-[#F59E0B]' : 'text-[#929AA5]'
                              }`}
                            >
                              Score {route.nightActivity.overallScore}
                            </span>
                          )}
                        </div>

                        {/* Concise comparative description */}
                        <p className="mt-2 text-xs text-[#F5F7FA]/85 leading-relaxed">
                          {getDynamicNarrative(route)}
                        </p>

                        {/* Two concise factual bullets */}
                        <ul className="mt-2.5 space-y-1 text-[11px] text-[#929AA5]">
                          <li className="flex items-start gap-2">
                            <span className="text-[#929AA5] leading-tight">•</span>
                            <span>
                              <strong className="text-[#F5F7FA] font-medium tabular-nums">
                                {openPlacesCount} places
                              </strong>{' '}
                              listed as open around your passing time
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-[#929AA5] leading-tight">•</span>
                            <span>
                              <strong className="text-[#F5F7FA] font-medium tabular-nums">
                                {route.documentedHelpPointsCount} listed open help points
                              </strong>{' '}
                              · longest gap {formatGapLabel(route.longestGapBetweenHelpPointsKm)}
                            </span>
                          </li>
                        </ul>

                        {/* Action Button inside Card */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRoute(route);
                          }}
                          className={`urbanshield-interactive-btn mt-3.5 w-full py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? isRec
                                ? 'bg-[#00D9F5]/15 border-[#00D9F5] text-[#00D9F5]'
                                : 'bg-white/10 border-white/50 text-[#F5F7FA]'
                              : 'bg-[#15191E] hover:bg-[#1C2128] border-white/[0.08] text-[#F5F7FA]'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                          <span>{getCardActionLabel(route, isSelected)}</span>
                        </button>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Large Map Container */}
        <div
          className={`${
            isMapFullScreen ? 'lg:col-span-12' : 'lg:col-span-7 xl:col-span-8'
          } flex flex-col justify-between bg-[#0A0C0F] border border-white/[0.07] rounded-2xl p-4 sm:p-5 transition-all duration-200 ${
            selectedRoute?.isRecommended
              ? 'shadow-[0_0_28px_-12px_rgba(0,217,245,0.2)]'
              : 'shadow-[0_0_28px_-12px_rgba(255,255,255,0.06)]'
          }`}
        >
          {/* Map Top Header Bar: Region Label + Full screen Button + Route Pill Switcher */}
          <div className="space-y-3 mb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-[#929AA5]">
                <MapPin className="w-3.5 h-3.5 text-[#929AA5] shrink-0" />
                <span>Chandigarh · Mohali Corridor</span>
              </div>

              <button
                type="button"
                onClick={() => setIsMapFullScreen((prev) => !prev)}
                className="urbanshield-interactive-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#101317] hover:bg-[#15191E] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] cursor-pointer"
              >
                {isMapFullScreen ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-[#929AA5]" />
                    <span>Exit full screen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-[#929AA5]" />
                    <span>Full screen</span>
                  </>
                )}
              </button>
            </div>

            {/* Route Quick Switcher Pills inside Map Card */}
            {routes.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {routes.slice(0, 3).map((route) => {
                  const isSelected = route.id === selectedRoute?.id;
                  const isRec = route.isRecommended;
                  const mins = Math.max(1, Math.round(route.durationSeconds / 60));

                  return (
                    <button
                      key={`pill-${route.id}`}
                      type="button"
                      onClick={() => handleSelectRoute(route)}
                      className={`urbanshield-interactive-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? isRec
                            ? 'bg-[#101317] border-2 border-[#00D9F5] text-[#F5F7FA] shadow-[0_0_12px_rgba(0,217,245,0.2)]'
                            : 'bg-[#101317] border-2 border-[#F5F7FA] text-[#F5F7FA]'
                          : 'bg-[#101317]/60 border border-white/[0.07] text-[#929AA5] hover:text-[#F5F7FA] hover:border-white/[0.15]'
                      }`}
                    >
                      {isSelected && (
                        <Check
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isRec ? 'text-[#00D9F5]' : 'text-[#F5F7FA]'
                          }`}
                        />
                      )}
                      <span>
                        {getDisplayRouteTitle(route)} ·{' '}
                        <span className="font-mono tabular-nums">{mins} min</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Interactive Leaflet Map Viewport with Smooth Loading Overlay */}
          <div className="relative flex-1 min-h-[440px] lg:min-h-[540px] rounded-xl overflow-hidden">
            {loading && (
              <div className="absolute inset-0 z-[500] bg-[#050607]/60 backdrop-blur-[2px] flex items-center justify-center transition-opacity duration-200">
                <div className="px-4 py-2 rounded-lg bg-[#101317] border border-white/[0.08] text-xs font-mono text-[#00D9F5] flex items-center gap-2 shadow-xl">
                  <span className="w-2 h-2 rounded-full bg-[#00D9F5] animate-ping" />
                  <span>Calculating road network geometry...</span>
                </div>
              </div>
            )}

            <InteractiveCityMap
              center={CHANDIGARH_CENTER}
              userLocation={userLocation}
              pois={pois}
              reports={reports}
              crimeRecords={[]}
              activeLayers={activeMapLayers}
              selectedPoi={null}
              onSelectPoi={() => {}}
              routes={routes}
              selectedRouteId={selectedRoute?.id}
              onSelectRoute={(id) => {
                const found = routes.find((r) => r.id === id);
                if (found) handleSelectRoute(found);
              }}
              originCoords={{ lat: startCoords.lat, lng: startCoords.lng, label: shortOriginName }}
              destinationCoords={{
                lat: finalRoutingDestCoords.lat,
                lng: finalRoutingDestCoords.lng,
                label: shortDestName,
              }}
              heightClass="h-full min-h-[440px] lg:min-h-[540px]"
              maxMarkers={40}
            />
          </div>

          {/* Minimal Bottom Metrics & Endpoint Bar */}
          <div className="mt-3 pt-2.5 border-t border-white/[0.06] space-y-1.5">
            {/* Row 1: Endpoints A & B + Minimal Route Metrics */}
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 text-xs">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-mono font-bold text-[#F5F7FA]">A</span>
                  <span className="text-[#929AA5] truncate max-w-[180px] sm:max-w-[240px]">
                    {shortOriginName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-mono font-bold text-[#F5F7FA]">B</span>
                  <span className="text-[#929AA5] truncate max-w-[180px] sm:max-w-[240px]">
                    {shortDestName}
                  </span>
                </div>
              </div>

              {selectedRoute && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-[#929AA5] tabular-nums">
                  <span className="text-[#F5F7FA] font-semibold">
                    {(selectedRoute.distanceMeters / 1000).toFixed(1)} km
                  </span>
                  <span>·</span>
                  <span>{selectedRoute.mainRoadCoveragePercent}% main road</span>
                  <span>·</span>
                  <span>{selectedRoute.documentedHelpPointsCount} help points</span>
                  <span>·</span>
                  <span>
                    gap {formatGapLabel(selectedRoute.longestGapBetweenHelpPointsKm)}
                  </span>
                </div>
              )}
            </div>

            {/* Row 2: Highlight Caption */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#929AA5]">
              <p>
                <span className="text-[#F5F7FA] font-medium">
                  {selectedRoute ? getDisplayRouteTitle(selectedRoute) : 'Safest route'}
                </span>{' '}
                is highlighted.{' '}
                <span className="text-[#929AA5]">Tap another option to compare.</span>
              </p>
              <span className="text-[11px] text-[#929AA5]/70 underline decoration-white/15">
                © OpenStreetMap contributors
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progressive Disclosure: Hide detailed analytical breakdowns behind "Route details" */}
      {selectedRoute && (
        <ExpandableDetails
          label="Route details"
          openLabel="Hide route details"
          variant="pill"
          storageKey="smart_routes_details"
          contentClassName="pt-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-[#0A0C0F] border border-white/[0.06] rounded-2xl p-5 text-xs">
            {/* 1. Emergency Facility Breakdown */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#00D9F5]">
                Emergency facility breakdown
              </div>
              <div className="grid grid-cols-2 gap-2 text-[#929AA5]">
                <div>
                  Hospitals / Clinics:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {selectedRoute.nearbyPoisCount.hospitals}
                  </strong>
                </div>
                <div>
                  Police Stations:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {selectedRoute.nearbyPoisCount.police}
                  </strong>
                </div>
                <div>
                  Pharmacies:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {selectedRoute.nearbyPoisCount.pharmacies}
                  </strong>
                </div>
                <div>
                  24/7 Fuel / Commercial:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {selectedRoute.nearbyPoisCount.activeEstablishments}
                  </strong>
                </div>
              </div>
              <p className="text-[11px] text-[#929AA5] leading-relaxed">
                {selectedRoute.nightActivity.activitySummary}
              </p>
            </div>

            {/* 2. Main-Road Coverage & Longest Help-Point Gap */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#F59E0B]">
                Main-road coverage &amp; help-point gap
              </div>
              <div className="space-y-1 text-[#929AA5]">
                <div>
                  Primary road share:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {selectedRoute.mainRoadCoveragePercent}%
                  </strong>{' '}
                  ({selectedRoute.summaryRoads})
                </div>
                <div>
                  Longest help-point gap:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {formatGapLabel(selectedRoute.longestGapBetweenHelpPointsKm)}
                  </strong>{' '}
                  across {selectedRoute.documentedHelpPointsCount} documented help points
                </div>
              </div>
              <p className="text-[11px] text-[#929AA5] leading-relaxed">
                {selectedRoute.nightActivity.infrastructureSummary}
              </p>
            </div>

            {/* 3. Activity Scoring Methodology, Crime Exposure & Data Confidence */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                Methodology, crime context &amp; confidence
              </div>
              <div className="space-y-1 text-[#929AA5]">
                <div>
                  Data confidence:{' '}
                  <strong className="text-[#F5F7FA] font-mono">
                    {selectedRoute.nightActivity.confidencePercentage}%
                  </strong>{' '}
                  ({selectedRoute.nightActivity.confidenceTier})
                </div>
                <div className="text-[11px] leading-relaxed">
                  {selectedRoute.nightActivity.historicalCrimeExposure}
                </div>
              </div>
              <p className="text-[11px] text-[#929AA5] leading-relaxed">
                Weights: Commercial ({selectedRoute.nightActivity.weightsUsed.establishments}%),
                Main roads ({selectedRoute.nightActivity.weightsUsed.mainRoads}%), Emergency (
                {selectedRoute.nightActivity.weightsUsed.emergencyServices}%), Transit (
                {selectedRoute.nightActivity.weightsUsed.transport}%), Lighting (
                {selectedRoute.nightActivity.weightsUsed.streetlights}%). Never claims guaranteed
                safety.
              </p>
            </div>
          </div>
        </ExpandableDetails>
      )}
    </div>
  );
};
