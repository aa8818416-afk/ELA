"use client";

import { useState } from "react";
import { UserPlus, Loader2, Copy, CheckCircle2, RefreshCw, X, Phone, User } from "lucide-react";

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
    // إخطار الصفحة الأم لإضافة الفلاح للقائمة محلياً
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
        className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-green-900/30"
      >
        <UserPlus className="w-4 h-4" />
        <span>إضافة فلاح جديد</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
            {/* رأس المودال */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">إضافة فلاح جديد</h3>
              <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!created ? (
                // ---- نموذج الإدخال ----
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="farmer-name" className="block text-sm font-medium text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" /> اسم الفلاح
                    </label>
                    <input
                      id="farmer-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="اسم الفلاح كاملاً"
                      required
                      className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="farmer-phone" className="block text-sm font-medium text-slate-300 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> رقم الهاتف
                    </label>
                    <input
                      id="farmer-phone-input"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01xxxxxxxxx"
                      required
                      inputMode="numeric"
                      dir="ltr"
                      className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all"
                    />
                  </div>

                  {/* القرية — Dropdown إجباري لو متعدد، يُخفى لو قرية واحدة */}
                  {requireVillageSelection && (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-300">
                        القرية <span className="text-red-400">*</span>
                      </label>
                      <select
                        id="farmer-village-select"
                        value={selectedVillage}
                        onChange={(e) => setSelectedVillage(e.target.value)}
                        required
                        className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition-all"
                      >
                        <option value="" disabled>اختر القرية...</option>
                        {supervisedVillages.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* نوع التربة — إلزامي دائماً */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-300">
                      نوع التربة <span className="text-red-400">*</span>
                    </label>
                    <div className="flex gap-3">
                      {(["طينية", "رملية"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSoilType(type)}
                          className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                            soilType === type
                              ? "bg-green-600 border-green-500 text-white shadow-lg shadow-green-900/30"
                              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                          }`}
                        >
                          {type === "طينية" ? "🏔️ طينية" : "🏜️ رملية"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm">
                      ⚠️ {error}
                    </div>
                  )}

                  <button
                    id="confirm-add-farmer-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full bg-green-600 hover:bg-green-500 disabled:bg-green-900 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <><Loader2 className="w-4 h-4 animate-spin" /><span>جاري الإنشاء...</span></> : "إنشاء الحساب"}
                  </button>
                </form>
              ) : (
                // ---- عرض بيانات الدخول ----
                <div className="space-y-4">
                  <div className="text-center">
                    <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-2" />
                    <h4 className="text-lg font-bold text-white">تم إنشاء الحساب بنجاح!</h4>
                    <p className="text-slate-400 text-sm mt-1">أعطِ هذه البيانات للفلاح</p>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                    <p className="text-slate-300 text-sm font-medium">بيانات دخول الفلاح:</p>

                    <div className="flex items-center justify-between bg-slate-700/60 rounded-lg px-3 py-2">
                      <span className="text-xs text-slate-400">رقم الهاتف</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm" dir="ltr">{created.phone}</span>
                        <button onClick={() => handleCopy(created.phone, "phone")} className="text-slate-400 hover:text-white transition-colors" title="نسخ">
                          {copied === "phone" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                      <span className="text-xs text-amber-400">الرمز السري (PIN)</span>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-300 font-mono text-xl font-bold tracking-widest" dir="ltr">{created.pin}</span>
                        <button onClick={() => handleCopy(created.pin, "pin")} className="text-amber-400 hover:text-amber-200 transition-colors" title="نسخ">
                          {copied === "pin" ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-amber-300 text-xs">
                    ⚠️ هذا الرمز السري لن يظهر مجدداً. احتفظ به وأعطِه للفلاح الآن.
                  </div>

                  <button
                    onClick={handleClose}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl py-2.5 text-sm transition-all"
                  >
                    إغلاق
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
// زر إعادة تعيين PIN الفلاح
// =============================================
function ResetPinButton({
  farmerId,
  farmerName,
  onReset,
}: {
  farmerId: string;
  farmerName: string;
  onReset: (result: ResetResult) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (!confirm(`هل تريد إعادة تعيين الرمز السري للفلاح "${farmerName}"؟`)) return;
    setLoading(true);

    const res = await fetch("/api/distributor/farmers/reset-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farmer_profile_id: farmerId }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      alert("خطأ: " + (data.error || "حدث خطأ غير متوقع."));
      return;
    }

    onReset({ farmerId, farmerName, newPin: data.new_pin });
  }

  return (
    <button
      id={`reset-pin-btn-${farmerId}`}
      onClick={handleReset}
      disabled={loading}
      className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors text-xs font-medium disabled:opacity-50"
      title="إعادة تعيين الرمز السري"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      <span>تعيين PIN</span>
    </button>
  );
}

// =============================================
// مودال عرض PIN الجديد بعد إعادة التعيين
// =============================================
function ResetPinResultModal({
  result,
  onClose,
}: {
  result: ResetResult;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(result.newPin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4 text-center">
        <RefreshCw className="w-12 h-12 text-amber-400 mx-auto" />
        <div>
          <h4 className="text-lg font-bold text-white">تم تعيين رمز جديد!</h4>
          <p className="text-slate-400 text-sm mt-1">للفلاح: {result.farmerName}</p>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <span className="text-amber-300 font-mono text-2xl font-bold tracking-widest" dir="ltr">{result.newPin}</span>
          <button onClick={handleCopy} className="text-amber-400 hover:text-amber-200 transition-colors">
            {copied ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
          </button>
        </div>

        <p className="text-amber-300 text-xs">⚠️ أعطِ هذا الرمز للفلاح الآن. لن يظهر مرة أخرى.</p>

        <button
          onClick={onClose}
          className="w-full bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl py-2.5 text-sm transition-all"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}

// =============================================
// المكوّن الرئيسي: صفحة إدارة الفلاحين
// =============================================
export default function FarmersPageClient({
  initialFarmers,
  supervisedVillages,
}: {
  initialFarmers: FarmerRow[];
  supervisedVillages: string[];
}) {
  const [farmers, setFarmers] = useState<FarmerRow[]>(initialFarmers);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  function handleFarmerAdded(newFarmer: FarmerRow) {
    setFarmers((prev) => [newFarmer, ...prev]);
  }

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">إدارة الفلاحين</h2>
          <p className="text-slate-400 text-sm">
            الفلاحون المسجلون عن طريقك ({farmers.length} فلاح)
          </p>
        </div>
        <AddFarmerModal onAdded={handleFarmerAdded} supervisedVillages={supervisedVillages} />
      </div>

      {/* جدول الفلاحين */}
      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-slate-900 border-b border-slate-800">
              <tr>
                <th scope="col" className="px-6 py-4 font-medium">الاسم</th>
                <th scope="col" className="px-6 py-4 font-medium">رقم الهاتف</th>
                <th scope="col" className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {farmers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                    لا يوجد فلاحون مسجلون بعد. ابدأ بإضافة فلاح جديد.
                  </td>
                </tr>
              ) : (
                farmers.map((farmer) => {
                  const profile = farmer.profiles;
                  return (
                    <tr
                      key={farmer.profile_id}
                      className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-white">
                        {profile?.full_name || "غير محدد"}
                      </td>
                      <td className="px-6 py-4" dir="ltr">
                        {profile?.phone || "غير محدد"}
                      </td>
                      <td className="px-6 py-4">
                        <ResetPinButton
                          farmerId={farmer.profile_id}
                          farmerName={profile?.full_name || "الفلاح"}
                          onReset={setResetResult}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* مودال عرض PIN الجديد */}
      {resetResult && (
        <ResetPinResultModal
          result={resetResult}
          onClose={() => setResetResult(null)}
        />
      )}
    </div>
  );
}
