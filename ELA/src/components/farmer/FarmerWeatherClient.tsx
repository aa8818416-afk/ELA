'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Wind,
  Droplets,
  Thermometer,
  ShieldAlert,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import {
  calcVPD,
  calcSprayStatus,
  calcIrrigationAdvice,
  calcHeatWarning,
  calcFrostWarning,
  getWeatherDescription,
  getArabicDayName,
  HourlyPoint,
  DayForecast,
} from '@/lib/weatherLogic';

/* ─── Types ─── */
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

interface FarmerWeatherClientProps {
  weather: WeatherCacheData | null;
  cropType?: string;
  latestAlert?: LatestAlertSummary | null;
}

/* ─── Helpers ─── */
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

/* ─── Sunrise / Sunset SVG Arc ─── */
function SunArc({ sunrise, sunset }: { sunrise: string | null; sunset: string | null }) {
  if (!sunrise || !sunset) return null;

  const now  = Date.now();
  const sr   = new Date(sunrise).getTime();
  const ss   = new Date(sunset).getTime();
  const prog = Math.max(0, Math.min(1, (now - sr) / (ss - sr)));

  const W = 260, H = 64, cx = W / 2, cy = H, r = H - 6;
  const angle = Math.PI * (1 - prog);
  const sunX  = +(cx - r * Math.cos(angle)).toFixed(2);
  const sunY  = +(cy - r * Math.sin(angle)).toFixed(2);
  const la    = prog > 0.5 ? 1 : 0;
  const pPath = prog > 0.01
    ? `M ${cx - r} ${cy} A ${r} ${r} 0 ${la} 1 ${sunX} ${sunY}`
    : '';

  return (
    <div className="px-5 pb-4">
      <svg viewBox={`0 0 ${W} ${H + 10}`} className="w-full h-[72px]">
        <defs>
          <linearGradient id="sgr" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#f97316" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        {/* background dashed arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1.5"
          strokeDasharray="4 7"
        />
        {/* progress arc */}
        {pPath && (
          <path
            d={pPath}
            fill="none"
            stroke="url(#sgr)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        )}
        {/* sun glow + circle */}
        <circle cx={sunX} cy={sunY} r={10} fill="rgba(251,191,36,0.15)" />
        <circle cx={sunX} cy={sunY} r={6}  fill="#fbbf24" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-500 -mt-1">
        <span>🌅 {formatTime(sunrise)}</span>
        <span>{formatTime(sunset)} 🌇</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════ */
export default function FarmerWeatherClient({
  weather,
  cropType,
  latestAlert,
}: FarmerWeatherClientProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const hourScrollRef  = useRef<HTMLDivElement>(null);
  const currentHourRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll hourly row to current hour */
  useEffect(() => {
    const t = setTimeout(() => {
      if (currentHourRef.current && hourScrollRef.current) {
        const el        = currentHourRef.current;
        const container = hourScrollRef.current;
        const offset    = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
        container.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
      }
    }, 120);
    return () => clearTimeout(t);
  }, [selectedDayIndex]);

  /* ── Empty state ── */
  if (!weather) {
    return (
      <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.08] rounded-3xl p-8 text-center space-y-3">
        <span className="text-4xl">🌤️</span>
        <h3 className="text-white font-bold text-lg">بيانات الطقس غير متاحة حالياً</h3>
        <p className="text-slate-400 text-sm">سيتم تحديث البيانات تلقائياً فور توفرها.</p>
      </div>
    );
  }

  /* ── Derived values ── */
  const dailyList = weather.daily_forecast || [];
  const activeDay = dailyList[selectedDayIndex] || dailyList[0];

  const temp     = weather.temperature_2m      !== null ? Math.round(weather.temperature_2m)      : null;
  const rh       = weather.relative_humidity_2m !== null ? Math.round(weather.relative_humidity_2m) : 50;
  const wind     = weather.wind_speed_10m       !== null ? Math.round(weather.wind_speed_10m)       : 0;
  const apparent = weather.apparent_temperature !== null ? Math.round(weather.apparent_temperature) : temp;
  const dewPoint = weather.dew_point_2m         !== null ? Math.round(weather.dew_point_2m)         : null;
  const et0      = weather.et0_fao_evapotranspiration !== null
    ? Number(weather.et0_fao_evapotranspiration) : 0;

  const todayForecast = dailyList[0];
  const precipProb24h = todayForecast ? todayForecast.precip_prob : 0;
  const vpd           = temp !== null ? calcVPD(temp, rh) : 1.0;
  const heatWarn      = calcHeatWarning(weather.hourly_today, weather.apparent_temperature);
  const spray         = calcSprayStatus(wind, precipProb24h, vpd, heatWarn.show);
  const irriAdvice    = calcIrrigationAdvice(et0, precipProb24h);
  const frostWarn     = calcFrostWarning(todayForecast ? todayForecast.temp_min : null, cropType);
  const condition     = getWeatherDescription(weather.weather_code);

  /* Hours for selected day */
  const activeDateStr    = activeDay?.date;
  const selectedDayHours = (weather.hourly_today || []).filter(h =>
    !activeDateStr || h.time.startsWith(activeDateStr)
  );

  const now         = new Date();
  const currentHour = now.getHours();

  /* Global min/max for 7-day temperature bar */
  const allTemps  = dailyList.flatMap(d => [d.temp_min, d.temp_max]);
  const globalMin = allTemps.length > 0 ? Math.floor(Math.min(...allTemps)) : 0;
  const globalMax = allTemps.length > 0 ? Math.ceil(Math.max(...allTemps))  : 50;
  const globalRng = Math.max(globalMax - globalMin, 1);

  const hasAgriAlert = heatWarn.show || !!latestAlert || !!irriAdvice || frostWarn.show;

  return (
    <div className="space-y-4 pb-4">

      {/* ════════════════════════════════════
          1 · HERO WEATHER CARD (B-style glass)
          ════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-sky-900/40 via-slate-900/60 to-slate-950/80 backdrop-blur-md border border-sky-400/10 rounded-3xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <p className="text-slate-200 text-sm font-semibold truncate max-w-[60%]">
            📍 {weather.location_name}
          </p>
          <p className="text-slate-500 text-[11px] flex-shrink-0">
            آخر تحديث {formatTime(weather.fetched_at)}
          </p>
        </div>

        {/* Main temperature display */}
        <div className="px-5 pb-3">
          <div className="flex items-end gap-3 mb-1">
            <span className="text-[80px] font-bold text-white tabular-nums leading-none">
              {temp !== null ? temp : '--'}
            </span>
            <span className="text-5xl mb-3">{condition.emoji}</span>
          </div>
          <p className={`text-lg font-bold ${condition.color} mb-0.5`}>{condition.label}</p>
          <p className="text-slate-400 text-sm">
            يبان زي {apparent}°&nbsp;&nbsp;·&nbsp;&nbsp;
            ↑&nbsp;{todayForecast ? Math.round(todayForecast.temp_max) : '--'}°&nbsp;
            ↓&nbsp;{todayForecast ? Math.round(todayForecast.temp_min) : '--'}°
          </p>
        </div>

        {/* Stats chips */}
        <div className="flex gap-2 px-5 pb-5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full px-3 py-1.5">
            <Droplets className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-200 text-xs font-semibold">{rh}%</span>
            <span className="text-slate-500 text-[10px]">رطوبة</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full px-3 py-1.5">
            <Wind className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-200 text-xs font-semibold">{wind}</span>
            <span className="text-slate-500 text-[10px]">كم/س</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full px-3 py-1.5">
            <span className="text-xs">🌧️</span>
            <span className="text-slate-200 text-xs font-semibold">{precipProb24h}%</span>
            <span className="text-slate-500 text-[10px]">مطر</span>
          </div>
          {dewPoint !== null && (
            <div className="flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] rounded-full px-3 py-1.5">
              <Thermometer className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-slate-200 text-xs font-semibold">{dewPoint}°</span>
              <span className="text-slate-500 text-[10px]">ندى</span>
            </div>
          )}
        </div>

        {/* Sunrise / Sunset arc */}
        <SunArc sunrise={weather.sunrise} sunset={weather.sunset} />
      </div>

      {/* ════════════════════════════════════
          2 · AGRICULTURAL RECOMMENDATIONS (C-style prominence)
          ════════════════════════════════════ */}
      <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.06] rounded-3xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌾</span>
          <h2 className="text-white font-bold text-sm">التوصيات الزراعية اليوم</h2>
          {!hasAgriAlert && (
            <span className="text-emerald-400 text-xs mr-auto">✓ لا توجد تحذيرات</span>
          )}
        </div>

        {/* Heat warning */}
        {heatWarn.show && (
          <div className="bg-gradient-to-l from-red-950/70 to-amber-950/70 border border-red-400/20 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0 mt-0.5">🥵</span>
            <div>
              <p className="text-red-300 font-bold text-sm mb-0.5">تحذير: إجهاد حراري</p>
              <p className="text-red-200/70 text-xs leading-relaxed">{heatWarn.text}</p>
            </div>
          </div>
        )}

        {/* Latest agenda alert */}
        {latestAlert && (
          <Link
            href="/farmer/agenda"
            className="flex items-center justify-between bg-amber-500/[0.08] border border-amber-400/20 hover:bg-amber-500/[0.14] rounded-2xl px-4 py-3.5 transition-colors group"
          >
            <div className="flex items-center gap-2.5 truncate">
              <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <p className="text-amber-300 text-xs font-medium truncate">
                ⚠️ تحديث جديد: {latestAlert.advice_text_snapshot.slice(0, 42)}...
              </p>
            </div>
            <ArrowLeft className="w-4 h-4 text-amber-400 flex-shrink-0 mr-2 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Spray status */}
        <div className={`rounded-2xl p-4 flex items-start gap-3 border ${
          spray.badge === 'green'
            ? 'bg-emerald-950/50 border-emerald-500/20'
            : spray.badge === 'yellow'
            ? 'bg-amber-950/50 border-amber-500/20'
            : 'bg-red-950/50 border-red-500/20'
        }`}>
          <span className="text-2xl flex-shrink-0 mt-0.5">
            {spray.badge === 'green' ? '✅' : spray.badge === 'yellow' ? '⚠️' : '🚫'}
          </span>
          <div>
            <p className={`font-bold text-sm mb-0.5 ${
              spray.badge === 'green'
                ? 'text-emerald-300'
                : spray.badge === 'yellow'
                ? 'text-amber-300'
                : 'text-red-300'
            }`}>
              {spray.message}
            </p>
            {spray.reason && (
              <p className="text-slate-400 text-xs">{spray.reason}</p>
            )}
          </div>
        </div>

        {/* Irrigation advice */}
        {irriAdvice && (
          <div className="bg-sky-950/50 border border-sky-500/20 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0 mt-0.5">{irriAdvice.icon}</span>
            <div>
              <p className="text-sky-300 font-bold text-sm mb-0.5">توصية الري</p>
              <p className="text-sky-200/70 text-xs leading-relaxed">{irriAdvice.text}</p>
            </div>
          </div>
        )}

        {/* Frost warning */}
        {frostWarn.show && (
          <div className="bg-blue-950/50 border border-blue-400/20 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-2xl flex-shrink-0 mt-0.5">❄️</span>
            <div>
              <p className="text-blue-300 font-bold text-sm mb-0.5">تحذير: خطر الصقيع</p>
              <p className="text-blue-200/70 text-xs leading-relaxed">{frostWarn.text}</p>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          3 · 24-HOUR TIMELINE
          ════════════════════════════════════ */}
      <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.06] rounded-3xl p-4">
        <p className="text-slate-400 text-xs font-medium mb-3 flex items-center gap-1.5">
          <span>🕐</span>
          التفاصيل بالساعة
          <span className="text-slate-600 text-[10px]">({selectedDayHours.length} ساعة)</span>
        </p>

        {selectedDayHours.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-4">
            لا توجد بيانات بالساعة لهذا اليوم
          </p>
        ) : (
          <div
            ref={hourScrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x"
          >
            {selectedDayHours.map(h => {
              const hour          = new Date(h.time).getHours();
              const isCurrentHour = selectedDayIndex === 0 && hour === currentHour;
              const isPast        = selectedDayIndex === 0 && hour < currentHour;

              return (
                <div
                  key={h.time}
                  ref={isCurrentHour ? currentHourRef : undefined}
                  className={`flex-shrink-0 snap-start rounded-2xl p-2.5 w-[62px] text-center flex flex-col items-center gap-1 transition-all duration-200 ${
                    isCurrentHour
                      ? 'bg-white shadow-lg shadow-white/10 scale-[1.05]'
                      : isPast
                      ? 'bg-white/[0.03] border border-white/[0.04] opacity-30'
                      : 'bg-white/[0.05] border border-white/[0.07]'
                  }`}
                >
                  <span className={`text-[11px] font-medium leading-tight ${
                    isCurrentHour ? 'text-slate-600' : 'text-slate-400'
                  }`}>
                    {isCurrentHour ? 'الآن' : `${hour}:00`}
                  </span>
                  <span className="text-base leading-none">
                    {getHourIcon(hour, h.wmo)}
                  </span>
                  <span className={`text-sm font-bold tabular-nums leading-tight ${
                    isCurrentHour ? 'text-slate-900' : 'text-slate-200'
                  }`}>
                    {Math.round(h.temp)}°
                  </span>
                  <div className={`text-[10px] flex flex-col items-center gap-0.5 leading-tight ${
                    isCurrentHour ? 'text-slate-600' : 'text-slate-500'
                  }`}>
                    <span>💨 {Math.round(h.wind)}</span>
                    {h.precip_prob > 0 && (
                      <span className={isCurrentHour ? 'text-blue-700' : 'text-blue-400'}>
                        💧{h.precip_prob}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          4 · 7-DAY FORECAST (Interactive Accordion)
          ════════════════════════════════════ */}
      {dailyList.length > 0 && (
        <div className="bg-white/[0.04] backdrop-blur-md border border-white/[0.06] rounded-3xl overflow-hidden">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <p className="text-slate-400 text-xs font-medium flex items-center gap-1.5">
              <span>📅</span>
              توقعات {dailyList.length} أيام (اضغط على أي يوم للتفاصيل)
            </p>
            <span className="text-[10px] text-slate-500">24 ساعة لكل يوم</span>
          </div>

          <div className="divide-y divide-white/[0.05]">
            {dailyList.map((day, idx) => {
              const desc        = getWeatherDescription(day.wmo);
              const dayName     = getArabicDayName(day.date, idx);
              const isToday     = idx === 0;
              const isExpanded  = expandedDate === day.date;
              const dayHours    = (weather.hourly_today || []).filter(h => h.time.startsWith(day.date));

              const minPct   = ((day.temp_min - globalMin) / globalRng) * 100;
              const widthPct = ((day.temp_max - day.temp_min) / globalRng) * 100;

              return (
                <div key={day.date} className="transition-colors">
                  {/* Clickable Day Row */}
                  <button
                    type="button"
                    onClick={() => setExpandedDate(prev => prev === day.date ? null : day.date)}
                    className={`w-full flex items-center gap-2.5 px-4 py-3.5 text-right transition-all hover:bg-white/[0.04] active:bg-white/[0.08] cursor-pointer ${
                      isToday ? 'bg-white/[0.02]' : ''
                    } ${isExpanded ? 'bg-white/[0.06]' : ''}`}
                  >
                    {/* Day name */}
                    <span className={`text-xs font-bold w-[54px] text-right flex-shrink-0 ${
                      isToday ? 'text-emerald-400' : 'text-slate-200'
                    }`}>
                      {dayName}
                    </span>

                    {/* Condition emoji */}
                    <span className="text-xl flex-shrink-0 w-7 text-center">{desc.emoji}</span>

                    {/* Rain probability */}
                    <div className="w-10 flex-shrink-0 text-right">
                      {day.precip_prob >= 10 && (
                        <span className="text-[10px] text-blue-400 font-medium tabular-nums">
                          💧{day.precip_prob}%
                        </span>
                      )}
                    </div>

                    {/* Low temp */}
                    <span className="text-[11px] text-slate-500 tabular-nums w-7 text-right flex-shrink-0">
                      {Math.round(day.temp_min)}°
                    </span>

                    {/* Gradient temperature bar */}
                    <div className="flex-1 relative h-1.5 bg-white/[0.08] rounded-full">
                      <div
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          left:       `${minPct.toFixed(1)}%`,
                          width:      `${Math.max(widthPct, 4).toFixed(1)}%`,
                          background: 'linear-gradient(to right, #3b82f6, #fb923c)',
                        }}
                      />
                    </div>

                    {/* High temp */}
                    <span className="text-[11px] text-slate-200 tabular-nums font-semibold w-7 flex-shrink-0">
                      {Math.round(day.temp_max)}°
                    </span>

                    {/* Chevron indicator */}
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-300 ${
                        isExpanded ? 'rotate-180 text-emerald-400' : ''
                      }`}
                    />
                  </button>

                  {/* ── EXPANDED DAY DETAILS ACCORDION ── */}
                  {isExpanded && (
                    <div className="px-4 py-3.5 bg-slate-950/80 border-t border-b border-white/[0.08] space-y-3">
                      {/* Header row */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-400 font-bold">
                            🌤️ تفاصيل ساعات {dayName}
                          </span>
                          <span className="text-slate-500 text-[11px]">
                            ({desc.label})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          <span className="bg-white/[0.05] px-2 py-0.5 rounded-full border border-white/[0.08]">
                            العظمى {Math.round(day.temp_max)}° / الصغرى {Math.round(day.temp_min)}°
                          </span>
                          {day.precip_prob > 0 && (
                            <span className="bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/20">
                              💧 مطر {day.precip_prob}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 24-hour timeline for this day */}
                      {dayHours.length === 0 ? (
                        <p className="text-slate-500 text-xs text-center py-2">
                          جاري تحديث بيانات الساعات لهذا اليوم...
                        </p>
                      ) : (
                        <div className="flex gap-2 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x">
                          {dayHours.map(h => {
                            const hour          = new Date(h.time).getHours();
                            const isCurrentHour = isToday && hour === currentHour;
                            const isPast        = isToday && hour < currentHour;

                            return (
                              <div
                                key={h.time}
                                className={`flex-shrink-0 snap-start rounded-2xl p-2.5 w-[62px] text-center flex flex-col items-center gap-1 transition-all ${
                                  isCurrentHour
                                    ? 'bg-white shadow-lg shadow-white/10 scale-[1.05]'
                                    : isPast
                                    ? 'bg-white/[0.03] border border-white/[0.04] opacity-30'
                                    : 'bg-white/[0.06] border border-white/[0.08]'
                                }`}
                              >
                                <span className={`text-[11px] font-medium leading-tight ${
                                  isCurrentHour ? 'text-slate-600' : 'text-slate-400'
                                }`}>
                                  {isCurrentHour ? 'الآن' : `${hour}:00`}
                                </span>
                                <span className="text-base leading-none">
                                  {getHourIcon(hour, h.wmo)}
                                </span>
                                <span className={`text-sm font-bold tabular-nums leading-tight ${
                                  isCurrentHour ? 'text-slate-900' : 'text-slate-200'
                                }`}>
                                  {Math.round(h.temp)}°
                                </span>
                                <div className={`text-[10px] flex flex-col items-center gap-0.5 leading-tight ${
                                  isCurrentHour ? 'text-slate-600' : 'text-slate-500'
                                }`}>
                                  <span>💨 {Math.round(h.wind)}</span>
                                  {h.precip_prob > 0 && (
                                    <span className={isCurrentHour ? 'text-blue-700' : 'text-blue-400'}>
                                      💧{h.precip_prob}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
