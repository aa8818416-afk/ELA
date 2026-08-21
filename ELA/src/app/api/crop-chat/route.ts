import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";
import { toFeddan, displayArea } from "@/utils/areaConverter";

// ── Dynamic Skills Loader ──────────────────────────────────────────────────────
const SKILLS_CACHE: Record<string, string> = {};

function getSkillContent(skillName: string): string {
    const cleanName = skillName.trim().replace(/\.md$/i, "").replace(/^\/+/, "");
    if (SKILLS_CACHE[cleanName]) {
        console.log(`[crop-chat] 📖 [Skill Loader: CACHE HIT] "${cleanName}" (${SKILLS_CACHE[cleanName].length} chars)`);
        return SKILLS_CACHE[cleanName];
    }
    try {
        const segments = cleanName.split("/");
        const finalPath = path.join(process.cwd(), "src", "skills", ...segments) + ".md";
        
        if (fs.existsSync(finalPath)) {
            const content = fs.readFileSync(finalPath, "utf-8");
            SKILLS_CACHE[cleanName] = content;
            console.log(`[crop-chat] 📖 [Skill Loader: DISK READ] Loaded "${cleanName}.md" (${content.length} chars)`);
            return content;
        }
        console.warn(`[crop-chat] ⚠️ [Skill Loader: NOT FOUND] "${cleanName}" at ${finalPath}`);
        return `المهارة "${cleanName}" غير موجودة. تأكد من كتابة المسار الصحيح للمهارة.`;
    } catch (err: any) {
        console.error(`[crop-chat] ❌ [Skill Loader: ERROR] Reading ${cleanName}:`, err);
        return `تعذر قراءة المهارة: ${err?.message || "خطأ في القراءة"}`;
    }
}

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
            name: "remember_farmer_fact",
            description: "سجّل فوراً ولحظياً حقيقة حرجة أو طلباً صريحاً من الفلاح لحفظ معلومة عنه أو عن مزرعته (مثل: حساسية من مركب معين، قيد زراعي، امتلاك جرار/ماشية، أسلوب تواصل، أو طلب صريح 'افتكر إني...').",
            parameters: {
                type: "OBJECT",
                properties: {
                    category: {
                        type: "STRING",
                        enum: [
                            "farm_constraints",
                            "equipment_inventory",
                            "soil_water_notes",
                            "budget_level",
                            "risk_tolerance",
                            "communication_style",
                            "crop_preference",
                            "trusted_source"
                        ],
                        description: "تصنيف المعلومة أو القيد"
                    },
                    fact: {
                        type: "STRING",
                        description: "نص الحقيقة أو القيد بوضوح وإيجاز"
                    }
                },
                required: ["category", "fact"]
            }
        },
        {
            name: "search_recent_chat_history",
            description: "ابحث في سجل محادثات الأسبوع الماضي (آخر 7 أيام) عندما يسأل الفلاح صراحة عن تفصيلة أو سؤال سابق لم يُذكر في الملخص الحالي.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description: "الكلمة المفتاحية أو الموضوع للبحث في رسائل الأسبوع"
                    },
                    limit: {
                        type: "INTEGER",
                        description: "أقصى عدد من الرسائل المطلوبة (الافتراضي 5)"
                    }
                },
                required: ["query"]
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
        },
        {
            name: "read_skill",
            description: "اقرأ بروتوكول سلوك وتفكير محدد قبل صياغة ردك. استخدمها حصراً لأحد المهارات الإجرائية الأربع: proactive_advisor (الإنذار المسبق والطقس) أو crop_doctor (تشخيص الأمراض خطوة بخطوة) أو land_management (إدارة الأراضي والتسجيل) أو field_activities (تسجيل الأنشطة الزراعية).",
            parameters: {
                type: "OBJECT",
                properties: {
                    skill_name: {
                        type: "STRING",
                        enum: ["proactive_advisor", "crop_doctor", "land_management", "field_activities"],
                        description: "اسم المهارة الإجرائية المطلوبة."
                    }
                },
                required: ["skill_name"]
            }
        },
        {
            name: "read_crop_guide",
            description: "اقرأ الدليل الزراعي الكامل لمحصول معين (أطوار النمو، الري، التسميد، الآفات، القطف، سلسلة التبريد). بالنسبة للمحاصيل ذات العروات المتعددة (البطاطس، الطماطم، الذرة، البصل) حدد المسار مع العروة (مثال: potato/summer أو tomato/winter).",
            parameters: {
                type: "OBJECT",
                properties: {
                    crop_name: {
                        type: "STRING",
                        enum: [
                            "crops/potato/summer", "crops/potato/winter", "crops/potato/nili",
                            "crops/tomato/summer", "crops/tomato/winter", "crops/tomato/nili",
                            "crops/maize/summer", "crops/maize/nili",
                            "crops/onion/winter", "crops/onion/mukawar", "crops/onion/seeds",
                            "wheat", "barley", "rice", "sorghum",
                            "faba_bean", "soybean", "peanut", "common_bean", "peas", "clover",
                            "sugar_beet", "sugar_cane", "sesame", "sunflower", "cotton",
                            "crucifers", "garlic",
                            "sweet_potato", "strawberry", "watermelon", "cantaloupe",
                            "cucumber_squash", "pepper_eggplant",
                            "citrus_orange", "citrus_mandarin_lemon",
                            "mango", "grapes", "olive", "date_palm",
                            "banana", "pomegranate", "fig", "guava",
                            "peach_apricot", "cumin_anise", "hibiscus_fennel", "chamomile_marjoram"
                        ],
                        description: "اسم المحصول المطلوب دليله الزراعي. للمحاصيل ذات العروات حدد المسار بالعروة مثل crops/potato/summer."
                    }
                },
                required: ["crop_name"]
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

    const landSkill = getSkillContent("land_management");
    const fieldActivitiesSkill = getSkillContent("field_activities");

    const activitySubagentPrompt = `<context>
التاريخ والوقت الحالي في مصر: ${nowCairo || "الآن"}
</context>

<role>
أنت مستخرج ومنفّذ بيانات حقلية صارم ومتخصص، لست محادثاً. مهمتك الوحيدة: تحليل مدخلات الفلاح والحقول الممررة إليك في رسالة المستخدم، وتطبيق المهارات الإجرائية المرفقة أدناه لاستخراج البيانات بدقة كاملة، واستدعاء الأداة الصحيحة لتنفيذها فعلياً عند اكتمال الشروط. ناتجك دائماً وفق <output_contract> فقط دون أي كلام جانبي.
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
- حقل \`agent_note\`: قناة تواصل مباشرة ومفتوحة مع الأوركستريتور لكتابة أي ملاحظة داخلية أو تناقض لاحظته لمساعدته في توجيه الحوار. هذا الحقل لا يصل للفلاح.
- لو النص يحتوي أكثر من عملية منفصلة (مثل رشة وعمالة معاً)، أرجعهم جميعاً كعناصر منفصلة في operations.
- ممنوع منعاً باتاً كتابة أي جملة عامية أو موجهة للفلاح في أي حقل؛ كل الحقول بيانات هيكلية بحتة.
</output_contract>

<golden_rule_no_invention>
استخرج فقط ما هو مذكور صراحة أو مستنتج بثقة عالية من سياق واضح. ممنوع منعاً باتاً اختلاق أو افتراض أي قيمة حقل (خصوصاً اسم الأرض) من قيمة حقل آخر (خصوصاً اسم المحصول). لو حقل إلزامي غير مذكور، ضعه في missing_fields بقيمة null في operations، ولا تحاول تخمينه.
</golden_rule_no_invention>

<skill_land_management>
${landSkill}
</skill_land_management>

<skill_field_activities>
${fieldActivitiesSkill}
</skill_field_activities>

<execution_note>
عند اكتمال الشروط لأي عملية (تسجيل، تحديث، أو تنفيذ بعد تأكيد)، استدعِ الأداة المناسبة فعلياً في نفس هذا الاستدعاء، وضع ناتجها الحقيقي في tool_result. لا ترجع status="complete" أبداً بدون tool_result فعلي مطابق.
</execution_note>
`;

    const candidateGeminiKeys = await getCandidateGeminiKeys(primaryApiKey, keyModels, supabaseAdmin);

    const inputPayload = {
        farmer_message: rawFarmerText,
        active_fields: domainContext.activeFieldsContext,
        pending_activities: domainContext.pendingActivitiesContext || "لا توجد أنشطة معلقة",
        products_reference: domainContext.productsContext,
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
                maxOutputTokens: 2000,
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

    const requestStartTime = Date.now();
    console.log(`[crop-chat] 🚀 [New Request] Farmer: ${userId.slice(0,8)}... | Message: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}" | Image: ${imageBase64 ? 'YES' : 'NO'}`);

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

    // 1.5 Handle / Init Chat Session & User Message persistence (7-day rolling window)
    let sessionId: string | null = (body as any).session_id || null;
    try {
        if (!sessionId) {
            const cleanTitle = (message || "استشارة زراعية").trim().slice(0, 35);
            const { data: newSession, error: createSessErr } = await (supabaseAdmin as any)
                .from("chat_sessions")
                .insert({
                    farmer_id: userId,
                    title: cleanTitle || "استشارة زراعية",
                    is_active: true,
                })
                .select("id")
                .single();

            if (createSessErr) {
                console.error("[crop-chat] ⚠️ Error creating new session:", createSessErr);
            }
            sessionId = newSession?.id || null;
        }

        if (sessionId) {
            const { error: insertUserMsgErr } = await (supabaseAdmin as any).from("chat_messages").insert({
                session_id: sessionId,
                farmer_id: userId,
                role: "user",
                content: message,
                image_url: imageBase64 ? "attached_image" : null,
            });
            if (insertUserMsgErr) {
                console.error("[crop-chat] ⚠️ Error logging user message to chat_messages:", insertUserMsgErr);
            }

            await (supabaseAdmin as any).from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
        }
    } catch (sessionInitErr) {
        console.error("[crop-chat] Session init error:", sessionInitErr);
    }

    // 2. Fetch fresh farmer profile, location, active fields, memory, continuous synthesis, and weather
    const [farmerRowRes, farmerFieldsRes, farmerMemoryRes, farmerSynthesisRes, weatherCacheRes] = await Promise.all([
        (supabaseAdmin as any).from("farmers").select("governorate, center, village, farm_profile").eq("profile_id", userId).maybeSingle(),
        (supabaseAdmin as any).from("farmer_fields").select("id, field_name, crop_type, planting_date, area_feddan, area_unit, latitude, longitude, is_active").eq("farmer_id", userId).eq("is_active", true).order("created_at", { ascending: false }),
        (supabaseAdmin as any).from("farmer_memory").select("id, category, fact, confidence").eq("farmer_id", userId).eq("is_active", true).in("confidence", ["high", "medium"]),
        (supabaseAdmin as any).from("farmer_synthesis").select("*").eq("farmer_id", userId),
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

    // Format Continuous Synthesis Context (Master Profile + Topic Syntheses)
    const syntheses = (farmerSynthesisRes.data as any[]) || [];
    const masterSynth = syntheses.find((s: any) => s.area_scope === "general");
    const topicSynths = syntheses.filter((s: any) => s.area_scope !== "general");

    let farmerSynthesisContext = "لا يوجد ملخص تراكمي مسجل حتى الآن.";
    if (masterSynth || topicSynths.length > 0) {
        const sections: string[] = [];
        if (masterSynth) {
            sections.push(`### [الملف العام للفلاح (Master Profile)]
- نشاط المزرعة والمعدات: ${masterSynth.work_context || "غير محدد"}
- أسلوب وشخصية الفلاح: ${masterSynth.personal_context || "غير محدد"}
- ما يشغل باله حالياً (Top of Mind): ${masterSynth.top_of_mind || "غير محدد"}
- المحطات والقرارات التاريخية: ${masterSynth.brief_history || "لا توجد محطات سابقة"}
- ملخص شامل: ${masterSynth.summary_content || ""}`);
        }
        if (topicSynths.length > 0) {
            sections.push(`### [ملخصات الموضوعات والحقول المتخصصة]
${topicSynths.map((t: any) => `- [نطاق: ${t.area_scope}] ${t.title || 'موضوع'}: ${t.summary_content}`).join("\n")}`);
        }
        farmerSynthesisContext = sections.join("\n\n");
    }

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
    
    // Profile-Augmented Memory structuring
    const farmerMemoryCategoriesMap: Record<string, string[]> = {};
    for (const m of farmerMemories) {
        if (!farmerMemoryCategoriesMap[m.category]) farmerMemoryCategoriesMap[m.category] = [];
        farmerMemoryCategoriesMap[m.category].push(m.fact);
    }
    const farmerMemoryContext = Object.keys(farmerMemoryCategoriesMap).length > 0
        ? Object.entries(farmerMemoryCategoriesMap)
            .map(([cat, facts]) => `### [${cat}]\n${facts.map(f => `- ${f}`).join("\n")}`)
            .join("\n\n")
        : "لا توجد ملاحظات سلوكية أو قيود مسجلة حتى الآن.";

    console.log(`[crop-chat] 📊 [Context Snapshot] Farmer: ${userId.slice(0,8)}... | Active Fields: ${activeFields.length} | Memory Facts: ${farmerMemories.length} | Synthesis Sections: ${syntheses.length}`);
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

    const subagentProductsCatalog =
        products
            ?.map((p: any) => `- ${p.name_ar} (id: ${p.id}, مادة فعالة: ${p.active_ingredient || "عام"})`)
            .join("\n") || "لا توجد منتجات مسجلة.";

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
            .replace(/\[(?:default_api:)?(?:activity_subagent|remember_farmer_fact|search_recent_chat_history|web_search|read_skill|read_crop_guide|manage_farmer_field|log_field_activity|update_field_activity)[\s\S]*?\]/gi, "")
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

        const thinkingMatch = rawText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
        if (thinkingMatch) {
            console.log(`[crop-chat] 🧠 [Model Internal Thinking]:\n${thinkingMatch[1].trim().slice(0, 400)}${thinkingMatch[1].length > 400 ? '...' : ''}`);
        }

        if (recommendedProduct) {
            console.log(`[crop-chat] 💊 [Product Recommended] "${recommendedProduct.name_ar}" (ID: ${recommendedProduct.id}) | Price: ${recommendedProduct.price_to_farmer} EGP`);
        }

        return { cleanText, recommendedProduct };
    };

    // 5. Main Orchestrator System Prompt
    const mainSystemPrompt = `<context>
التاريخ والوقت الحالي في مصر: ${nowCairo}
موقع المزارع الجغرافي: ${farmerLocationText}
</context>

<role>
أنت "المرشد الزراعي"، مهندس زراعي مصري خبير يعمل لصالح منصة ELA. أسلوبك ودود ومباشر، تتحدث مع الفلاح كأخ خبير يثق فيه، لا كموظف رسمي. 
مهمتك الأساسية: الإجابة عن تساؤلات الفلاح بدقة، تقديم النصائح الاستباقية بالربط بين الطقس وتنبيهات الأجندة، وترشيح المنتجات المعتمدة من قائمتنا فقط عند الحاجة الفعلية وحساب جرعاتها بدقة رياضية.
أنت **لا تنفّذ عمليات تسجيل البيانات الحقلية بنفسك**. عندما يحتاج الأمر تسجيل نشاط أو أرض، تستعين بـ activity_subagent. وعندما يطلب الفلاح حفظ قيد أو معلومة هامة عنه أو عن مزرعته، تستخدم remember_farmer_fact فوراً.
</role>

<voice_and_language_rules>
قواعد الصياغة والتنسيق وجودة الصوت (Edge TTS):
1. تحدث باللغة العربية الفصحى المعاصرة والمبسطة القريبة من الفلاح المصري.
2. رحب بالمزارع ("أهلاً بك يا أخي" أو "يا حاج") في بداية المحادثة فقط إن لم يكن هناك سجل سابق. في الرسائل التالية، أجب مباشرة دون تكرار الترحيب.
3. الكلمات الممنوعة وبدائلها الإجبارية:
   - "عشان" / "علشان" -> "لأن" أو "لكي" أو "من أجل"
   - "هبسطهالك" -> "سأوضحها لك ببساطة"
   - "كدة" / "كده" -> "كذلك" أو "بهذه الطريقة"
   - "دلوقتي" -> "الآن"
   - "مش" -> "ليس" أو "لا"
   - "هيساعدك" -> "سوف يساعدك"
   - "هينفع" -> "سيكون مفيداً"
   تجنب الكلمات التراثية الثقيلة مثل (حيال، ثمة، لدن، زهاء).
4. وزّع الفواصل (،) والنقاط (.) بدقة بعد كل فكرة مكتملة لضمان التنفس الصوتي الطبيعي لمعلق الصوت.
5. نسّق ردك بماركداون احترافي ومنظم ومريح للعين عند الحاجة:
   - ضع كل عنوان فرعي (## أو ###) في **سطر جديد ومستقل تماماً** (تسبقه مسافة فارغة) مثل:
     
     ## أولاً: الآفات الحشرية
   - ضع كل عنصر قائمة مرقمة (1.) أو نقطية (-) في **سطر مستقل** يبدأ من أول السطر مع تفاصيله مباشرة.
   - استخدم الخط العريض (**اسم المنتج أو الجرعة**) لتمييز النقاط والكميات والتحذيرات الحرجة.
   - قسّم الرد إلى فقرات مريحة تفصل بينها أسطر فارغة لتسهيل القراءة على الشاشة.
   - كود ترشيح المنتجات [RECOMMEND_PRODUCT:product_id] يُكتب في نهاية الرد كالمعتاد.
   (ملاحظة تقنية: المنصة تقوم بتجريد وتنظيف علامات الماركداون والرموز آلياً قبل تمرير النص لمحرك الصوت، لذا نسق واكتب بماركداون بحرية تامة دون أي قلق).
</voice_and_language_rules>

<farmer_profile>
ملف المزرعة الحالي المسجل:
${farmerProfileFormatted}

القيم الافتراضية عند عدم توفر المعلومة:
- سعة الرشاشة: ${DEFAULT_FARM_DEFAULTS.sprayer_capacity}
- مساحة الأرض: ${DEFAULT_FARM_DEFAULTS.land_area}
- طريقة الري: ${DEFAULT_FARM_DEFAULTS.irrigation_type}
</farmer_profile>

<active_fields>
قائمة الأراضي المسجلة حالياً للفلاح:
${activeFieldsContext}
</active_fields>

<regional_weather_context>
حالة الطقس الحالية المسجلة لمنطقة الفلاح:
${weatherSummaryContext}
</regional_weather_context><active_agenda_alerts>
تنبيهات ومخاطر الأجندة اليومية الصادرة لحقول الفلاح:
${openAlertsContext}
</active_agenda_alerts>

<farmer_continuous_synthesis>
الملخص التراكمي المستمر للفلاح والموضوعات (Master & Topic Synthesis):
${farmerSynthesisContext}
</farmer_continuous_synthesis>

<farmer_behavioral_memory>
الملاحظات والحقائق السلوكية والمالية والمحددات المسجلة:
${farmerMemoryContext}

كيف توظف هذه الذاكرة:
- farm_constraints / equipment_inventory: احترم أي قيود صحية أو حساسية من مركبات معينة أو محددات ملوحة، ووظف المعدات المتوفرة لديه.
- budget_level (اقتصادي): ابدأ بالحلول المجدية اقتصادياً والأسمدة والمبيدات الأحادية الموفرة، وقدم البدائل باهظة الثمن كخيار إضافي دون التصريح له بوضعه المالي.
- risk_tolerance: إن كانت منخفضة ركز على الطرق التقليدية المجربة، وإن كانت عالية اقترح حلولاً حديثة.
- communication_style: طابق أسلوبه (موجز ومباشر مقابل شرح وتفصيل).
- ممنوع منعاً باتاً قول "أنا مسجل عندي في ملفك أنك..."؛ وظّف المعلومات بذكاء وسلاسة في نبرتك فقط.
</farmer_behavioral_memory>

<products_database>
قائمة المنتجات المعتمدة لدينا:
${productsContext}
</products_database>

<available_skills_index>
لديك المهارات الإجرائية المتخصصة التالية المتاحة للتحميل الفوري عبر أداة \`read_skill\`:
- \`proactive_advisor\`: إرشادات ربط الطقس ومرحلة نمو المحصول وتنبيهات الأجندة، أمان الرش والري، والتسميد الاقتصادي.
- \`crop_doctor\`: قواعد تشخيص أمراض وآفات المحاصيل، بروتوكول فحص وضوح الأعراض، حساب الجرعات والعبوات رياضياً بالتقريب لأعلى، ومطابقة المنتجات المعتمدة.
- \`land_management\`: القواعد الصارمة لإدارة وتسجيل الأراضي، بروتوكول التأكيد المسبق، وتغيير المحصول.
- \`field_activities\`: قواعد تسجيل الأنشطة الحقلية الفورية وقاعدة الـ 5 أيام لتحديث الأنشطة المعلقة.
- \`crops/potato/winter\`: الدليل الزراعي الشامل للبطاطس العروة الشتوية (أطوار النمو، التبويض وصب الدرنات، الري الحقلي، التسميد، الندوة المتأخرة والمبكرة، الفطام، والمخاطر المركبة).
- \`crops/potato/nili\`: الدليل الزراعي الشامل للبطاطس العروة النيلية/الخريفية (تطهير التقاوي والتخمير، مكافحة الفيروسات والنواقل، الصب الخريفي، ومخاطر الصقيع).
- \`crops/potato/summer\`: الدليل الزراعي الشامل للبطاطس العروة الصيفية/الربيعية (تجزئة التقاوي المستوردة، مكافحة الحفار، التبويض الربيعي، وتفادي لسعة الشمس والتخزين).
- \`crops/tomato/summer\`: الدليل الزراعي الشامل للطماطم العروة الصيفية (المشتل والتقسية، تثبيت الشتلة، التنفيل وتساقط الأزهار، عفن الطرف الزهري وعرق القاع، التوتا أبسلوتا، ولسعة الشمس).
- \`crops/tomato/winter\`: الدليل الزراعي الشامل للطماطم العروة الشتوية والأنفاق (الزراعة بالصعيد والأنفاق، حماية الصقيع والري الاستباقي، الندوة المتأخرة والعفن الرمادي، والتلوين الشتوي).
- \`crops/tomato/nili\`: الدليل الزراعي الشامل للطماطم العروة النيلية/الخريفية (مشتل الصيف وعزل شاش 50 مش، مقاومة فيروس TYLCV، أكاروس الصدأ والتوتا، والتلوين الخريفي الناري).
- \`crops/rice\`: الدليل الزراعي الشامل للأرز الصيفي (المشتل والتلويط، سلفات الزنك وشلل الأرز، منع النترات بالغمر، لفحة الأوراق والرقبة، الديدان الدموية وثاقبة الساق، والفطام).
- \`crops/wheat\`: الدليل الزراعي الشامل للقمح الشتوي (السياسة الصنفية وحظر أصناف بحري، رية المحاياة، الصدأ الأصفر والأصداء، منع الري أثناء الرياح وتفادي الرقاد، الفطام والدراس).
- \`crops/maize/summer\`: الدليل الزراعي الشامل للذرة الشامية العروة الصيفية الرئيسية (الخف نبات واحد، دودة الحشد بالبلعوم، رية المحاياة والترديم، التزهير والحريرة، الذبول المتأخر، والطبقة السوداء).
- \`crops/maize/nili\`: الدليل الزراعي الشامل للذرة الشامية العروة النيلية/الخريفية (معركة دودة الحشد المبكرة، حصاد السيلاج وإخلاء الأرض للقمح، وتجفيف الحبوب بالأجران).
- \`crops/onion/winter\`: الدليل الزراعي الشامل للبصل الفتيل الشتوي (شتلة القلم الرصاص واستبعاد الحنبوط، العفن الأبيض، التربس واللطعة الأرجوانية والمادة الناشرة، صب البصلة ومنع النيتروجين، والتسميط الحقلي).
- \`crops/onion/mukawar\`: الدليل الزراعي الشامل لبصل المقور الشتوي المبكر بالبصيلات (فرز حجم البصيلات 10-16 مم لمنع الحنبوط، التسميد والري السريع بالصعيد، التقليع كبصل أخضر أو جاف سريع وتنبيه عدم التخزين).
- \`crops/onion/seeds\`: الدليل الزراعي الشامل لإنتاج بذور البصل المعتمدة والحبة السوداء (العزل المكاني 1.5-2 كم، الأمهات وتأثير الارتباع، خلايا نحل العسل والمنع القاطع للرش النهاري، وحصاد النورات صباحاً عند تشقق الكبسولات).
- \`crops/faba_bean\`: الدليل الزراعي الشامل للفول البلدي الشتوي (التلقيح بالعقدين والمنع القاطع للنيتروجين، تصويم المحاياة، بروتوكول راوند آب للهالوك 75 سم³، التبقع البني، وسوسة الفول).
- \`crops/cotton\`: الدليل الزراعي الشامل للقطن المصري (الخف على عودين، المحاياة وتعميق الوتد، كبح الهياج بالبيكس، منع النيتروجين بالتزهير، ديدان اللوز القرنفلية والشوكية، الفطام، والجني بأكياس الجوت).
- \`crops/peanut\`: الدليل الزراعي الشامل للفول السوداني الصيفي (نزول الإبر، الجبس الزراعي 500 كجم لمنع البوبس، علاج اصفرار الحديد، منع العزيق بعد الإبر، الفطام والتسميط لمنع سموم الأفلاتوكسين).
- \`crops/sugar_beet\`: الدليل الزراعي الشامل لبنجر السكر (الخف على عود، حظر الآزوت بعد 90 يوماً، رشتان بورون، مكافحة وباء السركسبورا، الفطام الصارم 20-30 يوماً، والتوريد خلال 24-48 ساعة).
- \`crops/soybean\`: الدليل الزراعي الشامل لفول الصويا الصيفي (التلقيح الإلزامي بـ Bradyrhizobium، الزراعة الحراتي، التحميل مع الذرة، منع التعطيش بالتزهير، العفن الفحمي، والدراس بالسرعة الهادئة).
- \`crops/sweet_potato\`: الدليل الزراعي الشامل للبطاطا الحلوة (الشتل بالعُقل الطرفية، حظر الآزوت بعد 60 يوماً، ضخ البوتاسيوم للشكل المغزلي، مكافحة سوسة البطاطا، الفطام، وعلاج التسميط Curing للتصدير).
- \`crops/clover\`: الدليل الزراعي الشامل للبرسيم المصري (المسقاوي والتحريش والفحل، ارتفاع الحش 5-7 سم، منع رعي الندى ضد النفاخ، الحامول، وسوسة الورق، والرباية للتقاوي بنحل العسل).
- \`crops/sugar_cane\`: الدليل الزراعي الشامل لقصب السكر (الغرس الخريفي والربيعي والخلفات، الكسر على الزيرو، حظر الآزوت بعد أغسطس، الفطام الصارم 30-45 يوماً، ومكافحة التفحم والثاقبات).
- \`crops/sorghum\`: الدليل الزراعي الشامل للذرة الرفيعة (حظر رعي البادرات لسمية HCN، الخف على نباتين، منع النيتروجين بعد القناديل، طرد القناديل والتزهير، حماية الطيور، والنقطة السوداء).
- \`crops/sesame\`: الدليل الزراعي الشامل للسمسم (الري بالتبويل وعلى الحامي، الخف على نباتين، منع الآزوت بالتزهير، دودة الكبسول، والتنشير في طوابي هرمية).
- \`crops/barley\`: الدليل الزراعي الشامل للشعير (المطري والمروي والملحي، رية المحاياة، خفض الآزوت لشعير المولت، حظر الري بالرياح، والتبقع الشبكي).
- \`crops/sunflower\`: الدليل الزراعي الشامل لعباد الشمس (التلقيح الإلزامي بخلايا النحل، الخف نبات واحد، منع الآزوت بعد زرار العباد، البورون، وعفن القرص).
- \`crops/garlic\`: الدليل الزراعي الشامل للثوم (سدس 40 والبلدي، التصدير الأخضر والجاف، الكبريت الزراعي، حظر الآزوت بنهاية يناير، الصدأ، والتسميط المظلل).
- \`crops/strawberry\`: الدليل الزراعي الشامل للفراولة (الشتل الفريش والرشاشات، الترويق والملش الفضي، تهوية الأنفاق، الكالسيوم والبوتريتس، والتجميد IQF).
- \`crops/common_bean\`: الدليل الزراعي الشامل للفاصوليا (العروة الخريفية والصيفية، الزراعة الحراتي، معاملة البذور ضد ذبابة الفاصوليا، الصدأ والأنثراكنوز، التبريد بالماء Hydro-cooling، والدراس والتبخير).
- \`crops/peas\`: الدليل الزراعي الشامل للبازلاء والبسلة (الإنبات الأرضي، البياض الدقيقي، بسلة الشوجر سناب والتصدير الفريش، التوريد لمصانع التجميد IQF خلال 4-6 ساعات، والتبخير التخزيني بالفوستوكسين).
- \`crops/watermelon\`: الدليل الزراعي الشامل للبطيخ (عروات الأنفاق والمكشوف، الشتل المطعوم على أصول القرعيات، خلايا النحل، تفريد الثمار، منع القلب الأجوف وتشقق الثمار، لفحة الشمس، وعلامات النضج والفطام).
- \`crops/cantaloupe\`: الدليل الزراعي الشامل للكانتلوب والشمام (عروات الصوب والأنفاق، تطويش القمة النامية، تكوين الشبكة القشرية Netting، منع تشقق الثمار، علامة الانفصال 3/4 Slip، وسلسلة التبريد السريع).
- \`crops/cucumber_squash\`: الدليل الزراعي الشامل للخيار والكوسة (عروات الصوب والأنفاق والمكشوف، التربية الرأسية، العقد البكري وحظر النحل بالصوب vs إلزاميته بالكوسة، الجمع اليومي، والتبريد السريع).
- \`crops/pepper_eggplant\`: الدليل الزراعي الشامل للفلفل والباذنجان (فلفل الألوان بالصوب والمكشوف، الزهرة الملكية Crown Flower، تلوين الثمار، التربس والحلم العريض، عفن الطرف الزهري، وسلسلة التبريد المنضبطة).
- \`crops/crucifers\`: الدليل الزراعي الشامل للصليبيات (الكرنب والقرنبيط والكانولا، الكبريت الزراعي، البورون والمولبدنم، تبييض أقراص القرنبيط Blanching، فراشة ظهر الماس، العفن الأسود، وضم الكانولا بالندى).
- \`crops/citrus_orange\`: الدليل الزراعي الشامل للموالح والبرتقال (فالنسيا الصيفي وأبو سرة، أصول الفولكاماريانا والنارنج، تنظيم ري التزهير ومنع التنفيل، تساقط يونيو، ذبابة الفاكهة، ومحطات التعبئة والتصدير والمعاملة بالتبريد الحجري).
- \`crops/mango\`: الدليل الزراعي الشامل للمانجو (العويس والزبدية والسكري والكيت والنعومي، التقليم بعد الجمع، استئصال التكتل الزهري، غسيل العفن الهبابي، تكييس الثمار، القطف بالعنق وتصفية اللاتكس، والمعاملة بالماء الساخن).
- \`crops/grapes\`: الدليل الزراعي الشامل للعنب (فليم، سوبيريور، إيرلي سويت، كريمسون، ريد جلوب، التكعيبة الإسبانية والجيبل، رش الديرمكس، معاملات الجبريلين الثلاث، التحليق، شيتات SO2، وسلسلة التبريد).
- \`crops/olive\`: الدليل الزراعي الشامل للزيتون (منزانيللو، كلاماتا، عجيزي، بيكوال، كوروناكي، مراقي، كسر المعاومة، التلقيح الريحي، بسيلا وعثة الزيتون، ذبابة الثمار، الجمع بالحلب، والعصر البارد خلال 24 ساعة).
- \`crops/date_palm\`: الدليل الزراعي الشامل لنخيل البلح والتمور (المجدول، البارحي، السيوي، الزغلول، التكريب، التلقيح اليدوي/الآلي، خف وتدلية وتكميم العراجين، سوسة النخيل الحمراء، والتبخير التخزيني).
- \`crops/citrus_mandarin_lemon\`: الدليل الزراعي الشامل لليوسفي والليمون (الموركيت والبلدي والبنزهير والأضاليا، خف ثمار الموركيت لمنع المعاومة، تكنولوجيا تصويم وتعطيش الليمون صيفاً لإنتاج البدري، ذبابة الفاكهة، القطف بالمقص، وسلسلة التبريد).
- \`crops/banana\`: الدليل الزراعي الشامل للموز (الجراند نان والويليامز، زراعة الأنسجة، التوريق، انتخاب خلفة واحدة صيفياً 1 أم + 1 بنت، إزالة القنديل والكف الكاذب، تكميم السباطات بالأكياس الزرقاء، تورد القمة والنيماتودا، وغرف الإنضاج بالإيثيلين).
- \`crops/pomegranate\`: الدليل الزراعي الشامل للرمان (المنفلوطي والواندرفول، التقليم الكأسي، التمييز بين الأزهار الخصبة والعقيمة، تطهير تاج الثمرة من البتلات لمنع دودة الرمان، تفريد الثمار، منع تشقق وانفجار الثمار بتثبيت الري والكالسيوم بورون، تكييس الثمار، والتخزين المبرد CA).
- \`crops/fig\`: الدليل الزراعي الشامل للتين البرشومي (السلطاني والأسود، الزراعة المطرية بالسدود والمروية، محصول البا tyres المبكر والمحصول الرئيسي، منع تشقق وتخمر فتحة العين وذبابة الخل، ذبابة التين السوداء، القطف الحذر بالقفازات، والتبريد السريع).
- \`crops/guava\`: الدليل الزراعي الشامل للجوافة (البلدي المنتخب والبناتي اللابذري، التقليم بتطويش الأفرع، تكنولوجيا إنتاج الجوافة الشتوية المحيّرة بالتصويم، التكييس، ذبابة الفاكهة والخوخ، والقطف الشمعي وسلسلة التبريد).
- \`crops/peach_apricot\`: الدليل الزراعي الشامل للخوخ والمشمش (الفلوريدا برنس والديزرت ريد والكانينو، نافذة التبكير الربيعي، رش الديرمكس، خف الثمار اليدوي الصارم 10-15 سم قبل تصلب النواة، مكافحة ذبابة الخوخ، والتبريد السريع صفر إلى 1°م).
- \`crops/cumin_anise\`: الدليل الزراعي الشامل للكمون والينسون (البلدي المصري، حساسية المياه المطلقة وذبول الكمون، الري بالتبويل على الحامي، تطهير التقاوي، مكافحة المن الحيوية بدون متبقيات، والحصاد بالندى والتنشير الهرمي).
- \`crops/hibiscus_fennel\`: الدليل الزراعي الشامل للكركديه والشمر (الكركديه الأسواني اللوزي والشمر البلدي، حساسية النهار القصير، مكافحة بق الكركديه، تفصيص الكؤوس بمفصصة الكركديه، والتجفيف المظلل لحفظ الأنثوسيانين، وحصاد الشمر بالندى).
- \`crops/chamomile_marjoram\`: الدليل الزراعي الشامل للبابونج الألماني والبردقوش (الشاموميل المصري والزيت الأزرق الكامازولين، دورات القطف كل 7-10 أيام بالمشط بدون أعناق، حشات البردقوش المتتابعة، المعايير العضوية التصديرية، والتجفيف المظلل).

قواعد تشغيلية للأدوات:
1. عندما يسأل الفلاح سؤالاً تقنياً أو تشخيصياً يخص محصولاً معيناً (الأمراض، التسميد، الري، الجرعات، القطف...)، استدعِ أداة \`read_crop_guide\` باسم المحصول الإنجليزي المختصر (مثال: wheat, guava, tomato) لقراءة الدليل الزراعي الكامل قبل الرد.
2. عندما تحتاج تطبيق بروتوكول سلوكي محدد (الإنذار المسبق، تشخيص الأمراض، إدارة الأراضي، تسجيل الأنشطة)، استدعِ أداة \`read_skill\` باسم المهارة المناسبة.
3. يمكنك استدعاء كلتا الأداتين معاً في نفس الوقت عند الحاجة (مثلاً: read_crop_guide للمعرفة + read_skill لبروتوكول التشخيص).
4. صِغ ردك النهائي دائماً داخل <answer> بعد قراءة الأدلة.
</available_skills_index>

<subagent_orchestration>
أنت تستعين بمتخصصين وأدوات مساعدة:
1. **read_crop_guide**: استدعِها لتحميل الدليل الزراعي الكامل لأي محصول عند أي سؤال تقني أو تشخيصي.
2. **read_skill**: استدعِها لتحميل بروتوكول سلوك وتفكير محدد (proactive_advisor, crop_doctor, land_management, field_activities).
3. **activity_subagent**: استدعِه فوراً بنص الفلاح الخام عند ذكر نشاط وقع فعلياً (رش/تسميد/ري/حصاد/عمالة) أو عند طلب تسجيل/تعديل أرض.
4. **remember_farmer_fact**: استدعِها فوراً ولحظياً لتسجيل أي طلب صريح ("افتكر كذا") أو حقيقة حرجة (حساسية من مركب، امتلاك جرار/معدات، قيد زراعي).
5. **search_recent_chat_history**: استدعِها للبحث في رسائل الأسبوع الماضي إذا سأل الفلاح عن تفصيلة سابقة غير مذكورة في الملخص.
6. **web_search**: استدعِه للبحث عن أسعار السوق اليومية أو الأخبار الحية.

قواعد التعامل مع نتيجة activity_subagent:
- \`awaiting_confirmation\`: اعرض ملخص البيانات بقالب ودود واطلب تأكيد الفلاح دون الادعاء بأن التسجيل تم.
- \`incomplete\`: اسأل عن الحقول الناقصة بأسلوب طبيعي ودود.
- \`ambiguous\`: اسأل الفلاح لتحديد أي أرض يقصد من القائمة المرجعة.
- \`complete\`: أكد للفلاح الحفظ بعبارة إنسانية طبيعية ("خلاص يا حاج، حفظتها عندي").
</subagent_orchestration>

<pending_activities_prompting>
قائمة الأنشطة المعلقة:
${pendingActivitiesContext}
إذا وجدت نشاطاً معلقاً، اسأل عن تفاصيله الناقصة في نهاية ردك بجملة عابرة ("على فكرة يا حاج..."). لا تسأل عن أكثر من نشاط واحد في نفس الرد، وممنوع ذكر أي أرقام UUID.
</pending_activities_prompting>
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

                if (name === "remember_farmer_fact") {
                    const category = args?.category || "general_notes";
                    const fact = args?.fact;
                    const confidence = args?.confidence_level || "high";
                    const supersedesFact = args?.supersedes_fact;

                    if (fact) {
                        parallelTasks.push(
                            (async () => {
                                try {
                                    if (supersedesFact) {
                                        await (supabaseAdmin as any)
                                            .from("farmer_memory")
                                            .update({ is_active: false })
                                            .eq("farmer_id", userId)
                                            .eq("is_active", true)
                                            .ilike("fact", `%${supersedesFact.slice(0, 20)}%`);
                                    }

                                    const { data: inserted, error: insErr } = await (supabaseAdmin as any)
                                        .from("farmer_memory")
                                        .insert({
                                            farmer_id: userId,
                                            category,
                                            fact,
                                            confidence,
                                            source: "chat_explicit",
                                            is_active: true
                                        })
                                        .select("id")
                                        .maybeSingle();

                                    const savedId = inserted?.id || (insErr ? 'err' : 'ok');

                                    if (insErr) {
                                        console.error("[crop-chat] ❌ Error saving memory fact:", insErr);
                                    }

                                    console.log(`[crop-chat] 💾 [Explicit Fact Saved] Category: ${category} | Fact: "${fact}" | ID: ${savedId}`);

                                    functionResponseParts.push({
                                        functionResponse: {
                                            name: "remember_farmer_fact",
                                            response: {
                                                status: insErr ? "error" : "success",
                                                message: insErr ? "فشل حفظ الملاحظة" : "تم حفظ الملاحظة في الذاكرة بنجاح.",
                                                category,
                                                fact
                                            }
                                        }
                                    });
                                } catch (factErr) {
                                    console.error("[crop-chat] Error saving remember_farmer_fact:", factErr);
                                    functionResponseParts.push({
                                        functionResponse: {
                                            name: "remember_farmer_fact",
                                            response: { status: "error", message: "حدث خطأ أثناء حفظ الذاكرة" }
                                        }
                                    });
                                }
                            })()
                        );
                    }
                } else if (name === "search_recent_chat_history") {
                    const queryText = args?.query_or_topic || "";
                    const maxTurns = args?.max_results || 5;

                    parallelTasks.push(
                        (async () => {
                            try {
                                const sevenDaysAgo = new Date();
                                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

                                let queryBuilder = (supabaseAdmin as any)
                                    .from("chat_messages")
                                    .select("role, content, created_at")
                                    .eq("farmer_id", userId)
                                    .gte("created_at", sevenDaysAgo.toISOString())
                                    .order("created_at", { ascending: false })
                                    .limit(maxTurns * 2);

                                if (queryText && queryText.trim().length > 2) {
                                    queryBuilder = queryBuilder.ilike("content", `%${queryText.trim()}%`);
                                }

                                const { data: messages, error: searchErr } = await queryBuilder;

                                console.log(`[crop-chat] 🔍 [Chat History Search] Query: "${queryText}" | Results Found: ${messages?.length || 0}`);

                                const formattedMatches = messages?.map((m: any) => ({
                                    sender: m.role === "user" ? "الفلاح" : "المرشد الزراعي",
                                    message: m.content,
                                    time: new Date(m.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })
                                })) || [];

                                functionResponseParts.push({
                                    functionResponse: {
                                        name: "search_recent_chat_history",
                                        response: {
                                            status: searchErr ? "error" : "success",
                                            query: queryText,
                                            matches_count: formattedMatches.length,
                                            results: formattedMatches
                                        }
                                    }
                                });
                            } catch (historyErr) {
                                console.error("[crop-chat] Error in search_recent_chat_history:", historyErr);
                                functionResponseParts.push({
                                    functionResponse: {
                                        name: "search_recent_chat_history",
                                        response: { status: "error", results: [] }
                                    }
                                });
                            }
                        })()
                    );
                } else if (name === "activity_subagent") {
                    const rawFarmerText = args?.raw_farmer_text || message;
                    parallelTasks.push(
                        (async () => {
                            const subResult = await executeActivitySubagent(
                                rawFarmerText,
                                {
                                    activeFieldsContext,
                                    pendingActivitiesContext,
                                    productsContext: subagentProductsCatalog,
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
                } else if (name === "read_skill") {
                    const skillName = args?.skill_name || "proactive_advisor";
                    console.log(`[crop-chat] 🧠 [Skill Protocol] Loading behavioral skill: "${skillName}"...`);
                    const skillContent = getSkillContent(skillName);
                    functionResponseParts.push({
                        functionResponse: {
                            name: "read_skill",
                            response: {
                                skill_name: skillName,
                                content: skillContent
                            }
                        }
                    });
                } else if (name === "read_crop_guide") {
                    let cropName = args?.crop_name || "wheat";
                    // Normalize and smart fallback for multi-season crops
                    cropName = cropName.replace(/^crops\//i, "").trim();
                    if (cropName === "potato") cropName = "potato/summer";
                    else if (cropName === "tomato") cropName = "tomato/summer";
                    else if (cropName === "maize") cropName = "maize/summer";
                    else if (cropName === "onion") cropName = "onion/winter";

                    const skillPath = `crops/${cropName}`;
                    console.log(`[crop-chat] 📖 [Crop Guide] Loading crop knowledge file: "${skillPath}"...`);
                    const cropContent = getSkillContent(skillPath);
                    functionResponseParts.push({
                        functionResponse: {
                            name: "read_crop_guide",
                            response: {
                                crop_name: cropName,
                                content: cropContent
                            }
                        }
                    });
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

            const sendModelResponse = async (finalCleanText: string, recProduct: any = null) => {
                if (finalCleanText && sessionId) {
                    try {
                        await (supabaseAdmin as any).from("chat_messages").insert({
                            session_id: sessionId,
                            farmer_id: userId,
                            role: "model",
                            content: finalCleanText
                        });
                    } catch (mErr) {
                        console.error("[crop-chat] Error saving model response:", mErr);
                    }
                }
                return NextResponse.json({
                    success: true,
                    text: finalCleanText,
                    recommendedProduct: recProduct,
                    session_id: sessionId,
                    sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
                });
            };

            if (!followUpOk) {
                return sendModelResponse("تمام يا حاج، فهمت كلامك وحفظته عندي.");
            }

            const roundText = currentParts
                .filter((p: any) => !p.thought && p.text)
                .map((p: any) => p.text)
                .join("\n");

            if (roundText) {
                const { cleanText, recommendedProduct } = processResponseText(roundText);
                const totalElapsed = Date.now() - requestStartTime;
                console.log(`[crop-chat] 🏁 [Pipeline Summary] Duration: ${totalElapsed}ms | Tool Rounds: ${loopCount} | Output: ${cleanText.length} chars | Product: ${recommendedProduct?.name_ar || 'None'} | Sources: ${accumulatedSources.length}`);
                return sendModelResponse(cleanText, recommendedProduct);
            }
        }

        const sendModelResponse = async (finalCleanText: string, recProduct: any = null) => {
            if (finalCleanText && sessionId) {
                try {
                    await (supabaseAdmin as any).from("chat_messages").insert({
                        session_id: sessionId,
                        farmer_id: userId,
                        role: "model",
                        content: finalCleanText
                    });
                } catch (mErr) {
                    console.error("[crop-chat] Error saving model response:", mErr);
                }
            }
            return NextResponse.json({
                success: true,
                text: finalCleanText,
                recommendedProduct: recProduct,
                session_id: sessionId,
                sources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
            });
        };

        const loopExitText = currentParts
            .filter((p: any) => !p.thought && p.text)
            .map((p: any) => p.text)
            .join("\n");

        if (loopExitText) {
            const { cleanText, recommendedProduct } = processResponseText(loopExitText);
            const totalElapsed = Date.now() - requestStartTime;
            console.log(`[crop-chat] 🏁 [Pipeline Summary] Duration: ${totalElapsed}ms | Tool Rounds: ${loopCount} | Output: ${cleanText.length} chars | Product: ${recommendedProduct?.name_ar || 'None'} | Sources: ${accumulatedSources.length}`);
            return sendModelResponse(cleanText, recommendedProduct);
        }

        const totalElapsed = Date.now() - requestStartTime;
        console.log(`[crop-chat] 🏁 [Pipeline Summary: Fallback] Duration: ${totalElapsed}ms | Tool Rounds: ${loopCount}`);
        return sendModelResponse("تمام يا حاج، حفظتها في دماغي كويس. لو احتجت أي تفاصيل تانية أنا معاك.");
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

// ── GET /api/crop-chat: Fetch 7-Day Sessions & Messages ─────────────────────────
export async function GET(request: Request) {
    const supabase = await createServerClient();
    const {
        data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
        return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        return NextResponse.json({ error: "مفتاح الخدمة مفقود" }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
    );

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const requestedSessionId = searchParams.get("session_id");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 1. Fetch list of sessions
    if (action === "sessions") {
        const { data: sessions, error: sessErr } = await (supabaseAdmin as any)
            .from("chat_sessions")
            .select("id, title, is_active, created_at, updated_at")
            .eq("farmer_id", currentUser.id)
            .eq("is_active", true)
            .gte("updated_at", sevenDaysAgo.toISOString())
            .order("updated_at", { ascending: false });

        if (sessErr) {
            console.error("[crop-chat] GET sessions error:", sessErr);
            return NextResponse.json({ sessions: [] });
        }

        return NextResponse.json({ sessions: sessions || [] });
    }

    // 2. Fetch messages for a specific session or recent 7-day messages
    let queryBuilder = (supabaseAdmin as any)
        .from("chat_messages")
        .select("id, session_id, role, content, image_url, created_at")
        .eq("farmer_id", currentUser.id)
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

    if (requestedSessionId) {
        queryBuilder = queryBuilder.eq("session_id", requestedSessionId);
    }

    const { data: messages, error } = await queryBuilder;

    if (error) {
        console.error("[crop-chat] GET history error:", error);
        return NextResponse.json({ messages: [], session_id: requestedSessionId });
    }

    return NextResponse.json({
        session_id: requestedSessionId,
        messages: (messages || []).map((m: any) => ({
            id: m.id,
            session_id: m.session_id,
            role: m.role,
            content: m.content,
            imageBase64: m.image_url === "attached_image" ? undefined : m.image_url,
            created_at: m.created_at
        }))
    });
}

// ── DELETE /api/crop-chat: Delete / Archive a Session ──────────────────────────
export async function DELETE(request: Request) {
    const supabase = await createServerClient();
    const {
        data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
        return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        return NextResponse.json({ error: "مفتاح الخدمة مفقود" }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
    );

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
        return NextResponse.json({ error: "معرف الجلسة مطلوب" }, { status: 400 });
    }

    const { error } = await (supabaseAdmin as any)
        .from("chat_sessions")
        .update({ is_active: false })
        .eq("id", sessionId)
        .eq("farmer_id", currentUser.id);

    if (error) {
        return NextResponse.json({ error: "فشل حذف المحادثة" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
