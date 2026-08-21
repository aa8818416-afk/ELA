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

  // Fetch total un-remitted sales (delivered, but not yet settled to admin)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unpaidSalesData } = await (supabase as any)
    .from("orders")
    .select("total_price, settled_to_admin, payment_status")
    .eq("distributor_id", user.id)
    .eq("status", "delivered");

  const totalUnpaidSales = unpaidSalesData
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ?.filter((o: any) => o.settled_to_admin === false || (!('settled_to_admin' in o) && o.payment_status === "unpaid"))
    .reduce(
      (sum: number, order: { total_price: number }) => sum + (Number(order.total_price) || 0),
      0
    ) ?? 0;

  const walletBalance = Number(distributor?.wallet_balance) || 0;
  const villages: string[] = distributor?.supervised_villages || [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Top Quick Action Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white text-base sm:text-lg shadow-sm border border-emerald-600 flex-shrink-0">
            🌾
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">لوحة الموزع والنشاط الميداني</h2>
              <span className="text-[10px] sm:text-xs bg-emerald-50 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                مباشر
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-snug truncate">
              إدارة طلبات القرية، التسليمات الفورية، ومتابعة الأرباح
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
          <Link
            href="/distributor/orders"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl py-3 px-3.5 shadow-xs border border-emerald-700 flex items-center justify-center gap-1.5 active:scale-95 transition-all text-center"
          >
            <Plus className="w-4 h-4" />
            <span>طلب فوري</span>
          </Link>
          <Link
            href="/distributor/deliveries"
            className="bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl py-3 px-3.5 border border-slate-300 shadow-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all text-center"
          >
            <CheckSquare className="w-4 h-4 text-emerald-700" />
            <span>التحصيلات</span>
          </Link>
        </div>
      </div>

      {/* 2. Bento Grid Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Bento Card 1: Wallet & Target Milestone with Privacy Eye Toggle */}
        <DistributorWalletCard
          walletBalance={walletBalance}
          totalUnpaidSales={totalUnpaidSales}
          completedThisMonthCount={completedThisMonthCount || 0}
          farmersCount={farmersCount || 0}
        />

        {/* Bento Card 2: Coverage & Village Stats */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-900 text-sm">نطاق القرى المعتمدة</h3>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="نشط"></span>
            </div>

            <div className="space-y-2">
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
            className="w-full mt-4 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs py-3 px-3 rounded-xl border border-slate-300 shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Users className="w-4 h-4 text-emerald-700" />
            <span>إدارة وتوسيع شبكة الفلاحين</span>
          </Link>
        </div>
      </div>

      {/* 3. 4 Analytics Bento Metric Tiles (2 columns on mobile, 4 on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs text-slate-500 font-bold">المعلقة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {(pendingOrdersCount || 0).toLocaleString("ar-EG")}
            </p>
            <p className="text-[10px] sm:text-[11px] text-amber-700 font-semibold mt-0.5">
              قيد التجهيز
            </p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs text-slate-500 font-bold">هذا الشهر</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {(completedThisMonthCount || 0).toLocaleString("ar-EG")}
            </p>
            <p className="text-[10px] sm:text-[11px] text-emerald-700 font-semibold mt-0.5">
              طلب مكتمل
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs text-slate-500 font-bold">الفلاحين</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {(farmersCount || 0).toLocaleString("ar-EG")}
            </p>
            <p className="text-[10px] sm:text-[11px] text-blue-700 font-semibold mt-0.5">
              مزارع مسجل
            </p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] sm:text-xs text-slate-500 font-bold">مبيعات آجلة</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div>
            <p className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
              {Math.round(totalUnpaidSales).toLocaleString("ar-EG")} <span className="text-[10px] font-normal">ج.م</span>
            </p>
            <p className="text-[10px] sm:text-[11px] text-indigo-700 font-semibold mt-0.5">
              في انتظار التوريد
            </p>
          </div>
        </div>
      </div>

      {/* 4. Farmer Alerts Agenda Widget */}
      <DistributorAgendaWidget distributorId={user.id} />
    </div>
  );

}
