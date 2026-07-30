import Link from 'next/link';
import { Wind, Droplets, Thermometer, ShieldAlert, ArrowLeft } from 'lucide-react';
import {
  calcVPD,
  calcSprayStatus,
  calcIrrigationAdvice,
  calcHeatWarning,
  calcFrostWarning,
  getWeatherDescription,
  getArabicDayName,
  splitDayPeriods,
  HourlyPoint,
  DayForecast,
} from '@/lib/weatherLogic';

export interface WeatherCacheData {
  location_name: string;
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  wind_speed_10m: number | null;
  weather_code: number | null;
  apparent_temperature: number | null;
  precipitation: number | null;
  dew_point_2m: number | null;
  et0_fao_evapotranspiration: number | null;
  daily_forecast: DayForecast[];
  hourly_today: HourlyPoint[];
  sunrise: string | null;
  sunset: string | null;
  fetched_at: string;
}

export interface LatestAlertSummary {
  id: string;
  advice_text_snapshot: string;
}

interface WeatherWidgetProps {
  weather: WeatherCacheData | null;
  cropType?: string;
  latestAlert?: LatestAlertSummary | null;
}

function formatTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

export default function WeatherWidget({ weather, cropType, latestAlert }: WeatherWidgetProps) {
  if (!weather) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 text-center">
        <p className="text-slate-500 text-sm">🌡️ بيانات الطقس غير متاحة حالياً</p>
      </div>
    );
  }

  const temp = weather.temperature_2m !== null ? Math.round(weather.temperature_2m) : null;
  const rh = weather.relative_humidity_2m !== null ? Math.round(weather.relative_humidity_2m) : 50;
  const wind = weather.wind_speed_10m !== null ? Math.round(weather.wind_speed_10m) : 0;
  const apparent = weather.apparent_temperature !== null ? Math.round(weather.apparent_temperature) : temp;
  const et0 = weather.et0_fao_evapotranspiration !== null ? Number(weather.et0_fao_evapotranspiration) : 0;

  // Forecast precip probability for today / next 24h
  const todayForecast = weather.daily_forecast?.[0];
  const precipProb24h = todayForecast ? todayForecast.precip_prob : (weather.precipitation && weather.precipitation > 0 ? 50 : 0);

  // VPD & Spray Status
  const vpd = temp !== null ? calcVPD(temp, rh) : 1.0;
  const spray = calcSprayStatus(wind, precipProb24h, vpd);

  // Banners logic
  const heatWarn = calcHeatWarning(weather.hourly_today, weather.apparent_temperature);
  const irriAdvice = calcIrrigationAdvice(et0, precipProb24h);
  const frostWarn = calcFrostWarning(todayForecast ? todayForecast.temp_min : null, cropType);

  // Periods logic
  const periods = splitDayPeriods(weather.hourly_today);
  const condition = getWeatherDescription(weather.weather_code);

  return (
    <div className="space-y-4">
      {/* 1. (و) بانر أمان العمل في الحر - أعلى أولوية */}
      {heatWarn.show && (
        <div className="bg-gradient-to-r from-red-600 to-amber-600 border border-red-400/40 rounded-3xl p-4 text-white shadow-lg flex items-center gap-3 animate-pulse">
          <span className="text-3xl">🥵</span>
          <div>
            <h4 className="font-bold text-sm">تحذير من الإجهاد الحراري</h4>
            <p className="text-xs text-red-100 font-medium leading-relaxed mt-0.5">{heatWarn.text}</p>
          </div>
        </div>
      )}

      {/* 2. (ز) سطر الربط بالتنبيه المفتوح */}
      {latestAlert && (
        <Link
          href="/farmer/agenda"
          className="block bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 rounded-2xl px-4 py-3 text-amber-300 text-xs font-medium flex items-center justify-between transition-colors group"
        >
          <div className="flex items-center gap-2 truncate max-w-[85%]">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="truncate">
              ⚠️ في تحديث جديد بخصوص {latestAlert.advice_text_snapshot.slice(0, 35)}...
            </span>
          </div>
          <span className="text-[11px] text-amber-400 underline flex items-center gap-1 group-hover:translate-x-[-2px] transition-transform">
            الأجندة <ArrowLeft className="w-3 h-3" />
          </span>
        </Link>
      )}

      {/* 3. (ج) توصية الري */}
      {irriAdvice && (
        <div className="bg-sky-950/60 border border-sky-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{irriAdvice.icon}</span>
          <p className="text-sky-200 text-xs font-medium leading-relaxed">{irriAdvice.text}</p>
        </div>
      )}

      {/* 4. (ب) شارة مناسب للرش؟ */}
      <div
        className={`rounded-2xl px-4 py-3 flex items-center justify-between border ${
          spray.badge === 'green'
            ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
            : spray.badge === 'yellow'
            ? 'bg-amber-950/50 border-amber-500/30 text-amber-300'
            : 'bg-red-950/50 border-red-500/30 text-red-300'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">
            {spray.badge === 'green' ? '🟢' : spray.badge === 'yellow' ? '🟡' : '🔴'}
          </span>
          <span className="text-xs font-bold">{spray.message}</span>
        </div>
        {spray.reason && (
          <span className="text-[10px] bg-slate-900/60 px-2.5 py-1 rounded-full border border-slate-700/50">
            {spray.reason}
          </span>
        )}
      </div>

      {/* 5. (أ) بطاقة الطقس الآن الرئيسية */}
      <div className="bg-gradient-to-br from-sky-950/70 via-slate-900/80 to-slate-900/60 border border-sky-500/20 rounded-3xl p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-slate-400 text-xs mb-0.5">الطقس الآن</p>
            <p className="text-slate-200 text-sm font-bold truncate max-w-[200px]">
              📍 {weather.location_name}
            </p>
          </div>
          <div className="text-slate-500 text-[11px]">
            آخر تحديث {formatTime(weather.fetched_at)}
          </div>
        </div>

        {/* Main Temp & Condition */}
        <div className="flex items-end gap-4 mb-5">
          <div className="flex items-end gap-1.5">
            <span className="text-5xl font-bold tabular-nums leading-none text-amber-400">
              {temp !== null ? temp : '--'}
            </span>
            <span className="text-slate-400 text-xl mb-1">°م</span>
          </div>
          <div className="mb-1">
            <span className="text-3xl">{condition.emoji}</span>
            <p className={`text-xs font-medium mt-0.5 ${condition.color}`}>{condition.label}</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-1">
            <Thermometer className="w-4 h-4 text-orange-400" />
            <span className="text-slate-200 text-xs font-medium">{apparent}°</span>
            <span className="text-slate-500 text-[10px]">الإحساس</span>
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-1">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span className="text-slate-200 text-xs font-medium">{rh}%</span>
            <span className="text-slate-500 text-[10px]">الرطوبة</span>
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-1">
            <Wind className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-200 text-xs font-medium">{wind}</span>
            <span className="text-slate-500 text-[10px]">كم/س رياح</span>
          </div>
        </div>

        {/* (ح) تحذير البرودة الشديدة / الصقيع */}
        {frostWarn.show && (
          <div className="mt-3 bg-blue-500/10 border border-blue-500/30 rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
            <span className="text-base">❄️</span>
            <p className="text-blue-300 text-xs font-medium">{frostWarn.text}</p>
          </div>
        )}
      </div>

      {/* 6. (هـ) تفصيل فترات اليوم (3 فترات بس) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4">
        <p className="text-slate-400 text-xs font-medium mb-3">تفاصيل اليوم</p>
        <div className="grid grid-cols-3 gap-2">
          {/* الصبح */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[90px]">
            <span className="text-xs text-slate-400 font-medium">🌅 الصبح</span>
            <div className="my-1">
              <span className="text-lg font-bold text-slate-200">
                {periods.morning ? `${periods.morning.avgTemp}°` : '--'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {periods.morning?.maxPrecip && periods.morning.maxPrecip >= 20
                ? `🌧️ ${periods.morning.maxPrecip}%`
                : periods.morning?.wmoLabel || 'جو مناسب'}
            </span>
          </div>

          {/* الضهر */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[90px]">
            <span className="text-xs text-slate-400 font-medium">☀️ الضهر</span>
            <div className="my-1">
              <span className="text-lg font-bold text-slate-200">
                {periods.midday ? `${periods.midday.avgTemp}°` : '--'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {periods.midday?.maxPrecip && periods.midday.maxPrecip >= 20
                ? `🌧️ ${periods.midday.maxPrecip}%`
                : 'أوج الحرارة'}
            </span>
          </div>

          {/* العصر / المغرب */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[90px]">
            <span className="text-xs text-slate-400 font-medium">🌇 العصر</span>
            <div className="my-1">
              <span className="text-lg font-bold text-slate-200">
                {periods.evening ? `${periods.evening.avgTemp}°` : '--'}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              {periods.evening?.maxPrecip && periods.evening.maxPrecip >= 20
                ? `🌧️ ${periods.evening.maxPrecip}%`
                : 'لطيف'}
            </span>
          </div>
        </div>
      </div>

      {/* 7. (د) توقعات 5 أيام - Scroll جانبي */}
      {weather.daily_forecast && weather.daily_forecast.length > 1 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4">
          <p className="text-slate-400 text-xs font-medium mb-3">توقعات الأيام القادمة</p>
          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none snap-x">
            {weather.daily_forecast.slice(1, 6).map((day, idx) => {
              const dayDesc = getWeatherDescription(day.wmo);
              const dayName = getArabicDayName(day.date, idx + 1);

              return (
                <div
                  key={day.date}
                  className="flex-shrink-0 snap-start bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 w-24 text-center flex flex-col items-center justify-between space-y-2"
                >
                  <span className="text-xs font-bold text-slate-300">{dayName}</span>
                  <span className="text-2xl">{dayDesc.emoji}</span>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-bold text-amber-400">{Math.round(day.temp_max)}°</span>
                    <span className="text-slate-500">/</span>
                    <span className="text-slate-400 text-[11px]">{Math.round(day.temp_min)}°</span>
                  </div>
                  {/* عرض نسبة المطر فقط إذا كانت أعلى من 20% */}
                  {day.precip_prob >= 20 ? (
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                      💧 {day.precip_prob}%
                    </span>
                  ) : (
                    <span className="h-4 text-[10px] text-slate-600">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
