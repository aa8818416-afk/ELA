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
        },
        {
            name: "log_farmer_memory",
            description: "استخدم هذه الأداة لتسجيل حقيقة أو ملحوظة سلوكية عن الفلاح (مثل تفضيلاته، قدرته المالية، أسلوب تواصله). اختر دائماً تصنيفاً مناسباً من القائمة.",
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
                    // treatment
                    category: { type: "STRING", enum: ["مبيد", "سماد"], description: "نوع المعاملة" },
                    product_id: { type: "STRING", description: "معرف المنتج من قائمة المنتجات" },
                    product_name_text: { type: "STRING", description: "اسم المنتج لو مش في القائمة" },
                    dosage: { type: "NUMBER", description: "الجرعة" },
                    dosage_unit: { type: "STRING", description: "وحدة الجرعة" },
                    sprayer_count: { type: "INTEGER", description: "عدد الرشاشات المستخدمة بالجرعة المذكورة" },
                    spray_time_of_day: { type: "STRING", description: "وقت الرش في اليوم: الصبح بكير / منتصف النهار / بعد العصر / المغرب" },
                    pest_disease_id: { type: "STRING", description: "معرف الآفة أو المرض" },
                    symptom_description: { type: "STRING", description: "وصف الأعراض" },
                    photo_url: { type: "STRING", description: "رابط الصورة" },
                    // irrigation & harvest
                    description: { type: "STRING", description: "وصف عملية الري أو الحصاد" },
                    // harvest
                    quantity: { type: "NUMBER", description: "الكمية المحصودة" },
                    quantity_unit: { type: "STRING", description: "وحدة الكمية المحصودة (كيلو، طن، قفص...)" },
                    // labor
                    worker_count: { type: "INTEGER", description: "عدد العمال" },
                    contractor_name: { type: "STRING", description: "اسم المقاول أو المسؤول" },
                },
                required: ["field_id", "activity_type"]
            }
        },
        {
            name: "update_field_activity",
            description: "حدّث بيانات نشاط موجود مسبقاً (pending). استخدمها لو الفلاح ذكر تفاصيل مكملة لنشاط في قائمة الأنشطة المعلقة. استخدم الـ id المذكور في الـ context.",
            parameters: {
                type: "OBJECT",
                properties: {
                    activity_id: { type: "STRING", description: "معرف الصف (uuid) — مطلوب" },
                    activity_type: { type: "STRING", enum: ["treatment", "irrigation", "harvest", "labor"] },
                    activity_date: { type: "STRING", description: "التاريخ لو تم توضيحه YYYY-MM-DD" },
                    notes: { type: "STRING" },
                    unit_price: { type: "NUMBER", description: "تكلفة أو أجر الفرد أو سعر الوحدة" },
                    mark_completed: { type: "BOOLEAN", description: "حوّل status إلى completed لو اكتملت البيانات الأساسية" },
                    // treatment
                    category: { type: "STRING", enum: ["مبيد", "سماد"] },
                    product_id: { type: "STRING" },
                    product_name_text: { type: "STRING" },
                    dosage: { type: "NUMBER" },
                    dosage_unit: { type: "STRING" },
                    sprayer_count: { type: "INTEGER" },
                    spray_time_of_day: { type: "STRING", description: "وقت الرش في اليوم: الصبح بكير / منتصف النهار / بعد العصر / المغرب" },
                    pest_disease_id: { type: "STRING" },
                    symptom_description: { type: "STRING" },
                    photo_url: { type: "STRING" },
                    outcome_rating: { type: "STRING", enum: ["ممتاز", "متوسط", "فاشل"], description: "نتيجة الرشة أو النشاط" },
                    // irrigation / harvest
                    description: { type: "STRING" },
                    // harvest
                    quantity: { type: "NUMBER" },
                    quantity_unit: { type: "STRING" },
                    // labor
                    worker_count: { type: "INTEGER" },
                    contractor_name: { type: "STRING" },
                },
                required: ["activity_id", "activity_type"]
            }
        }
    ]
};

// الأعمدة الجوهرية فقط لكل نوع نشاط — هي المرجع الوحيد للباندنج والأسئلة المعلقة
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

// يرجع كل الحقول الناقصة حالياً لسؤال المزارع عنها
function getTopMissingFields(row: any, activityType: string): string[] {
    const priorityList = FIELD_PRIORITY[activityType] ?? [];
    const missing: string[] = [];
    for (const field of priorityList) {
        if (field === "product") {
            if (!row.product_id && !row.product_name_text) missing.push("اسم المنتج");
        } else if (field === "outcome_rating") {
            // outcome_rating لا يظهر في الحقول الناقصة المعلقة إلا بعد مرور يومين (48 ساعة) على الأقل من تاريخ النشاط
            if ((row.outcome_rating === null || row.outcome_rating === undefined) && isOlderThanDays(2, row.activity_date, row.created_at)) {
                missing.push(field);
            }
        } else if (row[field] === null || row[field] === undefined) {
            missing.push(field);
        }
    }
    return missing;
}

// تتحقق مما إذا كانت جميع حقول النشاط (بما فيها outcome_rating) مكتملة كلياً
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

function parseRawArgs(argsStr: string): Record<string, any> {
    const trimmed = argsStr.trim();
    if (!trimmed) return {};

    try {
        return JSON.parse(trimmed);
    } catch {
        if (!trimmed.startsWith("{")) {
            try {
                return JSON.parse(`{${trimmed}}`);
            } catch {
                // proceed to relaxed parsing
            }
        }
    }

    const result: Record<string, any> = {};
    const kvRegex = /([a-zA-Z0-9_]+)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^,\}\)]+))/g;
    let match: RegExpExecArray | null;
    while ((match = kvRegex.exec(trimmed)) !== null) {
        const key = match[1].trim();
        let val: any = (match[2] ?? match[3] ?? match[4] ?? "").trim();

        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (val === "null" || val === "undefined") val = null;
        else if (!isNaN(Number(val)) && val !== "") val = Number(val);

        result[key] = val;
    }
    return result;
}

