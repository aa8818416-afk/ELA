'use client';

import { useState } from 'react';
import {
  Wind,
  Droplets,
  Thermometer,
  ShieldAlert,
  ArrowLeft,
  Sun,
  Sunset,
  Calendar,
  CloudRain,
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

interface FarmerWeatherClientProps {
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

export default function FarmerWeatherClient({
  weather,
  cropType,
  latestAlert,
}: FarmerWeatherClientProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);

  if (!weather) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
        <span className="text-4xl">🌤️</span>
        <h3 className="text-white font-bold text-lg">بيانات الطقس غير متاحة حالياً</h3>
        <p className="text-slate-400 text-sm">سيتم تحديث البيانات تلقائياً فور توفرها.</p>
      </div>
    );
  }

  const dailyList = weather.daily_forecast || [];
  const activeDay = dailyList[selectedDayIndex] || dailyList[0];

  const temp = weather.temperature_2m !== null ? Math.round(weather.temperature_2m) : null;
  const rh = weather.relative_humidity_2m !== null ? Math.round(weather.relative_humidity_2m) : 50;
  const wind = weather.wind_speed_10m !== null ? Math.round(weather.wind_speed_10m) : 0;
  const apparent = weather.apparent_temperature !== null ? Math.round(weather.apparent_temperature) : temp;
  const et0 = weather.et0_fao_evapotranspiration !== null ? Number(weather.et0_fao_evapotranspiration) : 0;

  const todayForecast = dailyList[0];
  const precipProb24h = todayForecast ? todayForecast.precip_prob : 0;
  const vpd = temp !== null ? calcVPD(temp, rh) : 1.0;
  const heatWarn = calcHeatWarning(weather.hourly_today, weather.apparent_temperature);
  const spray = calcSprayStatus(wind, precipProb24h, vpd, heatWarn.show);

  const irriAdvice = calcIrrigationAdvice(et0, precipProb24h);
  const frostWarn = calcFrostWarning(todayForecast ? todayForecast.temp_min : null, cropType);

  const periods = splitDayPeriods(weather.hourly_today);
  const condition = getWeatherDescription(weather.weather_code);

  // Filter hours for selected day if active
  const activeDateStr = activeDay?.date;
  const selectedDayHours = (weather.hourly_today || []).filter(
    (h) => !activeDateStr || h.time.startsWith(activeDateStr)
  );

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">الطقس والبيئة 🌤️</h1>
          <p className="text-slate-400 text-sm">📍 {weather.location_name}</p>
        </div>
        <div className="text-slate-500 text-xs text-left">
          آخر تحديث
          <br />
          {formatTime(weather.fetched_at)}
        </div>
      </div>

      {/* 1. Heat warning banner */}
      {heatWarn.show && (
        <div className="bg-gradient-to-r from-red-600 to-amber-600 border border-red-400/40 rounded-3xl p-4 text-white shadow-lg flex items-center gap-3 animate-pulse">
          <span className="text-3xl">🥵</span>
          <div>
            <h4 className="font-bold text-sm">تحذير الإجهاد الحراري</h4>
            <p className="text-xs text-red-100 font-medium leading-relaxed mt-0.5">{heatWarn.text}</p>
          </div>
        </div>
      )}

      {/* 2. Alert banner */}
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
          <span className="text-[11px] text-amber-400 underline flex items-center gap-1">
            الأجندة <ArrowLeft className="w-3 h-3" />
          </span>
        </Link>
      )}

      {/* 3. Irrigation advice */}
      {irriAdvice && (
        <div className="bg-sky-950/60 border border-sky-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-xl flex-shrink-0">{irriAdvice.icon}</span>
          <p className="text-sky-200 text-xs font-medium leading-relaxed">{irriAdvice.text}</p>
        </div>
      )}

      {/* 4. Spray status badge */}
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

      {/* 5. 5-Day Interactive Tab Selector */}
      {dailyList.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4">
          <p className="text-slate-400 text-xs font-medium mb-3 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-emerald-400" />
            اختر اليوم لعرض كافة تفاصيله:
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
            {dailyList.slice(0, 5).map((day, idx) => {
              const desc = getWeatherDescription(day.wmo);
              const dayName = getArabicDayName(day.date, idx);
              const isSelected = selectedDayIndex === idx;

              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`flex-1 min-w-[76px] snap-start rounded-2xl p-3 text-center transition-all border ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-900/40 scale-[1.02]'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-bold mb-1">{dayName}</p>
                  <p className="text-xl mb-1">{desc.emoji}</p>
                  <div className="flex items-center justify-center gap-1 text-[11px]">
                    <span className="font-bold">{Math.round(day.temp_max)}°</span>
                    <span className="opacity-60">/</span>
                    <span className="opacity-80">{Math.round(day.temp_min)}°</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Active Day Weather Card */}
      <div className="bg-gradient-to-br from-sky-950/70 via-slate-900/80 to-slate-900/60 border border-sky-500/20 rounded-3xl p-5 relative overflow-hidden space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{getWeatherDescription(activeDay?.wmo ?? weather.weather_code).emoji}</span>
            <div>
              <h3 className="text-white font-bold text-base">
                طقس {getArabicDayName(activeDay?.date ?? '', selectedDayIndex)}
              </h3>
              <p className="text-slate-400 text-xs">
                {getWeatherDescription(activeDay?.wmo ?? weather.weather_code).label}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-amber-400 tabular-nums">
              {activeDay ? Math.round(activeDay.temp_max) : temp}°
            </span>
            <span className="text-slate-400 text-xs block">
              الصغرى {activeDay ? Math.round(activeDay.temp_min) : '--'}°
            </span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-1">
            <Thermometer className="w-4 h-4 text-orange-400" />
            <span className="text-slate-200 text-xs font-medium">{apparent}°م</span>
            <span className="text-slate-500 text-[10px]">الإحساس</span>
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-1">
            <Droplets className="w-4 h-4 text-blue-400" />
            <span className="text-slate-200 text-xs font-medium">{rh}%</span>
            <span className="text-slate-500 text-[10px]">الرطوبة</span>
          </div>

          <div className="bg-slate-900/50 rounded-2xl p-3 flex flex-col items-center gap-1">
            <Wind className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-200 text-xs font-medium">{wind} كم/س</span>
            <span className="text-slate-500 text-[10px]">الرياح</span>
          </div>
        </div>

        {/* Sunrise / Sunset & Rain */}
        <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/40 px-3 py-2 rounded-xl">
            <Sun className="w-4 h-4 text-amber-400" />
            <span>الشروق {weather.sunrise ? formatTime(weather.sunrise) : '06:13 ص'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/40 px-3 py-2 rounded-xl">
            <Sunset className="w-4 h-4 text-orange-400" />
            <span>الغروب {weather.sunset ? formatTime(weather.sunset) : '07:50 م'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900/40 px-3 py-2 rounded-xl">
            <CloudRain className="w-4 h-4 text-blue-400" />
            <span>احتمال المطر {activeDay?.precip_prob ?? 0}%</span>
          </div>
        </div>

        {/* Frost Warning */}
        {frostWarn.show && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
            <span className="text-base">❄️</span>
            <p className="text-blue-300 text-xs font-medium">{frostWarn.text}</p>
          </div>
        )}
      </div>

      {/* 7. Today's 3 Periods Summary */}
      {selectedDayIndex === 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4">
          <p className="text-slate-400 text-xs font-medium mb-3">تفاصيل فترات اليوم</p>
          <div className="grid grid-cols-3 gap-2">
            {/* الصبح */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[95px]">
              <span className="text-xs text-slate-400 font-medium">🌅 الصبح</span>
              <div className="my-1">
                <span className="text-lg font-bold text-slate-200">
                  {periods.morning ? `${periods.morning.avgTemp}°` : '--'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                {periods.morning ? `${periods.morning.wmoEmoji} ${periods.morning.wmoLabel}` : 'معتدل'}
              </span>
            </div>

            {/* الضهر */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[95px]">
              <span className="text-xs text-slate-400 font-medium">☀️ الضهر</span>
              <div className="my-1">
                <span className="text-lg font-bold text-slate-200">
                  {periods.midday ? `${periods.midday.avgTemp}°` : '--'}
                </span>
              </div>
              <span className="text-[10px] text-amber-400 font-medium">
                {periods.midday ? `${periods.midday.wmoEmoji} ${periods.midday.wmoLabel}` : 'حرارة مرتفعة'}
              </span>
            </div>

            {/* العصر / المغرب */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3 text-center flex flex-col items-center justify-between min-h-[95px]">
              <span className="text-xs text-slate-400 font-medium">🌇 العصر</span>
              <div className="my-1">
                <span className="text-lg font-bold text-slate-200">
                  {periods.evening ? `${periods.evening.avgTemp}°` : '--'}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                {periods.evening ? `${periods.evening.wmoEmoji} ${periods.evening.wmoLabel}` : 'معتدل'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 8. 24-Hour Timeline for Selected Day */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-4">
        <p className="text-slate-400 text-xs font-medium mb-3">
          التفاصيل بالساعة لليوم المختار ({selectedDayHours.length} ساعة)
        </p>
        {selectedDayHours.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-4">لا توجد تفاصيل بالساعة لهذا اليوم</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none snap-x">
            {selectedDayHours.map((h) => {
              const hourLabel = new Date(h.time).getHours();
              const hourStr = `${hourLabel}:00`;
              return (
                <div
                  key={h.time}
                  className="flex-shrink-0 snap-start bg-slate-950/60 border border-slate-800/80 rounded-2xl p-2.5 w-16 text-center space-y-1.5"
                >
                  <span className="text-[11px] text-slate-400 block font-medium">{hourStr}</span>
                  <span className="text-base block tabular-nums font-bold text-slate-200">
                    {Math.round(h.temp)}°
                  </span>
                  <div className="text-[10px] text-slate-500 flex flex-col items-center gap-0.5">
                    <span>💨 {Math.round(h.wind)}</span>
                    {h.precip_prob > 0 && <span className="text-blue-400">💧 {h.precip_prob}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
