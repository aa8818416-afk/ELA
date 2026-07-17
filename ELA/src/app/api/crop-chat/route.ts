import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";

interface GeminiPart {
    text?: string;
    inline_data?: { mime_type: string; data: string };
}

interface ChatMessage {
    role: "user" | "model";
    parts: GeminiPart[];
}

interface RequestHistoryItem {
    role: "user" | "model";
    content: string;
    imageBase64?: string; // Optional image specifically attached to this message
}

/**
 * POST /api/crop-chat
 * Accepts: {
 *   history: { role: 'user' | 'model', content: string, imageBase64?: string }[],
 *   message: string,
 *   imageBase64?: string // Optional image for the current message
 * }
 * Performs AI chat with Gemini + Key Rotation.
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
        const { history, message, imageBase64 } = body as {
            history?: RequestHistoryItem[];
            message: string;
            imageBase64?: string;
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
4. حافظ على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات الهاتف المحمول وتوليد الصوت بكفاءة وسرعة.

قواعد الكتابة والتنسيق الصوتي (لتحسين أداء قارئ النصوص Edge TTS):
بما أن إجابتك سيتم تحويلها مباشرة إلى صوت مسموع لكي يستمع إليها المزارع بصوت المعلق (شاكر)، يرجى الالتزام التام بالقواعد التالية أثناء صياغة النص:

أولاً: علامات الترقيم (الوقفات الطبيعية):
وزّع الفواصل (،) والنقاط (.) بدقة شديدة بعد كل فكرة مكتملة أو تفصيل. لا تكتب جملًا طويلة متصلة؛ بل قسّمها بفواصل ونقاط، وذلك لأن النظام البرمجي يحول هذه العلامات تلقائياً إلى وقفات نَفَس طبيعية للمعلق الصوتي بناءً على إعدادات قاعدة البيانات الخاصة بنا.

ثانياً: التشكيل الكامل للنص:
شكِّل النص بأكمله تشكيلاً كاملاً ودقيقاً على كل كلمة، بما في ذلك المصطلحات الزراعية والعلمية وكل الكلمات العادية، وذلك لضمان نطق سليم ومتناسق لجميع الكلمات دون استثناء (أمثلة هامة للتشكيل: رَيّ، فِطْر، سِمَاد، مَرَض، تُصِيب، رُطُوبَة، قَضَاء، فِجّ، الِتْبَاع).

ثالثاً: البعد عن الرموز المعرقلة:
تجنب استخدام الرموز البرمجية أو تنسيقات الماركدوان المعقدة داخل الجمل (مثل النجمات المزدوجة لتغميق النص ** أو الخطوط المائلة _) وتجنب استخدام الرموز التعبيرية (Emojis) بكثرة، لأن هذه الرموز تسبب قراءة خاطئة أو تقطعاً غير مبرر في الصوت أثناء التحويل.
[قواعد صارمة جداً للإخراج]
إياك أن تكتب خطوات تفكيرك الداخلي أو مسودات الإجابة (Drafts) أو الشروط (Constraints) في الرد.
يجب أن يكون ردك هو الإجابة النهائية فقط باللغة العربية مع التشكيل الكامل.
لا تكتب أي كلمة باللغة الإنجليزية، ولا تستخدم النقاط (Bullet points) لشرح ما تفكر فيه.
النص الذي ستخرجه سيذهب مباشرة لمحرك صوتي (TTS)، لذا أي كلمة إضافية غير الرد الموجه للفلاح ستفسد النظام.
`;

        // 4. Build Gemini contents array preserving original images at their correct turns
        const contents: ChatMessage[] = [];

        // Add previous history
        if (history && history.length > 0) {
            history.forEach((h) => {
                const parts: GeminiPart[] = [{ text: h.content }];
                if (h.imageBase64) {
                    const rawBase64 = h.imageBase64.split(",")[1] || h.imageBase64;
                    parts.push({
                        inline_data: { mime_type: "image/jpeg", data: rawBase64 },
                    });
                }
                contents.push({
                    role: h.role,
                    parts,
                });
            });
        }

        // Build current user message parts
        const currentUserParts: GeminiPart[] = [{ text: message }];
        if (imageBase64) {
            const rawBase64 = imageBase64.split(",")[1] || imageBase64;
            currentUserParts.push({
                inline_data: { mime_type: "image/jpeg", data: rawBase64 },
            });
        }

        const requestBody = {
            contents: [
                ...contents,
                {
                    role: "user" as const,
                    parts: currentUserParts,
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

        // 5. Recursive Key Rotation (same pattern as crop-doctor)
        async function attemptChat(attemptCount = 0, excludedIds: string[] = []): Promise<NextResponse> {
            if (attemptCount > 5) {
                return NextResponse.json(
                    { error: "خدمة الذكاء الاصطناعي مشغولة حالياً، يرجى المحاولة بعد بضع دقائق" },
                    { status: 503 }
                );
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabaseAdmin as any)
                .from("api_key_models")
                .select("id, model_name, daily_usage, daily_limit, status, api_keys!inner(id, api_key, status, project_name)")
                .eq("status", "active")
                .eq("api_keys.status", "active")
                .eq("api_keys.project_name", "gemini")
                .order("daily_usage", { ascending: true });

            if (excludedIds.length > 0) {
                query = query.not("id", "in", `(${excludedIds.join(",")})`);
            }

            const { data: keyModels, error: keyError } = await query;

            if (keyError || !keyModels || keyModels.length === 0) {
                console.error(
                    "[crop-chat] No active Gemini key available in DB:",
                    keyError
                );
                return NextResponse.json(
                    { error: "نظام الذكاء الاصطناعي غير متاح حالياً" },
                    { status: 503 }
                );
            }

            // Filter in JS to ensure daily_usage < daily_limit
            const validKeys = keyModels.filter((km: any) => km.daily_usage < km.daily_limit);

            if (validKeys.length === 0) {
                console.error("[crop-chat] All active Gemini keys have exceeded their daily limits.");
                return NextResponse.json(
                    { error: "نظام الذكاء الاصطناعي غير متاح حالياً (تم تجاوز حد الاستخدام)" },
                    { status: 503 }
                );
            }

            const keyData = validKeys[0];

            const modelName = keyData.model_name || "gemini-2.0-flash";
            const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_keys.api_key}`;

            console.log(`[crop-chat] Attempt ${attemptCount + 1}: Using model ${modelName} on key ${keyData.api_keys.id.slice(0, 6)}... (model usage: ${keyData.daily_usage})`);

            const controller = new AbortController();
            const timeoutMs = 60_000; // slightly longer for multimodal
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
                    `[crop-chat] FETCH FAILED | Attempt ${attemptCount + 1} | Key: ${keyData.api_keys.id.slice(0, 6)}... | Error:`,
                    fetchError
                );
                if (aborted && attemptCount < 5) {
                    return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
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
                    `[crop-chat] API ERROR | HTTP ${response.status} | Key: ${keyData.api_keys.id.slice(0, 6)}... | Body:`,
                    errorBody
                );
                if (response.status === 429) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabaseAdmin as any)
                        .from("api_key_models")
                        .update({ status: "rate_limited" })
                        .eq("id", keyData.id);
                    return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
                }
                if (response.status === 503) {
                    await new Promise((r) => setTimeout(r, 3000));
                    return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
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
                .from("api_key_models")
                .update({ daily_usage: keyData.daily_usage + 1 })
                .eq("id", keyData.id);

            const data = await response.json();
            const parts = data.candidates?.[0]?.content?.parts ?? [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const resultText = parts.find((p: any) => !p.thought)?.text;

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
