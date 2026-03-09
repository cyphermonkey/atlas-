/**
 * Market Sizing Engine — Groq backend
 *
 * Key is read from process.env.NEXT_PUBLIC_GROQ_API_KEY (set in .env, never committed).
 * LLM generates structured assumptions; deterministic engine does all arithmetic.
 */

import Groq from 'groq-sdk';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Methodology   = 'top-down' | 'bottom-up';
export type Confidence    = 'high' | 'medium' | 'low';
export type StepOperation = 'start' | 'multiply' | 'percentage' | 'subtract' | 'add';

export interface MarketSizingInput {
  market:      string;
  geography:   string;
  year:        number;
  methodology: Methodology;
}

export interface SizingStep {
  id:         string;
  label:      string;
  value:      number;
  unit:       string;
  rationale:  string;
  source:     string;
  confidence: Confidence;
  operation:  StepOperation;
}

export interface MarketSizingResult {
  methodology: Methodology;
  steps:       SizingStep[];
  tam:         number;
  sam:         number;
  som:         number;
  narrative:   string;
}

export interface SanityCheckResult {
  valid:            boolean;
  warning?:         string;
  suggested_value?: number;
}

// ─── Internal client (lazy-init, key from env) ────────────────────────────────

function getClient() {
  const key = process.env.NEXT_PUBLIC_GROQ_API_KEY as string | undefined;
  if (!key || key === 'your_groq_api_key_here') {
    throw new Error(
      'Groq API key not found. Add NEXT_PUBLIC_GROQ_API_KEY to your .env.local and restart the dev server.'
    );
  }
  return new Groq({ apiKey: key, dangerouslyAllowBrowser: true });
}

// ─── Deterministic calculation engine (zero LLM) ─────────────────────────────

export function recalculate(steps: SizingStep[]): { tam: number; sam: number; som: number } {
  if (!steps.length) return { tam: 0, sam: 0, som: 0 };

  let running = 0;
  for (const step of steps) {
    switch (step.operation) {
      case 'start':      running  = step.value;             break;
      case 'multiply':   running *= step.value;             break;
      case 'percentage': running *= step.value / 100;       break;
      case 'subtract':   running -= step.value;             break;
      case 'add':        running += step.value;             break;
    }
  }

  const tam = Math.max(0, running);
  return { tam, sam: tam * 0.3, som: tam * 0.05 };
}

