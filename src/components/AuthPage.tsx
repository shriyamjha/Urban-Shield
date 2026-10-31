import React, { useState, useEffect } from 'react';
import {
  Shield,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  RefreshCw,
  MapPin,
  Info,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { isSupabaseConfigured, supabase } from '../lib/supabase.ts';

type AuthTab = 'email' | 'phone';
type EmailMode = 'login' | 'signup' | 'forgot_request' | 'forgot_confirm';

const COUNTRY_CODES = [
  { code: '+91', label: 'IN (+91)', country: 'India' },
  { code: '+1', label: 'US (+1)', country: 'United States' },
  { code: '+44', label: 'UK (+44)', country: 'United Kingdom' },
  { code: '+61', label: 'AU (+61)', country: 'Australia' },
  { code: '+971', label: 'AE (+971)', country: 'UAE' },
];

export const AuthPage: React.FC = () => {
  const {
    signInWithGooglePopup,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    sendMobileOtp,
    verifyMobileOtp,
    requestPasswordReset,
    confirmPasswordReset,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>('email');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');

  // Email state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetCodePreview, setResetCodePreview] = useState<string | null>(null);

  // Mobile OTP state
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpStep, setOtpStep] = useState<'input_phone' | 'verify_otp'>('input_phone');
  const [otpCode, setOtpCode] = useState('');
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [otpDeliveryNote, setOtpDeliveryNote] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Google Account Selector Modal state
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');

  // Feedback state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => {
      setResendTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const clearMessages = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setSubmitting(true);

    try {
      if (emailMode === 'login') {
        await loginWithEmail(email, password);
      } else if (emailMode === 'signup') {
        if (!fullName.trim()) {
          throw new Error('Please enter your full name.');
        }
        await registerWithEmail(email, password, fullName);
      } else if (emailMode === 'forgot_request') {
        const res = await requestPasswordReset(email);
        setResetCodePreview(res.resetCodePreview || null);
        setSuccessMsg('Verification code generated. Enter the 6-digit code below to reset your password.');
        setEmailMode('forgot_confirm');
      } else if (emailMode === 'forgot_confirm') {
        await confirmPasswordReset(email, resetCode, newPassword);
        setSuccessMsg('Password updated! You can now sign in with your new password.');
        setPassword('');
        setResetCodePreview(null);
        setEmailMode('login');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    clearMessages();
    setSubmitting(true);

    try {
      const res = await sendMobileOtp(countryCode, mobileNumber);
      setOtpStep('verify_otp');
      setOtpPreview(res.verificationCodePreview || null);
      setOtpDeliveryNote(res.deliveryStatus);
      setResendTimer(30);
      setSuccessMsg(`6-digit OTP generated for ${res.phone}.`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid mobile number.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (otpCode.trim().length !== 6) {
      setErrorMsg('Please enter the complete 6-digit OTP.');
      return;
    }
    setSubmitting(true);
    try {
      await verifyMobileOtp(countryCode, mobileNumber, otpCode);
    } catch (err: any) {
      setErrorMsg(err.message || 'Incorrect OTP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleTrigger = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      await signInWithGooglePopup();
    } catch (err: any) {
      // Fallback to account selector if popup is closed or blocked by sandbox iframe
      if (
        err?.code === 'auth/popup-blocked' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/unauthorized-domain'
      ) {
        setShowGoogleModal(true);
      } else {
        setShowGoogleModal(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectGoogleAccount = async (acct: { email: string; fullName: string }) => {
    setSubmitting(true);
    clearMessages();
    try {
      await loginWithGoogle(acct);
      setShowGoogleModal(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Google authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090B] text-slate-100 flex flex-col lg:flex-row relative overflow-hidden">
      {/* Subtle Topographic / Coordinate Grid Background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-15"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Left Column: Brand & Chandigarh-Mohali GIS Visual Anchor */}
      <div className="lg:w-7/12 p-8 lg:p-16 flex flex-col justify-between relative z-10 border-b lg:border-b-0 lg:border-r border-[#22262E]">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#111316] border border-[#00D2FF]/40 flex items-center justify-center text-[#00D2FF]">
                <Shield className="w-5 h-5" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-white">
                UrbanShield
              </span>
            </div>
          </div>

          <div className="mt-12 lg:mt-20 max-w-xl">
            <p className="text-xs font-mono uppercase tracking-widest text-[#00D2FF] mb-3">
              Chandigarh & Mohali · GIS Safety Network
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.12] [text-wrap:balance]">
              Your City. Your Awareness. Your Safety.
            </h1>
            <p className="mt-5 text-base text-slate-300 leading-relaxed">
              Unified city safety intelligence combining live OpenStreetMap infrastructure,
              multi-factor route activity analysis, archival Police Station crime mapping, and
              instant SOS emergency responder coordination across Chandigarh and SAS Nagar (Mohali).
            </p>
          </div>

          {/* Interactive Vector GIS Preview Panel */}
          <div className="mt-10 bg-[#111316] border border-[#22262E] rounded-lg p-5 max-w-xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#22262E] text-xs text-[#8A909E]">
              <span>Coverage Corridor: Sectors 1–63 Chandigarh · Phases 1–11 Mohali</span>
              <span className="font-mono tabular-nums text-[#00D2FF]">30.7333° N, 76.7794° E</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A]">
                <div className="text-xs text-[#8A909E]">City Intelligence</div>
                <div className="mt-1 text-base font-display font-semibold text-white tabular-nums">
                  14 GIS Layers
                </div>
                <div className="mt-1 text-[11px] text-[#8A909E]">
                  Hospitals · Police · CCTV · Lighting
                </div>
              </div>
              <div className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A]">
                <div className="text-xs text-[#8A909E]">Smart Routes</div>
                <div className="mt-1 text-base font-display font-semibold text-[#F59E0B] tabular-nums">
                  3 Route Modes
                </div>
                <div className="mt-1 text-[11px] text-[#8A909E]">
                  Recommended · Fastest · Activity
                </div>
              </div>
              <div className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A]">
                <div className="text-xs text-[#8A909E]">Emergency SOS</div>
                <div className="mt-1 text-base font-display font-semibold text-[#EF4444] tabular-nums">
                  Live Dispatch
                </div>
                <div className="mt-1 text-[11px] text-[#8A909E]">
                  Trusted Contacts · Responders
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-[#22262E] flex flex-wrap items-center justify-between gap-4 text-xs text-[#8A909E]">
          <span>Data Sources: Leaflet · OpenStreetMap · OSRM · Nominatim · NCRB Archives</span>
          <span>Chandigarh & SAS Nagar (Mohali) Coverage</span>
        </div>
      </div>

      {/* Right Column: Authentication Card */}
      <div className="lg:w-5/12 p-6 sm:p-12 flex items-center justify-center relative z-10">
        <div className="w-full max-w-md bg-[#111316] border border-[#22262E] rounded-lg p-6 sm:p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="font-display text-2xl font-bold text-white">
              {activeTab === 'phone'
                ? 'Continue with Mobile OTP'
                : emailMode === 'signup'
                ? 'Create Citizen Account'
                : emailMode === 'forgot_request' || emailMode === 'forgot_confirm'
                ? 'Reset Account Password'
                : 'Sign In to UrbanShield'}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Access your personal safety command centre, trusted contacts, and live city layers.
            </p>
          </div>

          {/* A. Continue with Google Button */}
          <button
            type="button"
            onClick={handleGoogleTrigger}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-white text-slate-900 font-medium text-sm hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs text-slate-400">or authenticate via</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          {/* Method Switcher: Email vs Mobile Number */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('email');
                clearMessages();
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'email'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              <span>Email & Password</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('phone');
                clearMessages();
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'phone'
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Mobile OTP (+91)</span>
            </button>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-950/60 border border-red-500/40 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 flex items-start gap-2.5 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* B. Continue with Mobile Number Flow */}
          {activeTab === 'phone' && (
            <div>
              {otpStep === 'input_phone' ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Mobile Number (India +91 default)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="98150 12345"
                        required
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono tabular-nums placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Format: 10-digit mobile number starting with 6, 7, 8, or 9 for India (+91).
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>{submitting ? 'Generating OTP...' : 'Send 6-Digit OTP'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 space-y-1">
                    <div className="flex items-center justify-between">
                      <span>Target Number:</span>
                      <span className="font-mono font-semibold text-white">
                        {countryCode} {mobileNumber}
                      </span>
                    </div>
                    {otpDeliveryNote && (
                      <p className="text-slate-400 pt-1 border-t border-slate-800/80">
                        {otpDeliveryNote}
                      </p>
                    )}
                    {otpPreview && (
                      <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="text-cyan-300">Sandbox Dispatch OTP Code:</span>
                        <button
                          type="button"
                          onClick={() => setOtpCode(otpPreview)}
                          className="font-mono text-sm font-bold text-cyan-400 underline cursor-pointer"
                        >
                          {otpPreview} (Click to autofill)
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Enter 6-Digit Verification OTP
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-[0.4em] text-white font-mono tabular-nums focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>{submitting ? 'Verifying...' : 'Verify & Continue'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpStep('input_phone');
                        setOtpCode('');
                        clearMessages();
                      }}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Change mobile number
                    </button>

                    <button
                      type="button"
                      disabled={resendTimer > 0 || submitting}
                      onClick={() => handleSendOtp()}
                      className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 disabled:text-slate-500 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span className="font-mono tabular-nums">
                        {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : 'Resend OTP'}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* C. Continue with Email Flow */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {emailMode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Kabir Singh Bajwa"
                    required
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="citizen@chandigarh.in"
                  required
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {(emailMode === 'login' || emailMode === 'signup') && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-300">Password</label>
                    {emailMode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmailMode('forgot_request');
                          clearMessages();
                        }}
                        className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        emailMode === 'signup' ? 'Minimum 8 characters' : 'Enter your password'
                      }
                      required
                      minLength={emailMode === 'signup' ? 8 : 1}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {emailMode === 'forgot_confirm' && (
                <>
                  {resetCodePreview && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-300">Reset Verification Code:</span>
                      <button
                        type="button"
                        onClick={() => setResetCode(resetCodePreview)}
                        className="font-mono font-bold text-cyan-400 underline cursor-pointer"
                      >
                        {resetCodePreview} (Autofill)
                      </button>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      6-Digit Reset Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="123456"
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      New Password (min 8 characters)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New secure password"
                      required
                      minLength={8}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>
                  {submitting
                    ? 'Processing...'
                    : emailMode === 'login'
                    ? 'Sign In with Email'
                    : emailMode === 'signup'
                    ? 'Create Account'
                    : emailMode === 'forgot_request'
                    ? 'Send Password Reset Code'
                    : 'Confirm New Password'}
                </span>
              </button>

              {/* Mode Navigation Links */}
              <div className="pt-2 text-center text-xs text-slate-400">
                {emailMode === 'login' ? (
                  <span>
                    New to UrbanShield?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('signup');
                        clearMessages();
                      }}
                      className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                    >
                      Create a new account
                    </button>
                  </span>
                ) : (
                  <span>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('login');
                        clearMessages();
                      }}
                      className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                  </span>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Google Account Selection Modal (when external Supabase OAuth URL is not configured) */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0F172A] border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                <h3 className="font-display text-lg font-bold text-white">
                  Choose a Google Account
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGoogleModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-400 leading-relaxed">
              Select a Google account to authenticate with UrbanShield, or enter your Google
              address below.
            </p>

            <div className="mt-4 space-y-2.5">
              {[
                {
                  fullName: 'Shriyam Jha',
                  email: 'shriyamjha22@gmail.com',
                  tag: 'Primary Google Account',
                },
                {
                  fullName: 'Dr. Mehar Kaur',
                  email: 'mehar.kaur.pgimer@gmail.com',
                  tag: 'Chandigarh Sector 12 Resident',
                },
              ].map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => handleSelectGoogleAccount(acct)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 text-left transition-colors cursor-pointer"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{acct.fullName}</div>
                    <div className="text-xs text-slate-400 font-mono">{acct.email}</div>
                  </div>
                  <span className="text-xs text-cyan-400">{acct.tag}</span>
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customGoogleEmail.trim()) return;
                handleSelectGoogleAccount({
                  email: customGoogleEmail.trim(),
                  fullName:
                    customGoogleName.trim() || customGoogleEmail.trim().split('@')[0],
                });
              }}
              className="mt-4 pt-4 border-t border-slate-800 space-y-3"
            >
              <div className="text-xs font-medium text-slate-300">
                Or use another Google account:
              </div>
              <input
                type="text"
                value={customGoogleName}
                onChange={(e) => setCustomGoogleName(e.target.value)}
                placeholder="Your Full Name"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <input
                type="email"
                value={customGoogleEmail}
                onChange={(e) => setCustomGoogleEmail(e.target.value)}
                placeholder="your.name@gmail.com"
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
              />
              <button
                type="submit"
                className="w-full py-2 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs cursor-pointer"
              >
                Continue as Google User
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
