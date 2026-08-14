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
          stroke="rgba(0,0,0,0.08)"
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
        <circle cx={sunX} cy={sunY} r={10} fill="rgba(245,158,11,0.15)" />
        <circle cx={sunX} cy={sunY} r={6}  fill="#f59e0b" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-500 -mt-1 font-medium">
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
      <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center space-y-3 shadow-xs">
        <span className="text-4xl">🌤️</span>
        <h3 className="text-slate-900 font-bold text-lg">بيانات الطقس غير متاحة حالياً</h3>
        <p className="text-slate-500 text-sm">سيتم تحديث البيانات تلقائياً فور توفرها.</p>
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
    <div className="space-y-4 pb-4 text-right font-sans">

      {/* ════════════════════════════════════
          1 · HERO WEATHER CARD (Light theme)
          ════════════════════════════════════ */}
      <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <p className="text-slate-900 text-sm font-bold truncate max-w-[60%] flex items-center gap-1">
            <span>📍</span>
            <span>{weather.location_name}</span>
          </p>
          <p className="text-slate-500 text-[11px] flex-shrink-0 font-medium">
            آخر تحديث {formatTime(weather.fetched_at)}
          </p>
        </div>

        {/* Main temperature display */}
        <div className="px-5 pb-3">
          <div className="flex items-end gap-3 mb-1">
            <span className="text-[72px] font-black text-slate-900 font-mono leading-none">
              {temp !== null ? temp : '--'}°
            </span>
            <span className="text-5xl mb-2">{condition.emoji}</span>
          </div>
          <p className="text-base font-black text-emerald-800 mb-0.5">{condition.label}</p>
          <p className="text-slate-600 text-xs font-medium">
            يبان زي {apparent}°&nbsp;&nbsp;·&nbsp;&nbsp;
            ↑&nbsp;{todayForecast ? Math.round(todayForecast.temp_max) : '--'}°&nbsp;
            ↓&nbsp;{todayForecast ? Math.round(todayForecast.temp_min) : '--'}°
          </p>
        </div>

        {/* Stats chips */}
        <div className="flex gap-2 px-5 pb-4 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
            <Droplets className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-slate-900 text-xs font-bold font-mono">{rh}%</span>
            <span className="text-slate-500 text-[10px]">رطوبة</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
            <Wind className="w-3.5 h-3.5 text-teal-600" />
            <span className="text-slate-900 text-xs font-bold font-mono">{wind}</span>
            <span className="text-slate-500 text-[10px]">كم/س</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
            <span className="text-xs">🌧️</span>
            <span className="text-slate-900 text-xs font-bold font-mono">{precipProb24h}%</span>
            <span className="text-slate-500 text-[10px]">مطر</span>
          </div>
          {dewPoint !== null && (
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
              <Thermometer className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-slate-900 text-xs font-bold font-mono">{dewPoint}°</span>
              <span className="text-slate-500 text-[10px]">ندى</span>
            </div>
          )}
        </div>

        {/* Sunrise / Sunset arc */}
        <SunArc sunrise={weather.sunrise} sunset={weather.sunset} />
      </div>

      {/* ════════════════════════════════════
          2 · AGRICULTURAL RECOMMENDATIONS
          ════════════════════════════════════ */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 space-y-3 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="text-lg">🌾</span>
          <h2 className="text-slate-900 font-black text-sm">التوصيات الزراعية اليوم</h2>
          {!hasAgriAlert && (
            <span className="text-emerald-800 text-xs font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full mr-auto">
              ✓ لا توجد تحذيرات
            </span>
          )}
        </div>

        {/* Heat warning */}
        {heatWarn.show && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
            <span className="text-2xl flex-shrink-0 mt-0.5">🥵</span>
            <div>
              <p className="text-red-800 font-black text-sm mb-0.5">تحذير: إجهاد حراري</p>
              <p className="text-red-700 text-xs leading-relaxed">{heatWarn.text}</p>
            </div>
          </div>
        )}

        {/* Latest agenda alert */}
        {latestAlert && (
          <Link
            href="/farmer/agenda"
            className="flex items-center justify-between bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-2xl px-4 py-3.5 transition-colors group shadow-xs"
          >
            <div className="flex items-center gap-2.5 truncate">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-amber-900 text-xs font-bold truncate">
                ⚠️ تحديث جديد: {latestAlert.advice_text_snapshot.slice(0, 42)}...
              </p>
            </div>
            <ArrowLeft className="w-4 h-4 text-amber-700 flex-shrink-0 mr-2 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
        )}

        {/* Spray status */}
        <div className={`rounded-2xl p-4 flex items-start gap-3 border shadow-xs ${
          spray.badge === 'green'
            ? 'bg-emerald-50 border-emerald-300'
            : spray.badge === 'yellow'
            ? 'bg-amber-50 border-amber-300'
            : 'bg-red-50 border-red-300'
        }`}>
          <span className="text-2xl flex-shrink-0 mt-0.5">
            {spray.badge === 'green' ? '✅' : spray.badge === 'yellow' ? '⚠️' : '🚫'}
          </span>
          <div>
            <p className={`font-black text-sm mb-0.5 ${
              spray.badge === 'green'
                ? 'text-emerald-900'
                : spray.badge === 'yellow'
                ? 'text-amber-900'
                : 'text-red-900'
            }`}>
              {spray.message}
            </p>
            {spray.reason && (
              <p className="text-slate-600 text-xs mt-0.5">{spray.reason}</p>
            )}
          </div>
        </div>

        {/* Irrigation advice */}
        {irriAdvice && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
            <span className="text-2xl flex-shrink-0 mt-0.5">{irriAdvice.icon}</span>
            <div>
              <p className="text-sky-900 font-black text-sm mb-0.5">توصية الري</p>
              <p className="text-sky-800 text-xs leading-relaxed">{irriAdvice.text}</p>
            </div>
          </div>
        )}

        {/* Frost warning */}
        {frostWarn.show && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
            <span className="text-2xl flex-shrink-0 mt-0.5">❄️</span>
            <div>
              <p className="text-blue-900 font-black text-sm mb-0.5">تحذير: خطر الصقيع</p>
              <p className="text-blue-800 text-xs leading-relaxed">{frostWarn.text}</p>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════
          3 · 24-HOUR TIMELINE
          ════════════════════════════════════ */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
        <p className="text-slate-900 text-xs font-black mb-3 flex items-center gap-1.5">
          <span>🕐</span>
          التفاصيل بالساعة
          <span className="text-slate-500 text-[10px] font-normal">({selectedDayHours.length} ساعة)</span>
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
                  className={`flex-shrink-0 snap-start rounded-2xl p-2.5 w-[62px] text-center flex flex-col items-center gap-1 transition-all duration-200 border ${
                    isCurrentHour
                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm scale-[1.03]'
                      : isPast
                      ? 'bg-slate-50 border-slate-200 opacity-40'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`text-[11px] font-bold leading-tight ${
                    isCurrentHour ? 'text-emerald-100' : 'text-slate-500'
                  }`}>
                    {isCurrentHour ? 'الآن' : `${hour}:00`}
                  </span>
                  <span className="text-base leading-none">
                    {getHourIcon(hour, h.wmo)}
                  </span>
                  <span className={`text-sm font-black font-mono leading-tight ${
                    isCurrentHour ? 'text-white' : 'text-slate-900'
                  }`}>
                    {Math.round(h.temp)}°
                  </span>
                  <div className={`text-[10px] flex flex-col items-center gap-0.5 leading-tight font-medium ${
                    isCurrentHour ? 'text-emerald-100' : 'text-slate-600'
                  }`}>
                    <span>💨 {Math.round(h.wind)}</span>
                    {h.precip_prob > 0 && (
                      <span className={isCurrentHour ? 'text-cyan-200' : 'text-blue-600'}>
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
        <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <p className="text-slate-900 text-xs font-black flex items-center gap-1.5">
              <span>📅</span>
              توقعات {dailyList.length} أيام (اضغط على أي يوم للتفاصيل)
            </p>
            <span className="text-[10px] text-slate-500">24 ساعة لكل يوم</span>
          </div>

          <div className="divide-y divide-slate-100">
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
                    className={`w-full flex items-center gap-2.5 px-4 py-3.5 text-right transition-all hover:bg-slate-50 active:bg-slate-100 cursor-pointer ${
                      isToday ? 'bg-emerald-50/30' : ''
                    } ${isExpanded ? 'bg-slate-50' : ''}`}
                  >
                    {/* Day name */}
                    <span className={`text-xs font-black w-[54px] text-right flex-shrink-0 ${
                      isToday ? 'text-emerald-800' : 'text-slate-900'
                    }`}>
                      {dayName}
                    </span>

                    {/* Condition emoji */}
                    <span className="text-xl flex-shrink-0 w-7 text-center">{desc.emoji}</span>

                    {/* Rain probability */}
                    <div className="w-10 flex-shrink-0 text-right">
                      {day.precip_prob >= 10 && (
                        <span className="text-[10px] text-blue-600 font-bold font-mono">
                          💧{day.precip_prob}%
                        </span>
                      )}
                    </div>

                    {/* Low temp */}
                    <span className="text-[11px] text-slate-500 font-mono w-7 text-right flex-shrink-0 font-medium">
                      {Math.round(day.temp_min)}°
                    </span>

                    {/* Gradient temperature bar */}
                    <div className="flex-1 relative h-1.5 bg-slate-100 rounded-full">
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
                    <span className="text-[11px] text-slate-900 font-mono font-black w-7 flex-shrink-0">
                      {Math.round(day.temp_max)}°
                    </span>

                    {/* Chevron indicator */}
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-300 ${
                        isExpanded ? 'rotate-180 text-emerald-700' : ''
                      }`}
                    />
                  </button>

                  {/* ── EXPANDED DAY DETAILS ACCORDION ── */}
                  {isExpanded && (
                    <div className="px-4 py-3.5 bg-slate-50/80 border-t border-b border-slate-200/80 space-y-3">
                      {/* Header row */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-800 font-black">
                            🌤️ تفاصيل ساعات {dayName}
                          </span>
                          <span className="text-slate-500 text-[11px]">
                            ({desc.label})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-600">
                          <span className="bg-white px-2 py-0.5 rounded-full border border-slate-200 font-bold font-mono">
                            العظمى {Math.round(day.temp_max)}° / الصغرى {Math.round(day.temp_min)}°
                          </span>
                          {day.precip_prob > 0 && (
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-bold font-mono">
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
                                className={`flex-shrink-0 snap-start rounded-2xl p-2.5 w-[62px] text-center flex flex-col items-center gap-1 transition-all border ${
                                  isCurrentHour
                                    ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs scale-[1.03]'
                                    : isPast
                                    ? 'bg-white border-slate-200 opacity-40'
                                    : 'bg-white border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <span className={`text-[11px] font-bold leading-tight ${
                                  isCurrentHour ? 'text-emerald-100' : 'text-slate-500'
                                }`}>
                                  {isCurrentHour ? 'الآن' : `${hour}:00`}
                                </span>
                                <span className="text-base leading-none">
                                  {getHourIcon(hour, h.wmo)}
                                </span>
                                <span className={`text-sm font-black font-mono leading-tight ${
                                  isCurrentHour ? 'text-white' : 'text-slate-900'
                                }`}>
                                  {Math.round(h.temp)}°
                                </span>
                                <div className={`text-[10px] flex flex-col items-center gap-0.5 leading-tight font-medium ${
                                  isCurrentHour ? 'text-emerald-100' : 'text-slate-600'
                                }`}>
                                  <span>💨 {Math.round(h.wind)}</span>
                                  {h.precip_prob > 0 && (
                                    <span className={isCurrentHour ? 'text-cyan-200' : 'text-blue-600'}>
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
