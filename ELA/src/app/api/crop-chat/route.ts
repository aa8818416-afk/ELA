import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";

interface GeminiPart {
    text?: string;
    inline_data?: { mime_type: string; data: string };
    functionCall?: {
        name: string;
        args: Record<string, any>;
    };
    functionResponse?: {
        name: string;
        response: Record<string, any>;
    };
}

interface ChatMessage {
    role: "user" | "model" | "function";
    parts: GeminiPart[];
}

interface RequestHistoryItem {
    role: "user" | "model";
    content: string;
    imageBase64?: string; // Optional image specifically attached to this message
}

/**
 * Single Source of Truth for Default Profile Values
 */
export const DEFAULT_FARM_DEFAULTS = {
    sprayer_capacity: "رشاشة ظهرية 20 لتر",
    land_area: "1 فدان",
    irrigation_type: "ري غمر",
};

/**
 * Top 20 Egyptian Crops + General & Other Scope Enum
 */
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

/**
 * Gemini Tool Declaration for Atomic Farmer Profile Updating
 */
const farmProfileToolDeclaration = {
    functionDeclarations: [
        {
            name: "update_farm_profile",
            description: "استخدم هذه الأداة فوراً عندما يؤكد المزارع حقيقة أو معلومة دائمة عن أرضه، معداته، ريه، أو محصوله.",
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
                            sprayer_capacity: { type: "STRING", description: "سعة الرشاشة أو الموتور (مثال: '20 لتر'، '600 لتر')" },
                            land_area: { type: "STRING", description: "مساحة الأرض (مثال: '2 فدان'، '12 قيراط')" },
                            irrigation_type: { type: "STRING", enum: ["تنقيط", "غمر", "رش", "أخرى"], description: "طريقة الري" },
                            seed_variety: { type: "STRING", description: "نوع الصنف أو التقاوي (مثال: 'سدس 12')" },
                            soil_type: { type: "STRING", enum: ["طينية", "رملية", "صفراء", "أخرى"], description: "نوع التربة" },
                            custom_notes: { type: "STRING", description: "أي معلومة إضافية هامة لم تندرج تحت ما سبق" }
                        },
                        description: "قم بملء الحقول التي ذكرها المزارع فقط، واترك الباقي فارغاً."
                    }
                },
                required: ["target_scope", "properties_to_update"]
            }
        }
    ]
};

