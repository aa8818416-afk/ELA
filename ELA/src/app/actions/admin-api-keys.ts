"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function resetDailyUsage(id: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("api_keys")
    .update({ daily_usage: 0, last_reset: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}

export async function forceActiveStatus(id: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("api_keys")
    .update({ status: "active" })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}
