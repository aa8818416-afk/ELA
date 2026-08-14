/**
 * Weather domain logic & decision helpers for ELA platform.
 * Conforms strictly to user rules:
 * - Heat warning threshold fixed at 38°C (apparent_temperature)
 * - Spray status logic with VPD, wind, precipitation probability
 * - Irrigation advice logic
 * - Frost warning for sensitive crops
 * - WMO weather code mapping to Arabic & emojis
 */

export interface HourlyPoint {
  time: string;
  temp: number;
  wind: number;
  precip_prob: number;
  wmo?: number;
}

export interface DayForecast {
  date: string;
  wmo: number;
  temp_max: number;
  temp_min: number;
  precip_prob: number;
}

export interface SprayStatus {
  badge: 'green' | 'yellow' | 'red';
  message: string;
  reason?: string;
}

export interface IrrigationAdvice {
  icon: string;
  text: string;
}

export interface HeatWarning {
  show: boolean;
  text?: string;
}

export interface FrostWarning {
  show: boolean;
  text?: string;
}

export interface DayPeriodSummary {
  avgTemp: number;
  maxPrecip: number;
  avgWind: number;
  wmoEmoji: string;
  wmoLabel: string;
}

/**
 * Open-Meteo WMO Weather Code Translator
 */
export function getWeatherDescription(code: number | null): { label: string; emoji: string; color: string } {
  if (code === null) return { label: 'غير متاح', emoji: '❓', color: 'text-slate-400' };
  if (code === 0) return { label: 'صحو تام', emoji: '☀️', color: 'text-amber-400' };
  if (code <= 2) return { label: 'غائم جزئياً', emoji: '⛅', color: 'text-amber-300' };
  if (code === 3) return { label: 'غائم', emoji: '☁️', color: 'text-slate-300' };
  if (code <= 49) return { label: 'ضباب', emoji: '🌫️', color: 'text-slate-400' };
  if (code <= 59) return { label: 'رذاذ خفيف', emoji: '🌦️', color: 'text-blue-300' };
  if (code <= 69) return { label: 'أمطار', emoji: '🌧️', color: 'text-blue-400' };
  if (code <= 79) return { label: 'ثلج', emoji: '❄️', color: 'text-blue-200' };
  if (code <= 82) return { label: 'أمطار غزيرة', emoji: '⛈️', color: 'text-blue-500' };
  if (code <= 99) return { label: 'عاصفة رعدية', emoji: '🌩️', color: 'text-violet-400' };
  return { label: 'غير معروف', emoji: '🌡️', color: 'text-slate-400' };
}

/**
 * Vapor Pressure Deficit (VPD) in kPa
 */
export function calcVPD(tempC: number, rhPct: number): number {
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const ea = (rhPct / 100) * es;
  return Math.round((es - ea) * 100) / 100;
}

/**
 * Spray readiness indicator (مؤشر الرش)
 */
export function calcSprayStatus(wind: number, precipProb: number, vpd: number, heatWarningActive = false): SprayStatus {
  if (wind > 20) {
    return { badge: 'red', message: 'تجنب الرش دلوقتي', reason: 'الرياح شديدة' };
  }
  if (precipProb >= 20) {
    return { badge: 'red', message: 'تجنب الرش دلوقتي', reason: 'المطر جاي' };
  }
  if (wind >= 10) {
    return { badge: 'yellow', message: 'ممكن ترش، بس خد بالك من الرياح' };
  }
  // الجو مناسب للرش — لكن لو تحذير الحر نشط، نوضح التعارض في نفس الجملة
  if (heatWarningActive) {
    return { badge: 'green', message: 'دلوقتي وقت كويس للرش، ولكن تجنب الرش في ساعات الحر كما في التحذير أعلاه' };
  }
  return { badge: 'green', message: 'دلوقتي وقت كويس للرش' };
}

/**
 * Irrigation advice (توصية الري)
 */
