import { NextRequest, NextResponse } from 'next/server';

// Map common geography strings to World Bank country codes
const COUNTRY_CODES: Record<string, string> = {
  'india': 'IND', 'us': 'USA', 'usa': 'USA', 'united states': 'USA', 'america': 'USA',
  'china': 'CHN', 'uk': 'GBR', 'united kingdom': 'GBR', 'britain': 'GBR',
  'germany': 'DEU', 'france': 'FRA', 'japan': 'JPN', 'brazil': 'BRA',
  'indonesia': 'IDN', 'nigeria': 'NGA', 'mexico': 'MEX', 'australia': 'AUS',
  'canada': 'CAN', 'south korea': 'KOR', 'korea': 'KOR', 'russia': 'RUS',
  'singapore': 'SGP', 'uae': 'ARE', 'saudi arabia': 'SAU',
  'southeast asia': 'Z4', 'sea': 'Z4', 'global': '1W', 'world': '1W',
  'africa': 'SSF', 'europe': 'EUU', 'latin america': 'LCN',
};

const INDICATORS: { id: string; label: string; unit: string }[] = [
  { id: 'SP.POP.TOTL',    label: 'Total Population',         unit: 'people'     },
  { id: 'NY.GDP.MKTP.CD', label: 'GDP (current USD)',        unit: 'USD'        },
  { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita (USD)',     unit: 'USD/person' },
  { id: 'IT.NET.USER.ZS', label: 'Internet users (% pop)',   unit: '%'          },
  { id: 'SP.URB.TOTL.IN.ZS', label: 'Urban population (%)', unit: '%'          },
];

async function fetchIndicator(country: string, indicator: string, year: number): Promise<number | null> {
  try {
    const url = `https://api.worldbank.org/v2/country/${country}/indicator/${indicator}?format=json&date=${year - 2}:${year}&mrv=1`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    const records = data[1];
    if (!Array.isArray(records)) return null;
    const hit = records.find((r: { value: number | null }) => r.value !== null);
    return hit?.value ?? null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const geo = req.nextUrl.searchParams.get('geography') ?? '';
  const year = parseInt(req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear()));

  const code = COUNTRY_CODES[geo.toLowerCase().trim()];
  if (!code) return NextResponse.json({ country: geo, code: null, indicators: [] });

  const results = await Promise.all(
    INDICATORS.map(async (ind) => {
      const value = await fetchIndicator(code, ind.id, year);
      return { ...ind, value };
    })
  );

  return NextResponse.json({
    country: geo,
    code,
    year,
    indicators: results.filter(r => r.value !== null),
  });
}
