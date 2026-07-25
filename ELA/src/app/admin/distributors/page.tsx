"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, DollarSign, Wallet, Clock, MapPin,
  KeyRound, Copy, Loader2, Eye, EyeOff, RefreshCw, X
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { toggleDistributorStatus, settleDistributorWallet } from "@/app/actions/admin-distributors";

type DistributorStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

type DistributorWithProfile = {
  profile_id: string;
  active_status: boolean;
  wallet_balance: number;
  pending_commission: number;
  village: string | null;
  full_name: string | null;
  email: string | null;
  governorate: string | null;
  center: string | null;
  landmark: string | null;
  main_road: string | null;
  latitude: number | null;
  longitude: number | null;
  supervised_villages: string[] | null;
  total_acres: number | null;
  status: DistributorStatus;
  profiles: {
    full_name: string | null;
    phone: string | null;
  };
};

// ---- مودال مراجعة تفاصيل الموزع ----
function DistributorDetailsModal({
  dist,
  onClose,
  onApprove,
  onReject,
}: {
  dist: DistributorWithProfile;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);

  async function handleAction(action: "approve" | "reject") {
    setLoading(action);
    await fetch(`/api/admin/distributors/${dist.profile_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    action === "approve" ? onApprove() : onReject();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <h3 className="text-lg font-bold text-slate-800">مراجعة طلب الموزع</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* بيانات شخصية */}
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">البيانات الشخصية</h4>
            <InfoRow label="الاسم الكامل" value={dist.full_name || dist.profiles?.full_name} />
            <InfoRow label="البريد الإلكتروني" value={dist.email} dir="ltr" />
            <InfoRow label="الهاتف" value={dist.profiles?.phone} dir="ltr" />
          </section>

          {/* بيانات العنوان */}
          <section className="space-y-2 pt-3 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">العنوان</h4>
            <InfoRow label="المحافظة" value={dist.governorate} />
            <InfoRow label="المركز" value={dist.center} />
            <InfoRow label="القرية" value={dist.village} />
            <InfoRow label="الطريق الرئيسي" value={dist.main_road} />
            <InfoRow label="المعلم المميز" value={dist.landmark} />
            {dist.latitude && dist.longitude && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 min-w-28">الموقع (GPS)</span>
                <a
                  href={`https://maps.google.com/?q=${dist.latitude},${dist.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline font-mono text-xs"
                >
                  <MapPin className="w-3 h-3" />
                  {dist.latitude.toFixed(5)}, {dist.longitude.toFixed(5)}
                </a>
              </div>
            )}
          </section>

          {/* بيانات الإشراف */}
          <section className="space-y-2 pt-3 border-t border-slate-100">
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">معلومات الإشراف</h4>
            <InfoRow label="إجمالي الفدادين" value={dist.total_acres ? `${dist.total_acres} فدان` : undefined} />
            {dist.supervised_villages && dist.supervised_villages.length > 0 && (
              <div className="flex gap-2 text-sm">
                <span className="text-slate-500 min-w-28 shrink-0">القرى المشرف عليها</span>
                <div className="flex flex-wrap gap-1">
                  {dist.supervised_villages.map((v) => (
                    <span key={v} className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-xs">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* أزرار القرار */}
          {dist.status === "PENDING_APPROVAL" && (
            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => handleAction("reject")}
                disabled={!!loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-all disabled:opacity-50"
              >
                {loading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                رفض الطلب
              </button>
              <button
                onClick={() => handleAction("approve")}
                disabled={!!loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-all disabled:opacity-50"
              >
                {loading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                قبول الطلب
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  dir,
}: {
  label: string;
  value?: string | null;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-slate-500 min-w-28 shrink-0">{label}</span>
      <span className={`text-slate-800 font-medium ${dir === "ltr" ? "direction-ltr font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

// ---- مودال إعادة تعيين كلمة مرور الموزع ----
function ResetPasswordModal({
  dist,
  onClose,
}: {
  dist: DistributorWithProfile;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    setLoading(true);
    const res = await fetch(`/api/admin/distributors/${dist.profile_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset_password" }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setNewPassword(data.new_password);
    } else {
      alert("خطأ: " + data.error);
    }
  }

  function handleCopy() {
    if (newPassword) {
      navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">إعادة تعيين كلمة مرور الموزع</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-slate-600 text-sm">
            الموزع: <span className="font-bold text-slate-800">{dist.full_name || dist.profiles?.full_name}</span>
          </p>

          {!newPassword ? (
            <>
              <p className="text-slate-500 text-sm">
                سيتم توليد كلمة مرور جديدة عشوائية. أعطِها للموزع ليدخل بها حسابه.
              </p>
              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-all"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                توليد كلمة مرور جديدة
              </button>
            </>
          ) : (
            <>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs text-amber-600 mb-2 font-medium">كلمة المرور الجديدة:</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 font-mono text-lg font-bold text-amber-800 tracking-wider" dir="ltr">
                    {showPassword ? newPassword : "••••••••••"}
                  </span>
                  <button onClick={() => setShowPassword((p) => !p)} className="text-amber-500 hover:text-amber-700">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button onClick={handleCopy} className="text-amber-500 hover:text-amber-700">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-amber-600 text-xs">⚠️ هذه الكلمة لن تظهر مرة أخرى. أعطِها للموزع الآن.</p>
              <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 rounded-xl text-sm transition-all">
                إغلاق
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- الصفحة الرئيسية ----
export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<DistributorWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "all">("pending");
  const [selectedDist, setSelectedDist] = useState<DistributorWithProfile | null>(null);
  const [resetDist, setResetDist] = useState<DistributorWithProfile | null>(null);
  const supabase = createClient();

  const fetchDistributors = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("distributors")
      .select(`
        profile_id, active_status, wallet_balance, pending_commission, village,
        full_name, email, governorate, center, landmark, main_road,
        latitude, longitude, supervised_villages, total_acres, status,
        profiles(full_name, phone)
      `)
      .order("status", { ascending: true });

    if (!error && data) setDistributors(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchDistributors(); }, [fetchDistributors]);

  const pendingList = distributors.filter((d) => d.status === "PENDING_APPROVAL");
  const allList = distributors;
  const displayList = activeTab === "pending" ? pendingList : allList;

  async function handleToggleStatus(profileId: string, currentStatus: boolean) {
    await toggleDistributorStatus(profileId, currentStatus);
    fetchDistributors();
  }

  async function handleSettle(profileId: string) {
    if (confirm("هل أنت متأكد من تسوية هذه المحفظة؟")) {
      await settleDistributorWallet(profileId);
      fetchDistributors();
    }
  }

  const statusBadge = (status: DistributorStatus) => {
    if (status === "PENDING_APPROVAL") return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" /> قيد المراجعة</span>;
    if (status === "APPROVED") return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 border border-green-200"><CheckCircle2 className="w-3 h-3" /> معتمد</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-700 border border-red-200"><XCircle className="w-3 h-3" /> مرفوض</span>;
  };

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">إدارة الموزعين</h2>
          {pendingList.length > 0 && (
            <p className="text-amber-600 text-sm mt-1 font-medium">
              ⏳ {pendingList.length} طلب قيد المراجعة
            </p>
          )}
        </div>

        {/* تبويبات */}
        <div className="flex gap-2 bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "pending"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500" />
            طلبات الانتظار
            {pendingList.length > 0 && (
              <span className="bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {pendingList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "all"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            جميع الموزعين
          </button>
        </div>
      </div>

      {/* جدول الموزعين */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">الموزع</th>
                <th className="px-6 py-4 font-medium">المنطقة</th>
                <th className="px-6 py-4 font-medium">الفدادين</th>
                <th className="px-6 py-4 font-medium">الحالة</th>
                <th className="px-6 py-4 font-medium">الرصيد</th>
                <th className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">جاري التحميل...</td></tr>
              ) : displayList.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                  {activeTab === "pending" ? "لا توجد طلبات انتظار." : "لا يوجد موزعون مسجلون."}
                </td></tr>
              ) : (
                displayList.map((dist) => (
                  <tr key={dist.profile_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{dist.full_name || dist.profiles?.full_name || "—"}</div>
                      <div className="text-xs text-slate-500" dir="ltr">{dist.profiles?.phone || dist.email || "—"}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {dist.governorate && dist.center
                        ? `${dist.governorate} — ${dist.center}`
                        : dist.village || "غير محددة"}
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">
                      {dist.total_acres ? `${dist.total_acres} فدان` : "—"}
                    </td>
                    <td className="px-6 py-4">{statusBadge(dist.status)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-green-600 font-bold text-sm">
                        <Wallet className="w-3.5 h-3.5" />
                        <span>{dist.wallet_balance} ج.م</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* مراجعة التفاصيل (مع قبول/رفض للطلبات المعلقة) */}
                        {dist.status === "PENDING_APPROVAL" ? (
                          <button
                            onClick={() => setSelectedDist(dist)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            مراجعة وقرار
                          </button>
                        ) : (
                          <>
                            {dist.status === "APPROVED" && (
                              <button
                                onClick={() => handleToggleStatus(dist.profile_id, dist.active_status)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  dist.active_status
                                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                                    : "bg-red-50 text-red-700 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                                }`}
                              >
                                {dist.active_status ? <><CheckCircle2 className="w-3.5 h-3.5" /> نشط</> : <><XCircle className="w-3.5 h-3.5" /> موقوف</>}
                              </button>
                            )}
                            <button
                              onClick={() => setResetDist(dist)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-all"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              إعادة تعيين الباسورد
                            </button>
                            {dist.status === "APPROVED" && dist.wallet_balance > 0 && (
                              <button
                                onClick={() => handleSettle(dist.profile_id)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                                تسوية الرصيد
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* مودال مراجعة التفاصيل */}
      {selectedDist && (
        <DistributorDetailsModal
          dist={selectedDist}
          onClose={() => setSelectedDist(null)}
          onApprove={fetchDistributors}
          onReject={fetchDistributors}
        />
      )}

      {/* مودال إعادة تعيين كلمة مرور الموزع */}
      {resetDist && (
        <ResetPasswordModal dist={resetDist} onClose={() => setResetDist(null)} />
      )}
    </div>
  );
}
