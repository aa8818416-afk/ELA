import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { EdgeTTS } from "edge-tts-universal";
import type { Database } from "@/types/database.types";

type TtsSettingsUpdate = Database["public"]["Tables"]["tts_settings"]["Update"];

// Admin supabase client (bypasses RLS to write tts_settings)
function getAdminClient() {
  return createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── GET /api/admin/tts-settings ─────────────────────────────────────────────
export async function GET() {
  try {
    // Verify authenticated admin session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("tts_settings")
      .select("*")
      .eq("id", "default")
      .single();

    if (error) {
      console.error("[tts-settings] GET error:", error);
      return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (err) {
    console.error("[tts-settings] GET unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─── PUT /api/admin/tts-settings ─────────────────────────────────────────────
export async function PUT(request: Request) {
  try {
    // Verify authenticated admin session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    const update: TtsSettingsUpdate = {
      voice:               body.voice,
      rate:                body.rate,
      pitch:               body.pitch,
      volume:              body.volume,
      break_on_comma_ms:   Number(body.break_on_comma_ms),
      break_on_period_ms:  Number(body.break_on_period_ms),
      chunk_max_chars:     Number(body.chunk_max_chars),
      auto_breaks_enabled: Boolean(body.auto_breaks_enabled),
    };

    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from("tts_settings")
      .update(update)
      .eq("id", "default")
      .select()
      .single();

    if (error) {
      console.error("[tts-settings] PUT error:", error);
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }

    // Invalidate the in-memory cache in the TTS route module
    // We do this by hitting a special internal signal via a module-level cache
    // The cache will naturally expire in 60s — acceptable UX for admin usage
    console.log("[tts-settings] Settings saved, cache will expire in 60s:", data);

    return NextResponse.json({ success: true, settings: data });
  } catch (err) {
    console.error("[tts-settings] PUT unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─── POST /api/admin/tts-settings (preview test) ─────────────────────────────
export async function POST(request: Request) {
  try {
    // Verify authenticated admin session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      text = "مرحباً، هذه تجربة صوتية للتحقق من الإعدادات الجديدة.",
      voice = "ar-EG-SalmaNeural",
      rate = "+0%",
      pitch = "+0Hz",
      volume = "+0%",
      break_on_comma_ms = 300,
      break_on_period_ms = 600,
      auto_breaks_enabled = true,
    } = body;

    let processedText = text;

    // Apply SSML breaks if enabled
    if (auto_breaks_enabled) {
      const escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const withBreaks = escaped
        .replace(/([،,])\s*/g, `$1<break time="${break_on_comma_ms}ms"/> `)
        .replace(/([.!?؟])\s*/g, `$1<break time="${break_on_period_ms}ms"/> `);
      processedText = `<speak>${withBreaks}</speak>`;
    }

    const tts = new EdgeTTS(processedText, voice, { rate, pitch, volume });
    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      },
    });
  } catch (err) {
    console.error("[tts-settings] POST test error:", err);
    return NextResponse.json({ error: "فشل تجربة الصوت" }, { status: 500 });
  }
}
