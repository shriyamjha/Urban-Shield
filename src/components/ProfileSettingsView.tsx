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
import { ExpandableDetails, ModalDialog } from './ui/ProgressivePrimitives.tsx';

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
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="urbanshield-heading-enter flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#F5F7FA] tracking-tight">
            Settings & Profile
          </h1>
          <p className="text-xs text-[#929AA5] mt-1">
            Manage your citizen profile, emergency preferences, saved locations, and trusted contacts.
          </p>
        </div>

        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101317] hover:bg-[#15191E] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 text-[#00D9F5]" />
          <span>Sign Out</span>
        </button>
      </div>

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-[#101317] border border-emerald-500/35 text-xs text-emerald-300 flex items-center justify-between">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="p-3.5 rounded-xl bg-red-950/60 border border-[#FF4148]/40 text-xs text-red-200 flex items-center justify-between">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Primary Profile & Emergency Preferences Form */}
      <form
        onSubmit={handleSaveProfile}
        className="urbanshield-card-enter stagger-1 bg-[#0A0C0F] border border-white/[0.06] rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-white/[0.06]">
          <div className="w-14 h-14 rounded-full bg-[#101317] border border-white/[0.08] overflow-hidden flex items-center justify-center shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-[#929AA5]" />
            )}
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#929AA5]">
              <span className="font-semibold text-[#F5F7FA] text-sm">
                {user?.fullName || 'Citizen'}
              </span>
              <span>·</span>
              <span className={user?.emailVerified ? 'text-emerald-400' : 'text-[#F59E0B]'}>
                {user?.emailVerified ? 'Email Verified' : 'Email Unverified'}
              </span>
            </div>

            <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#101317] hover:bg-[#15191E] border border-white/[0.08] text-[11px] text-[#F5F7FA] cursor-pointer">
              <Camera className="w-3 h-3 text-[#00D9F5]" />
              <span>Update Photo</span>
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
          <div className="p-3 rounded-xl bg-[#101317] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-[#929AA5]">
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
                className="w-24 bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-2.5 py-1 text-xs font-mono text-[#F5F7FA]"
              />
              <button
                type="button"
                onClick={handleVerifyEmail}
                className="px-3 py-1 rounded-lg bg-[#00D9F5] text-[#050607] font-semibold text-xs cursor-pointer"
              >
                Verify
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">Full Name</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-[#101317] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F5F7FA]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">Default City</label>
            <select
              value={defaultCity}
              onChange={(e) => setDefaultCity(e.target.value as 'Chandigarh' | 'Mohali')}
              className="w-full bg-[#101317] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F5F7FA]"
            >
              <option value="Chandigarh">Chandigarh</option>
              <option value="Mohali">Mohali (SAS Nagar)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">SOS Countdown</label>
            <select
              value={sosCountdown}
              onChange={(e) => setSosCountdown(Number(e.target.value))}
              className="w-full bg-[#101317] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F5F7FA] font-mono"
            >
              <option value={3}>3 Seconds</option>
              <option value={5}>5 Seconds</option>
              <option value={10}>10 Seconds</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#101317] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F5F7FA]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">Mobile Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-[#101317] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F5F7FA] font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">Blood Group</label>
            <input
              type="text"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
              placeholder="e.g., O+, B+"
              className="w-full bg-[#101317] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-[#F5F7FA]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#101317] border border-white/[0.06] text-xs text-[#F5F7FA] cursor-pointer">
            <input
              type="checkbox"
              checked={locationSharing}
              onChange={(e) => setLocationSharing(e.target.checked)}
            />
            <span>Live location sharing during SOS</span>
          </label>
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#101317] border border-white/[0.06] text-xs text-[#F5F7FA] cursor-pointer">
            <input
              type="checkbox"
              checked={autoAlertContacts}
              onChange={(e) => setAutoAlertContacts(e.target.checked)}
            />
            <span>Auto-queue trusted contact alerts</span>
          </label>
        </div>

        <div>
          <label className="block text-[11px] text-[#929AA5] mb-1">
            Emergency Medical Notes (Private)
          </label>
          <textarea
            rows={2}
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            className="w-full bg-[#101317] border border-white/[0.08] rounded-xl p-3 text-xs text-[#F5F7FA]"
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="flex items-center gap-1.5 text-xs text-[#FF4148] hover:opacity-80 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Account</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-[#00D9F5] hover:bg-[#00D9F5]/90 text-[#050607] font-semibold text-xs cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Progressive Disclosure for Saved Locations, Trusted Contacts, and SOS History */}
      <div className="urbanshield-card-enter stagger-2 grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ExpandableDetails
          label={`Saved locations (${savedLocations.length})`}
          collapseLabel="Hide saved locations"
        >
          <div className="space-y-3">
            <form onSubmit={handleAddSavedLocation} className="space-y-2">
              <div className="flex items-center gap-2">
                <Bookmark className="w-3.5 h-3.5 text-[#F59E0B]" />
                <span className="text-xs font-medium text-[#F5F7FA]">Add Bookmark</span>
              </div>
              <input
                type="text"
                value={locLabel}
                onChange={(e) => setLocLabel(e.target.value)}
                placeholder="Label (e.g. Campus)"
                required
                className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F7FA]"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={locAddress}
                  onChange={(e) => setLocAddress(e.target.value)}
                  placeholder="Sector / Phase"
                  required
                  className="flex-1 bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F7FA]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#15191E] border border-white/[0.08] text-xs text-[#00D9F5] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              </div>
            </form>

            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {savedLocations.map((loc) => (
                <div
                  key={loc.id}
                  className="p-2.5 rounded-lg bg-[#0A0C0F] border border-white/[0.06] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-medium text-[#F5F7FA]">{loc.label}</div>
                    <div className="text-[11px] text-[#929AA5]">{loc.address}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSavedLocation(loc.id)}
                    className="text-[#929AA5] hover:text-[#FF4148] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ExpandableDetails>

        <ExpandableDetails
          label={`Trusted contacts (${contacts.length})`}
          collapseLabel="Hide trusted contacts"
        >
          <div className="space-y-3">
            <form onSubmit={handleAddContact} className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[#00D9F5]" />
                <span className="text-xs font-medium text-[#F5F7FA]">Quick Add Contact</span>
              </div>
              <input
                type="text"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
                placeholder="Name"
                required
                className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F7FA]"
              />
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="+91 98150..."
                  required
                  className="flex-1 bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F7FA] font-mono"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#00D9F5] text-[#050607] font-semibold text-xs cursor-pointer"
                >
                  Add
                </button>
              </div>
            </form>

            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="p-2.5 rounded-lg bg-[#0A0C0F] border border-white/[0.06] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-medium text-[#F5F7FA]">
                      {c.name} · <span className="text-[#00D9F5]">{c.relationship}</span>
                    </div>
                    <div className="font-mono text-[11px] text-[#929AA5]">{c.phone}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContact(c.id)}
                    className="text-[#929AA5] hover:text-[#FF4148] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </ExpandableDetails>

        <ExpandableDetails
          label={`Emergency SOS history (${myIncidents.length})`}
          collapseLabel="Hide SOS history"
        >
          {myIncidents.length === 0 ? (
            <p className="text-xs text-[#929AA5] py-1">
              No SOS incidents triggered on this account.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {myIncidents.map((inc) => (
                <div
                  key={inc.id}
                  className="p-2.5 rounded-lg bg-[#0A0C0F] border border-white/[0.06] text-xs space-y-0.5"
                >
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-[#00D9F5] uppercase">{inc.status}</span>
                    <span className="text-[#929AA5]">
                      {new Date(inc.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[#F5F7FA] flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-[#929AA5]" />
                    <span>{inc.areaLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ExpandableDetails>
      </div>

      <ModalDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Delete Your UrbanShield Account?"
        subtitle="This action is permanent and cannot be undone."
      >
        <div className="space-y-4">
          <p className="text-xs text-[#929AA5] leading-relaxed">
            This will permanently remove your citizen profile, private trusted contacts, preferences, and SOS history.
          </p>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
              className="px-3.5 py-2 rounded-lg bg-[#0A0C0F] border border-white/[0.08] text-xs text-[#F5F7FA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              className="px-4 py-2 rounded-lg bg-[#FF4148] text-xs font-semibold text-white cursor-pointer"
            >
              Confirm Deletion
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
};
