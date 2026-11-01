import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  LayoutDashboard,
  Map,
  Navigation,
  Siren,
  AlertTriangle,
  Flame,
  CloudSun,
  UserCog,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { AuthPage } from './components/AuthPage.tsx';
import { OnboardingModal } from './components/OnboardingModal.tsx';
import { OverviewDashboardView } from './components/OverviewDashboardView.tsx';
import { CityMapView } from './components/CityMapView.tsx';
import { SmartRoutesView } from './components/SmartRoutesView.tsx';
import { HistoricalCrimeView } from './components/HistoricalCrimeView.tsx';
import { SosEmergencyView } from './components/SosEmergencyView.tsx';
import { CommunityReportsView } from './components/CommunityReportsView.tsx';
import { CityConditionsView } from './components/CityConditionsView.tsx';
import { ProfileSettingsView } from './components/ProfileSettingsView.tsx';
import { SosCountdownModal } from './components/SosCountdownModal.tsx';
import {
  CityPoi,
  CommunityReport,
  CommunityResponder,
  NavigationSection,
  ReportVerificationStatus,
  SosIncident,
  WeatherTelemetry,
} from './types/urbanshield.ts';
import { VERIFIED_CHANDIGARH_MOHALI_POIS } from './data/chandigarhMohaliBaseline.ts';

const NAV_ITEMS: Array<{
  id: NavigationSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'routes', label: 'Smart Routes', icon: Navigation },
  { id: 'map', label: 'City Intelligence', icon: Map },
  { id: 'crime', label: 'Crime Hotspots', icon: Flame },
  { id: 'reports', label: 'Community Reports', icon: AlertTriangle },
  { id: 'conditions', label: 'City Conditions', icon: CloudSun },
  { id: 'sos', label: 'SOS', icon: Siren },
  { id: 'profile', label: 'Settings', icon: UserCog },
];

const ACTIVE_SECTION_STORAGE_KEY = 'urbanshield_active_section';

