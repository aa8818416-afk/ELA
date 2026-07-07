import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";

const statusMap: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  pending: {
    label: "قيد الانتظار",
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    icon: "🟡",
  },
  in_transit: {
    label: "قيد التوصيل",
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    icon: "🚚",
  },
  delivered: {
    label: "تم التسليم",
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    icon: "✅",
  },
  cancelled: {
    label: "ملغي",
    color: "text-red-400 bg-red-500/10 border-red-500/20",
    icon: "❌",
  },
};

export default async function FarmerOrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 1. Fetch all orders for this farmer with nested items and products
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ordersData, error } = await (supabase as any)
    .from("orders")
    .select(
      `
      id,
      created_at,
      total_price,
      status,
      payment_status,
      order_items (
        quantity,
        products ( name_ar, image_url )
      ),
      distributors (
        village,
        profiles ( full_name, phone )
      )
    `
    )
    .eq("farmer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) console.error("Error fetching farmer orders:", error);

  const orders: any[] = ordersData || []; // eslint-disable-line @typescript-eslint/no-explicit-any

  // 2. Get distributor contact (from most recent order or from farmers table)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: farmerData } = await (supabase as any)
    .from("farmers")
    .select(
      "distributor_id, distributors(village, profiles(full_name, phone))"
    )
    .eq("profile_id", user.id)
    .single();

  const distProfile = farmerData?.distributors?.profiles;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Package className="w-6 h-6 text-emerald-400" />
          طلباتي
        </h1>
        <p className="text-slate-400 text-sm">تابع طلباتك النشطة والسابقة</p>
      </div>

      {/* Distributor Contact Pill */}
      {distProfile && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg">
            👨‍🌾
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 text-xs">سفير قريتك</p>
            <p className="text-white font-bold text-sm truncate">
              {distProfile.full_name || "السفير"}
            </p>
          </div>
          {distProfile.phone && (
            <a
              href={`tel:${distProfile.phone}`}
              className="text-emerald-400 text-sm font-bold border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 rounded-xl"
            >
              📞 اتصل
            </a>
          )}
        </div>
      )}

      {/* Orders List */}
      {orders.length === 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-10 text-center">
          <p className="text-4xl mb-3">📦</p>
          <h3 className="text-white font-bold text-lg mb-2">لا توجد طلبات بعد</h3>
          <p className="text-slate-400 text-sm">
            سيضهر هنا كل طلباتك بعد أن يقوم سفيرك بتسجيلها
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const status =
              statusMap[order.status] || statusMap.pending;
            const orderDate = new Date(order.created_at).toLocaleDateString(
              "ar-EG",
              { day: "numeric", month: "long", year: "numeric" }
            );
            const items: any[] = order.order_items || []; // eslint-disable-line @typescript-eslint/no-explicit-any

            return (
              <div
                key={order.id}
                className="bg-slate-900/70 border border-slate-800 rounded-3xl overflow-hidden"
              >
                {/* Order Header */}
                <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-slate-500 text-xs mb-1">{orderDate}</p>
                    <p className="text-emerald-400 font-bold text-xl">
                      {order.total_price?.toLocaleString()} ج.م
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border ${status.color}`}
                  >
                    {status.icon} {status.label}
                  </span>
                </div>

                {/* Products */}
                {items.length > 0 && (
                  <div className="border-t border-slate-800 px-5 py-3 space-y-2">
                    {items.map((item: any, idx: number) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <div
                        key={idx}
                        className="flex items-center justify-between text-sm animate-fade-in"
                      >
                        <div className="flex items-center gap-2.5">
                          {item.products?.image_url ? (
                            <img
                              src={item.products.image_url}
                              alt={item.products.name_ar}
                              className="w-8 h-8 rounded-lg object-cover bg-slate-800 border border-slate-800"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-800 flex items-center justify-center text-xs">
                              📦
                            </div>
                          )}
                          <span className="text-slate-300 font-medium">
                            {item.products?.name_ar || "منتج"}
                          </span>
                        </div>
                        <span className="text-slate-500 font-semibold">
                          × {item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Payment Status */}
                <div className="border-t border-slate-800 px-5 py-3 flex items-center justify-between">
                  <span className="text-slate-500 text-xs">حالة الدفع</span>
                  <span
                    className={`text-xs font-bold ${
                      order.payment_status === "paid"
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  >
                    {order.payment_status === "paid" ? "✅ مدفوع" : "⏳ غير مدفوع"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
