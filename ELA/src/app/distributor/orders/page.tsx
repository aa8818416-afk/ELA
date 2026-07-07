import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import OrderForm from "@/components/distributor/OrderForm";

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch available farmers for this distributor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmersData } = await (supabase as any)
    .from("farmers")
    .select(`
      profile_id,
      profiles ( full_name )
    `)
    .eq("distributor_id", user.id);

  // Map to flat structure for the client component
  const farmers = (farmersData || []).map((f: any) => ({
    profile_id: f.profile_id,
    full_name: (f.profiles as any)?.full_name || "بدون اسم", // eslint-disable-line @typescript-eslint/no-explicit-any
  }));

  // 2. Fetch available products
  const { data: productsData } = await supabase
    .from("products")
    .select("id, name_ar, price_to_farmer, image_url")
    .eq("stock_status", true);

  const products = productsData || [];

  // 3. Dummy Group-Buying stats (In production, calculate from recent orders per village)
  const groupBuyingTarget = 20;
  const currentVolume = 14;
  const progressPercent = Math.min((currentVolume / groupBuyingTarget) * 100, 100);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      {/* Left Column - Order Form */}
      <div className="xl:col-span-2">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">طلب جديد</h2>
          <p className="text-slate-400 text-sm">
            قم بإصدار طلبات للفلاحين التابعين لك، وسيتم تجميعها لخصومات القرية
          </p>
        </div>

        <OrderForm farmers={farmers} products={products} />
      </div>

      {/* Right Column - Group Buying Status */}
      <div className="xl:col-span-1 space-y-6">
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>

          <h3 className="text-lg font-bold text-white mb-4 relative z-10">
            خصم الكمية الجماعي 🏆
          </h3>
          <p className="text-slate-400 text-sm mb-6 relative z-10 leading-relaxed">
            مبيعات قريتك الحالية تقترب من تفعيل خصم <span className="text-amber-400 font-bold">15%</span> لجميع فلاحي القرية على منتج &quot;مبيد العناكب 250مل&quot;.
          </p>

          <div className="relative z-10">
            <div className="flex justify-between text-sm mb-2 font-medium">
              <span className="text-slate-300">{currentVolume} عبوات</span>
              <span className="text-amber-500">الهدف: {groupBuyingTarget}</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-l from-amber-400 to-amber-600 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <p className="text-center text-amber-500/80 text-xs mt-3 font-medium">
              متبقي {groupBuyingTarget - currentVolume} عبوات للوصول للخصم!
            </p>
          </div>
        </div>

        {/* Info Card */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-6">
          <h4 className="text-blue-400 font-bold text-sm mb-2 flex items-center gap-2">
            💡 كيف يعمل الشراء الجماعي؟
          </h4>
          <p className="text-slate-400 text-xs leading-relaxed">
            عندما تقوم بتجميع طلبات من عدة فلاحين في نفس القرية لنفس المنتج وتصل للحد الأدنى للكمية، سيتم تطبيق الخصم التلقائي وإضافته لمحفظتك فوراً بعد التحصيل.
          </p>
        </div>
      </div>
    </div>
  );
}
