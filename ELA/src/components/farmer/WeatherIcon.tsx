'use client';

import React from 'react';
import { WeatherIconType } from '@/lib/weatherLogic';

interface WeatherIconProps {
  code?: number | null;
  iconType?: WeatherIconType;
  isDay?: boolean;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
}

const sizeMap = {
  xs: 18,
  sm: 24,
  md: 32,
  lg: 44,
  xl: 64,
  '2xl': 88,
};

export default function WeatherIcon({
  code,
  iconType,
  isDay = true,
  className = '',
  size = 'md',
}: WeatherIconProps) {
  const pixelSize = typeof size === 'number' ? size : sizeMap[size] || 32;

  // Infer iconType if code is provided directly
  let effectiveType: WeatherIconType = iconType || 'clear';
  if (code !== undefined && code !== null) {
    if (code === 0) effectiveType = 'clear';
    else if (code === 1) effectiveType = 'mostly_clear';
    else if (code === 2) effectiveType = 'partly_cloudy';
    else if (code === 3) effectiveType = 'overcast';
    else if (code === 45) effectiveType = 'fog';
    else if (code === 48) effectiveType = 'rime_fog';
    else if (code >= 51 && code <= 55) effectiveType = 'drizzle_light';
    else if (code === 56 || code === 57) effectiveType = 'freezing_drizzle';
    else if (code === 61) effectiveType = 'rain_light';
    else if (code === 63) effectiveType = 'rain_moderate';
    else if (code === 65) effectiveType = 'rain_heavy';
    else if (code === 66 || code === 67) effectiveType = 'freezing_rain';
    else if (code >= 71 && code <= 77) effectiveType = 'snow_light';
    else if (code === 80) effectiveType = 'rain_showers_light';
    else if (code === 81) effectiveType = 'rain_showers_moderate';
    else if (code === 82) effectiveType = 'rain_showers_heavy';
    else if (code === 85 || code === 86) effectiveType = 'snow_showers';
    else if (code === 95) effectiveType = 'thunderstorm';
    else if (code === 96 || code === 99) effectiveType = 'thunderstorm_hail';
    else effectiveType = 'clear';
  }

  return (
    <div
      style={{ width: pixelSize, height: pixelSize }}
      className={`relative inline-flex items-center justify-center flex-shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        width={pixelSize}
        height={pixelSize}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-xs"
      >
        <defs>
          {/* Sun Gradients */}
          <linearGradient id="sunGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="60%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>
          <linearGradient id="sunRaysGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FCD34D" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>

          {/* Moon Gradients */}
          <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="50%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#94A3B8" />
          </linearGradient>
          <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>

          {/* Cloud Gradients */}
          <linearGradient id="cloudFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#F1F5F9" />
            <stop offset="100%" stopColor="#CBD5E1" />
          </linearGradient>
          <linearGradient id="cloudBack" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E2E8F0" />
            <stop offset="100%" stopColor="#94A3B8" />
          </linearGradient>
          <linearGradient id="cloudDark" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>

          {/* Rain / Lightning Gradients */}
          <linearGradient id="rainGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
          <linearGradient id="lightningGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#EAB308" />
          </linearGradient>
          <linearGradient id="fogGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#64748B" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* ── 1. Clear / Sunny / Night ── */}
        {effectiveType === 'clear' && (
          isDay ? (
            <g>
              {/* Sun Rays */}
              <circle cx="32" cy="32" r="22" stroke="url(#sunRaysGrad)" strokeWidth="3" strokeDasharray="4 6" opacity="0.75" />
              {/* Sun Body */}
              <circle cx="32" cy="32" r="15" fill="url(#sunGrad)" />
              <circle cx="28" cy="27" r="4" fill="#FEF08A" opacity="0.6" />
            </g>
          ) : (
            <g>
              {/* Stars */}
              <circle cx="16" cy="18" r="1.5" fill="url(#starGrad)" />
              <circle cx="48" cy="16" r="2" fill="url(#starGrad)" />
              <circle cx="46" cy="46" r="1.2" fill="url(#starGrad)" />
              {/* Crescent Moon */}
              <path
                d="M38 14C27.5 14 19 22.5 19 33C19 43.5 27.5 52 38 52C42.5 52 46.6 50.4 49.8 47.8C40.5 46.5 33.5 38.5 33.5 29C33.5 22.5 37 16.8 42.2 14.3C40.8 14.1 39.4 14 38 14Z"
                fill="url(#moonGrad)"
              />
              <circle cx="28" cy="30" r="2" fill="#94A3B8" opacity="0.3" />
            </g>
          )
        )}

        {/* ── 2. Mostly Clear (Sun/Moon with small cloud) ── */}
        {effectiveType === 'mostly_clear' && (
          isDay ? (
            <g>
              {/* Sun */}
              <circle cx="24" cy="24" r="12" fill="url(#sunGrad)" />
              <circle cx="24" cy="24" r="17" stroke="url(#sunRaysGrad)" strokeWidth="2.5" strokeDasharray="3 5" opacity="0.7" />
              {/* Cloud in foreground */}
              <path
                d="M48 48H27C23.1 48 20 44.9 20 41C20 37.4 22.7 34.4 26.2 34.1C27.5 29.5 31.8 26 37 26C43.1 26 48 30.9 48 37C51.3 37.3 54 40.1 54 43.5C54 46 51.3 48 48 48Z"
                fill="url(#cloudFront)"
              />
            </g>
          ) : (
            <g>
              {/* Moon */}
              <path
                d="M28 14C21 14 15.3 19.7 15.3 26.7C15.3 33.7 21 39.4 28 39.4C31 39.4 33.7 38.3 35.8 36.6C29.6 35.7 25 30.4 25 24C25 19.6 27.3 15.8 30.8 14.2C29.9 14.1 28.9 14 28 14Z"
                fill="url(#moonGrad)"
              />
              <circle cx="44" cy="16" r="1.5" fill="url(#starGrad)" />
              {/* Cloud */}
              <path
                d="M48 48H27C23.1 48 20 44.9 20 41C20 37.4 22.7 34.4 26.2 34.1C27.5 29.5 31.8 26 37 26C43.1 26 48 30.9 48 37C51.3 37.3 54 40.1 54 43.5C54 46 51.3 48 48 48Z"
                fill="url(#cloudFront)"
              />
            </g>
          )
        )}

        {/* ── 3. Partly Cloudy ── */}
        {effectiveType === 'partly_cloudy' && (
          isDay ? (
            <g>
              <circle cx="22" cy="22" r="11" fill="url(#sunGrad)" />
              <path
                d="M49 49H24C19.6 49 16 45.4 16 41C16 36.9 19.1 33.5 23.1 33.1C24.6 27.9 29.5 24 35.3 24C42.2 24 47.8 29.6 47.8 36.5C51.5 36.8 54.5 40 54.5 43.8C54.5 46.7 52 49 49 49Z"
                fill="url(#cloudFront)"
              />
            </g>
          ) : (
            <g>
              <path
                d="M26 14C19 14 13.3 19.7 13.3 26.7C13.3 33.7 19 39.4 26 39.4C29 39.4 31.7 38.3 33.8 36.6C27.6 35.7 23 30.4 23 24C23 19.6 25.3 15.8 28.8 14.2C27.9 14.1 26.9 14 26 14Z"
                fill="url(#moonGrad)"
              />
              <path
                d="M49 49H24C19.6 49 16 45.4 16 41C16 36.9 19.1 33.5 23.1 33.1C24.6 27.9 29.5 24 35.3 24C42.2 24 47.8 29.6 47.8 36.5C51.5 36.8 54.5 40 54.5 43.8C54.5 46.7 52 49 49 49Z"
                fill="url(#cloudFront)"
              />
            </g>
          )
        )}

        {/* ── 4. Overcast (Cloudy) ── */}
        {effectiveType === 'overcast' && (
          <g>
            <path
              d="M42 36H24C20.7 36 18 33.3 18 30C18 26.9 20.3 24.4 23.3 24.1C24.4 20.2 28.1 17.3 32.5 17.3C37.7 17.3 41.9 21.5 41.9 26.7C44.7 26.9 47 29.3 47 32.1C47 34.3 44.8 36 42 36Z"
              fill="url(#cloudBack)"
            />
            <path
              d="M48 48H22C17.6 48 14 44.4 14 40C14 35.9 17.1 32.5 21.1 32.1C22.6 26.9 27.5 23 33.3 23C40.2 23 45.8 28.6 45.8 35.5C49.5 35.8 52.5 39 52.5 42.8C52.5 45.7 50.5 48 48 48Z"
              fill="url(#cloudFront)"
            />
          </g>
        )}

        {/* ── 5. Fog / Rime Fog ── */}
        {(effectiveType === 'fog' || effectiveType === 'rime_fog') && (
          <g>
            <path
              d="M44 32H20C16.7 32 14 29.3 14 26C14 22.9 16.3 20.4 19.3 20.1C20.4 16.2 24.1 13.3 28.5 13.3C33.7 13.3 37.9 17.5 37.9 22.7C40.7 22.9 43 25.3 43 28.1C43 30.3 43.5 32 44 32Z"
              fill="url(#cloudBack)"
              opacity="0.6"
            />
            {/* Fog Lines */}
            <line x1="12" y1="38" x2="52" y2="38" stroke="url(#fogGrad)" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="16" y1="44" x2="48" y2="44" stroke="url(#fogGrad)" strokeWidth="3" strokeLinecap="round" />
            <line x1="14" y1="50" x2="44" y2="50" stroke="url(#fogGrad)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* ── 6. Drizzle / Light Rain ── */}
        {(effectiveType === 'drizzle_light' ||
          effectiveType === 'drizzle_moderate' ||
          effectiveType === 'drizzle_dense' ||
          effectiveType === 'rain_light' ||
          effectiveType === 'rain_showers_light') && (
          <g>
            {isDay && (
              <circle cx="20" cy="20" r="9" fill="url(#sunGrad)" opacity="0.85" />
            )}
            <path
              d="M47 38H22C18.1 38 15 34.9 15 31C15 27.4 17.7 24.4 21.2 24.1C22.5 19.5 26.8 16 32 16C38.1 16 43 20.9 43 27C46.3 27.3 49 30.1 49 33.5C49 36 47 38 47 38Z"
              fill="url(#cloudFront)"
            />
            {/* Rain Drops */}
            <line x1="22" y1="43" x2="19" y2="50" stroke="url(#rainGrad)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="32" y1="43" x2="29" y2="50" stroke="url(#rainGrad)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="42" y1="43" x2="39" y2="50" stroke="url(#rainGrad)" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}

        {/* ── 7. Moderate & Heavy Rain ── */}
        {(effectiveType === 'rain_moderate' ||
          effectiveType === 'rain_heavy' ||
          effectiveType === 'rain_showers_moderate' ||
          effectiveType === 'rain_showers_heavy') && (
          <g>
            <path
              d="M48 38H21C16.6 38 13 34.4 13 30C13 25.9 16.1 22.5 20.1 22.1C21.6 16.9 26.5 13 32.3 13C39.2 13 44.8 18.6 44.8 25.5C48.5 25.8 51.5 29 51.5 32.8C51.5 35.7 49.5 38 48 38Z"
              fill="url(#cloudDark)"
            />
            {/* Double Rain Drops */}
            <line x1="20" y1="42" x2="16" y2="52" stroke="url(#rainGrad)" strokeWidth="3" strokeLinecap="round" />
            <line x1="28" y1="42" x2="24" y2="52" stroke="url(#rainGrad)" strokeWidth="3" strokeLinecap="round" />
            <line x1="36" y1="42" x2="32" y2="52" stroke="url(#rainGrad)" strokeWidth="3" strokeLinecap="round" />
            <line x1="44" y1="42" x2="40" y2="52" stroke="url(#rainGrad)" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {/* ── 8. Freezing Rain / Freezing Drizzle / Snow ── */}
        {(effectiveType === 'freezing_rain' ||
          effectiveType === 'freezing_drizzle' ||
          effectiveType === 'snow_light' ||
          effectiveType === 'snow_moderate' ||
          effectiveType === 'snow_heavy' ||
          effectiveType === 'snow_grains' ||
          effectiveType === 'snow_showers') && (
          <g>
            <path
              d="M48 36H22C17.6 36 14 32.4 14 28C14 23.9 17.1 20.5 21.1 20.1C22.6 14.9 27.5 11 33.3 11C40.2 11 45.8 16.6 45.8 23.5C49.5 23.8 52.5 27 52.5 30.8C52.5 33.7 50.5 36 48 36Z"
              fill="url(#cloudFront)"
            />
            {/* Snowflakes */}
            <circle cx="21" cy="44" r="2.5" fill="#93C5FD" />
            <circle cx="33" cy="44" r="2.5" fill="#60A5FA" />
            <circle cx="45" cy="44" r="2.5" fill="#93C5FD" />
            <circle cx="27" cy="51" r="2" fill="#60A5FA" />
            <circle cx="39" cy="51" r="2" fill="#93C5FD" />
          </g>
        )}

        {/* ── 9. Thunderstorm & Hail ── */}
        {(effectiveType === 'thunderstorm' || effectiveType === 'thunderstorm_hail') && (
          <g>
            <path
              d="M49 34H21C16.6 34 13 30.4 13 26C13 21.9 16.1 18.5 20.1 18.1C21.6 12.9 26.5 9 32.3 9C39.2 9 44.8 14.6 44.8 21.5C48.5 21.8 51.5 25 51.5 28.8C51.5 31.7 50.5 34 49 34Z"
              fill="url(#cloudDark)"
            />
            {/* Golden Lightning Bolt */}
            <path
              d="M32 32L24 44H31L28 55L40 40H33L36 32H32Z"
              fill="url(#lightningGrad)"
              stroke="#D97706"
              strokeWidth="0.8"
            />
            {effectiveType === 'thunderstorm_hail' && (
              <>
                <circle cx="18" cy="48" r="2" fill="#BAE6FD" />
                <circle cx="44" cy="48" r="2" fill="#BAE6FD" />
              </>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
