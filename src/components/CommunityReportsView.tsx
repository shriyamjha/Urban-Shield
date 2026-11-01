import React, { useState } from 'react';
import {
  Plus,
  MapPin,
  Camera,
  ThumbsUp,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  CommunityReport,
  ReportCategory,
  ReportVerificationStatus,
} from '../types/urbanshield.ts';
import { ModalDialog, ExpandableDetails } from './ui/ProgressivePrimitives.tsx';

interface CommunityReportsViewProps {
  userLocation: { lat: number; lng: number };
  currentUserId: string;
  isModerator: boolean;
  reports: CommunityReport[];
  onSubmitReport: (payload: Partial<CommunityReport>) => Promise<void>;
  onConfirmReport: (reportId: string) => Promise<void>;
  onUpdateReportStatus: (
    reportId: string,
    status: ReportVerificationStatus
  ) => Promise<void>;
}

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  poorly_lit_area: 'Poorly Lit Area',
  road_hazard: 'Road Hazard',
  harassment_suspicious: 'Suspicious Activity',
  infrastructure_problem: 'Infrastructure Issue',
  blocked_road: 'Blocked Road',
  other_safety_concern: 'Safety Concern',
};

const STATUS_BADGE: Record<
  ReportVerificationStatus,
  { label: string; badgeClass: string }
> = {
  pending: {
    label: 'Pending',
    badgeClass: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25',
  },
  community_confirmed: {
    label: 'Confirmed',
    badgeClass: 'bg-[#00D9F5]/10 text-[#00D9F5] border-[#00D9F5]/25',
  },
  moderator_verified: {
    label: 'Verified',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  },
  resolved: {
    label: 'Resolved',
    badgeClass: 'bg-white/[0.04] text-[#929AA5] border-white/[0.08]',
  },
};

