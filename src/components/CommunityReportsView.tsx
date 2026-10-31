import React, { useState } from 'react';
import {
  PlusCircle,
  MapPin,
  Camera,
  ThumbsUp,
} from 'lucide-react';
import {
  CommunityReport,
  ReportCategory,
  ReportVerificationStatus,
} from '../types/urbanshield.ts';

interface CommunityReportsViewProps {
  userLocation: { lat: number; lng: number };
  reports: CommunityReport[];
  onSubmitReport: (payload: Partial<CommunityReport>) => Promise<void>;
  onConfirmReport: (reportId: string) => Promise<void>;
  onUpdateReportStatus: (
    reportId: string,
    status: ReportVerificationStatus
  ) => Promise<void>;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  poorly_lit_area: 'Poorly Lit Area / Streetlight Outage',
  road_hazard: 'Road Hazard / Unlit Excavation',
  harassment_suspicious: 'Harassment or Suspicious Activity',
  infrastructure_problem: 'Infrastructure / Signal Problem',
  blocked_road: 'Blocked Road / Obstruction',
  other_safety_concern: 'Other Safety-Related Concern',
};

export const CommunityReportsView: React.FC<CommunityReportsViewProps> = ({
  userLocation,
  reports,
  onSubmitReport,
  onConfirmReport,
  onUpdateReportStatus,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | ReportVerificationStatus>('all');
  const [category, setCategory] = useState<ReportCategory>('poorly_lit_area');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationLabel, setLocationLabel] = useState('Sector 17E, Chandigarh');
  const [lat, setLat] = useState(userLocation.lat);
  const [lng, setLng] = useState(userLocation.lng);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmitReport({
        category,
        title,
        description,
        locationLabel,
        latitude: lat,
        longitude: lng,
        photoUrl: photoUrl || undefined,
      });
      setTitle('');
      setDescription('');
      setPhotoUrl('');
    } catch (err: any) {
      setError(err.message || 'Could not submit community report.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReports = reports.filter((r) =>
    filterStatus === 'all' ? true : r.verificationStatus === filterStatus
  );

  return (
    <div className="space-y-4">
      {/* Epistemic Distinction Banner */}
      <div className="bg-[#111316] border border-[#22262E] rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
            Community Safety & Infrastructure Incident Reporting
          </h2>
          <p className="text-xs text-[#8A909E]">
            User-submitted reports start as <strong className="text-[#F59E0B]">Pending</strong>,
            transition to <strong className="text-[#00D2FF]">Community-Confirmed</strong> at 3+
            citizen verifications, and can be marked{' '}
            <strong className="text-emerald-400">Moderator-Verified</strong> or{' '}
            <strong className="text-slate-300">Resolved</strong>.
          </p>
        </div>

        {/* Interactive Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#181A1F] border border-[#2A2F3A] rounded shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'community_confirmed', label: 'Confirmed' },
            { id: 'moderator_verified', label: 'Verified' },
            { id: 'resolved', label: 'Resolved' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id as any)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filterStatus === tab.id
                  ? 'bg-[#00D2FF] text-[#08090B] font-bold'
                  : 'text-[#8A909E] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Submit Report Form */}
        <form
          onSubmit={handleCreate}
          className="lg:col-span-4 bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center gap-2 pb-2.5 border-b border-[#22262E]">
            <PlusCircle className="w-4 h-4 text-[#00D2FF]" />
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-white">
              Submit Infrastructure or Safety Report
            </h3>
          </div>

          {error && (
            <div className="p-2.5 rounded bg-red-950/60 border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Incident Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Concise Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Non-functional streetlights near Sector 22C park"
              required
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Sector / Location Label *
            </label>
            <input
              type="text"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g., Sector 35C Inner Market, Chandigarh"
              required
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-xs text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
                className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-2.5 py-1.5 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Detailed Description *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe specific landmarks, lighting or road conditions..."
              required
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded p-2.5 text-xs text-white"
            />
          </div>

          <div>
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-xs text-slate-200 cursor-pointer">
              <Camera className="w-3.5 h-3.5 text-[#00D2FF]" />
              <span>{photoUrl ? 'Photograph Attached' : 'Attach Optional Photograph'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 rounded bg-[#00D2FF] hover:bg-[#00D2FF]/90 text-[#08090B] font-bold text-xs cursor-pointer"
          >
            {submitting ? 'Submitting Report...' : 'Publish Community Report'}
          </button>
        </form>

        {/* Reports Feed */}
        <div className="lg:col-span-8 space-y-2.5">
          {filteredReports.map((rep) => {
            const statusLabelMap: Record<ReportVerificationStatus, { text: string; color: string }> =
              {
                pending: {
                  text: 'USER-SUBMITTED · PENDING VERIFICATION',
                  color: 'text-[#F59E0B]',
                },
                community_confirmed: {
                  text: 'COMMUNITY-CONFIRMED REPORT',
                  color: 'text-[#00D2FF]',
                },
                moderator_verified: {
                  text: 'MODERATOR-VERIFIED REPORT',
                  color: 'text-emerald-400',
                },
                resolved: {
                  text: 'RESOLVED INCIDENT',
                  color: 'text-[#8A909E]',
                },
              };
            const st = statusLabelMap[rep.verificationStatus];

            return (
              <div
                key={rep.id}
                className="bg-[#111316] border border-[#22262E] rounded-lg p-4 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex flex-wrap items-center gap-2 text-[#8A909E]">
                    <span className={`font-mono font-bold ${st.color}`}>{st.text}</span>
                    <span>·</span>
                    <span>{CATEGORY_LABELS[rep.category]}</span>
                    <span>·</span>
                    <span className="font-mono">
                      {new Date(rep.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#8A909E]">
                    Expires {new Date(rep.expiresAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="font-display text-sm font-bold text-white">{rep.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{rep.description}</p>

                {rep.photoUrl && (
                  <div className="w-44 h-24 rounded overflow-hidden border border-[#22262E]">
                    <img
                      src={rep.photoUrl}
                      alt={rep.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="pt-2.5 border-t border-[#22262E] flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-[#8A909E] text-[11px]">
                    <MapPin className="w-3.5 h-3.5 text-[#00D2FF]" />
                    <span className="text-slate-300">{rep.locationLabel}</span>
                    <span>·</span>
                    <span className="font-mono">
                      {rep.latitude.toFixed(4)}° N, {rep.longitude.toFixed(4)}° E
                    </span>
                    <span>·</span>
                    <span>By {rep.reporterName}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onConfirmReport(rep.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-[11px] text-[#00D2FF] cursor-pointer"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span className="font-mono tabular-nums">
                        Confirm ({rep.confirmationsCount})
                      </span>
                    </button>

                    {rep.verificationStatus !== 'moderator_verified' && (
                      <button
                        type="button"
                        onClick={() => onUpdateReportStatus(rep.id, 'moderator_verified')}
                        className="px-2.5 py-1 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-[11px] text-emerald-400 cursor-pointer"
                      >
                        Verify (Mod)
                      </button>
                    )}

                    {rep.verificationStatus !== 'resolved' && (
                      <button
                        type="button"
                        onClick={() => onUpdateReportStatus(rep.id, 'resolved')}
                        className="px-2.5 py-1 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-[11px] text-[#8A909E] cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
