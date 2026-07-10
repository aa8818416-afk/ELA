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

          {activeCampaigns.length === 0 ? (
            <p className="text-slate-400 text-sm relative z-10">
              لا توجد عروض شراء جماعي نشطة حالياً في قريتك.
            </p>
          ) : (
            <div className="space-y-6 relative z-10">
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
                  <div key={camp.id} className="border-b border-slate-800/40 pb-4 last:border-0 last:pb-0">
                    <h4 className="font-bold text-white text-sm mb-1">{camp.products?.name_ar}</h4>
                    
                    {nextTargetQty ? (
                      <p className="text-slate-400 text-xs mb-3 leading-relaxed">
                        مبيعات قريتك الحالية ({currentVolume} عبوة) تقترب من تفعيل خصم <span className="text-amber-400 font-bold">%{nextTargetDiscount}</span> للجميع.
                      </p>
                    ) : (
                      <p className="text-emerald-400 text-xs mb-3 font-bold">
                        🎉 مبروك! حققت قريتك الحد الأقصى للخصم (%{activeDiscount}) للجميع!
                      </p>
                    )}

                    <div>
                      <div className="flex justify-between text-xs mb-1.5 font-medium">
                        <span className="text-slate-300">{currentVolume} عبوة</span>
                        <span className="text-amber-500">
                          {nextTargetQty ? `الهدف التالي: ${nextTargetQty}` : `الهدف الأقصى: ${maxTarget}`}
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="w-full h-3.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ease-out ${
                            nextTargetQty === null
                              ? "bg-gradient-to-l from-emerald-400 to-emerald-600"
                              : "bg-gradient-to-l from-amber-400 to-amber-600"
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                      
                      {nextTargetQty && (
                        <p className="text-center text-amber-500/80 text-[10px] mt-2 font-medium">
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

