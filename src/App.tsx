'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap, AlertTriangle, Loader2, RefreshCw,
  ChevronDown, CheckCircle2,
  TrendingUp, Globe, Calendar, Layers,
  Send, MessageSquare, Users, BarChart3,
  FileDown, Target, ShieldCheck, PieChart, LineChart, DollarSign, FileText, Hexagon,
} from 'lucide-react';
import {
  generateMarketAssumptions,
  generateCompetitors,
  generateScenarios,
  chatWithAnalyst,
  sanityCheckAssumption,
  recalculate,
  formatCurrency,
  generatePortersFiveForces,
  generateSWOT,
  generateSegmentation,
  generateGrowthProjection,
  generateRevenueModel,
  generateInvestmentThesis,
  runIdeaAgent,
} from './lib/marketSizing';
import type { AgentUpdate } from './lib/marketSizing';
import type {
  MarketSizingInput,
  SizingStep,
  MarketSizingResult,
  SanityCheckResult,
  Methodology,
  Competitor,
  ScenarioResult,
  ChatMessage,
  PortersFiveForcesResult,
  SWOTResult,
  MarketSegment,
  GrowthProjection,
  RevenueModelType,
  RevenueProjection,
  InvestmentThesis,
  PorterForce,
} from './lib/marketSizing';

// ─── Count-up animation ───────────────────────────────────────────────────────

function useCountUp(target: number, run: boolean, duration = 1600) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>();
  useEffect(() => {
    if (!run) { setVal(0); return; }
    const start = performance.now();
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 4);
      setVal(Math.floor(target * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setVal(target);
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, run, duration]);
  return val;
}

// ─── Metric card ─────────────────────────────────────────────────────────────

function MetricCard({ label, sublabel, value, color, delay, run }: {
  label: string; sublabel: string; value: number;
  color: string; delay: number; run: boolean;
}) {
  const displayed = useCountUp(value, run);
  return (
    <div
      className="card relative overflow-hidden"
      style={{
        animation: `fadeUp 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
        borderColor: `${color}18`,
        padding: 0,
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${color}, ${color}40, transparent)` }} />

      {/* Corner glow */}
      <div
        className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
        style={{ background: `${color}09` }}
      />

      <div style={{ padding: '20px 22px 22px' }} className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="label" style={{ color }}>{label}</span>
          <span className="tag" style={{ color, background: `${color}10`, border: `1px solid ${color}20` }}>
            {sublabel}
          </span>
        </div>

        <div
          className="font-bold leading-none"
          style={{
            fontFamily: 'var(--font-display)',
            color: 'var(--fg-1)',
            fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
            fontWeight: 700,
          }}
        >
          {formatCurrency(displayed)}
        </div>

        <div
          className="mt-4 h-px w-full"
          style={{ background: `linear-gradient(90deg, ${color}55, transparent)` }}
        />
      </div>
    </div>
  );
}

// ─── Funnel chart ─────────────────────────────────────────────────────────────

