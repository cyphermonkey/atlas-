import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return NextResponse.json({ results: '' });

  const { queries } = await req.json() as { queries: string[] };

  const parts: string[] = [];
  for (const query of queries.slice(0, 3)) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query, search_depth: 'basic', max_results: 4, include_answer: true }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const answer = data.answer ? `Summary: ${data.answer}\n` : '';
      const snippets = (data.results ?? [])
        .map((r: { title: string; content: string; url: string }) => `[${r.title}] ${r.url}\n${r.content}`)
        .join('\n\n');
      parts.push(`=== ${query} ===\n${answer}${snippets}`);
    } catch { /* skip failed queries */ }
  }

  return NextResponse.json({ results: parts.join('\n\n---\n\n') });
}
