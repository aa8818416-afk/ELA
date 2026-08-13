import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/distributor/farmers
 * إنشاء حساب فلاح جديد من قِبل الموزع المعتمد
 * Body: { full_name: string, phone: string, village?: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. التحقق من هوية الموزع المسجل دخوله
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "غير مصرح. يرجى تسجيل الدخول أولاً." }, { status: 401 });
  }

  // 2. التحقق من أن الموزع مقبول (APPROVED) وجلب بيانات موقعه
  const { data: dist, error: distError } = await supabase
    .from("distributors")
    .select("status, profile_id, governorate, center, village, supervised_villages")
    .eq("profile_id", user.id)
    .single() as { data: { status: string; profile_id: string; governorate: string | null; center: string | null; village: string | null; supervised_villages: string[] | null } | null; error: any };

  if (distError || !dist) {
    return NextResponse.json({ error: "لم يتم العثور على ملفك كموزع." }, { status: 403 });
  }
  if (dist.status !== "APPROVED") {
    return NextResponse.json({ error: "حسابك لم يتم قبوله بعد. يجب أن تكون موزعاً معتمداً لإضافة فلاحين." }, { status: 403 });
  }

  // 3. قراءة بيانات الطلب
  let body: { full_name?: string; phone?: string; village?: string; soil_type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات الطلب غير صحيحة." }, { status: 400 });
  }

  const { full_name, phone, village: requestedVillage, soil_type } = body;
  if (!full_name?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: "الاسم الكامل ورقم الهاتف مطلوبان." }, { status: 400 });
  }

  if (!soil_type || !["طينية", "رملية"].includes(soil_type)) {
    return NextResponse.json({ error: "يرجى تحديد نوع التربة (طينية أو رملية)." }, { status: 400 });
  }

  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return NextResponse.json({ error: "رقم الهاتف غير صحيح." }, { status: 400 });
  }

  // 4. تحديد القرية الموروثة
  // - قرية واحدة في supervised_villages → تُورَّث تلقائيًا
  // - أكثر من قرية → يجب إرسال village من الـ form (إلزامي)
  // - بدون supervised_villages → يُستخدم حقل village العام للموزع
  const supervisedVillages: string[] = (dist as { supervised_villages?: string[] | null }).supervised_villages ?? [];
  let inheritedVillage: string | null = null;

  if (supervisedVillages.length === 1) {
    inheritedVillage = supervisedVillages[0];
  } else if (supervisedVillages.length > 1) {
    if (!requestedVillage?.trim()) {
      return NextResponse.json({ error: "يرجى تحديد القرية التابع لها الفلاح." }, { status: 400 });
    }
    // التحقق من أن القرية المرسلة ضمن قرى الموزع
    if (!supervisedVillages.includes(requestedVillage.trim())) {
      return NextResponse.json({ error: "القرية المحددة غير مدرجة ضمن نطاق إشرافك." }, { status: 400 });
    }
    inheritedVillage = requestedVillage.trim();
  } else {
    // لا يوجد supervised_villages → استخدام القرية العامة للموزع
    inheritedVillage = (dist as { village?: string | null }).village ?? null;
  }

  // 5. التحقق من عدم تكرار رقم الهاتف
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json({ error: "رقم الهاتف هذا مسجل مسبقاً في النظام." }, { status: 409 });
  }

  // 6. توليد PIN رقمي عشوائي من 6 أرقام
  const pin = String(Math.floor(100000 + Math.random() * 900000));

  // 7. إنشاء حساب الفلاح في Supabase Auth
  const farmerEmail = `${cleanPhone}@ela-farmer.internal`;

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: farmerEmail,
    password: pin,
    email_confirm: true,
    user_metadata: { role: "farmer", full_name: full_name.trim(), phone: cleanPhone },
  });

  if (createError || !newUser.user) {
    console.error("[create farmer] createUser error:", createError);
    return NextResponse.json({ error: "تعذر إنشاء حساب الفلاح: " + createError?.message }, { status: 500 });
  }

  const farmerId = newUser.user.id;

  // 8. انتظار التريجر لإنشاء صف في profiles
  await new Promise((r) => setTimeout(r, 800));

  // 9. إدراج صف في جدول farmers مع بيانات الموقع الموروثة من الموزع
  const { error: farmerInsertError } = await supabaseAdmin
    .from("farmers")
    .insert({
      profile_id: farmerId,
      distributor_id: user.id,
      governorate: (dist as { governorate?: string | null }).governorate ?? null,
      center: (dist as { center?: string | null }).center ?? null,
      village: inheritedVillage,
      soil_type: soil_type ?? null,
    });

  if (farmerInsertError) {
    // إذا كان الصف موجود (من تريجر)، نحدّثه
    if (farmerInsertError.code === "23505") {
      await supabaseAdmin.from("farmers").update({
        distributor_id: user.id,
        governorate: (dist as { governorate?: string | null }).governorate ?? null,
        center: (dist as { center?: string | null }).center ?? null,
        village: inheritedVillage,
        soil_type: soil_type ?? null,
      }).eq("profile_id", farmerId);
    } else {
      console.error("[create farmer] insert farmers error:", farmerInsertError);
      return NextResponse.json({ error: "تعذر ربط الفلاح بك: " + farmerInsertError.message }, { status: 500 });
    }
  }

  // 10. إرجاع بيانات الدخول للموزع
  return NextResponse.json({
    success: true,
    farmer: {
      id: farmerId,
      full_name: full_name.trim(),
      phone: cleanPhone,
      pin, // الـ PIN يُعرض للموزع مرة واحدة فقط
    },
    message: "تم إنشاء حساب الفلاح بنجاح. احتفظ ببيانات الدخول لإعطائها للفلاح.",
  });
}
