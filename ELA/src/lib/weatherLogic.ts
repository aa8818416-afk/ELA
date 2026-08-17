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
 * Determines if a given hour or date string is daytime.
 * Accurately extracts the hour (0-23) in Egypt/local time.
 * If sunrise/sunset are provided, it extracts their time-of-day (hour:minute)
 * so that both today and future dates are evaluated correctly by their time-of-day.
 */
export function isDaytime(hourOrDate?: number | string | Date, sunrise?: string | null, sunset?: string | null): boolean {
  let targetHour: number;
  let targetMinute = 0;

  if (typeof hourOrDate === 'number') {
    targetHour = hourOrDate;
  } else if (typeof hourOrDate === 'string' || hourOrDate instanceof Date) {
    const d = new Date(hourOrDate);
    targetHour = d.getHours();
    targetMinute = d.getMinutes();
  } else {
    const now = new Date();
    targetHour = now.getHours();
    targetMinute = now.getMinutes();
  }

  if (sunrise && sunset) {
    const sr = new Date(sunrise);
    const ss = new Date(sunset);
    if (!isNaN(sr.getTime()) && !isNaN(ss.getTime())) {
      const srMinutes = sr.getHours() * 60 + sr.getMinutes();
      const ssMinutes = ss.getHours() * 60 + ss.getMinutes();
      const currentMinutes = targetHour * 60 + targetMinute;
      return currentMinutes >= srMinutes && currentMinutes < ssMinutes;
    }
  }

  return targetHour >= 6 && targetHour < 19;
}

export type WeatherIconType =
  | 'clear'
  | 'mostly_clear'
  | 'partly_cloudy'
  | 'overcast'
  | 'fog'
  | 'rime_fog'
  | 'drizzle_light'
  | 'drizzle_moderate'
  | 'drizzle_dense'
  | 'freezing_drizzle'
  | 'rain_light'
  | 'rain_moderate'
  | 'rain_heavy'
  | 'freezing_rain'
  | 'snow_light'
  | 'snow_moderate'
  | 'snow_heavy'
  | 'snow_grains'
  | 'rain_showers_light'
  | 'rain_showers_moderate'
  | 'rain_showers_heavy'
  | 'snow_showers'
  | 'thunderstorm'
  | 'thunderstorm_hail'
  | 'unknown';

export interface WeatherConditionDetails {
  label: string;
  emoji: string;
  color: string;
  iconType: WeatherIconType;
  isDay: boolean;
}

/**
 * Open-Meteo WMO Weather Code Translator (Comprehensive 28 codes with Google Weather accuracy)
 */
