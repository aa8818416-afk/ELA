import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DeliveriesClient, { OrderData } from "@/components/distributor/DeliveriesClient";

export default async function DeliveriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch all relevant orders for this distributor (pending, in_transit, delivered)
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
      order_items (
        id,
        quantity,
        products (
          name_ar,
          image_url
        )
      )
    `)
    .eq("distributor_id", user.id)
    .in("status", ["pending", "in_transit", "delivered"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching deliveries:", error);
  }

  // Format the data for the client component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allOrders: OrderData[] = (ordersData || []).map((order: any) => {
    const farmerProfile = Array.isArray(order.farmers)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (order.farmers[0] as any)?.profiles
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : (order.farmers as any)?.profiles;

    const profileObj = Array.isArray(farmerProfile) ? farmerProfile[0] : farmerProfile;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (order.order_items || []).map((item: any) => ({
      id: item.id,
      quantity: item.quantity,
      name_ar: item.products?.name_ar || "منتج",
      image_url: item.products?.image_url || null,
    }));

    return {
      id: order.id,
      total_price: order.total_price,
      status: order.status,
      farmer_name: profileObj?.full_name || "اسم غير معروف",
      village: null,
      items_count: items.length,
      items,
    };
  });

  return <DeliveriesClient allOrders={allOrders} />;
}
