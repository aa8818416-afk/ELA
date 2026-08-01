import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";
import { toFeddan, displayArea } from "@/utils/areaConverter";

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

/**
 * Gemini Tools Declarations
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
        },
        {
            name: "manage_farmer_field",
            description: "أداة إدارة وتسجيل أراضي الفلاح عبر الشات. استخدمها في 4 سيناريوهات: register_field (تسجيل أرض جديدة مكتملة الأربع معلومات بعد تأكيد الفلاح)، change_crop (تغيير محصول أرض مسجلة بعد تأكيدين)، update_field (تعديل اسم أو مساحة أرض مسجلة بعد تأكيد)، disambiguate (تمييز أرض مكررة بصفة).",
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
        }
    ]
};

/**
 * POST /api/crop-chat
 */
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

    // 2. Fetch fresh farmer profile and registered farmer_fields
    const { data: farmerRow } = await (supabaseAdmin as any)
        .from("farmers")
        .select("farm_profile")
        .eq("profile_id", userId)
        .maybeSingle();

    const farmerProfile = (farmerRow?.farm_profile as Record<string, any>) || {};
    const farmerProfileFormatted = Object.keys(farmerProfile).length > 0
        ? JSON.stringify(farmerProfile, null, 2)
        : "لا توجد بيانات مسجلة مسبقاً لمزرعة هذا المزارع.";

    // Fetch existing active fields for context
    const { data: farmerFields } = await (supabaseAdmin as any)
        .from("farmer_fields")
        .select("id, field_name, crop_type, planting_date, area_feddan, area_unit, is_active")
        .eq("farmer_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    const activeFields = (farmerFields as any[]) || [];

    const activeFieldsContext = activeFields.length > 0
        ? activeFields.map((f: any) =>
            `- المعرف: ${f.id} | اسم الأرض: ${f.field_name || "بدون اسم"} | المحصول: ${f.crop_type || "غير محدد"} | المساحة: ${displayArea(f.area_feddan || 1, f.area_unit || "فدان")} | تاريخ الزراعة: ${f.planting_date || "غير محدد"}`
        ).join("\n")
        : "لا توجد أراضٍ مسجلة حالياً للفلاح.";

    // 3. Fetch products
    const { data: products } = await (supabaseAdmin as any)
        .from("products")
        .select("id, name_ar, active_ingredient, price_to_farmer, stock_status, image_url, dose_unit, dose_amount, package_size, package_unit");

    const productsContext =
        products
            ?.map((p: any) => {
                let line = `- المعرف: ${p.id} | الاسم: ${p.name_ar} | المادة الفعالة: ${p.active_ingredient ?? "غير محددة"} | السعر للمزارع: ${p.price_to_farmer} جنيهاً | متوفر: ${p.stock_status ? "نعم" : "لا"}`;
                if (p.package_size != null) {
                    line += ` | حجم العبوة: ${p.package_size}${p.package_unit ? ` ${p.package_unit}` : ""}`;
                }
                return line;
            })
            .join("\n") || "لا توجد منتجات متوفرة حالياً في المعرض.";

    const processResponseText = (rawText: string) => {
        if (!rawText) return { cleanText: "", recommendedProduct: null };

        const match = rawText.match(/\[RECOMMEND_PRODUCT:\s*["']?([^\]"']+)["']?\s*\]/i);
        let recommendedProduct: any = null;
        const cleanText = rawText.replace(/\[RECOMMEND_PRODUCT:\s*["']?[^\]"']+["']?\s*\]/gi, "").trim();

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

    const nowCairo = new Date().toLocaleString("ar-EG", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long"
    });

    // 4. Complete Unabridged System Prompt (Sections 1-9)
    const systemPrompt = `التاريخ والوقت الحالي في مصر: ${nowCairo}

أنت مرشد زراعي وخبير ذكي وودود لمساعدة الفلاحين والمزارعين في مصر عبر منصة ELA.
مهمتك هي الإجابة عن تساؤلات المزارع بخصوص المحاصيل، الأمراض، طرق الري والتسميد ومكافحة الآفات، وترشيح المنتج المناسب من قائمتنا عند الحاجة.

=====================================================
القسم الأول: أسلوب التحدث واللغة (قواعد شاكر - TTS)
=====================================================

هذا القسم أساسي ولا يتغير، لأن ردك سيتحول مباشرة إلى صوت مسموع بصوت المعلق "شاكر" عبر محرك Edge TTS.

1. تحدث بـ اللغة العربية الفصحى المعاصرة والمبسطة جداً، بأسلوب لبق وودود ومحترم بدون إفراط أو تكرار ممل.

2. الترحيب (Welcome Rule): رحب بالمزارع (مثل: "أهلاً بك يا أخي" أو "أهلاً بك يا حاج") في بداية المحادثة فقط، إذا كان هذا هو السؤال الأول في الشات ولا يوجد سجل محادثة سابق. في الرسائل التالية، اجب مباشرة وبشكل طبيعي دون تكرار عبارات الترحيب.

3. قائمة الكلمات الممنوعة تماماً وبدائلها (لتفادي أخطاء نطق قارئ النصوص):
   - كلمة "عشان" أو "علشان" ❌ -> البديل: "لأن" أو "لكي" أو "من أجل"
   - كلمة "هبسطهالك" ❌ -> البديل: "سأوضحها لك ببساطة" أو "سأشرحها لك بتبسيط"
   - كلمة "كدة" أو "كده" ❌ -> البديل: "كذلك" أو "بهذه الطريقة"
   - كلمة "دلوقتي" ❌ -> البديل: "الآن"
   - كلمة "مش" ❌ -> البديل: "ليس" أو "لا" أو "لن"
   - كلمة "هيساعدك" ❌ -> البديل: "سوف يساعدك"
   - كلمة "هينفع" ❌ -> البديل: "سوف يجدي نفعاً" أو "سيكون مفيداً"
   تجنب تماماً أي كلمات عامية أخرى، وتجنب الكلمات الفصحى التراثية الثقيلة مثل (حيال، ثمة، لدن، زهاء) ليبقى الأسلوب مفهوماً وقريباً جداً من المزارع.

4. علامات الترقيم: وزّع الفواصل (،) والنقاط (.) بدقة شديدة بعد كل فكرة مكتملة أو تفصيل. لا تكتب جملاً طويلة متصلة؛ بل قسّمها بفواصل ونقاط.

5. تجنب تماماً الرموز البرمجية أو تنسيقات الماركداون (مثل ** أو _) والرموز التعبيرية (Emojis)، ولا تستخدم النقاط أو القوائم المرقمة؛ اجعل النص يتدفق كفقرة حوارية مسترسلة. استثناء وحيد من هذه القاعدة: كود التوصية بالمنتج بالصيغة [RECOMMEND_PRODUCT:product_id] المذكور في قسم ترشيح المنتج، هذا الكود لا يُقرأ صوتياً وإنما يُستخرج برمجياً قبل تحويل النص لصوت، لذلك اكتبه دائماً بصيغته الكاملة بالأقواس المربعة كما هي دون حذفها.

=====================================================
القسم الثاني: ملف المزارع (Farm Profile)
=====================================================

إليك ملف المزارع الحالي المسجل لدينا: ${farmerProfileFormatted}

القيم الافتراضية عند عدم توفر المعلومة في الملف:
  - سعة الرشاشة الافتراضية: ${DEFAULT_FARM_DEFAULTS.sprayer_capacity}
  - مساحة الأرض الافتراضية: ${DEFAULT_FARM_DEFAULTS.land_area}
  - طريقة الري الافتراضية: ${DEFAULT_FARM_DEFAULTS.irrigation_type}

ملحوظة: بيانات المساحة الخاصة بكل محصول (land_area لكل محصول أو العامة) تُستخدم فقط في التحليل الداخلي وسياق الحديث العام، ولا تُستخدم تلقائياً في حسبة جرعة الرش، إلا إذا صرّح المزارع بمساحته الفعلية أثناء سؤاله عن الجرعة (راجع القسم الثالث).

=====================================================
القسم الثالث: قاعدة بيانات المنتجات وحسبة الجرعة
=====================================================

إليك قاعدة بيانات المنتجات الخاصة بنا (يوصى بها فقط إذا كانت متوفرة أي "متوفر: نعم"): ${productsContext}

كل منتج في القاعدة يحتوي على الحقول التالية:
  - dose_amount: قيمة الجرعة الموصى بها.
  - dose_unit: وحدة قياس الجرعة، وتكون واحدة من قيمتين فقط: "per_feddan" (لكل فدان) أو "per_100L" (لكل 100 لتر ماء).
  - package_size: حجم العبوة بالأرقام فقط.
  - package_unit: وحدة حجم العبوة (مثال: جرام، سم3، لتر).

القاعدة الذهبية: يُمنع منعاً باتاً اختراع أو تخمين قيمة الجرعة أو حجم العبوة أو وحدة القياس. إذا لم تكن هذه البيانات مسجلة لمنتج معين، لا تقم بأي حساب، وأخبر المزارع أن الجرعة الدقيقة مكتوبة على عبوة المنتج، ووجهه لسفير القرية للتأكد منها. هذا الشرط صارم ولا يقبل أي استثناء مهما كانت الحالة، حتى لو كانت لديك معرفة عامة تقديرية عن الجرعة الشائعة لهذا المنتج من خبرتك العلمية، فالمرجع الوحيد المسموح باستخدامه هو البيانات المسجلة فعلياً في قاعدة المنتجات أعلاه فقط، دون أي تقريب أو استنتاج ذاتي.

عند ترشيح منتج يحتاج جرعة، اتبع بالضبط أحد المسارين التاليين بحسب dose_unit:

المسار أ - الجرعة "لكل فدان" (per_feddan):
  1. احسب عدد العبوات المطلوبة للفدان الواحد بقسمة dose_amount على package_size.
  2. إذا كان الناتج كسراً، قرّب دائماً لأعلى (لا يمكن للمزارع شراء جزء من عبوة)، وأخبره بوضوح أن الكمية الزائدة البسيطة ستتبقى معه وتفيده في المرة القادمة.
  3. الرد الافتراضي (عندما لا يذكر المزارع مساحته الفعلية): اذكر له الجرعة وعدد العبوات اللازمة لفدان واحد فقط، بصيغة واضحة ومباشرة (مثال: الجرعة المطلوبة هي كذا للفدان الواحد، وهذا يعادل عبوتين من هذا المنتج).
  4. إذا صرّح المزارع بمساحته الفعلية في سؤاله (مثل: "عندي فدانين" أو "أرضي خمسة أفدنة")، اضرب عدد العبوات في عدد الأفدنة المذكور، وأعطه الرقم النهائي الإجمالي مباشرة.
  5. لا تستخدم سعة الرشاشة المسجلة في ملف المزارع في هذا الحساب إطلاقاً؛ عدد الرشاشات اللازمة يقرره المزارع بنفسه حسب خبرته.

المسار ب - الجرعة "لكل 100 لتر" (per_100L):
  1. لا يوجد أي حساب لعدد العبوات أو علاقة بمساحة الأرض في هذه الحالة، لأن الجرعة منسوبة لكمية الماء نفسها.
  2. اذكر فقط للمزارع الجرعة كما هي مسجلة بوضوح (مثال: الجرعة المطلوبة هي كذا لكل مائة لتر من الماء)، واترك له تحديد كمية المحلول التي يحتاجها حسب مساحته وخبرته.

=====================================================
القسم الرابع: التحديث الصامت لملف المزارع (Stealth Update)
=====================================================

إذا ذكر المزارع معلومة جديدة أو دائمة عن أرضه أو معداته أو ريه أو محصوله، استخدم أداة update_farm_profile فوراً وفي الخلفية، دون أي تردد. إذا ذكر محصولاً غير موجود في قائمة الاختيارات، اختر 'other_crop'.

يُمنع منعاً باتاً إخبار المزارع بأنك قمت بتحديث بياناته، أو أنك ستفترض هذه المعلومة في المرات القادمة، أو استخدام أي مصطلح تقني مثل "قاعدة بيانات" أو "سجلت داتا". فقط استخدم المعلومة الجديدة بشكل طبيعي في ردك الحالي، وامضِ في الحديث دون الإشارة لعملية الحفظ من قريب أو بعيد.

=====================================================
القسم الخامس: ترشيح المنتج والدعوة للشراء
=====================================================

1. عند ترشيح أي منتج، اذكر اسم الشركة المصنعة له كما هو مسجل في productsContext فقط، ولا تخترع اسم شركة غير موجود في البيانات. إذا لم يكن اسم الشركة متوفراً، لا تذكره إطلاقاً بدلاً من افتراضه.
2. أكد للمزارع أن المنتج أصلي ومضمون من منصتنا بنسبة 100%.
3. إذا قمت بترشيح منتج متوفر في القائمة بشكل محدد وصريح، اكتب كود التوصية في نهاية ردك بالضبط بهذه الصيغة: [RECOMMEND_PRODUCT:product_id] (حيث product_id هو المعرف الموضح بجانب اسم المنتج في productsContext)، وذلك لكي تظهر له خيارات "اطلب الآن" أو "عرض المزيد" في الشاشة. لا تكتب هذا الكود إلا لمنتج حقيقي موجود فعلياً في القائمة.
4. وجّه المزارع للتواصل مع "سفير القرية" (الموزع الخاص به) في الحالات التالية فقط: تأكيد الجرعة الدقيقة المكتوبة على العبوة، حجز شحنات للحصول على خصم جماعي، أو عدم توفر بيانات كافية لحساب الجرعة كما في القسم الثالث. لا يُذكر سفير القرية كخطوة إلزامية ثابتة في كل رد.
5. لا تقم أبداً باختلاق منتجات غير موجودة في القائمة. إذا لم تجد منتجاً مناسباً، أخبر المزارع أن يستشير سفير القرية لتوفير العلاج الأنسب.

=====================================================
القسم السادس: شرح الأمراض بطريقة مفهومة للفلاح
=====================================================

لا تستخدم مصطلحات علمية معقدة عند شرح مرض أو آفة. اشرح المرض من خلال تأثيره المرئي الملموس على النبات (مثال: يعمل هذا المرض بقعاً بنية اللون على الورقة، أو يجعل أطراف النبات تصفر وتجف)، بحيث يشعر المزارع أنك تفهم فعلاً ما يحدث في أرضه، ثم اربط الشرح مباشرة بالمنتج المناسب من قائمتنا إن وجد.

=====================================================
القسم السابع: التنوع والإبداع (بدون فقدان الاكتمال)
=====================================================

أنت لست آلة تكرر نفس الجمل، بل مهندس زراعي بشري يتحدث بتلقائية. في كل رد فيه ترشيح منتج، يجب أن تتضمن إجابتك العناصر التالية إلزامياً، بينما تكون حراً تماماً في ترتيبها وصياغتها وأسلوب عرضها من رد لآخر:
  - شرح مبسط ومرئي للمرض أو المشكلة (القسم السادس).
  - اسم المنتج المناسب وشركته المصنعة (إن وجدت في البيانات).
  - تأكيد أن المنتج أصلي ومضمون 100% من المنصة.
  - الجرعة موصوفة حسب مسارها الصحيح (أ أو ب) من القسم الثالث.
  - دعوة لطلب المنتج مباشرة أو التواصل مع سفير القرية حسب الحالة (القسم الخامس).

غيّر في كل مرة: صياغة الجمل، وطريقة عرض المنتج، وأسلوب ختام الحديث، واستخدم مرادفات مختلفة، لكن تأكد دائماً أن كل العناصر الإلزامية أعلاه موجودة قبل إرسال الرد.

=====================================================
القسم الثامن: قواعد عامة
=====================================================

1. حافظ على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات الهاتف المحمول وتوليد الصوت بكفاءة وسرعة.
2. إذا سُئلت عن معلومة لا تملكها بثقة (سواء عن جرعة، أو مرض، أو منتج)، لا تخترع إجابة؛ وجّه المزارع لسفير القرية بدلاً من التخمين.

=====================================================
القسم التاسع: إدارة وتسجيل أراضي الفلاح الزراعية (إلزامي)
=====================================================

بيانات الأراضي المسجلة حالياً للفلاح:
${activeFieldsContext}

قواعد إدارة وتسجيل الأراضي (اقرأها واتبعها بالضبط):

1. المعلومات الأربعة الإلزامية لكل أرض: (اسم الأرض، نوع المحصول، تاريخ الزراعة، المساحة). لا يتم تسجيل أرض إلا إذا توفرت الأربعة معاً كاملة. لا يوجد تسجيل جزئي أو مسودة.

2. منع تسمية الأرض بلقب مشتق من اسم المحصول الحالي: إذا كان الاسم الذي يذكره الفلاح للأرض مطابقاً بشكل مباشر لاسم المحصول الذي يسجله حالياً، لا تحفظ هذا الاسم كلقب دائم للأرض مباشرة. اسأله بلطف قبل الحفظ: "هذه الأرض، هل لها اسم تُعرف به بين الأهل والجيران، أم أن هذا هو اسمها الفعلي؟" فإذا أكد لك أن هذا فعلاً اسمها الحقيقي رغم التطابق، اقبله وسجله دون أي اعتراض إضافي.
   هذا الشرط ينطبق فقط عند التطابق المباشر بين اسم الأرض واسم المحصول الحالي؛ أما الأسماء التقليدية العامة، مثل أرض الغلة أو أرض النبع، فتُقبل مباشرة دون أي سؤال.

3. التأكيد الإلزامي بملخص قبل الحفظ: عندما يذكر الفلاح الأربعة معلومات كاملة في حديثه (قد تكون في رسالة واحدة أو عدة رسائل متتالية)، لا تسجّل الأرض فوراً، بل اعرض ملخصاً تأكيدياً بلغة ودية ومنسقة:
"تمام يا [اسم الفلاح أو يا حاج]، هتسجل لك الآتي:
- اسم الأرض: [اسم الأرض]
- نوع المحصول: [المحصول]
- تاريخ الزراعة: [التاريخ بصيغة رقمية يوم/شهر/سنة، مثل 1-8-2026]
- المساحة: [المساحة بالوحدة التي ذكرها الفلاح]
ده صح يا حاج؟"
سجّل الأرض عبر action="register_field" فقط بعد موافقة وتأكيد الفلاح الصريح.

4. منع الادعاء الكاذب بالحفظ (قاعدة إلزامية): يُمنع منعاً باتاً أن يذكر النموذج في رده أنه سجّل أو حدّث أي بيانات، إلا بعد استدعاء الأداة فعلياً لنفس هذه البيانات تحديداً في نفس الرد. إذا نجح الحفظ لأرض واحدة فقط من بين عدة أراضٍ مذكورة، يجب أن يوضح الرد ذلك بدقة تامة، ولا يدّعي حفظ ما لم يُحفظ فعلياً.

5. تمييز الأراضي المتشابهة (اسم + محصول واحد): إذا سجل أرضاً بنفس الاسم والمحصول، اسأله عن فرق الصفة (مثل قبلي/بحري)، وسجل الاسم المميز بصيغة "اسم الأرض + الصفة" عبر أداة manage_farmer_field بكود action="disambiguate".

6. ثبات الاسم والمساحة، وتغيير المحصول: اسم الأرض والمساحة ثابتان. المحصول وتاريخ الزراعة يتبدلان عند الموسم الجديد.

7. تغيير المحصول في أرض موجودة (تأكيدان إجباريان):
   - التأكيد الأول: "يعني خلصت حصاد [المحصول القديم] في [اسم الأرض]؟"
   - إذا قال "أه"، التأكيد الثاني: "تمام يا حاج، هنسجل [المحصول الجديد] وهننسى بيانات [المحصول القديم] لكي نركز معاك في الجديد، تمام؟"
   - بعد التأكيد الثاني فقط، استخدم أداة manage_farmer_field بكود action="change_crop" لتسجيل المحصول الجديد وأرشفة القديم تلقائياً.

8. تعديل أي بيانات مسجلة (اسم/مساحة): اعرض القيمة الحالية مقابل الجديدة، واطلب تأكيداً صريحاً قبل إجراء التعديل عبر أداة manage_farmer_field بكود action="update_field".

9. التحقق من البيانات: يمنع منعاً باتاً تسجيل تاريخ زراعة في المستقبل (أرفضه فوراً: "التاريخ ده لسه في المستقبل، مينفعش."). أرفض المساحة الصفرية أو السالبة. كذلك، استخدم تقديرك الزراعي كخبير لتقييم منطقية تاريخ الزراعة المذكور بالنسبة لدورة نمو المحصول المحدد. فإذا ذكر الفلاح تاريخ زراعة قديماً بشكل غير منطقي مقارنة بالموسم الطبيعي لهذا المحصول ومدة نموه المعتادة، لا تقبل التاريخ مباشرة، بل استفسر منه بلطف عن دقة التاريخ المذكور قبل حفظه.

10. عدد الأراضي:
   - إذا كان لدى الفلاح أرض واحدة مسجلة فقط: افترضها تلقائياً واذكر اسمها في ردك.
   - إذا كان لديه أكثر من أرض ولم يحدد: اسأله "قصدك أنهي أرض يا حاج؟" وعين له الأراضي المسجلة.

11. أول محادثة لفلاح بدون أي أرض: بادر بنفسك بسؤال ودود لجمع الأربعة معلومات: "منور يا حاج! قولنا زرعت إيه الموسم ده وأرضك كام فدان؟".

12. الأسئلة العامة: إذا سأل سؤالاً عاماً، أجب إجابة مفيدة أولاً، ثم اقترح عليه التسجيل في نهاية الرد.

13. تحويل وحدات المساحة: أي وحدة يذكرها الفلاح (قيراط أو متر) سيتم تحويلها داخلياً للفدان، ولكن اذكر له وحدته الأصلية في الرد.

14. قاعدة إلزامية — الرد النصي بعد الأداة: في كل مرة تستدعي فيها أي أداة (manage_farmer_field أو update_farm_profile)، يجب أن يحتوي ردك دائماً على نص كلام موجه للفلاح في نفس الرد. يُمنع منعاً باتاً الاكتفاء باستدعاء أداة دون إرفاق نص. بعد تنفيذ الأداة، تكلم الفلاح مباشرةً بكلام طبيعي ودود يناسب الموقف.
`;

    // Build Gemini contents array
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
            console.error("[crop-chat] No active Gemini key available in DB:", keyError);
            return NextResponse.json(
                { error: "نظام الذكاء الاصطناعي غير متاح حالياً" },
                { status: 503 }
            );
        }

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

        console.log(`[crop-chat] Attempt ${attemptCount + 1}: Using model ${modelName} on key ${keyData.api_keys.id.slice(0, 6)}...`);

        const requestPayload = {
            contents,
            systemInstruction: {
                parts: [{ text: systemPrompt }],
            },
            tools: [farmProfileToolDeclaration],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 5000,
                thinkingConfig: keyData.thinking_level ? {
                    thinkingBudget: keyData.thinking_level?.toUpperCase() === 'HIGH' ? 5000 : 0
                } : undefined,
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
            console.error(`[crop-chat] API ERROR | HTTP ${response.status} | Key: ${keyData.api_keys.id.slice(0, 6)}... | Body:`, errorBody);
            if (response.status === 429) {
                await (supabaseAdmin as any).from("api_key_models").update({ status: "rate_limited" }).eq("id", keyData.id);
                return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
            }
            if (response.status === 503) {
                await new Promise((r) => setTimeout(r, 3000));
                return attemptChat(attemptCount + 1, [...excludedIds, keyData.id]);
            }
            return NextResponse.json(
                { error: `فشل الاتصال بخدمة الذكاء الاصطناعي (${response.status})`, debug_info: errorBody.slice(0, 200) },
                { status: 502 }
            );
        }

        await (supabaseAdmin as any).from("api_key_models").update({ daily_usage: keyData.daily_usage + 1 }).eq("id", keyData.id);

        const data = await response.json();
        const candidates = data.candidates?.[0];
        const candidateParts: GeminiPart[] = candidates?.content?.parts ?? [];

        const functionCallParts = candidateParts.filter((p) => p.functionCall);

        if (functionCallParts.length > 0) {
            const functionResponseParts: GeminiPart[] = [];

            for (const callPart of functionCallParts) {
                const { name, args } = callPart.functionCall!;
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
                            console.log(`[crop-chat] Successfully merged farm profile for farmer ${userId}`);
                        }
                    }
                } else if (name === "manage_farmer_field") {
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
                        // تسجيل مباشر — الأربع معلومات مكتملة وتم تأكيد الفلاح
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        const area_feddan_val = area_value ? toFeddan(Number(area_value), area_unit || "فدان") : null;

                        if (planting_date && new Date(planting_date) > today) {
                            console.warn("[crop-chat] Validation error: planting_date in future for register_field");
                        } else if (area_feddan_val != null && area_feddan_val <= 0) {
                            console.warn("[crop-chat] Validation error: area_feddan <= 0 for register_field");
                        } else if (field_name && crop_type && planting_date && area_feddan_val != null) {
                            await (supabaseAdmin as any).from("farmer_fields").insert({
                                farmer_id: userId,
                                field_name,
                                crop_type,
                                planting_date,
                                area_feddan: area_feddan_val,
                                area_unit: area_unit || "فدان",
                                soil_type: soil_type || null,
                                irrigation_type: irrigation_type || null,
                                is_active: true,
                            });
                            console.log(`[crop-chat] Registered new field '${field_name}' for farmer ${userId}`);
                        } else {
                            console.warn(`[crop-chat] register_field called with incomplete data: field_name=${field_name}, crop_type=${crop_type}, planting_date=${planting_date}, area_value=${area_value}`);
                        }
                    } else if (action === "change_crop") {
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        if (planting_date && new Date(planting_date) > today) {
                            console.warn("[crop-chat] Validation error: planting_date in future for change_crop");
                        } else if (field_id && crop_type && planting_date) {
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
                                } else {
                                    console.log(`[crop-chat] Archived and changed crop for field ${field_id} to ${crop_type}`);
                                }
                            } else {
                                console.warn(`[crop-chat] Field ${field_id} not found or not owned by farmer ${userId}`);
                            }
                        }
                    } else if (action === "update_field") {
                        if (field_id) {
                            const { data: owned } = await (supabaseAdmin as any)
                                .from("farmer_fields")
                                .select("id")
                                .eq("id", field_id)
                                .eq("farmer_id", userId)
                                .maybeSingle();

                            if (owned) {
                                const updates: Record<string, any> = { updated_at: new Date().toISOString() };
                                if (field_name) updates.field_name = field_name;
                                if (area_value != null && Number(area_value) > 0) {
                                    updates.area_feddan = toFeddan(Number(area_value), area_unit || "فدان");
                                    updates.area_unit = area_unit || "فدان";
                                }
                                await (supabaseAdmin as any).from("farmer_fields").update(updates).eq("id", field_id);
                                console.log(`[crop-chat] Updated field ${field_id} details`);
                            }
                        }
                    } else if (action === "disambiguate") {
                        const today = new Date(); today.setHours(0, 0, 0, 0);
                        if (planting_date && new Date(planting_date) > today) {
                            console.warn("[crop-chat] Validation error in disambiguate: future planting_date");
                        } else if (area_value != null && Number(area_value) <= 0) {
                            console.warn("[crop-chat] Validation error in disambiguate: area <= 0");
                        } else {
                            const fullName = `${field_name || ''} ${disambiguating_attribute || ''}`.trim();
                            if (fullName && crop_type && planting_date) {
                                await (supabaseAdmin as any).from("farmer_fields").insert({
                                    farmer_id: userId,
                                    field_name: fullName,
                                    crop_type,
                                    planting_date,
                                    area_feddan: area_value ? toFeddan(Number(area_value), area_unit || "فدان") : 1,
                                    area_unit: area_unit || "فدان",
                                    soil_type: soil_type || null,
                                    irrigation_type: irrigation_type || null,
                                    is_active: true,
                                });
                                console.log(`[crop-chat] Created disambiguated field '${fullName}' for farmer ${userId}`);
                            }
                        }
                    }
                }

                functionResponseParts.push({
                    functionResponse: {
                        name,
                        response: {
                            name,
                            content: {
                                status: "success",
                                message: "تم تنفيذ العملية بنجاح."
                            }
                        }
                    }
                });
            }

            const updatedContents: ChatMessage[] = [
                ...contents,
                {
                    role: "model",
                    parts: candidateParts,
                },
                {
                    role: "function",
                    parts: functionResponseParts,
                }
            ];

            // ── Follow-up: force text-only response with tool_config mode=NONE ──────────
            const followUpPayload = {
                contents: updatedContents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                tools: [farmProfileToolDeclaration],
                // Prevent model from calling tools again — force text response
                tool_config: {
                    function_calling_config: { mode: "NONE" }
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 5000,
                    thinkingConfig: keyData.thinking_level ? {
                        thinkingBudget: keyData.thinking_level?.toUpperCase() === 'HIGH' ? 5000 : 0
                    } : undefined,
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
                    const followUpParts: GeminiPart[] = followUpData.candidates?.[0]?.content?.parts ?? [];
                    const finalFollowUpText = followUpParts
                        .filter((p: any) => !p.thought && p.text)
                        .map((p: any) => p.text)
                        .join("\n");

                    if (finalFollowUpText) {
                        console.log("[crop-chat] Follow-up got text response ✅");
                        const { cleanText, recommendedProduct } = processResponseText(finalFollowUpText);
                        return NextResponse.json({
                            success: true,
                            text: cleanText,
                            recommendedProduct,
                        });
                    }

                    console.warn("[crop-chat] Follow-up returned no text even with mode=NONE, parts:", JSON.stringify(followUpParts).slice(0, 300));
                } else {
                    const errBody = await followUpRes.text();
                    console.error(`[crop-chat] Follow-up HTTP error ${followUpRes.status}:`, errBody.slice(0, 200));
                }
            } catch (followUpErr) {
                console.error("[crop-chat] Follow-up request failed:", followUpErr);
            }

            // Fallback: tool was executed successfully but model failed to return text
            console.warn("[crop-chat] Returning generic success after tool execution (no text from model)");
            return NextResponse.json({
                success: true,
                text: "تم تنفيذ العملية بنجاح.",
            });
        }

        const resultText = candidateParts
            .filter((p: any) => !p.thought && p.text)
            .map((p: any) => p.text)
            .join("\n");

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
