import { createClient } from "@/utils/supabase/server";
import { Users, ShoppingBag, CheckCircle2, Wallet, TrendingUp, Plus, CheckSquare, Sparkles, ArrowUpRight } from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";
import DistributorAgendaWidget from "@/components/distributor/DistributorAgendaWidget";
import DistributorWalletCard from "@/components/distributor/DistributorWalletCard";

export default async function DistributorDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch distributor data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: distributor } = await (supabase as any)
    .from("distributors")
    .select("wallet_balance, supervised_villages")
    .eq("profile_id", user.id)
    .single();

  // Fetch total registered farmers under this distributor
  const { count: farmersCount } = await supabase
    .from("farmers")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", user.id);

  // Fetch pending orders count (pending + in_transit)
  const { count: pendingOrdersCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", user.id)
    .in("status", ["pending", "in_transit"]);

  // Fetch completed orders count this month (delivered, current month)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const { count: completedThisMonthCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", user.id)
    .eq("status", "delivered")
    .gte("created_at", startOfMonth)
    .lte("created_at", endOfMonth);

  // Fetch total unpaid sales (delivered + unpaid) — amount distributor owes to admin
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unpaidSalesData } = await (supabase as any)
    .from("orders")
    .select("total_price")
    .eq("distributor_id", user.id)
    .eq("status", "delivered")
    .eq("payment_status", "unpaid");

  const totalUnpaidSales = unpaidSalesData?.reduce(
    (sum: number, order: { total_price: number }) => sum + (Number(order.total_price) || 0),
    0
  ) ?? 0;

  const walletBalance = Number(distributor?.wallet_balance) || 0;
  const villages: string[] = distributor?.supervised_villages || [];

  return (
    <div className="space-y-6">
      {/* 1. Top Quick Action Bar */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white text-lg shadow-sm border border-emerald-600">
            🌾
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">لوحة الموزع والنشاط الميداني</h2>
              <span className="text-xs bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                مباشر
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              إدارة طلبات القرية، التسليمات الفورية، ومتابعة الأرباح والعمولات
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/distributor/orders"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl py-2.5 px-4 shadow-xs border border-emerald-700 flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> تسجيل طلب فوري
          </Link>
          <Link
            href="/distributor/deliveries"
            className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl py-2.5 px-4 border border-slate-300 shadow-xs flex items-center gap-1.5 active:scale-95 transition-all"
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-700" /> مراجعة التحصيلات
          </Link>
        </div>
      </div>

      {/* 2. Bento Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bento Card 1: Wallet & Target Milestone with Privacy Eye Toggle */}
        <DistributorWalletCard
          walletBalance={walletBalance}
          totalUnpaidSales={totalUnpaidSales}
          completedThisMonthCount={completedThisMonthCount || 0}
          farmersCount={farmersCount || 0}
        />

        {/* Bento Card 2: Coverage & Village Stats */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 text-sm">نطاق القرى المعتمدة</h3>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="نشط"></span>
            </div>

            <div className="space-y-2.5">
              {villages.length > 0 ? (
                villages.map((v, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <span className="font-bold text-slate-800">{v}</span>
                    <span className="text-emerald-700 font-semibold">قرية معتمدة</span>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
                  كافة القرى التابعة للمركز
                </div>
              )}
              <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-900 font-bold">
                <span>إجمالي مزارعي النطاق</span>
                <span>{(farmersCount || 0).toLocaleString("ar-EG")} مزارع مسجل</span>
              </div>
            </div>
          </div>

          <Link
            href="/distributor/farmers"
            className="w-full mt-4 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs py-2.5 px-3 rounded-xl border border-slate-300 shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Users className="w-3.5 h-3.5 text-emerald-700" />
            إدارة وتوسيع شبكة الفلاحين
          </Link>
        </div>
      </div>

      {/* 3. 4 Analytics Bento Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">الصفقات المعلقة</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 font-mono">
              {(pendingOrdersCount || 0).toLocaleString("ar-EG")}
            </p>
            <p className="text-[11px] text-amber-700 font-semibold mt-1">
              قيد التجهيز والتوصيل للمزارعين
            </p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">المكتملة هذا الشهر</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 font-mono">
              {(completedThisMonthCount || 0).toLocaleString("ar-EG")}
            </p>
            <p className="text-[11px] text-emerald-700 font-semibold mt-1">
              {now.toLocaleString("ar-EG", { month: "long" })} {now.getFullYear()}
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">إجمالي الفلاحين</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 font-mono">
              {(farmersCount || 0).toLocaleString("ar-EG")}
            </p>
            <p className="text-[11px] text-blue-700 font-semibold mt-1">
              حسابات مفعلة ومرتبطة بك
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-bold">مبيعات لم تُسدد</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-black text-slate-900 font-mono">
              {Math.round(totalUnpaidSales).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </p>
            <p className="text-[11px] text-indigo-700 font-semibold mt-1">
              مسلّمة للمزارعين في انتظار التوريد
            </p>
          </div>
        </div>
      </div>

      {/* 4. Farmer Alerts Agenda Widget */}
      <DistributorAgendaWidget distributorId={user.id} />
    </div>
  );
}
