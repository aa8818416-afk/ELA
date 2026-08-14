import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import CampaignCard from "@/components/farmer/CampaignCard";
import CompactWeatherBar from "@/components/farmer/CompactWeatherBar";
import { Sparkles, CalendarDays } from "lucide-react";
import Link from "next/link";
import { getOrFetchCenterWeather } from "@/lib/weatherLogic";
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

  const weatherData = await getOrFetchCenterWeather(nearestCenter, supabase);
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
    <div className="space-y-5 text-right">
      {/* Greeting Card */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-slate-500 text-xs font-medium mb-0.5">أهلاً بك في منصة ELA</p>
            <h1 className="text-xl font-black text-slate-900">
              صباح النور يا {firstName} 👋
            </h1>
            {village && (
              <span className="inline-flex items-center gap-1 mt-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full shadow-xs">
                📍 قرية {village}
              </span>
            )}
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl shadow-xs">
            🧑‍🌾
          </div>
        </div>
      </div>

      {/* Weather Compact Summary Bar */}
      <CompactWeatherBar weather={weatherData} />

      {/* Parallel Bento Cards: Agenda & Smart AI Assistant */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Daily Agenda Card */}
        <Link
          href="/farmer/agenda"
          className="bg-white hover:bg-slate-50/80 border border-slate-200/90 hover:border-indigo-300 rounded-3xl p-5 shadow-xs transition-all flex flex-col justify-between group active:scale-[0.98]"
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 shadow-xs">
                <CalendarDays className="w-5 h-5" />
              </div>
              {openAlertsCount > 0 ? (
                <span className="bg-red-500 text-white text-xs font-black px-2.5 py-0.5 rounded-full shadow-xs">
                  {openAlertsCount} تنبيه
                </span>
              ) : (
                <span className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full">
                  محصولك بخير 🌱
                </span>
              )}
            </div>

            <h3 className="font-black text-slate-900 text-base mb-1">أجندتي اليومية</h3>
            <p className="text-slate-600 text-xs leading-relaxed">
              {hasFields
                ? openAlertsCount > 0
                  ? `لديك ${openAlertsCount} تنبيه زراعي مفتوح — اضغط للاطلاع`
                  : "لا توجد تنبيهات مفتوحة اليوم — حقولك بحالة ممتازة."
                : "أضف حقلك الأول للبدء في متابعة دورة حياة النبات."}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-3.5 py-1.5 rounded-xl group-hover:bg-indigo-100 transition-colors">
              فتح الأجندة ←
            </span>
            <span className="text-[11px] text-slate-400 font-medium">متابعة الحقل</span>
          </div>
        </Link>

        {/* Chat Access Card */}
        <Link
          href="/farmer/scanner"
          className="bg-white hover:bg-emerald-50/40 border border-slate-200/90 hover:border-emerald-300 rounded-3xl p-5 shadow-xs transition-all flex flex-col justify-between group active:scale-[0.98]"
        >
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-black px-2.5 py-0.5 rounded-full">
                ذكاء اصطناعي
              </span>
            </div>

            <h3 className="font-black text-slate-900 text-base mb-1">طبيب المحاصيل الذكي 🤖</h3>
            <p className="text-slate-600 text-xs leading-relaxed">
              صوّر ورقة النبات المصابة أو اسأل المرشد عن أي مشكلة في مزرعتك.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl group-hover:bg-emerald-100 transition-colors">
              فحص وتشخيص 📸
            </span>
            <span className="text-[11px] text-slate-400 font-medium">استشارة فورية</span>
          </div>
        </Link>
      </div>

      {/* Active Campaigns Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h2 className="text-slate-900 font-black text-base">عروض الشراء الجماعي النشطة</h2>
        </div>
        <span className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
          خصومات قريتك
        </span>
      </div>

      {/* Campaign Cards */}
      {activeCampaigns.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center shadow-xs">
          <p className="text-slate-500 text-xs font-medium">لا توجد عروض شراء جماعي نشطة حالياً بقريتك</p>
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
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-5 shadow-xs">
        <h3 className="text-slate-900 font-black text-xs mb-2 flex items-center gap-1.5">
          <span>💡 كيف يعمل الخصم الجماعي؟</span>
        </h3>
        <p className="text-slate-600 text-xs leading-relaxed">
          كل ما حجزت أنت وجيرانك من المزارعين في القرية نفس المنتج وبلغنا الكمية المطلوبة، يحصل الكل تلقائياً على خصم في أسعار الدواء. شارك الكارت مع جيرانك وكسبوا سوا!
        </p>
      </div>
    </div>
  );
}
