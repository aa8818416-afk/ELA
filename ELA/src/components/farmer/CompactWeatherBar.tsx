'use client';

import Link from 'next/link';
import { ChevronLeft, Droplets, Wind } from 'lucide-react';
import { getWeatherDescription, calcSprayStatus, calcVPD, calcHeatWarning } from '@/lib/weatherLogic';

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
  const condition = getWeatherDescription(weather.weather_code);

  const todayForecast = weather.daily_forecast?.[0];
  const precipProb = todayForecast ? todayForecast.precip_prob : 0;
  const vpd = typeof temp === 'number' ? calcVPD(temp, rh) : 1.0;
  const heatWarn = calcHeatWarning(weather.hourly_today || [], weather.apparent_temperature);
  const spray = calcSprayStatus(wind, precipProb, vpd, heatWarn.show);

  return (
    <Link
      href="/farmer/weather"
      className="block bg-white hover:bg-emerald-50/40 border border-slate-200/90 hover:border-emerald-300 rounded-3xl p-4 transition-all shadow-xs group active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        {/* Right (in RTL): Temp, icon, condition */}
        <div className="flex items-center gap-3">
          <span className="text-3xl flex-shrink-0">{condition.emoji}</span>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 font-mono">{temp}°</span>
              <span className="text-slate-600 text-xs font-bold">
                ({condition.label})
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
              <span>يبان زي {apparent}°</span>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-slate-600">
                <Wind className="w-3 h-3 text-teal-600" /> {wind} كم/س
              </span>
              <span>·</span>
              <span className="flex items-center gap-0.5 text-slate-600">
                <Droplets className="w-3 h-3 text-blue-600" /> {rh}%
              </span>
            </div>
          </div>
        </div>

        {/* Left: Spray status + Arrow */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border shadow-xs ${
              spray.badge === 'green'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : spray.badge === 'yellow'
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-red-50 border-red-300 text-red-800'
            }`}
          >
            <span>{spray.badge === 'green' ? '🟢' : spray.badge === 'yellow' ? '🟡' : '🔴'}</span>
            <span className="truncate max-w-[100px]">{spray.message}</span>
          </div>

          <ChevronLeft className="w-5 h-5 text-slate-400 group-hover:text-emerald-700 group-hover:-translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}
