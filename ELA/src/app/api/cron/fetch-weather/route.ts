import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EGYPT_CENTERS_COORDINATES, CenterCoordinates } from '@/data/egyptCenters';

export const dynamic = 'force-dynamic';

// ---------- types ----------
interface HourlyPoint {
  time: string;
  temp: number;
  wind: number;
  precip_prob: number;
  wmo?: number;
}

interface DayForecast {
  date: string;
  wmo: number;
  temp_max: number;
  temp_min: number;
  precip_prob: number;
}

// ---------- format single center data ----------
function formatCenterWeatherData(item: CenterCoordinates, data: any) {
  const locationName = `${item.governorate} - ${item.center}`;
  const current = data.current;
  const hourly  = data.hourly;
  const daily   = data.daily;

  if (!current || !hourly || !daily) {
    throw new Error(`Incomplete weather data structure for ${locationName}`);
  }

  // All 24 hours per day for 7 days
  const hourlyPoints: HourlyPoint[] = (hourly.time as string[]).map((t: string, i: number) => ({
    time: t,
    temp: hourly.temperature_2m[i] as number,
    wind: hourly.wind_speed_10m[i] as number,
    precip_prob: (hourly.precipitation_probability?.[i] as number) ?? 0,
    wmo: (hourly.weather_code?.[i] as number | undefined),
  }));

  // Build 7-day forecast array
  const dailyForecast: DayForecast[] = (daily.time as string[]).slice(0, 7).map((date: string, i: number) => ({
    date,
    wmo: daily.weather_code?.[i] as number,
    temp_max: daily.temperature_2m_max?.[i] as number,
    temp_min: daily.temperature_2m_min?.[i] as number,
    precip_prob: (daily.precipitation_probability_max?.[i] as number) ?? 0,
  }));

  return {
    location_name: locationName,
    latitude: item.lat,
    longitude: item.lng,
    temperature_2m: current.temperature_2m,
    relative_humidity_2m: current.relative_humidity_2m,
    apparent_temperature: current.apparent_temperature,
    weather_code: current.weather_code,
    wind_speed_10m: current.wind_speed_10m,
    precipitation: current.precipitation,
    dew_point_2m: current.dew_point_2m,
    et0_fao_evapotranspiration: daily.et0_fao_evapotranspiration?.[0] ?? null,
    sunrise: daily.sunrise?.[0] ?? null,
    sunset: daily.sunset?.[0] ?? null,
    daily_forecast: dailyForecast,
    hourly_today: hourlyPoints,
    fetched_at: new Date().toISOString(),
    raw_data: data,
  };
}

