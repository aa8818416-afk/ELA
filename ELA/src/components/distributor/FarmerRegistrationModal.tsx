"use client";

import { useState } from "react";
import { registerFarmer } from "@/app/actions/distributor";
import { X, UserPlus, Loader2 } from "lucide-react";

export default function FarmerRegistrationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              القرية (اختياري)
            </label>
            <input
              name="village"
              type="text"
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              placeholder="اسم القرية"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                المحصول الحالي
              </label>
              <input
                name="currentCrop"
                type="text"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                placeholder="مثال: طماطم"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                مساحة الأرض (فدان)
              </label>
              <input
                name="landSize"
                type="number"
                step="0.1"
                min="0"
                className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-right"
                dir="ltr"
                placeholder="2.5"
              />
            </div>
          </div>

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