export function formatCurrency(value: number, currency = 'INR'): string {
  const prefix = currency === 'INR' ? '₹' : currency === 'EUR' ? '€' : '$';
  if (value >= 1e12) return `${prefix}${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9)  return `${prefix}${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6)  return `${prefix}${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3)  return `${prefix}${(value / 1e3).toFixed(1)}K`;
  return `${prefix}${value.toFixed(0)}`;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function assumptionPrompt(i: MarketSizingInput, researchData?: string): string {
  const researchSection = researchData
    ? `\n\nWEB RESEARCH DATA (use these real figures as primary sources — cite them in the "source" field):\n${researchData}\n\nIMPORTANT: Base your assumptions on this real data. Quote specific statistics where available. Mark confidence "low" only when the research lacks data for a step.`
    : '';
  return `You are a McKinsey senior analyst. Size the "${i.market}" market in ${i.geography} for year ${i.year} using the ${i.methodology} approach.${researchSection}

Return ONLY a valid JSON object — no markdown fences, no extra text, no explanation.

Required schema:
{
  "methodology": "${i.methodology}",
  "steps": [
    {
      "id": "step_1",
      "label": "clear name for this funnel step",
      "value": <number>,
      "unit": "people | USD | % | units | households | businesses",
      "rationale": "1-2 sentences explaining the assumption",
      "source": "specific source — e.g. World Bank 2024, Statista, industry estimate",
      "confidence": "high | medium | low",
      "operation": "start | multiply | percentage | subtract | add"
    }
  ],
  "tam": <number>,
  "sam": <number>,
  "som": <number>,
  "narrative": "2-3 sentence analyst summary of the opportunity and key risks"
}

Rules:
- 4-7 steps flowing logically from broadest universe down to TAM
- First step must have operation "start"
- Subsequent steps narrow via multiply / percentage / subtract
- TAM equals the running product when all steps are applied sequentially
- SAM is 25-35% of TAM (serviceable segment); SOM is 3-8% of TAM (realistically capturable)
- All monetary values in INR (Indian Rupees)
- Mark confidence as "low" whenever the assumption is a rough estimate`;
}

function sanityPrompt(label: string, oldV: number, newV: number, context: string): string {
  return `You are a market sizing fact-checker.
A user changed the assumption "${label}" from ${fmt(oldV)} to ${fmt(newV)}.
Context: ${context}

Is ${fmt(newV)} a realistic value for "${label}" given this context?

Return ONLY this JSON object (no fences, no extra text):
{"valid": true|false, "warning": "brief direct explanation if invalid — omit key if valid", "suggested_value": <number or null>}`;
}

// ─── LLM: Assumption generation ───────────────────────────────────────────────

async function webResearchMarket(
  input: MarketSizingInput,
  onChunk?: (msg: string) => void
): Promise<string> {
  if (onChunk) onChunk('🔍 Searching live sources for market data...\n');
  try {
    const res = await fetch('/api/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries: [
          `${input.market} market size ${input.geography} ${input.year} statistics`,
          `${input.market} market growth rate ${input.geography} industry report`,
          `${input.market} total addressable market data`,
        ],
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const results: string = data.results ?? '';
    if (onChunk && results) onChunk('✓ Real data sourced from web\n');
    return results;
  } catch {
    return '';
  }
}

export async function generateMarketAssumptions(
  input: MarketSizingInput,
  onChunk?: (raw: string) => void
): Promise<MarketSizingResult> {
  const groq = getClient();

  // Phase 1: web research for real sourced data
  const researchData = await webResearchMarket(input, onChunk ? (msg) => onChunk(msg) : undefined);
  if (onChunk && researchData) onChunk('📊 Generating assumptions from sourced data...\n');

  let raw = '';

  const messages: { role: 'system' | 'user'; content: string }[] = [
    {
      role: 'system',
      content: 'You are a market sizing analyst. Always respond with a single valid JSON object matching the exact schema provided. No markdown, no extra keys, no nesting wrappers.',
    },
    { role: 'user', content: assumptionPrompt(input, researchData || undefined) },
  ];

  if (onChunk) {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? '';
      raw += delta;
      onChunk(raw);
    }
  } else {
    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    raw = result.choices[0]?.message?.content ?? '';
  }

  return parseResult(raw, input);
}

function parseResult(raw: string, input: MarketSizingInput): MarketSizingResult {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model returned unparseable output. Please try again.');
    parsed = JSON.parse(m[0]);
  }

  // Unwrap if model nested the result under a wrapper key
  if (!parsed.steps && !parsed.tam) {
    const nested = Object.values(parsed).find(
      (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && ('steps' in v || 'tam' in v)
    );
    if (nested) parsed = nested;
  }

  // Find steps array — model may use different key names
  const rawSteps: Partial<SizingStep>[] =
    parsed.steps ??
    parsed.assumptions ??
    parsed.funnel ??
    parsed.funnel_steps ??
    parsed.analysis_steps ??
    [];

  const steps: SizingStep[] = rawSteps.map((s: Partial<SizingStep>, i: number) => ({
    id:         s.id         ?? `step_${i + 1}`,
    label:      s.label      ?? `Step ${i + 1}`,
    value:      Number(s.value ?? 0),
    unit:       s.unit       ?? '',
    rationale:  s.rationale  ?? '',
    source:     s.source     ?? 'Industry estimate',
    confidence: (s.confidence as Confidence) ?? 'medium',
    operation:  (s.operation as StepOperation) ?? (i === 0 ? 'start' : 'multiply'),
  }));

  // Always recalculate — never trust LLM arithmetic
  // Fall back to LLM-provided values if recalculate returns 0 (e.g. steps empty)
  const calc = recalculate(steps);
  const tam = calc.tam > 0 ? calc.tam : Number(parsed.tam ?? 0);
  const sam = calc.sam > 0 ? calc.sam : Number(parsed.sam ?? tam * 0.3);
  const som = calc.som > 0 ? calc.som : Number(parsed.som ?? tam * 0.05);

  return {
    methodology: (parsed.methodology as Methodology) ?? input.methodology,
    steps,
    tam,
    sam,
    som,
    narrative: parsed.narrative ?? parsed.summary ?? '',
  };
}

// ─── LLM: Sanity check ────────────────────────────────────────────────────────

export async function sanityCheckAssumption(
  label: string,
  oldValue: number,
  newValue: number,
  context: string
): Promise<SanityCheckResult> {
  try {
    const groq = getClient();

    const result = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: sanityPrompt(label, oldValue, newValue, context) }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const raw = result.choices[0]?.message?.content ?? '{}';
    const check = JSON.parse(raw) as SanityCheckResult;

    return {
      valid:           check.valid ?? true,
      warning:         check.warning,
      suggested_value: check.suggested_value ?? undefined,
    };
  } catch {
    return { valid: true }; // fail open — never block the user
  }
}

// ─── New feature types ────────────────────────────────────────────────────────

export interface Competitor {
  name: string;
  estimated_revenue: number;
  market_share_pct: number;
  description: string;
  hq: string;
  stage: 'startup' | 'growth' | 'public' | 'established';
  founded?: string;
}

export interface ScenarioResult {
  name: 'bear' | 'base' | 'bull';
  label: string;
  description: string;
  key_assumption: string;
  tam: number;
  sam: number;
  som: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Competitor benchmarking ──────────────────────────────────────────────────

export async function generateCompetitors(
  input: MarketSizingInput,
  tam: number
): Promise<Competitor[]> {
  const groq = getClient();
  const prompt = `You are a market research analyst. List the top 5 competitors in the "${input.market}" market in ${input.geography} as of ${input.year}.
The total addressable market is approximately ${fmt(tam)} INR.

Return ONLY a valid JSON object — no markdown, no extra text.
{
  "competitors": [
    {
      "name": "Company name",
      "estimated_revenue": <number in INR>,
      "market_share_pct": <number 0-100>,
      "description": "1 sentence on what they do and why relevant",
      "hq": "City, Country",
      "stage": "startup | growth | public | established",
      "founded": "year as string"
    }
  ]
}
All monetary values in INR. Estimate revenues proportionally to market share.`;

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'You are a market research analyst. Always respond with valid JSON matching the exact schema provided. No wrappers.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const raw = result.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw);
    return parsed.competitors ?? [];
  } catch {
    return [];
  }
}

// ─── Scenario analysis ────────────────────────────────────────────────────────

export async function generateScenarios(
  input: MarketSizingInput,
  baseTam: number
): Promise<ScenarioResult[]> {
  const groq = getClient();
  const prompt = `You are a McKinsey senior analyst. Generate three market sizing scenarios for the "${input.market}" market in ${input.geography} for year ${input.year}.
Base TAM is approximately ${fmt(baseTam)} INR.

Return ONLY a valid JSON object:
{
  "scenarios": [
    {
      "name": "bear",
      "label": "Bear Case",
      "description": "One sentence on the macro/competitive driver for this scenario",
      "key_assumption": "The single most important assumption that differs from base case",
      "tam": <number in INR — 40-60% of base TAM>,
      "sam": <25-35% of tam>,
      "som": <3-8% of tam>
    },
    {
      "name": "base",
      "label": "Base Case",
      "description": "...",
      "key_assumption": "...",
      "tam": <close to ${fmt(baseTam)} INR>,
      "sam": <25-35% of tam>,
      "som": <3-8% of tam>
    },
    {
      "name": "bull",
      "label": "Bull Case",
      "description": "...",
      "key_assumption": "...",
      "tam": <150-250% of base TAM>,
      "sam": <25-35% of tam>,
      "som": <3-8% of tam>
    }
  ]
}
All monetary values in INR.`;

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: 'You are a market sizing analyst. Always respond with valid JSON.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const raw = result.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw);
    return parsed.scenarios ?? [];
  } catch {
    return [];
  }
}

// ─── AI chat with analyst ─────────────────────────────────────────────────────

export async function chatWithAnalyst(
  messages: ChatMessage[],
  marketContext: string,
): Promise<string> {
  const groq = getClient();

  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: `You are a senior McKinsey analyst specializing in market sizing and strategy. You have just completed a market analysis:\n\n${marketContext}\n\nAnswer questions concisely and authoritatively. Use specific numbers from the analysis when relevant. Keep responses under 4 sentences unless the user asks for more detail.`,
      },
      ...messages,
    ],
    temperature: 0,
    max_tokens: 600,
  });

  return result.choices[0]?.message?.content ?? '';
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

// ─── Extended feature types ───────────────────────────────────────────────────

export interface PorterForce {
  force: string;
  score: number;      // 1–10
  rating: 'Low' | 'Medium' | 'High';
  rationale: string;
}

export interface PortersFiveForcesResult {
  competitive_rivalry: PorterForce;
  supplier_power: PorterForce;
  buyer_power: PorterForce;
  threat_of_substitutes: PorterForce;
  threat_of_new_entrants: PorterForce;
  overall_attractiveness: 'Low' | 'Medium' | 'High';
  summary: string;
}

export interface SWOTResult {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

export interface MarketSegment {
  name: string;
  tam_fraction: number;   // 0–1, all must sum to 1
  description: string;
  growth_rate_pct: number;
}

export interface GrowthProjection {
  base_tam: number;
  start_year: number;
  years: number[];
  bear: number[];
  base_vals: number[];
  bull: number[];
  cagr_bear: number;
  cagr_base: number;
  cagr_bull: number;
}

export type RevenueModelType = 'saas' | 'transactional' | 'marketplace' | 'licensing';

export interface RevenueProjectionYear {
  year: number;
  revenue: number;
  gross_profit: number;
  ebitda: number;
}

export interface RevenueProjection {
  model_type: RevenueModelType;
  years: RevenueProjectionYear[];
  key_assumptions: string[];
}

export interface InvestmentThesis {
  memo: string;
  key_metrics: { label: string; value: string }[];
  risks: string[];
  verdict: 'Attractive' | 'Neutral' | 'Unattractive';
}

// ─── Internal JSON parser ─────────────────────────────────────────────────────

function parseJsonSafe<T>(raw: string): T | null {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    try { return m ? JSON.parse(m[0]) as T : null; } catch { return null; }
  }
}

// ─── Porter's Five Forces ─────────────────────────────────────────────────────

export async function generatePortersFiveForces(
  input: MarketSizingInput
): Promise<PortersFiveForcesResult | null> {
  const groq = getClient();
  const prompt = `Analyze Porter's Five Forces for the "${input.market}" market in ${input.geography}.
Return ONLY this JSON (no code fences, no extra keys):
{
  "competitive_rivalry":    { "force": "Competitive Rivalry",     "score": <1-10>, "rating": "Low|Medium|High", "rationale": "1 sentence" },
  "supplier_power":         { "force": "Supplier Power",          "score": <1-10>, "rating": "Low|Medium|High", "rationale": "1 sentence" },
  "buyer_power":            { "force": "Buyer Power",             "score": <1-10>, "rating": "Low|Medium|High", "rationale": "1 sentence" },
  "threat_of_substitutes":  { "force": "Threat of Substitutes",   "score": <1-10>, "rating": "Low|Medium|High", "rationale": "1 sentence" },
  "threat_of_new_entrants": { "force": "Threat of New Entrants",  "score": <1-10>, "rating": "Low|Medium|High", "rationale": "1 sentence" },
  "overall_attractiveness": "Low|Medium|High",
  "summary": "2 sentence overall market attractiveness assessment"
}
Score 1-3=Low, 4-6=Medium, 7-10=High. Higher score = more intense force = worse for incumbents.`;

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  return parseJsonSafe<PortersFiveForcesResult>(raw);
}

// ─── SWOT Analysis ────────────────────────────────────────────────────────────

export async function generateSWOT(
  input: MarketSizingInput,
  tam: number
): Promise<SWOTResult | null> {
  const groq = getClient();
  const prompt = `Generate a SWOT analysis for entering the "${input.market}" market in ${input.geography}. Market TAM ≈ ${fmt(tam)} INR.
Return ONLY this JSON (no code fences):
{
  "strengths":     ["string", "string", "string"],
  "weaknesses":    ["string", "string", "string"],
  "opportunities": ["string", "string", "string"],
  "threats":       ["string", "string", "string"]
}
Each item: 1 clear, specific, actionable sentence. 3–4 items per quadrant.`;

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  return parseJsonSafe<SWOTResult>(raw);
}

// ─── Market Segmentation ──────────────────────────────────────────────────────

export async function generateSegmentation(
  input: MarketSizingInput,
  tam: number
): Promise<MarketSegment[]> {
  const groq = getClient();
  const prompt = `Break down the "${input.market}" market in ${input.geography} into 5–6 key sub-segments. Total TAM ≈ ${fmt(tam)} INR.
Return ONLY this JSON (no code fences):
{
  "segments": [
    { "name": "Segment name", "tam_fraction": <0-1, all must sum to 1.0>, "description": "1 sentence", "growth_rate_pct": <CAGR number> }
  ]
}`;

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonSafe<{ segments: MarketSegment[] }>(raw);
  return parsed?.segments ?? [];
}

// ─── Growth Rate Projector ────────────────────────────────────────────────────

export async function generateGrowthProjection(
  input: MarketSizingInput,
  baseTam: number
): Promise<GrowthProjection> {
  const groq = getClient();
  const prompt = `Estimate 10-year market growth CAGRs for the "${input.market}" market in ${input.geography}. Current (${input.year}) TAM ≈ ${fmt(baseTam)} INR.
Return ONLY this JSON (no code fences):
{ "cagr_bear": <number — pessimistic % annual growth>, "cagr_base": <number — realistic % annual growth>, "cagr_bull": <number — optimistic % annual growth> }`;

  let cagrBear = 5, cagrBase = 12, cagrBull = 25;
  try {
    const res = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    const raw = res.choices[0]?.message?.content ?? '{}';
    const parsed = parseJsonSafe<{ cagr_bear: number; cagr_base: number; cagr_bull: number }>(raw);
    if (parsed) {
      cagrBear = Number(parsed.cagr_bear ?? 5);
      cagrBase = Number(parsed.cagr_base ?? 12);
      cagrBull = Number(parsed.cagr_bull ?? 25);
    }
  } catch { /* use defaults */ }

  const years = Array.from({ length: 11 }, (_, i) => input.year + i);
  return {
    base_tam: baseTam,
    start_year: input.year,
    years,
    bear:      years.map((_, i) => baseTam * Math.pow(1 + cagrBear / 100, i)),
    base_vals: years.map((_, i) => baseTam * Math.pow(1 + cagrBase / 100, i)),
    bull:      years.map((_, i) => baseTam * Math.pow(1 + cagrBull / 100, i)),
    cagr_bear: cagrBear,
    cagr_base: cagrBase,
    cagr_bull: cagrBull,
  };
}

// ─── Revenue Model Builder ────────────────────────────────────────────────────

export async function generateRevenueModel(
  input: MarketSizingInput,
  tam: number,
  modelType: RevenueModelType
): Promise<RevenueProjection> {
  const groq = getClient();
  const modelDesc: Record<RevenueModelType, string> = {
    saas:          'SaaS (recurring subscription revenue)',
    transactional: 'Transactional (revenue per sale/unit)',
    marketplace:   'Marketplace (take-rate on GMV)',
    licensing:     'Licensing (IP/technology license fees)',
  };
  const prompt = `Model a startup entering the "${input.market}" market in ${input.geography}. TAM ≈ ${fmt(tam)} INR. Revenue model: ${modelDesc[modelType]}.
Project 5-year P&L for a company capturing 0.5%–3% market share by year 5.
Return ONLY this JSON (no code fences):
{
  "years": [
    { "year": ${input.year},     "revenue": <number in INR>, "gross_profit": <number>, "ebitda": <number> },
    { "year": ${input.year + 1}, "revenue": <number>,        "gross_profit": <number>, "ebitda": <number> },
    { "year": ${input.year + 2}, "revenue": <number>,        "gross_profit": <number>, "ebitda": <number> },
    { "year": ${input.year + 3}, "revenue": <number>,        "gross_profit": <number>, "ebitda": <number> },
    { "year": ${input.year + 4}, "revenue": <number>,        "gross_profit": <number>, "ebitda": <number> }
  ],
  "key_assumptions": ["assumption 1", "assumption 2", "assumption 3"]
}
EBITDA may be negative in early years. All values in INR.`;

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonSafe<{ years: RevenueProjectionYear[]; key_assumptions: string[] }>(raw);
  return {
    model_type: modelType,
    years: parsed?.years ?? [],
    key_assumptions: parsed?.key_assumptions ?? [],
  };
}

// ─── Investment Thesis Generator ──────────────────────────────────────────────

export async function generateInvestmentThesis(
  input: MarketSizingInput,
  tam: number,
  sam: number,
  som: number
): Promise<InvestmentThesis> {
  const groq = getClient();
  const prompt = `Write an investment memo for the "${input.market}" market in ${input.geography} (${input.year}).
TAM: ${fmt(tam)} INR | SAM: ${fmt(sam)} INR | SOM: ${fmt(som)} INR
Return ONLY this JSON (no code fences):
{
  "memo": "150–200 word investment memo covering market opportunity, competitive dynamics, growth drivers, and entry strategy. Written in authoritative analyst voice.",
  "key_metrics": [
    { "label": "TAM", "value": "${fmt(tam)}" },
    { "label": "CAGR (est.)", "value": "X%" },
    { "label": "Key risk", "value": "one phrase" }
  ],
  "risks": ["Risk 1 — one sentence", "Risk 2 — one sentence", "Risk 3 — one sentence"],
  "verdict": "Attractive | Neutral | Unattractive"
}`;

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonSafe<InvestmentThesis>(raw);
  return parsed ?? { memo: '', key_metrics: [], risks: [], verdict: 'Neutral' };
}

// ─── Idea Agent ────────────────────────────────────────────────────────────────

export type AgentPhase =
  | 'extract' | 'plan' | 'search' | 'synthesize' | 'competitors' | 'done' | 'error';

export interface AgentUpdate {
  phase: AgentPhase;
  message: string;
  detail?: string;
}

export interface AgentResult {
  input:       MarketSizingInput;
  result:      MarketSizingResult;
  competitors: Competitor[];
}

async function tavilySearch(query: string): Promise<string> {
  const key = process.env.NEXT_PUBLIC_TAVILY_API_KEY as string | undefined;
  if (!key) return '';
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        max_results: 4,
        include_answer: true,
      }),
    });
    if (!res.ok) return '';
    const data = await res.json();
    const answer  = data.answer ? `Summary: ${data.answer}\n\n` : '';
    const results = (data.results ?? [])
      .map((r: { title: string; content: string }) => `[${r.title}]\n${r.content}`)
      .join('\n\n');
    return answer + results;
  } catch {
    return '';
  }
}

export async function runIdeaAgent(
  idea: string,
  onUpdate: (u: AgentUpdate) => void,
): Promise<AgentResult> {
  const groq = getClient();

  // ── 1. Extract context + plan searches ──────────────────────────────────────
  onUpdate({ phase: 'extract', message: 'Understanding your idea…' });

  const extractRes = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `You are a market research strategist. A founder described their startup:
"${idea}"

Extract the core business context and plan targeted web searches.
Return JSON:
{
  "market": "concise market name (e.g. 'B2B SaaS for CA firms — GST automation')",
  "geography": "primary geography (e.g. 'India')",
  "year": ${new Date().getFullYear()},
  "methodology": "top-down or bottom-up — pick the right one",
  "business_context": "2-3 sentence description of the business, target customer, revenue model",
  "search_queries": [
    "6 specific search queries to find: market size data, growth rates, number of target customers, key competitors, and recent reports. Be specific."
  ]
}`,
    }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  type ExtractedContext = {
    market: string;
    geography: string;
    year: number;
    methodology: Methodology;
    business_context: string;
    search_queries: string[];
  };

  const extracted = parseJsonSafe<ExtractedContext>(
    extractRes.choices[0]?.message?.content ?? '{}'
  );
  if (!extracted) throw new Error('Could not parse idea. Try rephrasing.');

  const queries = (extracted.search_queries ?? []).slice(0, 6);
  onUpdate({ phase: 'plan', message: `Planned ${queries.length} web searches`, detail: queries.join(' · ') });

  // ── 2. Web search ───────────────────────────────────────────────────────────
  const hasTavily = !!(process.env.NEXT_PUBLIC_TAVILY_API_KEY as string | undefined);
  const searchResults: string[] = [];

  if (hasTavily) {
    for (let i = 0; i < queries.length; i++) {
      onUpdate({ phase: 'search', message: `Searching ${i + 1} of ${queries.length}…`, detail: queries[i] });
      const text = await tavilySearch(queries[i]);
      if (text) searchResults.push(`=== Query: ${queries[i]} ===\n${text}`);
    }
  } else {
    onUpdate({ phase: 'search', message: 'Using LLM knowledge base (no search key configured)', detail: 'Add NEXT_PUBLIC_TAVILY_API_KEY for live Google results' });
  }

  const searchContext = searchResults.length > 0
    ? `\n\nWEB SEARCH RESULTS:\n${searchResults.join('\n\n---\n\n')}`
    : '\n\n(No live search data — use training knowledge to estimate realistically.)';

  // ── 3. Synthesize market sizing ─────────────────────────────────────────────
  onUpdate({ phase: 'synthesize', message: 'Analyzing data and sizing the market…' });

  const synthRes = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `You are a McKinsey market analyst. Use the context and search data to produce a rigorous market sizing.

BUSINESS: ${extracted.business_context}
MARKET: ${extracted.market}
GEOGRAPHY: ${extracted.geography}
YEAR: ${extracted.year}
METHODOLOGY: ${extracted.methodology}
${searchContext}

Build a ${extracted.methodology} market sizing. Use real data from search results where available.
Return JSON:
{
  "methodology": "${extracted.methodology}",
  "steps": [
    {
      "id": "s1",
      "label": "Step label — source name",
      "value": 50000000,
      "unit": "people | ₹ | %",
      "rationale": "Why this number, citing search data if available",
      "source": "Source name or Estimated",
      "confidence": "high|medium|low",
      "operation": "start|multiply|percentage|subtract|add"
    }
  ],
  "tam": 50000000000,
  "sam": 15000000000,
  "som": 1500000000,
  "narrative": "200-word analyst narrative explaining the opportunity, key drivers, and sizing rationale. Reference actual data points from search results where available."
}
All monetary values in INR. 6–10 steps. First step operation must be "start".`,
    }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const sizingResult = parseJsonSafe<MarketSizingResult>(
    synthRes.choices[0]?.message?.content ?? '{}'
  );
  if (!sizingResult) throw new Error('Failed to generate market sizing. Please try again.');

  // ── 4. Competitors ──────────────────────────────────────────────────────────
  onUpdate({ phase: 'competitors', message: 'Building competitor landscape…' });

  const compRes = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `Identify 5–7 real competitors for this business.
MARKET: ${extracted.market} in ${extracted.geography}
${searchContext}

Return JSON:
{
  "competitors": [
    {
      "name": "Company name",
      "stage": "startup|growth|public|established",
      "estimated_revenue": 50000000,
      "market_share_pct": 5.2,
      "hq": "City, Country",
      "founded": "2019",
      "description": "One sentence on what they do and their edge"
    }
  ]
}
Estimated revenue in INR. Use real companies from search results.`,
    }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const compParsed = parseJsonSafe<{ competitors: Competitor[] }>(
    compRes.choices[0]?.message?.content ?? '{}'
  );

  onUpdate({ phase: 'done', message: 'Report ready!' });

  return {
    input: {
      market:      extracted.market,
      geography:   extracted.geography,
      year:        extracted.year,
      methodology: extracted.methodology,
    },
    result:      sizingResult,
    competitors: compParsed?.competitors ?? [],
  };
}

// ─── Consulting Case Solver ────────────────────────────────────────────────────

export type CaseType =
  'market-entry' | 'growth-strategy' | 'ma' | 'profitability' |
  'pricing' | 'turnaround' | 'digital';

export interface ConsultingStep {
  id: string;
  stepNumber: number;
  title: string;
  objective: string;
  keyQuestions: string[];
  approach: string;
  linkedTool?: 'market-sizing' | 'competitors' | 'porters' | 'swot' |
               'scenarios' | 'segmentation' | 'growth' | 'revenue' | 'thesis' | null;
  status: 'pending' | 'running' | 'done';
  output?: string;
}

export interface CaseFramework {
  caseType: CaseType;
  caseTypeLabel: string;
  frameworkUsed: string;
  clientContext: string;
  hypotheses: string[];
  steps: ConsultingStep[];
}

export async function identifyAndFrameCase(
  description: string,
  onUpdate?: (msg: string) => void
): Promise<CaseFramework> {
  const groq = getClient();
  if (onUpdate) onUpdate('🔍 Identifying case type and framework...\n');

  const prompt = `You are a McKinsey Partner. A client described their business problem:
"${description}"

Identify the consulting case type and apply the correct BCG/McKinsey/Bain framework:

MARKET ENTRY → 5Cs framework (Company, Customers, Competitors, Collaborators, Context) + Porter's Five Forces
GROWTH STRATEGY → BCG Three Horizons + Ansoff Matrix
M&A → Strategic Fit + Synergy Waterfall framework
PROFITABILITY → Profit Tree (Revenue: Volume × Price; Cost: Fixed + Variable)
PRICING → Value-Based Pricing (Economic Value to Customer)
TURNAROUND → Stabilize-Restructure-Grow framework
DIGITAL → Digital Maturity Model (Initiate → Develop → Define → Manage → Optimize)

Return ONLY valid JSON (no markdown fences, no extra text):
{
  "caseType": "market-entry | growth-strategy | ma | profitability | pricing | turnaround | digital",
  "caseTypeLabel": "Human-readable label e.g. 'Market Entry'",
  "frameworkUsed": "e.g. '5Cs + Porter's Five Forces'",
  "clientContext": "2-3 sentence summary of the client's situation and what they need",
  "hypotheses": [
    "Hypothesis 1 — specific testable statement about this case",
    "Hypothesis 2 — ...",
    "Hypothesis 3 — ..."
  ],
  "steps": [
    {
      "id": "step_1",
      "stepNumber": 1,
      "title": "Step title",
      "objective": "One sentence objective for this step",
      "keyQuestions": [
        "Key question 1",
        "Key question 2",
        "Key question 3"
      ],
      "approach": "2-3 sentence description of the analytical approach for this step",
      "linkedTool": "market-sizing | competitors | porters | swot | scenarios | segmentation | growth | revenue | thesis | null"
    }
  ]
}

Generate 5-7 steps following the exact framework for the identified case type.
For linkedTool: use "null" (as string) if no existing tool maps to this step. Available tools: market-sizing, competitors, porters, swot, scenarios, segmentation, growth, revenue, thesis.`;

  if (onUpdate) onUpdate('⚙️ Generating MECE framework and work plan...\n');

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are a McKinsey Partner structuring a consulting engagement. Return only valid JSON matching the exact schema. No markdown fences.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });

  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonSafe<CaseFramework>(raw);
  if (!parsed) throw new Error('Failed to parse case framework. Please try again.');

  // Normalize linkedTool: "null" string → null
  if (parsed.steps) {
    parsed.steps = parsed.steps.map((s) => ({
      ...s,
      linkedTool: (s.linkedTool as unknown as string) === 'null' ? null : s.linkedTool,
      status: 'pending' as const,
    }));
  }

  if (onUpdate) onUpdate('✓ Framework ready\n');
  return parsed;
}

export async function executeConsultingStep(
  step: ConsultingStep,
  caseContext: string,
): Promise<string> {
  const groq = getClient();

  const prompt = `You are a McKinsey senior consultant working on this case:
${caseContext}

Complete this analysis step:
Step: ${step.title}
Objective: ${step.objective}
Approach: ${step.approach}

Answer each key question with specific, data-driven insights:
${step.keyQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Provide:
- Direct answers to each key question
- Specific recommendations with supporting rationale
- Key risks and mitigants
- Recommended next actions

Write 300-500 words in McKinsey analyst voice. Use markdown formatting (headers, bullets).`;

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are a McKinsey senior consultant. Provide concise, structured, data-driven analysis.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0,
    max_tokens: 800,
  });

  return res.choices[0]?.message?.content ?? '';
}
