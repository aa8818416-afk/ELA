import { createClient } from "@/utils/supabase/server";
import { Users, ShoppingBag, CheckCircle2, Wallet, TrendingUp } from "lucide-react";
import { redirect } from "next/navigation";

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
    .select("wallet_balance")
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

  const stats = [
    {
      title: "إجمالي الفلاحين",
      value: (farmersCount || 0).toLocaleString("ar-EG"),
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
      sub: null,
    },
    {
      title: "الصفقات المعلقة",
      value: (pendingOrdersCount || 0).toLocaleString("ar-EG"),
      icon: ShoppingBag,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
      sub: "pending + قيد التوصيل",
    },
    {
      title: "المكتملة هذا الشهر",
      value: (completedThisMonthCount || 0).toLocaleString("ar-EG"),
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      sub: `${now.toLocaleString("ar-EG", { month: "long" })} ${now.getFullYear()}`,
    },
    {
      title: "الرصيد المستحق (ج.م)",
      value: (distributor?.wallet_balance || 0).toLocaleString("ar-EG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      icon: Wallet,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
      sub: "عمولاتك المعتمدة",
    },
    {
      title: "إجمالي المبيعات (ج.م)",
      value: totalUnpaidSales.toLocaleString("ar-EG", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      icon: TrendingUp,
      color: "text-violet-400",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
      sub: "مسلّمة ولم تُسدَّد بعد",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">الإحصائيات والمحفظة</h2>
        <p className="text-slate-400 text-sm">نظرة عامة على نشاطك ورصيدك الحالي</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={`p-6 rounded-3xl border ${stat.border} ${stat.bg} backdrop-blur-xl transition-all hover:scale-[1.02]`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-900/50 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
            <p className="text-slate-400 text-sm font-medium mb-1">{stat.title}</p>
            <h3 className="text-2xl font-bold text-white leading-tight">{stat.value}</h3>
            {stat.sub && (
              <p className="text-xs text-slate-500 mt-2">{stat.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Placeholder for future charts or recent activity */}
      <div className="mt-12 p-8 rounded-3xl border border-slate-800 bg-slate-900/50 text-center">
        <p className="text-slate-500 text-sm">سيتم إضافة رسوم بيانية تفصيلية للنشاط لاحقاً</p>
      </div>
    </div>
  );
}
