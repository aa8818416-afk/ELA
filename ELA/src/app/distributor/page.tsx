import { createClient } from "@/utils/supabase/server";
import { Users, ShoppingBag, Wallet, Clock } from "lucide-react";
import { redirect } from "next/navigation";

export default async function DistributorDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch distributor data
  const { data: distributor } = await supabase
    .from("distributors")
    .select("wallet_balance, pending_commission")
    .eq("profile_id", user.id)
    .single();

  // Fetch total registered farmers under this distributor
  const { count: farmersCount } = await supabase
    .from("farmers")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", user.id);

  // Fetch total orders
  const { count: ordersCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("distributor_id", user.id);

  const stats = [
    {
      title: "إجمالي الفلاحين",
      value: farmersCount || 0,
      icon: Users,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      title: "إجمالي الطلبات",
      value: ordersCount || 0,
      icon: ShoppingBag,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      title: "الرصيد المتاح (ج.م)",
      value: distributor?.wallet_balance || 0,
      icon: Wallet,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      title: "عمولات معلقة (ج.م)",
      value: distributor?.pending_commission || 0,
      icon: Clock,
      color: "text-slate-400",
      bg: "bg-slate-500/10",
      border: "border-slate-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">الإحصائيات والمحفظة</h2>
        <p className="text-slate-400 text-sm">نظرة عامة على نشاطك ورصيدك الحالي</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div
            key={i}
            className={`p-6 rounded-3xl border ${stat.border} ${stat.bg} backdrop-blur-xl transition-all hover:scale-[1.02]`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm font-medium mb-1">
                  {stat.title}
                </p>
                <h3 className="text-3xl font-bold text-white">{stat.value}</h3>
              </div>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-slate-900/50 ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
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
