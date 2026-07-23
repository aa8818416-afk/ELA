import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * POST /api/distributor/farmers
 * إنشاء حساب فلاح جديد من قِبل الموزع المعتمد
 * Body: { full_name: string, phone: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. التحقق من هوية الموزع المسجل دخوله
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "غير مصرح. يرجى تسجيل الدخول أولاً." }, { status: 401 });
  }

  // 2. التحقق من أن الموزع مقبول (APPROVED)
  const { data: dist, error: distError } = await supabase
    .from("distributors")
    .select("status, profile_id")
    .eq("profile_id", user.id)
    .single();

  if (distError || !dist) {
    return NextResponse.json({ error: "لم يتم العثور على ملفك كموزع." }, { status: 403 });
  }
  if (dist.status !== "APPROVED") {
    return NextResponse.json({ error: "حسابك لم يتم قبوله بعد. يجب أن تكون موزعاً معتمداً لإضافة فلاحين." }, { status: 403 });
  }

  // 3. قراءة بيانات الطلب
  let body: { full_name?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات الطلب غير صحيحة." }, { status: 400 });
  }

  const { full_name, phone } = body;
  if (!full_name?.trim() || !phone?.trim()) {
    return NextResponse.json({ error: "الاسم الكامل ورقم الهاتف مطلوبان." }, { status: 400 });
  }

  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.length < 10) {
    return NextResponse.json({ error: "رقم الهاتف غير صحيح." }, { status: 400 });
  }

  // 4. التحقق من عدم تكرار رقم الهاتف
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("phone", cleanPhone)
    .maybeSingle();

  if (existingProfile) {
    return NextResponse.json({ error: "رقم الهاتف هذا مسجل مسبقاً في النظام." }, { status: 409 });
  }

  // 5. توليد PIN رقمي عشوائي من 6 أرقام
  const pin = String(Math.floor(100000 + Math.random() * 900000));

  // 6. إنشاء حساب الفلاح في Supabase Auth
  // نستخدم صيغة: phone@ela-farmer.internal كـ email وهمي
  const farmerEmail = `${cleanPhone}@ela-farmer.internal`;

  // يتطلب هذا استخدام Admin Client (service role) — نستخدم Service Role via supabaseAdmin
  // ملاحظة: يجب إنشاء هذا الـ client بـ service role key من البيئة
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: farmerEmail,
    password: pin,
    email_confirm: true, // تأكيد البريد تلقائياً (PIN system لا يحتاج تأكيد email)
    user_metadata: { role: "farmer", full_name: full_name.trim(), phone: cleanPhone },
  });

  if (createError || !newUser.user) {
    console.error("[create farmer] createUser error:", createError);
    return NextResponse.json({ error: "تعذر إنشاء حساب الفلاح: " + createError?.message }, { status: 500 });
  }

  const farmerId = newUser.user.id;

  // 7. انتظار التريجر لإنشاء صف في profiles
  await new Promise((r) => setTimeout(r, 800));

  // 8. إدراج صف في جدول farmers مع ربطه بالموزع
  const { error: farmerInsertError } = await supabaseAdmin
    .from("farmers")
    .insert({
      profile_id: farmerId,
      distributor_id: user.id,
    });

  if (farmerInsertError) {
    // إذا كان الصف موجود (من تريجر)، نحدّثه
    if (farmerInsertError.code === "23505") {
      await supabaseAdmin.from("farmers").update({
        distributor_id: user.id,
      }).eq("profile_id", farmerId);
    } else {
      console.error("[create farmer] insert farmers error:", farmerInsertError);
      return NextResponse.json({ error: "تعذر ربط الفلاح بك: " + farmerInsertError.message }, { status: 500 });
    }
  }

  // 9. إرجاع بيانات الدخول للموزع
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
