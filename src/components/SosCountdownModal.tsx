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
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#111316] border-2 border-[#EF4444] rounded-lg p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-[#22262E]">
          <div className="flex items-center gap-2 text-[#EF4444] font-display font-bold text-sm uppercase tracking-wider">
            <Siren className="w-4 h-4" />
            <span>Confirm Emergency SOS Activation</span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#8A909E] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-center py-2">
          <div className="text-[11px] uppercase font-mono text-[#8A909E] mb-1">
            Broadcasting Emergency SOS in
          </div>
          <div className="text-5xl font-mono font-bold text-[#EF4444] tabular-nums">
            {secondsLeft}s
          </div>
          <p className="mt-1.5 text-xs text-slate-300">
            Cancel below if triggered unintentionally.
          </p>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="p-2.5 rounded bg-[#181A1F] border border-[#2A2F3A] flex items-center gap-2 text-slate-200 font-mono">
            <MapPin className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
            <span>
              GPS: {userLocation.lat.toFixed(5)}° N, {userLocation.lng.toFixed(5)}° E
            </span>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Sector / Landmark Label
            </label>
            <input
              type="text"
              value={areaLabel}
              onChange={(e) => setAreaLabel(e.target.value)}
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-white"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-[#8A909E] mb-1">
              Emergency Context Note
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#181A1F] border border-[#2A2F3A] rounded px-3 py-2 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="py-2 px-3 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-xs font-semibold text-white cursor-pointer"
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
            className="py-2 px-3 rounded bg-[#EF4444] hover:bg-red-500 text-xs font-bold text-white cursor-pointer"
          >
            {activating ? 'Activating...' : 'Activate Immediately'}
          </button>
        </div>
      </div>
    </div>
  );
};
