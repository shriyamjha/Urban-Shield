import React, { useState, useEffect } from 'react';
import { Siren, X, MapPin } from 'lucide-react';

interface SosCountdownModalProps {
  open: boolean;
  countdownSeconds: number;
  userLocation: { lat: number; lng: number };
  onCancel: () => void;
  onConfirmActivate: (notes: string, areaLabel: string) => Promise<void>;
}

export const SosCountdownModal: React.FC<SosCountdownModalProps> = ({
  open,
  countdownSeconds,
  userLocation,
  onCancel,
  onConfirmActivate,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const [notes, setNotes] = useState('Immediate emergency assistance requested');
  const [areaLabel, setAreaLabel] = useState('Chandigarh / Mohali Urban Corridor');
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(countdownSeconds);
    setActivating(false);
  }, [open, countdownSeconds]);

  useEffect(() => {
    if (!open || activating) return;
    if (secondsLeft <= 0) {
      setActivating(true);
      onConfirmActivate(notes, areaLabel);
      return;
    }
    const timer = setTimeout(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [open, secondsLeft, activating, notes, areaLabel, onConfirmActivate]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 urbanshield-fade-in">
      <div className="w-full max-w-md bg-[#101317] border border-[#FF4148]/60 rounded-2xl p-6 shadow-2xl space-y-5 urbanshield-modal-enter">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-[#FF4148] font-display font-semibold text-sm">
            <Siren className="w-4 h-4" />
            <span>Confirm Emergency SOS</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-lg text-[#929AA5] hover:text-[#F5F7FA] hover:bg-white/[0.05] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-center py-2">
          <div className="text-xs text-[#929AA5] mb-1">
            Broadcasting Emergency SOS in
          </div>
          <div className="text-5xl font-mono font-bold text-[#FF4148] tabular-nums">
            {secondsLeft}s
          </div>
          <p className="mt-1.5 text-xs text-[#929AA5]">
            Cancel below if triggered unintentionally.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-xl bg-[#0A0C0F] border border-white/[0.06] flex items-center gap-2 text-[#F5F7FA] font-mono">
            <MapPin className="w-3.5 h-3.5 text-[#FF4148] shrink-0" />
            <span>
              GPS: {userLocation.lat.toFixed(5)}° N, {userLocation.lng.toFixed(5)}° E
            </span>
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">
              Sector / Landmark Label
            </label>
            <input
              type="text"
              value={areaLabel}
              onChange={(e) => setAreaLabel(e.target.value)}
              className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-xl px-3 py-2 text-[#F5F7FA] focus:outline-none focus:border-[#FF4148]"
            />
          </div>

          <div>
            <label className="block text-[11px] text-[#929AA5] mb-1">
              Emergency Context Note
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#0A0C0F] border border-white/[0.08] rounded-xl px-3 py-2 text-[#F5F7FA] focus:outline-none focus:border-[#FF4148]"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="py-2.5 px-3 rounded-xl bg-[#15191E] hover:bg-[#1C2128] border border-white/[0.08] text-xs font-medium text-[#F5F7FA] cursor-pointer"
          >
            Cancel Countdown
          </button>
          <button
            type="button"
            disabled={activating}
            onClick={() => {
              setActivating(true);
              onConfirmActivate(notes, areaLabel);
            }}
            className="py-2.5 px-3 rounded-xl bg-[#FF4148] hover:bg-[#FF4148]/90 text-xs font-semibold text-white cursor-pointer"
          >
            {activating ? 'Activating...' : 'Activate Immediately'}
          </button>
        </div>
      </div>
    </div>
  );
};
