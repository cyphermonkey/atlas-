import { NextRequest, NextResponse } from 'next/server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yahooFinance = require('yahoo-finance2').default;

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ source: 'not_found' });

  try {
    const searchResult = await yahooFinance.search(name, { quotesCount: 5, newsCount: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const equity = (searchResult.quotes ?? []).find((q: any) => q.quoteType === 'EQUITY') as { symbol: string } | undefined;
    if (!equity?.symbol) return NextResponse.json({ source: 'not_found' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yahooFinance.quote(equity.symbol);

    return NextResponse.json({
      ticker: equity.symbol,
      marketCap: quote.marketCap ?? null,
      stockPrice: quote.regularMarketPrice ?? null,
      peRatio: quote.trailingPE ?? null,
      revenue: quote.revenueTrailingTwelveMonths ?? null,
      currency: quote.currency ?? 'USD',
      source: 'yahoo_finance',
    });
  } catch (err) {
    console.error('[financials]', err);
    return NextResponse.json({ source: 'not_found' });
  }
}
