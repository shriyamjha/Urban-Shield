import React, { useState } from 'react';
import {
  Shield,
  User,
  Phone,
  Mail,
  Users,
  MapPin,
  CheckCircle2,
  ArrowRight,
  Camera,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface OnboardingModalProps {
  onComplete: (coords?: { lat: number; lng: number }) => void;
}

const AVATAR_PRESETS = [
  'https://api.dicebear.com/9.x/initials/svg?seed=US&backgroundColor=0284c7',
  'https://api.dicebear.com/9.x/initials/svg?seed=CH&backgroundColor=0f766e',
  'https://api.dicebear.com/9.x/initials/svg?seed=MH&backgroundColor=1d4ed8',
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ onComplete }) => {
  const { user, preferences, updateProfile, addContact } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.phone || '+91 ');
  const [email, setEmail] = useState(user?.email || '');
  const [defaultCity, setDefaultCity] = useState<'Chandigarh' | 'Mohali'>(
    user?.defaultCity || 'Chandigarh'
  );
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [bloodGroup, setBloodGroup] = useState(user?.bloodGroup || '');

  // Emergency Contact Preferences (Step 2)
  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('Family');
  const [contactPhone, setContactPhone] = useState('+91 ');
  const [sosCountdown, setSosCountdown] = useState(preferences?.sosCountdownSeconds || 5);
  const [autoAlertContacts, setAutoAlertContacts] = useState(
    preferences?.autoAlertContactsOnSos ?? true
  );

  // Location Permission (Step 3)
  const [locationGranted, setLocationGranted] = useState(false);
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatusText, setLocStatusText] = useState<string>(
    'Browser geolocation permission not requested yet.'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const requestLocationAccess = () => {
    if (!navigator.geolocation) {
      setLocStatusText('Geolocation is not supported by this browser. Defaulting to Chandigarh Sector 17.');
      return;
    }
    setLocStatusText('Requesting browser GPS coordinates...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationGranted(true);
        setDetectedCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatusText(
          `Location granted: ${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`
        );
      },
      () => {
        setLocStatusText(
          'Browser location permission declined or unavailable — defaulting to Chandigarh Sector 17 (30.7333° N, 76.7794° E).'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleFinishOnboarding = async (skipOptional = false) => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        fullName: fullName.trim() || user?.fullName || 'Chandigarh Citizen',
        phone: phone.trim() !== '+91' ? phone.trim() : user?.phone || '',
        email: email.trim() || user?.email || '',
        avatarUrl: avatarUrl || undefined,
        bloodGroup: bloodGroup || undefined,
        defaultCity,
        onboardingCompleted: true,
        preferences: {
          userId: user!.id,
          locationSharingEnabled: locationGranted || true,
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

      if (!skipOptional && contactName.trim() && contactPhone.trim().length > 5) {
        await addContact({
          name: contactName.trim(),
          relationship: contactRelation,
          phone: contactPhone.trim(),
          isPrimary: true,
          notifyViaSms: true,
        });
      }

      onComplete(detectedCoords || undefined);
    } catch (err: any) {
      setError(err.message || 'Could not save onboarding profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090B] text-slate-100 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl bg-[#111316] border border-[#22262E] rounded-lg p-6 sm:p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-5 border-b border-[#22262E]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#181A1F] border border-[#00D2FF]/40 flex items-center justify-center text-[#00D2FF]">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-white">
                Complete Your UrbanShield Safety Profile
              </h1>
              <p className="text-xs text-[#8A909E]">
                Step {step} of 3 · You can skip optional fields and update them anytime in Settings.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleFinishOnboarding(true)}
            disabled={saving}
            className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
          >
            Skip for now
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="grid grid-cols-3 gap-2 my-6">
          {[
            { n: 1, label: '1. Citizen Identity' },
            { n: 2, label: '2. Emergency Contacts' },
            { n: 3, label: '3. Location & GIS Access' },
          ].map((item) => (
            <div
              key={item.n}
              className={`py-2 px-3 rounded-lg border text-xs font-medium ${
                step === item.n
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : step > item.n
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              {item.label}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200">
            {error}
          </div>
        )}

        {/* STEP 1: PERSONAL IDENTITY */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl bg-slate-900/70 border border-slate-800">
              <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-white mb-1">
                  Profile Photograph (Optional)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer">
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {AVATAR_PRESETS.map((preset, idx) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                    >
                      Badge {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Primary City Sector Zone
                </label>
                <select
                  value={defaultCity}
                  onChange={(e) => setDefaultCity(e.target.value as 'Chandigarh' | 'Mohali')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="Chandigarh">Chandigarh (Sectors 1–63)</option>
                  <option value="Mohali">Mohali / SAS Nagar (Phases 1–11)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Mobile Number {user?.phoneVerified ? '(Verified)' : '(For SOS Alerts)'}
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={Boolean(user?.phoneVerified)}
                    placeholder="+91 98150 12345"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white font-mono disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address {user?.emailVerified ? '(Verified)' : ''}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="citizen@example.com"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                <span>Continue to Emergency Preferences</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: EMERGENCY CONTACT PREFERENCES */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Add Primary Trusted Emergency Contact (Optional)</span>
              </div>
              <p className="text-xs text-slate-400">
                When you activate an SOS emergency, UrbanShield generates a live coordinate link
                for your trusted contacts.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Contact Name"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  value={contactRelation}
                  onChange={(e) => setContactRelation(e.target.value)}
                  placeholder="Relationship (e.g. Parent)"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800">
                <label className="block text-xs font-medium text-white mb-1">
                  SOS Activation Countdown
                </label>
                <p className="text-xs text-slate-400 mb-2">
                  Grace period to cancel accidental SOS triggers.
                </p>
                <select
                  value={sosCountdown}
                  onChange={(e) => setSosCountdown(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                >
                  <option value={3}>3 Seconds</option>
                  <option value={5}>5 Seconds (Recommended)</option>
                  <option value={10}>10 Seconds</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-medium text-white mb-1">
                    Auto-Alert Trusted Contacts
                  </div>
                  <p className="text-xs text-slate-400">
                    Automatically queue live location share alerts when SOS is triggered.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoAlertContacts}
                    onChange={(e) => setAutoAlertContacts(e.target.checked)}
                    className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-xs text-slate-200">Enable automatic contact alerts</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm cursor-pointer"
              >
                <span>Continue to Location Access</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: LOCATION ACCESS */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-5 h-5 text-cyan-400" />
                  <span className="font-display text-sm font-semibold text-white">
                    Browser Geolocation Permission
                  </span>
                </div>
                {locationGranted && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Granted</span>
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                UrbanShield uses your coordinates to calculate distances to hospitals, pharmacies,
                and police stations across Chandigarh and Mohali, and to attach accurate GPS
                coordinates during an SOS activation.
              </p>

              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300">
                {locStatusText}
              </div>

              <button
                type="button"
                onClick={requestLocationAccess}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-white cursor-pointer"
              >
                Grant Browser Location Permission
              </button>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleFinishOnboarding(false)}
                className="flex items-center gap-2 py-2.5 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm cursor-pointer disabled:opacity-50"
              >
                <span>{saving ? 'Launching Command Centre...' : 'Enter UrbanShield Dashboard'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
