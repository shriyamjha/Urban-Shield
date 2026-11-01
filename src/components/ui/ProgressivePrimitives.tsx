import React, { useState, useEffect } from 'react';
import { ChevronDown, X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

interface ExpandableDetailsProps {
  label?: string;
  openLabel?: string;
  collapseLabel?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  storageKey?: string;
  variant?: 'minimal' | 'pill' | 'section';
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Progressive Disclosure Component:
 * Smoothly expands/collapses content within the page and occupies zero layout space when collapsed.
 */
export const ExpandableDetails: React.FC<ExpandableDetailsProps> = ({
  label = 'Show details',
  openLabel,
  collapseLabel,
  badge,
  defaultOpen = false,
  storageKey,
  variant = 'minimal',
  className = '',
  contentClassName = 'pt-3',
  children,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen;
    try {
      const saved = localStorage.getItem(`urbanshield_disclosure_${storageKey}`);
      return saved !== null ? saved === '1' : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(`urbanshield_disclosure_${storageKey}`, next ? '1' : '0');
        } catch {
          // Ignore storage error
        }
      }
      return next;
    });
  };

  const displayLabel = isOpen
    ? openLabel ||
      collapseLabel ||
      `Hide ${label.toLowerCase().replace(/^show\s+|^view\s+|^explore\s+|^expand\s+/i, '')}`
    : label;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className={
          variant === 'pill'
            ? 'urbanshield-interactive-btn inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#101317] hover:bg-[#15191E] border border-white/[0.07] text-xs font-medium text-[#F5F7FA] cursor-pointer'
            : variant === 'section'
            ? 'urbanshield-interactive-btn w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-[#0A0C0F] hover:bg-[#101317] border border-white/[0.06] text-xs font-medium text-[#F5F7FA] cursor-pointer'
            : 'urbanshield-interactive-btn inline-flex items-center gap-1.5 text-xs font-medium text-[#929AA5] hover:text-[#F5F7FA] cursor-pointer group'
        }
      >
        <span className="flex items-center gap-2">
          <span>{displayLabel}</span>
          {badge !== undefined && (
            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-mono text-[#929AA5] tabular-nums">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#929AA5] transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#00D9F5]' : 'group-hover:text-[#F5F7FA]'
          }`}
        />
      </button>

      <div className="urbanshield-collapse-wrapper" data-open={isOpen ? 'true' : 'false'}>
        <div className="urbanshield-collapse-inner">
          {isOpen && <div className={contentClassName}>{children}</div>}
        </div>
      </div>
    </div>
  );
};

interface AnimatedPanelProps {
  stagger?: 1 | 2 | 3 | 4 | 5;
  className?: string;
  children: React.ReactNode;
}

export const AnimatedPanel: React.FC<AnimatedPanelProps> = ({
  stagger,
  className = '',
  children,
}) => {
  const staggerClass = stagger ? `stagger-${stagger}` : '';
  return (
    <div className={`urbanshield-card-enter ${staggerClass} ${className}`}>
      {children}
    </div>
  );
};

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: React.ReactNode;
}

export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-lg',
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 urbanshield-map-fade"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} bg-[#101317] border border-white/[0.08] rounded-2xl p-6 shadow-[0_24px_64px_rgba(0,0,0,0.85)] urbanshield-card-enter`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.06]">
          <div>
            <h3 className="font-display text-lg font-semibold text-[#F5F7FA]">{title}</h3>
            {subtitle && <p className="text-xs text-[#929AA5] mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#929AA5] hover:text-[#F5F7FA] hover:bg-white/[0.05] transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
};

interface DetailDrawerProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  badge?: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open,
  onClose,
  eyebrow,
  badge,
  title,
  subtitle,
  children,
}) => {
  if (!open) return null;

  return (
    <div className="bg-[#101317] border border-white/[0.08] rounded-2xl p-5 space-y-4 urbanshield-card-enter">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          {eyebrow && (
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#00D9F5]">
              {eyebrow}
            </div>
          )}
          {badge && <div>{badge}</div>}
          <h3 className="font-display text-base font-semibold text-[#F5F7FA] leading-snug">
            {title}
          </h3>
          {subtitle && <p className="text-xs text-[#929AA5]">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#929AA5] hover:text-[#F5F7FA] hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
          aria-label="Close detail panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
};

interface CompactMetricProps {
  label: string;
  value: React.ReactNode;
  accent?: 'default' | 'cyan' | 'amber' | 'red' | 'emerald';
}

export const CompactMetric: React.FC<CompactMetricProps> = ({
  label,
  value,
  accent = 'default',
}) => {
  const valueColor =
    accent === 'cyan'
      ? 'text-[#00D9F5]'
      : accent === 'amber'
      ? 'text-[#F59E0B]'
      : accent === 'red'
      ? 'text-[#FF4148]'
      : accent === 'emerald'
      ? 'text-emerald-400'
      : 'text-[#F5F7FA]';

  return (
    <div className="inline-flex items-baseline gap-1.5 text-xs">
      <span className="text-[#929AA5]">{label}</span>
      <span className={`font-mono font-semibold tabular-nums ${valueColor}`}>{value}</span>
    </div>
  );
};

interface LoadingStateProps {
  label?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  label = 'Loading city intelligence...',
}) => (
  <div className="py-10 flex items-center justify-center">
    <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#101317] border border-white/[0.07] text-xs text-[#929AA5]">
      <span className="w-2 h-2 rounded-full bg-[#00D9F5] animate-ping" />
      <span>{label}</span>
    </div>
  </div>
);

interface ToastBannerProps {
  message: string | null;
  type?: 'info' | 'success' | 'error';
  onDismiss: () => void;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({
  message,
  type = 'info',
  onDismiss,
}) => {
  if (!message) return null;

  const styles =
    type === 'error'
      ? 'bg-[#FF4148]/10 border-[#FF4148]/30 text-[#FF4148]'
      : type === 'success'
      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
      : 'bg-[#101317] border-white/[0.1] text-[#F5F7FA]';

  const Icon =
    type === 'error' ? AlertCircle : type === 'success' ? CheckCircle2 : Info;

  return (
    <div
      className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-3 urbanshield-card-enter ${styles}`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs opacity-75 hover:opacity-100 cursor-pointer shrink-0"
      >
        Dismiss
      </button>
    </div>
  );
};