/**
 * POST /api/crop-chat
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

        const userId = currentUser.id;

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

        // Admin client (service_role) — bypasses RLS so the server can read/update api_keys & profiles.
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

        // 2. Fetch fresh farmer profile on every message request
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: farmerRow } = await (supabaseAdmin as any)
            .from("farmers")
            .select("farm_profile")
            .eq("profile_id", userId)
            .maybeSingle();

        const farmerProfile = (farmerRow?.farm_profile as Record<string, any>) || {};
        const farmerProfileFormatted = Object.keys(farmerProfile).length > 0
            ? JSON.stringify(farmerProfile, null, 2)
            : "لا توجد بيانات مسجلة مسبقاً لمزرعة هذا المزارع.";

        // 3. Fetch all products to inject into the system prompt.
        const { data: products } = await supabase
            .from("products")
            .select("id, name_ar, active_ingredient, price_to_farmer, stock_status, image_url, dose_unit, dose_amount, package_size, package_unit");

        const productsContext =
            products
                ?.map((p: any) => {
                    let line = `- المعرف: ${p.id} | الاسم: ${p.name_ar} | المادة الفعالة: ${p.active_ingredient ?? "غير محددة"} | السعر للمزارع: ${p.price_to_farmer} جنيهاً | متوفر: ${p.stock_status ? "نعم" : "لا"}`;
                    if (p.dose_amount != null && p.dose_unit) {
                        line += ` | الجرعة: ${p.dose_amount} (${p.dose_unit})`;
                    }
                    if (p.package_size != null) {
                        line += ` | حجم العبوة: ${p.package_size}${p.package_unit ? ` ${p.package_unit}` : ""}`;
                    }
                    return line;
                })
                .join("\n") || "لا توجد منتجات متوفرة حالياً في المعرض.";

        // Helper to extract product recommendation tag
        const processResponseText = (rawText: string) => {
            const match = rawText.match(/\[RECOMMEND_PRODUCT:([a-zA-Z0-9_-]+)\]/);
            if (!match) {
                return { cleanText: rawText, recommendedProduct: null };
            }
            const productId = match[1];
            const cleanText = rawText.replace(/\[RECOMMEND_PRODUCT:[a-zA-Z0-9_-]+\]/g, "").trim();
            const matchedProduct = (products as any[])?.find((p: any) => p.id === productId);
            if (!matchedProduct) {
                return { cleanText, recommendedProduct: null };
            }
            return {
                cleanText,
                recommendedProduct: {
                    id: matchedProduct.id,
                    name_ar: matchedProduct.name_ar,
                    price_to_farmer: matchedProduct.price_to_farmer,
                    image_url: matchedProduct.image_url || null,
                    active_ingredient: matchedProduct.active_ingredient || null,
                },
            };
        };

        // 4. Define System Prompt for the AI chat
        const systemPrompt = `أنت مرشد زراعي وخبير ذكي وودود لمساعدة الفلاحين والمزارعين في مصر عبر منصة ELA.
مهمتك هي الإجابة عن تساؤلات المزارع بخصوص المحاصيل، الأمراض، طرق الري والتسميد
ومكافحة الآفات، وترشيح المنتج المناسب من قائمتنا عند الحاجة.

=====================================================
القسم الأول: أسلوب التحدث واللغة (قواعد شاكر - TTS)
=====================================================

هذا القسم أساسي ولا يتغير، لأن ردك سيتحول مباشرة إلى صوت مسموع بصوت المعلق
"شاكر" عبر محرك Edge TTS.

1. تحدث بـ اللغة العربية الفصحى المعاصرة والمبسطة جداً، بأسلوب لبق وودود ومحترم
   بدون إفراط أو تكرار ممل.

2. الترحيب (Welcome Rule): رحب بالمزارع (مثل: "أهلاً بك يا أخي" أو "أهلاً بك يا
   حاج") في بداية المحادثة فقط، إذا كان هذا هو السؤال الأول في الشات ولا يوجد
   سجل محادثة سابق. في الرسائل التالية، اجب مباشرة وبشكل طبيعي دون تكرار عبارات
   الترحيب.

3. قائمة الكلمات الممنوعة تماماً وبدائلها (لتفادي أخطاء نطق قارئ النصوص):
   - كلمة "عشان" أو "علشان" ❌ -> البديل: "لأن" أو "لكي" أو "من أجل"
   - كلمة "هبسطهالك" ❌ -> البديل: "سأوضحها لك ببساطة" أو "سأشرحها لك بتبسيط"
   - كلمة "كدة" أو "كده" ❌ -> البديل: "كذلك" أو "بهذه الطريقة"
   - كلمة "دلوقتي" ❌ -> البديل: "الآن"
   - كلمة "مش" ❌ -> البديل: "ليس" أو "لا" أو "لن"
   - كلمة "هيساعدك" ❌ -> البديل: "سوف يساعدك"
   - كلمة "هينفع" ❌ -> البديل: "سوف يجدي نفعاً" أو "سيكون مفيداً"
   تجنب تماماً أي كلمات عامية أخرى، وتجنب الكلمات الفصحى التراثية الثقيلة مثل
   (حيال، ثمة، لدن، زهاء) ليبقى الأسلوب مفهوماً وقريباً جداً من المزارع.

4. علامات الترقيم: وزّع الفواصل (،) والنقاط (.) بدقة شديدة بعد كل فكرة مكتملة أو
   تفصيل. لا تكتب جملاً طويلة متصلة؛ بل قسّمها بفواصل ونقاط.

5. تجنب تماماً الرموز البرمجية أو تنسيقات الماركداون (مثل ** أو _) والرموز
   التعبيرية (Emojis)، ولا تستخدم النقاط أو القوائم المرقمة؛ اجعل النص يتدفق
   كفقرة حوارية مسترسلة.

=====================================================
القسم الثاني: ملف المزارع (Farm Profile)
=====================================================

إليك ملف المزارع الحالي المسجل لدينا: ${farmerProfileFormatted}

القيم الافتراضية عند عدم توفر المعلومة في الملف:
  - سعة الرشاشة الافتراضية: ${DEFAULT_FARM_DEFAULTS.sprayer_capacity}
  - مساحة الأرض الافتراضية: ${DEFAULT_FARM_DEFAULTS.land_area}
  - طريقة الري الافتراضية: ${DEFAULT_FARM_DEFAULTS.irrigation_type}

ملحوظة: بيانات المساحة الخاصة بكل محصول (land_area لكل محصول أو العامة) تُستخدم
فقط في التحليل الداخلي وسياق الحديث العام، ولا تُستخدم تلقائياً في حسبة جرعة
الرش، إلا إذا صرّح المزارع بمساحته الفعلية أثناء سؤاله عن الجرعة (راجع القسم
الثالث).

=====================================================
القسم الثالث: قاعدة بيانات المنتجات وحسبة الجرعة
=====================================================

إليك قاعدة بيانات المنتجات الخاصة بنا (يوصى بها فقط إذا كانت متوفرة أي "متوفر:
نعم"): ${productsContext}

كل منتج في القاعدة يحتوي على الحقول التالية:
  - dose_amount: قيمة الجرعة الموصى بها.
  - dose_unit: وحدة قياس الجرعة، وتكون واحدة من قيمتين فقط: "per_feddan" (لكل
    فدان) أو "per_100L" (لكل 100 لتر ماء).
  - package_size: حجم العبوة بالأرقام فقط.
  - package_unit: وحدة حجم العبوة (مثال: جرام، سم3، لتر).

القاعدة الذهبية: يُمنع منعاً باتاً اختراع أو تخمين قيمة الجرعة أو حجم العبوة أو
وحدة القياس. إذا لم تكن هذه البيانات مسجلة لمنتج معين، لا تقم بأي حساب، وأخبر
المزارع أن الجرعة الدقيقة مكتوبة على عبوة المنتج، ووجهه لسفير القرية للتأكد
منها.

عند ترشيح منتج يحتاج جرعة، اتبع بالضبط أحد المسارين التاليين بحسب dose_unit:

المسار أ - الجرعة "لكل فدان" (per_feddan):
  1. احسب عدد العبوات المطلوبة للفدان الواحد بقسمة dose_amount على
     package_size.
  2. إذا كان الناتج كسراً، قرّب دائماً لأعلى (لا يمكن للمزارع شراء جزء من
     عبوة)، وأخبره بوضوح أن الكمية الزائدة البسيطة ستتبقى معه وتفيده في المرة
     القادمة.
  3. الرد الافتراضي (عندما لا يذكر المزارع مساحته الفعلية): اذكر له الجرعة
     وعدد العبوات اللازمة لفدان واحد فقط، بصيغة واضحة ومباشرة (مثال: الجرعة
     المطلوبة هي كذا للفدان الواحد، وهذا يعادل عبوتين من هذا المنتج).
  4. إذا صرّح المزارع بمساحته الفعلية في سؤاله (مثل: "عندي فدانين" أو "أرضي
     خمسة أفدنة")، اضرب عدد العبوات في عدد الأفدنة المذكور، وأعطه الرقم
     النهائي الإجمالي مباشرة.
  5. لا تستخدم سعة الرشاشة المسجلة في ملف المزارع في هذا الحساب إطلاقاً؛ عدد
     الرشاشات اللازمة يقرره المزارع بنفسه حسب خبرته.

المسار ب - الجرعة "لكل 100 لتر" (per_100L):
  1. لا يوجد أي حساب لعدد العبوات أو علاقة بمساحة الأرض في هذه الحالة، لأن
     الجرعة منسوبة لكمية الماء نفسها.
  2. اذكر فقط للمزارع الجرعة كما هي مسجلة بوضوح (مثال: الجرعة المطلوبة هي كذا
     لكل مائة لتر من الماء)، واترك له تحديد كمية المحلول التي يحتاجها حسب
     مساحته وخبرته.

=====================================================
القسم الرابع: التحديث الصامت لملف المزارع (Stealth Update)
=====================================================

إذا ذكر المزارع معلومة جديدة أو دائمة عن أرضه أو معداته أو ريه أو محصوله،
استخدم أداة update_farm_profile فوراً وفي الخلفية، دون أي تردد. إذا ذكر محصولاً
غير موجود في قائمة الاختيارات، اختر 'other_crop'.

يُمنع منعاً باتاً إخبار المزارع بأنك قمت بتحديث بياناته، أو أنك ستفترض هذه
المعلومة في المرات القادمة، أو استخدام أي مصطلح تقني مثل "قاعدة بيانات" أو
"سجلت داتا". فقط استخدم المعلومة الجديدة بشكل طبيعي في ردك الحالي، وامضِ في
الحديث دون الإشارة لعملية الحفظ من قريب أو بعيد.

=====================================================
القسم الخامس: ترشيح المنتج والدعوة للشراء
=====================================================

1. عند ترشيح أي منتج، اذكر اسم الشركة المصنعة له كما هو مسجل في productsContext
   فقط، ولا تخترع اسم شركة غير موجود في البيانات. إذا لم يكن اسم الشركة
   متوفراً، لا تذكره إطلاقاً بدلاً من افتراضه.
2. أكد للمزارع أن المنتج أصلي ومضمون من منصتنا بنسبة 100%.
3. استخدم أداة recommend_product عند ترشيح منتج محدد بشكل صريح، لكي تظهر له
   خيارات "اطلب الآن" أو "عرض المزيد" في الشاشة، وأشر في نهاية كلامك إلى أنه
   يمكنه طلب المنتج مباشرة من هنا واستلامه من الموزع الخاص به.
4. وجّه المزارع للتواصل مع "سفير القرية" (الموزع الخاص به) في الحالات التالية
   فقط: تأكيد الجرعة الدقيقة المكتوبة على العبوة، حجز شحنات للحصول على خصم
   جماعي، أو عدم توفر بيانات كافية لحساب الجرعة كما في القسم الثالث. لا يُذكر
   سفير القرية كخطوة إلزامية ثابتة في كل رد.
5. لا تقم أبداً باختلاق منتجات غير موجودة في القائمة. إذا لم تجد منتجاً
   مناسباً، أخبر المزارع أن يستشير سفير القرية لتوفير العلاج الأنسب.
6. إذا قمت بترشيح منتج متوفر في القائمة، اكتب كود التوصية في نهاية ردك بالطريقة
   التالية تماماً: [RECOMMEND_PRODUCT:product_id] (حيث product_id هو المعرف
   الموضح بجانب اسم المنتج في القائمة أعلاه). لا تضع الكود إلا لمنتج حقيقي
   من القائمة.

=====================================================
القسم السادس: شرح الأمراض بطريقة مفهومة للفلاح
=====================================================

لا تستخدم مصطلحات علمية معقدة عند شرح مرض أو آفة. اشرح المرض من خلال تأثيره
المرئي الملموس على النبات (مثال: يعمل هذا المرض بقعاً بنية اللون على الورقة،
أو يجعل أطراف النبات تصفر وتجف)، بحيث يشعر المزارع أنك تفهم فعلاً ما يحدث في
أرضه، ثم اربط الشرح مباشرة بالمنتج المناسب من قائمتنا إن وجد.

=====================================================
القسم السابع: التنوع والإبداع (بدون فقدان الاكتمال)
=====================================================

أنت لست آلة تكرر نفس الجمل، بل مهندس زراعي بشري يتحدث بتلقائية. في كل رد فيه
ترشيح منتج، يجب أن تتضمن إجابتك العناصر التالية إلزامياً، بينما تكون حراً
تماماً في ترتيبها وصياغتها وأسلوب عرضها من رد لآخر:

  - شرح مبسط ومرئي للمرض أو المشكلة (القسم السادس).
  - اسم المنتج المناسب وشركته المصنعة (إن وجدت في البيانات).
  - تأكيد أن المنتج أصلي ومضمون 100% من المنصة.
  - الجرعة موصوفة حسب مسارها الصحيح (أ أو ب) من القسم الثالث.
  - دعوة لطلب المنتج مباشرة أو التواصل مع سفير القرية حسب الحالة (القسم
    الخامس).

غيّر في كل مرة: صياغة الجمل، وطريقة عرض المنتج، وأسلوب ختام الحديث، واستخدم
مرادفات مختلفة، لكن تأكد دائماً أن كل العناصر الإلزامية أعلاه موجودة قبل إرسال
الرد.

=====================================================
القسم الثامن: قواعد عامة
=====================================================

1. حافظ على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات
   الهاتف المحمول وتوليد الصوت بكفاءة وسرعة.
2. إذا سُئلت عن معلومة لا تملكها بثقة (سواء عن جرعة، أو مرض، أو منتج)، لا
   تخترع إجابة؛ وجّه المزارع لسفير القرية بدلاً من التخمين.
`;

        // 5. Build Gemini contents array preserving original images at their correct turns
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

        contents.push({
            role: "user",
            parts: currentUserParts,
        });

        // 6. Recursive Key Rotation with Tool Support
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

            const requestPayload = {
                contents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                tools: [farmProfileToolDeclaration],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024,
                },
            };

            const controller = new AbortController();
            const timeoutMs = 60_000;
            const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

            // Increment usage
            await (supabaseAdmin as any)
                .from("api_key_models")
                .update({ daily_usage: keyData.daily_usage + 1 })
                .eq("id", keyData.id);

            const data = await response.json();
            const candidates = data.candidates?.[0];
            const candidateParts: GeminiPart[] = candidates?.content?.parts ?? [];

            // Check if Gemini invoked functionCall
            const functionCallPart = candidateParts.find((p) => p.functionCall);

            if (functionCallPart && functionCallPart.functionCall) {
                const { name, args } = functionCallPart.functionCall;
                console.log(`[crop-chat] Gemini called tool ${name} with args:`, args);

                if (name === "update_farm_profile") {
                    const { target_scope, properties_to_update } = args;

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

                        if (rpcError) {
                            console.error("[crop-chat] RPC merge_farm_profile failed:", rpcError);
                        } else {
                            console.log(`[crop-chat] Successfully merged farm profile for farmer ${userId} under scope '${target_scope}'`);
                        }
                    }

                    // Append tool invocation and tool response to contents for second turn
                    const updatedContents: ChatMessage[] = [
                        ...contents,
                        {
                            role: "model",
                            parts: candidateParts,
                        },
                        {
                            role: "function",
                            parts: [
                                {
                                    functionResponse: {
                                        name: "update_farm_profile",
                                        response: {
                                            name: "update_farm_profile",
                                            content: {
                                                status: "success",
                                                message: "تم دمج وتحديث البيانات بنجاح في كشكول المزارع."
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    ];

                    // Issue follow-up request to get Gemini's natural text output
                    const followUpPayload = {
                        contents: updatedContents,
                        systemInstruction: {
                            parts: [{ text: systemPrompt }],
                        },
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 1024,
                        },
                    };

                    try {
                        const followUpRes = await fetch(geminiEndpoint, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(followUpPayload),
                        });

                        if (followUpRes.ok) {
                            const followUpData = await followUpRes.json();
                            const followUpParts = followUpData.candidates?.[0]?.content?.parts ?? [];
                            const finalFollowUpText = followUpParts.find((p: any) => !p.thought && p.text)?.text;

                            if (finalFollowUpText) {
                                const { cleanText, recommendedProduct } = processResponseText(finalFollowUpText);
                                return NextResponse.json({
                                    success: true,
                                    text: cleanText,
                                    recommendedProduct,
                                });
                            }
                        }
                    } catch (followUpErr) {
                        console.error("[crop-chat] Follow up request failed after tool execution:", followUpErr);
                    }
                }
            }

            // Standard text response (when no function call or fallback)
            const resultText = candidateParts.find((p: any) => !p.thought && p.text)?.text;

            if (!resultText) {
                console.error("[crop-chat] Gemini returned no text content:", data);
                return NextResponse.json(
                    { error: "لم يتمكن النظام من فهم الرسالة، يرجى المحاولة مرة أخرى" },
                    { status: 422 }
                );
            }

            const { cleanText, recommendedProduct } = processResponseText(resultText);

            return NextResponse.json({
                success: true,
                text: cleanText,
                recommendedProduct,
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
