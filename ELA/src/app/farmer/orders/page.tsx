import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import FarmerOrdersClient, { FarmerOrder } from "@/components/farmer/FarmerOrdersClient";

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

  const orders: FarmerOrder[] = ordersData || [];

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

  return <FarmerOrdersClient orders={orders} distProfile={distProfile} />;
}
