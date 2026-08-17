import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";
import { toFeddan, displayArea } from "@/utils/areaConverter";

interface GeminiPart {
    text?: string;
    thought?: boolean;           // thinking model: marks this part as internal thought
    inline_data?: { mime_type: string; data: string };
    functionCall?: {
        name: string;
        args: Record<string, any>;
        thoughtSignature?: string; // opaque token required for multi-turn tool use
    };
    functionResponse?: {
        name: string;
        response: Record<string, any>;
    };
}

interface ChatMessage {
    role: "user" | "model";
    parts: GeminiPart[];
}

interface RequestHistoryItem {
    role: "user" | "model";
    content: string;
    imageBase64?: string;
}

export const DEFAULT_FARM_DEFAULTS = {
    sprayer_capacity: "رشاشة ظهرية 20 لتر",
    land_area: "1 فدان",
    irrigation_type: "ري غمر",
};

export const EGYPTIAN_CROP_ENUM = [
    "general",
    "قمح",
    "طماطم",
    "بطاطس",
    "بصل",
    "ذرة",
    "قطن",
    "أرز",
    "برسيم",
    "قصب السكر",
    "بنجر السكر",
    "خيار",
    "كوسة",
    "باذنجان",
    "فلفل",
    "ثوم",
    "فراولة",
    "عنب",
    "مانجو",
    "موالح",
    "فول بلدي",
    "other_crop",
] as const;

// ── Grounding / Web Sources Extraction ─────────────────────────────────────────
function extractGroundingSources(
    candidate?: any,
    rootData?: any,
    fallbackText?: string
): Array<{ title: string; url: string }> {
    const sources: Array<{ title: string; url: string }> = [];
    const seenUrls = new Set<string>();

    const addSource = (rawUrl?: string, rawTitle?: string) => {
        if (!rawUrl || typeof rawUrl !== "string") return;
        const cleanUrl = rawUrl.trim();
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) return;
        if (seenUrls.has(cleanUrl)) return;

        let title = rawTitle?.trim() || "";
        if (!title || title === "مصدر خارجي" || title === "Google Search") {
            try {
                const parsed = new URL(cleanUrl);
                title = parsed.hostname.replace(/^www\./, "");
            } catch {
                title = "مصدر ويب";
            }
        }
        seenUrls.add(cleanUrl);
        sources.push({ title, url: cleanUrl });
    };

    const groundingMeta =
        candidate?.groundingMetadata ||
        candidate?.grounding_metadata ||
        rootData?.groundingMetadata ||
        rootData?.grounding_metadata ||
        rootData?.candidates?.[0]?.groundingMetadata ||
        rootData?.candidates?.[0]?.grounding_metadata;

    if (groundingMeta) {
        const chunks =
            groundingMeta.groundingChunks ||
            groundingMeta.grounding_chunks ||
            groundingMeta.searchChunks ||
            groundingMeta.search_chunks ||
            groundingMeta.webChunks ||
            groundingMeta.web_chunks ||
            [];

        if (Array.isArray(chunks)) {
            for (const chunk of chunks) {
                const uri =
                    chunk?.web?.uri ||
                    chunk?.web?.url ||
                    chunk?.uri ||
                    chunk?.url ||
                    chunk?.web_uri ||
                    chunk?.web_url;

                const title =
                    chunk?.web?.title ||
                    chunk?.title ||
                    chunk?.web_title;

                if (uri) {
                    addSource(uri, title);
                }
            }
        }

        const renderedContent =
            groundingMeta.searchEntryPoint?.renderedContent ||
            groundingMeta.search_entry_point?.rendered_content;
        if (renderedContent && typeof renderedContent === "string") {
            const hrefMatches = renderedContent.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi);
            for (const m of hrefMatches) {
                addSource(m[1]);
            }
        }
    }

    const parts: any[] = candidate?.content?.parts || [];
    for (const part of parts) {
        if (part?.text && typeof part.text === "string") {
            const urlMatches = part.text.matchAll(/https?:\/\/[^\s\)\>\]"']+/gi);
            for (const m of urlMatches) {
                addSource(m[0]);
            }
        }
    }

    if (fallbackText && typeof fallbackText === "string") {
        const urlMatches = fallbackText.matchAll(/https?:\/\/[^\s\)\>\]"']+/gi);
        for (const m of urlMatches) {
            addSource(m[0]);
        }
    }

    return sources;
}

// ── Gemma Key Selection Helper (Least-Used Gemma Model) ────────────────────────
async function getCandidateGemmaKeys(
    primaryApiKey: string,
    keyModels?: any[],
    supabaseAdmin?: any
): Promise<any[]> {
    let candidateGemmaKeys: any[] = [];

    if (keyModels && keyModels.length > 0) {
        candidateGemmaKeys = keyModels.filter(
            (km: any) =>
                km.status === "active" &&
                km.daily_usage < km.daily_limit &&
                km.model_name &&
                km.model_name.toLowerCase().includes("gemma") &&
                km.api_keys?.api_key &&
                km.api_keys?.project_name === "gemini"
        );
    }

    candidateGemmaKeys.sort((a, b) => (a.daily_usage || 0) - (b.daily_usage || 0));

    if (candidateGemmaKeys.length === 0 && supabaseAdmin) {
        const { data: dbGemmaModels } = await (supabaseAdmin as any)
            .from("api_key_models")
            .select("id, model_name, daily_usage, daily_limit, status, api_keys!inner(id, api_key, status, project_name)")
            .eq("status", "active")
            .eq("api_keys.status", "active")
            .eq("api_keys.project_name", "gemini")
            .ilike("model_name", "%gemma%")
            .order("daily_usage", { ascending: true });

        if (dbGemmaModels && dbGemmaModels.length > 0) {
            candidateGemmaKeys = dbGemmaModels.filter(
                (km: any) =>
                    km.daily_usage < km.daily_limit &&
                    km.api_keys?.api_key &&
                    km.api_keys?.project_name === "gemini"
            );
        }
    }

    if (candidateGemmaKeys.length === 0) {
        candidateGemmaKeys = [
            {
                id: null,
                model_name: "gemma-4-31b-it",
                daily_usage: 0,
                api_keys: { api_key: primaryApiKey, project_name: "gemini" },
            },
            {
                id: null,
                model_name: "gemma-4-26b-a4b-it",
                daily_usage: 0,
                api_keys: { api_key: primaryApiKey, project_name: "gemini" },
            },
        ];
    }

    return candidateGemmaKeys;
}

// ── Gemini / Flash Lite Key Selection Helper (Least-Used Gemini Model) ──────────
async function getCandidateGeminiKeys(
    primaryApiKey: string,
    keyModels?: any[],
    supabaseAdmin?: any
): Promise<any[]> {
    let candidateKeys: any[] = [];

    if (keyModels && keyModels.length > 0) {
        candidateKeys = keyModels.filter(
            (km: any) =>
                km.status === "active" &&
                km.daily_usage < km.daily_limit &&
                km.model_name &&
                !km.model_name.toLowerCase().includes("gemma") &&
                km.api_keys?.api_key &&
                km.api_keys?.project_name === "gemini"
        );
    }

    candidateKeys.sort((a, b) => (a.daily_usage || 0) - (b.daily_usage || 0));

    if (candidateKeys.length === 0 && supabaseAdmin) {
        const { data: dbGeminiModels } = await (supabaseAdmin as any)
            .from("api_key_models")
            .select("id, model_name, daily_usage, daily_limit, status, thinking_level, api_keys!inner(id, api_key, status, project_name)")
            .eq("status", "active")
            .eq("api_keys.status", "active")
            .eq("api_keys.project_name", "gemini")
            .not("model_name", "ilike", "%gemma%")
            .order("daily_usage", { ascending: true });

        if (dbGeminiModels && dbGeminiModels.length > 0) {
            candidateKeys = dbGeminiModels.filter(
                (km: any) =>
                    km.daily_usage < km.daily_limit &&
                    km.api_keys?.api_key &&
                    km.api_keys?.project_name === "gemini"
            );
        }
    }

    if (candidateKeys.length === 0) {
        candidateKeys = [
            {
                id: null,
                model_name: "gemini-3.5-flash-lite",
                daily_usage: 0,
                api_keys: { api_key: primaryApiKey, project_name: "gemini" },
            },
            {
                id: null,
                model_name: "gemini-3.1-flash-lite",
                daily_usage: 0,
                api_keys: { api_key: primaryApiKey, project_name: "gemini" },
            },
        ];
    }

    return candidateKeys;
}

// ── Web Search Sub-Agent (Gemma with google_search) ────────────────────────────
interface GemmaSearchResult {
    success: boolean;
    resultText: string;
    sources: Array<{ title: string; url: string }>;
}

