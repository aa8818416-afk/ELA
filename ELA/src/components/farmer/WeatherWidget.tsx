import Link from 'next/link';
import { Wind, Droplets, Thermometer, ShieldAlert, ArrowLeft, ChevronLeft } from 'lucide-react';
import {
  calcVPD,
  calcSprayStatus,
  calcIrrigationAdvice,
  calcHeatWarning,
  calcFrostWarning,
  getWeatherDescription,
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

function getHourIcon(hour: number, wmo?: number): string {
  if (wmo !== undefined) return getWeatherDescription(wmo).emoji;
  if (hour >= 5 && hour < 7)   return '🌅';
  if (hour >= 7 && hour < 18)  return '☀️';
  if (hour >= 18 && hour < 20) return '🌇';
  return '🌙';
}

export default function WeatherWidget({ weather, cropType, latestAlert }: WeatherWidgetProps) {
  if (!weather) {
    return (
      <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-3xl p-6 text-center">
        <p className="text-slate-500 text-sm">🌡️ بيانات الطقس غير متاحة حالياً</p>
      </div>
    );
  }

  const temp     = weather.temperature_2m      !== null ? Math.round(weather.temperature_2m)      : null;
  const rh       = weather.relative_humidity_2m !== null ? Math.round(weather.relative_humidity_2m) : 50;
  const wind     = weather.wind_speed_10m       !== null ? Math.round(weather.wind_speed_10m)       : 0;
  const apparent = weather.apparent_temperature !== null ? Math.round(weather.apparent_temperature) : temp;
  const dewPoint = weather.dew_point_2m         !== null ? Math.round(weather.dew_point_2m)         : null;
  const et0      = weather.et0_fao_evapotranspiration !== null
    ? Number(weather.et0_fao_evapotranspiration) : 0;

  const todayForecast = weather.daily_forecast?.[0];
  const precipProb24h = todayForecast ? todayForecast.precip_prob : (weather.precipitation && weather.precipitation > 0 ? 50 : 0);

  const vpd        = temp !== null ? calcVPD(temp, rh) : 1.0;
  const heatWarn   = calcHeatWarning(weather.hourly_today, weather.apparent_temperature);
  const spray      = calcSprayStatus(wind, precipProb24h, vpd, heatWarn.show);
  const irriAdvice = calcIrrigationAdvice(et0, precipProb24h);
  const frostWarn  = calcFrostWarning(todayForecast ? todayForecast.temp_min : null, cropType);
  const condition  = getWeatherDescription(weather.weather_code);

  const now         = new Date();
  const currentHour = now.getHours();
  const hourlyList  = weather.hourly_today || [];

  return (
    <div className="space-y-3.5">
      {/* ── 1. Hero Weather Card ── */}
      <div className="bg-gradient-to-br from-sky-900/40 via-slate-900/60 to-slate-950/80 backdrop-blur-md border border-sky-400/10 rounded-3xl p-5 relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 truncate max-w-[70%]">
            <span className="text-sm">📍</span>
            <p className="text-slate-200 text-sm font-bold truncate">
              {weather.location_name}
            </p>
          </div>
          <Link
            href="/farmer/weather"
            className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5 font-medium transition-colors"
          >
            التفاصيل <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Temp & Status */}
        <div className="flex items-end justify-between my-3">
          <div className="flex items-end gap-3">
            <span className="text-6xl font-bold text-white tabular-nums leading-none">
              {temp !== null ? temp : '--'}°
            </span>
            <div className="pb-1">
              <span className="text-3xl block leading-none mb-1">{condition.emoji}</span>
              <p className={`text-xs font-semibold ${condition.color}`}>{condition.label}</p>
            </div>
          </div>
          <div className="text-left text-xs text-slate-400 pb-1">
            <p>يبان زي {apparent}°</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              ↑{todayForecast ? Math.round(todayForecast.temp_max) : '--'}° ↓{todayForecast ? Math.round(todayForecast.temp_min) : '--'}°
            </p>
          </div>
        </div>

        {/* Quick Chips */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/[0.06]">
          <div className="bg-white/[0.04] rounded-2xl p-2 text-center">
            <Droplets className="w-3.5 h-3.5 text-blue-400 mx-auto mb-0.5" />
            <span className="text-slate-200 text-xs font-semibold block">{rh}%</span>
            <span className="text-slate-500 text-[10px]">رطوبة</span>
          </div>
          <div className="bg-white/[0.04] rounded-2xl p-2 text-center">
            <Wind className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-0.5" />
            <span className="text-slate-200 text-xs font-semibold block">{wind}</span>
            <span className="text-slate-500 text-[10px]">كم/س</span>
          </div>
          <div className="bg-white/[0.04] rounded-2xl p-2 text-center">
            <span className="text-xs block mb-0.5">🌧️</span>
            <span className="text-slate-200 text-xs font-semibold block">{precipProb24h}%</span>
            <span className="text-slate-500 text-[10px]">مطر</span>
          </div>
          <div className="bg-white/[0.04] rounded-2xl p-2 text-center">
            <Thermometer className="w-3.5 h-3.5 text-orange-400 mx-auto mb-0.5" />
            <span className="text-slate-200 text-xs font-semibold block">{dewPoint !== null ? `${dewPoint}°` : '--'}</span>
            <span className="text-slate-500 text-[10px]">ندى</span>
          </div>
        </div>
      </div>

      {/* ── 2. Agricultural Recommendations (Prominent) ── */}
      <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.06] rounded-3xl p-4 space-y-2.5">
        <div className="flex items-center justify-between pb-1 border-b border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🌾</span>
            <h3 className="text-white font-bold text-xs">التوصيات الزراعية</h3>
          </div>
          <Link
            href="/farmer/weather"
            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5"
          >
            عرض الكل <ArrowLeft className="w-3 h-3" />
          </Link>
        </div>

        {/* Heat Alert */}
        {heatWarn.show && (
          <div className="bg-gradient-to-l from-red-950/70 to-amber-950/70 border border-red-400/20 rounded-2xl p-3 flex items-start gap-2.5">
            <span className="text-xl flex-shrink-0">🥵</span>
            <p className="text-red-200 text-xs font-medium leading-relaxed">{heatWarn.text}</p>
          </div>
        )}

        {/* Latest Alert */}
        {latestAlert && (
          <Link
            href="/farmer/agenda"
            className="flex items-center justify-between bg-amber-500/[0.08] border border-amber-400/20 hover:bg-amber-500/[0.14] rounded-2xl px-3.5 py-2.5 transition-colors group"
          >
            <div className="flex items-center gap-2 truncate">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-[11px] font-medium truncate">
                ⚠️ {latestAlert.advice_text_snapshot.slice(0, 36)}...
              </p>
            </div>
            <ArrowLeft className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Spray Status */}
        <div className={`rounded-2xl p-3 flex items-start gap-2.5 border ${
          spray.badge === 'green'
            ? 'bg-emerald-950/50 border-emerald-500/20'
            : spray.badge === 'yellow'
            ? 'bg-amber-950/50 border-amber-500/20'
            : 'bg-red-950/50 border-red-500/20'
        }`}>
          <span className="text-xl flex-shrink-0">
            {spray.badge === 'green' ? '✅' : spray.badge === 'yellow' ? '⚠️' : '🚫'}
          </span>
          <div>
            <p className={`font-bold text-xs ${
              spray.badge === 'green'
                ? 'text-emerald-300'
                : spray.badge === 'yellow'
                ? 'text-amber-300'
                : 'text-red-300'
            }`}>
              {spray.message}
            </p>
            {spray.reason && (
              <p className="text-slate-400 text-[10px] mt-0.5">{spray.reason}</p>
            )}
          </div>
        </div>

        {/* Irrigation Advice */}
        {irriAdvice && (
          <div className="bg-sky-950/50 border border-sky-500/20 rounded-2xl p-3 flex items-start gap-2.5">
            <span className="text-xl flex-shrink-0">{irriAdvice.icon}</span>
            <p className="text-sky-200/90 text-xs font-medium leading-relaxed">{irriAdvice.text}</p>
          </div>
        )}

        {/* Frost Warning */}
        {frostWarn.show && (
          <div className="bg-blue-950/50 border border-blue-400/20 rounded-2xl p-3 flex items-start gap-2.5">
            <span className="text-xl flex-shrink-0">❄️</span>
            <p className="text-blue-200 text-xs font-medium leading-relaxed">{frostWarn.text}</p>
          </div>
        )}
      </div>

      {/* ── 3. 24-Hour Preview Row ── */}
      {hourlyList.length > 0 && (
        <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.06] rounded-3xl p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-slate-400 text-[11px] font-medium flex items-center gap-1">
              <span>🕐</span> طقس الساعات القادمة
            </span>
            <Link
              href="/farmer/weather"
              className="text-[10px] text-sky-400 hover:underline"
            >
              24 ساعة كاملة ←
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
            {hourlyList.map(h => {
              const hour          = new Date(h.time).getHours();
              const isCurrentHour = hour === currentHour;
              const isPast        = hour < currentHour;

              return (
                <div
                  key={h.time}
                  className={`flex-shrink-0 snap-start rounded-2xl p-2 w-[54px] text-center flex flex-col items-center gap-1 transition-all ${
                    isCurrentHour
                      ? 'bg-white shadow-md shadow-white/10 scale-[1.04]'
                      : isPast
                      ? 'bg-white/[0.03] border border-white/[0.04] opacity-30'
                      : 'bg-white/[0.05] border border-white/[0.07]'
                  }`}
                >
                  <span className={`text-[10px] font-medium ${
                    isCurrentHour ? 'text-slate-600' : 'text-slate-400'
                  }`}>
                    {isCurrentHour ? 'الآن' : `${hour}:00`}
                  </span>
                  <span className="text-sm leading-none">
                    {getHourIcon(hour, h.wmo)}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${
                    isCurrentHour ? 'text-slate-900' : 'text-slate-200'
                  }`}>
                    {Math.round(h.temp)}°
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
