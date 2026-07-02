"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];

export async function saveProduct(productData: ProductInsert, id?: string) {
  const supabase = await createClient();

  if (id) {
    // Update existing product
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("products")
      .update(productData)
      .eq("id", id);

    if (error) {
      return { error: "فشل تحديث المنتج: " + error.message };
    }
  } else {
    // Insert new product
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("products")
      .insert(productData);

    if (error) {
      return { error: "فشل إضافة المنتج: " + error.message };
    }
  }

  revalidatePath("/admin");
  return { success: true };
}