async function executeGemmaSearch(
    query: string,
    primaryApiKey: string,
    keyModels?: any[],
    supabaseAdmin?: any
): Promise<GemmaSearchResult> {
    try {
        console.log(`[crop-chat] 🌐 [Gemma Sub-Agent] Initiating web search for query: "${query}"`);
        const candidateGemmaKeys = await getCandidateGemmaKeys(primaryApiKey, keyModels, supabaseAdmin);

        for (const selectedKey of candidateGemmaKeys) {
            const gemmaApiKey = selectedKey.api_keys?.api_key || primaryApiKey;
            const gemmaModel = selectedKey.model_name || "gemma-4-31b-it";
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${gemmaModel}:generateContent?key=${gemmaApiKey}`;

            console.log(`[crop-chat] 🌐 [Gemma Sub-Agent] Using LEAST-USED model "${gemmaModel}" (current usage: ${selectedKey.daily_usage ?? 0}/${selectedKey.daily_limit ?? "∞"})...`);

            const payload = {
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: `ابحث في الإنترنت عن الاستعلام التالي واستخرج المعلومات المحدثة والدقيقة:\n"${query}"`,
                            },
                        ],
                    },
                ],
                systemInstruction: {
                    parts: [
                        {
                            text: "أنت مساعد بحث زراعي دقيق. مهمتك استخدام أداة google_search المتاحة للبحث في الإنترنت واستخراج معلومات موثوقة ومحدثة والإجابة باختصار ووضوح.",
                        },
                    ],
                },
                tools: [{ google_search: {} }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 2000,
                },
            };

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 120_000);

            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                }).finally(() => clearTimeout(timeout));

                if (!res.ok) {
                    const errText = await res.text();
                    console.error(`[crop-chat] ❌ Gemma sub-agent search failed HTTP ${res.status} for model ${gemmaModel}:`, errText);
                    if (res.status === 429 && selectedKey.id && supabaseAdmin) {
                        await (supabaseAdmin as any)
                            .from("api_key_models")
                            .update({ status: "rate_limited" })
                            .eq("id", selectedKey.id);
                    }
                    continue;
                }

                const data = await res.json();
                const candidate = data.candidates?.[0];
                if (!candidate) continue;

                const parts: any[] = candidate.content?.parts ?? [];
                const textParts = parts.filter((p: any) => !p.thought && p.text).map((p: any) => p.text);
                const resultText = textParts.join("\n").trim() || "تم إجراء البحث بنجاح من المصادر المتاحة.";
                const sources = extractGroundingSources(candidate, data, resultText);

                if (selectedKey.id && supabaseAdmin) {
                    const updatedUsage = (selectedKey.daily_usage || 0) + 1;
                    await (supabaseAdmin as any)
                        .from("api_key_models")
                        .update({ daily_usage: updatedUsage })
                        .eq("id", selectedKey.id);
                }

                console.log(`[crop-chat] ✅ Gemma sub-agent search completed using ${gemmaModel}! Found ${sources.length} sources.`);
                return { success: true, resultText, sources };
            } catch (fetchErr: any) {
                console.error(`[crop-chat] Fetch error calling Gemma model ${gemmaModel}:`, fetchErr);
                continue;
            }
        }

        return {
            success: false,
            resultText: "عذراً، تعذر إجراء البحث الحي حالياً بسبب مشكلة في الاتصال بمزودي البحث.",
            sources: [],
        };
    } catch (err: any) {
        console.error("[crop-chat] Error in executeGemmaSearch:", err);
        return {
            success: false,
            resultText: `تعذر إكمال عملية البحث: ${err?.message || "خطأ غير متوقع"}`,
            sources: [],
        };
    }
}

// ── Orchestrator Tool Declarations ─────────────────────────────────────────────
const orchestratorToolDeclaration = {
    functionDeclarations: [
        {
            name: "activity_subagent",
            description: "استدعِ هذا المتخصص فوراً عندما يذكر الفلاح أنه قام فعلياً بنشاط زراعي (رش/تسميد/ري/حصاد/عمالة)، أو عندما يريد تسجيل/تعديل/تغيير محصول أرض. أرسل له نص الفلاح الخام كاملاً كما هو.",
            parameters: {
                type: "OBJECT",
                properties: {
                    raw_farmer_text: {
                        type: "STRING",
                        description: "نص الفلاح الخام كاملاً كما هو، دون أي قص أو تلخيص."
                    }
                },
                required: ["raw_farmer_text"]
            }
        },
        {
            name: "profile_memory_subagent",
            description: "استدعِ هذا المتخصص عندما تحتوي الرسالة على معلومة ثابتة عن المزرعة أو حقيقة سلوكية عن الفلاح تستحق التسجيل في الخلفية.",
            parameters: {
                type: "OBJECT",
                properties: {
                    raw_farmer_text: {
                        type: "STRING",
                        description: "نص الفلاح الخام كاملاً."
                    }
                },
                required: ["raw_farmer_text"]
            }
        },
        {
            name: "web_search",
            description: "استدعِ هذه الأداة للبحث في الإنترنت واستخراج معلومات حية ومحدثة (مثل: أسعار المحاصيل والمستلزمات في السوق اليوم، نشرة الجو، أخبار زراعية حية).",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description: "نص استعلام البحث باللغة العربية الموجه للبحث عبر الإنترنت."
                    }
                },
                required: ["query"]
            }
        }
    ]
};

// ── Activity Sub-Agent Tool Declarations ───────────────────────────────────────
const activitySubagentToolDeclaration = {
    functionDeclarations: [
        {
            name: "manage_farmer_field",
            description: "أداة إدارة وتسجيل أراضي الفلاح. استخدمها في 4 سيناريوهات: register_field (تسجيل أرض جديدة مكتملة الأربع معلومات بعد تأكيد الفلاح)، change_crop (تغيير محصول أرض مسجلة بعد تأكيدين)، update_field (تعديل اسم أو مساحة أرض مسجلة بعد تأكيد)، disambiguate (تمييز أرض مكررة بصفة).",
            parameters: {
                type: "OBJECT",
                properties: {
                    action: {
                        type: "STRING",
                        enum: ["register_field", "change_crop", "update_field", "disambiguate"],
                        description: "إجراء إدارة الأرض."
                    },
                    field_id: { type: "STRING", description: "معرف الحقل (uuid) في حال التعديل أو تغيير المحصول." },
                    field_name: { type: "STRING", description: "اسم الأرض أو الحقل (مثال: 'أرض الجمعية' أو 'حقل التسعة')." },
                    crop_type: { type: "STRING", description: "نوع المحصول المرزوع (مثال: 'طماطم'، 'قمح'، 'بطاطس')." },
                    planting_date: { type: "STRING", description: "تاريخ الزراعة بصيغة YYYY-MM-DD كما صرّح به الفلاح." },
                    area_value: { type: "NUMBER", description: "رقم المساحة كما ذكره الفلاح (مثال: 5 أو 12)." },
                    area_unit: { type: "STRING", enum: ["فدان", "قيراط", "متر مربع"], description: "وحدة المساحة التي ذكرها الفلاح." },
                    soil_type: { type: "STRING", enum: ["طينية", "رملية", "صفراء"], description: "نوع التربة إن ذكره الفلاح." },
                    irrigation_type: { type: "STRING", enum: ["غمر", "تنقيط", "رش"], description: "طريقة الري إن ذكرها الفلاح." },
                    disambiguating_attribute: { type: "STRING", description: "صفة تمييزية (مثل 'القبلية' أو 'البحرية') للتمييز عند التكرار." }
                },
                required: ["action"]
            }
        },
        {
            name: "log_field_activity",
            description: "سجّل نشاطاً جديداً في أرض الفلاح فور ذكره (رش/تسميد، ري، حصاد، عمالة). الصف يُنشأ بكل ما هو متاح — لا تنتظر اكتمال البيانات.",
            parameters: {
                type: "OBJECT",
                properties: {
                    field_id: { type: "STRING", description: "معرف الأرض (uuid) — مطلوب" },
                    activity_type: {
                        type: "STRING",
                        enum: ["treatment", "irrigation", "harvest", "labor"],
                        description: "نوع النشاط"
                    },
                    activity_date: { type: "STRING", description: "تاريخ النشاط YYYY-MM-DD إن ذُكر" },
                    notes: { type: "STRING", description: "ملاحظات إضافية" },
                    unit_price: { type: "NUMBER", description: "تكلفة أو أجر الفرد في العمالة أو سعر الوحدة في الحصاد والمعاملات" },
                    category: { type: "STRING", enum: ["مبيد", "سماد"], description: "نوع المعاملة" },
                    product_id: { type: "STRING", description: "معرف المنتج من قائمة المنتجات" },
                    product_name_text: { type: "STRING", description: "اسم المنتج لو مش في القائمة" },
                    dosage: { type: "NUMBER", description: "الجرعة" },
                    dosage_unit: { type: "STRING", description: "وحدة الجرعة (كود معياري بالإنجليزية: liter, ml, gram, kilogram, ton, cap, spoon, bottle, can, sachet, bag, sack, ampoule, jerrycan, barrel, tank, carton، أو النص العربي الأصلي)." },
                    sprayer_count: { type: "INTEGER", description: "عدد الرشاشات المستخدمة بالجرعة المذكورة" },
                    spray_time_of_day: { type: "STRING", description: "وقت الرش في اليوم: الصبح بكير / منتصف النهار / بعد العصر / المغرب" },
                    pest_disease_id: { type: "STRING", description: "معرف الآفة أو المرض" },
                    symptom_description: { type: "STRING", description: "وصف الأعراض" },
                    photo_url: { type: "STRING", description: "رابط الصورة" },
                    description: { type: "STRING", description: "وصف عملية الري أو الحصاد" },
                    quantity: { type: "NUMBER", description: "الكمية المحصودة" },
                    quantity_unit: { type: "STRING", description: "وحدة الكمية المحصودة (كيلو، طن، قفص...)" },
                    worker_count: { type: "INTEGER", description: "عدد العمال" },
                    contractor_name: { type: "STRING", description: "اسم المقاول أو المسؤول" },
                },
                required: ["field_id", "activity_type"]
            }
        },
        {
            name: "update_field_activity",
            description: "حدّث بيانات نشاط موجود مسبقاً (pending). استخدمها لو الفلاح ذكر تفاصيل مكملة لنشاط في قائمة الأنشطة المعلقة.",
            parameters: {
                type: "OBJECT",
                properties: {
                    activity_id: { type: "STRING", description: "معرف الصف (uuid) — مطلوب" },
                    activity_type: { type: "STRING", enum: ["treatment", "irrigation", "harvest", "labor"] },
                    activity_date: { type: "STRING", description: "التاريخ لو تم توضيحه YYYY-MM-DD" },
                    notes: { type: "STRING" },
                    unit_price: { type: "NUMBER", description: "تكلفة أو أجر الفرد أو سعر الوحدة" },
                    mark_completed: { type: "BOOLEAN", description: "حوّل status إلى completed لو اكتملت البيانات الأساسية" },
                    category: { type: "STRING", enum: ["مبيد", "سماد"] },
                    product_id: { type: "STRING" },
                    product_name_text: { type: "STRING" },
                    dosage: { type: "NUMBER" },
                    dosage_unit: { type: "STRING", description: "وحدة الجرعة" },
                    sprayer_count: { type: "INTEGER" },
                    spray_time_of_day: { type: "STRING", description: "وقت الرش في اليوم" },
                    pest_disease_id: { type: "STRING" },
                    symptom_description: { type: "STRING" },
                    photo_url: { type: "STRING" },
                    outcome_rating: { type: "STRING", enum: ["ممتاز", "متوسط", "فاشل"], description: "نتيجة الرشة أو النشاط" },
                    description: { type: "STRING" },
                    quantity: { type: "NUMBER" },
                    quantity_unit: { type: "STRING" },
                    worker_count: { type: "INTEGER" },
                    contractor_name: { type: "STRING" },
                },
                required: ["activity_id", "activity_type"]
            }
        }
    ]
};

// ── Profile & Memory Sub-Agent Tool Declarations ───────────────────────────────
const profileMemoryToolDeclaration = {
    functionDeclarations: [
        {
            name: "update_farm_profile",
            description: "استخدم هذه الأداة فوراً عندما يذكر المزارع معلومة دائمة عن أرضه أو معداته أو ريه أو محصوله.",
            parameters: {
                type: "OBJECT",
                properties: {
                    target_scope: {
                        type: "STRING",
                        enum: [...EGYPTIAN_CROP_ENUM],
                        description: "حدد نطاق المعلومة: اختر 'general' للمعدات أو البيانات العامة، أو اختر اسم المحصول."
                    },
                    properties_to_update: {
                        type: "OBJECT",
                        properties: {
                            sprayer_capacity: { type: "STRING", description: "سعة الرشاشة أو الموتور" },
                            land_area: { type: "STRING", description: "مساحة الأرض" },
                            irrigation_type: { type: "STRING", enum: ["تنقيط", "غمر", "رش", "أخرى"], description: "طريقة الري" },
                            seed_variety: { type: "STRING", description: "نوع الصنف أو التقاوي" },
                            soil_type: { type: "STRING", enum: ["طينية", "رملية", "صفراء", "أخرى"], description: "نوع التربة" },
                            custom_notes: { type: "STRING", description: "أي معلومة إضافية هامة" }
                        },
                        description: "قم بملء الحقول التي ذكرها المزارع فقط."
                    }
                },
                required: ["target_scope", "properties_to_update"]
            }
        },
        {
            name: "log_farmer_memory",
            description: "استخدم هذه الأداة لتسجيل حقيقة أو ملحوظة سلوكية عن الفلاح (تفضيلاته، قدرته المالية، أسلوب تواصله).",
            parameters: {
                type: "OBJECT",
                properties: {
                    category: {
                        type: "STRING",
                        enum: ["budget_level", "risk_tolerance", "communication_style", "crop_preference", "trusted_source"],
                        description: "تصنيف الحقيقة السلوكية"
                    },
                    fact: { type: "STRING", description: "الحقيقة أو الملحوظة بصيغة نصية قصيرة وواضحة" },
                    confidence: { type: "STRING", enum: ["low", "medium", "high"], description: "درجة الثقة في هذه المعلومة" }
                },
                required: ["category", "fact"]
            }
        }
    ]
};

// ── Pending Activities Helpers ────────────────────────────────────────────────
const FIELD_PRIORITY: Record<string, string[]> = {
    treatment: ["activity_date", "product", "dosage", "dosage_unit", "sprayer_count", "spray_time_of_day", "outcome_rating"],
    irrigation: ["activity_date", "description"],
    harvest: ["activity_date", "description"],
    labor: ["activity_date", "worker_count", "contractor_name"],
};

function isOlderThanDays(days: number, dateStr?: string | null, createdAtStr?: string | null): boolean {
    const refStr = dateStr || createdAtStr;
    if (!refStr) return false;
    const refDate = new Date(refStr).getTime();
    if (isNaN(refDate)) return false;
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    return (now - refDate) >= (days * MS_PER_DAY);
}

function isOlderThan5Days(dateStr?: string | null, createdAtStr?: string | null): boolean {
    return isOlderThanDays(5, dateStr, createdAtStr);
}

function getTopMissingFields(row: any, activityType: string): string[] {
    const priorityList = FIELD_PRIORITY[activityType] ?? [];
    const missing: string[] = [];
    for (const field of priorityList) {
        if (field === "product") {
            if (!row.product_id && !row.product_name_text) missing.push("اسم المنتج");
        } else if (field === "outcome_rating") {
            if ((row.outcome_rating === null || row.outcome_rating === undefined) && isOlderThanDays(2, row.activity_date, row.created_at)) {
                missing.push(field);
            }
        } else if (row[field] === null || row[field] === undefined) {
            missing.push(field);
        }
    }
    return missing;
}

function isActivityFullyCompleted(row: any, activityType: string): boolean {
    const priorityList = FIELD_PRIORITY[activityType] ?? [];
    for (const field of priorityList) {
        if (field === "product") {
            if (!row.product_id && !row.product_name_text) return false;
        } else if (row[field] === null || row[field] === undefined) {
            return false;
        }
    }
    return true;
}

async function fetchPendingActivities(
    supabaseAdmin: any,
    farmerId: string
): Promise<string> {
    try {
        console.log(`[crop-chat] 🔍 [fetchPendingActivities] Fetching pending activity logs for farmer ${farmerId}...`);
        const { data: fields } = await supabaseAdmin
            .from("farmer_fields")
            .select("id, field_name")
            .eq("farmer_id", farmerId)
            .eq("is_active", true);

        if (!fields || fields.length === 0) {
            return "";
        }

        const fieldIds = (fields as any[]).map((f) => f.id);
        const fieldNameMap: Record<string, string> = Object.fromEntries(
            (fields as any[]).map((f) => [f.id, f.field_name || "بدون اسم"])
        );

        const [treatments, irrigations, harvests, labors] = await Promise.all([
            supabaseAdmin
                .from("field_treatments")
                .select("*")
                .in("field_id", fieldIds)
                .eq("status", "pending_outcome"),
            supabaseAdmin
                .from("field_irrigation_logs")
                .select("*")
                .in("field_id", fieldIds)
                .eq("status", "pending_outcome"),
            supabaseAdmin
                .from("field_harvest_records")
                .select("*")
                .in("field_id", fieldIds)
                .eq("status", "pending_outcome"),
            supabaseAdmin
                .from("field_labor_logs")
                .select("*")
                .in("field_id", fieldIds)
                .eq("status", "pending_outcome"),
        ]);

        const lines: string[] = [];

        const processPendingGroup = (rows: any[], activityType: string, tableName: string) => {
            for (const row of rows || []) {
                const fname = fieldNameMap[row.field_id] || row.field_id;
                const expired = isOlderThan5Days(row.activity_date, row.created_at);
                const complete = isActivityFullyCompleted(row, activityType);

                if (expired || complete) {
                    supabaseAdmin
                        .from(tableName)
                        .update({ status: "completed" })
                        .eq("id", row.id)
                        .then(({ error }: any) => {
                            if (error) console.error(`[crop-chat] Failed to auto-complete ${tableName} ${row.id}:`, error);
                        });
                    continue;
                }

                const openFields = getTopMissingFields(row, activityType);
                if (openFields.length === 0) continue;

                if (activityType === "treatment") {
                    const productLabel = row.product_name_text || row.product_id || "غير محدد";
                    lines.push(
                        `- [رش/تسميد] activity_id:${row.id} | أرض: ${fname} | المنتج: ${productLabel}` +
                        ` | مسجل في: ${row.created_at}` +
                        ` | الحقول الناقصة: ${openFields.join("، ")}`
                    );
                } else if (activityType === "irrigation") {
                    lines.push(
                        `- [ري] activity_id:${row.id} | أرض: ${fname} | وصف: ${row.description || "غير محدد"}` +
                        ` | مسجل في: ${row.created_at}` +
                        ` | الحقول الناقصة: ${openFields.join("، ")}`
                    );
                } else if (activityType === "harvest") {
                    lines.push(
                        `- [حصاد] activity_id:${row.id} | أرض: ${fname} | وصف: ${row.description || "غير محدد"}` +
                        ` | مسجل في: ${row.created_at}` +
                        ` | الحقول الناقصة: ${openFields.join("، ")}`
                    );
                } else if (activityType === "labor") {
                    lines.push(
                        `- [عمالة] activity_id:${row.id} | أرض: ${fname}` +
                        ` | العمال: ${row.worker_count ?? "غير محدد"} | المقاول: ${row.contractor_name || "غير محدد"}` +
                        ` | مسجل في: ${row.created_at}` +
                        ` | الحقول الناقصة: ${openFields.join("، ")}`
                    );
                }
            }
        };

        processPendingGroup((treatments.data as any[]) || [], "treatment", "field_treatments");
        processPendingGroup((irrigations.data as any[]) || [], "irrigation", "field_irrigation_logs");
        processPendingGroup((harvests.data as any[]) || [], "harvest", "field_harvest_records");
        processPendingGroup((labors.data as any[]) || [], "labor", "field_labor_logs");

        if (lines.length === 0) return "";

        return [
            "\n\n<pending_activities>",
            "فيه أنشطة مسجلة لسه معلقة وناقصة بيانات أو نتيجة متابعة:",
            ...lines,
            "إذا ذكر الفلاح أي معلومة مكملة، استخدم أداة update_field_activity لتحديث الصف بالـ id المذكور.",
            "</pending_activities>",
        ].join("\n");
    } catch (err) {
        console.error("[crop-chat] ❌ Error in fetchPendingActivities:", err);
        return "";
    }
}

// ── Activity Sub-Agent DB Execution Helpers ────────────────────────────────────
async function executeActivitySubagentTool(
    toolName: string,
    args: Record<string, any>,
    userId: string,
    supabaseAdmin: any
): Promise<{ type: string; tool_result: Record<string, any> }> {
    console.log(`[crop-chat] ⚙️ [Activity Sub-Agent Execution] Tool: ${toolName}, Args:`, args);

    if (toolName === "manage_farmer_field") {
        const {
            action,
            field_id,
            field_name,
            crop_type,
            planting_date,
            area_value,
            area_unit,
            soil_type,
            irrigation_type,
            disambiguating_attribute
        } = args;

        if (action === "register_field") {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const area_feddan_val = area_value ? toFeddan(Number(area_value), area_unit || "فدان") : null;

            if (planting_date && new Date(planting_date) > today) {
                return { type: "register_field", tool_result: { status: "error", message: "planting_date in future" } };
            }
            if (area_feddan_val != null && area_feddan_val <= 0) {
                return { type: "register_field", tool_result: { status: "error", message: "area <= 0" } };
            }
            if (field_name && crop_type && planting_date && area_feddan_val != null) {
                const { data: insertedField, error: insertErr } = await (supabaseAdmin as any).from("farmer_fields").insert({
                    farmer_id: userId,
                    field_name,
                    crop_type,
                    planting_date,
                    area_feddan: area_feddan_val,
                    area_unit: area_unit || "فدان",
                    soil_type: soil_type || null,
                    irrigation_type: irrigation_type || null,
                    is_active: true,
                }).select("id").single();

                if (insertErr) {
                    console.error("[crop-chat] register_field insert error:", insertErr);
                    return { type: "register_field", tool_result: { status: "error", message: insertErr.message } };
                }

                console.log(`[crop-chat] ✅ Registered new field '${field_name}' ID: ${insertedField?.id}`);
                return {
                    type: "register_field",
                    tool_result: { status: "success", field_id: insertedField?.id, field_name, crop_type, planting_date, area_feddan: area_feddan_val }
                };
            }
            return { type: "register_field", tool_result: { status: "error", message: "Incomplete required fields for register_field" } };
        }

        if (action === "change_crop") {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            if (planting_date && new Date(planting_date) > today) {
                return { type: "change_crop", tool_result: { status: "error", message: "planting_date in future" } };
            }
            if (field_id && crop_type && planting_date) {
                const { data: fieldOwner } = await (supabaseAdmin as any)
                    .from("farmer_fields")
                    .select("id")
                    .eq("id", field_id)
                    .eq("farmer_id", userId)
                    .maybeSingle();

                if (fieldOwner) {
                    const { error: rpcErr } = await (supabaseAdmin as any).rpc("archive_and_change_crop", {
                        p_field_id: field_id,
                        p_farmer_id: userId,
                        p_new_crop: crop_type,
                        p_new_planting: planting_date,
                    });
                    if (rpcErr) {
                        console.error("[crop-chat] archive_and_change_crop RPC failed:", rpcErr);
                        return { type: "change_crop", tool_result: { status: "error", message: rpcErr.message } };
                    }
                    console.log(`[crop-chat] ✅ Archived and changed crop for field ${field_id} to ${crop_type}`);
                    return { type: "change_crop", tool_result: { status: "success", field_id, crop_type, planting_date } };
                }
                return { type: "change_crop", tool_result: { status: "error", message: "Field not found or unowned" } };
            }
            return { type: "change_crop", tool_result: { status: "error", message: "Missing field_id, crop_type, or planting_date" } };
        }

        if (action === "update_field") {
            if (field_id) {
                const updates: Record<string, any> = { updated_at: new Date().toISOString() };
                if (field_name) updates.field_name = field_name;
                if (area_value != null && Number(area_value) > 0) {
                    updates.area_feddan = toFeddan(Number(area_value), area_unit || "فدان");
                    updates.area_unit = area_unit || "فدان";
                }
                const { error: updErr } = await (supabaseAdmin as any).from("farmer_fields").update(updates).eq("id", field_id).eq("farmer_id", userId);
                if (updErr) {
                    return { type: "update_field", tool_result: { status: "error", message: updErr.message } };
                }
                return { type: "update_field", tool_result: { status: "success", field_id, ...updates } };
            }
            return { type: "update_field", tool_result: { status: "error", message: "Missing field_id" } };
        }

        if (action === "disambiguate") {
            const fullName = `${field_name || ''} ${disambiguating_attribute || ''}`.trim();
            if (fullName && crop_type && planting_date) {
                const { data: inserted, error: disErr } = await (supabaseAdmin as any).from("farmer_fields").insert({
                    farmer_id: userId,
                    field_name: fullName,
                    crop_type,
                    planting_date,
                    area_feddan: area_value ? toFeddan(Number(area_value), area_unit || "فدان") : 1,
                    area_unit: area_unit || "فدان",
                    soil_type: soil_type || null,
                    irrigation_type: irrigation_type || null,
                    is_active: true,
                }).select("id").single();

                if (disErr) {
                    return { type: "disambiguate", tool_result: { status: "error", message: disErr.message } };
                }
                return { type: "disambiguate", tool_result: { status: "success", field_id: inserted?.id, field_name: fullName } };
            }
            return { type: "disambiguate", tool_result: { status: "error", message: "Missing data for disambiguation" } };
        }
    }

    if (toolName === "log_field_activity") {
        const {
            field_id,
            activity_type,
            activity_date,
            notes,
            unit_price,
            category,
            product_id,
            product_name_text,
            dosage,
            dosage_unit,
            sprayer_count,
            spray_time_of_day,
            pest_disease_id,
            symptom_description,
            photo_url,
            description,
            quantity,
            quantity_unit,
            worker_count,
            contractor_name,
        } = args;

        if (!field_id || !activity_type) {
            return { type: `log_${activity_type || "activity"}`, tool_result: { status: "error", message: "Missing field_id or activity_type" } };
        }

        const targetTable =
            activity_type === "treatment" ? "field_treatments" :
                activity_type === "irrigation" ? "field_irrigation_logs" :
                    activity_type === "harvest" ? "field_harvest_records" : "field_labor_logs";

        const payload: Record<string, any> = {
            field_id,
            status: "pending_outcome",
        };

        if (activity_date) {
            const iso = safeIsoDate(activity_date);
            if (iso) payload.activity_date = iso;
        }
        if (notes) payload.notes = notes;
        if (unit_price != null && !isNaN(Number(unit_price))) payload.unit_price = Number(unit_price);

        if (activity_type === "treatment") {
            payload.category = category || "مبيد";
            if (product_id) payload.product_id = product_id;
            if (product_name_text) payload.product_name_text = product_name_text;
            if (dosage != null) payload.dosage = Number(dosage);
            if (dosage_unit) payload.dosage_unit = dosage_unit;
            if (sprayer_count != null) payload.sprayer_count = Number(sprayer_count);
            if (spray_time_of_day) payload.spray_time_of_day = spray_time_of_day;
            if (pest_disease_id) payload.pest_disease_id = pest_disease_id;
            if (symptom_description) payload.symptom_description = symptom_description;
            if (photo_url) payload.photo_url = photo_url;
        } else if (activity_type === "irrigation") {
            if (description) payload.description = description;
        } else if (activity_type === "harvest") {
            if (quantity != null) payload.quantity = Number(quantity);
            if (quantity_unit) payload.quantity_unit = quantity_unit;
            if (description) payload.description = description;
        } else if (activity_type === "labor") {
            if (worker_count != null) payload.worker_count = Number(worker_count);
            if (contractor_name) payload.contractor_name = contractor_name;
        }

        if (isActivityFullyCompleted(payload, activity_type)) {
            payload.status = "completed";
        } else {
            payload.status = "pending_outcome";
        }

        const { data: inserted, error: insertErr } = await (supabaseAdmin as any)
            .from(targetTable)
            .insert(payload)
            .select("id")
            .single();

        if (insertErr) {
            console.error(`[crop-chat] ❌ FAILED to insert into ${targetTable}:`, insertErr);
            return { type: `log_${activity_type}`, tool_result: { status: "error", message: insertErr.message } };
        }

        console.log(`[crop-chat] ✅ Inserted row ID ${inserted?.id} into ${targetTable} (status: ${payload.status})`);
        return {
            type: `log_${activity_type}`,
            tool_result: { status: "success", activity_id: inserted?.id, activity_type, target_table: targetTable, ...payload }
        };
    }

    if (toolName === "update_field_activity") {
        const {
            activity_id,
            activity_type,
            activity_date,
            notes,
            unit_price,
            outcome_rating,
            mark_completed,
            category,
            product_id,
            product_name_text,
            dosage,
            dosage_unit,
            sprayer_count,
            spray_time_of_day,
            pest_disease_id,
            symptom_description,
            photo_url,
            description,
            quantity,
            quantity_unit,
            worker_count,
            contractor_name,
        } = args;

        if (!activity_id || !activity_type) {
            return { type: "update_activity", tool_result: { status: "error", message: "Missing activity_id or activity_type" } };
        }

        const targetTable =
            activity_type === "treatment" ? "field_treatments" :
                activity_type === "irrigation" ? "field_irrigation_logs" :
                    activity_type === "harvest" ? "field_harvest_records" : "field_labor_logs";

        const updates: Record<string, any> = {};

        if (activity_date) {
            const iso = safeIsoDate(activity_date);
            if (iso) updates.activity_date = iso;
        }
        if (notes) updates.notes = notes;
        if (unit_price != null && !isNaN(Number(unit_price))) updates.unit_price = Number(unit_price);
        if (outcome_rating) updates.outcome_rating = outcome_rating;

        if (activity_type === "treatment") {
            if (category) updates.category = category;
            if (product_id) updates.product_id = product_id;
            if (product_name_text) updates.product_name_text = product_name_text;
            if (dosage != null) updates.dosage = Number(dosage);
            if (dosage_unit) updates.dosage_unit = dosage_unit;
            if (sprayer_count != null) updates.sprayer_count = Number(sprayer_count);
            if (spray_time_of_day) updates.spray_time_of_day = spray_time_of_day;
            if (pest_disease_id) updates.pest_disease_id = pest_disease_id;
            if (symptom_description) updates.symptom_description = symptom_description;
            if (photo_url) updates.photo_url = photo_url;
        } else if (activity_type === "irrigation") {
            if (description) updates.description = description;
        } else if (activity_type === "harvest") {
            if (quantity != null) updates.quantity = Number(quantity);
            if (quantity_unit) updates.quantity_unit = quantity_unit;
            if (description) updates.description = description;
        } else if (activity_type === "labor") {
            if (worker_count != null) updates.worker_count = Number(worker_count);
            if (contractor_name) updates.contractor_name = contractor_name;
        }

        const { data: existingRow } = await (supabaseAdmin as any)
            .from(targetTable)
            .select("*")
            .eq("id", activity_id)
            .maybeSingle();

        const mergedRow = { ...(existingRow || {}), ...updates };
        const missingFields = getTopMissingFields(mergedRow, activity_type);
        const isComplete = missingFields.length === 0;
        const isExpired = isOlderThan5Days(mergedRow.activity_date, mergedRow.created_at);

        if (mark_completed === true && !isComplete && !isExpired) {
            return {
                type: "update_activity",
                tool_result: {
                    status: "error",
                    message: `الأعمدة التالية ما زالت مفقودة: ${missingFields.join("، ")}`
                }
            };
        }

        if (isComplete || isExpired || mark_completed === true) {
            updates.status = "completed";
        }

        if (Object.keys(updates).length > 0) {
            const { error: updateErr } = await (supabaseAdmin as any)
                .from(targetTable)
                .update(updates)
                .eq("id", activity_id);

            if (updateErr) {
                return { type: "update_activity", tool_result: { status: "error", message: updateErr.message } };
            }
            return { type: "update_activity", tool_result: { status: "success", activity_id, updates } };
        }

        return { type: "update_activity", tool_result: { status: "success", activity_id, message: "No updates needed" } };
    }

    return { type: toolName, tool_result: { status: "error", message: `Unknown tool ${toolName}` } };
}

// ── Activity Sub-Agent Programmatic Guards ────────────────────────────────────

interface FieldRecord {
    id: string;
    field_name?: string | null;
    crop_type?: string | null;
    crop?: string | null;
    [key: string]: any;
}

// Guard 1 — Validate field_id format and presence in farmer's active fields
function validateFieldId(fieldIdRaw: any, activeFields: FieldRecord[]): { valid: boolean; reason?: string; field?: FieldRecord } {
    if (!fieldIdRaw || typeof fieldIdRaw !== "string") {
        return { valid: false, reason: "missing_or_non_string_field_id" };
    }
    const cleanId = fieldIdRaw.trim();
    // 1. Must be exactly one valid UUID (prevents concatenation of multiple UUIDs)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
        return { valid: false, reason: "malformed_field_id" };
    }
    // 2. Must exist in farmer's active fields
    const matchingField = activeFields.find(f => f.id.toLowerCase() === cleanId.toLowerCase());
    if (!matchingField) {
        return { valid: false, reason: "field_id_not_found" };
    }
    return { valid: true, field: matchingField };
}

// Guard 1b — Validate activity_id format for update_field_activity
function validateActivityId(activityIdRaw: any): { valid: boolean; reason?: string } {
    if (!activityIdRaw || typeof activityIdRaw !== "string") {
        return { valid: false, reason: "missing_or_non_string_activity_id" };
    }
    const cleanId = activityIdRaw.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cleanId)) {
        return { valid: false, reason: "malformed_activity_id" };
    }
    return { valid: true };
}

function safeIsoDate(dateStr?: string | null): string | null {
    if (!dateStr || typeof dateStr !== "string") return null;
    const trimmed = dateStr.trim();
    if (INVALID_VALUE_TOKENS.includes(trimmed.toLowerCase())) return null;
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function normalizeArabicText(text?: string | null): string {
    if (!text || typeof text !== "string") return "";
    return text
        .trim()
        .toLowerCase()
        // Remove Arabic diacritics / tashkeel
        .replace(/[\u064B-\u0652\u0670]/g, "")
        // Unify all forms of Alif (أ, إ, آ, ٱ -> ا)
        .replace(/[أإآٱ]/g, "ا")
        // Unify Ta Marbouta with Ha (ة -> ه)
        .replace(/ة/g, "ه")
        // Unify Ya / Alif Maqsura (ى -> ي)
        .replace(/ى/g, "ي")
        // Normalize whitespace
        .replace(/\s+/g, " ");
}

// Guard 2 — Ambiguity Check (Multiple fields with same crop type)
function validateNotAmbiguous(
    chosenFieldId: string,
    farmerRawText: string,
    activeFields: FieldRecord[]
): { valid: boolean; forced_status?: "ambiguous"; ambiguous_matches?: string[] } {
    const chosenField = activeFields.find(f => f.id.toLowerCase() === chosenFieldId.trim().toLowerCase());
    if (!chosenField) return { valid: true }; // Handled by Guard 1

    const chosenCrop = normalizeArabicText(chosenField.crop_type || chosenField.crop || "");
    if (!chosenCrop) return { valid: true };

    const cropMatches = activeFields.filter(f => {
        const fCrop = normalizeArabicText(f.crop_type || f.crop || "");
        return fCrop.length > 0 && (fCrop === chosenCrop || fCrop.includes(chosenCrop) || chosenCrop.includes(fCrop));
    });

    if (cropMatches.length <= 1) return { valid: true }; // No other field with same crop

    // Multiple fields with same crop: farmer must explicitly mention the chosen field's name (normalized)
    const normChosenName = normalizeArabicText(chosenField.field_name || "");
    const normRawText = normalizeArabicText(farmerRawText || "");
    
    // Check full name or significant keyword if name has "ارض ..." (e.g. "خضر" from "ارض خضر")
    let nameMentioned = normChosenName.length > 0 && normRawText.includes(normChosenName);
    if (!nameMentioned && normChosenName.startsWith("ارض ")) {
        const subName = normChosenName.replace(/^ارض\s+/, "").trim();
        if (subName.length >= 3 && normRawText.includes(subName)) {
            nameMentioned = true;
        }
    }

    if (!nameMentioned) {
        return {
            valid: false,
            forced_status: "ambiguous",
            ambiguous_matches: cropMatches.map(f => f.field_name || "بدون اسم")
        };
    }
    return { valid: true };
}

// Guard 3 — Reject / Clean fake string values (e.g. "null", "undefined", "غير محدد")
const INVALID_VALUE_TOKENS = ["null", "undefined", "غير محدد", "n/a", "-", ""];

function validateAndCleanFakeValues(toolArgs: Record<string, any>): { cleanedArgs: Record<string, any>; fakeFields: string[] } {
    const cleanedArgs: Record<string, any> = { ...toolArgs };
    const fakeFields: string[] = [];

    for (const [key, value] of Object.entries(cleanedArgs)) {
        if (value === null || value === undefined) continue;
        if (typeof value === "string") {
            const trimmed = value.trim().toLowerCase();
            if (INVALID_VALUE_TOKENS.includes(trimmed)) {
                delete cleanedArgs[key];
                fakeFields.push(key);
            }
        }
    }

    return { cleanedArgs, fakeFields };
}

// ── Activity Sub-Agent Execution Function (Gemma) ─────────────────────────────
interface ActivitySubagentResponse {
    status: "complete" | "incomplete" | "ambiguous" | "awaiting_confirmation";
    operations: Array<{ type: string; tool_result: Record<string, any> | null }>;
    missing_fields?: string[];
    ambiguous_matches?: string[];
    confirmation_summary?: {
        action: string;
        fields: Record<string, any>;
    };
    agent_note?: string;
}

async function executeActivitySubagent(
    rawFarmerText: string,
    domainContext: {
        activeFieldsContext: string;
        pendingActivitiesContext: string;
        productsContext: string;
        activeFields?: FieldRecord[];
    },
    pendingOperationFromSession: any,
    lastTurn: { farmer_message: string | null; assistant_response: string | null } | null,
    userId: string,
    supabaseAdmin: any,
    primaryApiKey: string,
    keyModels?: any[],
    nowCairo?: string
): Promise<ActivitySubagentResponse> {
    console.log(`[crop-chat] 🚜 [Activity Sub-Agent] Processing message: "${rawFarmerText}"`);

    const activitySubagentPrompt = `<context>
التاريخ والوقت الحالي في مصر: ${nowCairo || "الآن"}
</context>

<role>
أنت مستخرج ومنفّذ بيانات صارم ومتخصص، لست محادثاً. مهمتك الوحيدة: تحليل نص الفلاح الخام المرسل إليك، واستخراج بيانات الأراضي والأنشطة الزراعية منه بدقة كاملة، واستدعاء الأداة الصحيحة لتنفيذها فعلياً عند اكتمال الشروط. لا تكتب أي نص محادثة أو رد للفلاح؛ ناتجك دائماً وفق <output_contract> فقط.
</role>

<output_contract>
أرجع دائماً بهذا الشكل بالضبط، JSON فقط بلا أي نص إضافي قبله أو بعده:
{
  "status": "complete | incomplete | ambiguous | awaiting_confirmation",
  "operations": [ { "type": "...", "tool_result": {...} | null } ],
  "missing_fields": [...],
  "ambiguous_matches": [...],
  "confirmation_summary": { "action": "...", "fields": {...} },
  "agent_note": "ملاحظة أو استفسار أو توضيح مفتوح للأوركستريتور (اختياري)"
}
- استخدم فقط الحقل (missing_fields / ambiguous_matches / confirmation_summary) المناسب لحالة status، واحذف الباقي أو اتركها فارغة.
- حقل \`agent_note\`: قناة تواصل مباشرة ومفتوحة مع الأوركستريتور. يمكنك كتابة أي ملاحظة داخلية، استفسار، مشكلة واجهتها في استخراج البيانات، تناقض لاحظته في كلام الفلاح، أو معلومة إضافية تراها مهمة لمساعدة الأوركستريتور في توجيه الحوار. هذا الحقل داخلي بينك وبين الأوركستريتور ولا يصل للفلاح مباشرة.
- لو النص يحتوي أكثر من عملية منفصلة (حتى لو أنواعها مختلفة، زي رشة وعمالة سوا)، أرجعهم كلهم كعناصر منفصلة في operations، وكل عنصر بحالته الخاصة إن اختلفت.
- ممنوع منعاً باتاً كتابة أي جملة عامية أو موجهة للفلاح في أي حقل من حقول الناتج؛ كل الحقول بيانات هيكلية بحتة.
</output_contract>

<domain_context>
بيانات الأراضي المسجلة حالياً للفلاح: ${domainContext.activeFieldsContext}
الأنشطة المعلقة: ${domainContext.pendingActivitiesContext || "لا توجد أنشطة معلقة"}
قاعدة المنتجات (للمطابقة): ${domainContext.productsContext}
العملية المعلقة من رسالة سابقة لم تكتمل بعد (إن وجدت): ${pendingOperationFromSession ? JSON.stringify(pendingOperationFromSession) : "null"}
آخر جولة من المحادثة (للسياق فقط): ${lastTurn ? JSON.stringify(lastTurn) : "null"}
</domain_context>

<golden_rule_no_invention>
استخرج فقط ما هو مذكور صراحة أو مستنتج بثقة عالية من سياق واضح. ممنوع منعاً باتاً اختلاق أو افتراض أي قيمة حقل (خصوصاً اسم الأرض) من قيمة حقل آخر (خصوصاً اسم المحصول). لو حقل إلزامي غير مذكور، ضعه في missing_fields بقيمة null في operations، ولا تحاول تخمينه.
</golden_rule_no_invention>

<field_registration_rules>
1. سجّل أرض فقط عند توفر المعلومات الأربعة معاً: اسم الأرض، نوع المحصول، تاريخ الزراعة، المساحة. لا يوجد تسجيل جزئي.

2. إذا كان اسم الأرض المذكور مطابقاً مباشرة لاسم المحصول الحالي (وليس اسماً تقليدياً عاماً مثل "أرض الغلة" أو "أرض النبع")، ضع status="incomplete" مع missing_fields=["field_name_confirmation"] لتوليد سؤال تمييزي حول كون هذا الاسم حقيقياً أم وصفاً مؤقتاً للموسم. اقبل الأسماء التقليدية العامة دون أي سؤال حتى لو اختلف المحصول عن معنى الاسم.

   مثال (يستوجب التوقف):
   الفلاح: "عندي أرض اسمها أرض الرز، وزرعتها رز من شهرين، ومساحتها فدان"
   → status="incomplete", missing_fields=["field_name_confirmation"]

   مثال (يُقبل مباشرة):
   الفلاح: "عندي أرض اسمها أرض الغلة، زرعتها بطاطس من شهر، مساحتها فدانين"
   → البيانات الأربعة مكتملة ولا يوجد تعارض اسم/محصول → تابع للخطوة 3.

3. عند اكتمال المعلومات الأربعة فعلياً وعدم وجود تعارض اسم/محصول يستوجب سؤالاً، ولم يسبق أن أكّد الفلاح على نفس هذه البيانات بالضبط في pending_operation الممرر إليك: أرجع status="awaiting_confirmation" مع confirmation_summary يحتوي كل الحقول الأربعة. لا تستدعِ الأداة بعد.

4. عندما يصل إليك تأكيد صريح من الفلاح على pending_operation ممرر إليك (مثل "آه صح، سجلها")، استدعِ manage_farmer_field بـ action="register_field" فعلياً، وأرجع status="complete" مع tool_result الفعلي.

5. إذا كان لدى الفلاح أرض مسجلة بنفس الاسم والمحصول، لا تسجل مباشرة. أرجع status="incomplete" مع missing_fields=["disambiguation_note"] لطلب صفة مميزة (قبلي/بحري/إلخ)، وعند وصولها استدعِ manage_farmer_field بـ action="disambiguate".

6. عند تغيير محصول أرض موجودة: هذه عملية تتطلب تأكيدين منفصلين على التوالي عبر رسالتين على الأقل:
   - أولاً أرجع status="incomplete" مع missing_fields=["harvest_confirmation"] (هل خلص حصاد المحصول القديم؟).
   - بعد تأكيده، أرجع status="awaiting_confirmation" مع confirmation_summary يوضح أن بيانات المحصول القديم ستُنسى والجديد سيحل محله.
   - بعد التأكيد الثاني فقط، استدعِ manage_farmer_field بـ action="change_crop".

7. عند تعديل بيانات مسجلة (اسم/مساحة)، أرجع status="awaiting_confirmation" مع confirmation_summary يوضح القيمة الحالية مقابل الجديدة، واستدعِ manage_farmer_field بـ action="update_field" فقط بعد التأكيد.

8. اسم الأرض والمساحة ثابتان عبر المواسم؛ لا يتغيران إلا بطلب تعديل صريح (القاعدة 7). المحصول وتاريخ الزراعة فقط يتغيران كل موسم (القاعدة 6).

9. تحقق من منطقية البيانات قبل أي تسجيل: ارفض أي تاريخ زراعة في المستقبل، وارفض المساحة الصفرية أو السالبة. قيّم منطقية التاريخ بالنسبة لدورة نمو المحصول المحدد؛ لو غير منطقي، أرجع status="incomplete" مع missing_fields=["planting_date_verification"] بدل قبوله مباشرة.

10. حوّل أي وحدة مساحة يذكرها الفلاح (قيراط/متر) داخلياً للفدان، واحتفظ بالقيمة الأصلية في operations للعرض.

11. اعتمد على الأرض الوحيدة تلقائياً بلا سؤال لو الفلاح لديه أرض واحدة فقط مسجلة ونشاطه يخصها بوضوح.
</field_registration_rules>

<field_id_resolution>
هذا القسم لتحديد field_id الفعلي المستخدم في استدعاء أي أداة، وهو أدق من أي تخمين لأن ربط نشاط بأرض خاطئة يفسد كل تحليل مستقبلي.

عندما يذكر الفلاح نشاطاً أو تسجيلاً مرتبطاً بموقف فعلي، وذكر صفة أو أكثر (محصول/مساحة/تاريخ) دون اسم الأرض صراحة:
1. كم أرضاً من أراضي الفلاح المسجلة تطابق هذه الصفات مجتمعة؟
   - صفر: لا ترتبط بأي field_id. لو العملية تسجيل نشاط، أرجع status="incomplete" مع missing_fields=["field_name"] لطلب الاسم أو اقتراح تسجيلها كأرض جديدة.
   - أرض واحدة فقط: هذا هو field_id المقصود، استخدمه مباشرة دون سؤال.
   - أكثر من أرض: أرجع status="ambiguous" مع ambiguous_matches بأسماء الأراضي المتطابقة، ولا تستدعِ أي أداة.

مثال (تطابق فريد):
بيانات الفلاح: أرض واحدة "أرض خضر" محصولها "الغلة" مساحتها فدانين.
الفلاح: "عاوزين نرش فدانين الغلة، فيهم دودة، رشيت مبيد كذا"
→ field_id = أرض خضر (تطابق فريد)، تابع للتسجيل مباشرة.

مثال (تطابق متعدد):
بيانات الفلاح: أرضان بمحصول "قمح" ومساحة فدان.
الفلاح: "عندي فدان قمح فيه صدأ، رشيت دواء كذا"
→ status="ambiguous", ambiguous_matches=["اسم الأرض 1", "اسم الأرض 2"]
</field_id_resolution>

<field_activity_logging_rules>
<golden_rule_log_immediately>
بمجرد أن يذكر الفلاح نشاطاً زراعياً وقع فعلياً (وليس نية مستقبلية)، استدعِ log_field_activity فوراً بكل ما ذكره، بعد تحديد field_id وفق <field_id_resolution>. لا تنتظر اكتمال كل التفاصيل قبل التسجيل.

عند activity_type=treatment، استنتج category مباشرة دون سؤال:
- "رشيت" أو ذكر مبيد/دواء لآفة → category="مبيد"
- "سمّدت" أو ذكر سماد/كيماوي/تغذية → category="سماد"
- إذا ذكر اسم منتج موجود في productsContext، استخدم تصنيف المنتج المسجل هناك مباشرة.
ممنوع منعاً باتاً وضع status="incomplete" لمجرد طلب تحديد مبيد أم سماد إذا كان الاستنتاج ممكناً من السياق.
</golden_rule_log_immediately>

<matching_reference_lists>
عند تسجيل اسم منتج أو سبب الرش، طابق كلام الفلاح مع productsContext. استخدم الـ id المطابق إذا وجدت تطابقاً واضحاً وموثوقاً. إذا لم تجد تطابقاً واضحاً، لا تخترع معرفاً، واكتفِ بتسجيل النص كما قاله الفلاح حرفياً في الحقل النصي.
</matching_reference_lists>

<pending_vs_new_activity_rules>
قبل تحديد log_field_activity (جديد) أم update_field_activity (تحديث معلق)، قارن مع pending_activities الممررة في domain_context:

1. أرض مختلفة عن أرض النشاط المعلق: استدعِ log_field_activity فوراً (نشاط مستقل).
2. نفس الأرض لكن بفارق أكثر من 5 أيام عن activity_date المعلق: استدعِ log_field_activity فوراً (نشاط مستقل).
3. نفس الأرض وخلال 5 أيام أو أقل:
   - لو الكلام تفاصيل مكملة واضحة (عدد رشاشات، تأكيد نفس المنتج): استدعِ update_field_activity بالـ activity_id.
   - لو مبهم ومحتمل: أرجع status="incomplete" مع missing_fields=["same_activity_confirmation"] لطلب توضيح هل هي نفس الرشة أم جديدة.

مثال (أرض مختلفة، تسجيل فوري):
المعلق: رشة "كيمازد" في "أرض خضر" أمس.
الفلاح: "رشيت أرض النبع النهاردة"
→ log_field_activity فوري لأرض النبع (بلا سؤال عن المعلق).
</pending_vs_new_activity_rules>

<golden_rule_update_immediately>
أي معلومة جديدة يذكرها الفلاح تنطبق على نشاط معلق موضح في domain_context — سواء من الأعمدة المطلوبة أو تفصيل إضافي تطوع بذكره — استدعِ update_field_activity فوراً بالـ activity_id، وأدخل المعلومة في حقلها. لا تنشئ نشاطاً جديداً بالخطأ بدلاً من التحديث.

لا تحوّل mark_completed إلى صحيح إلا إذا ذكر الفلاح أيضاً outcome_rating بنفسه.
</golden_rule_update_immediately>
</field_activity_logging_rules>

<execution_note>
عند اكتمال الشروط لأي عملية (تسجيل، تحديث، أو تنفيذ بعد تأكيد)، استدعِ الأداة المناسبة فعلياً في نفس هذا الاستدعاء، وضع ناتجها الحقيقي في tool_result. لا ترجع status="complete" أبداً بدون tool_result فعلي مطابق. إذا فشل تنفيذ عملية من ضمن عدة عمليات، وضّح ذلك في tool_result الخاص بها بينما تكمل باقي العمليات الناجحة بشكل مستقل.
</execution_note>
`;

    const candidateGeminiKeys = await getCandidateGeminiKeys(primaryApiKey, keyModels, supabaseAdmin);

    const inputPayload = {
        current_message: rawFarmerText,
        domain_context: domainContext,
        pending_operation: pendingOperationFromSession || null,
        last_turn: lastTurn || null
    };

    for (const selectedKey of candidateGeminiKeys) {
        const geminiApiKey = selectedKey.api_keys?.api_key || primaryApiKey;
        const geminiModel = selectedKey.model_name || "gemini-3.5-flash-lite";
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

        const inputPayloadStr = JSON.stringify(inputPayload);
        console.log(`[crop-chat] 🚜 [Activity Sub-Agent] Invoking Flash Lite model "${geminiModel}" (ID: ${selectedKey.id}) | daily_usage: ${selectedKey.daily_usage}/${selectedKey.daily_limit}`);
        console.log(`[crop-chat] 📥 [Activity Sub-Agent Input] message: "${rawFarmerText}" | payload_size: ${inputPayloadStr.length} chars | pending_op: ${inputPayload.pending_operation ? 'YES' : 'none'} | last_turn: ${inputPayload.last_turn ? 'YES' : 'none'}`);

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [{ text: inputPayloadStr }],
                },
            ],
            systemInstruction: {
                parts: [{ text: activitySubagentPrompt }],
            },
            tools: [activitySubagentToolDeclaration],
            tool_config: {
                function_calling_config: { mode: "AUTO" },
            },
            generationConfig: {
                temperature: 0,
                maxOutputTokens: 2500,
                responseMimeType: "application/json",
                thinkingConfig: selectedKey.thinking_level ? {
                    thinkingLevel: selectedKey.thinking_level.toUpperCase()
                } : undefined,
            },
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        const activityStartTime = Date.now();

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            }).finally(() => clearTimeout(timeout));

            if (!res.ok) {
                const errText = await res.text();
                console.error(`[crop-chat] ❌ Activity subagent call failed HTTP ${res.status} on ${geminiModel}:`, errText);
                if (res.status === 429 && selectedKey.id && supabaseAdmin) {
                    await (supabaseAdmin as any).from("api_key_models").update({ status: "rate_limited" }).eq("id", selectedKey.id);
                }
                continue;
            }

            const data = await res.json();
            const activityElapsed = Date.now() - activityStartTime;
            const candidate = data.candidates?.[0];
            if (!candidate) continue;

            // ── Token Usage Logging ─────────────────────────────────────────────
            const usage = data.usageMetadata;
            if (usage) {
                console.log(`[crop-chat] 🔢 [Activity Sub-Agent Tokens] model: ${geminiModel} | prompt: ${usage.promptTokenCount ?? '?'} | output: ${usage.candidatesTokenCount ?? '?'} | total: ${usage.totalTokenCount ?? '?'} | latency: ${activityElapsed}ms`);
            } else {
                console.log(`[crop-chat] ⏱️ [Activity Sub-Agent] Latency: ${activityElapsed}ms | no usage metadata`);
            }

            // ── Finish Reason ───────────────────────────────────────────────────
            const finishReason = candidate.finishReason;
            console.log(`[crop-chat] 🏁 [Activity Sub-Agent] finishReason: ${finishReason}`);

            if (selectedKey.id && supabaseAdmin) {
                const updatedUsage = (selectedKey.daily_usage || 0) + 1;
                await (supabaseAdmin as any).from("api_key_models").update({ daily_usage: updatedUsage }).eq("id", selectedKey.id);
            }

            const parts: any[] = candidate.content?.parts ?? [];
            const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

            // Case A: Model executed function calls
            if (functionCalls.length > 0) {
                console.log(`[crop-chat] 🚜 [Activity Sub-Agent] Model returned ${functionCalls.length} function call(s)`);
                const activeFieldsList: FieldRecord[] = domainContext.activeFields || [];
                const operations: Array<{ type: string; tool_result: Record<string, any> | null }> = [];
                let forcedStatus: "ambiguous" | "incomplete" | null = null;
                const overallMissingFields: string[] = [];
                let overallAmbiguousMatches: string[] = [];

                for (const call of functionCalls) {
                    const toolName = call.name;
                    let toolArgs = call.args || {};

                    if (toolName === "update_field_activity") {
                        // Guard 1b: Validate activity_id
                        const gActivity = validateActivityId(toolArgs.activity_id);
                        if (!gActivity.valid) {
                            console.warn(`[crop-chat] 🛡️ [Guard 1b REJECTED] Tool: ${toolName}, reason: ${gActivity.reason}, raw activity_id:`, toolArgs.activity_id);
                            forcedStatus = "incomplete";
                            operations.push({
                                type: toolName,
                                tool_result: { status: "error", message: `Invalid activity_id: ${gActivity.reason}` }
                            });
                            continue;
                        }
                    } else {
                        // Check if tool targets an existing field (log_field_activity, manage_farmer_field change_crop / update_field)
                        const needsFieldCheck = (
                            toolName === "log_field_activity" ||
                            (toolName === "manage_farmer_field" && (toolArgs.action === "change_crop" || toolArgs.action === "update_field"))
                        );

                        if (needsFieldCheck) {
                            // Guard 1: Validate field_id
                            const g1 = validateFieldId(toolArgs.field_id, activeFieldsList);
                            if (!g1.valid) {
                                console.warn(`[crop-chat] 🛡️ [Guard 1 REJECTED] Tool: ${toolName}, reason: ${g1.reason}, raw field_id:`, toolArgs.field_id);
                                forcedStatus = "incomplete";
                                if (!overallMissingFields.includes("field_name")) {
                                    overallMissingFields.push("field_name");
                                }
                                operations.push({
                                    type: toolName,
                                    tool_result: { status: "error", message: `Invalid field_id: ${g1.reason}` }
                                });
                                continue;
                            }

                            // Guard 2: Ambiguity Check
                            const g2 = validateNotAmbiguous(toolArgs.field_id, rawFarmerText, activeFieldsList);
                            if (!g2.valid) {
                                console.warn(`[crop-chat] 🛡️ [Guard 2 REJECTED Ambiguity] Tool: ${toolName}, ambiguous matches:`, g2.ambiguous_matches);
                                forcedStatus = "ambiguous";
                                overallAmbiguousMatches = g2.ambiguous_matches || [];
                                operations.push({
                                    type: toolName,
                                    tool_result: { status: "error", message: "Ambiguous field reference" }
                                });
                                continue;
                            }
                        }
                    }

                    // Guard 3: Clean fake values
                    const { cleanedArgs, fakeFields } = validateAndCleanFakeValues(toolArgs);
                    toolArgs = cleanedArgs;
                    if (fakeFields.length > 0) {
                        console.log(`[crop-chat] 🛡️ [Guard 3 Cleaned Fake Values] Tool: ${toolName}, fields:`, fakeFields);
                        for (const ff of fakeFields) {
                            if (!overallMissingFields.includes(ff)) {
                                overallMissingFields.push(ff);
                            }
                        }
                    }

                    // Proceed with DB execution
                    const result = await executeActivitySubagentTool(toolName, toolArgs, userId, supabaseAdmin);
                    operations.push(result);
                }

                if (forcedStatus === "ambiguous") {
                    return {
                        status: "ambiguous",
                        operations,
                        ambiguous_matches: overallAmbiguousMatches
                    };
                }

                const hasErrorOp = operations.some(op => op.tool_result?.status === "error");
                if (hasErrorOp || forcedStatus === "incomplete") {
                    return {
                        status: "incomplete",
                        operations,
                        missing_fields: overallMissingFields.length > 0 ? overallMissingFields : undefined
                    };
                }

                return {
                    status: "complete",
                    operations,
                    missing_fields: overallMissingFields.length > 0 ? overallMissingFields : undefined
                };
            }

            // Case B: Model returned JSON contract directly in text
            const textParts = parts.filter((p: any) => !p.thought && p.text).map((p: any) => p.text).join("\n").trim();
            if (textParts) {
                console.log(`[crop-chat] 📤 [Activity Sub-Agent Raw JSON Response]:\n${textParts.slice(0, 1000)}${textParts.length > 1000 ? '...(truncated)' : ''}`);
                try {
                    const cleanJson = textParts.replace(/^```json/i, "").replace(/^```/i, "").replace(/```$/i, "").trim();
                    const parsed = JSON.parse(cleanJson);
                    if (parsed.status) {
                        console.log(`[crop-chat] ✅ [Activity Sub-Agent Contract] status: "${parsed.status}" | ops: ${parsed.operations?.length ?? 0} | note: "${parsed.agent_note || 'none'}" | missing: ${JSON.stringify(parsed.missing_fields ?? [])} | ambiguous: ${JSON.stringify(parsed.ambiguous_matches ?? [])}`);
                        return parsed as ActivitySubagentResponse;
                    }
                } catch (jsonErr) {
                    console.warn("[crop-chat] Failed to parse activity subagent direct JSON text:", textParts, jsonErr);
                }
            }

            return {
                status: "complete",
                operations: []
            };
        } catch (fetchErr) {
            console.error(`[crop-chat] Activity subagent request failed for model ${geminiModel}:`, fetchErr);
            continue;
        }
    }

    return {
        status: "incomplete",
        operations: [],
        missing_fields: ["تعذر الاتصال بسب-أجنت الأنشطة"]
    };
}

// ── Profile & Memory Sub-Agent (Async Background Fire-and-Forget) ──────────────
async function executeProfileMemorySubagent(
    rawFarmerText: string,
    currentFarmProfile: Record<string, any>,
    existingMemoryCategories: string[],
    activeFieldsContext: string,
    userId: string,
    supabaseAdmin: any,
    primaryApiKey: string,
    keyModels?: any[]
): Promise<void> {
    const memStartTime = Date.now();
    try {
        console.log(`[crop-chat] 🧠 [Profile/Memory Sub-Agent (Background)] Started for message: "${rawFarmerText}"`);

        const profileMemorySubagentPrompt = `<role>
أنت مستمع صامت متخصص، لست محادثاً ولا تنتظر أي رد. مهمتك الوحيدة: تحليل نص الفلاح الخام، واستخراج أي معلومة ثابتة عن ملفه الزراعي أو أي حقيقة سلوكية عنه، وتسجيلها فوراً عبر الأداة المناسبة. ناتجك دائماً وفق <output_contract> فقط، ولا يصل أبداً للفلاح بأي شكل.
</role>

<output_contract>
{
  "status": "complete | skipped",
  "operations": [ { "type": "update_farm_profile | log_farmer_memory", "tool_result": {...} } ]
}
استخدم status="skipped" مع operations فارغة إذا لم تجد في النص أي معلومة تستحق التسجيل.
</output_contract>

<domain_context>
ملف المزرعة الحالي: ${JSON.stringify(currentFarmProfile, null, 2)}
فئات الذاكرة المسجلة سابقاً: ${existingMemoryCategories.length > 0 ? existingMemoryCategories.join("، ") : "لا توجد"}
</domain_context>

<stealth_profile_update_rules>
إذا ذكر النص معلومة جديدة أو دائمة عن أرض الفلاح أو معداته أو ريه أو محصوله (مثل سعة رشاشة، نوع تربة، طريقة ري، مساحة عامة، تقاوي)، استدعِ update_farm_profile فوراً بالحقل المطابق. إذا ذكر محصولاً غير موجود في قائمة الاختيارات المغلقة، اختر 'other_crop'.
</stealth_profile_update_rules>

<memory_categories>
سجّل فقط الحقائق التي تندرج بوضوح تحت واحد من هذه الخمسة، ولا تخترع تصنيفاً سادساً:
  - budget_level: قدرته المالية وميله للحلول الاقتصادية أو المرتفعة الثمن (قيمة واحدة تمثل حالته الحالية).
  - risk_tolerance: مدى استعداده لتجربة منتجات أو طرق جديدة (قيمة واحدة).
  - communication_style: طريقته المفضلة في تلقي المعلومة (قيمة واحدة).
  - crop_preference: المحاصيل التي يفضل زراعتها (قيم متعددة).
  - trusted_source: الجهات التي يثق برأيها الزراعي (قيم متعددة).

إذا لم تنطبق الحقيقة بوضوح على أي تصنيف، لا تسجلها إطلاقاً.
</memory_categories>

<how_to_log>
استخدم log_farmer_memory فوراً بمجرد استنتاج حقيقة بثقة عالية.

تصنيفات القيمة الواحدة (budget_level, risk_tolerance, communication_style): لو الفلاح قال ما يناقض حقيقة مسجلة سابقاً لنفس التصنيف، سجّل الحقيقة الجديدة (ستحل تلقائياً محل القديمة).

تصنيفات القيم المتعددة (crop_preference, trusted_source): كل ذكر جديد يُضاف كحقيقة مستقلة، ولا يُفترض أنه يلغي ما قبله إلا بتصريح صريح بالتراجع (مثل "بطلت أزرع كذا").

لا تسجل ملاحظة عابرة أو مبنية على تخمين؛ سجّل فقط ما صرّح به الفلاح فعلياً أو استنتجته بثقة عالية من سياق واضح ومتكرر.
</how_to_log>
`;

        const candidateGeminiKeys = await getCandidateGeminiKeys(primaryApiKey, keyModels, supabaseAdmin);

        for (const selectedKey of candidateGeminiKeys) {
            const geminiApiKey = selectedKey.api_keys?.api_key || primaryApiKey;
            const geminiModel = selectedKey.model_name || "gemini-3.5-flash-lite";
            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

            console.log(`[crop-chat] 🧠 [Profile/Memory Sub-Agent (Background)] Invoking Flash Lite model "${geminiModel}" (ID: ${selectedKey.id}) | daily_usage: ${selectedKey.daily_usage}/${selectedKey.daily_limit}`);

            const requestBody = {
                contents: [
                    {
                        role: "user",
                        parts: [{ text: JSON.stringify({ current_message: rawFarmerText, current_farm_profile: currentFarmProfile }) }],
                    },
                ],
                systemInstruction: {
                    parts: [{ text: profileMemorySubagentPrompt }],
                },
                tools: [profileMemoryToolDeclaration],
                tool_config: {
                    function_calling_config: { mode: "AUTO" },
                },
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 2000,
                    responseMimeType: "application/json",
                    thinkingConfig: selectedKey.thinking_level ? {
                        thinkingLevel: selectedKey.thinking_level.toUpperCase()
                    } : undefined,
                },
            };

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60_000);

            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal,
                }).finally(() => clearTimeout(timeout));

                if (!res.ok) {
                    const errText = await res.text();
                    console.error(`[crop-chat] ❌ Profile/Memory Sub-Agent failed HTTP ${res.status} on ${geminiModel}:`, errText);
                    if (res.status === 429 && selectedKey.id && supabaseAdmin) {
                        await (supabaseAdmin as any).from("api_key_models").update({ status: "rate_limited" }).eq("id", selectedKey.id);
                    }
                    continue;
                }

                const data = await res.json();
                const memElapsed = Date.now() - memStartTime;
                const candidate = data.candidates?.[0];
                if (!candidate) continue;

                // ── Token Usage for Memory Sub-Agent ───────────────────────────
                const memUsage = data.usageMetadata;
                if (memUsage) {
                    console.log(`[crop-chat] 🔢 [Profile/Memory Sub-Agent Tokens] model: ${geminiModel} | prompt: ${memUsage.promptTokenCount ?? '?'} | output: ${memUsage.candidatesTokenCount ?? '?'} | total: ${memUsage.totalTokenCount ?? '?'} | latency: ${memElapsed}ms`);
                } else {
                    console.log(`[crop-chat] ⏱️ [Profile/Memory Sub-Agent] Latency: ${memElapsed}ms`);
                }

                if (selectedKey.id && supabaseAdmin) {
                    const updatedUsage = (selectedKey.daily_usage || 0) + 1;
                    await (supabaseAdmin as any).from("api_key_models").update({ daily_usage: updatedUsage }).eq("id", selectedKey.id);
                }

                const parts: any[] = candidate.content?.parts ?? [];
                const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

                for (const call of functionCalls) {
                    if (call.name === "update_farm_profile") {
                        const { target_scope, properties_to_update } = call.args || {};
                        const cleanedData = Object.fromEntries(
                            Object.entries(properties_to_update || {}).filter(
                                ([_, v]) => v !== undefined && v !== null && v !== ""
                            )
                        );
                        if (Object.keys(cleanedData).length > 0) {
                            const { error: rpcError } = await (supabaseAdmin as any).rpc("merge_farm_profile", {
                                farmer_id: userId,
                                target_scope: target_scope || "general",
                                new_data: cleanedData,
                            });
                            if (rpcError) console.error("[crop-chat] ⚠️ Background merge_farm_profile error:", rpcError);
                            else console.log(`[crop-chat] 🧠 Successfully updated farm profile for farmer ${userId}`);
                        }
                    } else if (call.name === "log_farmer_memory") {
                        const { category, fact, confidence } = call.args || {};
                        if (category && fact) {
                            await (supabaseAdmin as any)
                                .from("farmer_memory")
                                .update({ is_active: false })
                                .eq("farmer_id", userId)
                                .eq("category", category)
                                .eq("is_active", true);

                            const { error: memErr } = await (supabaseAdmin as any)
                                .from("farmer_memory")
                                .insert({
                                    farmer_id: userId,
                                    category,
                                    fact,
                                    source: "conversation",
                                    confidence: confidence || null,
                                    is_active: true,
                                });

                            if (memErr) console.error(`[crop-chat] ⚠️ Background log_farmer_memory error:`, memErr);
                            else console.log(`[crop-chat] 🧠 Successfully logged farmer memory (${category}) for farmer ${userId}`);
                        }
                    }
                }

                console.log(`[crop-chat] 🧠 [Profile/Memory Sub-Agent (Background)] Completed successfully.`);
                return;
            } catch (err) {
                console.error(`[crop-chat] Background profile memory subagent fetch error for model ${geminiModel}:`, err);
                continue;
            }
        }
    } catch (outerErr) {
        console.error("[crop-chat] Background executeProfileMemorySubagent caught error:", outerErr);
    }
}

// ── Session Pending Operation Extraction Helper ────────────────────────────────
function extractPendingOperationFromHistory(history?: RequestHistoryItem[]): any {
    if (!history || history.length === 0) return null;

    const lastModelTurn = history.filter(h => h.role === "model").slice(-1)[0]?.content;
    if (!lastModelTurn) return null;

    const fieldMatch = lastModelTurn.match(/اسم الأرض:\s*(.+?)(?:\n|$)/);
    const cropMatch = lastModelTurn.match(/نوع المحصول:\s*(.+?)(?:\n|$)/);
    const dateMatch = lastModelTurn.match(/تاريخ الزراعة:\s*(.+?)(?:\n|$)/);
    const areaMatch = lastModelTurn.match(/المساحة:\s*(.+?)(?:\n|$)/);

    if (fieldMatch || cropMatch || dateMatch || areaMatch) {
        return {
            type: "register_field",
            extracted: {
                field_name: fieldMatch ? fieldMatch[1].trim() : null,
                crop: cropMatch ? cropMatch[1].trim() : null,
                planting_date: dateMatch ? dateMatch[1].trim() : null,
                area: areaMatch ? areaMatch[1].trim() : null,
            },
            awaiting: "confirmation"
        };
    }

    return null;
}

// ── POST /api/crop-chat ────────────────────────────────────────────────────────
export async function POST(request: Request) {
    const supabase = await createServerClient();

    // 1. Validate auth
    const {
        data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
        return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
    }

    const userId = currentUser.id;

    const body = await request.json();
    const { history, message, imageBase64, pending_operation: clientPendingOp } = body as {
        history?: RequestHistoryItem[];
        message: string;
        imageBase64?: string;
        pending_operation?: any;
    };

    if (!message) {
        return NextResponse.json(
            { error: "لم يتم إرسال نص الرسالة" },
            { status: 400 }
        );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        console.error("[crop-chat] SUPABASE_SERVICE_ROLE_KEY is missing from environment.");
        return NextResponse.json(
            { error: "إعداد الخادم غير مكتمل (مفتاح الخدمة مفقود)" },
            { status: 500 }
        );
    }
    const supabaseAdmin = createAdminClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
    );

    // 2. Fetch fresh farmer profile, location, active fields, memory, and active agenda alerts
    const [farmerRowRes, farmerFieldsRes, farmerMemoryRes, weatherCacheRes] = await Promise.all([
        (supabaseAdmin as any).from("farmers").select("governorate, center, village, farm_profile").eq("profile_id", userId).maybeSingle(),
        (supabaseAdmin as any).from("farmer_fields").select("id, field_name, crop_type, planting_date, area_feddan, area_unit, latitude, longitude, is_active").eq("farmer_id", userId).eq("is_active", true).order("created_at", { ascending: false }),
        (supabaseAdmin as any).from("farmer_memory").select("category, fact").eq("farmer_id", userId).eq("is_active", true),
        (supabaseAdmin as any).from("weather_cache").select("location_name, temperature_2m, relative_humidity_2m, wind_speed_10m, weather_code, daily_forecast").order("fetched_at", { ascending: false }).limit(10),
    ]);

    const farmerLocationText = [
        farmerRowRes.data?.village ? `قرية ${farmerRowRes.data.village}` : null,
        farmerRowRes.data?.center ? `مركز ${farmerRowRes.data.center}` : null,
        farmerRowRes.data?.governorate ? `محافظة ${farmerRowRes.data.governorate}` : null,
    ].filter(Boolean).join("، ") || "غير مسجل بدقة";

    const farmerProfile = (farmerRowRes.data?.farm_profile as Record<string, any>) || {};
    const farmerProfileFormatted = Object.keys(farmerProfile).length > 0
        ? JSON.stringify(farmerProfile, null, 2)
        : "لا توجد بيانات مسجلة مسبقاً لمزرعة هذا المزارع.";

    const activeFields = (farmerFieldsRes.data as any[]) || [];
    const activeFieldsContext = activeFields.length > 0
        ? activeFields.map((f: any) =>
            `- المعرف: ${f.id} | اسم الأرض: ${f.field_name || "بدون اسم"} | المحصول: ${f.crop_type || "غير محدد"} | المساحة: ${displayArea(f.area_feddan || 1, f.area_unit || "فدان")} | تاريخ الزراعة: ${f.planting_date || "غير محدد"}`
        ).join("\n")
        : "لا توجد أراضٍ مسجلة حالياً للفلاح.";

    // Fetch active open agenda alerts for these fields
    const fieldIds = activeFields.map((f: any) => f.id);
    let openAlertsContext = "لا توجد تنبيهات مخاطر نشطة اليوم على حقولك.";
    if (fieldIds.length > 0) {
        const { data: openAlerts } = await (supabaseAdmin as any)
            .from("alert_instances")
            .select("risk_type, severity_snapshot, advice_text_snapshot, advice_reason_snapshot, farmer_field_id")
            .in("farmer_field_id", fieldIds)
            .not("status", "in", '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")');

        if (openAlerts && openAlerts.length > 0) {
            openAlertsContext = openAlerts.map((a: any) => {
                const field = activeFields.find((f: any) => f.id === a.farmer_field_id);
                const fieldName = field?.field_name || field?.crop_type || "الحقل";
                return `- [تنبيه خطر (${a.severity_snapshot}) على ${fieldName}]: نوع الخطر: ${a.risk_type} | التوجيه الفني: ${a.advice_text_snapshot}${a.advice_reason_snapshot ? ` (السبب: ${a.advice_reason_snapshot})` : ""}`;
            }).join("\n");
        }
    }

    // Determine nearest weather context
    const weatherRows = (weatherCacheRes.data as any[]) || [];
    let weatherSummaryContext = "بيانات الطقس غير متوفرة حالياً.";
    if (weatherRows.length > 0) {
        const farmerGov = farmerProfile.governorate || farmerProfile.center || "";
        const matched = farmerGov ? weatherRows.find((w: any) => w.location_name?.includes(farmerGov)) || weatherRows[0] : weatherRows[0];
        weatherSummaryContext = `المنطقة: ${matched.location_name} | درجة الحرارة: ${matched.temperature_2m}°C | الرطوبة النسبية: ${matched.relative_humidity_2m}% | سرعة الرياح: ${matched.wind_speed_10m} كم/س`;
    }

    const existingMemoryCategories = Array.from(new Set(((farmerMemoryRes.data as any[]) || []).map((m: any) => m.category).filter(Boolean)));
    const farmerMemories = (farmerMemoryRes.data as any[]) || [];
    const farmerMemoryContext = farmerMemories.length > 0
        ? farmerMemories.map((m: any) => `- [${m.category}]: ${m.fact}`).join("\n")
        : "لا توجد ملاحظات سلوكية مسجلة حتى الآن.";

    console.log(`[crop-chat] 📊 [Context Snapshot] Farmer: ${userId.slice(0,8)}... | Active Fields: ${activeFields.length} | Memory Facts: ${farmerMemories.length}`);
    if (activeFields.length > 0) {
        console.log(`[crop-chat] 🌾 [Active Fields List]:\n${activeFields.map((f: any, i: number) => `  ${i+1}. "${f.field_name || 'بدون اسم'}" — ${f.crop_type || 'غير محدد'} — ${displayArea(f.area_feddan || 1, f.area_unit || 'فدان')}`).join('\n')}`);
    }

    const pendingActivitiesContext = await fetchPendingActivities(supabaseAdmin, userId);

    // 3. Fetch products catalog
    const { data: products } = await (supabaseAdmin as any)
        .from("products")
        .select("id, name_ar, active_ingredient, price_to_farmer, stock_status, image_url, dose_unit, dose_amount, package_size, package_unit, target_crops");

    const productsContext =
        products
            ?.map((p: any) => {
                let line = `- المعرف: ${p.id} | الاسم: ${p.name_ar} | المادة الفعالة: ${p.active_ingredient ?? "غير محددة"} | السعر للمزارع: ${p.price_to_farmer} جنيهاً | متوفر: ${p.stock_status ? "نعم" : "لا"}`;
                if (p.package_size != null) {
                    line += ` | حجم العبوة: ${p.package_size}${p.package_unit ? ` ${p.package_unit}` : ""}`;
                }
                if (p.dose_amount != null && p.dose_unit) {
                    const doseLabel = p.dose_unit === "per_feddan" ? "لكل فدان" : p.dose_unit === "per_100L" ? "لكل 100 لتر ماء" : p.dose_unit;
                    line += ` | الجرعة: ${p.dose_amount} ${doseLabel}`;
                }
                if (p.target_crops) {
                    const crops = Array.isArray(p.target_crops) ? p.target_crops.join("، ") : p.target_crops;
                    line += ` | المحاصيل المستهدفة: ${crops}`;
                }
                return line;
            })
            .join("\n") || "لا توجد منتجات متوفرة حالياً في المعرض.";

    // 4. Session pending operation and last turn extraction
    const sessionPendingOp = clientPendingOp || extractPendingOperationFromHistory(history);
    const lastUserTurn = history?.filter(h => h.role === "user").slice(-1)[0]?.content || null;
    const lastModelTurn = history?.filter(h => h.role === "model").slice(-1)[0]?.content || null;
    const lastTurn = (lastUserTurn || lastModelTurn) ? { farmer_message: lastUserTurn, assistant_response: lastModelTurn } : null;

    const nowCairo = new Date().toLocaleString("ar-EG", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
    });

    const extractAnswer = (rawText: string): string => {
        const match = rawText.match(/<answer>([\s\S]*?)<\/answer>/i);
        if (match) return match[1].trim();
        return rawText.trim();
    };

    const processResponseText = (rawText: string) => {
        if (!rawText) return { cleanText: "", recommendedProduct: null };

        const extractedAnswerText = extractAnswer(rawText);

        const sanitizedText = extractedAnswerText
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
            .replace(/<call:[^>]*\{[\s\S]*?\}>/gi, "")
            .replace(/<call:[\s\S]*?>/gi, "")
            .replace(/<call:[^\n>]+>/gi, "")
            .replace(/\[(?:default_api:)?(?:activity_subagent|profile_memory_subagent|web_search|update_farm_profile|manage_farmer_field|log_farmer_memory|log_field_activity|update_field_activity)[\s\S]*?\]/gi, "")
            .replace(/\[default_api:[\s\S]*?\]/gi, "")
            .replace(/```[\s\S]*?```/g, "")
            .replace(/\((?:activity_id|field_id|id):\s*[a-f0-9\-]+\)/gi, "")
            .replace(/(?:activity_id|field_id):\s*[a-f0-9\-]+/gi, "")
            .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();

        const match = sanitizedText.match(/\[RECOMMEND_PRODUCT:\s*["']?([^\]"']+)["']?\s*\]/i);
        let recommendedProduct: any = null;
        const cleanText = sanitizedText.replace(/\[RECOMMEND_PRODUCT:\s*["']?[^\]"']+["']?\s*\]/gi, "").trim();

        if (match) {
            const tagValue = match[1].trim().toLowerCase();
            const matchedProduct = (products as any[])?.find(
                (p: any) =>
                    String(p.id).trim().toLowerCase() === tagValue ||
                    String(p.name_ar).trim().toLowerCase() === tagValue
            );
            if (matchedProduct) {
                recommendedProduct = {
                    id: matchedProduct.id,
                    name_ar: matchedProduct.name_ar,
                    price_to_farmer: matchedProduct.price_to_farmer,
                    image_url: matchedProduct.image_url || null,
                    active_ingredient: matchedProduct.active_ingredient || null,
                };
            }
        }

        if (!recommendedProduct && products && products.length > 0) {
            const sortedProducts = [...(products as any[])].sort(
                (a: any, b: any) => (b.name_ar?.length || 0) - (a.name_ar?.length || 0)
            );

            for (const p of sortedProducts) {
                if (p.name_ar && p.name_ar.trim().length > 1 && cleanText.includes(p.name_ar.trim())) {
                    recommendedProduct = {
                        id: p.id,
                        name_ar: p.name_ar,
                        price_to_farmer: p.price_to_farmer,
                        image_url: p.image_url || null,
                        active_ingredient: p.active_ingredient || null,
                    };
                    break;
                }
            }
        }

        return { cleanText, recommendedProduct };
    };

    // 5. Main Orchestrator System Prompt
    const mainSystemPrompt = `<context>
التاريخ والوقت الحالي في مصر: ${nowCairo}
موقع المزارع الجغرافي: ${farmerLocationText}
</context>

<role>
أنت "المرشد"، مهندس زراعي مصري خبير يعمل لصالح منصة ELA، بخبرة عملية طويلة في محاصيل مصر المختلفة، الأمراض الفطرية والحشرية، طرق الري والتسميد، ومكافحة الآفات. أسلوبك ودود ومباشر، تتحدث مع الفلاح كأخ خبير يثق فيه، لا كموظف خدمة عملاء رسمي. مهمتك الأساسية: الإجابة عن تساؤلات الفلاح بدقة، وترشيح المنتج المناسب من قائمتنا فقط عند الحاجة الفعلية، مع الحفاظ الصارم على دقة كل معلومة تقنية تقولها لأنها تؤثر مباشرة على محصوله ورزقه.

أنت **لا تنفّذ عمليات تسجيل البيانات بنفسك**. عندما يحتاج الأمر تسجيل نشاط، أرض، أو ملاحظة سلوكية، تستعين بمتخصصين داخليين (موضحين في <subagent_orchestration>) يقومون بالاستخراج والتنفيذ الفعلي، وأنت تصيغ النتيجة للفلاح بأسلوبك الطبيعي دائماً.
</role>

<voice_and_language_rules>
هذا القسم أساسي ولا يتغير تحت أي ظرف، لأن كل رد تكتبه يتحول مباشرة إلى صوت مسموع بصوت المعلق "شاكر" عبر محرك Edge TTS، فأي خطأ هنا يصل مباشرة كخطأ نطق مسموع للفلاح.

1. تحدث باللغة العربية الفصحى المعاصرة والمبسطة جداً، بأسلوب لبق وودود ومحترم بدون إفراط أو تكرار ممل.

2. الترحيب: رحب بالمزارع (مثل: "أهلاً بك يا أخي" أو "أهلاً بك يا حاج") في بداية المحادثة فقط، إذا كان هذا هو السؤال الأول في الشات ولا يوجد سجل محادثة سابق. في الرسائل التالية، اجب مباشرة وبشكل طبيعي دون تكرار عبارات الترحيب.

3. الكلمات الممنوعة تماماً وبدائلها الإجباري (استخدم البديل دائماً بدلاً منها):
   - "عشان" أو "علشان" -> استخدم "لأن" أو "لكي" أو "من أجل"
   - "هبسطهالك" -> استخدم "سأوضحها لك ببساطة" أو "سأشرحها لك بتبسيط"
   - "كدة" أو "كده" -> استخدم "كذلك" أو "بهذه الطريقة"
   - "دلوقتي" -> استخدم "الآن"
   - "مش" -> استخدم "ليس" أو "لا" أو "لن"
   - "هيساعدك" -> استخدم "سوف يساعدك"
   - "هينفع" -> استخدم "سوف يجدي نفعاً" أو "سيكون مفيداً"
   استخدم دائماً فصحى معاصرة مبسطة وقريبة من الفلاح، وتجنب الكلمات الفصحى التراثية الثقيلة مثل (حيال، ثمة، لدن، زهاء).

4. علامات الترقيم: وزّع الفواصل (،) والنقاط (.) بدقة شديدة بعد كل فكرة مكتملة أو تفصيل. اكتب جملاً قصيرة مقسّمة بفواصل ونقاط بدلاً من الجمل الطويلة المتصلة.

5. اجعل النص يتدفق كفقرة حوارية مسترسلة خالية من الرموز البرمجية أو تنسيقات الماركداون والرموز التعبيرية والقوائم المرقمة.
   استثناء وحيد: كود [RECOMMEND_PRODUCT:product_id] المذكور في <product_recommendation_and_purchase> لا يُقرأ صوتياً، اكتبه دائماً بصيغته الكاملة كما هي.
</voice_and_language_rules>

<farmer_profile>
إليك ملف المزارع الحالي المسجل لدينا: ${farmerProfileFormatted}

القيم الافتراضية عند عدم توفر المعلومة في الملف:
  - سعة الرشاشة الافتراضية: ${DEFAULT_FARM_DEFAULTS.sprayer_capacity}
  - مساحة الأرض الافتراضية: ${DEFAULT_FARM_DEFAULTS.land_area}
  - طريقة الري الافتراضية: ${DEFAULT_FARM_DEFAULTS.irrigation_type}

استخدم هذه البيانات فقط لتخصيص حديثك وتحليلك الداخلي. أي تحديث فعلي على هذا الملف يحدث تلقائياً في الخلفية عبر نظام منفصل، فلا تذكر للفلاح أبداً أنك ستحفظ أو حفظت أي معلومة عن ملفه (راجع <acknowledging_farmer_answers> للصياغة الإنسانية المسموحة).
</farmer_profile>

<active_fields>
إليك قائمة الأراضي المسجلة حالياً لهذا الفلاح (هذه القائمة هي المرجع الوحيد والصحيح — لا تتجاهل أياً منها ولا تخترع أراضٍ غير موجودة فيها):
${activeFieldsContext}

عند سؤال الفلاح عن أراضيه، اذكرها كلها بالترتيب بالاسم والمحصول والمساحة. لا تكتفِ بذكر بعضها.
</active_fields>

<regional_weather_context>
حالة الطقس الحالية المسجلة لمنطقة الفلاح وحقوله:
${weatherSummaryContext}

استخدم هذه البيانات لإرشاد الفلاح حول ملاءمة الطقس للرش (سرعة الرياح < 15 كم/س، عدم وجود أمطار أو رطوبة مفرطة تسبب غسيل المبيد)، ومواعيد الري المناسبة وفقاً لدرجات الحرارة.
</regional_weather_context>

<active_agenda_alerts>
تنبيهات ومخاطر الأجندة اليومية الصادرة لحقول الفلاح:
${openAlertsContext}

إذا سأل الفلاح عن مشاكل أو أمراض أو ما إذا كان هناك خطر يهدد أرضه اليوم، استشهد بهذه التنبيهات المعتمدة ووجّهه بحسب النصيحة الفنية المسجلة.
</active_agenda_alerts>

<farmer_behavioral_memory>
إليك الملاحظات والحقائق السلوكية المسجلة عن هذا الفلاح:
${farmerMemoryContext}

كيف ومتى تستخدم هذه الذاكرة لتخصيص ردك:
1. budget_level (القدرة المالية): إذا كانت "اقتصادي" أو تشير لميزانية محدودة، رشح دائماً الحلول المجدية اقتصادياً وذات التكلفة الأنسب أولاً، دون إحراجه أو التصريح له بوضعه المالي. وإذا كانت مرتفعة، اقترح أفضل المنتجات كفاءة وأعلى تقنية.
2. risk_tolerance (تقبل المخاطرة): إذا كانت حذرة أو منخفضة، ركّز على الطرق والمبيدات التقليدية الموثوقة والمجربة. وإذا كانت عالية، يمكنك اقتراح تقنيات وحلول حديثة.
3. communication_style (أسلوب التواصل): طابق طريقته المفضلة؛ إذا كان يفضل الاختصار كن مباشراً وموجزاً، وإذا كان يفضل الشرح والتفصيل اشرح له برحابة صدر.
4. crop_preference (المحاصيل المفضلة): اعلم ما يحب زراعته واستشهد به عند تقديم نصائح زراعية أو حديث عام.
5. trusted_source (المصادر الموثوقة): إذا كان يثق في جهة معينة (مثل وزارة الزراعة أو مركز البحوث)، عزز ثقته بالإشارة لتوافق التوصية مع تلك الجهات.
ممنوع منعاً باتاً أن تقول للفلاح "أنا مسجل عندي في ملفك أنك..."؛ بل وظّف هذه المعلومات بذكاء وسلاسة في نبرتك واختياراتك وتوصياتك فقط.
</farmer_behavioral_memory>


<products_and_dosage>
إليك قاعدة بيانات المنتجات الخاصة بنا (يوصى بها فقط إذا كانت متوفرة أي "متوفر: نعم"): ${productsContext}

كل منتج في القاعدة يحتوي على الحقول التالية:
  - dose_amount: قيمة الجرعة الموصى بها.
  - dose_unit: وحدة قياس الجرعة، وتكون واحدة من قيمتين فقط: "per_feddan" أو "per_100L".
  - package_size: حجم العبوة بالأرقام فقط.
  - package_unit: وحدة حجم العبوة.
  - target_crops: قائمة المحاصيل التي صُمم المنتج لعلاجها.

<thinking_before_recommending>
قبل كتابة أي كلمة في ردك النهائي، ابدأ دائماً بكتابة تفكيرك خطوة بخطوة داخل وسم <thinking>، ثم اكتب ردك النهائي داخل وسم <answer>. النص داخل <thinking> لن يُقرأ صوتياً وسيُحذف قبل الإرسال للفلاح.

بالتحديد، في أي رسالة يسأل فيها الفلاح عن علاج أو رشة أو دواء لمحصول:
<thinking>
1. ما هو المحصول الذي يقصده الفلاح بالضبط؟
2. هل الوصف كافٍ لتشخيص مرض أو آفة واحدة بثقة، أم غامض؟ إذا غامض، توقف واطلب صورة وفق <symptom_clarity_and_photo_request>.
3. هل يوجد منتج في القائمة target_crops الخاصة به تشمل هذا المحصول صراحة؟
4. إذا وُجد منتج مطابق: هل dose_amount و dose_unit مسجلان فعلياً له؟
5. القرار: أرشح منتجاً، أم أوجه لسفير القرية، أم أطلب صورة؟
</thinking>
<answer>
[ردك النهائي متبعاً <voice_and_language_rules>]
</answer>
</thinking_before_recommending>

<golden_rule_no_invention>
اعتمد دائماً وحصرياً على البيانات المسجلة فعلياً عند ذكر أي جرعة أو حجم عبوة. إذا لم تكن مسجلة لمنتج معين، أخبر المزارع أن الجرعة الدقيقة مكتوبة على العبوة ووجهه لسفير القرية. يُمنع منعاً باتاً اختراع أو تخمين قيمة الجرعة، حتى لو كانت لديك معرفة عامة تقديرية.
</golden_rule_no_invention>

<golden_rule_crop_matching>
رشّح دائماً المنتج المطابق صراحة لمحصول الفلاح فقط، بالاعتماد على target_crops. إذا لم يكن محصوله مدرجاً ضمن أي منتج متوفر، أخبره بوضوح ووجهه لسفير القرية. يُمنع منعاً باتاً ترشيح منتج بديل بناءً على تخمينك.
</golden_rule_crop_matching>

<dosage_calculation_paths>
المسار أ - "لكل فدان" (per_feddan):
  1. احسب عدد العبوات المطلوبة للفدان بقسمة dose_amount على package_size، وقرّب دائماً لأعلى.
  2. اذكر الجرعة وعدد العبوات لفدان واحد كرد افتراضي عند عدم ذكر المساحة الفعلية.
  3. إذا صرّح بمساحته الفعلية، اضرب عدد العبوات في عدد الأفدنة وأعطه الرقم الإجمالي مباشرة.
  4. لا تستخدم سعة الرشاشة المسجلة في حساب عدد الرشاشات إطلاقاً؛ اتركه لتقدير الفلاح.

المسار ب - "لكل 100 لتر" (per_100L):
  اذكر الجرعة كما هي مسجلة فقط، ولا تحسب عدد عبوات أو تربطها بالمساحة.
</dosage_calculation_paths>
</products_and_dosage>

<field_attribute_resolution_light>
هذا القسم لتخصيص أسلوب حديثك فقط، وليس لتحديد field_id لأي عملية تسجيل (ذلك من مسؤولية سب-أجنت الأنشطة).

عندما يسأل الفلاح استشارة عن موقف فعلي حالي، وذكر صفة من صفات أرضه (محصول/مساحة) دون اسمها، وكانت هناك أرض واحدة فقط من بياناته تطابق هذه الصفة، اذكر اسمها في ردك كتأكيد ضمني طبيعي مرة واحدة فقط ("بما إننا بنتكلم عن أرض خضر...")، ثم لا تكرر الاسم في الردود التالية طالما استمر الحديث عن نفس الموقف.

إذا لم تكن متأكداً (أكثر من أرض مطابقة، أو سؤال عام لا علاقة له بأرض بعينها)، لا تحاول الربط، وأجب بشكل عام مباشرة.
</field_attribute_resolution_light>

<product_recommendation_and_purchase>
1. اذكر دائماً اسم الشركة المصنعة كما هو مسجل فقط عند توفره. إذا لم يكن متوفراً، لا تذكره إطلاقاً بدلاً من افتراضه.
2. أكد للمزارع دائماً أن المنتج أصلي ومضمون من منصتنا بنسبة 100%.
3. اكتب كود التوصية بالضبط بصيغة: [RECOMMEND_PRODUCT:product_id] عند ترشيح منتج متوفر بشكل محدد وصريح، اجتاز خطوة <thinking_before_recommending>.
4. وجّه المزارع لسفير القرية فقط في الحالات التالية: تأكيد الجرعة الدقيقة على العبوة، حجز شحنات للخصم الجماعي، أو عدم توفر بيانات كافية.
5. اعتمد حصرياً على المنتجات الموجودة فعلياً في القائمة. لا تخترع منتجات غير موجودة.
</product_recommendation_and_purchase>

<disease_explanation_style>
اشرح المرض دائماً من خلال تأثيره المرئي الملموس على النبات، ثم اربط الشرح مباشرة بالمنتج المناسب إن وجد. لا تستخدم مصطلحات علمية معقدة.
</disease_explanation_style>

<symptom_clarity_and_photo_request>
قبل ترشيح أي منتج بناءً على وصف نصي، قيّم مدى وضوحه:
1. وصف كافٍ وواضح لتشخيص مرض واحد بثقة: أكمل التشخيص والترشيح، ويمكنك دعوته لإرسال صورة للتأكد دون أن يؤجل ذلك ردك.
2. وصف غامض يحتمل أكثر من سبب: لا ترشح منتجاً ولا تكتب كود [RECOMMEND_PRODUCT] إطلاقاً. اشرح باختصار أن العلامة قد تدل على أكثر من سبب، واطلب صورة واضحة، ثم أكمل التشخيص فور استلامها.
</symptom_clarity_and_photo_request>

<response_variety>
في كل رد فيه ترشيح منتج، ضمّن دائماً إلزامياً: شرح مبسط للمشكلة، اسم المنتج وشركته (إن وجدت)، تأكيد الأصالة 100%، الجرعة حسب مسارها الصحيح، ودعوة للطلب أو التواصل مع سفير القرية. أنت حر تماماً في الترتيب والصياغة، لكن غيّر الأسلوب في كل مرة لتجنب التكرار الآلي.
</response_variety>

<acknowledging_farmer_answers>
بمجرد أن يجيب الفلاح على أي سؤال طلبت فيه معلومة منه (سواء من سؤالك أنت، أو من نتيجة استدعاء أحد المتخصصين الموضحين في <subagent_orchestration>)، ابدأ ردك التالي دائماً بعبارة إنسانية قصيرة توحي بأنك حفظت المعلومة في ذاكرتك الشخصية، مثل: "خلاص يا حاج، حفظتها في دماغي" أو "تمام، فاكرها كويس". غيّر الصياغة في كل مرة.

يُمنع منعاً باتاً استخدام عبارات معاملاتية أو رسمية (مثل: "هسجل ده ليك" أو "تم تسجيل البيانات")، لأن هذه الصياغة تكسر إحساس الفلاح بأنه يتحدث مع شخص.
</acknowledging_farmer_answers>

<subagent_orchestration>
أنت لا تتعامل مع قاعدة البيانات مباشرة أبداً. بدلاً من ذلك، لديك ثلاثة متخصصين تستدعيهم كأدوات:

1. **activity_subagent** (متزامن، الفلاح مستنٍ رده): استدعِه فوراً عندما يذكر الفلاح أنه قام فعلياً بنشاط زراعي (رش/تسميد/ري/حصاد/عمالة)، أو عندما يريد تسجيل/تعديل/تغيير محصول أرض. أرسل له نص الفلاح الخام كاملاً كما هو، لا تقصّه أو تلخّصه أبداً.

2. **profile_memory_subagent** (غير متزامن، لا ينتظره الفلاح): قبل إرساله، اسأل نفسك سؤالاً ثنائياً بسيطاً: "هل في هذه الرسالة معلومة شخصية أو سلوكية أو معدات/أرض ثابتة تستحق التسجيل؟" لو الإجابة نعم، استدعِه بنص الفلاح الخام في الخلفية دون انتظار نتيجته، وأكمل ردك الحالي بشكل طبيعي فوراً دون أي تأخير أو انتظار.

3. **web_search**: راجع <web_search_guidance>.

**قواعد التعامل مع نتيجة activity_subagent (بعد أن يرجع):**

- \`status: "awaiting_confirmation"\` مع \`confirmation_summary\`: اعرض الملخص بالضبط بالقالب التالي، معبأً من الحقول المرجعة:
  "تمام يا [اسم الفلاح أو يا حاج]، هتسجل لك الآتي:
  - اسم الأرض: [field_name]
  - نوع المحصول: [crop]
  - تاريخ الزراعة: [planting_date بصيغة يوم/شهر/سنة]
  - المساحة: [area]
  ده صح يا حاج؟"
  لا تدّعِ أن التسجيل تم فعلياً في هذه الحالة، فهو لسه لم يُنفَّذ.

- \`status: "incomplete"\` مع \`missing_fields\`: اسأل عن الحقول الناقصة فقط بجملة ودية طبيعية، مستخدماً هذه الأسماء العربية للحقول: field_name="اسم الأرض", crop="نوع المحصول", planting_date="تاريخ الزراعة", area="المساحة", sprayer_count="عدد الرشاشات", product="اسم المنتج اللي رشيته", activity_date="تاريخ النشاط", activity_time="وقت النشاط", outcome_rating="نتيجة النشاط".

- \`status: "ambiguous"\` مع \`ambiguous_matches\`: اسأل الفلاح تحديداً عن أنهي أرض يقصد من القائمة المرجعة، ولا تكمل أي استشارة أو تعليق إضافي قبل إجابته.

- \`status: "complete"\` مع \`operations\` تحتوي \`tool_result\` ناجحة: طبّق <acknowledging_farmer_answers>, واذكر النجاح بدقة تامة بناءً على tool_result فقط. إذا نجح جزء وفشل جزء آخر (في حالة عمليات متعددة)، وضّح ذلك بدقة. يُمنع منعاً باتاً الادعاء بتسجيل أي عملية لم يرجع لها tool_result ناجح صراحة.

- إذا تضمنت نتيجة activity_subagent حقلاً باسم \`agent_note\`: هذه قناة تواصل وملاحظة داخلية أو استفسار أو تنبيه موجه لك من المتخصص لمساعدتك في فهم الموقف، أو توضيح أي مشكلة أو تناقض واجهه في استخراج البيانات. استفد منها في فهم الصورة وتوجيه ردك للفلاح، لكن لا تذكر نص \`agent_note\` الحرفي أو التقني للفلاح.

اجمع استدعاء activity_subagent واستدعاء profile_memory_subagent في نفس الرد الواحد دائماً كلما أمكن (يعملان بالتوازي)، بدلاً من الانتظار وتنفيذهما على التوالي.
</subagent_orchestration>

<pending_activities_prompting>
قد تجد قائمة أنشطة معلقة بأعمدتها الناقصة تحت وسم pending_activities:
${pendingActivitiesContext}

لا تسأل عن الأنشطة المعلقة كجزء من صلب حديثك. أجب أولاً على سؤال الفلاح أو أكمل الحديث الطبيعي كاملاً ومستقلاً، ثم في نهاية ردك فقط، إذا وجدت نشاطاً معلقاً واحداً، اسأل عن كل أعمدته الناقصة معاً في جملة واحدة عابرة وودودة، مثل: "على فكرة يا حاج، الرشة اللي قولتلي عليها، ميهمناش كانت يوم قد إيه بالظبط وفي أنهي وقت من اليوم؟". لا تسأل عن أكثر من نشاط معلق واحد في نفس الرد.

قد يظهر outcome_rating ضمن الأعمدة المطلوبة لبعض الأنشطة بعد مرور مدة كافية؛ في هذه الحالة اسأل عنه بشكل طبيعي ضمن نفس جملة "على فكرة". قبل ظهوره صراحة، لا تسأل عنه استباقياً مطلقاً، واكتفِ بتمريره إذا تطوع الفلاح بذكره (سيلتقطه activity_subagent تلقائياً من نص رسالته).

ممنوع منعاً باتاً ذكر أي activity_id أو أرقام ومعرفات برمجية (UUIDs) في حديثك للفلاح؛ اذكر فقط اسم الأرض أو نوع النشاط بصورة طبيعية وإنسانية.
إذا قال الفلاح صراحة إنه لا يريد الإجابة الآن، لا تسأله عن هذا النشاط مرة أخرى إطلاقاً طوال باقي هذه المحادثة.
</pending_activities_prompting>

<general_rules>
1. حافظ دائماً على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات الهاتف وتوليد الصوت بكفاءة.
2. وجّه المزارع لسفير القرية دائماً عند عدم امتلاكك معلومة بثقة، ولا تخترع إجابة.
3. اجمع دائماً كل استدعاءات المتخصصين (activity_subagent, profile_memory_subagent, web_search) اللازمة في نفس الرد الواحد كلما أمكن، بدلاً من تنفيذها على التوالي عبر عدة جولات.
</general_rules>

<web_search_guidance>
عندما يسأل المزارع عن أسعار السوق الحية اليوم، أو نشرات الطقس، أو معلومات زراعية حية لا تتوفر محلياً، استخدم أداة web_search فوراً.
قم بصياغة الرد النهائي بناءً على نتائج البحث بأسلوبك الودود. لا تكتب روابط الإنترنت يدوياً داخل نص الإجابة، حيث يقوم النظام تلقائياً باستخراج بطاقات المصادر بشكل منفصل.
</web_search_guidance>
`;

    // 6. Build Gemini contents array for Orchestrator
    const contents: ChatMessage[] = [];

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

    const currentUserParts: GeminiPart[] = [{ text: message }];
    if (imageBase64) {
        const rawBase64 = imageBase64.split(",")[1] || imageBase64;
        currentUserParts.push({
            inline_data: { mime_type: "image/jpeg", data: rawBase64 },
        });
    }

    contents.push({
        role: "user",
        parts: currentUserParts,
    });

    async function attemptChat(attemptCount = 0, excludedIds: string[] = []): Promise<NextResponse> {
        if (attemptCount > 5) {
            return NextResponse.json(
                { error: "خدمة الذكاء الاصطناعي مشغولة حالياً، يرجى المحاولة بعد بضع دقائق" },
                { status: 503 }
            );
        }

        let query = (supabaseAdmin as any)
            .from("api_key_models")
            .select("id, model_name, daily_usage, daily_limit, status, thinking_level, api_keys!inner(id, api_key, status, project_name)")
            .eq("status", "active")
            .eq("api_keys.status", "active")
            .eq("api_keys.project_name", "gemini")
            .order("daily_usage", { ascending: true });

        if (excludedIds.length > 0) {
            query = query.not("id", "in", `(${excludedIds.join(",")})`);
        }

        const { data: keyModels, error: keyError } = await query;

        if (keyError || !keyModels || keyModels.length === 0) {
            console.error("[crop-chat] No active API key available in DB:", keyError);
            return NextResponse.json(
                { error: "نظام الذكاء الاصطناعي غير متاح حالياً" },
                { status: 503 }
            );
        }

        // Strictly filter in JS to only allow active Gemini keys with daily_usage < daily_limit
        const validKeys = keyModels.filter(
            (km: any) =>
                km.status === "active" &&
                km.daily_usage < km.daily_limit &&
                km.api_keys?.status === "active" &&
                km.api_keys?.project_name === "gemini" &&
                km.api_keys?.api_key
        );

        if (validKeys.length === 0) {
            console.error("[crop-chat] All active Gemini keys have exceeded their daily limits or none available.");
            return NextResponse.json(
                { error: "نظام الذكاء الاصطناعي غير متاح حالياً (تم تجاوز حد الاستخدام)" },
                { status: 503 }
            );
        }

        // Orchestrator uses non-Gemma keys (Gemini models only)
        const nonGemmaKeys = validKeys.filter(
            (km: any) =>
                km.model_name &&
                !km.model_name.toLowerCase().includes("gemma")
        );
        const primaryValidKeys = nonGemmaKeys.length > 0 ? nonGemmaKeys : validKeys;

        let currentKeyIndex = 0;
        let keyData = primaryValidKeys[currentKeyIndex];
        let modelName = keyData.model_name || "gemini-3.5-flash-lite";
        let geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_keys.api_key}`;

        console.log(`[crop-chat] Orchestrator Attempt ${attemptCount + 1}: Using model ${modelName} on key ${keyData.api_keys.id.slice(0, 6)}...`);

        let accumulatedSources: Array<{ title: string; url: string }> = [];
        const addSourcesFromCandidate = (cand: any, rootData?: any) => {
            const extracted = extractGroundingSources(cand, rootData);
            for (const s of extracted) {
                if (!accumulatedSources.some((existing) => existing.url === s.url)) {
                    accumulatedSources.push(s);
                }
            }
        };

        const requestPayload = {
            contents,
            systemInstruction: {
                parts: [{ text: mainSystemPrompt }],
            },
            tools: [orchestratorToolDeclaration],
            tool_config: {
                function_calling_config: { mode: "AUTO" },
            },
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 5000,
                thinkingConfig: keyData.thinking_level ? {
                    thinkingLevel: keyData.thinking_level.toUpperCase()
                } : undefined,
            },
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);

        let response: Response;
        try {
            response = await fetch(geminiEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestPayload),
                signal: controller.signal,
            });
        } catch (fetchError) {
            clearTimeout(timeout);
            const aborted = fetchError instanceof DOMException && fetchError.name === "AbortError";
            console.error(`[crop-chat] FETCH FAILED | Attempt ${attemptCount + 1} | Error:`, fetchError);
            if (aborted && attemptCount < 5) {
                return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
            }
            return NextResponse.json(
                { error: aborted ? "خدمة الذكاء الاصطناعي لا تستجيب، تأكد من اتصال الإنترنت" : "تعذر الاتصال بخدمة الذكاء الاصطناعي" },
                { status: aborted ? 504 : 502 }
            );
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[crop-chat] API ERROR | HTTP ${response.status} | Key: ${keyData.api_keys.id.slice(0, 6)}... | Model: ${modelName} | Body:`, errorBody);
            if (response.status === 429) {
                await (supabaseAdmin as any).from("api_key_models").update({ status: "rate_limited" }).eq("id", keyData.id);
                return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
            }
            if (response.status === 503) {
                await new Promise((r) => setTimeout(r, 3000));
                return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
            }
            // If the key failed with 400 (invalid key), 404 (model not found), etc., try other available keys if available
            if (attemptCount < 5 && keyModels.length > excludedIds.length + 1) {
                console.warn(`[crop-chat] Retrying with next available Gemini key due to HTTP ${response.status}...`);
                return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
            }
            return NextResponse.json(
                { error: `فشل الاتصال بخدمة الذكاء الاصطناعي (${response.status})`, debug_info: errorBody.slice(0, 200) },
                { status: 502 }
            );
        }

        await (supabaseAdmin as any).from("api_key_models").update({ daily_usage: keyData.daily_usage + 1 }).eq("id", keyData.id);

        const data = await response.json();
        // ── Orchestrator Token Usage ────────────────────────────────────────────
        const orchUsage = data.usageMetadata;
        if (orchUsage) {
            console.log(`[crop-chat] 🔢 [Orchestrator Tokens] model: ${modelName} | prompt: ${orchUsage.promptTokenCount ?? '?'} | output: ${orchUsage.candidatesTokenCount ?? '?'} | total: ${orchUsage.totalTokenCount ?? '?'} | thinking_level: ${keyData.thinking_level || 'none'}`);
        }
        const candidates = data.candidates?.[0];
        addSourcesFromCandidate(candidates, data);
        let currentParts: GeminiPart[] = candidates?.content?.parts ?? [];

        // ── Agentic loop: Orchestrator invoking Sub-Agents ─────────────────────
        let agentContents: ChatMessage[] = [...contents];
        let loopCount = 0;
        const MAX_TOOL_ROUNDS = 5;

        while (loopCount < MAX_TOOL_ROUNDS) {
            loopCount++;
            const functionCallParts = currentParts.filter((p) => p.functionCall);

            if (functionCallParts.length === 0) break;

            console.log(`[crop-chat] 🛠️ [Orchestrator Round ${loopCount}] Calls:`, functionCallParts.map(p => p.functionCall?.name));

            const functionResponseParts: GeminiPart[] = [];
            const parallelTasks: Promise<void>[] = [];

            for (const callPart of functionCallParts) {
                const { name, args } = callPart.functionCall!;

                if (name === "profile_memory_subagent") {
                    // Fire-and-forget background execution
                    const rawFarmerText = args?.raw_farmer_text || message;
                    executeProfileMemorySubagent(
                        rawFarmerText,
                        farmerProfile,
                        existingMemoryCategories,
                        activeFieldsContext,
                        userId,
                        supabaseAdmin,
                        keyData.api_keys.api_key,
                        keyModels
                    ).catch((err) => console.error("[crop-chat] Unhandled error in executeProfileMemorySubagent:", err));

                    functionResponseParts.push({
                        functionResponse: {
                            name: "profile_memory_subagent",
                            response: { status: "queued", message: "تم إطلاق استخراج البروفايل والذاكرة في الخلفية بنجاح." }
                        }
                    });
                } else if (name === "activity_subagent") {
                    const rawFarmerText = args?.raw_farmer_text || message;
                    parallelTasks.push(
                        (async () => {
                            const subResult = await executeActivitySubagent(
                                rawFarmerText,
                                {
                                    activeFieldsContext,
                                    pendingActivitiesContext,
                                    productsContext,
                                    activeFields
                                },
                                sessionPendingOp,
                                lastTurn,
                                userId,
                                supabaseAdmin,
                                keyData.api_keys.api_key,
                                keyModels,
                                nowCairo
                            );

                            functionResponseParts.push({
                                functionResponse: {
                                    name: "activity_subagent",
                                    response: subResult
                                }
                            });
                        })()
                    );
                } else if (name === "web_search") {
                    const searchQuery = args?.query || message;
                    parallelTasks.push(
                        (async () => {
                            const searchRes = await executeGemmaSearch(
                                searchQuery,
                                keyData.api_keys.api_key,
                                keyModels,
                                supabaseAdmin
                            );

                            if (searchRes.sources && searchRes.sources.length > 0) {
                                for (const s of searchRes.sources) {
                                    if (!accumulatedSources.some((existing) => existing.url === s.url)) {
                                        accumulatedSources.push(s);
                                    }
                                }
                            }

                            functionResponseParts.push({
                                functionResponse: {
                                    name: "web_search",
                                    response: {
                                        status: searchRes.success ? "success" : "error",
                                        query: searchQuery,
                                        search_result: searchRes.resultText,
                                        sources: searchRes.sources,
                                    }
                                }
                            });
                        })()
                    );
                }
            }

            if (parallelTasks.length > 0) {
                await Promise.all(parallelTasks);
            }

            const cleanModelParts = currentParts.filter((p: any) => !p.thought);
            agentContents = [
                ...agentContents,
                { role: "model", parts: cleanModelParts.length > 0 ? cleanModelParts : currentParts },
                { role: "user", parts: functionResponseParts },
            ];

            const followUpPayload = {
                contents: agentContents,
                systemInstruction: {
                    parts: [{ text: mainSystemPrompt }],
                },
                tools: [orchestratorToolDeclaration],
                tool_config: {
                    function_calling_config: { mode: "AUTO" },
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 5000,
                    thinkingConfig: keyData.thinking_level ? {
                        thinkingLevel: keyData.thinking_level.toUpperCase()
                    } : undefined,
                },
            };

            let followUpOk = false;
            for (let retry = 0; retry < 3; retry++) {
                try {
                    followUpPayload.generationConfig.thinkingConfig = keyData.thinking_level ? {
                        thinkingLevel: keyData.thinking_level.toUpperCase()
                    } : undefined;

                    const followUpController = new AbortController();
                    const followUpTimeout = setTimeout(() => followUpController.abort(), 60_000);
                    const followUpRes = await fetch(geminiEndpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(followUpPayload),
                        signal: followUpController.signal,
                    }).finally(() => clearTimeout(followUpTimeout));

                    if (followUpRes.ok) {
                        const followUpData = await followUpRes.json();
                        const cand = followUpData.candidates?.[0];
                        addSourcesFromCandidate(cand, followUpData);
                        currentParts = cand?.content?.parts ?? [];
                        followUpOk = true;
                        break;
                    } else {
                        const errBody = await followUpRes.text();
                        console.error(`[crop-chat] Follow-up HTTP error ${followUpRes.status} (retry ${retry}):`, errBody.slice(0, 200));

                        if (followUpRes.status === 429) {
                            await (supabaseAdmin as any).from("api_key_models").update({ status: "rate_limited" }).eq("id", keyData.id);
                            if (currentKeyIndex + 1 < validKeys.length) {
                                currentKeyIndex++;
                                keyData = validKeys[currentKeyIndex];
                                modelName = keyData.model_name || "gemini-2.0-flash";
                                geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_keys.api_key}`;
                            }
                            await new Promise((r) => setTimeout(r, 1500 * (retry + 1)));
                        } else if (followUpRes.status === 503) {
                            await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
                        }
                    }
                } catch (followUpErr) {
                    console.error(`[crop-chat] Follow-up request failed (retry ${retry}):`, followUpErr);
                }
            }

            if (!followUpOk) {
                return NextResponse.json({
                    success: true,
                    text: "تمام يا حاج، فهمت كلامك وحفظته عندي.",
                    sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
                });
            }

            const roundText = currentParts
                .filter((p: any) => !p.thought && p.text)
                .map((p: any) => p.text)
                .join("\n");

            if (roundText) {
                const { cleanText, recommendedProduct } = processResponseText(roundText);
                return NextResponse.json({
                    success: true,
                    text: cleanText,
                    recommendedProduct,
                    sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
                });
            }
        }

        const loopExitText = currentParts
            .filter((p: any) => !p.thought && p.text)
            .map((p: any) => p.text)
            .join("\n");

        if (loopExitText) {
            const { cleanText, recommendedProduct } = processResponseText(loopExitText);
            return NextResponse.json({
                success: true,
                text: cleanText,
                recommendedProduct,
                sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
            });
        }

        return NextResponse.json({
            success: true,
            text: "تمام يا حاج، حفظتها في دماغي كويس. لو احتجت أي تفاصيل تانية أنا معاك.",
            sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
        });
    }

    try {
        return await attemptChat(0);
    } catch (error) {
        console.error("[crop-chat] Unexpected Error:", error);
        return NextResponse.json(
            { error: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى" },
            { status: 500 }
        );
    }
}
