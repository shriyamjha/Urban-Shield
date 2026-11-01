import React, { useMemo } from 'react';
import {
  MapPin,
  Navigation,
  Siren,
  CloudSun,
  Crosshair,
  ArrowUpRight,
} from 'lucide-react';
import {
  CityPoi,
  CommunityReport,
  MapLayerCategory,
  NavigationSection,
  SosIncident,
  WeatherTelemetry,
} from '../types/urbanshield.ts';
import { InteractiveCityMap } from './InteractiveCityMap.tsx';
import { haversineDistanceKm } from '../data/chandigarhMohaliBaseline.ts';
import { HISTORICAL_CRIME_DATABASE } from '../data/historicalCrimeData.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  AnimatedPanel,
  ExpandableDetails,
  CompactMetric,
} from './ui/ProgressivePrimitives.tsx';

interface OverviewDashboardViewProps {
  userLocation: { lat: number; lng: number };
  onRequestBrowserLocation: () => void;
  pois: CityPoi[];
  reports: CommunityReport[];
  sosIncidents: SosIncident[];
  weather: WeatherTelemetry[];
  onNavigateSection: (sec: NavigationSection) => void;
  onRouteToPoi: (poi: CityPoi) => void;
  onTriggerSosModal: () => void;
}

export const OverviewDashboardView: React.FC<OverviewDashboardViewProps> = ({
  userLocation,
  onRequestBrowserLocation,
  pois,
  reports,
  sosIncidents,
  weather,
  onNavigateSection,
  onRouteToPoi,
  onTriggerSosModal,
}) => {
  const { user, contacts } = useAuth();

  const firstName = useMemo(() => {
    const raw = user?.fullName?.trim();
    if (!raw) return 'there';
    return raw.split(' ')[0];
  }, [user?.fullName]);

  const nearestHelpPoints = useMemo(() => {
    return pois
      .filter((p) => ['hospital', 'police', 'pharmacy'].includes(p.category))
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
      .sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))
      .slice(0, 4);
  }, [pois, userLocation]);

  // Keep default map clean: only essential help facilities
  const defaultMapLayers = useMemo(
    () => new Set<MapLayerCategory>(['hospital', 'police', 'pharmacy']),
    []
  );

  const chdWeather = weather[0];

  const infraBreakdown = useMemo(() => {
    return {
      hospitals: pois.filter((p) => p.category === 'hospital' || p.category === 'clinic').length,
      police: pois.filter((p) => p.category === 'police').length,
      pharmacies: pois.filter((p) => p.category === 'pharmacy').length,
      cctv: pois.filter((p) => p.category === 'cctv').length,
      lighting: pois.filter((p) => p.category === 'streetlight').length,
      verifiedReports: reports.filter(
        (r) =>
          r.verificationStatus === 'community_confirmed' ||
          r.verificationStatus === 'moderator_verified'
      ).length,
    };
  }, [pois, reports]);

  return (
    <div className="space-y-6">
      {/* 1. Simple Welcome Heading + 2. Current Location & Location Status + 5. Clear Emergency SOS Control */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div className="space-y-1.5">
          <h1 className="urbanshield-heading-enter font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F7FA]">
            Welcome, {firstName}
          </h1>
          <div className="urbanshield-subtext-enter flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#929AA5]">
            <span className="inline-flex items-center gap-1.5 text-[#F5F7FA]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>{user?.defaultCity || 'Chandigarh'} · Active location</span>
            </span>
            <span>·</span>
            <button
              type="button"
              onClick={onRequestBrowserLocation}
              className="urbanshield-interactive-btn inline-flex items-center gap-1 text-[#00D9F5] hover:underline cursor-pointer"
            >
              <Crosshair className="w-3 h-3" />
              <span>Update GPS</span>
            </button>
          </div>
        </div>

        {/* 5. Clear Emergency SOS Control + Quick Route Action */}
        <div className="urbanshield-subtext-enter flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigateSection('routes')}
            className="urbanshield-interactive-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#101317] hover:bg-[#15191E] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5 text-[#00D9F5]" />
            <span>Plan safe route</span>
          </button>

          <button
            type="button"
            onClick={onTriggerSosModal}
            className="urbanshield-interactive-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF4148] hover:bg-[#FF4148]/90 text-white font-display font-semibold text-xs shadow-[0_8px_24px_-6px_rgba(255,65,72,0.45)] cursor-pointer"
          >
            <Siren className="w-3.5 h-3.5" />
            <span>Emergency SOS</span>
          </button>
        </div>
      </div>

      {/* Main Layout: 3. Prominent Map + 4. Compact Nearest Help Points + 6. Small City Conditions Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* 3. Prominent Map Showing Important Nearby Facilities */}
        <AnimatedPanel stagger={1} className="lg:col-span-8 flex flex-col space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#929AA5]">
              Nearby hospitals, police stations and 24/7 pharmacies
            </span>
            <button
              type="button"
              onClick={() => onNavigateSection('map')}
              className="urbanshield-interactive-btn inline-flex items-center gap-1 text-[#00D9F5] hover:underline cursor-pointer"
            >
              <span>Explore full map</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <InteractiveCityMap
            center={[userLocation.lng, userLocation.lat]}
            userLocation={userLocation}
            pois={pois}
            reports={[]}
            sosIncidents={sosIncidents}
            activeLayers={defaultMapLayers}
            selectedPoi={null}
            onSelectPoi={(poi) => onRouteToPoi(poi)}
            heightClass="h-[460px] lg:h-[500px]"
            maxMarkers={35}
          />
        </AnimatedPanel>

        {/* Right Column: 4. Compact Nearest Help Points + 6. Small City Conditions Summary */}
        <AnimatedPanel
          stagger={2}
          className="lg:col-span-4 flex flex-col justify-between gap-6 bg-[#0A0C0F] border border-white/[0.06] rounded-2xl p-5"
        >
          {/* 4. Compact Nearest-Help-Points Section */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[#F5F7FA]">
                Nearest help points
              </h2>
              <span className="text-[11px] text-[#929AA5]">Tap to route</span>
            </div>

            <div className="divide-y divide-white/[0.05]">
              {nearestHelpPoints.map((poi) => (
                <div
                  key={poi.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#F5F7FA] truncate">
                      {poi.name}
                    </div>
                    <div className="text-[11px] text-[#929AA5] capitalize mt-0.5">
                      {poi.category}
                      {poi.openingHours ? ` · ${poi.openingHours}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="font-mono text-xs text-[#929AA5] tabular-nums">
                      {poi.distanceKm} km
                    </span>
                    <button
                      type="button"
                      onClick={() => onRouteToPoi(poi)}
                      className="urbanshield-interactive-btn px-2.5 py-1 rounded-lg bg-[#101317] hover:bg-[#15191E] border border-white/[0.07] text-[11px] font-medium text-[#00D9F5] cursor-pointer"
                    >
                      Route
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. Small City Conditions Summary & Emergency Readiness */}
          <div className="space-y-4 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CloudSun className="w-4 h-4 text-[#00D9F5] shrink-0" />
                <div>
                  <div className="text-xs font-medium text-[#F5F7FA]">
                    {chdWeather
                      ? `${chdWeather.temperatureC.toFixed(0)}°C · ${chdWeather.weatherDescription}`
                      : 'Chandigarh & Mohali Conditions'}
                  </div>
                  <div className="text-[11px] text-[#929AA5]">
                    {chdWeather && chdWeather.visibilityMeters !== null
                      ? `Visibility ${(chdWeather.visibilityMeters / 1000).toFixed(0)} km · Wind ${
                          chdWeather.windSpeedKmh
                        } km/h`
                      : 'Live meteorological telemetry'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('conditions')}
                className="text-[11px] text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
              >
                View
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#101317] border border-white/[0.06] flex items-center justify-between gap-3">
              <div className="text-xs">
                <div className="font-medium text-[#F5F7FA]">Emergency readiness</div>
                <div className="text-[11px] text-[#929AA5] mt-0.5">
                  {contacts.length > 0
                    ? `${contacts.length} trusted contact${
                        contacts.length === 1 ? '' : 's'
                      } configured`
                    : 'No trusted contacts added yet'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('sos')}
                className="text-xs font-medium text-[#FF4148] hover:underline cursor-pointer shrink-0"
              >
                Manage SOS
              </button>
            </div>
          </div>
        </AnimatedPanel>
      </div>

      {/* Progressive Disclosure: Hide detailed GPS telemetry, verification statistics & infrastructure breakdowns behind "Show details" */}
      <AnimatedPanel stagger={3} className="pt-2 border-t border-white/[0.06]">
        <ExpandableDetails
          label="Show details"
          openLabel="Hide details"
          variant="minimal"
          storageKey="dashboard_telemetry"
          contentClassName="pt-4"
        >
          <div className="p-5 rounded-2xl bg-[#0A0C0F] border border-white/[0.06] space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <CompactMetric
                label="GPS Coordinates"
                value={`${userLocation.lat.toFixed(5)}° N, ${userLocation.lng.toFixed(5)}° E`}
                accent="cyan"
              />
              <CompactMetric label="Verified Facilities" value={pois.length} />
              <CompactMetric
                label="Hospitals & Clinics"
                value={infraBreakdown.hospitals}
              />
              <CompactMetric label="Police Stations" value={infraBreakdown.police} />
              <CompactMetric label="24/7 Pharmacies" value={infraBreakdown.pharmacies} />
              <CompactMetric label="Documented CCTV" value={infraBreakdown.cctv} />
              <CompactMetric label="Lighting Corridors" value={infraBreakdown.lighting} />
              <CompactMetric
                label="Crime Archive (2021–24)"
                value={`${HISTORICAL_CRIME_DATABASE.length} records`}
              />
              <CompactMetric
                label="Verified Community Reports"
                value={infraBreakdown.verifiedReports}
              />
            </div>

            {reports.length > 0 && (
              <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs text-[#929AA5]">
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="w-3.5 h-3.5 text-[#00D9F5] shrink-0" />
                  <span className="text-[#F5F7FA] font-medium">Latest report:</span>
                  <span className="truncate">{reports[0].title}</span>
                  <span>({reports[0].locationLabel})</span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateSection('reports')}
                  className="text-[#00D9F5] hover:underline shrink-0 cursor-pointer"
                >
                  View all reports →
                </button>
              </div>
            )}
          </div>
        </ExpandableDetails>
      </AnimatedPanel>
    </div>
  );
};
