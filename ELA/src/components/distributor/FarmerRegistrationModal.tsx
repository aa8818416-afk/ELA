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
      // Wait a moment for server to revalidate and refresh UI
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-amber-600 hover:bg-amber-500 text-white font-medium px-4 py-2 rounded-xl transition-all flex items-center gap-2"
      >
        <UserPlus className="w-5 h-5" />
        تسجيل فلاح جديد
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 left-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <h3 className="text-xl font-bold text-white mb-6">تسجيل فلاح جديد</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* الاسم */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              الاسم بالكامل
            </label>
            <input
              name="fullName"
              type="text"
              required
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="مثال: محمد أحمد"
            />
          </div>

          {/* الهاتف */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              رقم الهاتف
            </label>
            <input
              name="phone"
              type="tel"
              required
              dir="ltr"
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-right"
              placeholder="01xxxxxxxxx"
            />
          </div>

          {/* القرية — Dropdown إجباري لو متعدد، يُخفى لو قرية واحدة (تُورَّث تلقائيًا) */}
          {requireVillageSelection ? (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                القرية <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <select
                  name="village"
                  required
                  defaultValue=""
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none"
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
            /* قرية واحدة أو بدون قرية — تُورَّث تلقائيًا، نمرر القيمة المخفية للـ action */
            supervisedVillages.length === 1 && (
              <input type="hidden" name="village" value={supervisedVillages[0]} />
            )
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-xl p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-amber-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 mt-2 flex items-center justify-center gap-2 transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "حفظ بيانات الفلاح"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