export function getWeatherDescription(
  code: number | null,
  isDay: boolean = true
): WeatherConditionDetails {
  if (code === null || code === undefined) {
    return { label: 'غير متاح', emoji: '❓', color: 'text-slate-400', iconType: 'unknown', isDay };
  }

  // WMO 0: Clear Sky
  if (code === 0) {
    return isDay
      ? { label: 'صحو تام', emoji: '☀️', color: 'text-amber-500', iconType: 'clear', isDay }
      : { label: 'صافٍ ليلاً', emoji: '🌙', color: 'text-indigo-300', iconType: 'clear', isDay };
  }

  // WMO 1: Mainly Clear
  if (code === 1) {
    return isDay
      ? { label: 'مشمس غالباً', emoji: '🌤️', color: 'text-amber-400', iconType: 'mostly_clear', isDay }
      : { label: 'صافٍ غالباً', emoji: '✨', color: 'text-indigo-200', iconType: 'mostly_clear', isDay };
  }

  // WMO 2: Partly Cloudy
  if (code === 2) {
    return isDay
      ? { label: 'غائم جزئياً', emoji: '⛅', color: 'text-amber-300', iconType: 'partly_cloudy', isDay }
      : { label: 'غائم جزئياً ليلاً', emoji: '☁️🌙', color: 'text-slate-300', iconType: 'partly_cloudy', isDay };
  }

  // WMO 3: Overcast
  if (code === 3) {
    return { label: 'غائم كلياً', emoji: '☁️', color: 'text-slate-400', iconType: 'overcast', isDay };
  }

  // WMO 45: Fog
  if (code === 45) {
    return { label: 'ضباب', emoji: '🌫️', color: 'text-slate-400', iconType: 'fog', isDay };
  }

  // WMO 48: Depositing Rime Fog
  if (code === 48) {
    return { label: 'ضباب جليدي وشبورة', emoji: '🌫️❄️', color: 'text-slate-400', iconType: 'rime_fog', isDay };
  }

  // WMO 51: Light Drizzle
  if (code === 51) {
    return { label: 'رذاذ خفيف', emoji: isDay ? '🌦️' : '🌧️', color: 'text-blue-300', iconType: 'drizzle_light', isDay };
  }

  // WMO 53: Moderate Drizzle
  if (code === 53) {
    return { label: 'رذاذ معتدل', emoji: '🌧️', color: 'text-blue-300', iconType: 'drizzle_moderate', isDay };
  }

  // WMO 55: Dense Drizzle
  if (code === 55) {
    return { label: 'رذاذ كثيف', emoji: '🌧️', color: 'text-blue-400', iconType: 'drizzle_dense', isDay };
  }

  // WMO 56, 57: Freezing Drizzle
  if (code === 56 || code === 57) {
    return { label: 'رذاذ متجمد', emoji: '🌨️', color: 'text-blue-200', iconType: 'freezing_drizzle', isDay };
  }

  // WMO 61: Slight Rain
  if (code === 61) {
    return { label: 'أمطار خفيفة', emoji: isDay ? '🌦️' : '🌧️', color: 'text-blue-400', iconType: 'rain_light', isDay };
  }

  // WMO 63: Moderate Rain
  if (code === 63) {
    return { label: 'أمطار معتدلة', emoji: '🌧️', color: 'text-blue-500', iconType: 'rain_moderate', isDay };
  }

  // WMO 65: Heavy Rain
  if (code === 65) {
    return { label: 'أمطار غزيرة', emoji: '🌧️🌧️', color: 'text-blue-600', iconType: 'rain_heavy', isDay };
  }

  // WMO 66, 67: Freezing Rain
  if (code === 66 || code === 67) {
    return { label: 'أمطار متجمدة', emoji: '🌨️', color: 'text-cyan-300', iconType: 'freezing_rain', isDay };
  }

  // WMO 71: Slight Snow
  if (code === 71) {
    return { label: 'تساقط ثلوج خفيف', emoji: '❄️', color: 'text-blue-200', iconType: 'snow_light', isDay };
  }

  // WMO 73: Moderate Snow
  if (code === 73) {
    return { label: 'تساقط ثلوج معتدل', emoji: '❄️', color: 'text-blue-200', iconType: 'snow_moderate', isDay };
  }

  // WMO 75: Heavy Snow
  if (code === 75) {
    return { label: 'تساقط ثلوج كثيف', emoji: '❄️❄️', color: 'text-blue-100', iconType: 'snow_heavy', isDay };
  }

  // WMO 77: Snow Grains
  if (code === 77) {
    return { label: 'حبيبات ثلجية', emoji: '🌨️', color: 'text-blue-200', iconType: 'snow_grains', isDay };
  }

  // WMO 80: Slight Rain Showers
  if (code === 80) {
    return { label: 'زخات مطر خفيفة', emoji: isDay ? '🌦️' : '🌧️', color: 'text-blue-400', iconType: 'rain_showers_light', isDay };
  }

  // WMO 81: Moderate Rain Showers
  if (code === 81) {
    return { label: 'زخات مطر متوسطة', emoji: '🌧️', color: 'text-blue-500', iconType: 'rain_showers_moderate', isDay };
  }

  // WMO 82: Violent Rain Showers
  if (code === 82) {
    return { label: 'زخات مطر غزيرة جداً', emoji: '⛈️', color: 'text-blue-600', iconType: 'rain_showers_heavy', isDay };
  }

  // WMO 85, 86: Snow Showers
  if (code === 85 || code === 86) {
    return { label: 'زخات ثلجية', emoji: '🌨️', color: 'text-blue-200', iconType: 'snow_showers', isDay };
  }

  // WMO 95: Thunderstorm
  if (code === 95) {
    return { label: 'عاصفة رعدية', emoji: '🌩️', color: 'text-violet-400', iconType: 'thunderstorm', isDay };
  }

  // WMO 96, 99: Thunderstorm with Hail
  if (code === 96 || code === 99) {
    return { label: 'عاصفة رعدية وبَرَد', emoji: '⛈️⚡', color: 'text-violet-500', iconType: 'thunderstorm_hail', isDay };
  }

  return { label: 'معتدل', emoji: '🌤️', color: 'text-slate-400', iconType: 'clear', isDay };
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
 * Returns null at nighttime (21:00–05:59) → card hidden entirely.
 * Wind & rain checks are top priority regardless of time.
 * @param currentHour - hour of day (0-23) in local time. Defaults to current hour.
 */
export function calcSprayStatus(
  wind: number,
  precipProb: number,
  vpd: number,
  heatWarningActive = false,
  currentHour?: number,
): SprayStatus | null {
  const hour = currentHour ?? new Date().getHours();

  // ① الليل (9 مساءً → 5 الفجر): الكارد بيختفي خالص
  if (hour >= 21 || hour < 6) {
    return null;
  }

  // ② الرياح والمطر — أعلى أولوية (تتغلب على الوقت)
  if (wind > 20) {
    return { badge: 'red', message: 'تجنب الرش دلوقتي', reason: 'الرياح شديدة' };
  }
  if (precipProb >= 20) {
    return { badge: 'red', message: 'تجنب الرش دلوقتي', reason: 'المطر جاي' };
  }
  if (wind >= 10) {
    return { badge: 'yellow', message: 'ممكن ترش، بس خد بالك من الرياح' };
  }

  // ③ ساعات الحر الشديد (11 الصبح → 4 العصر): تجنب الرش
  if (hour >= 11 && hour < 16) {
    return { badge: 'red', message: 'تجنب الرش في الحر', reason: 'المبيد بيتبخر وبيأذي النبات' };
  }

  // ④ قرب الليل (7 → 9 مساءً): رطوبة عالية
  if (hour >= 19) {
    return { badge: 'red', message: 'قرب من الليل، الرطوبة هترتفع وتضر الزرع' };
  }

  // ⑤ الأوقات الكويسة — لو تحذير الحر نشط، نوضح التعارض
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
 * 1-Hour Cache Time To Live (TTL) in milliseconds.
 * Prevents redundant external Open-Meteo API requests and guarantees
 * fresh updates every hour while safely staying well within free quota limits.
 */
const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 Hour

/**
 * Retrieves weather from cache or fetches fresh from Open-Meteo
 * if cache is missing, expired (> 1 hour old), or contains incomplete data.
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

    // Check if cache exists, is complete, and is less than 1 hour old
    const isCacheFresh =
      cached &&
      cached.fetched_at &&
      Date.now() - new Date(cached.fetched_at).getTime() < WEATHER_CACHE_TTL_MS;

    if (
      isCacheFresh &&
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
      'is_day',
    ].join(','));
    url.searchParams.set('hourly', [
      'temperature_2m',
      'wind_speed_10m',
      'precipitation_probability',
      'weather_code',
      'is_day',
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
