'use client';

import Link from 'next/link';
import { ChevronLeft, Droplets, Wind } from 'lucide-react';
import WeatherIcon from '@/components/farmer/WeatherIcon';
import { getWeatherDescription, calcSprayStatus, calcVPD, calcHeatWarning, isDaytime } from '@/lib/weatherLogic';

interface CompactWeatherBarProps {
  weather: any;
}

export default function CompactWeatherBar({ weather }: CompactWeatherBarProps) {
  if (!weather) {
    return (
      <div className="bg-white border border-slate-200/80 rounded-3xl p-4 text-center shadow-xs">
        <p className="text-slate-500 text-xs font-medium">🌡️ جاري تحميل بيانات الطقس...</p>
      </div>
    );
  }

  const temp = weather.temperature_2m !== null ? Math.round(weather.temperature_2m) : '--';
  const rh = weather.relative_humidity_2m !== null ? Math.round(weather.relative_humidity_2m) : 50;
  const wind = weather.wind_speed_10m !== null ? Math.round(weather.wind_speed_10m) : 0;
  const apparent = weather.apparent_temperature !== null ? Math.round(weather.apparent_temperature) : temp;
  const isNowDay = isDaytime(undefined, weather.sunrise, weather.sunset);
  const condition = getWeatherDescription(weather.weather_code, isNowDay);

  const currentHour = new Date().getHours();
  const todayForecast = weather.daily_forecast?.[0];
  const precipProb = todayForecast ? todayForecast.precip_prob : 0;
  const vpd = typeof temp === 'number' ? calcVPD(temp, rh) : 1.0;
  const heatWarn = calcHeatWarning(weather.hourly_today || [], weather.apparent_temperature);
  const spray = calcSprayStatus(wind, precipProb, vpd, heatWarn.show, currentHour);

  const sprayColor = !spray
    ? ''
    : spray.badge === 'green'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
      : spray.badge === 'yellow'
      ? 'bg-amber-50 border-amber-300 text-amber-800'
      : 'bg-red-50 border-red-300 text-red-800';

  const sprayDot = !spray
    ? ''
    : spray.badge === 'green' ? '🟢' : spray.badge === 'yellow' ? '🟡' : '🔴';

  return (
    <Link
      href="/farmer/weather"
      className="block bg-white hover:bg-emerald-50/40 border border-slate-200/90 hover:border-emerald-300 rounded-3xl p-4 transition-all shadow-xs group active:scale-[0.98]"
    >
      {/* Row 1: Temp + Condition + Arrow */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
            <WeatherIcon
              code={weather.weather_code}
              isDay={isNowDay}
              size={36}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-2xl font-black text-slate-900 font-mono">{temp}°</span>
              <span className="text-slate-600 text-xs font-bold truncate">({condition.label})</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 flex-wrap">
              <span className="whitespace-nowrap">يبان زي {apparent}°</span>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-slate-600 whitespace-nowrap">
                <Wind className="w-3 h-3 text-teal-600 flex-shrink-0" /> {wind} كم/س
              </span>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-slate-600 whitespace-nowrap">
                <Droplets className="w-3 h-3 text-blue-600 flex-shrink-0" /> {rh}%
              </span>
            </div>
          </div>
        </div>
        <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-emerald-700 group-hover:-translate-x-1 transition-all flex-shrink-0" />
      </div>

      {/* Row 2: Spray badge — مخفي بالليل (21:00–05:59) */}
      {spray && (
        <div className={`mt-3 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border ${sprayColor}`}>
          <span className="flex-shrink-0">{sprayDot}</span>
          <span>{spray.message}</span>
        </div>
      )}
    </Link>
  );
}