export function calcIrrigationAdvice(et0: number, precipProb24h: number): IrrigationAdvice | null {
  if (precipProb24h >= 40) {
    return { icon: '💧', text: 'في مطر قريب، اصبر لو الأرض مش محتاجة مية' };
  }
  if (et0 > 6 && precipProb24h < 20) {
    return { icon: '🌾', text: 'الجو حر وجاف، روي لو الأرض محتاجة' };
  }
  return null;
}

/**
 * Heat warning banner (بانر أمان الحر)
 * Fixed threshold: 38°C apparent temperature
 */
export function calcHeatWarning(hourlyData: HourlyPoint[], currentApparent: number | null): HeatWarning {
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayMiddayPoints = (hourlyData || []).filter((h) => {
    const isToday = h.time.startsWith(todayDateStr);
    const hr = new Date(h.time).getHours();
    return isToday && hr >= 12 && hr <= 15;
  });

  const maxTempInMidday = todayMiddayPoints.length > 0
    ? Math.max(...todayMiddayPoints.map((p) => p.temp))
    : 0;

  if (maxTempInMidday >= 38 || (currentApparent !== null && currentApparent >= 38)) {
    return {
      show: true,
      text: 'الجو حر جدًا النهاردة، تجنب الشغل في الغيط من ١٢ لـ٣ العصر',
    };
  }

  return { show: false };
}

/**
 * Frost warning for frost-sensitive crops
 */
const FROST_SENSITIVE_CROPS = ['طماطم', 'فلفل', 'خيار', 'بطاطس', 'باذنجان', 'كوسة'];

export function calcFrostWarning(minTemp: number | null, cropType?: string): FrostWarning {
  if (!cropType) return { show: false };
  const isSensitive = FROST_SENSITIVE_CROPS.some((c) => cropType.includes(c));
  if (isSensitive && minTemp !== null && minTemp <= 4) {
    return {
      show: true,
      text: 'الجو هيبرد قوي الليلة',
    };
  }
  return { show: false };
}

/**
 * Format Arabic Day Name
 */
export function getArabicDayName(dateStr: string, index: number): string {
  if (index === 0) return 'النهاردة';
  if (index === 1) return 'بكرة';
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'long' }).format(d);
  } catch {
    return dateStr;
  }
}

/**
 * Divide today's hours into 3 periods (الصبح / الضهر / العصر والمغرب)
 */
export function splitDayPeriods(hourlyData: HourlyPoint[]) {
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayHours = (hourlyData || []).filter((h) => h.time.startsWith(todayDateStr));

  const morning = todayHours.filter((h) => {
    const hr = new Date(h.time).getHours();
    return hr >= 6 && hr < 12;
  });

  const midday = todayHours.filter((h) => {
    const hr = new Date(h.time).getHours();
    return hr >= 12 && hr < 16;
  });

  const evening = todayHours.filter((h) => {
    const hr = new Date(h.time).getHours();
    return hr >= 16 && hr <= 20;
  });

  const summarize = (points: HourlyPoint[]): DayPeriodSummary | null => {
    if (points.length === 0) return null;
    const avgTemp = Math.round(points.reduce((acc, p) => acc + p.temp, 0) / points.length);
    const maxPrecip = Math.max(...points.map((p) => p.precip_prob));
    const avgWind = Math.round(points.reduce((acc, p) => acc + p.wind, 0) / points.length);

    // Calculate representative WMO status and accurate label
    let label = 'جو معتدل';
    let emoji = '🌤️';

    if (maxPrecip >= 40) {
      label = `أمطار متوقعة (${maxPrecip}%)`;
      emoji = '🌧️';
    } else if (avgTemp >= 37) {
      label = 'حر شديد';
      emoji = '☀️';
    } else if (avgTemp >= 32) {
      label = 'حرارة مرتفعة';
      emoji = '☀️';
    } else if (avgTemp >= 25) {
      label = 'جو دافئ';
      emoji = '⛅';
    } else {
      label = 'جو معتدل';
      emoji = '🌤️';
    }

    return {
      avgTemp,
      maxPrecip,
      avgWind,
      wmoEmoji: emoji,
      wmoLabel: label,
    };
  };

  return {
    morning: summarize(morning),
    midday: summarize(midday),
    evening: summarize(evening),
  };
}

