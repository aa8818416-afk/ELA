import { NextResponse } from "next/server";
import { EdgeTTS } from "edge-tts-universal";
import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";

type TtsSettings = Database["public"]["Tables"]["tts_settings"]["Row"];

// ─── In-memory settings cache (60s TTL) ─────────────────────────────────────
let settingsCache: TtsSettings | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000;

async function getTtsSettings(): Promise<TtsSettings> {
  const now = Date.now();
  if (settingsCache && now < cacheExpiresAt) return settingsCache;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tts_settings")
    .select("*")
    .eq("id", "default")
    .single();

  if (error || !data) {
    // Return hardcoded defaults if DB fails
    return {
      id: "default",
      voice: "ar-EG-SalmaNeural",
      rate: "+0%",
      pitch: "+0Hz",
      volume: "+0%",
      break_on_comma_ms: 300,
      break_on_period_ms: 600,
      chunk_max_chars: 800,
      auto_breaks_enabled: true,
      updated_at: new Date().toISOString(),
    };
  }

  settingsCache = data;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return data;
}

/** Clears the in-memory cache (called after admin saves new settings) */
export function invalidateTtsSettingsCache() {
  settingsCache = null;
  cacheExpiresAt = 0;
}

// ─── SSML Break Injection ────────────────────────────────────────────────────
/**
 * Wraps text in SSML speak tags and inserts <break> pauses at punctuation.
 * Arabic punctuation covered: ، (U+060C), . (period), ! ؟ (question/exclamation)
 */
function applySSMLBreaks(
  text: string,
  commaPauseMs: number,
  periodPauseMs: number
): string {
  // Escape any existing XML-like tags in user text
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Insert breaks after Arabic comma، and western comma
  let ssml = escaped
    .replace(
      /([،,])\s*/g,
      `$1<break time="${commaPauseMs}ms"/> `
    )
    // Insert breaks after sentence-ending punctuation: . ! ? ؟
    .replace(
      /([.!?؟])\s*/g,
      `$1<break time="${periodPauseMs}ms"/> `
    );

  return `<speak>${ssml}</speak>`;
}

// ─── Text Chunking ───────────────────────────────────────────────────────────
/**
 * Splits a long text into chunks not exceeding maxChars characters.
 * Tries to split on sentence boundaries (period/newline) first,
 * falls back to word boundaries.
 */
function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  // Split on sentence-ending punctuation + space
  const sentences = text.split(/(?<=[.!?؟\n])\s+/u);

  let current = "";
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= maxChars) {
      current = current ? current + " " + sentence : sentence;
    } else {
      if (current) chunks.push(current.trim());
      // Sentence itself is too long — split by words
      if (sentence.length > maxChars) {
        const words = sentence.split(/\s+/);
        let wordChunk = "";
        for (const word of words) {
          if ((wordChunk + " " + word).trim().length <= maxChars) {
            wordChunk = wordChunk ? wordChunk + " " + word : word;
          } else {
            if (wordChunk) chunks.push(wordChunk.trim());
            wordChunk = word;
          }
        }
        if (wordChunk) current = wordChunk;
      } else {
        current = sentence;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

// ─── Synthesize a single chunk ───────────────────────────────────────────────
async function synthesizeChunk(
  text: string,
  settings: TtsSettings
): Promise<Buffer> {
  const tts = new EdgeTTS(text, settings.voice, {
    rate: settings.rate,
    pitch: settings.pitch,
    volume: settings.volume,
  });
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

// ─── POST /api/text-to-speech ─────────────────────────────────────────────────
/**
 * Accepts: { text: string, voice?: string }
 * Returns: MP3 audio stream
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, voice } = body as { text: string; voice?: string };

    if (!text?.trim()) {
      return NextResponse.json({ error: "لم يتم إرسال النص" }, { status: 400 });
    }

    // Fetch settings from DB (with cache)
    const settings = await getTtsSettings();

    // Override voice if caller explicitly provides one
    const activeSettings: TtsSettings = voice
      ? { ...settings, voice }
      : settings;

    console.log(
      `[tts] voice=${activeSettings.voice} rate=${activeSettings.rate} pitch=${activeSettings.pitch} ` +
      `breaks=${activeSettings.auto_breaks_enabled} chunk_max=${activeSettings.chunk_max_chars} ` +
      `text_len=${text.length}`
    );

    // Split into chunks to avoid Vercel timeout on long texts
    const chunks = chunkText(text.trim(), activeSettings.chunk_max_chars);
    console.log(`[tts] ${chunks.length} chunk(s)`);

    // Prepare each chunk — apply SSML breaks if enabled
    const chunkTexts = chunks.map((chunk) =>
      activeSettings.auto_breaks_enabled
        ? applySSMLBreaks(
            chunk,
            activeSettings.break_on_comma_ms,
            activeSettings.break_on_period_ms
          )
        : chunk
    );

    // Synthesize all chunks in parallel
    const audioBuffers = await Promise.all(
      chunkTexts.map((c) => synthesizeChunk(c, activeSettings))
    );

    // Concatenate all audio buffers into one
    const combined = Buffer.concat(audioBuffers);

    return new Response(combined, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": combined.length.toString(),
      },
    });
  } catch (error) {
    console.error("[tts] TTS Error:", error);
    return NextResponse.json(
      { error: "فشل تحويل النص إلى كلام" },
      { status: 500 }
    );
  }
}
