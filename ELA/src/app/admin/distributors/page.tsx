"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CheckCircle2, XCircle, DollarSign, Wallet, Clock, MapPin,
  KeyRound, Copy, Loader2, Eye, EyeOff, RefreshCw, X, Search,
  TrendingUp, TrendingDown, Coins, PackageCheck, Filter,
  ArrowUpDown, FileText, CheckSquare, Square, Users, AlertCircle, Building2
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import {
  toggleDistributorStatus,
  settleDistributorWallet,
  settleDistributorSales
} from "@/app/actions/admin-distributors";

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

type OrderItem = {
  id: string;
  quantity: number;
  products?: {
    name_ar?: string;
    image_url?: string | null;
  } | null;
};

type Order = {
  id: string;
  distributor_id: string;
  status: string;
  payment_status: string;
  total_price: number;
  created_at: string;
  farmers?: {
    profiles?: {
      full_name?: string | null;
    } | null;
  } | null;
  order_items?: OrderItem[];
};

type TimeFrame = "1m" | "3m" | "6m" | "9m" | "1y" | "all";
type SortOption =
  | "default"
  | "collected_desc"
  | "collected_asc"
  | "uncollected_desc"
  | "uncollected_asc"
  | "commission_desc"
  | "name_asc";

function isWithinTimeframe(dateStr: string, timeframe: TimeFrame): boolean {
  if (timeframe === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  const diffDays = diffTime / (1000 * 3600 * 24);

  switch (timeframe) {
    case "1m":
      return diffDays <= 30;
    case "3m":
      return diffDays <= 90;
    case "6m":
      return diffDays <= 180;
    case "9m":
      return diffDays <= 270;
    case "1y":
      return diffDays <= 365;
    default:
      return true;
  }
}

function getTimeframeLabel(tf: TimeFrame): string {
  switch (tf) {
    case "1m": return "هذا الشهر (30 يوم)";
    case "3m": return "آخر 3 شهور";
    case "6m": return "آخر 6 شهور";
    case "9m": return "آخر 9 شهور";
    case "1y": return "آخر سنة";
    case "all": return "جميع الأوقات";
  }
}

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

// ---- مودال تحصيل المبيعات غير المستلمة ----
function SettleSalesModal({
  dist,
  orders,
  onClose,
  onSuccess,
}: {
  dist: DistributorWithProfile;
  orders: Order[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const distUnpaidOrders = orders.filter(
    (o) => o.distributor_id === dist.profile_id && o.status === "delivered" && o.payment_status === "unpaid"
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(distUnpaidOrders.map((o) => o.id));
  const [submitting, setSubmitting] = useState(false);

  const selectedTotal = distUnpaidOrders
    .filter((o) => selectedIds.includes(o.id))
    .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

  function toggleOrder(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedIds.length === distUnpaidOrders.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(distUnpaidOrders.map((o) => o.id));
    }
  }

  async function handleSettleSales() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    const res = await settleDistributorSales(dist.profile_id, selectedIds);
    setSubmitting(false);

    if (res.success) {
      onSuccess();
      onClose();
    } else {
      alert("حدث خطأ أثناء تحصيل المبيعات: " + res.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-600" />
              تحصيل المبيعات غير المستلمة
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              الموزع: <span className="font-bold text-slate-700">{dist.full_name || dist.profiles?.full_name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div>
              <span className="text-xs font-medium text-amber-700 block">إجمالي كاش المبيعات المحددة للتحصيل</span>
              <span className="text-2xl font-extrabold text-amber-900">
                {selectedTotal.toLocaleString("ar-EG")} ج.م
              </span>
            </div>
            <button
              onClick={toggleAll}
              className="flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-200/60 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-all"
            >
              {selectedIds.length === distUnpaidOrders.length ? (
                <><CheckSquare className="w-4 h-4 text-amber-700" /> إلغاء تحديد الكل</>
              ) : (
                <><Square className="w-4 h-4 text-amber-700" /> تحديد كافة الطلبات</>
              )}
            </button>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              قائمة الطلبات المسلمة وغير المحصلة ({distUnpaidOrders.length})
            </h4>

            {distUnpaidOrders.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                لا توجد طلبات غير محصلة لهذا الموزع.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {distUnpaidOrders.map((order) => {
                  const isChecked = selectedIds.includes(order.id);
                  const farmerName =
                    (Array.isArray(order.farmers)
                      ? order.farmers[0]?.profiles?.full_name
                      : order.farmers?.profiles?.full_name) || "فلاح غير معروف";

                  return (
                    <div
                      key={order.id}
                      onClick={() => toggleOrder(order.id)}
                      className={`flex items-center justify-between p-3.5 cursor-pointer transition-colors ${
                        isChecked ? "bg-amber-50/40" : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
                        />
                        <div>
                          <div className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                            <span>طلب #{order.id.slice(0, 8)}</span>
                            <span className="text-xs font-normal text-slate-500">
                              ({new Date(order.created_at).toLocaleDateString("ar-EG")})
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            الفلاح: <span className="font-medium text-slate-700">{farmerName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-left font-bold text-amber-700 text-sm">
                        {Number(order.total_price).toLocaleString("ar-EG")} ج.م
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all"
          >
            إلغاء
          </button>
          <button
            onClick={handleSettleSales}
            disabled={submitting || selectedIds.length === 0}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            تأكيد تحصيل ({selectedTotal.toLocaleString("ar-EG")} ج.م)
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- مودال كشف حساب الموزع ----
function DistributorLedgerModal({
  dist,
  orders,
  timeframe,
  onClose,
}: {
  dist: DistributorWithProfile;
  orders: Order[];
  timeframe: TimeFrame;
  onClose: () => void;
}) {
  const distOrders = orders.filter((o) => o.distributor_id === dist.profile_id);
  const deliveredOrders = distOrders.filter((o) => o.status === "delivered");

  const uncollectedSum = deliveredOrders
    .filter((o) => o.payment_status === "unpaid")
    .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

  const collectedSumPeriod = deliveredOrders
    .filter((o) => o.payment_status === "paid" && isWithinTimeframe(o.created_at, timeframe))
    .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

  const completedCountPeriod = deliveredOrders.filter((o) =>
    isWithinTimeframe(o.created_at, timeframe)
  ).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">كشف حساب الموزع التفصيلي</h3>
              <p className="text-xs text-slate-400">
                {dist.full_name || dist.profiles?.full_name} ({dist.profiles?.phone || dist.email || "—"})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Overview Stats */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-right">
              <span className="text-xs text-slate-500 block mb-1">الرصيد المتاح (محفظة)</span>
              <span className="text-lg font-bold text-slate-800">{dist.wallet_balance} ج.م</span>
            </div>

            <div className="bg-amber-50/70 border border-amber-100 rounded-xl p-3.5 text-right">
              <span className="text-xs text-amber-700 block mb-1">مبيعات غير مستلمة</span>
              <span className="text-lg font-extrabold text-amber-800">{uncollectedSum.toLocaleString("ar-EG")} ج.م</span>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3.5 text-right">
              <span className="text-xs text-emerald-700 block mb-1">مبيعات مستلمة ({getTimeframeLabel(timeframe)})</span>
              <span className="text-lg font-extrabold text-emerald-800">{collectedSumPeriod.toLocaleString("ar-EG")} ج.م</span>
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3.5 text-right">
              <span className="text-xs text-blue-700 block mb-1">عمولات مستحقة</span>
              <span className="text-lg font-extrabold text-blue-800">{dist.pending_commission || 0} ج.م</span>
            </div>
          </div>

          {/* Orders Breakdown */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center justify-between">
              <span>سجل الطلبات والعمليات ({deliveredOrders.length} طلب مسلم)</span>
              <span className="text-xs font-normal text-slate-500">مكتمل في الفترة: {completedCountPeriod}</span>
            </h4>

            {deliveredOrders.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border border-slate-100 rounded-xl">
                لا توجد طلبات مسجلة لهذا الموزع.
              </div>
            ) : (
              <div className="border border-slate-100 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-3">رقم الطلب</th>
                      <th className="px-4 py-3">التاريخ</th>
                      <th className="px-4 py-3">الفلاح</th>
                      <th className="px-4 py-3">الإجمالي</th>
                      <th className="px-4 py-3">حالة التحصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deliveredOrders.map((order) => {
                      const farmerName =
                        (Array.isArray(order.farmers)
                          ? order.farmers[0]?.profiles?.full_name
                          : order.farmers?.profiles?.full_name) || "فلاح غير معروف";

                      return (
                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-mono font-semibold text-slate-700">
                            #{order.id.slice(0, 8)}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(order.created_at).toLocaleDateString("ar-EG")}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{farmerName}</td>
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {Number(order.total_price).toLocaleString("ar-EG")} ج.م
                          </td>
                          <td className="px-4 py-3">
                            {order.payment_status === "paid" ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-semibold">
                                <CheckCircle2 className="w-3 h-3" /> تم التحصيل
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-semibold">
                                <Clock className="w-3 h-3" /> غير مستلم
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900 transition-all"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- الصفحة الرئيسية ----
export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<DistributorWithProfile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [timeframe, setTimeframe] = useState<TimeFrame>("1m");
  const [sortOption, setSortOption] = useState<SortOption>("default");
  const [selectedGov, setSelectedGov] = useState<string>("all");

  // Modals state
  const [selectedDist, setSelectedDist] = useState<DistributorWithProfile | null>(null);
  const [resetDist, setResetDist] = useState<DistributorWithProfile | null>(null);
  const [settleSalesDist, setSettleSalesDist] = useState<DistributorWithProfile | null>(null);
  const [ledgerDist, setLedgerDist] = useState<DistributorWithProfile | null>(null);

  const supabase = createClient();

  const fetchAllData = useCallback(async () => {
    setLoading(true);

    // Fetch distributors
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: distData, error: distErr } = await (supabase as any)
      .from("distributors")
      .select(`
        profile_id, active_status, wallet_balance, pending_commission, village,
        full_name, email, governorate, center, landmark, main_road,
        latitude, longitude, supervised_villages, total_acres, status,
        profiles(full_name, phone)
      `)
      .order("status", { ascending: true });

    if (!distErr && distData) setDistributors(distData);

    // Fetch delivered orders for metrics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ordersData, error: ordersErr } = await (supabase as any)
      .from("orders")
      .select(`
        id, distributor_id, status, payment_status, total_price, created_at,
        farmers(profiles(full_name)),
        order_items(id, quantity, products(name_ar, image_url))
      `)
      .eq("status", "delivered");

    if (!ordersErr && ordersData) setOrders(ordersData);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Derived calculations for metrics per distributor
  const distributorMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      { uncollectedSales: number; collectedSalesPeriod: number; completedCountPeriod: number }
    >();

    distributors.forEach((dist) => {
      const distOrders = orders.filter((o) => o.distributor_id === dist.profile_id);

      const uncollectedSales = distOrders
        .filter((o) => o.payment_status === "unpaid")
        .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

      const collectedSalesPeriod = distOrders
        .filter((o) => o.payment_status === "paid" && isWithinTimeframe(o.created_at, timeframe))
        .reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

      const completedCountPeriod = distOrders.filter((o) =>
        isWithinTimeframe(o.created_at, timeframe)
      ).length;

      map.set(dist.profile_id, {
        uncollectedSales,
        collectedSalesPeriod,
        completedCountPeriod,
      });
    });

    return map;
  }, [distributors, orders, timeframe]);

  // Total summary analytics for KPI cards
  const totalKPIs = useMemo(() => {
    let totalUncollected = 0;
    let totalCollectedPeriod = 0;
    let totalWalletBalance = 0;

    distributors.forEach((dist) => {
      const metrics = distributorMetricsMap.get(dist.profile_id);
      if (metrics) {
        totalUncollected += metrics.uncollectedSales;
        totalCollectedPeriod += metrics.collectedSalesPeriod;
      }
      totalWalletBalance += Number(dist.wallet_balance) || 0;
    });

    const activeCount = distributors.filter((d) => d.status === "APPROVED" && d.active_status).length;
    const pendingCount = distributors.filter((d) => d.status === "PENDING_APPROVAL").length;

    return {
      totalUncollected,
      totalCollectedPeriod,
      totalWalletBalance,
      activeCount,
      pendingCount,
    };
  }, [distributors, distributorMetricsMap]);

  // Unique governorates for filter
  const governoratesList = useMemo(() => {
    const govs = new Set<string>();
    distributors.forEach((d) => {
      if (d.governorate) govs.add(d.governorate);
    });
    return Array.from(govs);
  }, [distributors]);

  // Filter & Sort list
  const filteredAndSortedList = useMemo(() => {
    let list = [...distributors];

    // 1. Tab filter
    if (activeTab === "pending") {
      list = list.filter((d) => d.status === "PENDING_APPROVAL");
    }

    // 2. Governorate filter
    if (selectedGov !== "all") {
      list = list.filter((d) => d.governorate === selectedGov);
    }

    // 3. Search query
    if (searchTerm.trim() !== "") {
      const query = searchTerm.toLowerCase().trim();
      list = list.filter((d) => {
        const name = (d.full_name || d.profiles?.full_name || "").toLowerCase();
        const phone = (d.profiles?.phone || "").toLowerCase();
        const email = (d.email || "").toLowerCase();
        const gov = (d.governorate || "").toLowerCase();
        const center = (d.center || "").toLowerCase();
        const village = (d.village || "").toLowerCase();

        return (
          name.includes(query) ||
          phone.includes(query) ||
          email.includes(query) ||
          gov.includes(query) ||
          center.includes(query) ||
          village.includes(query)
        );
      });
    }

    // 4. Sorting
    list.sort((a, b) => {
      const metricsA = distributorMetricsMap.get(a.profile_id) || {
        uncollectedSales: 0,
        collectedSalesPeriod: 0,
        completedCountPeriod: 0,
      };
      const metricsB = distributorMetricsMap.get(b.profile_id) || {
        uncollectedSales: 0,
        collectedSalesPeriod: 0,
        completedCountPeriod: 0,
      };

      switch (sortOption) {
        case "collected_desc":
          return metricsB.collectedSalesPeriod - metricsA.collectedSalesPeriod;
        case "collected_asc":
          return metricsA.collectedSalesPeriod - metricsB.collectedSalesPeriod;
        case "uncollected_desc":
          return metricsB.uncollectedSales - metricsA.uncollectedSales;
        case "uncollected_asc":
          return metricsA.uncollectedSales - metricsB.uncollectedSales;
        case "commission_desc":
          return (Number(b.pending_commission) || 0) - (Number(a.pending_commission) || 0);
        case "name_asc": {
          const nameA = a.full_name || a.profiles?.full_name || "";
          const nameB = b.full_name || b.profiles?.full_name || "";
          return nameA.localeCompare(nameB, "ar");
        }
        case "default":
        default: {
          // Pending first, then active
          if (a.status === "PENDING_APPROVAL" && b.status !== "PENDING_APPROVAL") return -1;
          if (a.status !== "PENDING_APPROVAL" && b.status === "PENDING_APPROVAL") return 1;
          return 0;
        }
      }
    });

    return list;
  }, [distributors, activeTab, selectedGov, searchTerm, sortOption, distributorMetricsMap]);

  const pendingCountTotal = distributors.filter((d) => d.status === "PENDING_APPROVAL").length;

  async function handleToggleStatus(profileId: string, currentStatus: boolean) {
    await toggleDistributorStatus(profileId, currentStatus);
    fetchAllData();
  }

  async function handleSettleWallet(profileId: string) {
    if (confirm("هل أنت متأكد من تسوية هذه المحفظة وتحويل الرصيد إلى 0؟")) {
      await settleDistributorWallet(profileId);
      fetchAllData();
    }
  }

  const statusBadge = (status: DistributorStatus) => {
    if (status === "PENDING_APPROVAL")
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3" /> قيد المراجعة
        </span>
      );
    if (status === "APPROVED")
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
          <CheckCircle2 className="w-3 h-3" /> معتمد
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
        <XCircle className="w-3 h-3" /> مرفوض
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">إدارة الموزعين والعمولات</h2>
          <p className="text-slate-500 text-sm mt-1">
            تحليل مبيعات الموزعين، التحصيلات غير المستلمة، والعمولات المستحقة.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-slate-100 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "all"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            جميع الموزعين ({distributors.length})
          </button>
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
            {pendingCountTotal > 0 && (
              <span className="bg-amber-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {pendingCountTotal}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Top KPI Cards Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Uncollected Sales */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 tracking-wide uppercase">
              المبيعات غير المستلمة (الكاش المعلق)
            </span>
            <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-amber-900">
              {totalKPIs.totalUncollected.toLocaleString("ar-EG")} ج.م
            </div>
            <p className="text-xs text-amber-700/80 mt-1">
              مبالغ مبيعات مسلمة في السوق مع الموزعين
            </p>
          </div>
        </div>

        {/* Card 2: Collected Sales */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 tracking-wide uppercase">
              المبيعات المستلمة ({getTimeframeLabel(timeframe)})
            </span>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-emerald-900">
              {totalKPIs.totalCollectedPeriod.toLocaleString("ar-EG")} ج.م
            </div>
            <p className="text-xs text-emerald-700/80 mt-1">
              صافي المبيعات المحصلة لحساب الشركة
            </p>
          </div>
        </div>

        {/* Card 3: Total Distributor Wallet Balances */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 tracking-wide uppercase">
              إجمالي أرصدة الموزعين (الرصيد المتاح)
            </span>
            <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-blue-900">
              {totalKPIs.totalWalletBalance.toLocaleString("ar-EG")} ج.م
            </div>
            <p className="text-xs text-blue-700/80 mt-1">
              مجموع أرصدة محافظ كافة الموزعين المستحقة للصرف
            </p>
          </div>
        </div>

        {/* Card 4: Active Distributors */}
        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 tracking-wide uppercase">
              شبكة الموزعين
            </span>
            <div className="p-2.5 bg-slate-200 text-slate-700 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-800">
              {totalKPIs.activeCount} <span className="text-sm font-semibold text-slate-500">نشط</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              {totalKPIs.pendingCount > 0 ? (
                <span className="text-amber-600 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {totalKPIs.pendingCount} طلب بانتظار الموافقة
                </span>
              ) : (
                "جميع الطلبات مراجعة"
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث باسم الموزع، الهاتف، المحافظة، المركز..."
              className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-slate-50/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Timeframe Filter Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 bg-slate-100 p-1 rounded-xl shrink-0">
            {(["1m", "3m", "6m", "9m", "1y", "all"] as TimeFrame[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  timeframe === tf
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tf === "1m" && "شهر"}
                {tf === "3m" && "3 شهور"}
                {tf === "6m" && "6 شهور"}
                {tf === "9m" && "9 شهور"}
                {tf === "1y" && "سنة"}
                {tf === "all" && "الكل"}
              </button>
            ))}
          </div>
        </div>

        {/* Second row of controls: Governorate & Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">المحافظة:</span>
            <select
              value={selectedGov}
              onChange={(e) => setSelectedGov(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              <option value="all">جميع المحافظات ({distributors.length})</option>
              {governoratesList.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          {/* Sorting Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">ترتيب حسب:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-1.5 focus:outline-none focus:border-emerald-500 font-medium"
            >
              <option value="default">التلقائي (حسب الحالة)</option>
              <option value="collected_desc">الأعلى مبيعات مستلمة ⬇️</option>
              <option value="collected_asc">الأقل مبيعات مستلمة ⬆️</option>
              <option value="uncollected_desc">الأعلى مبيعات غير مستلمة (ديون) ⬇️</option>
              <option value="uncollected_asc">الأقل مبيعات غير مستلمة ⬆️</option>
              <option value="commission_desc">الأعلى عمولة مستحقة 🪙</option>
              <option value="name_asc">اسم الموزع (أ - ي)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Distributors Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 text-xs uppercase tracking-wider font-semibold">
              <tr>
                <th className="px-5 py-4">الموزع</th>
                <th className="px-4 py-4">المنطقة</th>
                <th className="px-4 py-4">الفدادين</th>
                <th className="px-4 py-4">الحالة</th>
                <th className="px-4 py-4">الرصيد المتاح</th>
                {/* 📌 الأعمدة الجديدة المطلوبة من المستخدم فوراً بعد عمود الرصيد */}
                <th className="px-4 py-4 bg-amber-50/50 text-amber-800">
                  <div className="flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-amber-600" />
                    <span>مبيعات غير مستلمة</span>
                  </div>
                </th>
                <th className="px-4 py-4 bg-emerald-50/50 text-emerald-800">
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                    <span>مبيعات مستلمة ({getTimeframeLabel(timeframe)})</span>
                  </div>
                </th>
                <th className="px-4 py-4 bg-blue-50/50 text-blue-800">
                  <div className="flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5 text-blue-600" />
                    <span>العمولات المستحقة</span>
                  </div>
                </th>
                <th className="px-4 py-4">
                  <div className="flex items-center gap-1">
                    <PackageCheck className="w-3.5 h-3.5 text-slate-500" />
                    <span>الطلبات المكتملة</span>
                  </div>
                </th>
                <th className="px-5 py-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-500" />
                    جاري تحميل الموزعين والإحصائيات...
                  </td>
                </tr>
              ) : filteredAndSortedList.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400">
                    {activeTab === "pending"
                      ? "لا توجد طلبات موزعون قيد المراجعة حالياً."
                      : "لا يوجد موزعون يطابقون خيارات البحث والتصفية."}
                  </td>
                </tr>
              ) : (
                filteredAndSortedList.map((dist) => {
                  const metrics = distributorMetricsMap.get(dist.profile_id) || {
                    uncollectedSales: 0,
                    collectedSalesPeriod: 0,
                    completedCountPeriod: 0,
                  };

                  return (
                    <tr key={dist.profile_id} className="hover:bg-slate-50/80 transition-colors">
                      {/* 1. الموزع */}
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">
                          {dist.full_name || dist.profiles?.full_name || "—"}
                        </div>
                        <div className="text-xs text-slate-500 font-mono" dir="ltr">
                          {dist.profiles?.phone || dist.email || "—"}
                        </div>
                      </td>

                      {/* 2. المنطقة */}
                      <td className="px-4 py-4 text-slate-600 text-xs">
                        {dist.governorate && dist.center ? (
                          <div>
                            <div className="font-medium text-slate-800">{dist.governorate}</div>
                            <div className="text-slate-500">{dist.center} {dist.village ? `— ${dist.village}` : ""}</div>
                          </div>
                        ) : (
                          dist.village || "غير محددة"
                        )}
                      </td>

                      {/* 3. الفدادين */}
                      <td className="px-4 py-4 text-slate-600 text-xs font-medium">
                        {dist.total_acres ? `${dist.total_acres} فدان` : "—"}
                      </td>

                      {/* 4. الحالة */}
                      <td className="px-4 py-4">{statusBadge(dist.status)}</td>

                      {/* 5. الرصيد المتاح */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 text-slate-900 font-bold text-sm">
                          <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{dist.wallet_balance.toLocaleString("ar-EG")} ج.م</span>
                        </div>
                      </td>

                      {/* 6. العمود الأول المطلوب: المبيعات غير المستلمة */}
                      <td className="px-4 py-4 bg-amber-50/30">
                        <div
                          className={`font-extrabold text-sm ${
                            metrics.uncollectedSales > 0 ? "text-amber-700" : "text-slate-400"
                          }`}
                        >
                          {metrics.uncollectedSales.toLocaleString("ar-EG")} ج.م
                        </div>
                      </td>

                      {/* 7. العمود الثاني المطلوب: المبيعات المستلمة (مفلتر بالمدة) */}
                      <td className="px-4 py-4 bg-emerald-50/30">
                        <div
                          className={`font-extrabold text-sm ${
                            metrics.collectedSalesPeriod > 0 ? "text-emerald-700" : "text-slate-400"
                          }`}
                        >
                          {metrics.collectedSalesPeriod.toLocaleString("ar-EG")} ج.م
                        </div>
                      </td>

                      {/* 8. العمود المقترح 1: العمولات المستحقة */}
                      <td className="px-4 py-4 bg-blue-50/30">
                        <div
                          className={`font-bold text-sm ${
                            dist.pending_commission > 0 ? "text-blue-700" : "text-slate-400"
                          }`}
                        >
                          {(dist.pending_commission || 0).toLocaleString("ar-EG")} ج.م
                        </div>
                      </td>

                      {/* 9. العمود المقترح 2: الطلبات المكتملة في الفترة */}
                      <td className="px-4 py-4">
                        <div className="font-semibold text-xs text-slate-700">
                          {metrics.completedCountPeriod} طلب
                        </div>
                      </td>

                      {/* 10. الإجراءات */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* مراجعة وقرار لطلبات الانتظار */}
                          {dist.status === "PENDING_APPROVAL" ? (
                            <button
                              onClick={() => setSelectedDist(dist)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              مراجعة وقرار
                            </button>
                          ) : (
                            <>
                              {/* زر تحصيل المبيعات غير المستلمة */}
                              {metrics.uncollectedSales > 0 && (
                                <button
                                  onClick={() => setSettleSalesDist(dist)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-all shadow-sm"
                                  title="تحصيل كاش المبيعات غير المستلمة من الموزع"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  تحصيل المبيعات
                                </button>
                              )}

                              {/* كشف حساب الموزع */}
                              <button
                                onClick={() => setLedgerDist(dist)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-all"
                                title="عرض كشف حساب تفصيلي"
                              >
                                <FileText className="w-3.5 h-3.5 text-slate-500" />
                                كشف حساب
                              </button>

                              {/* تفعيل / إيقاف الموزع المعتمد */}
                              {dist.status === "APPROVED" && (
                                <button
                                  onClick={() => handleToggleStatus(dist.profile_id, dist.active_status)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    dist.active_status
                                      ? "bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                                      : "bg-red-50 text-red-700 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200"
                                  }`}
                                >
                                  {dist.active_status ? (
                                    <><CheckCircle2 className="w-3.5 h-3.5" /> نشط</>
                                  ) : (
                                    <><XCircle className="w-3.5 h-3.5" /> موقوف</>
                                  )}
                                </button>
                              )}

                              {/* إعادة تعيين الباسورد */}
                              <button
                                onClick={() => setResetDist(dist)}
                                className="p-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition-all"
                                title="إعادة تعيين كلمة المرور"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>

                              {/* تسوية المحفظة */}
                              {dist.status === "APPROVED" && dist.wallet_balance > 0 && (
                                <button
                                  onClick={() => handleSettleWallet(dist.profile_id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all"
                                  title="تسوية رصيد المحفظة المتاح"
                                >
                                  <Wallet className="w-3.5 h-3.5" />
                                  تسوية رصيد
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Review Pending Details */}
      {selectedDist && (
        <DistributorDetailsModal
          dist={selectedDist}
          onClose={() => setSelectedDist(null)}
          onApprove={fetchAllData}
          onReject={fetchAllData}
        />
      )}

      {/* Modal 2: Reset Password */}
      {resetDist && (
        <ResetPasswordModal dist={resetDist} onClose={() => setResetDist(null)} />
      )}

      {/* Modal 3: Settle Uncollected Sales */}
      {settleSalesDist && (
        <SettleSalesModal
          dist={settleSalesDist}
          orders={orders}
          onClose={() => setSettleSalesDist(null)}
          onSuccess={fetchAllData}
        />
      )}

      {/* Modal 4: Distributor Ledger Statement */}
      {ledgerDist && (
        <DistributorLedgerModal
          dist={ledgerDist}
          orders={orders}
          timeframe={timeframe}
          onClose={() => setLedgerDist(null)}
        />
      )}
    </div>
  );
}
