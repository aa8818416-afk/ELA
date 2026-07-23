import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * PATCH /api/admin/distributors/[id]
 * تحديث حالة الموزع (قبول/رفض) بواسطة الأدمن
 * Body: { action: "approve" | "reject" | "reset_password" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id: distributorId } = await params;

  // التحقق من أن المستخدم الحالي أدمن
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "غير مصرح." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "هذه العملية متاحة للأدمن فقط." }, { status: 403 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "بيانات الطلب غير صحيحة." }, { status: 400 });
  }

  const { action } = body;

  // ============ قبول الموزع ============
  if (action === "approve") {
    const { error } = await supabase
      .from("distributors")
      .update({ status: "APPROVED" })
      .eq("profile_id", distributorId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: "تم قبول الموزع بنجاح." });
  }

  // ============ رفض الموزع ============
  if (action === "reject") {
    const { error } = await supabase
      .from("distributors")
      .update({ status: "REJECTED" })
      .eq("profile_id", distributorId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, message: "تم رفض طلب الموزع." });
  }

  // ============ إعادة تعيين كلمة مرور الموزع ============
  if (action === "reset_password") {
    // توليد كلمة مرور عشوائية قوية
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const newPassword = Array.from({ length: 10 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      distributorId,
      { password: newPassword }
    );

    if (updateError) {
      return NextResponse.json({ error: "تعذر تحديث كلمة المرور: " + updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      new_password: newPassword,
      message: "تم تعيين كلمة مرور جديدة بنجاح.",
    });
  }

  return NextResponse.json({ error: "الإجراء غير معروف." }, { status: 400 });
}
