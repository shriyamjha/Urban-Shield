import React, { useState } from 'react';
import {
  Siren,
  Users,
  ShieldCheck,
  MapPin,
  Copy,
  Check,
  Trash2,
  UserPlus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import {
  CommunityResponder,
  ResponderStatus,
  SosIncident,
} from '../types/urbanshield.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { haversineDistanceKm } from '../data/chandigarhMohaliBaseline.ts';

interface SosEmergencyViewProps {
  userLocation: { lat: number; lng: number };
  sosIncidents: SosIncident[];
  responders: CommunityResponder[];
  onTriggerSosModal: () => void;
  onRespondToIncident: (
    incidentId: string,
    action: 'acknowledged' | 'declined',
    responderId?: string
  ) => Promise<void>;
  onUpdateIncidentStatus: (
    incidentId: string,
    status: 'resolved' | 'cancelled'
  ) => Promise<void>;
  onRegisterResponder: (payload: Partial<CommunityResponder>) => Promise<void>;
}

export const SosEmergencyView: React.FC<SosEmergencyViewProps> = ({
  userLocation,
  sosIncidents,
  responders,
  onTriggerSosModal,
  onRespondToIncident,
  onUpdateIncidentStatus,
  onRegisterResponder,
}) => {
  const { user, contacts, addContact, removeContact } = useAuth();

  const [contactName, setContactName] = useState('');
  const [contactRelationship, setContactRelationship] = useState('Family');
  const [contactPhone, setContactPhone] = useState('+91 ');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);

  const myResponder = responders.find((r) => r.userId === user?.id);
  const [respRole, setRespRole] = useState(
    myResponder?.roleQualification || 'First Aid & Community Safety Volunteer'
  );
  const [respSector, setRespSector] = useState(
    myResponder?.sectorArea || 'Sector 17 / Sector 16, Chandigarh'
  );
  const [respPhone] = useState(myResponder?.phone || user?.phone || '+91 ');
  const [respStatus, setRespStatus] = useState<ResponderStatus>(
    myResponder?.availabilityStatus || 'available'
  );
  const [respSaving, setRespSaving] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim() || !contactPhone.trim()) return;
    setContactSubmitting(true);
    try {
      await addContact({
        name: contactName.trim(),
        relationship: contactRelationship.trim(),
        phone: contactPhone.trim(),
        email: contactEmail.trim() || undefined,
        notifyViaSms: true,
      });
      setContactName('');
      setContactPhone('+91 ');
      setContactEmail('');
      setFeedback('Trusted contact saved to your private account.');
    } catch (err: any) {
      setFeedback(err.message || 'Could not add contact.');
    } finally {
      setContactSubmitting(false);
    }
  };

  const handleSaveResponder = async (e: React.FormEvent) => {
    e.preventDefault();
    setRespSaving(true);
    try {
      await onRegisterResponder({
        fullName: user?.fullName || 'Verified Citizen',
        phone: respPhone,
        roleQualification: respRole,
        sectorArea: respSector,
        availabilityStatus: respStatus,
        latitude: userLocation.lat,
        longitude: userLocation.lng,
      });
      setFeedback('Community Responder status updated.');
    } catch (err: any) {
      setFeedback(err.message || 'Failed to update responder profile.');
    } finally {
      setRespSaving(false);
    }
  };

  const copyShareLink = (incident: SosIncident) => {
    const shareUrl = `${window.location.origin}/?sos_track=${incident.shareToken}&lat=${incident.latitude.toFixed(
      5
    )}&lng=${incident.longitude.toFixed(5)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedId(incident.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const activeIncidents = sosIncidents.filter(
    (i) => i.status === 'active' || i.status === 'acknowledged'
  );

  return (
    <div className="space-y-4">
      {/* Top Emergency Command Banner */}
      <div className="bg-[#111316] border border-[#EF4444]/50 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-[#EF4444]">
            <Siren className="w-4 h-4" />
            <span>EMERGENCY ASSISTANCE & RESPONDER COORDINATION</span>
          </div>
          <h2 className="font-display text-xl font-bold text-white">
            SOS Emergency Response Network
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Activating SOS initiates a confirmation countdown, captures your GPS coordinates (
            {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E), logs an emergency
            record, generates a live location-sharing link for your{' '}
            <span className="text-white font-semibold">{contacts.length} trusted contact(s)</span>,
            and alerts opt-in community responders in Chandigarh & Mohali.
          </p>
          <p className="text-[11px] font-mono text-[#F59E0B]">
            Statutory India Helplines: Police 112 / 100 · Ambulance 108 · Women Helpline 1091.
          </p>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onTriggerSosModal}
            className="w-full lg:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-lg bg-[#EF4444] hover:bg-red-500 text-white font-display font-bold text-sm transition-colors cursor-pointer"
          >
            <Siren className="w-4 h-4" />
            <span>TRIGGER SOS COUNTDOWN</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-[#181A1F] border border-[#00D2FF]/40 text-xs text-[#00D2FF] flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active SOS Incidents Dashboard */}
      <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
              Live Emergency Incident Feed ({activeIncidents.length} Active)
            </h3>
            <p className="text-[11px] text-[#8A909E]">
              Real-time WebSocket incident feed, responder acknowledgements, and resolution controls.
            </p>
          </div>
          <span className="text-[11px] font-mono text-[#8A909E]">
            Total Logged: {sosIncidents.length}
          </span>
        </div>

        {sosIncidents.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto" />
            <div className="text-xs font-semibold text-white">
              No Active SOS Emergencies at This Moment
            </div>
            <p className="text-[11px] text-[#8A909E] max-w-md mx-auto">
              When SOS is activated, live coordinates, responder acknowledgements, and shareable
              tracking links appear here immediately.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sosIncidents.map((inc) => {
              const isOwner = inc.userId === user?.id;
              const isActive = inc.status === 'active' || inc.status === 'acknowledged';

              return (
                <div
                  key={inc.id}
                  className={`p-3.5 rounded-lg border space-y-2.5 ${
                    isActive
                      ? 'bg-red-950/20 border-[#EF4444]/50'
                      : 'bg-[#181A1F] border-[#2A2F3A]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-bold uppercase text-[#EF4444]">
                        STATUS: {inc.status.toUpperCase()}
                      </span>
                      <span>·</span>
                      <span className="font-semibold text-white">{inc.userName}</span>
                      <span>·</span>
                      <span className="font-mono text-[#8A909E]">
                        {new Date(inc.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    {isOwner && isActive && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyShareLink(inc)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-[11px] text-[#00D2FF] cursor-pointer"
                        >
                          {copiedId === inc.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Live Link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncidentStatus(inc.id, 'resolved')}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[11px] font-semibold text-white cursor-pointer"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncidentStatus(inc.id, 'cancelled')}
                          className="px-2.5 py-1 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-[11px] text-[#8A909E] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                      <span>
                        {inc.areaLabel} ({inc.latitude.toFixed(4)}° N, {inc.longitude.toFixed(4)}° E)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>{inc.notificationChannelDetail}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#22262E] flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-300">
                      {inc.responses.length === 0 ? (
                        <span className="text-[#8A909E]">
                          Awaiting community responder acknowledgement...
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {inc.responses.map((resp) => (
                            <span key={resp.responderId}>
                              <strong className="text-white">{resp.responderName}</strong>:{' '}
                              <span
                                className={
                                  resp.action === 'acknowledged'
                                    ? 'text-emerald-400 font-semibold'
                                    : 'text-[#8A909E]'
                                }
                              >
                                {resp.action.toUpperCase()}
                                {resp.etaMinutes ? ` (ETA ~${resp.etaMinutes}m)` : ''}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {isActive && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onRespondToIncident(inc.id, 'acknowledged')}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/40 text-[11px] font-medium text-emerald-300 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Acknowledge</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRespondToIncident(inc.id, 'declined')}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#181A1F] border border-[#2A2F3A] text-[11px] text-[#8A909E] cursor-pointer"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Decline</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Split: Trusted Contacts + Community Responders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-[#00D2FF]" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Private Trusted Emergency Contacts ({contacts.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#8A909E]">PRIVATE ACCOUNT SCOPE</span>
          </div>

          <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Contact Full Name *"
              required
              className="bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-1.5 text-xs text-white"
            />
            <input
              type="text"
              value={contactRelationship}
              onChange={(e) => setContactRelationship(e.target.value)}
              placeholder="Relationship (e.g., Family)"
              className="bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-1.5 text-xs text-white"
            />
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="+91 98150 12345 *"
              required
              className="bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-1.5 text-xs text-white font-mono"
            />
            <div className="flex gap-1.5">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Email (optional)"
                className="flex-1 bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                disabled={contactSubmitting}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#00D2FF] text-[#08090B] font-bold text-xs shrink-0 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </form>

          <div className="space-y-1.5">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] flex items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span>·</span>
                    <span className="text-[#00D2FF]">{c.relationship}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#8A909E]">
                    {c.phone} {c.email ? `· ${c.email}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(c.id)}
                  className="p-1 text-[#8A909E] hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Community Responders */}
        <div className="lg:col-span-6 bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Opt-In Community Responders ({responders.length})
              </h3>
            </div>
            <span className="text-[10px] font-mono text-[#8A909E]">CHANDIGARH & MOHALI</span>
          </div>

          <form
            onSubmit={handleSaveResponder}
            className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A] space-y-2.5"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">
                {myResponder ? 'Responder Availability' : 'Volunteer as Community Responder'}
              </span>
              <select
                value={respStatus}
                onChange={(e) => setRespStatus(e.target.value as ResponderStatus)}
                className="bg-[#08090B] border border-[#2A2F3A] rounded px-2 py-1 text-[11px] text-[#00D2FF] font-mono"
              >
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={respRole}
                onChange={(e) => setRespRole(e.target.value)}
                placeholder="Qualification / Role"
                className="bg-[#08090B] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={respSector}
                onChange={(e) => setRespSector(e.target.value)}
                placeholder="Sector / Area"
                className="bg-[#08090B] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                disabled={respSaving}
                className="py-1.5 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-[#08090B] font-bold text-xs cursor-pointer"
              >
                {respSaving ? 'Saving...' : 'Save Status'}
              </button>
            </div>
          </form>

          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {responders.map((r) => {
              const dist = haversineDistanceKm(
                userLocation.lat,
                userLocation.lng,
                r.latitude,
                r.longitude
              ).toFixed(1);
              return (
                <div
                  key={r.id}
                  className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-white">{r.fullName}</span>
                      <span>·</span>
                      <span className="text-[#8A909E]">{r.roleQualification}</span>
                    </div>
                    <div className="text-[11px] text-[#8A909E] font-mono">
                      {r.sectorArea} · {dist} km away · {r.acknowledgedCount} acks
                    </div>
                  </div>
                  <span
                    className={`font-mono uppercase text-[10px] ${
                      r.availabilityStatus === 'available'
                        ? 'text-emerald-400'
                        : r.availabilityStatus === 'busy'
                        ? 'text-[#F59E0B]'
                        : 'text-[#8A909E]'
                    }`}
                  >
                    {r.availabilityStatus}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
