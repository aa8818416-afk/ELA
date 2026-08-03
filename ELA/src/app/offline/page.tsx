"use client";

import { WifiOff, RefreshCw } from "lucide-react";

export default function OfflinePage() {
    return (
        <div
            className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center"
            style={{ fontFamily: "'Cairo', sans-serif" }}
        >
            {/* Animated icon */}
            <div className="relative mb-8">
                <div className="w-28 h-28 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center shadow-2xl">
                    <WifiOff className="w-14 h-14 text-slate-400" />
                </div>
                {/* Pulse rings */}
                <span className="absolute inset-0 rounded-full border-2 border-slate-600 animate-ping opacity-20" />
            </div>

            {/* Title */}
            <h1 className="text-white text-2xl font-bold mb-3">
                انقطع الاتصال بالإنترنت
            </h1>

            {/* Subtitle */}
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-10">
                تعذّر الاتصال بالخادم. تأكد من اتصال جهازك بالإنترنت ثم حاول مرة أخرى.
            </p>

            {/* Retry button */}
            <button
                onClick={() => {
                    if (window.history.length > 1) {
                        window.history.back();
                    } else {
                        window.location.href = "/";
                    }
                }}
                className="flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold px-8 py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-900/40"
            >
                <RefreshCw className="w-5 h-5" />
                إعادة المحاولة
            </button>

            {/* Footer hint */}
            <p className="text-slate-600 text-xs mt-8">
                سيتم استعادة جلستك تلقائياً عند الاتصال
            </p>
        </div>
    );
}
