"use client";

import { useState } from "react";
import { registerFarmer } from "@/app/actions/distributor";
import { X, UserPlus, Loader2, ChevronDown } from "lucide-react";

interface FarmerRegistrationModalProps {
  /** قائمة القرى المشرف عليها من قِبل هذا الموزع */
  supervisedVillages: string[];
}

export default function FarmerRegistrationModal({ supervisedVillages }: FarmerRegistrationModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // نحدد ما إذا كان يجب إظهار قائمة اختيار القرية
  const requireVillageSelection = supervisedVillages.length > 1;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await registerFarmer(formData);

    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setIsOpen(false);
      setIsLoading(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all flex items-center gap-2 border border-emerald-700 shadow-xs active:scale-95"
      >
        <UserPlus className="w-4 h-4" />
        تسجيل فلاح جديد
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 left-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-bold text-slate-900 mb-5">تسجيل فلاح جديد</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* الاسم */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الاسم بالكامل
            </label>
            <input
              name="fullName"
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              placeholder="مثال: محمد أحمد"
            />
          </div>

          {/* الهاتف */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رقم الهاتف
            </label>
            <input
              name="phone"
              type="tel"
              required
              dir="ltr"
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-right font-medium"
              placeholder="01xxxxxxxxx"
            />
          </div>

          {/* القرية */}
          {requireVillageSelection ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                القرية <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  name="village"
                  required
                  defaultValue=""
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium appearance-none"
                >
                  <option value="" disabled>اختر القرية...</option>
                  {supervisedVillages.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          ) : (
            supervisedVillages.length === 1 && (
              <input type="hidden" name="village" value={supervisedVillages[0]} />
            )
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-xs mt-2 flex items-center justify-center gap-2 transition-all shadow-xs border border-emerald-700 active:scale-95"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "حفظ بيانات الفلاح"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
