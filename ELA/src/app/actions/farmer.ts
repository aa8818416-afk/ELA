"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

/**
 * Server Action: Create an order for a farmer or distributor directly from AI recommendation.
 */
export async function createFarmerOrderDirectly({
  productId,
  quantity = 1,
}: {
  productId: string;
  quantity?: number;
}) {
  try {
    if (!productId || quantity < 1) {
      return { error: "يرجى تحديد المنتج والكمية المطلوبة بشكل صحيح." };
    }

    const supabase = await createServerClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return { error: "غير مصرح لك بإجراء الطلب. يرجى تسجيل الدخول أولاً." };
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return { error: "إعداد الخادم غير مكتمل." };
    }

    const supabaseAdmin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // 1. Fetch user role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role, full_name")
      .eq("id", currentUser.id)
      .single();

    let farmerId = currentUser.id;
    let distributorId: string | null = null;

    if (profile?.role === "farmer") {
      // Get assigned distributor for this farmer
      const { data: farmerRow } = await supabaseAdmin
        .from("farmers")
        .select("distributor_id")
        .eq("profile_id", currentUser.id)
        .single();

      if (!farmerRow || !farmerRow.distributor_id) {
        return { error: "لم نتمكن من العثور على سفير القرية الخاص بك لتوجيه الطلب إليه." };
      }
      distributorId = farmerRow.distributor_id;
    } else if (profile?.role === "distributor") {
      // Distributor ordering for their village/farm
      distributorId = currentUser.id;
      // Fetch any farmer under this distributor, or use current user
      const { data: farmerRow } = await supabaseAdmin
        .from("farmers")
        .select("profile_id")
        .eq("distributor_id", currentUser.id)
        .limit(1)
        .maybeSingle();

      if (farmerRow) {
        farmerId = farmerRow.profile_id;
      }
    } else {
      // Fallback or Admin
      const { data: farmerRow } = await supabaseAdmin
        .from("farmers")
        .select("profile_id, distributor_id")
        .limit(1)
        .maybeSingle();

      if (farmerRow) {
        farmerId = farmerRow.profile_id;
        distributorId = farmerRow.distributor_id;
      } else {
        return { error: "لا يوجد مزارع أو موزع مسجل لتنفيذ الطلب." };
      }
    }

    // 2. Fetch Product Price
    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name_ar, price_to_farmer, stock_status")
      .eq("id", productId)
      .single();

    if (prodErr || !product) {
      return { error: "المنتج غير موجود أو لم يعد متاحاً." };
    }

    if (!product.stock_status) {
      return { error: `المنتج "${product.name_ar}" غير متوفر حالياً في المخزن.` };
    }

    const totalPrice = Number(product.price_to_farmer) * quantity;

    // 3. Insert order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderData, error: orderErr } = await (supabaseAdmin as any)
      .from("orders")
      .insert({
        farmer_id: farmerId,
        distributor_id: distributorId,
        total_price: totalPrice,
        status: "pending",
        payment_status: "unpaid",
        created_by_type: "platform",
      })
      .select("id")
      .single();

    if (orderErr || !orderData) {
      console.error("[createFarmerOrderDirectly] order error:", orderErr);
      return { error: "فشل في تسجيل الطلب، يرجى المحاولة مرة أخرى." };
    }

    // 4. Insert order item
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemErr } = await (supabaseAdmin as any)
      .from("order_items")
      .insert({
        order_id: orderData.id,
        product_id: productId,
        quantity: quantity,
      });

    if (itemErr) {
      console.error("[createFarmerOrderDirectly] item error:", itemErr);
      return { error: "فشل في إضافة تفاصيل الطلب." };
    }

    revalidatePath("/farmer/orders");
    revalidatePath("/distributor/orders");
    revalidatePath("/distributor/deliveries");

    return {
      success: true,
      orderId: orderData.id,
      productName: product.name_ar,
      totalPrice,
    };
  } catch (err) {
    console.error("[createFarmerOrderDirectly] Exception:", err);
    return { error: "حدث خطأ غير متوقع أثناء تنفيذ الطلب." };
  }
}

/**
 * Server Action: Create a pending field_treatments row after a product purchase.
 * Only runs if a fieldId is provided — no fieldId = no row inserted.
 */
export async function createTreatmentFromPurchase({
  productId,
  fieldId,
}: {
  productId: string;
  fieldId: string | null | undefined;
}) {
  // إذا لم يتم تحديد أرض، لا نسجل أي شيء
  if (!fieldId) return { skipped: true };

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return { error: "إعداد الخادم غير مكتمل." };

    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    // 1. جلب بيانات المنتج (الاسم + النوع) من قاعدة البيانات
    const { data: product, error: prodErr } = await supabaseAdmin
      .from("products")
      .select("id, name_ar, product_type")
      .eq("id", productId)
      .single();

    if (prodErr || !product) {
      console.warn("[createTreatmentFromPurchase] Product not found:", productId);
      return { skipped: true };
    }

    // 2. تحديد الـ category من product_type (أول قيمة في المصفوفة أو null)
    const productTypes: string[] = Array.isArray(product.product_type)
      ? product.product_type
      : [];
    // نربط نوع المنتج بـ category في جدول الرش
    let category: "مبيد" | "سماد" | null = null;
    if (productTypes.includes("مبيدات")) category = "مبيد";
    else if (productTypes.includes("أسمدة") || productTypes.includes("مغذيات")) category = "سماد";

    // 3. إدراج صف نشاط جديد (رش/تسميد معلق)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertErr } = await (supabaseAdmin as any)
      .from("field_treatments")
      .insert({
        field_id: fieldId,
        product_id: product.id,
        product_name_text: product.name_ar,
        ...(category ? { category } : {}),
        status: "pending_outcome",
      });

    if (insertErr) {
      console.error("[createTreatmentFromPurchase] Insert error:", insertErr);
      return { error: "فشل في تسجيل نشاط الرش." };
    }

    return { success: true };
  } catch (err) {
    console.error("[createTreatmentFromPurchase] Exception:", err);
    return { error: "حدث خطأ غير متوقع." };
  }
}
