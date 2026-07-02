"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function dispatchTrip(driverName: string, driverPhone: string, orderIds: string[]) {
  if (!orderIds || orderIds.length === 0) {
    return { error: "يجب اختيار طلب واحد على الأقل" };
  }

  const supabase = await createClient();

  // 1. Create the trip record
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: tripError } = await (supabase as any)
    .from("trips")
    .insert({
      driver_name: driverName,
      driver_phone: driverPhone,
      order_ids: orderIds,
      status: "in_transit",
    });

  if (tripError) {
    return { error: "فشل إنشاء الرحلة: " + tripError.message };
  }

  // 2. Update all selected orders to 'in_transit'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: ordersError } = await (supabase as any)
    .from("orders")
    .update({ status: "in_transit" })
    .in("id", orderIds);

  if (ordersError) {
    return { error: "الرحلة أُنشئت لكن فشل تحديث حالة الطلبات: " + ordersError.message };
  }

  // 3. Simulate WhatsApp Notification
  // In a real production app with a WhatsApp Business API, we would fetch the farmer's phone
  // numbers here and send them a template message.
  
  // const { data: farmersToNotify } = await supabase
  //   .from("orders")
  //   .select("farmers(profiles(phone))")
  //   .in("id", orderIds);
  //
  // await sendWhatsAppMessage(phones, "البضاعة في الطريق إليكم الآن...");

  console.log(`[WhatsApp API Mock] Sent dispatch notification to ${orderIds.length} orders.`);

  revalidatePath("/admin/trips");
  return { success: true, simulatedNotifCount: orderIds.length };
}
