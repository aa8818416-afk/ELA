import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";

interface ChatMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

/**
 * POST /api/crop-chat
 * Accepts: { history: { role: 'user' | 'model', content: string }[], message: string }
 * Performs AI chat with Gemini 3.5 Flash + Key Rotation.
 * Returns: { success: true, text: string }
 */
export async function POST(request: Request) {
    try {
        const supabase = await createServerClient();

        // 1. Validate auth
        const {
            data: { user: currentUser },
        } = await supabase.auth.getUser();
        if (!currentUser) {
            return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
        }

        const body = await request.json();
        const { history, message } = body as {
            history?: { role: "user" | "model"; content: string }[];
            message: string;
        };

        if (!message) {
            return NextResponse.json(
                { error: "لم يتم إرسال نص الرسالة" },
                { status: 400 }
            );
        }

        // Admin client (service_role) — bypasses RLS so the server can read/update api_keys.
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
            console.error(
                "[crop-chat] SUPABASE_SERVICE_ROLE_KEY is missing from environment."
            );
            return NextResponse.json(
                { error: "إعداد الخادم غير مكتمل (مفتاح الخدمة مفقود)" },
                { status: 500 }
            );
        }
        const supabaseAdmin = createAdminClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey
        );

        // 2. Fetch all products to inject into the system prompt.
        const { data: products } = await supabase
            .from("products")
            .select("id, name_ar, active_ingredient, price_to_farmer, stock_status");

        const productsContext =
            products
                ?.map(
                    (p: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
                        `- الاسم: ${p.name_ar} | المادة الفعالة: ${p.active_ingredient ?? "غير محددة"} | السعر للمزارع: ${p.price_to_farmer} جنيهاً | متوفر: ${p.stock_status ? "نعم" : "لا"}`
                )
                .join("\n") || "لا توجد منتجات متوفرة حالياً في المعرض.";

        // 3. Define System Prompt for the AI chat
        const systemPrompt = `
أنت مرشد زراعي وخبير مصري ذكي ودود لمساعدة الفلاحين والمزارعين في مصر عبر منصة ELA.
مهمتك هي الإجابة عن تساؤلات المزارع بخصوص المحاصيل، الأمراض، طرق الري والتسميد ومكافحة الآفات.
تحدث بلهجة مصرية مبسطة ومحببة للفلاح المصري أو لغة عربية فصحى سهلة الفهم. كن متعاطفاً وداعماً جداً.

إليك قاعدة بيانات المنتجات الخاصة بنا (يوصى بها فقط إذا كانت متوفرة أي "متوفر: نعم"):
${productsContext}

قواعد أساسية:
1. إذا سألك المزارع عن مرض أو آفة معينة، اشرح له المرض باختصار وبطريقة مبسطة، ثم اقترح له العلاج المناسب من المنتجات المتوفرة لدينا إن وجد.
2. وجهه دائماً للتواصل مع "سفير القرية" (الموزع الخاص به) لشراء الأدوية أو حجز الشحنات للحصول على الخصم الجماعي.
3. لا تقم أبداً باختلاق منتجات غير موجودة في القائمة أعلاه. إذا لم تجد منتجاً مناسباً، قل له أن يستشير سفير القرية لتوفير العلاج الأنسب.
4. حافظ على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات الهاتف المحمول.
`;

        // Format historical messages for Gemini API format (contents)
        const contents: ChatMessage[] = [];

        // Add previous history if exists
        if (history && history.length > 0) {
            history.forEach((h) => {
                contents.push({
                    role: h.role,
                    parts: [{ text: h.content }],
                });
            });
        }

        // Add system instruction as part of system prompt instructions (if API supports, or inject in first message/prompt)
        // For gemini-3.5-flash with history, we can prepend a system message or pass systemInstruction.
        // To be compatible with general gemini endpoints, we can pass systemInstruction inside request configuration.
        const requestBody = {
            contents: [
                ...contents,
                {
                    role: "user" as const,
                    parts: [{ text: message }],
                },
            ],
            systemInstruction: {
                parts: [{ text: systemPrompt }],
            },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 1024,
            },
        };

        // 4. Recursive Key Rotation (same pattern as crop-doctor)
        async function attemptChat(attemptCount = 0): Promise<NextResponse> {
            if (attemptCount > 5) {
                return NextResponse.json(
                    { error: "خدمة الذكاء الاصطناعي مشغولة حالياً، يرجى المحاولة بعد بضع دقائق" },
                    { status: 503 }
                );
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: keyData, error: keyError } = await (supabaseAdmin as any)
                .from("api_keys")
                .select("id, api_key, daily_usage, model_name")
                .eq("status", "active")
                .eq("project_name", "gemini")
                .lt("daily_usage", 1450)
                .order("daily_usage", { ascending: true })
                .limit(1)
                .single();

            if (keyError || !keyData) {
                console.error(
                    "[crop-chat] No active Gemini key available in DB:",
                    keyError
                );
                return NextResponse.json(
                    { error: "نظام الذكاء الاصطناعي غير متاح حالياً" },
                    { status: 503 }
                );
            }

            const modelName = keyData.model_name || "gemini-3.5-flash";
            const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_key}`;

            console.log(`[crop-chat] Attempt ${attemptCount + 1}: Using key ${keyData.id} (usage: ${keyData.daily_usage})`);

            const controller = new AbortController();
            const timeoutMs = 45_000; // Chat responses should be faster than image diagnosis
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

            let response: Response;
            try {
                response = await fetch(geminiEndpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                });
            } catch (fetchError) {
                clearTimeout(timeout);
                const aborted =
                    fetchError instanceof DOMException &&
                    fetchError.name === "AbortError";
                console.error(
                    `[crop-chat] FETCH FAILED | Attempt ${attemptCount + 1} | Key: ${keyData.id.slice(0, 6)}... | Error:`,
                    fetchError
                );
                if (aborted && attemptCount < 5) {
                    return attemptChat(attemptCount + 1);
                }
                return NextResponse.json(
                    {
                        error: aborted
                            ? "خدمة الذكاء الاصطناعي لا تستجيب، تأكد من اتصال الإنترنت وحاول مرة أخرى"
                            : "تعذر الاتصال بخدمة الذكاء الاصطناعي",
                    },
                    { status: aborted ? 504 : 502 }
                );
            } finally {
                clearTimeout(timeout);
            }

            if (!response.ok) {
                const errorBody = await response.text();
                console.error(
                    `[crop-chat] API ERROR | HTTP ${response.status} | Key: ${keyData.id.slice(0, 6)}... | Body:`,
                    errorBody
                );
                if (response.status === 429) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabaseAdmin as any)
                        .from("api_keys")
                        .update({ status: "rate_limited" })
                        .eq("id", keyData.id);
                    return attemptChat(attemptCount + 1);
                }
                if (response.status === 503) {
                    await new Promise((r) => setTimeout(r, 3000));
                    return attemptChat(attemptCount + 1);
                }
                return NextResponse.json(
                    {
                        error: `فشل الاتصال بخدمة الذكاء الاصطناعي (${response.status})`,
                        debug_info: errorBody.slice(0, 200),
                    },
                    { status: 502 }
                );
            }

            // Success — increment usage
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabaseAdmin as any)
                .from("api_keys")
                .update({ daily_usage: keyData.daily_usage + 1 })
                .eq("id", keyData.id);

            const data = await response.json();
            const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!resultText) {
                console.error("[crop-chat] Gemini returned no text content:", data);
                return NextResponse.json(
                    { error: "لم يتمكن النظام من فهم الرسالة، يرجى المحاولة مرة أخرى" },
                    { status: 422 }
                );
            }

            return NextResponse.json({
                success: true,
                text: resultText,
            });
        }

        return attemptChat(0);
    } catch (error) {
        console.error("[crop-chat] Unexpected Error:", error);
        return NextResponse.json(
            { error: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى" },
            { status: 500 }
        );
    }
}
