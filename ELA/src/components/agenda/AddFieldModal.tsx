'use client';

import { useState } from 'react';
import { Plus, X, Loader2, Sprout, MapPin, Layers, Droplets } from 'lucide-react';
import { EGYPT_CENTERS_COORDINATES } from '@/data/egyptCenters';

interface AddFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddFieldModal({ isOpen, onClose, onSuccess }: AddFieldModalProps) {
  const [fieldName, setFieldName] = useState('');
  const [cropType, setCropType] = useState('طماطم');
  const [plantingDate, setPlantingDate] = useState(new Date().toISOString().split('T')[0]);
  const [areaFeddan, setAreaFeddan] = useState('1');
  const [governorate, setGovernorate] = useState('الدقهلية');
  const [center, setCenter] = useState('المنصورة');
  const [soilType, setSoilType] = useState('طينية');
  const [irrigationType, setIrrigationType] = useState('غمر');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Filter centers based on governorate
  const availableCenters = EGYPT_CENTERS_COORDINATES.filter((c) => c.governorate === governorate);
  const governorates = Array.from(new Set(EGYPT_CENTERS_COORDINATES.map((c) => c.governorate)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/farmer/field', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_name: fieldName || `حقل ${cropType}`,
          crop_type: cropType,
          planting_date: plantingDate,
          area_feddan: areaFeddan,
          governorate,
          center,
          soil_type: soilType,
          irrigation_type: irrigationType,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة المحصول');

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Sprout className="w-5 h-5" />
            </div>
            <h3 className="text-white font-bold text-lg">إضافة أرض / محصول جديد 🌾</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-2xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* اسم الحقل + نوع المحصول */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1">اسم الأرض / الحقل</label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="مثال: أرض الجمعية"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">نوع المحصول *</label>
              <input
                type="text"
                value={cropType}
                onChange={(e) => setCropType(e.target.value)}
                placeholder="مثال: طماطم، قمح..."
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* تاريخ الزراعة + المساحة */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1">تاريخ الزراعة</label>
              <input
                type="date"
                value={plantingDate}
                onChange={(e) => setPlantingDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">المساحة (بالفدان)</label>
              <input
                type="number"
                step="0.25"
                value={areaFeddan}
                onChange={(e) => setAreaFeddan(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          {/* المحافظة والمركز */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium flex items-center gap-1 mb-1">
                <MapPin className="w-3 h-3 text-emerald-400" /> المحافظة
              </label>
              <select
                value={governorate}
                onChange={(e) => {
                  setGovernorate(e.target.value);
                  const firstCenter = EGYPT_CENTERS_COORDINATES.find((c) => c.governorate === e.target.value);
                  if (firstCenter) setCenter(firstCenter.center);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-emerald-500 outline-none"
              >
                {governorates.map((gov) => (
                  <option key={gov} value={gov}>
                    {gov}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">المركز</label>
              <select
                value={center}
                onChange={(e) => setCenter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-emerald-500 outline-none"
              >
                {availableCenters.map((c) => (
                  <option key={c.center} value={c.center}>
                    {c.center}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* التربة ونظام الري */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium flex items-center gap-1 mb-1">
                <Layers className="w-3 h-3 text-amber-400" /> نوع التربة
              </label>
              <select
                value={soilType}
                onChange={(e) => setSoilType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-emerald-500 outline-none"
              >
                <option value="طينية">طينية</option>
                <option value="رملية">رملية</option>
                <option value="صفراء">صفراء (مخلوطة)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-300 font-medium flex items-center gap-1 mb-1">
                <Droplets className="w-3 h-3 text-blue-400" /> طريقة الري
              </label>
              <select
                value={irrigationType}
                onChange={(e) => setIrrigationType(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-emerald-500 outline-none"
              >
                <option value="غمر">غمر (راحة)</option>
                <option value="تنقيط">تنقيط</option>
                <option value="رش">رش محوري/محمول</option>
              </select>
            </div>
          </div>

          {/* Submit button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-2xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ المحصول في الأجندة 🌱'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
