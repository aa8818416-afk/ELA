import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CampaignCard from "@/components/farmer/CampaignCard";
import CompactWeatherBar from "@/components/farmer/CompactWeatherBar";
import { Sparkles, CalendarDays } from "lucide-react";
import Link from "next/link";

import { EGYPT_CENTERS_COORDINATES } from "@/data/egyptCenters";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

  // 2. Fetch farmer's active fields for agenda
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmerFields } = await (supabase as any)
    .from("farmer_fields")
    .select("id, field_name, crop_type, latitude, longitude")
    .eq("farmer_id", user.id)
    .eq("is_active", true)
    .limit(5);

  const hasFields = farmerFields && farmerFields.length > 0;

  // 3. Fetch open alert count & latest alert for farmer's fields
  let openAlertsCount = 0;
  let latestAlert: { id: string; advice_text_snapshot: string } | null = null;

  if (hasFields) {
    const fieldIds = farmerFields.map((f: { id: string }) => f.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (supabase as any)
      .from("alert_instances")
      .select("*", { count: "exact", head: true })
      .in("farmer_field_id", fieldIds)
      .not("status", "in", '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")');
    openAlertsCount = count || 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: alertData } = await (supabase as any)
      .from("alert_instances")
      .select("id, advice_text_snapshot")
      .in("farmer_field_id", fieldIds)
      .not("status", "in", '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alertData) {
      latestAlert = alertData;
    }
  }

  // 4. Determine nearest center weather
  const fieldLat = farmerFields?.[0]?.latitude ?? 30.0444;
  const fieldLon = farmerFields?.[0]?.longitude ?? 31.2357;

  const nearestCenter = EGYPT_CENTERS_COORDINATES.reduce(
    (best, c) => {
      const d = haversineKm(fieldLat, fieldLon, c.lat, c.lng);
      return d < best.dist ? { center: c, dist: d } : best;
    },
    { center: EGYPT_CENTERS_COORDINATES[0], dist: Infinity }
  ).center;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: weatherData } = await (supabase as any)
    .from("weather_cache")
    .select("*")
    .eq("latitude", nearestCenter.lat)
    .eq("longitude", nearestCenter.lng)
    .maybeSingle();

  const currentCrop = farmerFields?.[0]?.crop_type || undefined;


  // 4. Fetch active group buy campaigns
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

  // Filter out expired campaigns
  const activeCampaigns = campaigns.filter((c: any) => {
    if (c.end_date) {
      return new Date(c.end_date) > new Date();
    }
    return true;
  });

  // 5. Count volumes per product in this village
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

  // 6. Fetch profile for greeting
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

      {/* Weather Compact Summary Bar */}
      <CompactWeatherBar weather={weatherData} />

      {/* Daily Agenda Card */}
      <Link
        href="/farmer/agenda"
        className="block relative bg-gradient-to-br from-indigo-900/60 via-violet-900/40 to-slate-900/60 border border-indigo-500/20 rounded-3xl p-5 overflow-hidden group active:scale-[0.98] transition-transform"
      >
        {/* Background glow */}
        <div className="absolute top-0 left-0 w-full h-full bg-indigo-500/5 pointer-events-none" />

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-white text-base">أجندتي اليومية</h3>
            </div>
            <p className="text-slate-300 text-sm">
              {hasFields
                ? openAlertsCount > 0
                  ? `لديك ${openAlertsCount} تنبيه زراعي مفتوح — اضغط للاطلاع`
                  : "لا توجد تنبيهات مفتوحة اليوم — محصولك بخير 🌱"
                : "أضف حقلك الأول للبدء في تلقي التنبيهات الزراعية"}
            </p>
          </div>

          {openAlertsCount > 0 && (
            <div className="flex-shrink-0 bg-red-500 text-white text-sm font-bold w-8 h-8 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30">
              {openAlertsCount}
            </div>
          )}
        </div>

        {openAlertsCount > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap">
            <span className="bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full border border-indigo-500/30">
              عرض التفاصيل ←
            </span>
          </div>
        )}
      </Link>

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
