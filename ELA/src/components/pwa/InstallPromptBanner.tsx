"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Download, X, Share, PlusSquare, Sparkles } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function InstallPromptBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Service Worker Management
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      if (process.env.NODE_ENV !== "production") {
        // In development mode, actively unregister service workers and clear caches
        // to prevent hydration mismatches and stale chunk serving.
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
            console.log("[PWA Dev] Unregistered Service Worker:", registration.scope);
          }
        });
        if ("caches" in window) {
          caches.keys().then((keys) => {
            for (const key of keys) {
              caches.delete(key);
              console.log("[PWA Dev] Cleared Cache:", key);
            }
          });
        }
      } else {
        // In production, register the Service Worker
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[PWA] Service Worker registered successfully:", reg.scope);
          })
          .catch((err) => {
            console.warn("[PWA] Service Worker registration failed:", err);
          });
      }
    }

    // 2. Check if already running in standalone mode (installed)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 3. Check dismiss preference (dismiss for 3 days)
    const lastDismissed = localStorage.getItem("ela_pwa_dismissed");
    if (lastDismissed) {
      const daysSinceDismissed = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 3) {
        return;
      }
    }

    // 4. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // 5. Handle Android / Chrome / Desktop install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // If iOS and not standalone, show after a short delay
    if (isIosDevice && !isStandalone) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 4000);
      return () => clearTimeout(timer);
    }

    // Listen for successful installation
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setIsVisible(false);
      setDeferredPrompt(null);
      console.log("[PWA] ELA application successfully installed");
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }

    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === "accepted") {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setShowIOSInstructions(false);
    localStorage.setItem("ela_pwa_dismissed", Date.now().toString());
  };

  if (isInstalled || !isVisible) {
    return null;
  }

  return (
    <>
      {/* Floating Smart Install Banner */}
      <aside 
        aria-label="تثبيت تطبيق ELA" 
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[9999] animate-in fade-in slide-in-from-bottom-5 duration-300"
      >
        <div className="relative overflow-hidden rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-emerald-500/30 p-4 shadow-2xl shadow-emerald-950/60 text-white">
          {/* Top subtle glow accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-400 to-teal-400" />

          {/* Close button */}
          <button
            onClick={handleDismiss}
            aria-label="إغلاق التنبيه"
            className="absolute top-3 left-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3.5 pt-1">
            {/* App Icon */}
            <div className="relative w-13 h-13 shrink-0 rounded-xl overflow-hidden border border-emerald-500/40 shadow-md bg-emerald-950 flex items-center justify-center">
              <Image
                src="/icons/icon-192x192.jpg"
                alt="ELA Logo"
                width={52}
                height={52}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Content */}
            <div className="flex-1 pr-1">
              <div className="flex items-center gap-1.5 mb-0.5">
                <h3 className="font-bold text-sm text-emerald-300">تطبيق ELA</h3>
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" /> تثبيت فوري
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                صديقك وخبير مزرعتك — ثبّت التطبيق للوصول السريع بدون متصفح.
              </p>

              {/* Action Buttons */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleInstallClick}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white font-bold text-xs py-2 px-3.5 rounded-xl shadow-lg shadow-emerald-950/50 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تثبيت التطبيق الآن</span>
                </button>
                <button
                  onClick={handleDismiss}
                  className="text-xs text-slate-400 hover:text-slate-200 py-2 px-3 rounded-xl hover:bg-slate-800 transition-colors"
                >
                  لاحقاً
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div 
          className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowIOSInstructions(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-emerald-500/40 p-6 text-white text-center shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center shadow-lg">
              <Image
                src="/icons/icon-192x192.jpg"
                alt="ELA Logo"
                width={56}
                height={56}
                className="w-full h-full object-contain rounded-2xl"
              />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">تثبيت ELA على الآيفون</h3>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              لتثبيت التطبيق على شاشة هاتفك الرئيسية، اتبع الخطوتين التاليتين:
            </p>

            <div className="space-y-3 text-right text-xs bg-slate-800/80 rounded-2xl p-4 border border-slate-700/60">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold text-sm">
                  1
                </div>
                <div className="flex-1 text-slate-200 flex items-center justify-between">
                  <span>اضغط على زر المشاركة</span>
                  <Share className="w-4 h-4 text-sky-400 inline" />
                </div>
              </div>

              <div className="h-px bg-slate-700/50" />

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 font-bold text-sm">
                  2
                </div>
                <div className="flex-1 text-slate-200 flex items-center justify-between">
                  <span>اختر &quot;إضافة إلى الشاشة الرئيسية&quot;</span>
                  <PlusSquare className="w-4 h-4 text-emerald-400 inline" />
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSInstructions(false)}
              className="mt-5 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer"
            >
              فهمت ذلك
            </button>
          </div>
        </div>
      )}
    </>
  );
}
