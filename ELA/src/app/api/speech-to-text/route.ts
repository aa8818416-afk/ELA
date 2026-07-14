import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * POST /api/speech-to-text
 * Receives a multipart/form-data with an "audio" file.
 * Rotates Groq API keys from database to translate Speech to Text via whisper-large-v3.
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get("audio") as File | null;

        if (!audioFile) {
            return NextResponse.json({ error: "لم يتم إرسال ملف الصوت" }, { status: 400 });
        }

        // Initialize admin Supabase client to access groq_keys bypass RLS
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            console.error("[stt] SUPABASE_SERVICE_ROLE_KEY is missing from environment.");
            return NextResponse.json(
                { error: "إعداد الخادم غير مكتمل (مفتاح الخدمة مفقود)" },
                { status: 500 }
            );
        }
        const supabaseAdmin = createAdminClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey
        );

        // Recursive key rotation function
        async function attemptTranscription(attemptCount = 0, excludedIds: string[] = []): Promise<NextResponse> {
            if (attemptCount > 5) {
                return NextResponse.json(
                    { error: "خدمة تحويل الصوت مشغولة حالياً، يرجى المحاولة لاحقاً" },
                    { status: 503 }
                );
            }

            // Fetch active groq key with lowest usage
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabaseAdmin as any)
                .from("groq_keys")
                .select("id, api_key, daily_usage")
                .eq("status", "active")
                .lt("daily_usage", 1400);

            if (excludedIds.length > 0) {
                query = query.not("id", "in", `(${excludedIds.join(",")})`);
            }

            const { data: keyData, error: keyError } = await query
                .order("daily_usage", { ascending: true })
                .limit(1)
                .single();

            if (keyError || !keyData) {
                console.error("[stt] No active Groq key found in DB:", keyError);
                return NextResponse.json(
                    { error: "خدمة تحويل الصوت غير متوفرة حالياً" },
                    { status: 503 }
                );
            }

            console.log(`[stt] Attempt ${attemptCount + 1}: Using key ${keyData.id} (usage: ${keyData.daily_usage})`);

            // Build multipart request for Groq Whisper
            const groqFormData = new FormData();
            groqFormData.append("file", audioFile as File);
            groqFormData.append("model", "whisper-large-v3");
            groqFormData.append("language", "ar");

            const controller = new AbortController();
            const timeoutMs = 45_000;
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${keyData.api_key}`,
                    },
                    body: groqFormData,
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[stt] Groq API returned status ${response.status}:`, errorText);

                    if (response.status === 429) {
                        // Rate limited — mark as rate_limited in DB and rotate key
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabaseAdmin as any)
                            .from("groq_keys")
                            .update({ status: "rate_limited" })
                            .eq("id", keyData.id);
                        return attemptTranscription(attemptCount + 1, [...excludedIds, keyData.id]);
                    }

                    return attemptTranscription(attemptCount + 1, [...excludedIds, keyData.id]);
                }

                // Success — update usage count
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabaseAdmin as any)
                    .from("groq_keys")
                    .update({ daily_usage: keyData.daily_usage + 1 })
                    .eq("id", keyData.id);

                const data = await response.json();
                return NextResponse.json({
                    success: true,
                    text: data.text,
                });

            } catch (fetchError) {
                clearTimeout(timeout);
                const aborted = fetchError instanceof DOMException && fetchError.name === "AbortError";
                console.error(`[stt] Fetch failed (aborted=${aborted}):`, fetchError);
                if (attemptCount < 5) {
                    return attemptTranscription(attemptCount + 1, [...excludedIds, keyData.id]);
                }
                return NextResponse.json(
                    { error: "حدث خطأ أثناء معالجة ملف الصوت" },
                    { status: 500 }
                );
            }
        }

        return attemptTranscription(0);

    } catch (error) {
        console.error("[stt] Unexpected error:", error);
        return NextResponse.json({ error: "حدث خطأ غير متوقع في الخادم" }, { status: 500 });
    }
}
