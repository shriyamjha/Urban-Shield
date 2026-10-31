import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  LayoutDashboard,
  Map,
  Navigation,
  Siren,
  AlertTriangle,
  Flame,
  Compass,
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
import { AiAssistantView } from './components/AiAssistantView.tsx';
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
  { id: 'sos', label: 'SOS', icon: Siren },
  { id: 'assistant', label: 'AI Assistant', icon: Compass },
  { id: 'profile', label: 'Settings', icon: UserCog },
];

const UrbanShieldCommandCentre: React.FC = () => {
  const { user, preferences, token, loading, logout } = useAuth();

  const [activeSection, setActiveSection] = useState<NavigationSection>('routes');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Navigation Target & Active Route Summary for AI Context
  const [routeTargetPoi, setRouteTargetPoi] = useState<CityPoi | null>(null);
  const [selectedRouteSummary, setSelectedRouteSummary] = useState<string>('');

  // Global SOS Countdown Modal
  const [sosModalOpen, setSosModalOpen] = useState(false);

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
        fetch('/api/sos', { headers: { Authorization: `Bearer ${token}` } }),
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
  }, [token]);

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit report.');
    setReports((prev) =>
      prev.some((r) => r.id === data.report.id) ? prev : [data.report, ...prev]
    );
  };

  const handleConfirmReport = async (reportId: string) => {
    if (!token) return;
    const res = await fetch(`/api/reports/${reportId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setReports((prev) => prev.map((r) => (r.id === data.report.id ? data.report : r)));
    }
  };

  const handleUpdateReportStatus = async (
    reportId: string,
    verificationStatus: ReportVerificationStatus
  ) => {
    if (!token) return;
    const res = await fetch(`/api/reports/${reportId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ verificationStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      setReports((prev) => prev.map((r) => (r.id === data.report.id ? data.report : r)));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#08090B] text-white flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="font-display text-sm font-bold uppercase tracking-widest text-white">
            INITIALISING URBANSHIELD COMMAND CENTRE
          </div>
          <div className="text-xs font-mono text-[#00D2FF]">
            Syncing Leaflet OpenStreetMap layers & OSRM routing engine...
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

  return (
    <div className="min-h-screen bg-[#08090B] text-[#F3F4F6] flex flex-col lg:flex-row">
      {/* Compact NightWise Left Sidebar Navigation (220px width) */}
      <aside className="hidden lg:flex lg:w-[220px] bg-[#111316] border-r border-[#22262E] flex-col justify-between shrink-0">
        <div>
          <div className="h-14 px-4 flex items-center justify-between border-b border-[#22262E]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded bg-[#181A1F] border border-[#00D2FF]/40 flex items-center justify-center text-[#00D2FF]">
                <Shield className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="font-display text-sm font-bold tracking-tight text-white block leading-none">
                  UrbanShield
                </span>
                <span className="font-mono text-[9px] text-[#8A909E] uppercase tracking-wider">
                  CHD · MOHALI GIS
                </span>
              </div>
            </div>
          </div>

          <nav className="p-2.5 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              const isSos = item.id === 'sos';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? isSos
                        ? 'bg-[#EF4444] text-white font-semibold'
                        : 'bg-[#181A1F] text-[#00D2FF] border border-[#00D2FF]/40 font-semibold'
                      : isSos
                      ? 'text-[#EF4444] hover:bg-red-950/30'
                      : 'text-[#8A909E] hover:text-white hover:bg-[#181A1F]'
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
        <div className="p-3 border-t border-[#22262E] space-y-2">
          <button
            type="button"
            onClick={() => setActiveSection('profile')}
            className="w-full text-left p-2 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] cursor-pointer"
          >
            <div className="text-xs font-semibold text-white truncate">
              {user.fullName || 'Verified Citizen'}
            </div>
            <div className="text-[10px] font-mono text-[#8A909E] truncate">
              {user.email || user.phone}
            </div>
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded bg-[#08090B] hover:bg-[#181A1F] border border-[#22262E] text-[11px] text-[#8A909E] hover:text-white cursor-pointer"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Compact Top Command Header */}
        <header className="h-14 px-4 sm:px-6 bg-[#111316]/95 border-b border-[#22262E] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 text-[#8A909E] hover:text-white cursor-pointer"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#8A909E]">
                URBANSHIELD
              </span>
              <span className="text-[#2A2F3A]">/</span>
              <span className="font-display text-sm font-bold text-white whitespace-nowrap">
                {NAV_ITEMS.find((n) => n.id === activeSection)?.label || 'City Conditions'}
              </span>
            </div>
          </div>

          {/* Quick Top Bar Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-[#08090B] border border-[#22262E] rounded-lg p-1 text-xs">
            {[
              { id: 'overview', label: 'Dashboard' },
              { id: 'routes', label: 'Smart Routes' },
              { id: 'map', label: 'City Intelligence' },
              { id: 'crime', label: 'Crime Hotspots' },
              { id: 'assistant', label: 'AI Assistant' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id as NavigationSection)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  activeSection === tab.id
                    ? 'bg-[#181A1F] text-[#00D2FF] border border-[#2A2F3A]'
                    : 'text-[#8A909E] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Primary Emergency SOS Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSosModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#EF4444] hover:bg-red-500 text-white font-display font-bold text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Siren className="w-3.5 h-3.5" />
              <span>Emergency SOS</span>
            </button>
          </div>
        </header>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#111316] border-b border-[#22262E] p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium cursor-pointer ${
                    activeSection === item.id
                      ? 'bg-[#181A1F] text-[#00D2FF]'
                      : 'text-[#8A909E] hover:bg-[#181A1F]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Active Module Viewport */}
        <main className="flex-1 p-3 sm:p-5 max-w-[1440px] w-full mx-auto">
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
              onActiveRouteChange={(summary) => setSelectedRouteSummary(summary)}
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

          {activeSection === 'assistant' && (
            <AiAssistantView
              userLocation={userLocation}
              selectedRouteSummary={selectedRouteSummary}
            />
          )}

          {activeSection === 'profile' && (
            <ProfileSettingsView sosIncidents={sosIncidents} />
          )}
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