export const CommunityReportsView: React.FC<CommunityReportsViewProps> = ({
  userLocation,
  currentUserId,
  isModerator,
  reports,
  onSubmitReport,
  onConfirmReport,
  onUpdateReportStatus,
}) => {
  const [filterStatus, setFilterStatus] = useState<'all' | ReportVerificationStatus>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | ReportCategory>('all');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const [category, setCategory] = useState<ReportCategory>('poorly_lit_area');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationLabel, setLocationLabel] = useState('Sector 17E, Chandigarh');
  const [lat, setLat] = useState(userLocation.lat);
  const [lng, setLng] = useState(userLocation.lng);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingIds, setConfirmingIds] = useState<Set<string>>(new Set());

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2.5 * 1024 * 1024) {
      setError('Photo file must be under 2.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleConfirm = async (reportId: string) => {
    if (confirmingIds.has(reportId)) return;
    setActionError(null);
    setConfirmingIds((prev) => new Set(prev).add(reportId));
    try {
      await onConfirmReport(reportId);
    } catch (err: any) {
      setActionError(err?.message || 'Unable to update report confirmation. Changes rolled back.');
    } finally {
      setConfirmingIds((prev) => {
        const next = new Set(prev);
        next.delete(reportId);
        return next;
      });
    }
  };

  const handleStatusChange = async (reportId: string, status: ReportVerificationStatus) => {
    setActionError(null);
    try {
      await onUpdateReportStatus(reportId, status);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to update report verification status.');
    }
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
      setReportModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Could not submit community report.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (filterStatus !== 'all' && r.verificationStatus !== filterStatus) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    return true;
  });

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Clean Header + Prominent "Report an issue" Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="urbanshield-heading-enter">
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#F5F7FA] tracking-tight">
            Community Reports
          </h1>
          <p className="text-xs text-[#929AA5] mt-1">
            Citizen-submitted streetlighting, road hazard, and safety observations across Chandigarh &amp; Mohali.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setLat(userLocation.lat);
            setLng(userLocation.lng);
            setReportModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#00D9F5] hover:bg-[#00D9F5]/90 text-[#050607] font-display font-semibold text-xs transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Report an issue</span>
        </button>
      </div>

      {actionError && (
        <div className="p-3 rounded-xl bg-red-950/60 border border-[#FF4148]/40 text-xs text-red-200 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[11px] font-mono underline cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Compact Category & Verification Filter Bar */}
      <div className="urbanshield-card-enter stagger-1 bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              filterCategory === 'all'
                ? 'bg-[#15191E] text-[#00D9F5] border border-[#00D9F5]/30'
                : 'text-[#929AA5] hover:text-[#F5F7FA] hover:bg-[#101317]'
            }`}
          >
            All Categories ({reports.length})
          </button>
          {(Object.entries(CATEGORY_LABELS) as Array<[ReportCategory, string]>).map(
            ([catKey, catLabel]) => (
              <button
                key={catKey}
                type="button"
                onClick={() => setFilterCategory(catKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filterCategory === catKey
                    ? 'bg-[#15191E] text-[#00D9F5] border border-[#00D9F5]/30'
                    : 'text-[#929AA5] hover:text-[#F5F7FA] hover:bg-[#101317]'
                }`}
              >
                {catLabel}
              </button>
            )
          )}
        </div>

        {/* Status Selector */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | ReportVerificationStatus)}
          aria-label="Filter by verification status"
          className="bg-[#101317] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]/50 shrink-0"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="community_confirmed">Confirmed (3+)</option>
          <option value="moderator_verified">Verified</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {/* Clean List of Recent Community Reports */}
      <div className="urbanshield-card-enter stagger-2 space-y-2.5">
        {filteredReports.length === 0 ? (
          <div className="bg-[#0A0C0F] border border-white/[0.06] rounded-xl p-8 text-center space-y-2">
            <div className="text-sm font-medium text-[#F5F7FA]">No matching reports</div>
            <p className="text-xs text-[#929AA5]">
              Adjust your category or status filter, or click &quot;Report an issue&quot; to log a new observation.
            </p>
          </div>
        ) : (
          filteredReports.map((rep) => {
            const isExpanded = expandedReportId === rep.id;
            const st = STATUS_BADGE[rep.verificationStatus];
            const isConfirmedByMe = rep.confirmedByUserIds.includes(currentUserId);
            const isConfirming = confirmingIds.has(rep.id);
            const canResolve = isModerator || rep.userId === currentUserId;

            return (
              <div
                key={rep.id}
                className={`bg-[#0A0C0F] border rounded-xl transition-all duration-200 ${
                  isExpanded
                    ? 'border-[#00D9F5]/35 bg-[#101317]'
                    : 'border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                {/* Compact Preview Row: Title, Category, Location, Verification Status, Confirmation Count */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedReportId((prev) => (prev === rep.id ? null : rep.id))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedReportId((prev) => (prev === rep.id ? null : rep.id));
                    }
                  }}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md border text-[10px] font-mono uppercase ${st.badgeClass}`}
                      >
                        {st.label}
                      </span>
                      <span className="text-[11px] font-medium text-[#929AA5]">
                        {CATEGORY_LABELS[rep.category]}
                      </span>
                    </div>
                    <h3 className="font-display text-sm font-semibold text-[#F5F7FA] truncate">
                      {rep.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-[#929AA5]">
                      <MapPin className="w-3.5 h-3.5 text-[#00D9F5] shrink-0" />
                      <span className="truncate">{rep.locationLabel}</span>
                    </div>
                  </div>

                  {/* Confirmation Toggle Button + Expand Indicator */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={isConfirming}
                      onClick={() => handleToggleConfirm(rep.id)}
                      title={
                        isConfirmedByMe
                          ? 'You confirmed this report. Click to remove confirmation.'
                          : 'Confirm this community observation'
                      }
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all cursor-pointer disabled:opacity-60 ${
                        isConfirmedByMe
                          ? 'bg-[#00D9F5]/15 border-[#00D9F5]/50 text-[#00D9F5] font-semibold'
                          : 'bg-[#15191E] hover:bg-[#1C2128] border-white/[0.08] text-[#929AA5] hover:text-[#F5F7FA]'
                      }`}
                    >
                      {isConfirmedByMe ? (
                        <Check className="w-3.5 h-3.5 text-[#00D9F5]" />
                      ) : (
                        <ThumbsUp className="w-3.5 h-3.5" />
                      )}
                      <span className="text-[11px]">
                        {isConfirmedByMe ? 'Confirmed' : 'Confirm'}
                      </span>
                      <span className="font-mono tabular-nums font-semibold">
                        {rep.confirmationsCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedReportId((prev) => (prev === rep.id ? null : rep.id))
                      }
                      aria-label="Toggle report details"
                      className="p-1.5 rounded-lg text-[#929AA5] hover:text-[#F5F7FA] hover:bg-white/[0.04] cursor-pointer"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-180 text-[#00D9F5]' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Smoothly Expandable Details */}
                <div
                  className={`urbanshield-collapse-wrapper ${
                    isExpanded ? 'is-open' : 'is-closed'
                  }`}
                >
                  <div className="urbanshield-collapse-inner">
                    <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-3 text-xs">
                      <p className="text-[#F5F7FA]/90 leading-relaxed">{rep.description}</p>

                      {rep.photoUrl && (
                        <div className="w-48 h-28 rounded-lg overflow-hidden border border-white/[0.08]">
                          <img
                            src={rep.photoUrl}
                            alt={rep.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-[#929AA5]">
                        <div className="flex flex-wrap items-center gap-2 font-mono">
                          <span>
                            {rep.latitude.toFixed(4)}° N, {rep.longitude.toFixed(4)}° E
                          </span>
                          <span>·</span>
                          <span>Reported by {rep.reporterName}</span>
                          <span>·</span>
                          <span>{new Date(rep.createdAt).toLocaleString()}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isModerator &&
                            rep.verificationStatus !== 'moderator_verified' && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleStatusChange(rep.id, 'moderator_verified')
                                }
                                className="px-2.5 py-1 rounded-lg bg-[#15191E] hover:bg-[#1C2128] border border-white/[0.08] text-[11px] text-emerald-400 cursor-pointer"
                              >
                                Verify (Mod)
                              </button>
                            )}
                          {canResolve && rep.verificationStatus !== 'resolved' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(rep.id, 'resolved')}
                              className="px-2.5 py-1 rounded-lg bg-[#15191E] hover:bg-[#1C2128] border border-white/[0.08] text-[11px] text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Progressive Disclosure: Verification Lifecycle Explanation */}
      <ExpandableDetails
        label="More information on report verification"
        collapseLabel="Hide verification rules"
      >
        <p className="text-xs text-[#929AA5] leading-relaxed">
          Citizen-submitted reports begin as <strong className="text-[#F59E0B]">Pending</strong>, transition automatically to{' '}
          <strong className="text-[#00D9F5]">Confirmed</strong> upon receiving 3 or more unique citizen confirmations, and can be marked{' '}
          <strong className="text-emerald-400">Verified</strong> by authorized moderators/responders or <strong className="text-[#F5F7FA]">Resolved</strong> by the reporter or moderator.
        </p>
      </ExpandableDetails>

      {/* Modal Dialog for Submitting a New Community Report */}
      <ModalDialog
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title="Report an Infrastructure or Safety Issue"
        subtitle="Submit a location-anchored observation for Chandigarh or SAS Nagar (Mohali)"
      >
        <form onSubmit={handleCreate} className="space-y-3.5">
          {error && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-[#FF4148]/40 text-xs text-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ReportCategory)}
              className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">
              Short Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Streetlight outage near Sector 22C market"
              required
              className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">
              Location / Sector *
            </label>
            <input
              type="text"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g., Sector 35C Inner Market, Chandigarh"
              required
              className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-[#929AA5] mb-1">
                Latitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-[#F5F7FA]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#929AA5] mb-1">
                Longitude
              </label>
              <input
                type="number"
                step="0.0001"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
                className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-[#F5F7FA]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">
              Description *
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe landmarks, lighting, or road conditions..."
              required
              className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-lg p-2.5 text-xs text-[#F5F7FA] focus:outline-none focus:border-[#00D9F5]"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0A0C0F] hover:bg-[#15191E] border border-white/[0.08] text-xs text-[#F5F7FA] cursor-pointer">
              <Camera className="w-3.5 h-3.5 text-[#00D9F5]" />
              <span>{photoUrl ? 'Photo Attached' : 'Attach Photo'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                className="px-3.5 py-2 rounded-lg bg-[#0A0C0F] hover:bg-[#15191E] border border-white/[0.08] text-xs text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-[#00D9F5] hover:bg-[#00D9F5]/90 text-[#050607] font-semibold text-xs cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
};
