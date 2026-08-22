import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/cleanup-drafts
 * Periodic cron cleanup of expired draft fields (>30 days) and abandoned draft fields (>7 days).
 */
export async function GET() {
  return NextResponse.json({ message: "Draft cleanup is deprecated (draft system removed)." });
}

export async function POST() {
  return NextResponse.json({ message: "Draft cleanup is deprecated (draft system removed)." });
}

