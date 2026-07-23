"use client";

import { useState } from "react";
import { MapPin, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface LocationPickerProps {
  onLocation: (lat: number, lng: number) => void;
  latitude?: number | null;
  longitude?: number | null;
}

type Status = "idle" | "loading" | "success" | "error";

/**
 * زر استخراج الموقع الجغرافي تلقائياً عبر GPS المتصفح
 */
export default function LocationPicker({ onLocation, latitude, longitude }: LocationPickerProps) {
  const [status, setStatus] = useState<Status>(latitude && longitude ? "success" : "idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleGetLocation() {
    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMsg("المتصفح لا يدعم تحديد الموقع. يرجى استخدام متصفح حديث.");
      return;
    }

    setStatus("loading");
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        onLocation(lat, lng);
        setStatus("success");
      },
      (error) => {
        setStatus("error");
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMsg("تم رفض إذن الوصول للموقع. يرجى السماح للمتصفح بالوصول لبيانات الموقع والمحاولة مرة أخرى.");
            break;
          case error.POSITION_UNAVAILABLE:
            setErrorMsg("تعذر تحديد موقعك حالياً. تأكد من تفعيل GPS وحاول مجدداً.");
            break;
          case error.TIMEOUT:
            setErrorMsg("انتهت مهلة تحديد الموقع. يرجى المحاولة مرة أخرى.");
            break;
          default:
            setErrorMsg("حدث خطأ غير متوقع أثناء تحديد الموقع.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-300">
        الموقع الجغرافي (GPS) <span className="text-red-400">*</span>
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleGetLocation}
          disabled={status === "loading"}
          className={`
            flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl text-sm font-medium
            transition-all duration-200 border
            ${status === "success"
              ? "bg-green-600/20 border-green-500/40 text-green-400 hover:bg-green-600/30"
              : status === "error"
              ? "bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20"
              : "bg-blue-600/10 border-blue-500/40 text-blue-400 hover:bg-blue-600/20"
            }
            ${status === "loading" ? "cursor-not-allowed opacity-70" : "cursor-pointer"}
          `}
        >
          {status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
          {status === "success" && <CheckCircle2 className="w-4 h-4" />}
          {status === "error" && <AlertCircle className="w-4 h-4" />}
          {status === "idle" && <MapPin className="w-4 h-4" />}

          {status === "idle" && "اضغط لتحديد موقعك الحالي تلقائياً"}
          {status === "loading" && "جاري تحديد الموقع..."}
          {status === "success" && "تم تسجيل الموقع بنجاح ✓"}
          {status === "error" && "إعادة المحاولة"}
        </button>

        {/* عرض الإحداثيات */}
        {status === "success" && latitude && longitude && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-2.5 text-xs text-slate-300 flex items-center gap-2" dir="ltr">
            <MapPin className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </span>
          </div>
        )}

        {/* رسالة الخطأ */}
        {status === "error" && errorMsg && (
          <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-xs text-red-300">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <p className="text-xs text-slate-500">
          سيقوم النظام بتسجيل إحداثيات موقعك الدقيقة تلقائياً. لا يمكن إدخال الموقع يدوياً.
        </p>
      </div>
    </div>
  );
}