const UrbanShieldCommandCentre: React.FC = () => {
  const { user, preferences, token, loading, logout } = useAuth();

  const [activeSection, setActiveSectionState] = useState<NavigationSection>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY) as NavigationSection | null;
      if (saved && NAV_ITEMS.some((n) => n.id === saved)) {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return 'routes';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const setActiveSection = useCallback((section: NavigationSection) => {
    setActiveSectionState(section);
    try {
      localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, section);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  // User GPS Location (Defaulting to Chandigarh Sector 17 Plaza until browser GPS resolves)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 30.7333,
    lng: 76.7794,
  });

  // Shared City Data State
  const [pois, setPois] = useState<CityPoi[]>(VERIFIED_CHANDIGARH_MOHALI_POIS);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [sosIncidents, setSosIncidents] = useState<SosIncident[]>([]);
  const [responders, setResponders] = useState<CommunityResponder[]>([]);
  const [weather, setWeather] = useState<WeatherTelemetry[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Navigation Target for 1-click routing from GIS Map / Overview
  const [routeTargetPoi, setRouteTargetPoi] = useState<CityPoi | null>(null);

  // Global SOS Countdown Modal
  const [sosModalOpen, setSosModalOpen] = useState(false);

  const buildAuthHeaders = useCallback(
    (includeJson = false): Record<string, string> => {
      const headers: Record<string, string> = {};
      if (includeJson) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      if (user?.id) headers['X-User-Uid'] = user.id;
      if (user?.email) headers['X-User-Email'] = user.email;
      return headers;
    },
    [token, user]
  );

  const requestBrowserLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        // Keep Chandigarh/Mohali default coordinates if declined
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }, []);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const res = await fetch('/api/weather');
      if (res.ok) {
        const data = await res.json();
        setWeather(data.weather || []);
      }
    } catch (err) {
      console.error('Weather fetch error:', err);
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    if (!token) return;
    try {
      const [poisRes, reportsRes, sosRes] = await Promise.allSettled([
        fetch('/api/gis/pois'),
        fetch('/api/reports'),
        fetch('/api/sos', { headers: buildAuthHeaders() }),
      ]);

      if (poisRes.status === 'fulfilled' && poisRes.value.ok) {
        const d = await poisRes.value.json();
        if (d.pois?.length) setPois(d.pois);
      }

      if (reportsRes.status === 'fulfilled' && reportsRes.value.ok) {
        const d = await reportsRes.value.json();
        if (d.reports) setReports(d.reports);
      }

      if (sosRes.status === 'fulfilled' && sosRes.value.ok) {
        const d = await sosRes.value.json();
        if (d.incidents) setSosIncidents(d.incidents);
        if (d.responders) setResponders(d.responders);
      }
    } catch (err) {
      console.error('Error loading initial city data:', err);
    }
  }, [token, buildAuthHeaders]);

  useEffect(() => {
    if (!user) return;
    requestBrowserLocation();
    fetchInitialData();
    fetchWeather();
  }, [user, requestBrowserLocation, fetchInitialData, fetchWeather]);

  // Real-Time WebSocket Connection
  useEffect(() => {
    if (!user) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectWs = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'init:state' && msg.payload) {
            if (msg.payload.communityReports) setReports(msg.payload.communityReports);
            if (msg.payload.responders) setResponders(msg.payload.responders);
          } else if (msg.type === 'sos:created' && msg.payload) {
            const incoming = msg.payload as SosIncident;
            setSosIncidents((prev) =>
              prev.some((i) => i.id === incoming.id) ? prev : [incoming, ...prev]
            );
          } else if (msg.type === 'sos:updated' && msg.payload) {
            const updated = msg.payload as SosIncident;
            setSosIncidents((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
          } else if (msg.type === 'responders:updated' && msg.payload) {
            setResponders(msg.payload as CommunityResponder[]);
          } else if (msg.type === 'report:created' && msg.payload) {
            const rep = msg.payload as CommunityReport;
            setReports((prev) => (prev.some((r) => r.id === rep.id) ? prev : [rep, ...prev]));
          } else if (msg.type === 'report:updated' && msg.payload) {
            const rep = msg.payload as CommunityReport;
            setReports((prev) => prev.map((r) => (r.id === rep.id ? rep : r)));
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 4000);
      };
    };

    connectWs();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [user]);

  const handleConfirmActivateSos = async (notes: string, areaLabel: string) => {
    setSosModalOpen(false);
    if (!token) return;
    try {
      const res = await fetch('/api/sos/activate', {
        method: 'POST',
        headers: buildAuthHeaders(true),
        body: JSON.stringify({
          latitude: userLocation.lat,
          longitude: userLocation.lng,
          areaLabel,
          notes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSosIncidents((prev) =>
          prev.some((i) => i.id === data.incident.id) ? prev : [data.incident, ...prev]
        );
        setActiveSection('sos');
      }
    } catch (err) {
      console.error('SOS activation failed:', err);
    }
  };

  const handleRespondToIncident = async (
    incidentId: string,
    action: 'acknowledged' | 'declined',
    responderId?: string
  ) => {
    if (!token) return;
    const res = await fetch(`/api/sos/${incidentId}/respond`, {
      method: 'POST',
      headers: buildAuthHeaders(true),
      body: JSON.stringify({ action, responderId }),
    });
    if (res.ok) {
      const data = await res.json();
      setSosIncidents((prev) =>
        prev.map((i) => (i.id === data.incident.id ? data.incident : i))
      );
    }
  };

  const handleUpdateIncidentStatus = async (
    incidentId: string,
    status: 'resolved' | 'cancelled'
  ) => {
    if (!token) return;
    const res = await fetch(`/api/sos/${incidentId}/status`, {
      method: 'POST',
      headers: buildAuthHeaders(true),
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const data = await res.json();
      setSosIncidents((prev) =>
        prev.map((i) => (i.id === data.incident.id ? data.incident : i))
      );
    }
  };

  const handleRegisterResponder = async (payload: Partial<CommunityResponder>) => {
    if (!token) return;
    const res = await fetch('/api/responders/register', {
      method: 'POST',
      headers: buildAuthHeaders(true),
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.responders) setResponders(data.responders);
    }
  };

  const handleSubmitReport = async (payload: Partial<CommunityReport>) => {
    if (!token) return;
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: buildAuthHeaders(true),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit report.');
    setReports((prev) =>
      prev.some((r) => r.id === data.report.id) ? prev : [data.report, ...prev]
    );
  };

  // Optimistic toggle with rollback on failure
  const handleConfirmReport = async (reportId: string) => {
    if (!token || !user) return;

    const previousReports = reports;
    setReports((prev) =>
      prev.map((rep) => {
        if (rep.id !== reportId) return rep;
        const alreadyConfirmed = rep.confirmedByUserIds.includes(user.id);
        const nextIds = alreadyConfirmed
          ? rep.confirmedByUserIds.filter((id) => id !== user.id)
          : [...rep.confirmedByUserIds, user.id];
        const nextCount = nextIds.length;
        let nextStatus = rep.verificationStatus;
        if (nextStatus === 'pending' && nextCount >= 3) {
          nextStatus = 'community_confirmed';
        } else if (nextStatus === 'community_confirmed' && nextCount < 3) {
          nextStatus = 'pending';
        }
        return {
          ...rep,
          confirmedByUserIds: nextIds,
          confirmationsCount: nextCount,
          verificationStatus: nextStatus,
        };
      })
    );

    try {
      const res = await fetch(`/api/reports/${reportId}/confirm`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Confirmation update failed.');
      }
      if (data.report) {
        setReports((prev) => prev.map((r) => (r.id === data.report.id ? data.report : r)));
      }
    } catch (err) {
      setReports(previousReports);
      throw err;
    }
  };

  const handleUpdateReportStatus = async (
    reportId: string,
    verificationStatus: ReportVerificationStatus
  ) => {
    if (!token) return;
    const res = await fetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: buildAuthHeaders(true),
      body: JSON.stringify({ verificationStatus }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update report status.');
    }
    if (data.report) {
      setReports((prev) => prev.map((r) => (r.id === data.report.id ? data.report : r)));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050607] text-[#F5F7FA] flex items-center justify-center">
        <div className="text-center space-y-2 urbanshield-fade-in">
          <div className="font-display text-sm font-semibold tracking-wider text-[#F5F7FA]">
            UrbanShield
          </div>
          <div className="text-xs text-[#929AA5]">
            Loading city intelligence layers...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!user.onboardingCompleted) {
    return (
      <OnboardingModal
        onComplete={(coords) => {
          if (coords) setUserLocation(coords);
        }}
      />
    );
  }

  const isUserModerator =
    Boolean(user.isModerator) ||
    responders.some((r) => r.userId === user.id && r.verifiedResponder);

  return (
    <div className="min-h-screen bg-[#050607] text-[#F5F7FA] flex flex-col lg:flex-row">
      {/* Minimalist Left Sidebar Navigation (220px width) */}
      <aside className="hidden lg:flex lg:w-[220px] bg-[#0A0C0F] border-r border-white/[0.06] flex-col justify-between shrink-0">
        <div>
          <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#101317] border border-[#00D9F5]/30 flex items-center justify-center text-[#00D9F5]">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-display text-sm font-semibold tracking-tight text-[#F5F7FA] block leading-none">
                  UrbanShield
                </span>
                <span className="font-mono text-[9px] text-[#929AA5] uppercase tracking-wider">
                  Chandigarh · Mohali
                </span>
              </div>
            </div>
          </div>

          <nav className="p-2.5 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              const isSos = item.id === 'sos';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? isSos
                        ? 'bg-[#FF4148] text-white font-semibold'
                        : 'bg-[#15191E] text-[#00D9F5] border border-[#00D9F5]/25 font-semibold'
                      : isSos
                      ? 'text-[#FF4148] hover:bg-[#FF4148]/10'
                      : 'text-[#929AA5] hover:text-[#F5F7FA] hover:bg-[#101317]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Citizen Account Card */}
        <div className="p-3 border-t border-white/[0.06] space-y-2">
          <button
            type="button"
            onClick={() => setActiveSection('profile')}
            className="w-full text-left p-2.5 rounded-lg bg-[#101317] hover:bg-[#15191E] border border-white/[0.06] transition-colors cursor-pointer"
          >
            <div className="text-xs font-medium text-[#F5F7FA] truncate">
              {user.fullName || 'Verified Citizen'}
            </div>
            <div className="text-[10px] font-mono text-[#929AA5] truncate mt-0.5">
              {user.email || user.phone}
            </div>
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-[#050607] hover:bg-[#101317] border border-white/[0.06] text-[11px] text-[#929AA5] hover:text-[#F5F7FA] transition-colors cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Minimalist Top Header */}
        <header className="h-14 px-4 sm:px-6 bg-[#0A0C0F]/90 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg text-[#929AA5] hover:text-[#F5F7FA] hover:bg-white/[0.04] cursor-pointer"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="lg:hidden font-display text-sm font-semibold text-[#F5F7FA]">
                UrbanShield
              </span>
              <span className="lg:hidden text-white/[0.15]">/</span>
              <span className="font-display text-sm font-medium text-[#F5F7FA] whitespace-nowrap">
                {NAV_ITEMS.find((n) => n.id === activeSection)?.label || 'City Intelligence'}
              </span>
            </div>
          </div>

          {/* Primary Emergency SOS Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setSosModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#FF4148] hover:bg-[#FF4148]/90 text-white font-display font-semibold text-xs transition-all whitespace-nowrap shrink-0 cursor-pointer shadow-sm shadow-[#FF4148]/20"
            >
              <Siren className="w-3.5 h-3.5" />
              <span>Emergency SOS</span>
            </button>
          </div>
        </header>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#0A0C0F] border-b border-white/[0.08] p-3 space-y-1 urbanshield-fade-in">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer ${
                    isActive
                      ? 'bg-[#15191E] text-[#00D9F5]'
                      : 'text-[#929AA5] hover:text-[#F5F7FA] hover:bg-[#101317]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Active Module Viewport with Smooth Page Transition */}
        <main className="flex-1 p-3 sm:p-6 max-w-[1440px] w-full mx-auto">
          <div key={activeSection} className="urbanshield-page-enter">
            {activeSection === 'overview' && (
              <OverviewDashboardView
                userLocation={userLocation}
                onRequestBrowserLocation={requestBrowserLocation}
                pois={pois}
                reports={reports}
                sosIncidents={sosIncidents}
                weather={weather}
                onNavigateSection={(sec) => setActiveSection(sec)}
                onRouteToPoi={(poi) => {
                  setRouteTargetPoi(poi);
                  setActiveSection('routes');
                }}
                onTriggerSosModal={() => setSosModalOpen(true)}
              />
            )}

            {activeSection === 'map' && (
              <CityMapView
                userLocation={userLocation}
                onRequestBrowserLocation={requestBrowserLocation}
                pois={pois}
                reports={reports}
                sosIncidents={sosIncidents}
                onNavigateToPoi={(poi) => {
                  setRouteTargetPoi(poi);
                  setActiveSection('routes');
                }}
              />
            )}

            {activeSection === 'routes' && (
              <SmartRoutesView
                userLocation={userLocation}
                pois={pois}
                reports={reports}
                initialDestination={routeTargetPoi}
              />
            )}

            {activeSection === 'crime' && (
              <HistoricalCrimeView userLocation={userLocation} pois={pois} />
            )}

            {activeSection === 'sos' && (
              <SosEmergencyView
                userLocation={userLocation}
                sosIncidents={sosIncidents}
                responders={responders}
                onTriggerSosModal={() => setSosModalOpen(true)}
                onRespondToIncident={handleRespondToIncident}
                onUpdateIncidentStatus={handleUpdateIncidentStatus}
                onRegisterResponder={handleRegisterResponder}
              />
            )}

            {activeSection === 'reports' && (
              <CommunityReportsView
                userLocation={userLocation}
                currentUserId={user.id}
                isModerator={isUserModerator}
                reports={reports}
                onSubmitReport={handleSubmitReport}
                onConfirmReport={handleConfirmReport}
                onUpdateReportStatus={handleUpdateReportStatus}
              />
            )}

            {activeSection === 'conditions' && (
              <CityConditionsView
                weather={weather}
                loading={weatherLoading}
                onRefresh={fetchWeather}
                pois={pois}
              />
            )}

            {activeSection === 'profile' && (
              <ProfileSettingsView sosIncidents={sosIncidents} />
            )}
          </div>
        </main>
      </div>

      {/* Persistent Global SOS Confirmation Countdown Modal */}
      <SosCountdownModal
        open={sosModalOpen}
        countdownSeconds={preferences?.sosCountdownSeconds || 5}
        userLocation={userLocation}
        onCancel={() => setSosModalOpen(false)}
        onConfirmActivate={handleConfirmActivateSos}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <UrbanShieldCommandCentre />
    </AuthProvider>
  );
}