function FunnelChart({ tam, sam, som }: { tam: number; sam: number; som: number }) {
  const w = 320, h = 220;
  const bars = [
    { label: 'TAM', value: tam, color: '#6366F1', pct: 1,              y: 0   },
    { label: 'SAM', value: sam, color: '#22D3EE', pct: sam / (tam||1), y: 75  },
    { label: 'SOM', value: som, color: '#34D399', pct: som / (tam||1), y: 150 },
  ];

  const maxW = w - 60;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full max-w-xs mx-auto">
      <defs>
        {bars.map(({ label, color }) => (
          <linearGradient key={label} id={`grad-${label}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
        ))}
      </defs>

      {bars.map(({ label, value, color, pct, y }) => {
        const barW = maxW * pct;
        const x = (w - barW - 52) / 2;
        return (
          <g key={label}>
            {/* Track */}
            <rect
              x={(w - maxW - 52) / 2}
              y={y + 14}
              width={maxW}
              height={26}
              rx={6}
              fill="rgba(255,255,255,0.03)"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={1}
            />
            {/* Fill */}
            <rect
              x={x}
              y={y + 14}
              width={barW || 2}
              height={26}
              rx={6}
              fill={`url(#grad-${label})`}
            />
            {/* Label */}
            <text
              x={(w - maxW - 52) / 2 - 6}
              y={y + 31}
              textAnchor="end"
              fontSize={11}
              fontFamily="JetBrains Mono, monospace"
              fontWeight={700}
              fill={color}
            >
              {label}
            </text>
            {/* Value */}
            <text
              x={w - 4}
              y={y + 31}
              textAnchor="end"
              fontSize={10}
              fontFamily="JetBrains Mono, monospace"
              fill="rgba(255,255,255,0.5)"
            >
              {formatCurrency(value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function Badge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const m = {
    high:   { color: '#34D399', bg: 'rgba(52,211,153,0.1)',  text: 'HIGH' },
    medium: { color: '#FBBF24', bg: 'rgba(251,191,36,0.1)',  text: 'MED'  },
    low:    { color: '#F87171', bg: 'rgba(248,113,113,0.1)', text: 'LOW'  },
  };
  const { color, bg, text } = m[level];
  return (
    <span className="tag" style={{ color, background: bg }}>
      {text}
    </span>
  );
}

// ─── Editable assumption row ──────────────────────────────────────────────────

function AssumptionRow({ step, index, onChange, onBlur, warning }: {
  step: SizingStep;
  index: number;
  onChange: (id: string, v: number) => void;
  onBlur:   (id: string, oldV: number, newV: number) => void;
  warning:  SanityCheckResult | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState('');
  const prevRef = useRef(step.value);

  const ops: Record<string, string> = {
    start: '=', multiply: '×', percentage: '÷100×', subtract: '−', add: '+',
  };

  function startEdit() {
    setEditing(true);
    setDraft(String(step.value));
    prevRef.current = step.value;
  }

  function commit() {
    setEditing(false);
    const n = parseFloat(draft);
    const final = !isNaN(n) && n > 0 ? n : step.value;
    onChange(step.id, final);
    onBlur(step.id, prevRef.current, final);
  }

  return (
    <>
      <tr
        className="group transition-colors"
        style={{
          borderBottom: '1px solid rgba(99,102,241,0.06)',
          background: editing ? 'rgba(99,102,241,0.04)' : 'transparent',
        }}
      >
        {/* Index */}
        <td className="px-4 py-3 w-10 align-middle">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
            style={{
              fontFamily: 'var(--font-mono)',
              background: 'var(--ink-3)',
              color: 'var(--fg-3)',
            }}
          >
            {index + 1}
          </div>
        </td>

        {/* Op */}
        <td className="px-2 py-3 w-14 align-middle">
          <span
            className="text-xs font-bold"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--indigo)', opacity: 0.7 }}
          >
            {ops[step.operation] ?? '?'}
          </span>
        </td>

        {/* Label + source */}
        <td className="px-3 py-3 align-middle" style={{ minWidth: 200 }}>
          <div className="text-sm font-medium" style={{ color: 'var(--fg-1)' }}>
            {step.label}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: '0.65rem' }}
          >
            {step.source}
          </div>
        </td>

        {/* Value (editable) */}
        <td className="px-3 py-3 w-44 align-middle">
          <div
            onClick={startEdit}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-text transition-all"
            style={{
              background: editing ? 'rgba(99,102,241,0.08)' : 'var(--ink-3)',
              border: `1px solid ${editing ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.1)'}`,
            }}
          >
            {editing ? (
              <input
                autoFocus
                className="w-full bg-transparent text-sm font-bold outline-none"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--indigo-hi)' }}
                value={draft}
                onChange={e => {
                  setDraft(e.target.value);
                  const n = parseFloat(e.target.value);
                  if (!isNaN(n) && n > 0) onChange(step.id, n);
                }}
                onBlur={commit}
                onKeyDown={e => e.key === 'Enter' && commit()}
              />
            ) : (
              <span
                className="text-sm font-bold"
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}
              >
                {step.value.toLocaleString()}
              </span>
            )}
            <span
              className="text-xs flex-shrink-0"
              style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}
            >
              {step.unit}
            </span>
          </div>
        </td>

        {/* Confidence */}
        <td className="px-3 py-3 w-20 align-middle">
          <Badge level={step.confidence} />
        </td>

        {/* Rationale */}
        <td className="px-3 py-3 align-middle" style={{ maxWidth: 280 }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-2)' }}>
            {step.rationale}
          </p>
        </td>
      </tr>

      {/* Warning row */}
      {warning && !warning.valid && (
        <tr>
          <td colSpan={6} className="px-4 pb-3 pt-0">
            <div
              className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
              style={{
                background: 'var(--amber-lo)',
                border: '1px solid rgba(251,191,36,0.2)',
              }}
            >
              <AlertTriangle size={13} style={{ color: 'var(--amber)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="text-xs" style={{ color: 'var(--amber)' }}>{warning.warning}</p>
                {warning.suggested_value != null && (
                  <p
                    className="text-xs mt-0.5"
                    style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}
                  >
                    Suggested: {warning.suggested_value.toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Pentagon Chart (Porter's Five Forces) ────────────────────────────────────

function PentagonChart({ data }: { data: PortersFiveForcesResult }) {
  const cx = 160, cy = 160, r = 110;
  // Top-pointing pentagon, clockwise: top, upper-right, lower-right, lower-left, upper-left
  const angles = [90, 18, -54, -126, -198].map(deg => (deg * Math.PI) / 180);
  const forceKeys: Array<keyof PortersFiveForcesResult> = [
    'competitive_rivalry', 'buyer_power', 'threat_of_substitutes',
    'threat_of_new_entrants', 'supplier_power',
  ];
  const forces = forceKeys.map(k => data[k] as PorterForce);

  const pt = (a: number, scale = 1) => ({
    x: cx + r * scale * Math.cos(a),
    y: cy - r * scale * Math.sin(a),
  });

  const outerPts = angles.map(a => pt(a));
  const innerPts = angles.map((a, i) => pt(a, forces[i].score / 10));

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';

  const ratingColor = (rating: string) =>
    rating === 'High' ? '#F87171' : rating === 'Medium' ? '#FBBF24' : '#34D399';

  return (
    <svg width={320} height={320} viewBox="0 0 320 320" className="mx-auto">
      {/* Grid lines at 33%, 66%, 100% */}
      {[0.33, 0.66, 1].map(s => (
        <path key={s} d={toPath(angles.map(a => pt(a, s)))}
          fill="none" stroke="rgba(99,102,241,0.12)" strokeWidth={1} />
      ))}
      {/* Spokes */}
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={outerPts[i].x} y2={outerPts[i].y}
          stroke="rgba(99,102,241,0.1)" strokeWidth={1} />
      ))}
      {/* Filled area */}
      <path d={toPath(innerPts)} fill="rgba(99,102,241,0.15)" stroke="#6366F1" strokeWidth={1.5} />
      {/* Score dots */}
      {innerPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={5}
          fill={ratingColor(forces[i].rating)} stroke="var(--ink-2)" strokeWidth={1.5} />
      ))}
      {/* Labels */}
      {angles.map((a, i) => {
        const lp = pt(a, 1.28);
        const name = forces[i].force.split(' ');
        return (
          <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
            fontSize={8.5} fontFamily="JetBrains Mono, monospace" fill="var(--fg-3)">
            {name.map((w, wi) => (
              <tspan key={wi} x={lp.x} dy={wi === 0 ? (name.length > 1 ? -6 : 0) : 11}>{w}</tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Growth Line Chart ────────────────────────────────────────────────────────

function GrowthLineChart({ data }: { data: GrowthProjection }) {
  const W = 580, H = 220, PAD = { top: 16, right: 12, bottom: 36, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = [...data.bear, ...data.base_vals, ...data.bull];
  const maxV = Math.max(...allVals);

  const xScale = (i: number) => PAD.left + (i / (data.years.length - 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - (v / maxV) * chartH;

  const toPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

  const toArea = (vals: number[]) =>
    toPath(vals) +
    ` L${xScale(vals.length - 1).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({ v: maxV * p, y: yScale(maxV * p) }));

  function fmtV(v: number) {
    if (v >= 1e12) return `₹${(v / 1e12).toFixed(1)}T`;
    if (v >= 1e9) return `₹${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `₹${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
    return `₹${v.toFixed(0)}`;
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Y grid + labels */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
            stroke="rgba(99,102,241,0.08)" strokeWidth={1} strokeDasharray="3 3" />
          <text x={PAD.left - 6} y={y} textAnchor="end" dominantBaseline="middle"
            fontSize={9} fontFamily="JetBrains Mono, monospace" fill="var(--fg-4)">
            {fmtV(v)}
          </text>
        </g>
      ))}
      {/* X axis labels (every 2 years) */}
      {data.years.filter((_, i) => i % 2 === 0).map((yr) => {
        const i = data.years.indexOf(yr);
        return (
          <text key={yr} x={xScale(i)} y={PAD.top + chartH + 18} textAnchor="middle"
            fontSize={9} fontFamily="JetBrains Mono, monospace" fill="var(--fg-4)">
            {yr}
          </text>
        );
      })}
      {/* Area fills */}
      <path d={toArea(data.bull)} fill="rgba(52,211,153,0.06)" />
      <path d={toArea(data.base_vals)} fill="rgba(251,191,36,0.08)" />
      {/* Lines */}
      <path d={toPath(data.bear)} fill="none" stroke="#F87171" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={toPath(data.base_vals)} fill="none" stroke="#FBBF24" strokeWidth={2} />
      <path d={toPath(data.bull)} fill="none" stroke="#34D399" strokeWidth={1.5} strokeDasharray="4 3" />
      {/* Legend */}
      {[
        { label: `Bear ${data.cagr_bear}% CAGR`, color: '#F87171', dash: true },
        { label: `Base ${data.cagr_base}% CAGR`, color: '#FBBF24', dash: false },
        { label: `Bull ${data.cagr_bull}% CAGR`, color: '#34D399', dash: true },
      ].map(({ label, color, dash }, i) => (
        <g key={label} transform={`translate(${PAD.left + i * 160}, 6)`}>
          <line x1={0} y1={5} x2={20} y2={5} stroke={color} strokeWidth={2}
            strokeDasharray={dash ? '4 3' : undefined} />
          <text x={25} y={9} fontSize={9} fontFamily="JetBrains Mono, monospace" fill="var(--fg-3)">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Revenue Bar Chart ────────────────────────────────────────────────────────

function RevenueBarChart({ data }: { data: RevenueProjection }) {
  if (!data.years.length) return null;
  const W = 560, H = 200, PAD = { top: 20, right: 12, bottom: 36, left: 64 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = data.years.length;
  const groupW = chartW / n;
  const barW = groupW * 0.25;

  const allVals = data.years.flatMap(y => [y.revenue, y.gross_profit, Math.abs(y.ebitda)]);
  const maxV = Math.max(...allVals, 1);
  const minV = Math.min(...data.years.map(y => y.ebitda));
  const range = maxV - Math.min(minV, 0);
  const zeroY = PAD.top + chartH * (maxV / range);

  const yScale = (v: number) => PAD.top + chartH * ((maxV - v) / range);

  function fmtV(v: number) {
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}₹${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}₹${(abs / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}K`;
    return `${sign}₹${abs.toFixed(0)}`;
  }
  // Suppress unused warning
  void fmtV;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Zero line */}
      <line x1={PAD.left} y1={zeroY} x2={PAD.left + chartW} y2={zeroY}
        stroke="rgba(99,102,241,0.2)" strokeWidth={1} />
      {data.years.map((yr, i) => {
        const gx = PAD.left + i * groupW + groupW * 0.1;
        const bars = [
          { v: yr.revenue,       color: '#6366F1', off: 0 },
          { v: yr.gross_profit,  color: '#22D3EE', off: barW + 2 },
          { v: yr.ebitda,        color: yr.ebitda >= 0 ? '#34D399' : '#F87171', off: (barW + 2) * 2 },
        ];
        return (
          <g key={yr.year}>
            {bars.map(({ v, color, off }) => {
              const y1 = Math.min(yScale(v), zeroY);
              const bh = Math.abs(yScale(v) - zeroY);
              return (
                <rect key={off} x={gx + off} y={y1} width={barW} height={Math.max(bh, 1)}
                  fill={color} opacity={0.8} rx={2} />
              );
            })}
            <text x={gx + groupW * 0.35} y={PAD.top + chartH + 16} textAnchor="middle"
              fontSize={9} fontFamily="JetBrains Mono, monospace" fill="var(--fg-4)">
              {yr.year}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      {[
        { label: 'Revenue', color: '#6366F1' },
        { label: 'Gross Profit', color: '#22D3EE' },
        { label: 'EBITDA', color: '#34D399' },
      ].map(({ label, color }, i) => (
        <g key={label} transform={`translate(${PAD.left + i * 145}, 4)`}>
          <rect x={0} y={0} width={10} height={10} fill={color} rx={2} opacity={0.8} />
          <text x={14} y={9} fontSize={9} fontFamily="JetBrains Mono, monospace" fill="var(--fg-3)">
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Examples ─────────────────────────────────────────────────────────────────

const EXAMPLES: { market: string; geography: string; methodology: Methodology }[] = [
  { market: 'Indian EV market',       geography: 'India',         methodology: 'top-down'   },
  { market: 'US cloud security',      geography: 'United States', methodology: 'top-down'   },
  { market: 'Global fintech lending', geography: 'Global',        methodology: 'bottom-up'  },
  { market: 'Southeast Asia e-commerce', geography: 'SEA',        methodology: 'top-down'   },
];

// ─── Main app ─────────────────────────────────────────────────────────────────

export default function App() {
  const [input, setInput] = useState<MarketSizingInput>({
    market: '', geography: '', year: new Date().getFullYear(), methodology: 'top-down',
  });

  const [result,   setResult]   = useState<MarketSizingResult | null>(null);
  const [steps,    setSteps]    = useState<SizingStep[]>([]);
  const [computed, setComputed] = useState({ tam: 0, sam: 0, som: 0 });
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [dots,     setDots]     = useState('');
  const [warnings, setWarnings] = useState<Record<string, SanityCheckResult>>({});
  const [animated, setAnimated] = useState(false);

  // New feature state
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Porter's Five Forces
  const [porters, setPorters] = useState<PortersFiveForcesResult | null>(null);
  const [portersLoading, setPortersLoading] = useState(false);
  // SWOT
  const [swot, setSwot] = useState<SWOTResult | null>(null);
  const [swotLoading, setSwotLoading] = useState(false);
  // Segmentation
  const [segments, setSegments] = useState<MarketSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  // Growth projection
  const [growth, setGrowth] = useState<GrowthProjection | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  // Revenue model
  const [revenueModel, setRevenueModel] = useState<RevenueProjection | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [selectedModelType, setSelectedModelType] = useState<RevenueModelType>('saas');
  // Investment thesis
  const [thesis, setThesis] = useState<InvestmentThesis | null>(null);
  const [thesisLoading, setThesisLoading] = useState(false);
  // Idea agent mode
  const [ideaMode, setIdeaMode]       = useState(false);
  const [ideaText, setIdeaText]       = useState('');
  const [agentLogs, setAgentLogs]     = useState<AgentUpdate[]>([]);
  const [agentRunning, setAgentRunning] = useState(false);

  // Competitor enrichment (live financial + funding data)
  const [enrichedData, setEnrichedData] = useState<Record<string, {
    financials?: { ticker?: string; marketCap?: number; stockPrice?: number; peRatio?: number; source: string };
    funding?: { totalRaised?: number; lastRound?: string; investors?: string[]; valuation?: number; source: string };
  }>>({});
  const [enriching, setEnriching] = useState(false);

  // Export modal
  const [exportModal, setExportModal] = useState<null | 'notion' | 'slack'>(null);

  // Unit economics (pure frontend, no loading)
  const [arpu, setArpu] = useState(50);
  const [churnPct, setChurnPct] = useState(2);
  const [cac, setCac] = useState(300);
  const [grossMarginPct, setGrossMarginPct] = useState(70);

  // Animated dots while loading
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 450);
    return () => clearInterval(id);
  }, [loading]);

  // Trigger count-up on new result
  useEffect(() => {
    if (!result) { setAnimated(false); return; }
    setAnimated(false);
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, [result]);

  async function analyze() {
    if (!input.market.trim() || !input.geography.trim()) return;
    setLoading(true); setError(''); setResult(null);
    setSteps([]); setWarnings({}); setDots('');
    try {
      const res = await generateMarketAssumptions(input);
      setResult(res);
      setSteps(res.steps);
      setComputed({ tam: res.tam, sam: res.sam, som: res.som });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const onValueChange = useCallback((id: string, value: number) => {
    setSteps(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, value } : s);
      setComputed(recalculate(updated));
      return updated;
    });
  }, []);

  const onBlur = useCallback(async (id: string, oldVal: number, newVal: number) => {
    if (oldVal === newVal || !result) return;
    const step = steps.find(s => s.id === id);
    if (!step) return;
    const ctx = `${input.market} in ${input.geography}, year ${input.year}`;
    const check = await sanityCheckAssumption(step.label, oldVal, newVal, ctx);
    setWarnings(prev => ({ ...prev, [id]: check }));
  }, [steps, input, result]);

  function reset() {
    setResult(null); setSteps([]); setWarnings({}); setError('');
    setCompetitors([]); setScenarios([]);
    setChatMessages([]); setChatInput('');
    setPorters(null); setSwot(null); setSegments([]);
    setGrowth(null); setRevenueModel(null);
    setThesis(null);
  }

  async function runAgent() {
    if (!ideaText.trim() || agentRunning) return;
    setAgentRunning(true);
    setAgentLogs([]);
    setResult(null); setSteps([]); setWarnings({}); setError('');
    setCompetitors([]); setScenarios([]);
    setChatMessages([]); setChatInput('');
    setPorters(null); setSwot(null); setSegments([]);
    setGrowth(null); setRevenueModel(null); setThesis(null);
    try {
      const agentResult = await runIdeaAgent(ideaText, (update) => {
        setAgentLogs(prev => [...prev, update]);
      });
      setInput(agentResult.input);
      setResult(agentResult.result);
      setSteps(agentResult.result.steps);
      setComputed({ tam: agentResult.result.tam, sam: agentResult.result.sam, som: agentResult.result.som });
      setCompetitors(agentResult.competitors);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Agent failed. Please try again.';
      setError(msg);
      setAgentLogs(prev => [...prev, { phase: 'error', message: msg }]);
    } finally {
      setAgentRunning(false);
    }
  }

  async function loadCompetitors() {
    if (!result) return;
    setCompetitorsLoading(true);
    try {
      const comps = await generateCompetitors(input, computed.tam);
      setCompetitors(comps);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setCompetitorsLoading(false);
    }
  }

  async function enrichCompetitors() {
    if (enriching || competitors.length === 0) return;
    setEnriching(true);
    const groqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY ?? '';
    const tavilyKey = process.env.NEXT_PUBLIC_TAVILY_API_KEY ?? '';
    for (const c of competitors) {
      // Yahoo Finance (public co.)
      try {
        const fin = await fetch(`/api/financials?name=${encodeURIComponent(c.name)}`).then(r => r.json());
        setEnrichedData(prev => ({ ...prev, [c.name]: { ...prev[c.name], financials: fin } }));
      } catch { /* ignore */ }
      // CrunchBase via Tavily + Groq
      if (tavilyKey) {
        try {
          const fund = await fetch('/api/funding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyName: c.name, tavilyKey, groqKey }),
          }).then(r => r.json());
          setEnrichedData(prev => ({ ...prev, [c.name]: { ...prev[c.name], funding: fund } }));
        } catch { /* ignore */ }
      }
    }
    setEnriching(false);
  }

  async function loadScenarios() {
    if (!result) return;
    setScenariosLoading(true);
    try {
      const scens = await generateScenarios(input, computed.tam);
      setScenarios(scens);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setScenariosLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !result || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', content: chatInput.trim() };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatInput('');
    setChatLoading(true);

    const ctx = `Market: ${input.market} in ${input.geography} (${input.year})
TAM: ${formatCurrency(computed.tam)} | SAM: ${formatCurrency(computed.sam)} | SOM: ${formatCurrency(computed.som)}
Methodology: ${result.methodology}
Narrative: ${result.narrative}`;

    try {
      const reply = await chatWithAnalyst(history, ctx);
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: unknown) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
      console.error(e);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  async function loadPorters() {
    if (!result) return;
    setPortersLoading(true);
    try {
      const data = await generatePortersFiveForces(input);
      setPorters(data);
    } catch (e) { console.error(e); }
    finally { setPortersLoading(false); }
  }

  async function loadSWOT() {
    if (!result) return;
    setSwotLoading(true);
    try {
      const data = await generateSWOT(input, computed.tam);
      setSwot(data);
    } catch (e) { console.error(e); }
    finally { setSwotLoading(false); }
  }

  async function loadSegments() {
    if (!result) return;
    setSegmentsLoading(true);
    try {
      const data = await generateSegmentation(input, computed.tam);
      setSegments(data);
    } catch (e) { console.error(e); }
    finally { setSegmentsLoading(false); }
  }

  async function loadGrowth() {
    if (!result) return;
    setGrowthLoading(true);
    try {
      const data = await generateGrowthProjection(input, computed.tam);
      setGrowth(data);
    } catch (e) { console.error(e); }
    finally { setGrowthLoading(false); }
  }

  async function buildRevenueModel() {
    if (!result) return;
    setRevenueLoading(true);
    try {
      const data = await generateRevenueModel(input, computed.tam, selectedModelType);
      setRevenueModel(data);
    } catch (e) { console.error(e); }
    finally { setRevenueLoading(false); }
  }

  async function loadThesis() {
    if (!result) return;
    setThesisLoading(true);
    try {
      const data = await generateInvestmentThesis(input, computed.tam, computed.sam, computed.som);
      setThesis(data);
    } catch (e) { console.error(e); }
    finally { setThesisLoading(false); }
  }

  function exportToPDF() {
    if (!result) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const formatV = (v: number) => {
      if (v >= 1e12) return `₹${(v/1e12).toFixed(2)}T`;
      if (v >= 1e9) return `₹${(v/1e9).toFixed(2)}B`;
      if (v >= 1e6) return `₹${(v/1e6).toFixed(1)}M`;
      return `₹${v.toFixed(0)}`;
    };
    const competitorRows = competitors.map(c =>
      `<tr><td>${c.name}</td><td>${c.stage}</td><td>${formatV(c.estimated_revenue)}</td><td>${c.market_share_pct.toFixed(1)}%</td><td>${c.description}</td></tr>`
    ).join('');
    const scenarioRows = scenarios.map(s =>
      `<tr><td><b>${s.label}</b></td><td>${formatV(s.tam)}</td><td>${formatV(s.sam)}</td><td>${formatV(s.som)}</td><td>${s.description}</td></tr>`
    ).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Market Analysis: ${input.market}</title>
    <style>
      body{font-family:Georgia,serif;max-width:820px;margin:40px auto;color:#111;font-size:13px;line-height:1.6}
      h1{font-size:22px;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:4px}
      h2{font-size:14px;color:#444;margin-top:28px;text-transform:uppercase;letter-spacing:1px;border-left:3px solid #6366F1;padding-left:8px}
      .meta{font-size:11px;color:#666;margin-bottom:20px}
      .metrics{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:12px 0}
      .metric{border:1px solid #ddd;padding:10px 14px;border-radius:4px}
      .metric-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#888;font-family:monospace}
      .metric-value{font-size:20px;font-weight:bold;font-family:monospace;margin-top:2px}
      blockquote{border-left:3px solid #6366F1;margin:0;padding:8px 16px;color:#333;background:#f9f9ff}
      table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px}
      th{background:#f0f0ff;padding:6px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #ddd}
      td{padding:6px 10px;border-bottom:1px solid #eee}
      .footer{margin-top:40px;font-size:10px;color:#aaa;text-align:center}
      @media print{body{margin:20px}button{display:none}}
    </style></head><body>
    <h1>Market Analysis: ${input.market}</h1>
    <div class="meta">${input.geography} · ${input.year} · ${result.methodology} methodology</div>
    <h2>Market Size</h2>
    <div class="metrics">
      <div class="metric"><div class="metric-label">TAM</div><div class="metric-value">${formatV(computed.tam)}</div></div>
      <div class="metric"><div class="metric-label">SAM</div><div class="metric-value">${formatV(computed.sam)}</div></div>
      <div class="metric"><div class="metric-label">SOM</div><div class="metric-value">${formatV(computed.som)}</div></div>
    </div>
    <h2>Analyst Narrative</h2>
    <blockquote>${result.narrative}</blockquote>
    ${scenarios.length > 0 ? `<h2>Scenarios</h2><table><thead><tr><th>Scenario</th><th>TAM</th><th>SAM</th><th>SOM</th><th>Driver</th></tr></thead><tbody>${scenarioRows}</tbody></table>` : ''}
    ${competitors.length > 0 ? `<h2>Competitor Landscape</h2><table><thead><tr><th>Company</th><th>Stage</th><th>Revenue</th><th>Share</th><th>About</th></tr></thead><tbody>${competitorRows}</tbody></table>` : ''}
    ${thesis ? `<h2>Investment Thesis</h2><blockquote>${thesis.memo}</blockquote><p><b>Verdict: ${thesis.verdict}</b></p>` : ''}
    <div class="footer">Generated by ATLAS Market Intelligence Engine</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  const canRun = !!(input.market.trim() && input.geography.trim() && !loading);

  return (
    <div className="min-h-screen">

      {/* ── Header ── */}
      <header
        className="sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between"
        style={{
          background: 'rgba(3,13,28,0.88)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 1px 0 rgba(59,130,246,0.08)',
        }}
      >
        <div className="flex items-center gap-4">
          <AtlasLogo />
            <div className="hidden sm:block h-3.5 w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <span className="hidden sm:inline" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.1em' }}>
            MARKET INTELLIGENCE ENGINE
          </span>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--emerald)', boxShadow: '0 0 8px var(--emerald)', animation: 'pulse-glow 2s infinite' }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: 'rgba(16,185,129,0.9)', letterSpacing: '0.08em' }}>
            LIVE · LLAMA 3.3
          </span>
        </div>
      </header>

      <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-screen-xl mx-auto">

        {/* ── Hero + form ── */}
        <div className="mb-10" style={{ animation: 'fadeUp 0.5s ease-out' }}>
          <div className="label mb-3" style={{ color: 'var(--indigo)', letterSpacing: '0.18em' }}>Market Intelligence</div>
          <h1
            className="text-3xl sm:text-5xl mb-4 leading-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)', fontWeight: 600 }}
          >
            Size any market<br />
            <em style={{ fontStyle: 'italic', color: 'var(--indigo-hi)' }}>in seconds.</em>
          </h1>
          <p className="text-base mb-6" style={{ color: 'var(--fg-2)', maxWidth: 460, lineHeight: 1.7 }}>
            {ideaMode
              ? 'Describe your startup — the AI figures out what to search, thinks through the market, and builds the full report.'
              : 'Enter your market details and the AI generates structured assumptions, runs the math, and sanity-checks every edit.'}
          </p>

          {/* Mode toggle */}
          <div className="flex items-center gap-2 mb-4">
            {[
              { id: false, label: 'Manual Form', icon: <Layers size={11} /> },
              { id: true,  label: 'AI Agent — just describe your idea', icon: <Zap size={11} /> },
            ].map(({ id, label, icon }) => (
              <button
                key={String(id)}
                onClick={() => { setIdeaMode(id); setError(''); setAgentLogs([]); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: ideaMode === id ? 'var(--indigo-lo)' : 'transparent',
                  border: `1px solid ${ideaMode === id ? 'var(--border-hi)' : 'var(--border)'}`,
                  color: ideaMode === id ? 'var(--indigo-hi)' : 'var(--fg-3)',
                }}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Form card */}
          <div className="card" style={{ maxWidth: 860, padding: 0, overflow: 'hidden' }}>
            {/* Card chrome header */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="w-2 h-2 rounded-full" style={{ background: 'var(--indigo)', boxShadow: '0 0 8px var(--indigo)', animation: 'pulse-glow 3s infinite' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--fg-3)', letterSpacing: '0.1em' }}>
                {ideaMode ? 'AI AGENT MODE — NATURAL LANGUAGE INPUT' : 'MANUAL MODE — STRUCTURED FORM INPUT'}
              </span>
            </div>
          <div style={{ padding: '20px' }}>

            {ideaMode ? (
              /* ── AI Agent mode ── */
              <div className="flex flex-col gap-4">
                <div>
                  <label className="label mb-1.5 flex items-center gap-1.5">
                    <MessageSquare size={11} /> Describe your startup or business idea
                  </label>
                  <textarea
                    className="input-field"
                    rows={4}
                    placeholder={`e.g. "I'm building a B2B SaaS tool that helps CA firms automate GST filing for their SME clients in India. We charge ₹2,000/month per CA firm. Target market is the 1.5 lakh registered CAs."`}
                    value={ideaText}
                    onChange={e => setIdeaText(e.target.value)}
                    style={{ resize: 'vertical', lineHeight: 1.6 }}
                  />
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3">
                  <span className="text-xs" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
                    The AI will search the web, reason through the market, and generate a full report.
                  </span>
                  <button
                    onClick={runAgent}
                    disabled={!ideaText.trim() || agentRunning}
                    className="btn-primary"
                  >
                    {agentRunning
                      ? <><Loader2 size={14} className="animate-spin" /> Researching{dots}</>
                      : <><Zap size={14} /> Run Agent</>}
                  </button>
                </div>

                {/* Agent terminal log */}
                {agentLogs.length > 0 && (
                  <div className="terminal">
                    {/* Terminal chrome bar */}
                    <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(59,130,246,0.12)', background: 'rgba(59,130,246,0.04)' }}>
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F87171', opacity: 0.7 }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B', opacity: 0.7 }} />
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#10B981', opacity: 0.7 }} />
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'rgba(59,130,246,0.6)', letterSpacing: '0.1em', marginLeft: 6 }}>
                        atlas-agent ~ market-research
                      </span>
                    </div>
                    <div className="p-4 flex flex-col gap-1.5">
                      {agentLogs.map((log, i) => {
                        const isLast  = i === agentLogs.length - 1;
                        const isDone  = log.phase === 'done';
                        const isError = log.phase === 'error';
                        const color   = isDone ? '#10B981' : isError ? '#F87171' : isLast && agentRunning ? '#F59E0B' : '#3B82F6';
                        const prefix  = isDone ? '✓' : isError ? '✗' : isLast && agentRunning ? '▶' : '✓';
                        return (
                          <div key={i} className="flex flex-col gap-0.5">
                            <div className="flex items-start gap-2">
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color, minWidth: 14, marginTop: 1, flexShrink: 0 }}>
                                {prefix}
                              </span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: isLast && agentRunning ? '#EEF6FF' : 'rgba(238,246,255,0.7)', fontWeight: isLast ? 600 : 400 }}>
                                {log.message}
                                {isLast && agentRunning && <span style={{ marginLeft: 2, animation: 'cursor-blink 0.9s step-end infinite' }}>▌</span>}
                              </span>
                            </div>
                            {log.detail && (
                              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'rgba(59,130,246,0.55)', paddingLeft: 22, lineHeight: 1.5 }}>
                                {log.detail}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── Manual form mode ── */
              <>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-[1fr_180px_120px]">
                  {/* Market */}
                  <div>
                    <label className="label mb-1.5 flex items-center gap-1.5">
                      <Layers size={11} /> Market
                    </label>
                    <input
                      className="input-field"
                      placeholder="e.g. Indian EV market, US SaaS security…"
                      value={input.market}
                      onChange={e => setInput(p => ({ ...p, market: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && canRun && analyze()}
                    />
                  </div>

                  {/* Geography */}
                  <div>
                    <label className="label mb-1.5 flex items-center gap-1.5">
                      <Globe size={11} /> Geography
                    </label>
                    <input
                      className="input-field"
                      placeholder="India, Global, US…"
                      value={input.geography}
                      onChange={e => setInput(p => ({ ...p, geography: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && canRun && analyze()}
                    />
                  </div>

                  {/* Year */}
                  <div>
                    <label className="label mb-1.5 flex items-center gap-1.5">
                      <Calendar size={11} /> Year
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      value={input.year}
                      min={2020}
                      max={2035}
                      onChange={e => setInput(p => ({ ...p, year: parseInt(e.target.value) || p.year }))}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="label">Methodology:</span>
                    {(['top-down', 'bottom-up'] as Methodology[]).map(m => (
                      <button
                        key={m}
                        onClick={() => setInput(p => ({ ...p, methodology: m }))}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
                        style={{
                          fontFamily: 'var(--font-mono)',
                          background: input.methodology === m ? 'var(--indigo-lo)' : 'transparent',
                          border: `1px solid ${input.methodology === m ? 'var(--border-hi)' : 'var(--border)'}`,
                          color: input.methodology === m ? 'var(--indigo-hi)' : 'var(--fg-3)',
                        }}
                      >
                        {m === 'top-down' ? 'Top-Down' : 'Bottom-Up'}
                      </button>
                    ))}
                  </div>

                  <button onClick={analyze} disabled={!canRun} className="btn-primary">
                    {loading
                      ? <><Loader2 size={14} className="animate-spin" /> Generating{dots}</>
                      : <><Zap size={14} /> Analyze Market</>}
                  </button>
                </div>
              </>
            )}

            {error && (
              <div
                className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs"
                style={{ background: 'var(--red-lo)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)' }}
              >
                <AlertTriangle size={13} />
                {error}
              </div>
            )}
          </div>{/* inner padding div */}
          </div>{/* card div */}

          {/* Example pills */}
          {!result && (
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <span className="label">Try:</span>
              {EXAMPLES.map(ex => (
                <button
                  key={ex.market}
                  onClick={() => setInput(p => ({ ...p, market: ex.market, geography: ex.geography, methodology: ex.methodology }))}
                  className="px-3 py-1.5 rounded-full text-xs transition-all"
                  style={{
                    background: 'var(--ink-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--fg-2)',
                    fontFamily: 'var(--font-sans)',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = 'var(--border-hi)';
                    el.style.color = 'var(--fg-1)';
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.borderColor = 'var(--border)';
                    el.style.color = 'var(--fg-2)';
                  }}
                >
                  {ex.market}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {result && (
          <div style={{ animation: 'fadeUp 0.5s ease-out' }}>

            {/* Summary bar */}
            <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-5">
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}
                >
                  {input.market}
                  <span className="text-sm font-normal ml-2" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-sans)' }}>
                    {input.geography} · {input.year} · {result.methodology}
                  </span>
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={exportToPDF} className="btn-ghost text-xs flex items-center gap-1.5"
                  style={{ borderColor: 'rgba(251,191,36,0.3)', color: 'var(--amber)' }}>
                  <FileDown size={12} /> PDF
                </button>
                <button onClick={() => setExportModal('notion')} className="btn-ghost text-xs flex items-center gap-1.5"
                  style={{ borderColor: 'rgba(99,102,241,0.3)', color: 'var(--indigo)' }}>
                  <FileText size={12} /> Notion
                </button>
                <button onClick={() => setExportModal('slack')} className="btn-ghost text-xs flex items-center gap-1.5"
                  style={{ borderColor: 'rgba(52,211,153,0.3)', color: 'var(--emerald)' }}>
                  <MessageSquare size={12} /> Slack
                </button>
                <button onClick={reset} className="btn-ghost text-xs">
                  <RefreshCw size={12} /> New analysis
                </button>
              </div>
            </div>

            {/* Metric cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <MetricCard label="TAM" sublabel="Total"       value={computed.tam} color="var(--indigo)"  delay={0}   run={animated} />
              <MetricCard label="SAM" sublabel="Serviceable" value={computed.sam} color="var(--cyan)"    delay={100} run={animated} />
              <MetricCard label="SOM" sublabel="Obtainable"  value={computed.som} color="var(--emerald)" delay={200} run={animated} />
            </div>

            {/* Table + sidebar */}
            <div className="grid gap-5 mb-5 grid-cols-1 lg:grid-cols-[1fr_360px]">

              {/* Assumptions table */}
              <div className="card overflow-hidden">
                <div
                  className="px-5 py-3.5 flex items-center justify-between"
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <TrendingUp size={14} style={{ color: 'var(--indigo)' }} />
                    <span className="label">Assumptions</span>
                    <span
                      className="tag"
                      style={{ color: 'var(--fg-3)', background: 'var(--ink-3)', border: '1px solid var(--border)' }}
                    >
                      {steps.length} steps
                    </span>
                  </div>
                  <span
                    className="text-xs"
                    style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}
                  >
                    Click value to edit · TAM recalculates instantly
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                        {['#', 'Op', 'Label / Source', 'Value', 'Conf.', 'Rationale'].map(h => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left"
                            style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {steps.map((s, i) => (
                        <AssumptionRow
                          key={s.id}
                          step={s}
                          index={i}
                          onChange={onValueChange}
                          onBlur={onBlur}
                          warning={warnings[s.id]}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right sidebar */}
              <div className="flex flex-col gap-4">

                {/* Funnel */}
                <div className="card p-5">
                  <span className="label block mb-4">Funnel</span>
                  <FunnelChart tam={computed.tam} sam={computed.sam} som={computed.som} />
                  <div
                    className="mt-4 grid grid-cols-3 gap-2 text-center"
                    style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}
                  >
                    {[
                      { label: 'TAM', v: computed.tam, c: 'var(--indigo)' },
                      { label: 'SAM', v: computed.sam, c: 'var(--cyan)'   },
                      { label: 'SOM', v: computed.som, c: 'var(--emerald)'},
                    ].map(({ label, v, c }) => (
                      <div key={label}>
                        <div className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: c }}>
                          {label}
                        </div>
                        <div className="text-sm font-bold mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}>
                          {formatCurrency(v)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Narrative */}
                <div
                  className="card p-5"
                  style={{ borderLeft: '2px solid var(--indigo)', borderRadius: '0 14px 14px 0' }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={13} style={{ color: 'var(--emerald)' }} />
                    <span className="label">Analyst Take</span>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--fg-2)', fontFamily: 'var(--font-sans)' }}
                  >
                    {result.narrative}
                  </p>
                </div>

              </div>
            </div>

            {/* ── Scenario Analysis ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.1s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: scenarios.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <BarChart3 size={14} style={{ color: 'var(--cyan)' }} />
                  <span className="label">Scenario Analysis</span>
                  <span className="tag" style={{ color: 'var(--cyan)', background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)' }}>
                    Bear · Base · Bull
                  </span>
                </div>
                {scenarios.length === 0 && (
                  <button
                    onClick={loadScenarios}
                    disabled={scenariosLoading}
                    className="btn-ghost text-xs"
                    style={{ borderColor: 'rgba(34,211,238,0.3)', color: 'var(--cyan)' }}
                  >
                    {scenariosLoading ? <><Loader2 size={12} className="animate-spin" /> Generating…</> : <><Zap size={12} /> Generate Scenarios</>}
                  </button>
                )}
              </div>

              {scenarios.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-0" style={{ borderTop: '1px solid var(--border)' }}>
                  {scenarios.map((s) => {
                    const colors = {
                      bear: { main: '#F87171', bg: 'rgba(248,113,113,0.05)', border: 'rgba(248,113,113,0.12)' },
                      base: { main: '#FBBF24', bg: 'rgba(251,191,36,0.05)',  border: 'rgba(251,191,36,0.12)'  },
                      bull: { main: '#34D399', bg: 'rgba(52,211,153,0.05)',  border: 'rgba(52,211,153,0.12)'  },
                    }[s.name];
                    return (
                      <div
                        key={s.name}
                        className="p-5 flex flex-col gap-3"
                        style={{ background: colors.bg, borderRight: s.name !== 'bull' ? '1px solid var(--border)' : 'none' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold tracking-widest uppercase" style={{ fontFamily: 'var(--font-mono)', color: colors.main }}>
                            {s.label}
                          </span>
                          <span className="tag" style={{ color: colors.main, background: `${colors.main}15`, border: `1px solid ${colors.border}` }}>
                            {s.name === 'bear' ? '↓' : s.name === 'bull' ? '↑' : '→'} TAM
                          </span>
                        </div>
                        <div className="text-3xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
                          {formatCurrency(s.tam)}
                        </div>
                        <div className="flex gap-3 text-xs" style={{ fontFamily: 'var(--font-mono)' }}>
                          <span style={{ color: 'var(--fg-3)' }}>SAM <span style={{ color: 'var(--fg-2)' }}>{formatCurrency(s.sam)}</span></span>
                          <span style={{ color: 'var(--fg-3)' }}>SOM <span style={{ color: 'var(--fg-2)' }}>{formatCurrency(s.som)}</span></span>
                        </div>
                        <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '0.75rem' }}>
                          <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-2)' }}>{s.description}</p>
                          <p className="text-xs mt-1.5 italic" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                            Key: {s.key_assumption}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Competitor Benchmarking ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.2s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: competitors.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <Users size={14} style={{ color: 'var(--emerald)' }} />
                  <span className="label">Competitor Intelligence</span>
                  {competitors.length > 0 && (
                    <span className="tag" style={{ color: 'var(--fg-3)', background: 'var(--ink-3)', border: '1px solid var(--border)' }}>
                      {competitors.length} players
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {competitors.length > 0 && (
                    <button
                      onClick={enrichCompetitors}
                      disabled={enriching}
                      className="btn-ghost text-xs flex items-center gap-1.5"
                      style={{ borderColor: 'rgba(251,191,36,0.3)', color: 'var(--amber)' }}
                    >
                      {enriching ? <><Loader2 size={12} className="animate-spin" /> Enriching…</> : <><TrendingUp size={12} /> Live Data</>}
                    </button>
                  )}
                  {competitors.length === 0 && (
                    <button
                      onClick={loadCompetitors}
                      disabled={competitorsLoading}
                      className="btn-ghost text-xs"
                      style={{ borderColor: 'rgba(52,211,153,0.3)', color: 'var(--emerald)' }}
                    >
                      {competitorsLoading ? <><Loader2 size={12} className="animate-spin" /> Generating…</> : <><Zap size={12} /> Map Competitors</>}
                    </button>
                  )}
                </div>
              </div>

              {competitors.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                        {['Company', 'Stage', 'Est. Revenue', 'Market Share', 'HQ', 'About', ...(Object.keys(enrichedData).length > 0 ? ['Mkt Cap / Raised', 'Investors'] : [])].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left"
                            style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.map((c, i) => {
                        const stageColors: Record<string, string> = {
                          startup: '#F87171', growth: '#FBBF24', public: '#34D399', established: '#6366F1',
                        };
                        const sc = stageColors[c.stage] ?? '#6366F1';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }}>
                            <td className="px-4 py-3">
                              <div className="text-sm font-semibold" style={{ color: 'var(--fg-1)' }}>{c.name}</div>
                              {c.founded && <div className="text-xs" style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>est. {c.founded}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <span className="tag capitalize" style={{ color: sc, background: `${sc}15`, border: `1px solid ${sc}25` }}>
                                {c.stage}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}>
                                {formatCurrency(c.estimated_revenue)}
                              </span>
                            </td>
                            <td className="px-4 py-3 w-36">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--ink-3)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(c.market_share_pct, 100)}%`, background: 'var(--emerald)' }} />
                                </div>
                                <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)', minWidth: 32 }}>
                                  {c.market_share_pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs" style={{ color: 'var(--fg-3)' }}>{c.hq}</span>
                            </td>
                            <td className="px-4 py-3" style={{ maxWidth: 260 }}>
                              <p className="text-xs leading-relaxed" style={{ color: 'var(--fg-2)' }}>{c.description}</p>
                            </td>
                            {Object.keys(enrichedData).length > 0 && (() => {
                              const ed = enrichedData[c.name];
                              const fin = ed?.financials;
                              const fund = ed?.funding;
                              const displayVal = fin?.marketCap
                                ? (fin.marketCap >= 1e9 ? `$${(fin.marketCap / 1e9).toFixed(1)}B` : `$${(fin.marketCap / 1e6).toFixed(0)}M`)
                                : fund?.totalRaised
                                ? (fund.totalRaised >= 1e9 ? `$${(fund.totalRaised / 1e9).toFixed(1)}B raised` : `$${(fund.totalRaised / 1e6).toFixed(0)}M raised`)
                                : null;
                              const isLoading = enriching && !ed;
                              return (
                                <>
                                  <td className="px-4 py-3">
                                    {isLoading
                                      ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
                                      : displayVal
                                      ? <div>
                                          <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-mono)', color: fin?.marketCap ? 'var(--emerald)' : 'var(--amber)' }}>{displayVal}</span>
                                          {fin?.ticker && <div className="text-xs mt-0.5" style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>{fin.ticker} · ${fin.stockPrice?.toFixed(2)}</div>}
                                          {fund?.lastRound && <div className="text-xs mt-0.5" style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem' }}>{fund.lastRound}</div>}
                                        </div>
                                      : <span style={{ color: 'var(--fg-4)', fontSize: '0.7rem' }}>—</span>}
                                  </td>
                                  <td className="px-4 py-3" style={{ maxWidth: 180 }}>
                                    {isLoading
                                      ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--fg-4)' }} />
                                      : fund?.investors?.length
                                      ? <div className="flex flex-wrap gap-1">
                                          {fund.investors.slice(0, 3).map((inv: string, j: number) => (
                                            <span key={j} className="tag" style={{ fontSize: '0.6rem', color: 'var(--fg-3)', background: 'var(--ink-3)' }}>{inv}</span>
                                          ))}
                                        </div>
                                      : <span style={{ color: 'var(--fg-4)', fontSize: '0.7rem' }}>—</span>}
                                  </td>
                                </>
                              );
                            })()}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Porter's Five Forces ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.25s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: porters ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <Hexagon size={14} style={{ color: 'var(--amber)' }} />
                  <span className="label">Porter's Five Forces</span>
                </div>
                {!porters && (
                  <button onClick={loadPorters} disabled={portersLoading} className="btn-ghost text-xs"
                    style={{ borderColor: 'rgba(251,191,36,0.3)', color: 'var(--amber)' }}>
                    {portersLoading ? <><Loader2 size={12} className="animate-spin" /> Analyzing…</> : <><Zap size={12} /> Analyze Forces</>}
                  </button>
                )}
              </div>
              {porters && (
                <div className="p-5">
                  <div className="grid gap-6 grid-cols-1 md:grid-cols-[320px_1fr]">
                    <div>
                      <PentagonChart data={porters} />
                      <div className="mt-3 text-center">
                        <span className="text-xs" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>
                          Overall attractiveness:&nbsp;
                        </span>
                        <span className="text-xs font-bold" style={{
                          color: porters.overall_attractiveness === 'High' ? 'var(--emerald)'
                            : porters.overall_attractiveness === 'Medium' ? 'var(--amber)'
                            : 'var(--red)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {porters.overall_attractiveness}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--fg-2)' }}>{porters.summary}</p>
                      {([
                        porters.competitive_rivalry,
                        porters.buyer_power,
                        porters.threat_of_substitutes,
                        porters.threat_of_new_entrants,
                        porters.supplier_power,
                      ] as PorterForce[]).map((f) => {
                        const fc = f.rating === 'High' ? '#F87171' : f.rating === 'Medium' ? '#FBBF24' : '#34D399';
                        return (
                          <div key={f.force} className="flex items-start gap-3 px-3 py-2.5 rounded-lg"
                            style={{ background: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                            <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-0.5">
                              <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: fc }}>
                                {f.score}/10
                              </span>
                              <span className="tag text-xs" style={{ color: fc, background: `${fc}15`, border: `1px solid ${fc}25` }}>
                                {f.rating}
                              </span>
                            </div>
                            <div>
                              <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--fg-1)' }}>{f.force}</div>
                              <div className="text-xs" style={{ color: 'var(--fg-3)' }}>{f.rationale}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── SWOT Analysis ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.3s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: swot ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={14} style={{ color: 'var(--cyan)' }} />
                  <span className="label">SWOT Analysis</span>
                </div>
                {!swot && (
                  <button onClick={loadSWOT} disabled={swotLoading} className="btn-ghost text-xs"
                    style={{ borderColor: 'rgba(34,211,238,0.3)', color: 'var(--cyan)' }}>
                    {swotLoading ? <><Loader2 size={12} className="animate-spin" /> Generating…</> : <><Zap size={12} /> Generate SWOT</>}
                  </button>
                )}
              </div>
              {swot && (
                <div className="grid grid-cols-1 sm:grid-cols-2" style={{ borderTop: '1px solid var(--border)' }}>
                  {[
                    { key: 'strengths',     label: 'Strengths',     color: '#34D399', bg: 'rgba(52,211,153,0.04)',  items: swot.strengths     },
                    { key: 'weaknesses',    label: 'Weaknesses',    color: '#F87171', bg: 'rgba(248,113,113,0.04)', items: swot.weaknesses    },
                    { key: 'opportunities', label: 'Opportunities', color: '#6366F1', bg: 'rgba(99,102,241,0.04)',  items: swot.opportunities },
                    { key: 'threats',       label: 'Threats',       color: '#FBBF24', bg: 'rgba(251,191,36,0.04)',  items: swot.threats       },
                  ].map(({ key, label, color, bg, items }, i) => (
                    <div key={key} className="p-4"
                      style={{
                        background: bg,
                        borderRight: i % 2 === 0 ? '1px solid var(--border)' : 'none',
                        borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                      }}>
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span className="text-xs font-bold tracking-wider uppercase"
                          style={{ fontFamily: 'var(--font-mono)', color }}>
                          {label}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((item, j) => (
                          <li key={j} className="text-xs leading-relaxed flex gap-2" style={{ color: 'var(--fg-2)' }}>
                            <span style={{ color, flexShrink: 0, marginTop: 2 }}>›</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Market Segmentation ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.35s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: segments.length > 0 ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <PieChart size={14} style={{ color: 'var(--indigo-hi)' }} />
                  <span className="label">Market Segmentation</span>
                </div>
                {segments.length === 0 && (
                  <button onClick={loadSegments} disabled={segmentsLoading} className="btn-ghost text-xs"
                    style={{ borderColor: 'var(--border-hi)', color: 'var(--indigo-hi)' }}>
                    {segmentsLoading ? <><Loader2 size={12} className="animate-spin" /> Breaking down…</> : <><Zap size={12} /> Segment TAM</>}
                  </button>
                )}
              </div>
              {segments.length > 0 && (
                <div className="p-5 flex flex-col gap-3">
                  {(() => {
                    const segColors = ['#6366F1', '#22D3EE', '#34D399', '#FBBF24', '#F87171', '#A78BFA'];
                    return segments.map((seg, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: segColors[i % segColors.length] }} />
                            <span className="text-sm font-medium" style={{ color: 'var(--fg-1)' }}>{seg.name}</span>
                            <span className="tag text-xs" style={{ color: 'var(--emerald)', background: 'var(--emerald-lo)', border: '1px solid rgba(52,211,153,0.2)' }}>
                              +{seg.growth_rate_pct}% CAGR
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-2)' }}>
                              {formatCurrency(computed.tam * seg.tam_fraction)}
                            </span>
                            <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: segColors[i % segColors.length] }}>
                              {(seg.tam_fraction * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-6 rounded overflow-hidden relative" style={{ background: 'var(--ink-3)' }}>
                          <div className="absolute inset-y-0 left-0 rounded flex items-center"
                            style={{
                              width: `${Math.max(seg.tam_fraction * 100, 0.5)}%`,
                              background: `linear-gradient(90deg, ${segColors[i % segColors.length]}80, ${segColors[i % segColors.length]}40)`,
                              borderRight: `2px solid ${segColors[i % segColors.length]}`,
                              transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                            }}>
                          </div>
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--fg-3)' }}>{seg.description}</p>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* ── Growth Rate Projector ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.4s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: growth ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <LineChart size={14} style={{ color: 'var(--emerald)' }} />
                  <span className="label">Growth Rate Projector</span>
                  <span className="tag" style={{ color: 'var(--fg-3)', background: 'var(--ink-3)', border: '1px solid var(--border)' }}>
                    10-year · Bear / Base / Bull
                  </span>
                </div>
                {!growth && (
                  <button onClick={loadGrowth} disabled={growthLoading} className="btn-ghost text-xs"
                    style={{ borderColor: 'rgba(52,211,153,0.3)', color: 'var(--emerald)' }}>
                    {growthLoading ? <><Loader2 size={12} className="animate-spin" /> Projecting…</> : <><Zap size={12} /> Project Growth</>}
                  </button>
                )}
              </div>
              {growth && (
                <div className="p-5">
                  <div className="flex gap-4 mb-4">
                    {[
                      { label: 'Bear CAGR', val: growth.cagr_bear, color: '#F87171' },
                      { label: 'Base CAGR', val: growth.cagr_base, color: '#FBBF24' },
                      { label: 'Bull CAGR', val: growth.cagr_bull, color: '#34D399' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <span className="text-xs" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{label}</span>
                        <span className="text-sm font-bold" style={{ color, fontFamily: 'var(--font-mono)' }}>
                          {val.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                      <span className="text-xs" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>Base TAM {growth.start_year + 10}</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-mono)' }}>
                        {formatCurrency(growth.base_vals[10])}
                      </span>
                    </div>
                  </div>
                  <GrowthLineChart data={growth} />
                </div>
              )}
            </div>

            {/* ── Revenue Model Builder ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.45s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div className="flex items-center gap-2.5">
                  <DollarSign size={14} style={{ color: 'var(--indigo)' }} />
                  <span className="label">Revenue Model Builder</span>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>Model type:</span>
                  {(['saas', 'transactional', 'marketplace', 'licensing'] as RevenueModelType[]).map(m => (
                    <button key={m} onClick={() => { setSelectedModelType(m); setRevenueModel(null); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: selectedModelType === m ? 'var(--indigo-lo)' : 'transparent',
                        border: `1px solid ${selectedModelType === m ? 'var(--border-hi)' : 'var(--border)'}`,
                        color: selectedModelType === m ? 'var(--indigo-hi)' : 'var(--fg-3)',
                      }}>
                      {m === 'saas' ? 'SaaS' : m === 'transactional' ? 'Transactional' : m === 'marketplace' ? 'Marketplace' : 'Licensing'}
                    </button>
                  ))}
                  <button onClick={buildRevenueModel} disabled={revenueLoading} className="btn-primary text-xs ml-auto">
                    {revenueLoading ? <><Loader2 size={12} className="animate-spin" /> Building…</> : <><Zap size={12} /> Build Model</>}
                  </button>
                </div>
                {revenueModel && (
                  <div style={{ animation: 'fadeUp 0.4s ease-out' }}>
                    <RevenueBarChart data={revenueModel} />
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(0,0,0,0.25)', borderBottom: '1px solid var(--border)' }}>
                            {['Year', 'Revenue', 'Gross Profit', 'EBITDA'].map(h => (
                              <th key={h} className="px-4 py-2 text-left"
                                style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {revenueModel.years.map(yr => (
                            <tr key={yr.year} style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }}>
                              <td className="px-4 py-2.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)', fontSize: '0.75rem' }}>{yr.year}</td>
                              <td className="px-4 py-2.5" style={{ fontFamily: 'var(--font-mono)', color: '#6366F1', fontWeight: 700 }}>{formatCurrency(yr.revenue)}</td>
                              <td className="px-4 py-2.5" style={{ fontFamily: 'var(--font-mono)', color: '#22D3EE', fontWeight: 700 }}>{formatCurrency(yr.gross_profit)}</td>
                              <td className="px-4 py-2.5" style={{ fontFamily: 'var(--font-mono)', color: yr.ebitda >= 0 ? '#34D399' : '#F87171', fontWeight: 700 }}>
                                {yr.ebitda >= 0 ? '' : '('}{formatCurrency(Math.abs(yr.ebitda))}{yr.ebitda >= 0 ? '' : ')'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {revenueModel.key_assumptions.length > 0 && (
                      <div className="mt-3 px-4 py-3 rounded-lg" style={{ background: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                        <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>KEY ASSUMPTIONS</span>
                        <ul className="mt-1.5 space-y-1">
                          {revenueModel.key_assumptions.map((a, i) => (
                            <li key={i} className="text-xs flex gap-2" style={{ color: 'var(--fg-2)' }}>
                              <span style={{ color: 'var(--indigo-hi)', flexShrink: 0 }}>›</span>{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── Unit Economics Calculator ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.5s both' }}>
              <div className="px-5 py-3.5 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <Target size={14} style={{ color: 'var(--amber)' }} />
                <span className="label">Unit Economics Calculator</span>
                <span className="tag" style={{ color: 'var(--amber)', background: 'var(--amber-lo)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  LTV · CAC · Payback
                </span>
              </div>
              <div className="p-5">
                {(() => {
                  const lifetimeMonths = churnPct > 0 ? 100 / churnPct : 0;
                  const ltv = arpu * lifetimeMonths * (grossMarginPct / 100);
                  const paybackMonths = arpu > 0 && grossMarginPct > 0 ? cac / (arpu * grossMarginPct / 100) : 0;
                  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
                  const ltvCacColor = ltvCacRatio >= 3 ? '#34D399' : ltvCacRatio >= 1 ? '#FBBF24' : '#F87171';

                  return (
                    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                      {/* Inputs */}
                      <div className="flex flex-col gap-3">
                        <div className="label mb-1">Inputs</div>
                        {[
                          { label: 'Monthly ARPU', unit: '₹', value: arpu, setter: setArpu, min: 1, step: 1, max: undefined as number | undefined },
                          { label: 'Monthly Churn Rate', unit: '%', value: churnPct, setter: setChurnPct, min: 0.1, step: 0.1, max: undefined as number | undefined },
                          { label: 'Customer Acquisition Cost', unit: '₹', value: cac, setter: setCac, min: 1, step: 1, max: undefined as number | undefined },
                          { label: 'Gross Margin', unit: '%', value: grossMarginPct, setter: setGrossMarginPct, min: 1, step: 1, max: 100 },
                        ].map(({ label, unit, value, setter, min, step, max }) => (
                          <div key={label}>
                            <label className="text-xs mb-1 block" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{label}</label>
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-2 rounded-lg" style={{ background: 'var(--ink-3)', border: '1px solid var(--border)', color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', minWidth: 28, textAlign: 'center' }}>{unit}</span>
                              <input
                                type="number"
                                className="input-field flex-1"
                                style={{ fontFamily: 'var(--font-mono)' }}
                                value={value}
                                min={min}
                                max={max}
                                step={step}
                                onChange={e => setter(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Outputs */}
                      <div className="flex flex-col gap-3">
                        <div className="label mb-1">Results</div>
                        {[
                          { label: 'Customer Lifetime', value: `${lifetimeMonths.toFixed(1)} months`, color: 'var(--fg-1)', desc: `At ${churnPct}% monthly churn` },
                          { label: 'LTV', value: `₹${ltv.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: 'var(--emerald)', desc: 'Lifetime value per customer' },
                          { label: 'Payback Period', value: `${paybackMonths.toFixed(1)} months`, color: 'var(--cyan)', desc: 'Time to recover CAC' },
                          { label: 'LTV : CAC Ratio', value: `${ltvCacRatio.toFixed(2)}x`, color: ltvCacColor, desc: ltvCacRatio >= 3 ? '✓ Healthy (>3x)' : ltvCacRatio >= 1 ? '⚠ Marginal (1–3x)' : '✗ Unsustainable (<1x)' },
                        ].map(({ label, value, color, desc }) => (
                          <div key={label} className="px-4 py-3 rounded-lg flex items-center justify-between"
                            style={{ background: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                            <div>
                              <div className="text-xs" style={{ color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>{label}</div>
                              <div className="text-xs mt-0.5" style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>{desc}</div>
                            </div>
                            <div className="text-lg font-bold" style={{ fontFamily: 'var(--font-mono)', color }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── Investment Thesis Generator ── */}
            <div className="card overflow-hidden mb-5" style={{ animation: 'fadeUp 0.5s ease-out 0.55s both' }}>
              <div
                className="px-5 py-3.5 flex items-center justify-between"
                style={{ borderBottom: thesis ? '1px solid var(--border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5">
                  <FileText size={14} style={{ color: 'var(--indigo-hi)' }} />
                  <span className="label">Investment Thesis</span>
                </div>
                {!thesis && (
                  <button onClick={loadThesis} disabled={thesisLoading} className="btn-ghost text-xs"
                    style={{ borderColor: 'var(--border-hi)', color: 'var(--indigo-hi)' }}>
                    {thesisLoading ? <><Loader2 size={12} className="animate-spin" /> Writing…</> : <><Zap size={12} /> Generate Thesis</>}
                  </button>
                )}
                {thesis && (
                  <span className="tag font-bold" style={{
                    color: thesis.verdict === 'Attractive' ? '#34D399' : thesis.verdict === 'Unattractive' ? '#F87171' : 'var(--fg-2)',
                    background: thesis.verdict === 'Attractive' ? 'rgba(52,211,153,0.1)' : thesis.verdict === 'Unattractive' ? 'rgba(248,113,113,0.1)' : 'var(--ink-3)',
                    border: `1px solid ${thesis.verdict === 'Attractive' ? 'rgba(52,211,153,0.25)' : thesis.verdict === 'Unattractive' ? 'rgba(248,113,113,0.25)' : 'var(--border)'}`,
                    fontSize: '0.75rem',
                    padding: '2px 10px',
                  }}>
                    {thesis.verdict}
                  </span>
                )}
              </div>
              {thesis && (
                <div className="p-5" style={{ animation: 'fadeUp 0.4s ease-out' }}>
                  {/* Key metrics */}
                  {thesis.key_metrics.length > 0 && (
                    <div className="flex gap-3 mb-4 flex-wrap">
                      {thesis.key_metrics.map((m) => (
                        <div key={m.label} className="px-3 py-2 rounded-lg"
                          style={{ background: 'var(--ink-2)', border: '1px solid var(--border)' }}>
                          <div className="text-xs" style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{m.label}</div>
                          <div className="text-sm font-bold mt-0.5" style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-1)' }}>{m.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Memo */}
                  <div className="px-4 py-3.5 rounded-xl mb-4 text-sm leading-relaxed"
                    style={{
                      background: 'var(--indigo-lo)',
                      border: '1px solid var(--border-hi)',
                      color: 'var(--fg-2)',
                      fontFamily: 'var(--font-sans)',
                      borderLeft: '3px solid var(--indigo)',
                    }}>
                    {thesis.memo}
                  </div>
                  {/* Risks */}
                  {thesis.risks.length > 0 && (
                    <div>
                      <div className="label mb-2">Key Risks</div>
                      <ul className="space-y-1.5">
                        {thesis.risks.map((risk, i) => (
                          <li key={i} className="flex gap-2 text-xs" style={{ color: 'var(--fg-2)' }}>
                            <span style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }}>▸</span>
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── AI Chat ── */}
            <div className="card overflow-hidden" style={{ animation: 'fadeUp 0.5s ease-out 0.3s both' }}>
              <div className="px-5 py-3.5 flex items-center gap-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <MessageSquare size={14} style={{ color: 'var(--indigo)' }} />
                <span className="label">Ask the Analyst</span>
                <span className="tag" style={{ color: 'var(--indigo-hi)', background: 'var(--indigo-lo)', border: '1px solid var(--border-hi)' }}>
                  Llama 3.3 · Groq
                </span>
              </div>

              {/* Message history */}
              <div
                className="px-5 py-4 flex flex-col gap-3 overflow-y-auto"
                style={{ minHeight: 120, maxHeight: 340 }}
              >
                {chatMessages.length === 0 && !chatLoading && (
                  <p className="text-xs text-center py-4" style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)' }}>
                    Ask anything about this market — competitive dynamics, growth drivers, investment risks…
                  </p>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="px-3.5 py-2.5 rounded-xl text-sm leading-relaxed max-w-2xl"
                      style={m.role === 'user'
                        ? { background: 'var(--indigo-lo)', border: '1px solid var(--border-hi)', color: 'var(--fg-1)', borderRadius: '16px 16px 4px 16px' }
                        : { background: 'var(--ink-2)', border: '1px solid var(--border)', color: 'var(--fg-2)', borderRadius: '4px 16px 16px 16px' }
                      }
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div
                      className="px-3.5 py-2.5 rounded-xl text-sm"
                      style={{ background: 'var(--ink-2)', border: '1px solid var(--border)', color: 'var(--fg-3)', borderRadius: '4px 16px 16px 16px', fontFamily: 'var(--font-mono)' }}
                    >
                      <Loader2 size={13} className="animate-spin inline mr-2" />Thinking…
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="px-5 py-3.5 flex gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                <input
                  className="input-field flex-1"
                  placeholder="e.g. Who are the fastest growing players? What's the biggest risk?"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  disabled={chatLoading}
                />
                <button
                  onClick={sendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="btn-primary px-4"
                  style={{ minWidth: 44 }}
                >
                  {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ── Empty state ── */}
        {!result && !loading && !agentRunning && (
          <div
            className="text-center max-w-lg mx-auto py-16"
            style={{ animation: 'fadeUp 0.5s ease-out 0.2s both' }}
          >
            {/* Animated grid icon */}
            <div className="relative mx-auto mb-6" style={{ width: 64, height: 64 }}>
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ background: 'var(--indigo-lo)', border: '1px solid var(--border-hi)', animation: 'pulse-glow 3s infinite' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <TrendingUp size={26} style={{ color: 'var(--indigo)', opacity: 0.8 }} />
              </div>
            </div>
            <p className="font-semibold mb-2" style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: '1rem' }}>
              Ready to analyze
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--fg-3)', maxWidth: 340, margin: '0 auto' }}>
              Describe your market or paste your startup idea above — the AI will do the rest.
            </p>
            <div
              className="flex items-center justify-center gap-2 mt-5"
              style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.1em' }}
            >
              <div className="h-px w-12" style={{ background: 'var(--border)' }} />
              GROQ · LLAMA 3.3 · 70B
              <div className="h-px w-12" style={{ background: 'var(--border)' }} />
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      {/* Export Modal */}
      {exportModal && result && (
        <ExportModal
          type={exportModal}
          result={result}
          input={input}
          competitors={competitors}
          onClose={() => setExportModal(null)}
        />
      )}

      <footer
        className="px-8 py-5 mt-8 text-center"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <div className="flex items-center justify-center gap-3" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--fg-4)', letterSpacing: '0.1em' }}>
          <span>ATLAS</span>
          <span style={{ color: 'var(--fg-4)', opacity: 0.4 }}>·</span>
          <span>MARKET INTELLIGENCE ENGINE</span>
          <span style={{ color: 'var(--fg-4)', opacity: 0.4 }}>·</span>
          <span>GROQ · LLAMA 3.3 · 70B</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Brand logo ───────────────────────────────────────────────────────────────

function AtlasLogo() {
  return (
    <div className="flex items-center gap-3">
      {/* Globe grid icon */}
      <div style={{ width: 34, height: 34, flexShrink: 0 }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <rect width="34" height="34" rx="9" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.28)" strokeWidth="1"/>
          <circle cx="17" cy="17" r="8.5" stroke="#3B82F6" strokeWidth="1.2" fill="none"/>
          <line x1="17" y1="8.5" x2="17" y2="25.5" stroke="#3B82F6" strokeWidth="1" strokeOpacity="0.7"/>
          <line x1="8.5" y1="17" x2="25.5" y2="17" stroke="#3B82F6" strokeWidth="1" strokeOpacity="0.7"/>
          <ellipse cx="17" cy="17" rx="4.5" ry="8.5" stroke="rgba(59,130,246,0.45)" strokeWidth="1" fill="none"/>
          <circle cx="17" cy="17" r="1.8" fill="#60A5FA"/>
        </svg>
      </div>
      <div className="flex flex-col" style={{ lineHeight: 1 }}>
        <span
          className="font-bold tracking-widest"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.9rem',
            fontWeight: 800,
            color: 'var(--fg-1)',
            letterSpacing: '0.22em',
          }}
        >
          ATLAS
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--fg-4)', letterSpacing: '0.08em' }}>
          MARKET INTELLIGENCE
        </span>
      </div>
    </div>
  );
}

// ─── Export Modal ─────────────────────────────────────────────────────────────

function ExportModal({
  type, onClose, result, input, competitors,
}: {
  type: 'notion' | 'slack';
  onClose: () => void;
  result: MarketSizingResult;
  input: MarketSizingInput;
  competitors: Competitor[];
}) {
  const isNotion = type === 'notion';

  const [token, setToken] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(`atlas_${type}_token`) ?? '' : ''
  );
  const [parentId, setParentId] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('atlas_notion_parent') ?? '' : ''
  );
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');
  const [notionUrl, setNotionUrl] = useState('');

  function saveToStorage(val: string, field: 'token' | 'parent') {
    if (typeof window === 'undefined') return;
    if (field === 'token') localStorage.setItem(`atlas_${type}_token`, val);
    else localStorage.setItem('atlas_notion_parent', val);
  }

  async function doExport() {
    setStatus('loading'); setErrMsg('');
    try {
      if (isNotion) {
        const res = await fetch('/api/export/notion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, parentPageId: parentId, input, result, competitors }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Notion export failed');
        setNotionUrl(data.url);
      } else {
        const res = await fetch('/api/export/slack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhookUrl: token, input, result, competitors }),
        });
        if (!res.ok) throw new Error('Slack webhook failed');
      }
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErrMsg(e instanceof Error ? e.message : 'Export failed');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card w-full max-w-md"
        style={{ animation: 'fadeUp 0.3s cubic-bezier(0.22,1,0.36,1) both' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            {isNotion
              ? <FileText size={14} style={{ color: 'var(--indigo)' }} />
              : <MessageSquare size={14} style={{ color: 'var(--emerald)' }} />}
            <span className="label">{isNotion ? 'Export to Notion' : 'Send to Slack'}</span>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs" style={{ padding: '4px 8px' }}>✕</button>
        </div>

        <div className="p-5 space-y-4">
          {status === 'done' ? (
            <div className="text-center py-4">
              <div className="text-2xl mb-2">✓</div>
              <p className="text-sm font-semibold" style={{ color: 'var(--emerald)' }}>
                {isNotion ? 'Report created in Notion' : 'Report sent to Slack'}
              </p>
              {notionUrl && (
                <a
                  href={notionUrl} target="_blank" rel="noopener noreferrer"
                  className="btn-ghost text-xs mt-3 inline-flex items-center gap-1.5"
                  style={{ color: 'var(--indigo)' }}
                >
                  Open in Notion ↗
                </a>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="label block mb-1.5">
                  {isNotion ? 'Integration Token' : 'Webhook URL'}
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={e => { setToken(e.target.value); saveToStorage(e.target.value, 'token'); }}
                  placeholder={isNotion ? 'secret_...' : 'https://hooks.slack.com/services/...'}
                  className="input w-full text-sm"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--fg-4)' }}>
                  {isNotion
                    ? 'Create at notion.so/my-integrations — share your page with the integration first'
                    : 'Create at api.slack.com/apps → Incoming Webhooks'}
                </p>
              </div>

              {isNotion && (
                <div>
                  <label className="label block mb-1.5">Parent Page ID</label>
                  <input
                    type="text"
                    value={parentId}
                    onChange={e => { setParentId(e.target.value); saveToStorage(e.target.value, 'parent'); }}
                    placeholder="Page ID from URL (32-char hex)"
                    className="input w-full"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}
                  />
                  <p className="text-xs mt-1" style={{ color: 'var(--fg-4)' }}>
                    From page URL: notion.so/Your-Page-<strong>abc123def456...</strong>
                  </p>
                </div>
              )}

              {status === 'error' && (
                <p className="text-xs px-3 py-2 rounded" style={{ color: '#F87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                  {errMsg}
                </p>
              )}

              <button
                onClick={doExport}
                disabled={status === 'loading' || !token || (isNotion && !parentId)}
                className="btn w-full flex items-center justify-center gap-2"
              >
                {status === 'loading'
                  ? <><Loader2 size={14} className="animate-spin" /> Exporting…</>
                  : isNotion ? 'Create Notion Page' : 'Send to Slack'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
