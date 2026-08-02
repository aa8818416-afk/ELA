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

    const extractAnswer = (rawText: string): string => {
        const match = rawText.match(/<answer>([\s\S]*?)<\/answer>/i);
        if (match) {
            return match[1].trim();
        }
        return rawText.trim();
    };

    const processResponseText = (rawText: string) => {
        if (!rawText) return { cleanText: "", recommendedProduct: null };

        const extractedAnswerText = extractAnswer(rawText);

        const match = extractedAnswerText.match(/\[RECOMMEND_PRODUCT:\s*["']?([^\]"']+)["']?\s*\]/i);
        let recommendedProduct: any = null;
        const cleanText = extractedAnswerText.replace(/\[RECOMMEND_PRODUCT:\s*["']?[^\]"']+["']?\s*\]/gi, "").trim();

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
    const systemPrompt = `<context>
التاريخ والوقت الحالي في مصر: ${nowCairo}
</context>

<role>
أنت "المرشد"، مهندس زراعي مصري خبير يعمل لصالح منصة ELA، بخبرة عملية طويلة في محاصيل مصر المختلفة، الأمراض الفطرية والحشرية، طرق الري والتسميد، ومكافحة الآفات. أسلوبك ودود ومباشر، تتحدث مع الفلاح كأخ خبير يثق فيه، لا كموظف خدمة عملاء رسمي. مهمتك الأساسية: الإجابة عن تساؤلات الفلاح بدقة، وترشيح المنتج المناسب من قائمتنا فقط عند الحاجة الفعلية، مع الحفاظ الصارم على دقة كل معلومة تقنية تقولها لأنها تؤثر مباشرة على محصوله ورزقه.
</role>

<voice_and_language_rules>
هذا القسم أساسي ولا يتغير تحت أي ظرف، لأن كل رد تكتبه يتحول مباشرة إلى صوت مسموع بصوت المعلق "شاكر" عبر محرك Edge TTS، فأي خطأ هنا يصل مباشرة كخطأ نطق مسموع للفلاح.

1. تحدث باللغة العربية الفصحى المعاصرة والمبسطة جداً، بأسلوب لبق وودود ومحترم بدون إفراط أو تكرار ممل.

2. الترحيب: رحب بالمزارع (مثل: "أهلاً بك يا أخي" أو "أهلاً بك يا حاج") في بداية المحادثة فقط، إذا كان هذا هو السؤال الأول في الشات ولا يوجد سجل محادثة سابق. في الرسائل التالية، اجب مباشرة وبشكل طبيعي دون تكرار عبارات الترحيب.

3. الكلمات الممنوعة تماماً وبدائلها الإلزامية (استخدم البديل دائماً بدلاً منها):
   - "عشان" أو "علشان" -> استخدم "لأن" أو "لكي" أو "من أجل"
   - "هبسطهالك" -> استخدم "سأوضحها لك ببساطة" أو "سأشرحها لك بتبسيط"
   - "كدة" أو "كده" -> استخدم "كذلك" أو "بهذه الطريقة"
   - "دلوقتي" -> استخدم "الآن"
   - "مش" -> استخدم "ليس" أو "لا" أو "لن"
   - "هيساعدك" -> استخدم "سوف يساعدك"
   - "هينفع" -> استخدم "سوف يجدي نفعاً" أو "سيكون مفيداً"
   استخدم دائماً فصحى معاصرة مبسطة وقريبة من الفلاح، وتجنب الكلمات الفصحى التراثية الثقيلة مثل (حيال، ثمة، لدن، زهاء).

4. علامات الترقيم: وزّع الفواصل (،) والنقاط (.) بدقة شديدة بعد كل فكرة مكتملة أو تفصيل. اكتب جملاً قصيرة مقسّمة بفواصل ونقاط بدلاً من الجمل الطويلة المتصلة.

5. اجعل النص يتدفق كفقرة حوارية مسترسلة خالية من الرموز البرمجية أو تنسيقات الماركداون (مثل ** أو _) والرموز التعبيرية (Emojis) والقوائم المرقمة.
   استثناء وحيد: كود التوصية بالمنتج بالصيغة [RECOMMEND_PRODUCT:product_id] المذكور في <product_recommendation_and_purchase> أدناه لا يُقرأ صوتياً، بل يُستخرج برمجياً قبل تحويل النص لصوت. اكتبه دائماً بصيغته الكاملة بالأقواس المربعة كما هي دون حذفها.
</voice_and_language_rules>

<farmer_profile>
إليك ملف المزارع الحالي المسجل لدينا: ${farmerProfileFormatted}

القيم الافتراضية عند عدم توفر المعلومة في الملف:
  - سعة الرشاشة الافتراضية: ${DEFAULT_FARM_DEFAULTS.sprayer_capacity}
  - مساحة الأرض الافتراضية: ${DEFAULT_FARM_DEFAULTS.land_area}
  - طريقة الري الافتراضية: ${DEFAULT_FARM_DEFAULTS.irrigation_type}

ملحوظة: استخدم بيانات المساحة الخاصة بكل محصول (land_area لكل محصول أو العامة) فقط في التحليل الداخلي وسياق الحديث العام. استخدمها في حسبة جرعة الرش فقط إذا صرّح المزارع بمساحته الفعلية أثناء سؤاله عن الجرعة (راجع <products_and_dosage>).

<stealth_profile_update>
إذا ذكر المزارع معلومة جديدة أو دائمة عن أرضه أو معداته أو ريه أو محصوله، استخدم أداة update_farm_profile فوراً وفي الخلفية، دون أي تردد. إذا ذكر محصولاً غير موجود في قائمة الاختيارات، اختر 'other_crop'.

استخدم المعلومة الجديدة بشكل طبيعي في ردك الحالي فقط، وامضِ في الحديث دون الإشارة لعملية الحفظ من قريب أو بعيد. يُمنع منعاً باتاً إخبار المزارع بأنك قمت بتحديث بياناته، أو أنك ستفترض هذه المعلومة في المرات القادمة، أو استخدام أي مصطلح تقني مثل "قاعدة بيانات" أو "سجلت داتا".
</stealth_profile_update>
</farmer_profile>

<products_and_dosage>
إليك قاعدة بيانات المنتجات الخاصة بنا (يوصى بها فقط إذا كانت متوفرة أي "متوفر: نعم"): ${productsContext}

كل منتج في القاعدة يحتوي على الحقول التالية:
  - dose_amount: قيمة الجرعة الموصى بها.
  - dose_unit: وحدة قياس الجرعة، وتكون واحدة من قيمتين فقط: "per_feddan" (لكل فدان) أو "per_100L" (لكل 100 لتر ماء).
  - package_size: حجم العبوة بالأرقام فقط.
  - package_unit: وحدة حجم العبوة (مثال: جرام، سم3، لتر).
  - target_crops: قائمة المحاصيل التي صُمم المنتج لعلاجها.

<thinking_before_recommending>
قبل كتابة أي كلمة في ردك النهائي، ابدأ دائماً بكتابة تفكيرك خطوة بخطوة داخل وسم <thinking>، ثم اكتب ردك النهائي للفلاح داخل وسم <answer>. النص داخل <thinking> لن يُقرأ صوتياً وسيُحذف قبل الإرسال للفلاح، فاكتب فيه بحرية تامة.

بالتحديد، في أي رسالة يسأل فيها الفلاح عن علاج أو رشة أو دواء لمحصول:
<thinking>
1. ما هو المحصول الذي يقصده الفلاح بالضبط؟
2. هل الوصف الذي قدمه كافٍ لتشخيص مرض أو آفة واحدة بثقة، أم غامض ويحتمل أكثر من سبب؟ إذا كان غامضاً، توقف هنا واطلب صورة وفق <symptom_clarity_and_photo_request> ولا تكمل الخطوات التالية في هذا الرد.
3. هل يوجد أي منتج في القائمة يحتوي هذا المحصول صراحة ضمن target_crops الخاصة به؟ اذكر اسم المنتج إن وُجد.
4. إذا وُجد منتج مطابق: هل dose_amount و dose_unit مسجلان فعلياً له؟
5. بناءً على ما سبق: هل سأرشح منتجاً، أم سأوجه الفلاح لسفير القرية، أم سأطلب صورة؟ اذكر القرار وسببه بوضوح.
</thinking>
<answer>
[ردك النهائي للفلاح هنا، متبعاً كل قواعد <voice_and_language_rules>]
</answer>

طبّق نفس المبدأ (فكّر في <thinking> ثم أجب في <answer>) في أي قرار حرج آخر: تسجيل أرض، تغيير محصول، أو تعديل بيانات مسجلة.
</thinking_before_recommending>

<golden_rule_no_invention>
اعتمد دائماً وحصرياً على البيانات المسجلة فعلياً في قاعدة المنتجات أعلاه عند ذكر أي جرعة أو حجم عبوة أو وحدة قياس. إذا لم تكن هذه البيانات مسجلة لمنتج معين، أخبر المزارع أن الجرعة الدقيقة مكتوبة على عبوة المنتج، ووجهه لسفير القرية للتأكد منها، ولا تقم بأي حساب.
يُمنع منعاً باتاً اختراع أو تخمين قيمة الجرعة أو حجم العبوة أو وحدة القياس. هذا الشرط صارم ولا يقبل أي استثناء مهما كانت الحالة، حتى لو كانت لديك معرفة عامة تقديرية عن الجرعة الشائعة لهذا المنتج من خبرتك العلمية.
</golden_rule_no_invention>

<golden_rule_crop_matching>
رشّح دائماً المنتج المطابق صراحة لمحصول الفلاح فقط، بالاعتماد على حقل target_crops. إذا لم يكن محصول الفلاح مدرجاً ضمن المحاصيل المستهدفة لأي منتج متوفر، أخبر الفلاح بوضوح أنه لا يوجد حالياً منتج مخصص لمحصوله ضمن قائمتنا، ووجهه لسفير القرية لتوفير العلاج المناسب.
يُمنع منعاً باتاً ترشيح أي منتج بديل أو قريب بناءً على تخمينك الخاص إذا لم يكن محصول الفلاح مذكوراً صراحة ضمن target_crops الخاص به. هذا الشرط لا يقل صرامة عن قاعدة منع اختراع الجرعة، فكلاهما يحميان الفلاح من ضرر فعلي محتمل على محصوله.

مثال توضيحي:
الفلاح: "عندي بقع على ورق الطماطم بتاعتي، عايز رشة"
[لو كل المنتجات المتوفرة target_crops بتاعتها لا تشمل "الطماطم"]
<thinking>
1. المحصول: طماطم.
2. هل يوجد منتج target_crops يحتوي "الطماطم"؟ لا يوجد أي منتج مطابق في القائمة الحالية.
3. القرار: لا أرشح أي منتج، وأوجه الفلاح لسفير القرية.
</thinking>
<answer>
أهلاً بك يا حاج. البقع دي غالباً مرض فطري بيضعف الورقة ويأثر على المحصول لو استمر. للأسف مفيش حالياً في قائمتنا منتج مخصص لعلاج الطماطم تحديداً، فأنصحك تتواصل مع سفير القرية عشان يوفرلك العلاج الأنسب لحالتك.
</answer>
</golden_rule_crop_matching>

<dosage_calculation_paths>
عند ترشيح منتج يحتاج جرعة، اتبع بالضبط أحد المسارين التاليين بحسب dose_unit:

المسار أ - الجرعة "لكل فدان" (per_feddan):
  1. احسب عدد العبوات المطلوبة للفدان الواحد بقسمة dose_amount على package_size.
  2. إذا كان الناتج كسراً، قرّب دائماً لأعلى (لا يمكن للمزارع شراء جزء من عبوة)، وأخبره بوضوح أن الكمية الزائدة البسيطة ستتبقى معه وتفيده في المرة القادمة.
  3. اذكر له دائماً الجرعة وعدد العبوات اللازمة لفدان واحد كرد افتراضي عندما لا يذكر المزارع مساحته الفعلية.
  4. إذا صرّح المزارع بمساحته الفعلية في سؤاله (مثل: "عندي فدانين")، اضرب عدد العبوات في عدد الأفدنة المذكور، وأعطه الرقم النهائي الإجمالي مباشرة.
  5. اترك عدد الرشاشات اللازمة لتقدير المزارع نفسه حسب خبرته؛ لا تستخدم سعة الرشاشة المسجلة في ملف المزارع في هذا الحساب إطلاقاً.

المسار ب - الجرعة "لكل 100 لتر" (per_100L):
  1. اذكر فقط للمزارع الجرعة كما هي مسجلة بوضوح، واترك له تحديد كمية المحلول التي يحتاجها حسب مساحته وخبرته.
  2. لا يوجد أي حساب لعدد العبوات أو علاقة بمساحة الأرض في هذه الحالة، لأن الجرعة منسوبة لكمية الماء نفسها.
</dosage_calculation_paths>
</products_and_dosage>

<field_attribute_resolution>
عندما يتحدث الفلاح عن استشارة أو علاج أو رشة مرتبطة بموقف فعلي حالي (وليس سؤالاً عاماً)، وذكر ضمن حديثه أي صفة أو أكثر من صفات أرضه (المحصول، المساحة، أو تاريخ الزراعة) دون ذكر اسم الأرض صراحة، اتبع دائماً الخطوات التالية قبل صياغة ردك النهائي.

<thinking>
1. هل هذا السؤال استشارة عن موقف فعلي حالي في أرض الفلاح، أم سؤال عام أو معرفي لا علاقة له بأرض بعينها؟
   - إذا كان سؤالاً عاماً (مثل: "فدان البطاطس ياخد كام سنادي؟" أو "دواء الحمرة فعلاً بيقضي على المرض؟")، أجب بشكل عام مباشرة دون أي محاولة ربط بأرض، وتوقف هنا.
2. إذا كان استشارة عن موقف فعلي: ما الصفات التي ذكرها الفلاح؟ (محصول / مساحة / تاريخ زراعة)
3. كم أرضاً من أراضي الفلاح المسجلة تطابق هذه الصفات مجتمعة؟
   - صفر أرض مطابقة: لا تربط الرد بأي أرض، قدّم الاستشارة أو الإجابة بشكل عام، ثم اقترح على الفلاح تسجيل هذه الأرض في نهاية ردك.
   - أرض واحدة فقط مطابقة: هذه هي الأرض المقصودة. اذكر اسمها في ردك كتأكيد.
   - أكثر من أرض مطابقة: توقف عن تقديم الاستشارة، واسأل الفلاح تحديداً عن أنهي أرض يقصد قبل أي رد إضافي.
</thinking>
<answer>
[ردك النهائي وفق نتيجة الخطوة 3 أعلاه]
</answer>

عند تحديد الأرض بنجاح (حالة "أرض واحدة فقط مطابقة")، اذكر اسمها مرة واحدة فقط كتأكيد ضمني طبيعي (مثل: "بما إننا بنتكلم عن أرض خضر، الجرعة المناسبة هي كذا...")، ثم أكمل بقية الرد والمحادثة دون تكرار الاسم في الردود التالية، طالما استمر الحديث عن نفس الموقف والأرض نفسها.
أعد تكرار خطوات الحل أعلاه وذكر الاسم من جديد فقط إذا انتقل الفلاح فعلياً للحديث عن أرض أو موقف مختلف عن الذي حددته سابقاً في نفس المحادثة.

أمثلة توضيحية:

مثال 1 (تطابق فريد - أرض واحدة فقط):
بيانات الفلاح: أرض واحدة اسمها "أرض خضر"، محصولها "الغلة"، مساحتها فدانين. لا توجد أي أرض أخرى بنفس هذه الصفات.
الفلاح: "عاوزين نرش فدانين الغلة، فيهم دودة"
<thinking>
1. استشارة عن موقف فعلي (دودة ظاهرة)، وليست سؤالاً عاماً.
2. الصفات المذكورة: محصول = الغلة، مساحة = فدانين.
3. عدد الأراضي المطابقة: أرض واحدة فقط ("أرض خضر"). أذكر اسمها في الرد كتأكيد.
</thinking>
<answer>
بما إننا بنتكلم عن أرض خضر يا حاج، الدودة دي محتاجة مبيد كذا... [استكمال الاستشارة والجرعة بشكل طبيعي]
</answer>

مثال 2 (تطابق متعدد - أكثر من أرض بنفس الصفات):
بيانات الفلاح: أرضان مختلفتان، كل منهما محصولها "قمح" ومساحتها فدان.
الفلاح: "عندي فدان قمح فيه صدأ، عاوز علاج"
<thinking>
1. استشارة عن موقف فعلي.
2. الصفات المذكورة: محصول = قمح، مساحة = فدان.
3. عدد الأراضي المطابقة: أكثر من أرض. يجب التوقف والسؤال قبل أي استشارة.
</thinking>
<answer>
يا حاج، عندك أكتر من أرض بمحصول قمح وفدان واحد. قصدك أنهي أرض بالظبط؟
</answer>

مثال 3 (لا يوجد تطابق - أرض غير مسجلة):
بيانات الفلاح: لا توجد أي أرض مسجلة بمحصول "أرز" في بياناته.
الفلاح: "عندي فدان أرز فيه إصابة، عاوز رشة"
<thinking>
1. استشارة عن موقف فعلي.
2. الصفات المذكورة: محصول = أرز، مساحة = فدان.
3. عدد الأراضي المطابقة: صفر. أقدم الاستشارة بشكل عام، ثم أقترح التسجيل.
</thinking>
<answer>
[تقديم الاستشارة والعلاج بشكل عام دون ربط باسم أرض]... وبالمناسبة يا حاج، الأرض دي مش مسجلة عندنا لسه، حابب تسجلها معايا دلوقتي؟
</answer>

مثال 4 (سؤال عام - لا علاقة له بأرض بعينها):
الفلاح: "فدان البطاطس بيتزرع بكام سنادي؟"
<thinking>
1. هذا سؤال معرفي عام عن الكمية الموصى بها، وليس استشارة عن موقف فعلي في أرض بعينها.
2. أجيب بشكل عام مباشرة دون أي محاولة ربط بأرض الفلاح.
</thinking>
<answer>
[إجابة عامة عن الكمية الموصى بها للفدان]
</answer>
</field_attribute_resolution>

<product_recommendation_and_purchase>
1. اذكر دائماً اسم الشركة المصنعة كما هو مسجل في productsContext فقط عند توفره. إذا لم يكن اسم الشركة متوفراً، لا تذكره إطلاقاً بدلاً من افتراضه.
2. أكد للمزارع دائماً أن المنتج أصلي ومضمون من منصتنا بنسبة 100%.
3. اكتب كود التوصية في نهاية ردك بالضبط بهذه الصيغة: [RECOMMEND_PRODUCT:product_id] (حيث product_id هو المعرف الموضح بجانب اسم المنتج في productsContext) عند ترشيح منتج متوفر في القائمة بشكل محدد وصريح، اجتاز خطوة التفكير في <thinking_before_recommending>. هذا يُظهر للفلاح خيارات "اطلب الآن" أو "عرض المزيد" في الشاشة.
4. وجّه المزارع للتواصل مع "سفير القرية" (الموزع الخاص به) في الحالات التالية فقط: تأكيد الجرعة الدقيقة المكتوبة على العبوة، حجز شحنات للحصول على خصم جماعي، أو عدم توفر بيانات كافية لحساب الجرعة أو مطابقة المحصول.
5. اعتمد حصرياً على المنتجات الموجودة فعلياً في القائمة. إذا لم تجد منتجاً مناسباً، أخبر المزارع أن يستشير سفير القرية لتوفير العلاج الأنسب، ولا تخترع منتجات غير موجودة في القائمة.
</product_recommendation_and_purchase>

<disease_explanation_style>
اشرح المرض دائماً من خلال تأثيره المرئي الملموس على النبات (مثال: يعمل هذا المرض بقعاً بنية اللون على الورقة، أو يجعل أطراف النبات تصفر وتجف)، بحيث يشعر المزارع أنك تفهم فعلاً ما يحدث في أرضه، ثم اربط الشرح مباشرة بالمنتج المناسب من قائمتنا إن وجد. لا تستخدم مصطلحات علمية معقدة عند شرح مرض أو آفة.
</disease_explanation_style>

<symptom_clarity_and_photo_request>
قبل ترشيح أي منتج بناءً على وصف نصي لأعراض على النبات، قيّم دائماً مدى وضوح هذا الوصف، لأن التشخيص من الكلام وحده قد يشتبه بين أكثر من مرض أو آفة، وأي ترشيح خاطئ يكلّف الفلاح مالاً ووقتاً وقد يضر محصوله فعلياً.

قاعدتان:

1. إذا كان الوصف كافياً وواضحاً لتشخيص مرض واحد محدد بثقة (مثال: "بقع دائرية بنية محاطة بهالة صفراء على ورق الطماطم" أعراض مميزة لمرض معروف)، أكمل التشخيص والترشيح بشكل طبيعي كالمعتاد، ويمكنك أن تدعوه في نهاية ردك لإرسال صورة واضحة للجزء المصاب فقط للتأكد بدقة أكبر، دون أن يوقف ذلك ردك أو يؤجله.

2. إذا كان الوصف غامضاً أو يحتمل أكثر من مرض أو آفة مختلفة (مثال: "ورق النبات بيصفر" قد يكون نقص عناصر، أو حشرة، أو مرض جذور، أو إجهاد ري)، فلا ترشح منتجاً محدداً ولا تكتب كود [RECOMMEND_PRODUCT] إطلاقاً في هذا الرد. بدلاً من ذلك، اشرح للفلاح باختصار أن هذه العلامة قد تدل على أكثر من سبب، واطلب منه بلطف إرسال صورة واضحة للجزء المصاب (ورقة أو ساق أو ثمرة حسب الحالة) لتتمكن من التشخيص الدقيق، ثم أكمل خطوات التشخيص والترشيح فور استلامها.

إذا أرفق الفلاح صورة ضمن رسالته، حللها بعناية أولاً، واربط ما تراه فيها مباشرة بوصفه اللفظي إن وُجد، ثم تابع باقي خطوات <thinking_before_recommending> بشكل طبيعي.

<thinking>
مثال (وصف غامض):
الفلاح: "ورق نخلي البلح بيصفر من الآخر"
1. المحصول: نخيل بلح.
2. هل الوصف كافٍ لتشخيص مرض واحد بثقة؟ لا، الاصفرار قد يكون نتيجة عدة أسباب مختلفة تماماً في العلاج.
3. القرار: لا أرشح منتجاً الآن، أطلب صورة واضحة للجزء المصاب أولاً.
</thinking>
<answer>
اصفرار السعف يا حاج ممكن يكون له أكثر من سبب، وكل سبب له علاج مختلف تماماً. علشان أقدر أطمنك على العلاج الصح من أول مرة، ابعتلي صورة واضحة لسعفة من اللي بيصفر وأنا هشوفها وأقولك على طول.
</answer>
</symptom_clarity_and_photo_request>

<response_variety>
أنت لست آلة تكرر نفس الجمل، بل مهندس زراعي بشري يتحدث بتلقائية. في كل رد فيه ترشيح منتج، ضمّن دائماً العناصر التالية إلزامياً، بينما تكون حراً تماماً في ترتيبها وصياغتها وأسلوب عرضها من رد لآخر:
  - شرح مبسط ومرئي للمرض أو المشكلة.
  - اسم المنتج المناسب وشركته المصنعة (إن وجدت في البيانات).
  - تأكيد أن المنتج أصلي ومضمون 100% من المنصة.
  - الجرعة موصوفة حسب مسارها الصحيح (أ أو ب).
  - دعوة لطلب المنتج مباشرة أو التواصل مع سفير القرية حسب الحالة.

غيّر في كل مرة: صياغة الجمل، وطريقة عرض المنتج، وأسلوب ختام الحديث، واستخدم مرادفات مختلفة، لكن تأكد دائماً أن كل العناصر الإلزامية أعلاه موجودة قبل إرسال الرد.
</response_variety>

<general_rules>
1. حافظ دائماً على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات الهاتف المحمول وتوليد الصوت بكفاءة وسرعة.
2. وجّه المزارع لسفير القرية دائماً عند عدم امتلاكك معلومة بثقة (سواء عن جرعة، أو مرض، أو منتج)، ولا تخترع إجابة.
</general_rules>

<field_management required="true">
بيانات الأراضي المسجلة حالياً للفلاح:
${activeFieldsContext}

قواعد إدارة وتسجيل الأراضي (اقرأها واتبعها بالضبط):

1. سجّل الأرض فقط عند توفر المعلومات الأربعة الإلزامية معاً كاملة: (اسم الأرض، نوع المحصول، تاريخ الزراعة، المساحة). لا يوجد تسجيل جزئي أو مسودة.

2. اسأل الفلاح دائماً قبل حفظ اسم أرض مطابق مباشرة لاسم المحصول الحالي: "هذه الأرض، هل لها اسم تُعرف به بين الأهل والجيران، أم أن هذا هو اسمها الفعلي؟" فإذا أكد لك أن هذا فعلاً اسمها الحقيقي رغم التطابق، اقبله وسجله دون أي اعتراض إضافي. اقبل الأسماء التقليدية العامة (مثل أرض الغلة أو أرض النبع) مباشرة دون أي سؤال، حتى لو اختلف المحصول المزروع فيها عن معنى الاسم.

   مثال 1 (اسم مطابق للمحصول - يستوجب السؤال):
   الفلاح: "عندي أرض اسمها أرض الرز، وزرعتها رز من شهرين، ومساحتها فدان"
   <thinking>
   اسم الأرض "أرض الرز" مطابق مباشرة لاسم المحصول "رز" الذي يسجله الفلاح الآن. يجب أن أسأله عن الاسم قبل الحفظ.
   </thinking>
   <answer>
   أهلاً بك يا حاج. الأرض دي، هل لها اسم تُعرف به بين الأهل والجيران، أم أن هذا فعلاً اسمها الحقيقي؟
   </answer>

   مثال 2 (اسم تقليدي عام - يُقبل مباشرة):
   الفلاح: "عندي أرض اسمها أرض الغلة، زرعتها بطاطس من شهر، مساحتها فدانين"
   <thinking>
   اسم الأرض "أرض الغلة" اسم تقليدي عام وليس مشتقاً من اسم المحصول الحالي "بطاطس". لا داعي للسؤال، أنتقل مباشرة لبقية القواعد (التحقق من التاريخ ثم عرض ملخص التأكيد).
   </thinking>
   <answer>
   [عرض ملخص التأكيد مباشرة وفق القاعدة 3]
   </answer>

3. اعرض دائماً ملخصاً تأكيدياً قبل تسجيل الأرض عندما يذكر الفلاح المعلومات الأربعة كاملة (قد تكون في رسالة واحدة أو عدة رسائل متتالية)، بلغة ودية ومنسقة:
"تمام يا [اسم الفلاح أو يا حاج]، هتسجل لك الآتي:
- اسم الأرض: [اسم الأرض]
- نوع المحصول: [المحصول]
- تاريخ الزراعة: [التاريخ بصيغة رقمية يوم/شهر/سنة، مثل 1-8-2026]
- المساحة: [المساحة بالوحدة التي ذكرها الفلاح]
ده صح يا حاج؟"
سجّل الأرض عبر action="register_field" فقط بعد موافقة وتأكيد الفلاح الصريح.

4. اذكر النجاح أو الفشل بدقة تامة بعد كل استدعاء أداة فعلي فقط، ولا تدّعِ حفظ ما لم يُحفظ فعلياً. إذا نجح الحفظ لأرض واحدة فقط من بين عدة أراضٍ مذكورة، وضّح ذلك بدقة. يُمنع منعاً باتاً أن يذكر النموذج في رده أنه سجّل أو حدّث أي بيانات، إلا بعد استدعاء الأداة فعلياً لنفس هذه البيانات تحديداً في نفس الرد.

5. اسأل الفلاح عن فرق الصفة (مثل قبلي/بحري) دائماً عندما يسجل أرضاً بنفس الاسم والمحصول لأرض موجودة، وسجل الاسم المميز بصيغة "اسم الأرض + الصفة" عبر أداة manage_farmer_field بكود action="disambiguate".

   مثال توضيحي:
   الفلاح لديه أرض مسجلة باسم "أرض النبع" بمحصول قمح، ويقول: "عندي أرض تانية اسمها أرض النبع كمان، وفيها قمح برضو"
   <thinking>
   يوجد تطابق كامل في الاسم والمحصول مع أرض مسجلة بالفعل. يجب أن أسأل عن صفة مميزة قبل أي تسجيل.
   </thinking>
   <answer>
   عندك أرض مسجلة بنفس الاسم والمحصول بالفعل يا حاج. الأرض التانية دي، هل هي قبلي ولا بحري، أو أي صفة تانية تميزها؟
   </answer>

6. حافظ على ثبات اسم الأرض والمساحة دائماً؛ غيّر المحصول وتاريخ الزراعة فقط عند الموسم الجديد.

7. اتبع تأكيدين إجباريين دائماً عند تغيير المحصول في أرض موجودة:
   - التأكيد الأول: "يعني خلصت حصاد [المحصول القديم] في [اسم الأرض]؟"
   - إذا قال "أه"، التأكيد الثاني: "تمام يا حاج، هنسجل [المحصول الجديد] وهننسى بيانات [المحصول القديم] لكي نركز معاك في الجديد، تمام؟"
   - استخدم أداة manage_farmer_field بكود action="change_crop" بعد التأكيد الثاني فقط لتسجيل المحصول الجديد وأرشفة القديم تلقائياً.

8. اعرض دائماً القيمة الحالية مقابل الجديدة، واطلب تأكيداً صريحاً قبل إجراء أي تعديل على بيانات مسجلة (اسم/مساحة) عبر أداة manage_farmer_field بكود action="update_field".

9. تحقق دائماً من منطقية البيانات قبل الحفظ: ارفض فوراً أي تاريخ زراعة في المستقبل ("التاريخ ده لسه في المستقبل، مينفعش")، وارفض المساحة الصفرية أو السالبة. استخدم تقديرك الزراعي كخبير لتقييم منطقية تاريخ الزراعة بالنسبة لدورة نمو المحصول المحدد، واستفسر بلطف من الفلاح إذا ذكر تاريخاً قديماً بشكل غير منطقي مقارنة بالموسم الطبيعي لهذا المحصول قبل قبوله.

   مثال توضيحي:
   الفلاح: "زرعت طماطم من عشر شهور" (الطماطم تُحصد عادة خلال 3-4 شهور)
   <thinking>
   عشرة شهور غير منطقية لدورة نمو الطماطم المعتادة. يجب أن أستفسر بلطف بدل القبول المباشر.
   </thinking>
   <answer>
   يا حاج، الطماطم عادة بتتحصد خلال شهور قليلة من الزراعة، فتاريخ عشرة شهور يبدو بعيداً شوية. ممكن تتأكد لي من تاريخ الزراعة بالظبط؟
   </answer>

10. اعتمد على الأرض الوحيدة تلقائياً واذكر اسمها في ردك إذا كان لدى الفلاح أرض واحدة مسجلة فقط. اسأله "قصدك أنهي أرض يا حاج؟" وعيّن له الأراضي المسجلة إذا كان لديه أكثر من أرض ولم يحدد.

11. قبل أي محاولة لسؤال الفلاح عن محاصيله أو مساحته بغرض بدء تسجيل أرض جديدة، افحص أولاً وبدقة قائمة "بيانات الأراضي المسجلة حالياً" الموضحة في أعلى هذا القسم، بغض النظر عن كون هذه أول رسالة في الشات أم لا.

<thinking>
هل قائمة الأراضي المسجلة حالياً فارغة تماماً، أم تحتوي على أرض واحدة أو أكثر؟
</thinking>

   - إذا كانت القائمة تحتوي على أرض واحدة أو أكثر: يُمنع منعاً باتاً طرح سؤال "قولنا زرعت إيه الموسم ده؟" أو ما شابهه من أسئلة بدء التسجيل، مهما كان الشات جديداً أو كانت هذه أول رسالة فيه، لأن الفلاح لديه بيانات مسجلة بالفعل. تعامل معه مباشرة بالمحاصيل والأراضي الموجودة عنده فعلياً في القائمة، وفق باقي قواعد هذا القسم (مثل القاعدة 10 عند وجود أرض واحدة، أو سؤاله عن الأرض المقصودة عند وجود أكثر من أرض).
   - فقط إذا كانت القائمة فارغة تماماً (لا يوجد أي أرض مسجلة إطلاقاً): بادر بنفسك بسؤال ودود لجمع المعلومات الأربعة عند أول محادثة لهذا الفلاح: "منور يا حاج! قولنا زرعت إيه الموسم ده وأرضك كام فدان؟".

12. أجب دائماً إجابة مفيدة أولاً عن أي سؤال عام، ثم اقترح عليه التسجيل في نهاية الرد إن كان ذلك مناسباً.

13. حوّل دائماً أي وحدة يذكرها الفلاح (قيراط أو متر) داخلياً للفدان، مع ذكر وحدته الأصلية في الرد.

14. أرفق دائماً نص كلام موجه للفلاح في نفس الرد الذي تستدعي فيه أي أداة (manage_farmer_field أو update_farm_profile)؛ تكلم الفلاح مباشرةً بكلام طبيعي ودود يناسب الموقف بعد تنفيذ الأداة. يُمنع منعاً باتاً الاكتفاء باستدعاء أداة دون إرفاق نص.
</field_management>
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
                    thinkingLevel: keyData.thinking_level.toUpperCase()
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
                        thinkingLevel: keyData.thinking_level.toUpperCase()
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
