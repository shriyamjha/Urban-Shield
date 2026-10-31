import React, { useState } from 'react';
import { Send, ShieldAlert, Compass, CheckCircle2, Terminal, Navigation, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

interface AiAssistantViewProps {
  userLocation: { lat: number; lng: number };
  selectedRouteSummary?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  groundedFacilitiesCount?: number;
  groundedReportsCount?: number;
  timestamp: string;
}

const SUGGESTED_QUESTIONS = [
  'Find a route from Chandigarh Railway Station to CGC University Mohali.',
  'Which route has more documented commercial activity?',
  'Show nearby hospitals.',
  'What is the historical crime situation around Sector 22?',
  'Compare the fastest and recommended routes.',
  'What changes if I travel at 10 PM?',
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  userLocation,
  selectedRouteSummary,
}) => {
  const { token } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'UrbanShield Intelligence Assistant online for Chandigarh & SAS Nagar (Mohali). My analysis is grounded in live OSRM road-network calculations, verified OpenStreetMap facilities, archival Police Station crime records (2021–2024), and explicitly labelled community reports.\n\nSelect a benchmark prompt or ask about any route, hospital, police station, or sector.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendPrompt = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || loading) return;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: clean,
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const historyPayload = nextMessages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: clean,
          userLocation,
          selectedRouteSummary,
          history: historyPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reach City Intelligence Assistant.');
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: data.reply,
        groundedFacilitiesCount: data.groundedFacilitiesCount,
        groundedReportsCount: data.groundedReportsCount,
        timestamp: data.timestamp || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setError(err.message || 'Assistant request failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
      {/* Left Column: Grounding Context & Benchmark Prompts */}
      <div className="lg:col-span-4 bg-[#111316] border border-[#22262E] rounded-lg p-4 flex flex-col justify-between space-y-4">
        <div className="space-y-4">
          <div className="pb-3 border-b border-[#22262E]">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#00D2FF]">
              <Compass className="w-3.5 h-3.5" />
              <span>GROUNDED CITY INTELLIGENCE</span>
            </div>
            <h2 className="font-display text-base font-bold text-white mt-1">
              AI Route & Infrastructure Analyst
            </h2>
            <p className="text-xs text-[#8A909E] mt-1 leading-relaxed">
              Server-side Gemini intelligence connected to live OSRM routing, OpenStreetMap POIs,
              and Chandigarh/Mohali archival crime tables.
            </p>
          </div>

          {/* Active Context Telemetry */}
          <div className="p-3 rounded bg-[#181A1F] border border-[#2A2F3A] space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-[#8A909E]">
              <span>ACTIVE GPS ANCHOR</span>
              <span className="text-white tabular-nums">
                {userLocation.lat.toFixed(4)}° N, {userLocation.lng.toFixed(4)}° E
              </span>
            </div>
            <div className="pt-1.5 border-t border-[#22262E] text-[11px] text-slate-300">
              <span className="text-[#8A909E] block mb-0.5">ACTIVE ROUTE CONTEXT:</span>
              <span className="text-[#F59E0B]">
                {selectedRouteSummary ||
                  'No active route selected yet — ask me to calculate any route in Chandigarh or Mohali.'}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#8A909E]">
              Benchmark Natural-Language Queries
            </div>
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => sendPrompt(q)}
                disabled={loading}
                className="w-full p-2.5 rounded bg-[#181A1F] hover:bg-[#22262E] border border-[#2A2F3A] text-left text-xs text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 rounded bg-[#08090B] border border-[#22262E] space-y-1 text-xs">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#F59E0B]">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span>EPISTEMIC INTEGRITY RULES</span>
          </div>
          <p className="text-[11px] text-[#8A909E] leading-relaxed">
            Distinguishes documented commercial activity from safety, preserves Police Station crime
            granularity, and never fabricates camera counts or 100% safety claims.
          </p>
        </div>
      </div>

      {/* Right Column: Conversation Workspace */}
      <div className="lg:col-span-8 bg-[#111316] border border-[#22262E] rounded-lg p-4 flex flex-col h-[640px]">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#22262E]">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-[#00D2FF]" />
            <span className="font-display text-xs font-bold uppercase tracking-wider text-white">
              Live Intelligence Session
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#8A909E]">
            Multi-turn context enabled · Real-time OSRM + OSM grounding
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-2xl rounded-lg p-3.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[#00D2FF] text-[#08090B] font-semibold'
                    : 'bg-[#181A1F] border border-[#2A2F3A] text-slate-200'
                }`}
              >
                {m.content}

                {m.role === 'assistant' && m.groundedFacilitiesCount !== undefined && (
                  <div className="mt-2.5 pt-2 border-t border-[#2A2F3A] flex flex-wrap items-center gap-2 text-[10px] text-[#00D2FF] font-mono">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>
                      Grounded in {m.groundedFacilitiesCount} nearby OSM facilities ·{' '}
                      {m.groundedReportsCount} community reports · NCRB/Police Station archives
                    </span>
                  </div>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#8A909E] mt-1 px-1">
                {m.role === 'user' ? 'Citizen Query' : 'UrbanShield Analyst'} ·{' '}
                {new Date(m.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}

          {loading && (
            <div className="p-3.5 rounded-lg bg-[#181A1F] border border-[#2A2F3A] text-xs text-[#00D2FF] font-mono">
              Querying OSRM road network, OpenStreetMap facilities, and historical crime records...
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(input);
          }}
          className="mt-3 pt-3 border-t border-[#22262E] flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for a route, compare Night Activity Scores, check nearby hospitals, or query Sector 22 historical crime..."
            className="flex-1 bg-[#181A1F] border border-[#2A2F3A] rounded-lg px-3.5 py-2.5 text-xs text-white placeholder:text-[#8A909E] focus:outline-none focus:border-[#00D2FF]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#00D2FF] hover:bg-[#00D2FF]/90 text-[#08090B] font-bold text-xs cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Execute</span>
          </button>
        </form>
      </div>
    </div>
  );
};
