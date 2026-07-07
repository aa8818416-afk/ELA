import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DeliveryItem from "@/components/distributor/DeliveryItem";
import { CheckSquare } from "lucide-react";

export default async function DeliveriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch pending and in_transit orders for this distributor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ordersData, error } = await (supabase as any)
    .from("orders")
    .select(`
      id,
      total_price,
      status,
      farmers (
        profiles (full_name)
      ),
      order_items (id)
    `)
    .eq("distributor_id", user.id)
    .in("status", ["pending", "in_transit", "delivered"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching deliveries:", error);
  }

  // Format the data for the component
  const pendingOrders = (ordersData || []).map((order: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Navigate nested Supabase relationships safely
    const farmerProfile = Array.isArray(order.farmers)
      ? (order.farmers[0] as any)?.profiles // eslint-disable-line @typescript-eslint/no-explicit-any
      : (order.farmers as any)?.profiles; // eslint-disable-line @typescript-eslint/no-explicit-any

    const profileObj = Array.isArray(farmerProfile) ? farmerProfile[0] : farmerProfile;

    return {
      id: order.id,
      total_price: order.total_price,
      status: order.status,
      farmer_name: profileObj?.full_name || "اسم غير معروف",
      village: null, // Would fetch from distributors/farmers if stored there
      items_count: order.order_items ? order.order_items.length : 0,
    };
  });

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-indigo-400" />
            التسليمات والتحصيل
          </h2>
          <p className="text-slate-400 text-sm">
            الطلبات الجاهزة للتسليم. قم بتحصيل المبلغ النقدي (الكاش) من الفلاح ثم اضغط على &quot;تأكيد التسليم&quot; لإضافة العمولات لمحفظتك.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {pendingOrders.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🎉</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">لا توجد طلبات معلقة!</h3>
            <p className="text-slate-400">لقد قمت بتسليم جميع الطلبات بنجاح.</p>
          </div>
        ) : (
          pendingOrders.map((order: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
            <DeliveryItem key={order.id} order={order} />
          ))
        )}
      </div>
    </div>
  );
}
