import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { companyName, tavilyKey, groqKey } = await req.json();
  if (!tavilyKey || !groqKey) return NextResponse.json({ source: 'not_found' });

  try {
    // 1. Tavily search for CrunchBase / funding data
    const tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: `"${companyName}" total funding raised investors crunchbase site:crunchbase.com OR site:techcrunch.com`,
        search_depth: 'basic',
        max_results: 4,
        include_answer: true,
      }),
    });
    if (!tavilyRes.ok) return NextResponse.json({ source: 'not_found' });

    const tavilyData = await tavilyRes.json();
    const context = [
      tavilyData.answer ?? '',
      ...((tavilyData.results ?? []) as { content: string }[]).map(r => r.content),
    ].join('\n\n').slice(0, 3000);

    // 2. Groq extracts structured funding data
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'user',
          content: `Extract funding info for "${companyName}" from this text. Return ONLY JSON with no extra text:
{"totalRaised": <USD number or null>, "lastRound": "<Series A/B/C/seed/IPO/etc or null>", "lastRoundAmount": <USD number or null>, "investors": [<up to 3 investor names as strings>], "valuation": <USD number or null>}

Text:
${context}`,
        }],
        response_format: { type: 'json_object' },
        max_tokens: 300,
      }),
    });
    if (!groqRes.ok) return NextResponse.json({ source: 'not_found' });

    const groqData = await groqRes.json();
    const parsed = JSON.parse(groqData.choices[0].message.content);
    return NextResponse.json({ ...parsed, source: 'crunchbase' });
  } catch (err) {
    console.error('[funding]', err);
    return NextResponse.json({ source: 'not_found' });
  }
}
