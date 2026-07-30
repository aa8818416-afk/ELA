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
}

interface DayForecast {
  date: string;
  wmo: number;
  temp_max: number;
  temp_min: number;
  precip_prob: number;
}

// ---------- single location fetch ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchLocationWeather(item: CenterCoordinates, supabase: any) {
  const locationName = `${item.governorate} - ${item.center}`;
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', item.lat.toString());
    url.searchParams.set('longitude', item.lng.toString());

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

    // --- hourly (for the day detail panels) ---
    url.searchParams.set('hourly', [
      'temperature_2m',
      'wind_speed_10m',
      'precipitation_probability',
    ].join(','));

    // --- daily (5-day forecast + ET0 + sunrise/sunset) ---
    url.searchParams.set('daily', [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'weather_code',
      'sunrise',
      'sunset',
      'et0_fao_evapotranspiration',
    ].join(','));

    url.searchParams.set('forecast_days', '6');
    url.searchParams.set('timezone', 'Africa/Cairo');

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo responded with ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;
    const hourly  = data.hourly;
    const daily   = data.daily;

    // Filter hourly to 6am–8pm only (indices where hour 6–20)
    const hourlyPoints: HourlyPoint[] = (hourly.time as string[])
      .map((t: string, i: number) => ({
        time: t,
        temp: hourly.temperature_2m[i] as number,
        wind: hourly.wind_speed_10m[i] as number,
        precip_prob: (hourly.precipitation_probability[i] as number) ?? 0,
      }))
      .filter(h => {
        const hr = new Date(h.time).getHours();
        return hr >= 6 && hr <= 20;
      });

    // Build 6-day forecast array (today + 5 days)
    const dailyForecast: DayForecast[] = (daily.time as string[]).slice(0, 6).map((date: string, i: number) => ({
      date,
      wmo:        daily.weather_code[i] as number,
      temp_max:   daily.temperature_2m_max[i] as number,
      temp_min:   daily.temperature_2m_min[i] as number,
      precip_prob: (daily.precipitation_probability_max[i] as number) ?? 0,
    }));

    const { error: upsertErr } = await (supabase as any)
      .from('weather_cache')
      .upsert(
        {
          location_name:                locationName,
          latitude:                     item.lat,
          longitude:                    item.lng,
          // current
          temperature_2m:               current.temperature_2m,
          relative_humidity_2m:         current.relative_humidity_2m,
          apparent_temperature:         current.apparent_temperature,
          weather_code:                 current.weather_code,
          wind_speed_10m:               current.wind_speed_10m,
          precipitation:                current.precipitation,
          dew_point_2m:                 current.dew_point_2m,
          // daily
          et0_fao_evapotranspiration:   daily.et0_fao_evapotranspiration[0],
          sunrise:                      daily.sunrise[0],
          sunset:                       daily.sunset[0],
          daily_forecast:               dailyForecast,
          // hourly
          hourly_today:                 hourlyPoints,
          // meta
          fetched_at:                   new Date().toISOString(),
          raw_data:                     data,
        },
        { onConflict: 'latitude,longitude' }
      );

    if (upsertErr) throw upsertErr;

    return { location: locationName, success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { location: locationName, success: false, error: errorMessage };
  }
}

// ---------- batch processor ----------
async function processWeatherFetch() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results: { location: string; success: boolean; error?: string }[] = [];

  // Parallel batches of 10 (daily+hourly payload is larger than current-only)
  const BATCH_SIZE = 10;
  for (let i = 0; i < EGYPT_CENTERS_COORDINATES.length; i += BATCH_SIZE) {
    const batch = EGYPT_CENTERS_COORDINATES.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((item) => fetchLocationWeather(item, supabase)));
    results.push(...batchResults);
  }

  const successCount = results.filter((r) => r.success).length;

  return {
    message: `Weather fetch complete: ${successCount}/${EGYPT_CENTERS_COORDINATES.length} locations updated`,
    results,
    fetchedAt: new Date().toISOString(),
  };
}

// ---------- POST (cron trigger) ----------
export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = await processWeatherFetch();
  return NextResponse.json(data);
}

// ---------- GET (manual test) ----------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const key    = searchParams.get('key');
  const cronSecret = process.env.CRON_SECRET;

  if (action === 'fetch' || (cronSecret && key === cronSecret)) {
    const data = await processWeatherFetch();
    return NextResponse.json(data);
  }

  return NextResponse.json({
    message: 'Weather cron endpoint. GET ?action=fetch or POST to trigger.',
    totalCenters: EGYPT_CENTERS_COORDINATES.length,
    fields: ['current', 'hourly (6am-8pm)', 'daily (6 days)', 'ET0', 'dew_point', 'sunrise', 'sunset'],
  });
}

