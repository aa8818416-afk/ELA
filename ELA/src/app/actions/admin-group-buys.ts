"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

type GroupBuyInsert = Database["public"]["Tables"]["group_buy_offers"]["Insert"];

export async function saveGroupBuyOffer(offerData: GroupBuyInsert, id?: string) {
  const supabase = await createClient();

  if (id) {
    // Update existing offer
    const { error } = await (supabase as any)
      .from("group_buy_offers")
      .update(offerData)
      .eq("id", id);

    if (error) {
      return { error: "فشل تحديث عرض الشراء الجماعي: " + error.message };
    }
  } else {
    // Insert new offer
    const { error } = await (supabase as any)
      .from("group_buy_offers")
      .insert(offerData);

    if (error) {
      return { error: "فشل إضافة عرض الشراء الجماعي: " + error.message };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/farmer");
  revalidatePath("/distributor/orders");
  return { success: true };
}

export async function deleteGroupBuyOffer(id: string) {
  const supabase = await createClient();

  const { error } = await (supabase as any)
    .from("group_buy_offers")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: "فشل حذف العرض: " + error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/farmer");
  revalidatePath("/distributor/orders");
  return { success: true };
}
