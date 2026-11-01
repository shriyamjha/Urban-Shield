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
import { ExpandableDetails } from './ui/ProgressivePrimitives.tsx';

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
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Primary Emergency SOS Control Banner */}
      <div className="urbanshield-card-enter bg-[#0A0C0F] border border-[#FF4148]/35 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#FF4148]">
            <Siren className="w-4 h-4" />
            <span>Emergency Assistance</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#F5F7FA] tracking-tight">
            SOS Emergency Response
          </h1>
          <p className="text-xs text-[#929AA5] leading-relaxed">
            Activating SOS starts a confirmation countdown, captures your current GPS coordinates (
            <span className="font-mono text-[#F5F7FA]">
              {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E
            </span>
            ), shares a live tracking link with your{' '}
            <span className="text-[#F5F7FA] font-medium">{contacts.length} trusted contact(s)</span>,
            and notifies nearby community responders.
          </p>
          <div className="text-xs font-mono text-[#F59E0B] pt-0.5">
            Statutory Helplines: Police 112 / 100 · Ambulance 108 · Women Helpline 1091
          </div>
        </div>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onTriggerSosModal}
            className="w-full lg:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#FF4148] hover:bg-[#FF4148]/90 text-white font-display font-semibold text-sm transition-all cursor-pointer shadow-lg shadow-[#FF4148]/20"
          >
            <Siren className="w-4 h-4" />
            <span>Trigger Emergency SOS</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-[#101317] border border-[#00D9F5]/30 text-xs text-[#00D9F5] flex items-center justify-between">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Active SOS Incidents */}
      <div className="urbanshield-card-enter stagger-1 bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#F5F7FA]">
              Live Emergency Feed ({activeIncidents.length} active)
            </h2>
            <p className="text-xs text-[#929AA5] mt-0.5">
              Real-time incident status, live location links, and responder acknowledgements.
            </p>
          </div>
          <span className="text-xs font-mono text-[#929AA5]">
            Total logged: {sosIncidents.length}
          </span>
        </div>

        {sosIncidents.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400 mx-auto" />
            <div className="text-xs font-medium text-[#F5F7FA]">
              No active SOS emergencies
            </div>
            <p className="text-xs text-[#929AA5] max-w-md mx-auto">
              When SOS is activated, live coordinates, responder acknowledgements, and shareable tracking links appear here immediately.
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
                  className={`p-4 rounded-xl border space-y-3 ${
                    isActive
                      ? 'bg-[#FF4148]/[0.06] border-[#FF4148]/40'
                      : 'bg-[#101317] border-white/[0.06]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono font-semibold uppercase text-[#FF4148]">
                        {inc.status}
                      </span>
                      <span className="text-[#929AA5]">·</span>
                      <span className="font-medium text-[#F5F7FA]">{inc.userName}</span>
                      <span className="text-[#929AA5]">·</span>
                      <span className="font-mono text-[#929AA5]">
                        {new Date(inc.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    {isOwner && isActive && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyShareLink(inc)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#15191E] hover:bg-[#1C2128] border border-white/[0.08] text-[11px] text-[#00D9F5] cursor-pointer"
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
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-medium text-white cursor-pointer"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateIncidentStatus(inc.id, 'cancelled')}
                          className="px-3 py-1 rounded-lg bg-[#15191E] hover:bg-[#1C2128] border border-white/[0.08] text-[11px] text-[#929AA5] cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-[#F5F7FA]/90">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#FF4148] shrink-0" />
                      <span>
                        {inc.areaLabel} ({inc.latitude.toFixed(4)}° N, {inc.longitude.toFixed(4)}° E)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[#929AA5]">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                      <span>{inc.notificationChannelDetail}</span>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-[#929AA5]">
                      {inc.responses.length === 0 ? (
                        <span>Awaiting community responder acknowledgement...</span>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {inc.responses.map((resp) => (
                            <span key={resp.responderId}>
                              <strong className="text-[#F5F7FA]">{resp.responderName}</strong>:{' '}
                              <span
                                className={
                                  resp.action === 'acknowledged'
                                    ? 'text-emerald-400 font-medium'
                                    : 'text-[#929AA5]'
                                }
                              >
                                {resp.action}
                                {resp.etaMinutes ? ` (~${resp.etaMinutes}m)` : ''}
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
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-[11px] font-medium text-emerald-300 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Acknowledge</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRespondToIncident(inc.id, 'declined')}
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#15191E] border border-white/[0.08] text-[11px] text-[#929AA5] cursor-pointer"
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

      {/* Two-Column Trusted Contacts & Responders with Progressive Disclosure for Forms */}
      <div className="urbanshield-card-enter stagger-2 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Trusted Emergency Contacts */}
        <div className="bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#00D9F5]" />
              <h3 className="font-display text-sm font-semibold text-[#F5F7FA]">
                Trusted Contacts ({contacts.length})
              </h3>
            </div>
            <span className="text-[11px] text-[#929AA5]">Private account</span>
          </div>

          <div className="space-y-2">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-lg bg-[#101317] border border-white/[0.06] flex items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-[#F5F7FA]">{c.name}</span>
                    <span className="text-[#929AA5]">·</span>
                    <span className="text-[#00D9F5]">{c.relationship}</span>
                  </div>
                  <div className="text-[11px] font-mono text-[#929AA5]">
                    {c.phone} {c.email ? `· ${c.email}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(c.id)}
                  className="p-1.5 text-[#929AA5] hover:text-[#FF4148] cursor-pointer"
                  aria-label="Remove contact"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <ExpandableDetails label="Add trusted contact" collapseLabel="Hide contact form">
            <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact Full Name *"
                required
                className="bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA]"
              />
              <input
                type="text"
                value={contactRelationship}
                onChange={(e) => setContactRelationship(e.target.value)}
                placeholder="Relationship (e.g., Family)"
                className="bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA]"
              />
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98150 12345 *"
                required
                className="bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA] font-mono"
              />
              <div className="flex gap-2">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="flex-1 bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA]"
                />
                <button
                  type="submit"
                  disabled={contactSubmitting}
                  className="flex items-center gap-1 px-3.5 py-2 rounded-lg bg-[#00D9F5] text-[#050607] font-semibold text-xs shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </ExpandableDetails>
        </div>

        {/* Community Responders */}
        <div className="bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <h3 className="font-display text-sm font-semibold text-[#F5F7FA]">
                Community Responders ({responders.length})
              </h3>
            </div>
            <span className="text-[11px] text-[#929AA5]">Chandigarh & Mohali</span>
          </div>

          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
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
                  className="p-3 rounded-lg bg-[#101317] border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[#F5F7FA]">{r.fullName}</span>
                      <span className="text-[#929AA5]">·</span>
                      <span className="text-[#929AA5]">{r.roleQualification}</span>
                    </div>
                    <div className="text-[11px] text-[#929AA5] font-mono mt-0.5">
                      {r.sectorArea} · {dist} km away
                    </div>
                  </div>
                  <span
                    className={`font-mono uppercase text-[10px] px-2 py-0.5 rounded bg-[#15191E] border border-white/[0.06] ${
                      r.availabilityStatus === 'available'
                        ? 'text-emerald-400'
                        : r.availabilityStatus === 'busy'
                        ? 'text-[#F59E0B]'
                        : 'text-[#929AA5]'
                    }`}
                  >
                    {r.availabilityStatus}
                  </span>
                </div>
              );
            })}
          </div>

          <ExpandableDetails
            label={myResponder ? 'Update my responder status' : 'Volunteer as responder'}
            collapseLabel="Hide responder settings"
          >
            <form onSubmit={handleSaveResponder} className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#929AA5]">Availability</span>
                <select
                  value={respStatus}
                  onChange={(e) => setRespStatus(e.target.value as ResponderStatus)}
                  className="bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs text-[#00D9F5] font-mono"
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
                  className="bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA]"
                />
                <input
                  type="text"
                  value={respSector}
                  onChange={(e) => setRespSector(e.target.value)}
                  placeholder="Sector / Area"
                  className="bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA]"
                />
                <button
                  type="submit"
                  disabled={respSaving}
                  className="py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#050607] font-semibold text-xs cursor-pointer"
                >
                  {respSaving ? 'Saving...' : 'Save Status'}
                </button>
              </div>
            </form>
          </ExpandableDetails>
        </div>
      </div>
    </div>
  );
};