// ---------- multi-location batch fetcher with retry ----------
async function fetchBatchWeatherWithRetry(batch: CenterCoordinates[], retries = 2): Promise<{ rows: any[]; results: { location: string; success: boolean; error?: string }[] }> {
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', batch.map(c => c.lat).join(','));
      url.searchParams.set('longitude', batch.map(c => c.lng).join(','));

      // --- current ---
      url.searchParams.set('current', [
        'temperature_2m',
        'apparent_temperature',
        'relative_humidity_2m',
        'weather_code',
        'wind_speed_10m',
        'precipitation',
        'dew_point_2m',
      ].join(','));

      // --- hourly ---
      url.searchParams.set('hourly', [
        'temperature_2m',
        'wind_speed_10m',
        'precipitation_probability',
        'weather_code',
      ].join(','));

      // --- daily (7-day forecast + ET0 + sunrise/sunset) ---
      url.searchParams.set('daily', [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_probability_max',
        'weather_code',
        'sunrise',
        'sunset',
        'et0_fao_evapotranspiration',
      ].join(','));

      url.searchParams.set('forecast_days', '7');
      url.searchParams.set('timezone', 'Africa/Cairo');

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if ((response.status === 429 || response.status === 503) && attempt <= retries) {
          console.warn(`[fetch-weather] Open-Meteo status ${response.status}, retrying attempt ${attempt + 1}...`);
          await new Promise(r => setTimeout(r, 600 * attempt));
          continue;
        }
        throw new Error(`Open-Meteo API error (${response.status}): ${errorText.slice(0, 100)}`);
      }

      const rawJson = await response.json();
      const dataList = Array.isArray(rawJson) ? rawJson : [rawJson];

      const rows: any[] = [];
      const results: { location: string; success: boolean; error?: string }[] = [];

      for (let i = 0; i < batch.length; i++) {
        const center = batch[i];
        const centerData = dataList[i];
        const locationName = `${center.governorate} - ${center.center}`;

        if (!centerData) {
          results.push({ location: locationName, success: false, error: 'No data returned for coordinate' });
          continue;
        }

        try {
          const row = formatCenterWeatherData(center, centerData);
          rows.push(row);
          results.push({ location: locationName, success: true });
        } catch (err: any) {
          results.push({ location: locationName, success: false, error: err.message });
        }
      }

      return { rows, results };
    } catch (err: any) {
      if (attempt <= retries) {
        await new Promise(r => setTimeout(r, 600 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Failed after retries');
}

// ---------- main batch processor ----------
async function processWeatherFetch() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const startTime = Date.now();
  const allRows: any[] = [];
  const allResults: { location: string; success: boolean; error?: string }[] = [];

  // Split 233 centers into safe multi-location batch requests (~25 centers each)
  const BATCH_SIZE = 25;
  const batches: CenterCoordinates[][] = [];
  for (let i = 0; i < EGYPT_CENTERS_COORDINATES.length; i += BATCH_SIZE) {
    batches.push(EGYPT_CENTERS_COORDINATES.slice(i, i + BATCH_SIZE));
  }

  // Execute all batches in parallel for sub-2-second speed
  const batchOutputs = await Promise.all(
    batches.map((batch) =>
      fetchBatchWeatherWithRetry(batch).catch((batchErr: any) => {
        console.error('[fetch-weather] Batch fetch error:', batchErr);
        return {
          rows: [],
          results: batch.map((item) => ({
            location: `${item.governorate} - ${item.center}`,
            success: false,
            error: batchErr.message,
          })),
        };
      })
    )
  );

  for (const out of batchOutputs) {
    allRows.push(...out.rows);
    allResults.push(...out.results);
  }

  // Bulk upsert all gathered locations into Supabase in chunks of 50
  if (allRows.length > 0) {
    const UPSERT_CHUNK = 50;
    for (let i = 0; i < allRows.length; i += UPSERT_CHUNK) {
      const chunk = allRows.slice(i, i + UPSERT_CHUNK);
      const { error: upsertErr } = await (supabase as any)
        .from('weather_cache')
        .upsert(chunk, { onConflict: 'latitude,longitude' });

      if (upsertErr) {
        console.error('[fetch-weather] Bulk upsert error:', upsertErr);
      }
    }
  }

  const successCount = allResults.filter((r) => r.success).length;
  const executionMs = Date.now() - startTime;

  return {
    success: true,
    message: `Weather fetch complete: ${successCount}/${EGYPT_CENTERS_COORDINATES.length} locations updated in ${executionMs}ms`,
    updatedCount: successCount,
    totalCenters: EGYPT_CENTERS_COORDINATES.length,
    executionTimeMs: executionMs,
    fetchedAt: new Date().toISOString(),
    results: allResults,
  };
}

// ---------- POST (cron trigger) ----------
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get('secret') || searchParams.get('key');
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY;

  const isAuthorized = !cronSecret ||
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret ||
    process.env.NODE_ENV === 'development';

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await processWeatherFetch();
  return NextResponse.json(data);
}

// ---------- GET (manual test & fallback) ----------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const querySecret = searchParams.get('secret') || searchParams.get('key');
  const cronSecret = process.env.CRON_SECRET || process.env.CRON_SECRET_KEY;

  const isAuthorized = action === 'fetch' ||
    !cronSecret ||
    querySecret === cronSecret ||
    process.env.NODE_ENV === 'development';

  if (isAuthorized) {
    const data = await processWeatherFetch();
    return NextResponse.json(data);
  }

  return NextResponse.json({
    message: 'Weather cron endpoint. GET ?action=fetch or POST to trigger.',
    totalCenters: EGYPT_CENTERS_COORDINATES.length,
    fields: ['current', 'hourly (24h)', 'daily (7 days)', 'ET0', 'dew_point', 'sunrise', 'sunset'],
  });
}


