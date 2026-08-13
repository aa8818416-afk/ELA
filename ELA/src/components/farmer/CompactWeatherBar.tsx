'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { getWeatherDescription, calcSprayStatus, calcVPD, calcHeatWarning } from '@/lib/weatherLogic';

interface CompactWeatherBarProps {
  weather: any;
}

export default function CompactWeatherBar({ weather }: CompactWeatherBarProps) {
  if (!weather) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 text-center">
        <p className="text-slate-500 text-xs">🌡️ جاري تحميل بيانات الطقس...</p>
      </div>
    );
  }

  const temp = weather.temperature_2m !== null ? Math.round(weather.temperature_2m) : '--';
  const rh = weather.relative_humidity_2m !== null ? Math.round(weather.relative_humidity_2m) : 50;
  const wind = weather.wind_speed_10m !== null ? Math.round(weather.wind_speed_10m) : 0;
  const condition = getWeatherDescription(weather.weather_code);

  const todayForecast = weather.daily_forecast?.[0];
  const precipProb = todayForecast ? todayForecast.precip_prob : 0;
  const vpd = typeof temp === 'number' ? calcVPD(temp, rh) : 1.0;
  const heatWarn = calcHeatWarning(weather.hourly_today || [], weather.apparent_temperature);
  const spray = calcSprayStatus(wind, precipProb, vpd, heatWarn.show);

  return (
    <Link
      href="/farmer/weather"
      className="block bg-gradient-to-r from-sky-950/80 via-slate-900/90 to-slate-900/80 border border-sky-500/30 hover:border-sky-500/50 rounded-2xl p-4 transition-all shadow-lg group active:scale-[0.98]"
    >
      <div className="flex items-center justify-between">
        {/* Left: Temp & Location */}
        <div className="flex items-center gap-3">
          <span className="text-3xl">{condition.emoji}</span>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-amber-400 tabular-nums">{temp}°م</span>
              <span className="text-slate-400 text-xs font-medium truncate max-w-[120px]">
                {weather.location_name.split('-')[1] || weather.location_name}
              </span>
            </div>
            <p className="text-slate-400 text-[11px] font-medium">{condition.label}</p>
          </div>
        </div>

        {/* Right: Spray badge + CTA link */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border ${
              spray.badge === 'green'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : spray.badge === 'yellow'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}
          >
            <span>{spray.badge === 'green' ? '🟢' : spray.badge === 'yellow' ? '🟡' : '🔴'}</span>
            <span className="truncate max-w-[110px]">{spray.message}</span>
          </div>

          <ChevronLeft className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 group-hover:-translate-x-1 transition-all" />
        </div>
      </div>
    </Link>
  );
}
