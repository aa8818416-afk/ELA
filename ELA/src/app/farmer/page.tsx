import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CampaignCard from "@/components/farmer/CampaignCard";
import { Sparkles } from "lucide-react";
import Link from "next/link";

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

  // 2. Fetch active group buy campaigns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaignsData } = await (supabase as any)
    .from("group_buy_offers")
    .select(`
      id,
      product_id,
      tier1_qty,
      tier1_discount,
      tier2_qty,
      tier2_discount,
      tier3_qty,
      tier3_discount,
      end_date,
      products (
        id,
        name_ar,
        price_to_farmer,
        stock_status,
        image_url
      )
    `)
    .eq("active_status", true);

  const campaigns = campaignsData || [];

  // Filter out campaigns that have reached their end date
  const activeCampaigns = campaigns.filter((c: any) => {
    if (c.end_date) {
      return new Date(c.end_date) > new Date();
    }
    return true;
  });

  // 3. For each active campaign's product, count how many units have been ordered in this village
  //    (approximated via orders by the same distributor)
  const productVolumes: Record<string, number> = {};

  if (farmerData?.distributor_id && activeCampaigns.length > 0) {
    const productIds = activeCampaigns.map((c: any) => c.product_id);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderItems } = await (supabase as any)
      .from("order_items")
      .select("product_id, quantity, orders!inner(distributor_id, status)")
      .eq("orders.distributor_id", farmerData.distributor_id)
      .in("orders.status", ["pending", "in_transit", "delivered"])
      .in("product_id", productIds);

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

  const firstName = (profile as any)?.full_name?.split(" ")[0] || "يا فلاح";

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

      {/* Chat Access Card */}
      <Link
        href="/farmer/chat"
        className="block bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-3xl p-6 text-white shadow-lg active:scale-[0.98] transition-transform"
      >
        <h3 className="font-bold text-lg mb-1">اسأل المرشد الزراعي 🤖</h3>
        <p className="text-emerald-50 text-sm opacity-90">
          هل عندك سؤال بخصوص محصولك؟ اضغط هنا للدردشة مع المرشد الذكي.
        </p>
      </Link>

      {/* Active Campaigns Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-amber-400" />
        <h2 className="text-white font-bold text-lg">عروض الشراء الجماعي النشطة</h2>
      </div>

      {/* Campaign Cards */}
      {activeCampaigns.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-10 text-center">
          <p className="text-slate-400">لا توجد عروض شراء جماعي نشطة حالياً</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activeCampaigns.map((camp: any) => (
            <CampaignCard
              key={camp.id}
              campaign={camp}
              currentVolume={productVolumes[camp.product_id] || 0}
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
