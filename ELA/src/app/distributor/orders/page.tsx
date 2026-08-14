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
    .select("id, name_ar, price_to_farmer, image_url, product_type, target_crops")
    .eq("stock_status", true);

  const products = productsData || [];

  // 3. Fetch active group buy campaigns
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
        price_to_farmer
      )
    `)
    .eq("active_status", true);

  const campaigns = campaignsData || [];
  
  // Filter by date
  const activeCampaigns = campaigns.filter((c: any) => {
    if (c.end_date) {
      return new Date(c.end_date) > new Date();
    }
    return true;
  });

  // Calculate volumes for each campaign's product for this distributor's village
  const productVolumes: Record<string, number> = {};

  if (activeCampaigns.length > 0) {
    const productIds = activeCampaigns.map((c: any) => c.product_id);
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderItems } = await (supabase as any)
      .from("order_items")
      .select("product_id, quantity, orders!inner(distributor_id, status)")
      .eq("orders.distributor_id", user.id)
      .in("orders.status", ["pending", "in_transit", "delivered"])
      .in("product_id", productIds);

    if (orderItems) {
      for (const item of orderItems) {
        const pid = item.product_id;
        productVolumes[pid] = (productVolumes[pid] || 0) + (item.quantity || 1);
      }
    }
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      {/* Left Column - Order Form */}
      <div className="xl:col-span-2 space-y-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">إصدار طلبات الفلاحين والشراء الجماعي</h2>
              <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                مباشر
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-1">
              قم بإصدار طلبات للفلاحين التابعين لك، وسيتم تجميعها تلقائياً لاحتساب خصومات القرية
            </p>
          </div>
        </div>

        <OrderForm farmers={farmers} products={products} />
      </div>

      {/* Right Column - Group Buying Status */}
      <div className="xl:col-span-1 space-y-6">
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 relative overflow-hidden shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>🏆</span>
              <span>عروض الشراء الجماعي النشطة</span>
            </h3>
            <span className="text-[10px] bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
              قريتك
            </span>
          </div>

          {activeCampaigns.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 text-center">
              <p className="text-slate-500 text-xs">
                لا توجد عروض شراء جماعي نشطة حالياً في قريتك.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {activeCampaigns.map((camp: any) => {
                const currentVolume = productVolumes[camp.product_id] || 0;
                
                // Calculate next tier target
                let nextTargetQty: number | null = null;
                let nextTargetDiscount: number | null = null;
                let activeDiscount = 0;

                if (camp.tier3_qty && camp.tier3_discount && currentVolume >= camp.tier3_qty) {
                  activeDiscount = camp.tier3_discount;
                } else if (camp.tier2_qty && camp.tier2_discount && currentVolume >= camp.tier2_qty) {
                  activeDiscount = camp.tier2_discount;
                } else if (currentVolume >= camp.tier1_qty) {
                  activeDiscount = camp.tier1_discount;
                }

                if (currentVolume < camp.tier1_qty) {
                  nextTargetQty = camp.tier1_qty;
                  nextTargetDiscount = camp.tier1_discount;
                } else if (camp.tier2_qty && camp.tier2_discount && currentVolume < camp.tier2_qty) {
                  nextTargetQty = camp.tier2_qty;
                  nextTargetDiscount = camp.tier2_discount;
                } else if (camp.tier3_qty && camp.tier3_discount && currentVolume < camp.tier3_qty) {
                  nextTargetQty = camp.tier3_qty;
                  nextTargetDiscount = camp.tier3_discount;
                }

                const maxTarget = camp.tier3_qty || camp.tier2_qty || camp.tier1_qty;
                const progressPercent = Math.min((currentVolume / maxTarget) * 100, 100);
                const remaining = nextTargetQty ? nextTargetQty - currentVolume : 0;

                return (
                  <div key={camp.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-slate-900 text-xs leading-snug">{camp.products?.name_ar}</h4>
                      {activeDiscount > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                          مفعل {activeDiscount}%
                        </span>
                      )}
                    </div>
                    
                    {nextTargetQty ? (
                      <p className="text-slate-600 text-xs leading-relaxed">
                        مبيعات قريتك الحالية ({currentVolume} عبوة) تقترب من تفعيل خصم <span className="text-amber-700 font-bold">%{nextTargetDiscount}</span> للجميع.
                      </p>
                    ) : (
                      <p className="text-emerald-800 text-xs font-bold bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                        🎉 مبروك! حققت قريتك الحد الأقصى للخصم (%{activeDiscount}) للجميع!
                      </p>
                    )}

                    <div>
                      <div className="flex justify-between text-xs mb-1.5 font-semibold">
                        <span className="text-slate-700">{currentVolume} عبوة مسجلة</span>
                        <span className="text-emerald-800 font-mono">
                          {nextTargetQty ? `الهدف: ${nextTargetQty}` : `الحد الأقصى: ${maxTarget}`}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden border border-slate-300">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            nextTargetQty === null
                              ? "bg-gradient-to-l from-emerald-500 to-emerald-700"
                              : "bg-gradient-to-l from-amber-500 to-emerald-600"
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      
                      {nextTargetQty && (
                        <p className="text-center text-amber-800 text-[11px] mt-2 font-bold bg-amber-50/70 p-1.5 rounded-lg border border-amber-200">
                          متبقي {remaining} عبوة لتفعيل خصم %{nextTargetDiscount}!
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info Card */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-3xl p-6 shadow-xs">
          <h4 className="text-emerald-900 font-bold text-sm mb-2 flex items-center gap-2">
            💡 كيف يعمل الشراء الجماعي؟
          </h4>
          <p className="text-slate-600 text-xs leading-relaxed">
            عندما تقوم بتجميع طلبات من عدة فلاحين في نفس القرية لنفس المنتج وتصل للحد الأدنى للكمية، سيتم تطبيق الخصم التلقائي وإضافته لمحفظتك فوراً بعد التحصيل.
          </p>
        </div>
      </div>
    </div>
  );
}

