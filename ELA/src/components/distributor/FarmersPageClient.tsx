"use client";

import { useState, useMemo } from "react";
import { UserPlus, Loader2, Copy, CheckCircle2, RefreshCw, X, Phone, User, MessageCircle, RotateCcw, Search, Check, Layers, MapPin } from "lucide-react";

type CreatedFarmer = {
  id: string;
  full_name: string;
  phone: string;
  pin: string;
};

type ResetResult = {
  farmerId: string;
  farmerName: string;
  newPin: string;
};

type FarmerRow = {
  profile_id: string;
  profiles: { full_name: string | null; phone: string | null } | null;
};

// =============================================
// مودال إضافة فلاح جديد
// =============================================
function AddFarmerModal({
  onAdded,
  supervisedVillages,
}: {
  onAdded: (farmer: FarmerRow) => void;
  supervisedVillages: string[];
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedVillage, setSelectedVillage] = useState("");
  const [soilType, setSoilType] = useState<"طينية" | "رملية">("طينية");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedFarmer | null>(null);
  const [copied, setCopied] = useState<"phone" | "pin" | null>(null);

  const requireVillageSelection = supervisedVillages.length > 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!soilType) {
      setError("يرجى تحديد نوع التربة.");
      return;
    }

    setLoading(true);

    const village =
      supervisedVillages.length === 1
        ? supervisedVillages[0]
        : selectedVillage || undefined;

    const res = await fetch("/api/distributor/farmers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, phone, village, soil_type: soilType }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "حدث خطأ. يرجى المحاولة مرة أخرى.");
      return;
    }

    setCreated(data.farmer);
    onAdded({
      profile_id: data.farmer.id,
      profiles: { full_name: data.farmer.full_name, phone: data.farmer.phone },
    });
  }

  function handleCopy(text: string, type: "phone" | "pin") {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleClose() {
    setOpen(false);
    setFullName("");
    setPhone("");
    setSelectedVillage("");
    setSoilType("طينية");
    setError(null);
    setCreated(null);
  }

  return (
    <>
      <button
        id="add-farmer-btn"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all shadow-xs border border-emerald-700 active:scale-95"
      >
        <UserPlus className="w-4 h-4" />
        <span>إضافة مزارع جديد</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">تسجيل مزارع جديد بالقرية</h3>
              </div>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {!created ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                      <User className="w-3 h-3 text-emerald-700" /> اسم الفلاح كاملاً
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="مثال: الحاج أحمد عبد الله"
                      required
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-700" /> رقم الهاتف المحمول
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      required
                      inputMode="numeric"
                      dir="ltr"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {requireVillageSelection && (
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">
                        القرية التابعة <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={selectedVillage}
                        onChange={(e) => setSelectedVillage(e.target.value)}
                        required
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="" disabled>اختر القرية...</option>
                        {supervisedVillages.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Soil Type Selector */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">
                      نوع التربة <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["طينية", "رملية"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSoilType(type)}
                          className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                            soilType === type
                              ? "bg-emerald-600 border-emerald-700 text-white shadow-xs"
                              : "bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100"
                          }`}
                        >
                          {type === "طينية" ? "🌾 طينية (دلتا/وادي)" : "🏜️ رملية / صحراوية"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl py-3 text-xs transition-all shadow-xs border border-emerald-700 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري إنشاء الحساب...</span>
                      </>
                    ) : (
                      "إنشاء الحساب وتوليد الـ PIN"
                    )}
                  </button>
                </form>
              ) : (
                /* Created Success Box */
                <div className="space-y-4 text-center">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200 shadow-2xs">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">تم إنشاء حساب الفلاح بنجاح!</h4>
                    <p className="text-slate-500 text-xs mt-0.5">سلم هذه البيانات للفلاح لتسجيل الدخول في منصة ELA</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-right">
                    <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-slate-200">
                      <span className="text-xs text-slate-500">رقم الهاتف</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-mono text-xs font-bold" dir="ltr">{created.phone}</span>
                        <button
                          onClick={() => handleCopy(created.phone, "phone")}
                          className="text-slate-400 hover:text-emerald-700"
                        >
                          {copied === "phone" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200 rounded-xl px-3 py-2">
                      <span className="text-xs text-emerald-900 font-bold">الرمز السري (PIN)</span>
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-950 font-mono text-lg font-black tracking-widest" dir="ltr">{created.pin}</span>
                        <button
                          onClick={() => handleCopy(created.pin, "pin")}
                          className="text-emerald-700 hover:text-emerald-900"
                        >
                          {copied === "pin" ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl py-2.5 text-xs transition-all border border-slate-950 shadow-xs"
                  >
                    تم الحفظ وإغلاق
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================
// مودال تصفير رمز PIN
// =============================================
function ResetPinModal({
  farmer,
  onClose,
  onPinReset,
}: {
  farmer: FarmerRow;
  onClose: () => void;
  onPinReset: (result: ResetResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/distributor/farmers/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmerId: farmer.profile_id }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "حدث خطأ أثناء تصفير الرمز.");
      return;
    }

    const resetData: ResetResult = {
      farmerId: farmer.profile_id,
      farmerName: farmer.profiles?.full_name || "الفلاح",
      newPin: data.newPin,
    };
    setResult(resetData);
    onPinReset(resetData);
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.newPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-center">
        {!result ? (
          <>
            <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto border border-amber-200">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">تصفير رمز دخول PIN</h4>
              <p className="text-xs text-slate-500 mt-1">
                هل أنت متأكد من تصفير رمز دخول <strong className="text-slate-900">{farmer.profiles?.full_name}</strong>؟
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-2.5 rounded-xl">
                ⚠️ {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={onClose}
                className="bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs py-2.5 rounded-xl border border-slate-300 shadow-xs"
              >
                إلغاء
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2.5 rounded-xl border border-amber-700 shadow-xs flex items-center justify-center gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "نعم، تصفير الآن"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto border border-emerald-200">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">تم توليد رمز PIN جديد!</h4>
              <p className="text-xs text-slate-500 mt-0.5">{farmer.profiles?.full_name}</p>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <span className="text-xs text-emerald-800 font-bold block mb-1">الرمز السري الجديد:</span>
              <span className="font-mono text-2xl font-black text-emerald-950 tracking-widest">{result.newPin}</span>
            </div>

            <button
              onClick={handleCopy}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl border border-emerald-700 shadow-xs flex items-center justify-center gap-1.5"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "تم نسخ الرمز!" : "نسخ الرمز السري"}
            </button>

            <button
              onClick={onClose}
              className="w-full text-xs text-slate-500 hover:text-slate-800 font-bold py-1"
            >
              إغلاق
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// =============================================
// المكون الرئيسي: صفحة إدارة الفلاحين
// =============================================
export default function FarmersPageClient({
  initialFarmers,
  supervisedVillages,
}: {
  initialFarmers: FarmerRow[];
  supervisedVillages: string[];
}) {
  const [farmers, setFarmers] = useState<FarmerRow[]>(initialFarmers);
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<FarmerRow | null>(null);

  const filteredFarmers = useMemo(() => {
    if (!search.trim()) return farmers;
    const q = search.toLowerCase();
    return farmers.filter(
      (f) =>
        f.profiles?.full_name?.toLowerCase().includes(q) ||
        f.profiles?.phone?.includes(q)
    );
  }, [farmers, search]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Add Button */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">سجل مزارعي القرية التابعين لك</h2>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
              {farmers.length} مزارع مسجل
            </span>
          </div>
          <p className="text-slate-500 text-xs mt-1">
            إدارة الحسابات، تصفير رمز الدخول PIN، والتواصل الميداني السريع عبر الواتساب والاتصال
          </p>
        </div>

        <div className="flex items-center gap-3">
          <AddFarmerModal
            onAdded={(newFarmer) => setFarmers((prev) => [newFarmer, ...prev])}
            supervisedVillages={supervisedVillages}
          />
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="bg-white p-3 border border-slate-200/90 rounded-2xl shadow-xs flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 بحث سريع باسم المزارع أو رقم هاتفه..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table: Model A Base with Model B Direct Action Columns */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        {filteredFarmers.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            {search ? "لم يتم العثور على مزارع يطابق معايير البحث." : "لا يوجد مزارعين مسجلين حتى الآن."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="p-4">اسم المزارع</th>
                  <th className="p-4">رقم الهاتف</th>
                  <th className="p-4">رمز الدخول PIN</th>
                  <th className="p-4 text-center">تواصل سريع (واتساب / اتصال)</th>
                  <th className="p-4 text-center">إجراءات الحساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredFarmers.map((f) => {
                  const name = f.profiles?.full_name || "بدون اسم";
                  const phone = f.profiles?.phone || "";
                  const whatsappUrl = phone
                    ? `https://wa.me/2${phone}?text=${encodeURIComponent(
                        `السلام عليكم يا حاج ${name}، بخصوص حسابك في منصة ELA الزراعية.`
                      )}`
                    : null;

                  return (
                    <tr key={f.profile_id} className="hover:bg-slate-50/80 transition-all">
                      {/* Name */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold flex items-center justify-center text-xs shadow-2xs">
                            {name[0]}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block text-sm">{name}</span>
                            <span className="text-[10px] text-slate-500">حساب مزارع معتمد</span>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="p-4">
                        {phone ? (
                          <span className="font-mono font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200" dir="ltr">
                            {phone}
                          </span>
                        ) : (
                          <span className="text-slate-400">غير مسجل</span>
                        )}
                      </td>

                      {/* PIN Status */}
                      <td className="p-4">
                        <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          ✓ نشط ومفعل
                        </span>
                      </td>

                      {/* Addition from Model B: Direct WhatsApp & Call buttons in row */}
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {phone ? (
                            <>
                              <a
                                href={whatsappUrl || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-3 py-1.5 rounded-xl border border-emerald-200 shadow-2xs transition-all active:scale-95"
                                title="مراسلة عبر الواتساب"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                                <span>واتساب</span>
                              </a>
                              <a
                                href={`tel:${phone}`}
                                className="inline-flex items-center gap-1 bg-white hover:bg-slate-50 text-slate-700 font-bold px-3 py-1.5 rounded-xl border border-slate-300 shadow-2xs transition-all active:scale-95"
                                title="اتصال مباشر"
                              >
                                <Phone className="w-3.5 h-3.5 text-slate-500" />
                                <span>اتصال</span>
                              </a>
                            </>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </div>
                      </td>

                      {/* PIN Reset Button */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => setResetTarget(f)}
                          className="bg-white hover:bg-amber-50 text-amber-800 font-bold px-3 py-1.5 rounded-xl border border-amber-300 shadow-2xs transition-all flex items-center gap-1.5 mx-auto active:scale-95 text-[11px]"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" />
                          <span>تصفير PIN</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reset PIN Modal */}
      {resetTarget && (
        <ResetPinModal
          farmer={resetTarget}
          onClose={() => setResetTarget(null)}
          onPinReset={() => {}}
        />
      )}
    </div>
  );
}