/**
 * Retrieves weather from cache or fetches fresh from Open-Meteo
 * if cache is missing or contains incomplete hourly data (< 24 hours).
 */
export async function getOrFetchCenterWeather(
  center: { governorate: string; center: string; lat: number; lng: number },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
) {
  try {
    // 1. Try cache first
    const { data: cached } = await supabase
      .from('weather_cache')
      .select('*')
      .eq('latitude', center.lat)
      .eq('longitude', center.lng)
      .maybeSingle();

    // If cache exists and has full 24h per day data (e.g. >= 24 hourly points)
    if (
      cached &&
      Array.isArray(cached.hourly_today) &&
      cached.hourly_today.length >= 24 &&
      Array.isArray(cached.daily_forecast) &&
      cached.daily_forecast.length >= 6
    ) {
      return cached;
    }

    // 2. Fetch fresh 7-day data from Open-Meteo
    const locationName = `${center.governorate} - ${center.center}`;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', center.lat.toString());
    url.searchParams.set('longitude', center.lng.toString());
    url.searchParams.set('current', [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'weather_code',
      'wind_speed_10m',
      'precipitation',
      'dew_point_2m',
    ].join(','));
    url.searchParams.set('hourly', [
      'temperature_2m',
      'wind_speed_10m',
      'precipitation_probability',
      'weather_code',
    ].join(','));
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

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return cached || null;
    }

    const data = await res.json();
    const current = data.current;
    const hourly  = data.hourly;
    const daily   = data.daily;

    // All 24 hours per day for all 7 days (168 hours total)
    const hourlyPoints: HourlyPoint[] = (hourly.time as string[]).map((t: string, i: number) => ({
      time: t,
      temp: hourly.temperature_2m[i] as number,
      wind: hourly.wind_speed_10m[i] as number,
      precip_prob: (hourly.precipitation_probability[i] as number) ?? 0,
      wmo: hourly.weather_code?.[i] as number | undefined,
    }));

    // 7-day forecast array
    const dailyForecast: DayForecast[] = (daily.time as string[]).slice(0, 7).map((date: string, i: number) => ({
      date,
      wmo: daily.weather_code[i] as number,
      temp_max: daily.temperature_2m_max[i] as number,
      temp_min: daily.temperature_2m_min[i] as number,
      precip_prob: (daily.precipitation_probability_max[i] as number) ?? 0,
    }));

    const freshRecord = {
      location_name: locationName,
      latitude: center.lat,
      longitude: center.lng,
      temperature_2m: current.temperature_2m,
      relative_humidity_2m: current.relative_humidity_2m,
      apparent_temperature: current.apparent_temperature,
      weather_code: current.weather_code,
      wind_speed_10m: current.wind_speed_10m,
      precipitation: current.precipitation,
      dew_point_2m: current.dew_point_2m,
      et0_fao_evapotranspiration: daily.et0_fao_evapotranspiration[0],
      sunrise: daily.sunrise[0],
      sunset: daily.sunset[0],
      daily_forecast: dailyForecast,
      hourly_today: hourlyPoints,
      fetched_at: new Date().toISOString(),
    };

    // Upsert into cache asynchronously
    supabase
      .from('weather_cache')
      .upsert(
        {
          ...freshRecord,
          raw_data: data,
        },
        { onConflict: 'latitude,longitude' }
      )
      .then();

    return freshRecord;
  } catch (err) {
    console.error('Failed to fetch weather in getOrFetchCenterWeather:', err);
    return null;
  }
}
