import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/cleanup-drafts
 * Periodic cron cleanup of expired draft fields (>30 days) and abandoned draft fields (>7 days).
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: deletedCount, error } = await (supabase as any).rpc("cleanup_stale_fields");

    if (error) {
      console.error("[cleanup-drafts] RPC cleanup_stale_fields failed:", error);
      return NextResponse.json({ error: "Cleanup failed", details: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedCount: deletedCount ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[cleanup-drafts] Error:", err);
    return NextResponse.json({ error: "Cleanup exception", message: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
