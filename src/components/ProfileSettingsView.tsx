import React, { useState } from 'react';
import {
  User,
  Users,
  Clock,
  LogOut,
  Trash2,
  Camera,
  Bookmark,
  Plus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { SavedLocation, SosIncident } from '../types/urbanshield.ts';
import {
  getSavedLocations,
  saveUserLocationBookmark,
  removeUserLocationBookmark,
} from '../services/gisClientService.ts';

interface ProfileSettingsViewProps {
  sosIncidents: SosIncident[];
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({ sosIncidents }) => {
  const {
    user,
    preferences,
    contacts,
    emailVerificationPreview,
    verifyEmailCode,
    updateProfile,
    addContact,
    removeContact,
    logout,
    deleteAccount,
  } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [bloodGroup, setBloodGroup] = useState(user?.bloodGroup || '');
  const [medicalNotes, setMedicalNotes] = useState(user?.medicalNotes || '');
  const [defaultCity, setDefaultCity] = useState<'Chandigarh' | 'Mohali'>(
    user?.defaultCity || 'Chandigarh'
  );
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');

  const [locationSharing, setLocationSharing] = useState(
    preferences?.locationSharingEnabled ?? true
  );
  const [autoAlertContacts, setAutoAlertContacts] = useState(
    preferences?.autoAlertContactsOnSos ?? true
  );
  const [sosCountdown, setSosCountdown] = useState(preferences?.sosCountdownSeconds ?? 5);

  const [verifyCodeInput, setVerifyCodeInput] = useState(emailVerificationPreview || '');

  const [newContactName, setNewContactName] = useState('');
  const [newContactRelation] = useState('Family');
  const [newContactPhone, setNewContactPhone] = useState('+91 ');

  // Saved Locations state (Part 10 preservation)
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() =>
    getSavedLocations()
  );
  const [locLabel, setLocLabel] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locLat] = useState(30.7333);
  const [locLng] = useState(76.7794);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const myIncidents = sosIncidents.filter((i) => i.userId === user?.id);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusBanner(null);
    setErrorBanner(null);
    try {
      await updateProfile({
        fullName,
        email,
        phone,
        bloodGroup,
        medicalNotes,
        defaultCity,
        avatarUrl: avatarUrl || undefined,
        preferences: {
          userId: user!.id,
          locationSharingEnabled: locationSharing,
          autoAlertContactsOnSos: autoAlertContacts,
          sosCountdownSeconds: sosCountdown,
          shareResponderProximity: true,
          weights: preferences?.weights || {
            establishments: 30,
            mainRoads: 25,
            emergencyServices: 20,
            transport: 15,
            streetlights: 10,
          },
        },
      });
      setStatusBanner('Account profile and safety preferences saved.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyEmail = async () => {
    try {
      await verifyEmailCode(verifyCodeInput);
      setStatusBanner('Email address verified.');
    } catch (err: any) {
      setErrorBanner(err.message || 'Verification failed.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim() || !newContactPhone.trim()) return;
    try {
      await addContact({
        name: newContactName.trim(),
        relationship: newContactRelation.trim(),
        phone: newContactPhone.trim(),
        notifyViaSms: true,
      });
      setNewContactName('');
      setNewContactPhone('+91 ');
      setStatusBanner('Trusted emergency contact added.');
    } catch (err: any) {
      setErrorBanner(err.message);
    }
  };

  const handleAddSavedLocation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!locLabel.trim() || !locAddress.trim()) return;
    const next = saveUserLocationBookmark({
      label: locLabel.trim(),
      address: locAddress.trim(),
      latitude: locLat,
      longitude: locLng,
      category: 'custom',
    });
    setSavedLocations(next);
    setLocLabel('');
    setLocAddress('');
    setStatusBanner('Saved location bookmarked.');
  };

  const handleRemoveSavedLocation = (id: string) => {
    setSavedLocations(removeUserLocationBookmark(id));
  };

  return (
    <div className="space-y-4">
      {statusBanner && (
        <div className="p-3 rounded-lg bg-[#181A1F] border border-emerald-500/40 text-xs text-emerald-300 flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="p-3 rounded-lg bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Personal Profile & Preferences */}
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 bg-[#111316] border border-[#22262E] rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-[#22262E]">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                Citizen Account & Safety Preferences
              </h2>
              <p className="text-[11px] text-[#8A909E] font-mono">
                ID: {user?.id} · Auth: {user?.authProvider.toUpperCase()}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-xs font-medium text-slate-200 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#00D2FF]" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-3.5 rounded-lg bg-[#181A1F] border border-[#2A2F3A]">
            <div className="w-14 h-14 rounded-full bg-[#08090B] border border-[#2A2F3A] overflow-hidden flex items-center justify-center shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-[#8A909E]" />
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                <span className="font-semibold text-white">{user?.fullName || 'Citizen'}</span>
                <span>·</span>
                <span className={user?.emailVerified ? 'text-emerald-400' : 'text-[#F59E0B]'}>
                  {user?.emailVerified ? 'Email Verified' : 'Email Unverified'}
                </span>
                <span>·</span>
                <span className={user?.phoneVerified ? 'text-emerald-400' : 'text-[#8A909E]'}>
                  {user?.phoneVerified ? 'Mobile Verified' : 'Mobile Unverified'}
                </span>
              </div>

              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111316] hover:bg-[#22262E] border border-[#2A2F3A] text-[11px] text-slate-200 cursor-pointer">
                <Camera className="w-3 h-3 text-[#00D2FF]" />
                <span>Update Photograph</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {!user?.emailVerified && user?.email && (
            <div className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-300">
                Verify email ({user.email}){' '}
                {emailVerificationPreview ? `— Code: ${emailVerificationPreview}` : ''}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={verifyCodeInput}
                  onChange={(e) => setVerifyCodeInput(e.target.value)}
                  placeholder="6-digit code"
                  className="w-24 bg-[#08090B] border border-[#2A2F3A] rounded px-2 py-1 text-xs font-mono text-white"
                />
                <button
                  type="button"
                  onClick={handleVerifyEmail}
                  className="px-2.5 py-1 rounded bg-[#00D2FF] text-[#08090B] font-bold text-xs cursor-pointer"
                >
                  Verify
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Default City Zone
              </label>
              <select
                value={defaultCity}
                onChange={(e) => setDefaultCity(e.target.value as 'Chandigarh' | 'Mohali')}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
              >
                <option value="Chandigarh">Chandigarh</option>
                <option value="Mohali">Mohali (SAS Nagar)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Blood Group
              </label>
              <input
                type="text"
                value={bloodGroup}
                onChange={(e) => setBloodGroup(e.target.value)}
                placeholder="e.g., O+, B+"
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                SOS Countdown
              </label>
              <select
                value={sosCountdown}
                onChange={(e) => setSosCountdown(Number(e.target.value))}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white font-mono"
              >
                <option value={3}>3 Seconds</option>
                <option value={5}>5 Seconds</option>
                <option value={10}>10 Seconds</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Emergency Medical Notes (Private)
            </label>
            <textarea
              rows={2}
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded p-2.5 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-center gap-2 p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={locationSharing}
                onChange={(e) => setLocationSharing(e.target.checked)}
              />
              <span>Live location sharing during SOS</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAlertContacts}
                onChange={(e) => setAutoAlertContacts(e.target.checked)}
              />
              <span>Auto-queue trusted contact alerts</span>
            </label>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#22262E]">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Account</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded bg-[#00D2FF] hover:bg-[#00D2FF]/90 text-[#08090B] font-bold text-xs cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>

        {/* Right: Saved Locations, Trusted Contacts & Emergency History */}
        <div className="lg:col-span-5 space-y-4">
          {/* Saved Locations Manager */}
          <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
              <div className="flex items-center gap-2">
                <Bookmark className="w-3.5 h-3.5 text-[#F59E0B]" />
                <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                  Saved Corridor Locations ({savedLocations.length})
                </h3>
              </div>
            </div>

            <form onSubmit={handleAddSavedLocation} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={locLabel}
                onChange={(e) => setLocLabel(e.target.value)}
                placeholder="Label (e.g. Campus)"
                required
                className="bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="text"
                value={locAddress}
                onChange={(e) => setLocAddress(e.target.value)}
                placeholder="Sector / Phase"
                required
                className="bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1 py-1.5 px-3 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-xs font-mono text-[#00D2FF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Bookmark</span>
              </button>
            </form>

            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {savedLocations.map((loc) => (
                <div
                  key={loc.id}
                  className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">{loc.label}</div>
                    <div className="text-[11px] text-[#8A909E]">{loc.address}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSavedLocation(loc.id)}
                    className="text-[#8A909E] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Trusted Contacts */}
          <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-[#22262E]">
              <Users className="w-3.5 h-3.5 text-[#00D2FF]" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Trusted Emergency Contacts ({contacts.length})
              </h3>
            </div>

            <form onSubmit={handleAddContact} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Name"
                required
                className="bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white"
              />
              <input
                type="tel"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
                placeholder="+91 98150..."
                required
                className="bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs text-white font-mono"
              />
              <button
                type="submit"
                className="py-1.5 px-3 rounded bg-[#00D2FF] text-[#08090B] font-bold text-xs cursor-pointer"
              >
                Add Contact
              </button>
            </form>

            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-white">
                      {c.name} · <span className="text-[#00D2FF]">{c.relationship}</span>
                    </div>
                    <div className="font-mono text-[11px] text-[#8A909E]">{c.phone}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContact(c.id)}
                    className="text-[#8A909E] hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Emergency Activity History */}
          <div className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-2.5">
            <div className="flex items-center gap-2 pb-2 border-b border-[#22262E]">
              <Clock className="w-3.5 h-3.5 text-[#00D2FF]" />
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
                Emergency SOS History ({myIncidents.length})
              </h3>
            </div>

            {myIncidents.length === 0 ? (
              <p className="text-xs text-[#8A909E] py-2">
                No SOS incidents triggered on this account.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {myIncidents.map((inc) => (
                  <div
                    key={inc.id}
                    className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-[#00D2FF] uppercase">{inc.status}</span>
                      <span className="text-[#8A909E]">
                        {new Date(inc.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-slate-200">{inc.areaLabel}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#111316] border border-[#EF4444]/50 rounded-lg p-5 space-y-4">
            <h3 className="font-display text-base font-bold text-white">
              Delete Your UrbanShield Account?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently remove your citizen profile, private trusted contacts,
              preferences, and SOS history.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                className="px-3.5 py-1.5 rounded bg-[#181A1F] text-xs text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteAccount}
                className="px-3.5 py-1.5 rounded bg-[#EF4444] text-xs font-bold text-white cursor-pointer"
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
