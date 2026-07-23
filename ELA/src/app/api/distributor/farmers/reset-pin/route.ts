import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * POST /api/distributor/farmers/reset-pin
 * إعادة تعيين PIN الفلاح بواسطة الموزع المسؤول عنه فقط
 * Body: { farmer_profile_id: string }
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // 1. التحقق من هوية الموزع
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
  }

  // 2. التحقق من أن الموزع مقبول
  const { data: dist } = await supabase
    .from("distributors")
    .select("status")
    .eq("profile_id", user.id)
    .single();

  if (!dist || dist.status !== "APPROVED") {
    return NextResponse.json({ error: "حسابك غير معتمد." }, { status: 403 });
  }

  // 3. قراءة بيانات الطلب
  let body: { farmer_profile_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات الطلب غير صحيحة." }, { status: 400 });
  }

  const { farmer_profile_id } = body;
  if (!farmer_profile_id) {
    return NextResponse.json({ error: "معرف الفلاح مطلوب." }, { status: 400 });
  }

  // 4. التحقق من أن الفلاح ينتمي لهذا الموزع
  const { data: farmer } = await supabase
    .from("farmers")
    .select("profile_id, distributor_id")
    .eq("profile_id", farmer_profile_id)
    .eq("distributor_id", user.id)
    .maybeSingle();

  if (!farmer) {
    return NextResponse.json({ error: "الفلاح غير موجود أو لا ينتمي لك." }, { status: 404 });
  }

  // 5. توليد PIN جديد
  const newPin = String(Math.floor(100000 + Math.random() * 900000));

  // 6. تحديث كلمة مرور الفلاح في Supabase Auth
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    farmer_profile_id,
    { password: newPin }
  );

  if (updateError) {
    console.error("[reset-pin] updateUser error:", updateError);
    return NextResponse.json({ error: "تعذر تحديث الرمز السري: " + updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    new_pin: newPin,
    message: "تم تعيين رمز سري جديد. أعطِ هذا الرمز للفلاح لتسجيل الدخول.",
  });
}
