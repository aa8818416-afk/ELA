"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function resetDailyUsage(id: string) {
  const supabase = await createClient();
  
  // 1. Reset main key usage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: keyError } = await (supabase as any)
    .from("api_keys")
    .update({ daily_usage: 0, status: "active", last_reset: new Date().toISOString() })
    .eq("id", id);

  if (keyError) {
    return { error: keyError.message };
  }

  // 2. Reset all model usages and restore their statuses to active
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: modelError } = await (supabase as any)
    .from("api_key_models")
    .update({ daily_usage: 0, status: "active" })
    .eq("key_id", id);

  if (modelError) {
    return { error: modelError.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}

export async function forceActiveStatus(id: string) {
  const supabase = await createClient();
  
  // 1. Force active parent key status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: keyError } = await (supabase as any)
    .from("api_keys")
    .update({ status: "active" })
    .eq("id", id);

  if (keyError) {
    return { error: keyError.message };
  }

  // 2. Force active status on all model rows for this key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: modelError } = await (supabase as any)
    .from("api_key_models")
    .update({ status: "active" })
    .eq("key_id", id);

  if (modelError) {
    return { error: modelError.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}

export async function addKeyModel(keyId: string, modelName: string, dailyLimit = 1450) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("api_key_models")
    .insert({ key_id: keyId, model_name: modelName, daily_limit: dailyLimit, daily_usage: 0, status: "active" });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}

export async function deleteKeyModel(id: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("api_key_models")
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}

export async function updateKeyModelLimit(id: string, dailyLimit: number) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("api_key_models")
    .update({ daily_limit: dailyLimit })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/api-keys");
  return { success: true };
}