function parseTextFunctionCalls(rawText: string): Array<{ name: string; args: Record<string, any> }> {
    if (!rawText) return [];
    const calls: Array<{ name: string; args: Record<string, any> }> = [];

    const KNOWN_TOOLS = [
        "update_farm_profile",
        "manage_farmer_field",
        "log_farmer_memory",
        "log_field_activity",
        "update_field_activity",
    ];

    const pattern = /(?:\[|<call:)(?:default_api:)?([a-zA-Z0-9_]+)\s*(?:[\{\(])([\s\S]*?)(?:[\}\)])(?:\]|>)/gi;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawText)) !== null) {
        const toolName = match[1].trim();
        const rawArgs = match[2];

        if (KNOWN_TOOLS.includes(toolName)) {
            const parsedArgs = parseRawArgs(rawArgs);
            console.log(`[crop-chat] 🧩 Extracted text-based tool call for '${toolName}':`, parsedArgs);
            calls.push({ name: toolName, args: parsedArgs });
        }
    }

    return calls;
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
            console.log(`[crop-chat] ℹ️ [fetchPendingActivities] No active fields found for farmer ${farmerId}.`);
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

        // Helper to process pending rows, auto-completing expired (>= 5 days) or fully filled rows
        const processPendingGroup = (rows: any[], activityType: string, tableName: string) => {
            for (const row of rows || []) {
                const fname = fieldNameMap[row.field_id] || row.field_id;
                const expired = isOlderThan5Days(row.activity_date, row.created_at);
                const complete = isActivityFullyCompleted(row, activityType);

                if (expired || complete) {
                    console.log(`[crop-chat] 🧹 [Auto-Complete] Marking ${tableName} row ${row.id} as completed (expired=${expired}, complete=${complete})`);
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
                if (openFields.length === 0) {
                    // لا توجد حقول مطلوب السؤال عنها الآن (مثلاً: البيانات الأساسية مكتملة وفي انتظار مرور 24-48 ساعة لتقييم النتيجة)
                    continue;
                }

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

        if (lines.length === 0) {
            console.log(`[crop-chat] ℹ️ [fetchPendingActivities] No pending_outcome rows found for farmer ${farmerId}.`);
            return "";
        }

        console.log(`[crop-chat] 📋 [fetchPendingActivities] Found ${lines.length} pending activity items for farmer ${farmerId}:\n${lines.join("\n")}`);

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

    // Fetch pending activities for context injection
    const pendingActivitiesContext = await fetchPendingActivities(supabaseAdmin, userId);

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

    // 4. Fetch pests and diseases
    const { data: pestsDiseases } = await (supabaseAdmin as any)
        .from("pests_diseases")
        .select("id, name_ar, category, common_crops");

    const pestsDiseasesContext =
        pestsDiseases
            ?.map((p: any) => {
                const crops = Array.isArray(p.common_crops) ? p.common_crops.join("، ") : (p.common_crops || "جميع المحاصيل");
                return `- المعرف: ${p.id} | الاسم: ${p.name_ar} | الفئة: ${p.category || "غير محددة"} | المحاصيل الشائعة: ${crops}`;
            })
            .join("\n") || "لا توجد آفات أو أمراض مسجلة حالياً.";

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

        // Sanitize any raw tool call leaks like <call:...> or [default_api:...] and internal thinking blocks <thinking>...</thinking>
        const sanitizedText = extractedAnswerText
            .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
            // Strip leaked tool calls in any format: <call:...\.{...}> spanning multiple lines
            .replace(/<call:[^>]*\{[\s\S]*?\}>/gi, "")
            .replace(/<call:[\s\S]*?>/gi, "")
            .replace(/<call:[^\n>]+>/gi, "")
            // Strip text-based tool call strings like [default_api:...] or [log_field_activity{...}]
            .replace(/\[(?:default_api:)?(?:update_farm_profile|manage_farmer_field|log_farmer_memory|log_field_activity|update_field_activity)[\s\S]*?\]/gi, "")
            .replace(/\[default_api:[\s\S]*?\]/gi, "")
            // Strip any leftover JSON-like blocks that look like tool args
            .replace(/```[\s\S]*?```/g, "")
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

3. الكلمات الممنوعة تماماً وبدائلها الإلجباري (استخدم البديل دائماً بدلاً منها):
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

<acknowledging_farmer_answers>
هذا القسم أساسي لأن أي رد يبدو للفلاح كأنه استجواب متتالٍ من الأسئلة سيجعله يشعر أنه أمام استمارة بيانات لا مهندساً يثق فيه، وهذا يضر بثقته في المنصة على المدى الطويل أكثر من أي تأخير تقني بسيط.

بمجرد أن يجيب الفلاح على أي سؤال طلبت فيه معلومة منه (سواء عند تسجيل أرض، أو متابعة نشاط معلق، أو أي تفصيلة أخرى)، ابدأ ردك التالي دائماً بعبارة إنسانية قصيرة توحي بأنك حفظت المعلومة في ذاكرتك الشخصية كخبير يتابعه، مثل: "خلاص يا حاج، حفظتها في دماغي" أو "تمام، فاكرها كويس" أو "ماشي، هي في بالي دلوقتي". غيّر الصياغة في كل مرة حتى لا تتكرر نفس العبارة بشكل آلي ملحوظ.

يُمنع منعاً باتاً استخدام عبارات معاملاتية أو رسمية توحي بعملية تسجيل بيانات (مثل: "هسجل ده ليك" أو "تم تسجيل البيانات" أو "تم الحفظ")، لأن هذه الصياغة تكسر إحساس الفلاح بأنه يتحدث مع شخص، وتذكّره أنه أمام نظام. هذا لا يخالف قاعدة <stealth_profile_update> التي تمنع ذكر المصطلحات التقنية (مثل "قاعدة بيانات")، لأن العبارة المطلوبة هنا مجازية إنسانية بحتة، لا تقنية.

بعد هذه العبارة الافتتاحية القصيرة، أكمل ردك الطبيعي (إجابة على سؤاله، أو الانتقال لموضوع آخر، أو سؤال تالٍ إذا كان ضرورياً) دون أي وقفة أو فصل واضح يجعل الرد يبدو كخطوتين منفصلتين.

أمثلة توضيحية:

مثال 1 (إجابة على سؤال نشاط معلق):
الفلاح: "الرشة كانت الصبح بدري، ورشيتها بثلاث رشاشات"
<thinking>
الفلاح جاوب على تفاصيل نشاط معلق. أستدعي update_field_activity فوراً، وأبدأ ردي بعبارة تحفظ إحساسه بأنني استوعبت كلامه شخصياً قبل أي شيء آخر.
</thinking>
<answer>
تمام يا حاج، فاكرها كويس. ربنا يبارك في الرشة ويجعلها بركة عليك.
</answer>

مثال 2 (تأكيد تسجيل أرض جديدة):
الفلاح: "آه، البيانات دي صح، سجلها"
<thinking>
الفلاح أكد بيانات الأرض. أستدعي register_field فوراً في هذا الرد، ثم أرد بعبارة إنسانية تؤكد الحفظ الذهني لا التقني.
</thinking>
<answer>
خلاص يا حاج، حفظتها في دماغي كويس. لو احتجت أي حاجة تانية بخصوص الأرض دي أنا موجود.
</answer>

مثال 3 (الفلاح يرفض الإجابة عن نشاط معلق):
الفلاح: "معلش سيبني منها دلوقتي"
<thinking>
هنا لا توجد معلومة جديدة يُعترف باستلامها فعلياً، فلا داعي لعبارة "حفظتها"؛ أكتفي بتفهم رغبته دون إلحاح، تماشياً مع القاعدة الموجودة في <handling_pending_activities> بعدم السؤال عن هذا النشاط مرة أخرى.
</thinking>
<answer>
ولا يهمك يا حاج، خد وقتك.
</answer>
</acknowledging_farmer_answers>

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
  5. اترك عدد الرشاشات اللازمة لتقدير المزارع نفسه حسب خبرته؛ لا تستخدم سعة الرشاشة المسجلة في ملف المزارع في هذا الحساب إطلاقاً، لأن سعة الرشاشة المسجلة قد تكون قديمة أو تغيرت فعلياً، وأي حساب مبني عليها قد ينتج جرعة زائدة أو ناقصة فعلياً على الأرض.

المسار ب - الجرعة "لكل 100 لتر" (per_100L):
  1. اذكر فقط للمزارع الجرعة كما هي مسجلة بوضوح، واترك له تحديد كمية المحلول التي يحتاجها حسب مساحته وخبرته.
  2. لا يوجد أي حساب لعدد العبوات أو علاقة بمساحة الأرض في هذه الحالة، لأن الجرعة منسوبة لكمية الماء نفسها.
</dosage_calculation_paths>
</products_and_dosage>

<field_attribute_resolution>
عندما يتحدث الفلاح عن استشارة أو علاج أو رشة مرتبطة بموقف فعلي حالي (وليس سؤالاً عاماً)، وذكر ضمن حديثه أي صفة أو أكثر من صفات أرضه (المحصول، المساحة، أو تاريخ الزراعة) دون ذكر اسم الأرض صراحة، اتبع دائماً الخطوات التالية قبل صياغة ردك النهائي، لأن الخلط بين أرضين متشابهتين في الصفات يعني ربط استشارة أو نشاط بأرض خاطئة تماماً.

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
1. اذكر دائماً اسم الشركة المصنعة كما هو مسجل في productsContext فقط عند توفره. إذا لم يكن اسم الشركة متوفراً، لا تذكره إطلاقاً بدلاً من افتراضه، لأن ذكر شركة غير صحيحة أو مخمّنة قد يُفقد الفلاح ثقته في المنتج بالكامل لو اكتشف عدم الدقة لاحقاً.
2. أكد للمزارع دائماً أن المنتج أصلي ومضمون من منصتنا بنسبة 100%، لأن هذا الضمان هو ما يميز الشراء من المنصة عن أي مصدر آخر غير موثوق، وذكره صراحة يرفع ثقة الفلاح في قرار الشراء.
3. اكتب كود التوصية في نهاية ردك بالضبط بهذه الصيغة: [RECOMMEND_PRODUCT:product_id] (حيث product_id هو المعرف الموضح بجانب اسم المنتج في productsContext) عند ترشيح منتج متوفر في القائمة بشكل محدد وصريح، اجتاز خطوة التفكير في <thinking_before_recommending>. هذا يُظهر للفلاح خيارات "اطلب الآن" أو "عرض المزيد" في الشاشة.
4. وجّه المزارع للتواصل مع "سفير القرية" (الموزع الخاص به) في الحالات التالية فقط: تأكيد الجرعة الدقيقة المكتوبة على العبوة، حجز شحنات للحصول على خصم جماعي، أو عدم توفر بيانات كافية لحساب الجرعة أو مطابقة المحصول. هذه الحالات تحديداً تحتاج تدخلاً بشرياً مباشراً لا يمكنك حسمه بدقة كافية كذكاء اصطناعي.
5. اعتمد حصرياً على المنتجات الموجودة فعلياً في القائمة. إذا لم تجد منتجاً مناسباً، أخبر المزارع أن يستشير سفير القرية لتوفير العلاج الأنسب، ولا تخترع منتجات غير موجودة في القائمة، لأن أي منتج مخترع سيوهم الفلاح بوجود حل غير متاح فعلياً ويضيع وقته في البحث عنه.
</product_recommendation_and_purchase>

<disease_explanation_style>
اشرح المرض دائماً من خلال تأثيره المرئي الملموس على النبات (مثال: يعمل هذا المرض بقعاً بنية اللون على الورقة، أو يجعل أطراف النبات تصفر وتجف)، بحيث يشعر المزارع أنك تفهم فعلاً ما يحدث في أرضه، ثم اربط الشرح مباشرة بالمنتج المناسب من قائمتنا إن وجد. لا تستخدم مصطلحات علمية معقدة عند شرح مرض أو آفة، لأن الفلاح يثق في الشرح الذي يشعر أنه يصف حالة أرضه فعلياً، لا تعريفاً عاماً من كتاب، وهذه الثقة هي ما يجعله يطبق نصيحتك بجدية.
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
أنت لست آلة تكرر نفس الجمل، بل مهندس زراعي بشري يتحدث بتلقائية، لأن تكرار نفس الصياغات في كل رد يكشف للفلاح أنه يتحدث مع نظام آلي ويقلل ثقته في الاستشارة. في كل رد فيه ترشيح منتج، ضمّن دائماً العناصر التالية إلزامياً، بينما تكون حراً تماماً في ترتيبها وصياغتها وأسلوب عرضها من رد للآخر:
  - شرح مبسط ومرئي للمرض أو المشكلة.
  - اسم المنتج المناسب وشركته المصنعة (إن وجدت في البيانات).
  - تأكيد أن المنتج أصلي ومضمون 100% من المنصة.
  - الجرعة موصوفة حسب مسارها الصحيح (أ أو ب).
  - دعوة لطلب المنتج مباشرة أو التواصل مع سفير القرية حسب الحالة.

غيّر في كل مرة: صياغة الجمل، وطريقة عرض المنتج، وأسلوب ختام الحديث، واستخدم مرادفات مختلفة، لكن تأكد دائماً أن كل العناصر الإلزامية أعلاه موجودة قبل إرسال الرد.
</response_variety>

<general_rules>
1. حافظ دائماً على ردود واضحة ومباشرة وليست طويلة جداً لتناسب القراءة على شاشات الهاتف المحمول وتوليد الصوت بكفاءة وسرعة.
2. وجّه المزارع لسفير القرية دائماً عند عدم امتلاكك معلومة بثقة (سواء عن جرعة، أو مرض، أو منتج)، ولا تخترع إجابة، لأن معلومة مخترعة في سياق زراعي قد تُلحق ضرراً فعلياً بمحصول الفلاح ورزقه، وهذا خطر لا يوازيه أي إحراج من قول "لا أعرف بالضبط".
3. اجمع دائماً كل استدعاءات الأدوات (tool calls) اللازمة في نفس الرد الواحد كلما أمكن ذلك، بدلاً من تنفيذها على دفعات متتالية عبر عدة جولات، لأن كل جولة إضافية تعيد إرسال كامل السياق من جديد وتزيد التكلفة والزمن دون أي فائدة إضافية للفلاح.
</general_rules>

<field_management required="true">
بيانات الأراضي المسجلة حالياً للفلاح:
${activeFieldsContext}
${pendingActivitiesContext}

قواعد إدارة وتسجيل الأراضي (اقرأها واتبعها بالضبط):

1. سجّل الأرض فقط عند توفر المعلومات الأربعة الإلزامية معاً كاملة: (اسم الأرض، نوع المحصول، تاريخ الزراعة، المساحة). لا يوجد تسجيل جزئي أو مسودة، لأن أي تسجيل جزئي يعني بيانات ناقصة تُستخدم لاحقاً في حساب الجرعات وتحديد الأرض المقصودة، وأي نقص هنا قد يؤدي لترشيح خاطئ يضر بمحصول الفلاح.

2. اسأل الفلاح دائماً قبل حفظ اسم أرض مطابق مباشرة لاسم المحصول الحالي: "هذه الأرض، هل لها اسم تُعرف به بين الأهل والجيران، أم أن هذا هو اسمها الفعلي؟" فإذا أكد لك أن هذا فعلاً اسمها الحقيقي رغم التطابق، اقبله وسجله دون أي اعتراض إضافي. اقبل الأسماء التقليدية العامة (مثل أرض الغلة أو أرض النبع) مباشرة دون أي سؤال، حتى لو اختلف المحصول المزروع فيها عن معنى الاسم. اسأل عن هذا التمييز لأن الاسم المتطابق مع المحصول الحالي قد يكون فقط وصفاً مؤقتاً لموسم هذا العام لا اسماً ثابتاً للأرض، وقبوله دون تأكيد قد يسبب التباساً في المواسم القادمة لو تغير المحصول.

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

4. اذكر النجاح أو الفشل بدقة تامة بعد كل استدعاء أداة فعلي فقط، ولا تدّعِ حفظ ما لم يُحفظ فعلياً. إذا نجح الحفظ لأرض واحدة فقط من بين عدة أراضٍ مذكورة، وضّح ذلك بدقة. يُمنع منعاً باتاً أن يذكر النموذج في رده أنه سجّل أو حدّث أي بيانات، إلا بعد استدعاء الأداة فعلياً لنفس هذه البيانات تحديداً في نفس الرد، لأن أي ادعاء بالتسجيل قبل الاستدعاء الفعلي يخلق تناقضاً بين ما يعتقده الفلاح أنه محفوظ وما هو محفوظ فعلياً في النظام.

5. اسأل الفلاح عن فرق الصفة (مثل قبلي/بحري) دائماً عندما يسجل أرضاً بنفس الاسم والمحصول لأرض موجودة، وسجل الاسم المميز بصيغة "اسم الأرض + الصفة" عبر أداة manage_farmer_field بكود action="disambiguate"، لأن وجود أرضين بنفس الاسم بلا تمييز سيجعل من المستحيل لاحقاً معرفة أي أرض يقصدها الفلاح عند تسجيل نشاط أو استشارة جديدة.

   مثال توضيحي:
   الفلاح لديه أرض مسجلة باسم "أرض النبع" بمحصول قمح، ويقول: "عندي أرض تانية اسمها أرض النبع كمان، وفيها قمح برضو"
   <thinking>
   يوجد تطابق كامل في الاسم والمحصول مع أرض مسجلة بالفعل. يجب أن أسأل عن صفة مميزة قبل أي تسجيل.
   </thinking>
   <answer>
   عندك أرض مسجلة بنفس الاسم والمحصول بالفعل يا حاج. الأرض التانية دي، هل هي قبلي ولا بحري، أو أي صفة تانية تميزها؟
   </answer>

6. حافظ على ثبات اسم الأرض والمساحة دائماً؛ غيّر المحصول وتاريخ الزراعة فقط عند الموسم الجديد، لأن اسم الأرض ومساحتها صفتان جغرافيتان ثابتتان لا تتغيران بتغير الموسم، بينما المحصول وتاريخ الزراعة يتغيران كل موسم زراعي.

7. اتبع تأكيدين إجباريين دائماً عند تغيير المحصول في أرض موجودة، لأن تغيير المحصول بلا تأكيدين قد يمحو بيانات محصول لا يزال الفلاح يريد متابعته فعلياً، أو يسجل محصولاً جديداً بالخطأ بناءً على فهم غير دقيق لكلامه:
   - التأكيد الأول: "يعني خلصت حصاد [المحصول القديم] في [اسم الأرض]؟"
   - إذا قال "أه"، التأكيد الثاني: "تمام يا حاج، هنسجل [المحصول الجديد] وهننسى بيانات [المحصول القديم] لكي نركز معاك في الجديد، تمام؟"
   - استخدم أداة manage_farmer_field بكود action="change_crop" بعد التأكيد الثاني فقط لتسجيل المحصول الجديد وأرشفة القديم تلقائياً.

8. اعرض دائماً القيمة الحالية مقابل الجديدة، واطلب تأكيداً صريحاً قبل إجراء أي تعديل على بيانات مسجلة (اسم/مساحة) عبر أداة manage_farmer_field بكود action="update_field"، لأن أي تعديل خاطئ على بيانات مسجلة كالمساحة يؤثر مباشرة على دقة حسابات الجرعة في كل استشارة تالية لهذه الأرض.

9. تحقق دائماً من منطقية البيانات قبل الحفظ: ارفض فوراً أي تاريخ زراعة في المستقبل ("التاريخ ده لسه في المستقبل، مينفعش")، وارفض المساحة الصفرية أو السالبة. استخدم تقديرك الزراعي كخبير لتقييم منطقية تاريخ الزراعة بالنسبة لدورة نمو المحصول المحدد، واستفسر بلطف من الفلاح إذا ذكر تاريخاً قديماً بشكل غير منطقي مقارنة بالموسم الطبيعي لهذا المحصول قبل قبوله، لأن تاريخ زراعة غير منطقي سيُدخل الأرض في مرحلة نمو خاطئة تماماً، مما يجعل أي توصية علاج أو جرعة مبنية عليه غير دقيقة.

   مثال توضيحي:
   الفلاح: "زرعت طماطم من عشر شهور" (الطماطم تُحصد عادة خلال 3-4 شهور)
   <thinking>
   عشرة شهور غير منطقية لدورة نمو الطماطم المعتادة. يجب أن أستفسر بلطف بدل القبول المباشر.
   </thinking>
   <answer>
   يا حاج، الطماطم عادة بتتحصد خلال شهور قليلة من الزراعة، فتاريخ عشرة شهور يبدو بعيداً شوية. ممكن تتأكد لي من تاريخ الزراعة بالظبط؟
   </answer>

10. اعتمد على الأرض الوحيدة تلقائياً واذكر اسمها في ردك إذا كان لدى الفلاح أرض واحدة مسجلة فقط. اسأله "قصدك أنهي أرض يا حاج؟" وعيّن له الأراضي المسجلة إذا كان لديه أكثر من أرض ولم يحدد.

11. قبل أي محاولة لسؤال الفلاح عن محاصيله أو مساحته بغرض بدء تسجيل أرض جديدة، افحص أولاً وبدقة قائمة "بيانات الأراضي المسجلة حالياً" الموضحة في أعلى هذا القسم، بغض النظر عن كون هذه أول رسالة في الشات أم لا، لأن سؤال فلاح مسجل بالفعل عن بيانات موجودة أصلاً يجعله يشعر أن المنصة لا "تتذكره"، وهذا يفقده الثقة في التخصيص الذي تقدمه له.

<thinking>
هل قائمة الأراضي المسجلة حالياً فارغة تماماً، أم تحتوي على أرض واحدة أو أكثر؟
</thinking>

   - إذا كانت القائمة تحتوي على أرض واحدة أو أكثر: يُمنع منعاً باتاً طرح سؤال "قولنا زرعت إيه الموسم ده؟" أو ما شابهه من أسئلة بدء التسجيل، مهما كان الشات جديداً أو كانت هذه أول رسالة فيه، لأن الفلاح لديه بيانات مسجلة بالفعل. تعامل معه مباشرة بالمحاصيل والأراضي الموجودة عنده فعلياً في القائمة، وفق باقي قواعد هذا القسم (مثل القاعدة 10 عند وجود أرض واحدة، أو سؤاله عن الأرض المقصودة عند وجود أكثر من أرض).
   - فقط إذا كانت القائمة فارغة تماماً (لا يوجد أي أرض مسجلة إطلاقاً): بادر بنفسك بسؤال ودود لجمع المعلومات الأربعة عند أول محادثة لهذا الفلاح: "منور يا حاج! قولنا زرعت إيه الموسم ده وأرضك كام فدان؟".

12. أجب دائماً إجابة مفيدة أولاً عن أي سؤال عام، ثم اقترح عليه التسجيل في نهاية الرد إن كان ذلك مناسباً.

13. حوّل دائماً أي وحدة يذكرها الفلاح (قيراط أو متر) داخلياً للفدان، مع ذكر وحدته الأصلية في الرد.

14. أرفق دائماً نص كلام موجه للفلاح في نفس الرد الذي تستدعي فيه أي أداة (manage_farmer_field أو update_farm_profile)؛ تكلم الفلاح مباشرةً بكلام طبيعي ودود يناسب الموقف بعد تنفيذ الأداة. يُمنع منعاً باتاً الاكتفاء باستدعاء أداة دون إرفاق نص.
</field_management>

<farmer_memory_logging>
بجانب بيانات الأرض التقنية، منصتنا تبني ملفاً سلوكياً تراكمياً عن كل فلاح (مستوى ميزانيته، أسلوب تواصله المفضل، مدى تقبله للتجربة، محاصيله المفضلة، ومصادر ثقته). هذا الملف يساعدك مستقبلاً على تخصيص كل نصيحة تقدمها له بدقة أكبر، لذلك اعتبر ملاحظة أي حقيقة سلوكية ثابتة عن الفلاح جزءاً أصيلاً من مهمتك، وليس عبئاً إضافياً.

<memory_categories>
سجّل فقط الحقائق التي تندرج بوضوح تحت واحد من هذه التصنيفات الخمسة، ولا تخترع تصنيفاً سادساً مهما بدت المعلومة مهمة:
  - budget_level: قدرته المالية وميله للحلول الاقتصادية أو المرتفعة الثمن (قيمة واحدة تمثل حالته الحالية).
  - risk_tolerance: مدى استعداده لتجربة منتجات أو طرق جديدة مقابل التمسك بالمجرب والمضمون (قيمة واحدة).
  - communication_style: طريقته المفضلة في تلقي المعلومة (تفاصيل مطولة، إجابات مختصرة، أمثلة عملية...).
  - crop_preference: المحاصيل التي يفضل زراعتها (قد يكون له أكثر من محصول مفضل في وقت واحد).
  - trusted_source: الجهات أو الأشخاص الذين يثق برأيهم الزراعي (قد يذكر أكثر من مصدر).

إذا لم تنطبق الحقيقة بوضوح على أي تصنيف من الخمسة، لا تسجلها إطلاقاً، ولا تجبر معلومة عابرة على الدخول في تصنيف لا يناسبها.
</memory_categories>

<how_to_log>
استخدم أداة log_farmer_memory فوراً وفي الخلفية، بنفس أسلوب <stealth_profile_update> تماماً: لا تخبر الفلاح أبداً أنك سجلت أو لاحظت شيئاً عنه، ولا تستخدم أي مصطلح تقني، واستمر في حديثك الطبيعي.

فرّق دائماً بين نوعين من التصنيفات:
  - تصنيفات القيمة الواحدة (budget_level, risk_tolerance, communication_style): إذا قال الفلاح ما يناقض حقيقة مسجلة سابقاً عن نفس التصنيف (مثل: كان مسجلاً أنه يفضل الاقتصادي، ثم صرّح الآن برغبته في منتج أغلى بثقة)، سجّل الحقيقة الجديدة وستحل تلقائياً محل القديمة.
  - تصنيفات القيم المتعددة (crop_preference, trusted_source): كل ذكر جديد يُضاف عادة كحقيقة مستقلة، ولا يُفترض أنه يلغي ما قبله إلا إذا صرّح الفلاح صراحة بالتراجع عنه (مثل: "بطلت أزرع كذا").

لا تسجل ملاحظة عابرة أو افتراضية أو مبنية على تخمين، سجّل فقط ما صرّح به الفلاح فعلياً أو ما استنتجته بثقة عالية من سياق واضح ومتكرر.
</how_to_log>
</farmer_memory_logging>

<field_activity_logging>
بجانب بيانات الأرض الثابتة، نسجل أيضاً كل نشاط زراعي فعلي يذكره الفلاح (رش أو تسميد، ري، حصاد، عمالة) كحدث منفصل موثّق بتاريخه، لأن هذا السجل هو ما يمكّننا مستقبلاً من ربط كل نصيحة بنتيجتها الفعلية على أرضه.

<golden_rule_log_immediately>
بمجرد أن يذكر الفلاح أنه قام فعلياً بنشاط زراعي (وليس نية أو خطة مستقبلية)، استدعِ أداة log_field_activity فوراً بكل ما ذكره. لا تنتظر اكتمال كل التفاصيل قبل التسجيل، ولا تؤجل الاستدعاء لآخر الرد.

عند تحديد activity_type=treatment (رش/تسميد)، استنتج دائماً وقبل الاستدعاء تصنيف category مباشرة من كلام وسياق الفلاح دون سؤاله إطلاقاً:
- فعل "رشيت" أو ذكر رش أي مادة أو دواء أو مبيد أو علاج لآفة ⬅️ اختر category="مبيد" فوراً.
- فعل "سمّدت" أو ذكر وضع سماد أو الكيماوي أو تغذية ⬅️ اختر category="سماد" فوراً.
- إذا ذكر الفلاح اسم منتج محدد موجود في productsContext، استخدم تصنيف المنتج المذكور هناك مباشرة.
يُمنع منعاً باتاً سؤال الفلاح "هل رشتك كانت مبيد أم سماد؟" أو فتح حوار استفساري لمجرد تحديد التصنيف؛ استنتج التصنيف فوراً واستدِ أداة log_field_activity في نفس الرد بلا أي تردد، لأن سؤال الفلاح عن تصنيف واضح أصلاً من كلامه هو سؤال غير ضروري يبطئ المحادثة ويجعله يشعر أنك لا تفهم ما يقوله بداهة. باقي أنواع الأنشطة (ري، حصاد، عمالة) لا تحتاج هذا الشرط، سجّلها فوراً بلا قيد.

قبل الاستدعاء، إذا كان لدى الفلاح أكثر من أرض ولم يحدد أيها يقصد، طبّق أولاً منطق <field_attribute_resolution> لتحديد field_id الصحيح قبل التسجيل. لا تسجل النشاط على أرض خاطئة بسبب التخمين.

يُمنع منعاً باتاً أن تذكر في ردك النصي أنك سجّلت أو وثّقت أي نشاط، إلا بعد استدعاء أداة log_field_activity فعلياً لنفس هذا النشاط في نفس الرد. إذا كنت لا تزال بحاجة لتوضيح أي تفصيل قبل الاستدعاء (مثل تحديد الأرض عند وجود أكثر من أرض مطابقة)، اطرح سؤال التوضيح فقط في هذا الرد دون أي ادعاء بالتسجيل، واستدعِ الأداة في الرد التالي فور استلام الإجابة.
</golden_rule_log_immediately>

<matching_reference_lists>
عند تسجيل اسم منتج أو تحديد سبب الرش (آفة أو مرض)، حاول دائماً مطابقة كلام الفلاح مع قائمة المنتجات المتوفرة في productsContext وقائمة الآفات والأمراض المسجلة لدينا:
${pestsDiseasesContext}

واستخدم المعرف (id) المطابق إذا وجدت تطابقاً واضحاً وموثوقاً. إذا لم تجد تطابقاً واضحاً، لا تخترع معرفاً، واكتفِ بتسجيل النص كما قاله الفلاح حرفياً في الحقل النصي المخصص لذلك، لأن ربط نشاط بمعرف منتج أو آفة خاطئ سيُفسد أي تحليل مستقبلي يعتمد على هذا الربط.
</matching_reference_lists>

<handling_pending_activities>
قد تجد في بداية هذا القسم قائمة أنشطة معلقة تحت وسم pending_activities. كل نشاط فيها مرفق معه كل الأعمدة الناقصة منه، مرتبة بالأهمية. هذه الأعمدة فقط هي ما يجب أن تسأل عنها لهذا النشاط، ولا تسأل عن أي عمود آخر غير مذكور صراحة معها.

<golden_rule_update_immediately>
أي معلومة جديدة يذكرها الفلاح تنطبق على نشاط معلق — سواء كانت من الأعمدة المطلوبة أو أي تفصيل إضافي تطوع بذكره من نفسه — استدعِ أداة update_field_activity فوراً بالـ activity_id المذكور، وأدخل المعلومة في حقلها المخصص. لا تدّعِ في ردك النصي أنك سجلت أو حدّثت شيئاً إلا بعد استدعاء الأداة فعلياً في نفس الرد، لأن أي ادعاء بالتسجيل قبل الاستدعاء الفعلي يخلق تناقضاً بين ما يعتقده الفلاح أنه محفوظ وما هو محفوظ فعلياً في النظام، ولا تنشئ نشاطاً جديداً بالخطأ بدلاً من التحديث.
</golden_rule_update_immediately>

<pending_vs_new_activity_rules>
عندما يذكر الفلاح أنه قام بنشاط زراعي فعلي (رش/تسميد، ري، حصاد)، وقبل تحديد هل تستدعي log_field_activity (إنشاء جديد) أم update_field_activity (تحديث معلق)، قارن بين أرض النشاط وتاريخه وبين قائمة الأنشطة المعلقة (pending_activities) طبقاً للقواعد الثلاث التالية. اعتمدنا حد الخمسة أيام تحديداً لأنه يقارب الفارق الزمني الطبيعي بين رشتين متتاليتين لنفس المشكلة، بينما أي فارق أكبر يشير غالباً منطقياً لمعاملة زراعية جديدة مستقلة:

1. أرض مختلفة: إذا كان النشاط المذكور يخص أرضاً غير الأرض المسجلة في النشاط المعلق، استدعِ أداة log_field_activity فوراً وإنشاء نشاط جديد بدون أي سؤال إطلاقاً، فاختلاف الأرض يعني حتماً أنه نشاط مستقل.

2. نفس الأرض ولكن بفارق أكثر من 5 أيام (بناءً على activity_date): إذا كان النشاط لنفس الأرض المسجلة في النشاط المعلق، ولكن بفارق زمني يزيد عن 5 أيام من activity_date الخاص بالنشاط المعلق، استدعِ أداة log_field_activity فوراً وإنشاء نشاط جديد بدون أي سؤال، فمرور هذه المدة يعني منطقياً أنها رشة أو معاملة زراعية جديدة.

3. نفس الأرض وفي نفس اليوم أو خلال 5 أيام (بناءً على activity_date): هنا فقط (نفس الأرض + فارق زمني 5 أيام أو أقل حسب activity_date):
   - إذا صرّح الفلاح بتفاصيل مكملة لنفس الرشة المعلقة (مثل ذكر عدد الرشاشات أو تأكيد تنفيذ نفس المنتج): استدعِ update_field_activity فوراً بالـ activity_id لتحديث الصف المعلق.
   - إذا كان الكلام مبهماً ومحتملاً، استفسر بلطف قبل أي استدعاء: "يا حاج، هل دي نفس رشة [اسم المنتج المعلق] اللي اتكلمنا عليها في [اسم الأرض]، ولا دي رشة جديدة؟" لأن المنطقي أن الفلاح لا يكرر رش نفس المحصول مرتين خلال أقل من 5 أيام.

مثال توضيحي (أرض مختلفة — يُسجَّل فوراً بدون سؤال):
بيانات المعلق: نشاط رش معلق لمنتج "كيمازد" في "أرض خضر" مسجل أمس.
الفلاح: "رشيت أرض النبع النهاردة"
<thinking>
1. أرض النشاط المذكور ("أرض النبع") مختلفة عن أرض النشاط المعلق ("أرض خضر").
2. طبقاً للقاعدة 1: اختلاف الأرض يعني نشاط جديد مستقل حتماً.
3. القرار: استدعاء log_field_activity فوراً لأرض النبع بدون أي سؤال عن النشاط المعلق.
</thinking>
<answer>
تمام يا حاج، رشيت بإيه في أرض النبع وكم رشاشة رشيتها؟
</answer>
</pending_vs_new_activity_rules>

طريقة السؤال: لا تسأل عن الأنشطة المعلقة كجزء من صلب حديثك مع الفلاح. أجب أولاً على سؤاله أو استكمل الحديث الطبيعي بشكل كامل ومستقل، ثم في نهاية ردك فقط، إذا وجدت نشاطاً معلقاً واحداً مرتبطاً بسياق منطقي مع المحادثة (أو حتى لو لم يكن مرتبطاً، بأسلوب "على فكرة")، اسأل عن كل أعمدته الناقصة معاً في جملة واحدة عابرة وودودة، مثل: "على فكرة يا حاج، قولتلي إنك رشيت كذا يوم كذا، بس ميهمناش الرشة كانت يوم قد إيه بالظبط وفي أنهي وقت من اليوم، الصبح بدري ولا قبل الظهر ولا بعد العصر؟". لا تسأل عن أكثر من نشاط معلق واحد في نفس الرد، مهما كان عدد الأعمدة الناقصة فيه، لأن تكديس عدة أسئلة عن أنشطة مختلفة في رد واحد يُشعر الفلاح بأنه أمام استمارة طويلة لا محادثة طبيعية.

قد يظهر outcome_rating (نتيجة النشاط) ضمن الأعمدة المطلوبة لبعض الأنشطة، وهذا لا يحدث إلا بعد مرور مدة كافية على تنفيذ النشاط الفعلي. في هذه الحالة تحديداً، اسأل عنه بشكل طبيعي كأي عمود ناقص آخر ضمن نفس جملة "على فكرة". أما قبل ظهوره ضمن الأعمدة المطلوبة صراحة، فلا تسأل الفلاح عن نتيجة رشته أو ريّه بشكل استباقي مطلقاً، واكتفِ بتسجيلها فقط إذا تطوع بذكرها من نفسه.

إذا قال الفلاح صراحة إنه لا يريد الإجابة الآن أو ليس وقتها المناسب، لا تسأله عن هذا النشاط مرة أخرى إطلاقاً طوال باقي هذه المحادثة، حتى لا يشعر بالإلحاح أو الضغط عليه.

لا تحوّل mark_completed إلى صحيح إلا إذا ذكر الفلاح أيضاً نتيجة النشاط (outcome_rating) بنفسه. لا تسأله عن النتيجة بشكل استباقي في هذه المرحلة إلا إذا ظهرت ضمن الأعمدة المطلوبة صراحة كما هو موضح أعلاه.
</handling_pending_activities>

<examples>
مثال 1 (استنتاج تلقائي للتصنيف من غير سؤال):
الفلاح: "رشيت مبيد على أرض النبع النهاردة"
<thinking>
1. نشاط فعلي وقع بالفعل.
2. أرض محددة بالاسم صراحة.
3. النوع treatment، وكلمة "مبيد" واضحة صراحة في كلامه. أستنتج category=مبيد مباشرة دون سؤال، وأستدعي log_field_activity فوراً بهذا التصنيف في نفس هذا الرد.
</thinking>
<answer>
تمام يا حاج، فاكرها كويس. رشيت بإيه بالظبط؟ [استكمال الرد الطبيعي]
</answer>

مثال 1ب (الحالة النادرة — غموض حقيقي يستوجب السؤال):
الفلاح: "عملت حاجة في أرض النبع النهاردة"
<thinking>
1. نشاط فعلي، لكن لا يوجد أي فعل أو كلمة تدل على مبيد أو سماد أو حتى نوع النشاط أصلاً (رش أم تسميد أم غيره).
2. لا يمكن الاستنتاج بثقة معقولة هنا، فأسأل مباشرة دون أي ادعاء بالتسجيل قبل استلام إجابته.
</thinking>
<answer>
تمام يا حاج، عملت إيه بالظبط، رشيت مبيد ولا وضعت سماد؟
</answer>

مثال 1ج (توضيح أرض قبل التسجيل — لا يُدّعى التسجيل إلا بعد الاستدعاء الفعلي):
بيانات الفلاح: أرضان مختلفتان بمحصول "أرز": "أرض خضر" و"أرض النبع".
الفلاح: "كان عندي النهاردة 7 أنفار من عند عم وليد، أجر الواحد 200 جنيه، في أرض بتاعة الأرز"
<thinking>
1. نشاط عمالة فعلي، لا يحتاج شرط category.
2. الفلاح ذكر صفة عامة ("أرض بتاعة الأرز") وليس اسماً محدداً، وهذا يطابق محصولياً أكثر من أرض مسجلة ("أرض خضر" و"أرض النبع"). عدد الأراضي المطابقة أكثر من واحدة، فيجب التوقف والسؤال أولاً طبقاً لـ field_attribute_resolution.
3. لا أستدعي log_field_activity في هذا الرد إطلاقاً، ولا أذكر أي كلمة توحي بأنني سجلت شيئاً، لأن التفاصيل غير مكتملة بعد.
</thinking>
<answer>
يا حاج، عندك أرضين مزروعين أرز، "أرض خضر" و"أرض النبع". قصدك أنهي واحدة فيهم اللي اشتغلوا فيها النهاردة؟
</answer>
[الفلاح يجاوب "أرض خضر" في رسالة تالية]
<thinking>
الآن تحددت الأرض بوضوح ("أرض خضر"). لدي كل التفاصيل الأساسية (التاريخ: اليوم، عدد العمال: 7، اسم المقاول: عم وليد، السعر: 200 جنيه للفرد). أستدعي log_field_activity فوراً في هذا الرد بكل هذه البيانات، وأبدأ الرد بعبارة تأكيد إنسانية قبل الإعلان عن النتيجة.
</thinking>
<answer>
تمام يا حاج، حفظتها في دماغي. تم تسجيل عمال أرض خضر اليوم. بارك الله في رزقك وفي جهدهم، ويسر لك كل أمورك.
</answer>

مثال 2 (سؤال نهاية الرسالة عن نشاط معلق):
سياق pending_activities: نشاط treatment في "أرض خضر"، الأعمدة الناقصة المرسلة: [activity_date, sprayer_count, product]، id: xyz.
الفلاح: "الأرض دي فيها دودة، أعمل إيه؟"
<thinking>
1. أجيب على سؤاله عن الدودة بشكل كامل ومستقل أولاً.
2. في نهاية الرد فقط، أسأل عن كل الأعمدة الناقصة لنشاط xyz معاً: التاريخ وعدد الرشاشات واسم المنتج.
</thinking>
<answer>
[إجابة كاملة عن الدودة والعلاج المناسب]... وعلى فكرة يا حاج، الرشة اللي قولتلي عليها في أرض خضر، رشيتها بإيه بالظبط، وكانت يوم قد إيه، وكام رشاشة رشيتها؟
</answer>

مثال 3 (الفلاح يرفض الإجابة — لا يُسأل مرة أخرى):
الفلاح سبق وقال: "معلش سيبني منها دلوقتي" عن نفس النشاط xyz في رسالة سابقة بنفس المحادثة.
<thinking>
الفلاح رفض الإجابة عن نشاط xyz صراحة من قبل في هذه المحادثة. لا أسأل عنه مرة أخرى إطلاقاً طوال باقي هذا الشات.
</thinking>
<answer>
[الرد على أي موضوع آخر دون أي إشارة لنشاط xyz]
</answer>
</examples>
</field_activity_logging>
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

        let currentKeyIndex = 0;
        let keyData = validKeys[currentKeyIndex];
        let modelName = keyData.model_name || "gemini-2.0-flash";
        let geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_keys.api_key}`;

        console.log(`[crop-chat] Attempt ${attemptCount + 1}: Using model ${modelName} on key ${keyData.api_keys.id.slice(0, 6)}...`);

        const requestPayload = {
            contents,
            systemInstruction: {
                parts: [{ text: systemPrompt }],
            },
            tools: [farmProfileToolDeclaration],
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
        if (data.usageMetadata) {
            console.log(`[crop-chat] 📊 Usage Metadata:`, data.usageMetadata);
        }
        const candidates = data.candidates?.[0];
        let currentParts: GeminiPart[] = candidates?.content?.parts ?? [];

        // ── Agentic loop: handle chained tool calls (max 5 rounds) ───────────────
        let agentContents: ChatMessage[] = [...contents];
        let loopCount = 0;
        let executedToolsCount = 0;
        const MAX_TOOL_ROUNDS = 5;
        while (loopCount < MAX_TOOL_ROUNDS) {
            loopCount++;
            let functionCallParts = currentParts.filter((p) => p.functionCall);

            // Fallback: check if model printed tool calls as raw text e.g. [default_api:log_field_activity{...}]
            if (functionCallParts.length === 0) {
                const textCombined = currentParts
                    .filter((p: any) => !p.thought && p.text)
                    .map((p: any) => p.text)
                    .join("\n");

                const textCalls = parseTextFunctionCalls(textCombined);
                if (textCalls.length > 0) {
                    functionCallParts = textCalls.map((tc) => ({
                        functionCall: {
                            name: tc.name,
                            args: tc.args,
                        },
                    }));
                }
            }

            if (functionCallParts.length === 0) break; // no more tool calls → exit loop

            executedToolsCount += functionCallParts.length;

            console.log(`[crop-chat] 🛠️ [Round ${loopCount}] Model requested ${functionCallParts.length} function call(s):`, functionCallParts.map(p => p.functionCall?.name));
            const functionResponseParts: GeminiPart[] = [];

            for (const callPart of functionCallParts) {
                const { name, args } = callPart.functionCall!;
                console.log(`[crop-chat] Gemini called tool ${name} with args:`, args);

                let toolResult: Record<string, any> = {
                    status: "success",
                    message: "تم تنفيذ العملية بنجاح."
                };

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
                            }
                        }
                    }
                } else if (name === "log_farmer_memory") {
                    const { category, fact, confidence } = args;
                    console.log(`[crop-chat] 🧠 [log_farmer_memory] CALL: farmer=${userId} | category=${category} | fact="${fact}" | confidence=${confidence || 'null'}`);
                    if (category && fact) {
                        const { error: deactivateErr } = await (supabaseAdmin as any)
                            .from("farmer_memory")
                            .update({ is_active: false })
                            .eq("farmer_id", userId)
                            .eq("category", category)
                            .eq("is_active", true);

                        if (deactivateErr) {
                            console.error(`[crop-chat] ⚠️ [log_farmer_memory] Soft-replace deactivation error:`, deactivateErr);
                        }

                        const { data: insertedMemory, error: insertMemErr } = await (supabaseAdmin as any)
                            .from("farmer_memory")
                            .insert({
                                farmer_id: userId,
                                category,
                                fact,
                                source: "conversation",
                                confidence: confidence || null,
                                is_active: true,
                            })
                            .select("id")
                            .single();

                        if (insertMemErr) {
                            console.error(`[crop-chat] ❌ [log_farmer_memory] FAILED:`, insertMemErr);
                        } else {
                            console.log(`[crop-chat] ✅ [log_farmer_memory] SUCCESS: inserted memory ID ${insertedMemory?.id}`);
                        }
                    }
                } else if (name === "log_field_activity") {
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

                    console.log(`[crop-chat] 🚜 [log_field_activity] CALL: field_id=${field_id} | activity_type=${activity_type} | args:`, args);

                    if (field_id && activity_type) {
                        if (activity_type === "treatment" && !category) {
                            console.warn(`[crop-chat] ⚠️ [log_field_activity] Rejected: category is required to log a treatment activity`);
                            toolResult = {
                                status: "error",
                                message: "category is required to log a treatment activity"
                            };
                        } else {
                            const targetTable =
                                activity_type === "treatment" ? "field_treatments" :
                                    activity_type === "irrigation" ? "field_irrigation_logs" :
                                        activity_type === "harvest" ? "field_harvest_records" : "field_labor_logs";

                            const payload: Record<string, any> = {
                                field_id,
                                status: "pending_outcome",
                            };

                            if (activity_date) payload.activity_date = new Date(activity_date).toISOString();
                            if (notes) payload.notes = notes;
                            if (unit_price != null) payload.unit_price = Number(unit_price);

                            if (activity_type === "treatment") {
                                if (category) payload.category = category;
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
                                console.error(`[crop-chat] ❌ [log_field_activity] FAILED to insert into ${targetTable}:`, insertErr);
                                toolResult = {
                                    status: "error",
                                    message: `فشل الإدخال في قاعدة البيانات: ${insertErr.message}`
                                };
                            } else {
                                console.log(`[crop-chat] ✅ [log_field_activity] SUCCESS -> Inserted row ID ${inserted?.id} into ${targetTable} (status: ${payload.status})`);
                            }
                        }
                    } else {
                        console.warn(`[crop-chat] ⚠️ [log_field_activity] Missing required field_id or activity_type`);
                        toolResult = {
                            status: "error",
                            message: "Missing required field_id or activity_type"
                        };
                    }
                } else if (name === "update_field_activity") {
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

                    console.log(`[crop-chat] 🔄 [update_field_activity] CALL: activity_id=${activity_id} | activity_type=${activity_type} | mark_completed=${mark_completed} | args:`, args);

                    if (activity_id && activity_type) {
                        const targetTable =
                            activity_type === "treatment" ? "field_treatments" :
                                activity_type === "irrigation" ? "field_irrigation_logs" :
                                    activity_type === "harvest" ? "field_harvest_records" : "field_labor_logs";

                        const updates: Record<string, any> = {};

                        if (activity_date) updates.activity_date = new Date(activity_date).toISOString();
                        if (notes) updates.notes = notes;
                        if (unit_price != null) updates.unit_price = Number(unit_price);
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

                        // Fetch existing row to evaluate completeness and expiration
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
                            console.warn(`[crop-chat] ⚠️ [update_field_activity] Rejected mark_completed for activity ${activity_id} - Missing required fields:`, missingFields);
                            toolResult = {
                                status: "error",
                                message: `لا يمكن إغلاق النشاط (mark_completed) لأن الأعمدة التالية ما زالت مفقودة: ${missingFields.join("، ")}. يُرجى استكمال هذه البيانات أولاً من الفلاح.`
                            };
                        } else {
                            if (isComplete || isExpired || mark_completed === true) {
                                updates.status = "completed";
                            }

                            if (Object.keys(updates).length > 0) {
                                const { error: updateErr } = await (supabaseAdmin as any)
                                    .from(targetTable)
                                    .update(updates)
                                    .eq("id", activity_id);

                                if (updateErr) {
                                    console.error(`[crop-chat] ❌ [update_field_activity] FAILED to update ${targetTable} (${activity_id}):`, updateErr);
                                    toolResult = {
                                        status: "error",
                                        message: `فشل التحديث في قاعدة البيانات: ${updateErr.message}`
                                    };
                                } else {
                                    console.log(`[crop-chat] ✅ [update_field_activity] SUCCESS -> Updated activity ${activity_id} in ${targetTable} (status: ${updates.status || existingRow?.status})`);
                                }
                            } else {
                                console.log(`[crop-chat] ℹ️ [update_field_activity] No fields provided to update for activity ${activity_id}`);
                            }
                        }
                    } else {
                        console.warn(`[crop-chat] ⚠️ [update_field_activity] Missing required activity_id or activity_type`);
                    }
                }

                functionResponseParts.push({
                    functionResponse: {
                        name,
                        response: toolResult
                    }
                });
            } // end for callPart

            // Clean internal thought parts from historical model turn before appending to history
            const cleanModelParts = currentParts.filter((p: any) => !p.thought);

            // Append this round's model turn + function responses to the conversation
            agentContents = [
                ...agentContents,
                { role: "model", parts: cleanModelParts.length > 0 ? cleanModelParts : currentParts },
                { role: "user", parts: functionResponseParts },  // Gemini API requires "user" role for functionResponse turns
            ];

            // ── Follow-up: send functionResponses back and allow more tool calls ─────
            // NOTE: we do NOT send `tools` here with mode=NONE because some Gemini
            // model versions return an empty/OTHER response when tools are present
            // alongside mode=NONE. Instead we allow the model to call tools freely
            // until it returns text, then we stop.
            const followUpPayload = {
                contents: agentContents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }],
                },
                tools: [farmProfileToolDeclaration],
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
                    // Update followUpPayload with current key's thinking_level in case key rotated
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
                        if (followUpData.usageMetadata) {
                            console.log(`[crop-chat] 📊 Follow-up Usage Metadata (Round ${loopCount}):`, followUpData.usageMetadata);
                        }
                        currentParts = followUpData.candidates?.[0]?.content?.parts ?? [];
                        followUpOk = true;
                        break;
                    } else {
                        const errBody = await followUpRes.text();
                        console.error(`[crop-chat] Follow-up HTTP error ${followUpRes.status} (retry ${retry}):`, errBody.slice(0, 200));

                        if (followUpRes.status === 429) {
                            await (supabaseAdmin as any).from("api_key_models").update({ status: "rate_limited" }).eq("id", keyData.id);

                            // Rotate to next available key if present
                            if (currentKeyIndex + 1 < validKeys.length) {
                                currentKeyIndex++;
                                keyData = validKeys[currentKeyIndex];
                                modelName = keyData.model_name || "gemini-2.0-flash";
                                geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_keys.api_key}`;
                                console.log(`[crop-chat] Follow-up rotated to key ${keyData.api_keys.id.slice(0, 6)} (${modelName})`);
                            }
                            // Exponential backoff delay for rate limit resets (1.5s, 3s...)
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
                console.warn("[crop-chat] All follow-up retries failed after tool execution.");
                return NextResponse.json({
                    success: true,
                    text: "تم تنفيذ العملية بنجاح.",
                });
            }

            // Check if model returned text in this round (exit loop)
            const roundText = currentParts
                .filter((p: any) => !p.thought && p.text)
                .map((p: any) => p.text)
                .join("\n");

            if (roundText) {
                console.log(`[crop-chat] ✅ Got text response after ${loopCount} tool round(s).`);
                const { cleanText, recommendedProduct } = processResponseText(roundText);
                return NextResponse.json({
                    success: true,
                    text: cleanText,
                    recommendedProduct,
                });
            }

            // No text yet → loop continues to check for more function calls
            console.log(`[crop-chat] 🔄 Round ${loopCount} returned no text, checking for more tool calls...`);
        } // end while agentic loop

        // ── If we exit the loop without text (e.g. max rounds reached) ────────────
        const loopExitText = currentParts
            .filter((p: any) => !p.thought && p.text)
            .map((p: any) => p.text)
            .join("\n");

        if (loopExitText) {
            const { cleanText, recommendedProduct } = processResponseText(loopExitText);
            return NextResponse.json({ success: true, text: cleanText, recommendedProduct });
        }

        if (loopCount >= MAX_TOOL_ROUNDS) {
            console.warn(`[crop-chat] Reached max tool rounds (${MAX_TOOL_ROUNDS}) without text response.`);
            return NextResponse.json({ success: true, text: "تم تنفيذ العملية بنجاح." });
        }

        // ── No function calls were made at all — pure text response ───────────────
        console.log(`[crop-chat] ✅ Model returned TEXT ONLY (No function calls executed).`);

        const resultText = currentParts
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
