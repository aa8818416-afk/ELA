import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export async function GET(request: Request) {
  try {
    // 1. Verify simple Bearer token for Cron Job security
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Initialize Supabase Admin Client to bypass RLS for background jobs
    const supabaseAdmin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3. Reset all keys: daily_usage to 0, status to 'active'
    const { error } = await supabaseAdmin
      .from("api_keys")
      .update({ 
        daily_usage: 0, 
        status: "active",
        last_reset: new Date().toISOString()
      })
      .neq("status", "permanently_banned");

    if (error) {
      console.error("[Cron Reset] Database Error (api_keys):", error);
      return NextResponse.json({ error: "Failed to reset keys" }, { status: 500 });
    }

    // 4. Reset all model-specific usages and restore rate_limited models to active
    const { error: modelError } = await supabaseAdmin
      .from("api_key_models")
      .update({
        daily_usage: 0,
        status: "active"
      })
      .neq("status", "permanently_banned");

    if (modelError) {
      console.error("[Cron Reset] Database Error (api_key_models):", modelError);
      return NextResponse.json({ error: "Failed to reset model usage" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "All keys have been reset." });
  } catch (error) {
    console.error("[Cron Reset] Unexpected Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
