import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CampaignCard from "@/components/farmer/CampaignCard";
import { Sparkles } from "lucide-react";

// Group-buying targets per product (in a real app, store in DB)
const GROUP_BUY_TARGET = 20;
const DISCOUNT_PERCENT = 15;

export default async function FarmerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 1. Fetch farmer + distributor info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmerData } = await (supabase as any)
    .from("farmers")
    .select(
      `
      current_crop,
      land_size,
      distributor_id,
      distributors (
        village,
        profiles ( full_name, phone )
      )
    `
    )
    .eq("profile_id", user.id)
    .single();

  const distributorProfile = farmerData?.distributors?.profiles;
  const distributorName = distributorProfile?.full_name || "السفير";
  const distributorPhone = distributorProfile?.phone || null;
  const village = farmerData?.distributors?.village || null;

  // 2. Fetch active products
  const { data: products } = await supabase
    .from("products")
    .select("id, name_ar, price_to_farmer, stock_status")
    .eq("stock_status", true);

  // 3. For each product, count how many units have been ordered in this village
  //    (approximated via orders by the same distributor)
  const productVolumes: Record<string, number> = {};

  if (farmerData?.distributor_id && products?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderItems } = await (supabase as any)
      .from("order_items")
      .select("product_id, quantity, orders!inner(distributor_id, status)")
      .eq("orders.distributor_id", farmerData.distributor_id)
      .in("orders.status", ["pending", "in_transit", "delivered"]);

    if (orderItems) {
      for (const item of orderItems) {
        const pid = item.product_id;
        productVolumes[pid] = (productVolumes[pid] || 0) + (item.quantity || 1);
      }
    }
  }

  // 4. Fetch the current farmer's profile for greeting
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const firstName = profile?.full_name?.split(" ")[0] || "يا فلاح";

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="pt-2 pb-4">
        <p className="text-slate-400 text-sm mb-1">أهلاً بك</p>
        <h1 className="text-2xl font-bold text-white">
          صباح النور يا {firstName} 👋
        </h1>
        {village && (
          <span className="inline-block mt-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-1 rounded-full">
            📍 قرية {village}
          </span>
        )}
      </div>

      {/* Active Campaigns Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-amber-400" />
        <h2 className="text-white font-bold text-lg">عروض الشراء الجماعي النشطة</h2>
      </div>

      {/* Campaign Cards */}
      {!products || products.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-10 text-center">
          <p className="text-slate-400">لا توجد منتجات نشطة حالياً</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((product: Record<string, unknown>) => (
            <CampaignCard
              key={product.id}
              product={product}
              currentVolume={productVolumes[product.id] || 0}
              targetVolume={GROUP_BUY_TARGET}
              discountPercent={DISCOUNT_PERCENT}
              distributorName={distributorName}
              distributorPhone={distributorPhone}
            />
          ))}
        </div>
      )}

      {/* How it works footer */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-5">
        <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
          💡 كيف يعمل الخصم الجماعي؟
        </h3>
        <p className="text-slate-400 text-xs leading-relaxed">
          كل ما حجزت أنت وجيرانك من المزارعين في القرية نفس المنتج وبلغنا الكمية المطلوبة، تحصل الكل تلقائياً على خصم في أسعار الدواء. شارك الكارت مع جيرانك وكسبوا سوا!
        </p>
      </div>
    </div>
  );
}
