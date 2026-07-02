"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleDistributorStatus(profileId: string, currentStatus: boolean) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("distributors")
    .update({ active_status: !currentStatus })
    .eq("profile_id", profileId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/distributors");
  return { success: true };
}

export async function settleDistributorWallet(profileId: string) {
  const supabase = await createClient();

  // Reset wallet balance to 0 (Admin paid them offline)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("distributors")
    .update({ wallet_balance: 0 })
    .eq("profile_id", profileId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/distributors");
  return { success: true };
}
