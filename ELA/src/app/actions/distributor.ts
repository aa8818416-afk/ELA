"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import type { Database } from "@/types/database.types";

/**
 * Server Action: Register a new farmer.
 * Uses the Service Role Key to bypass email confirmations and create an auth user
 * for a farmer using a dummy email derived from their phone number.
 */
export async function registerFarmer(formData: FormData) {
  try {
    const fullName = formData.get("fullName") as string;
    const phone = formData.get("phone") as string;

    const currentCrop = formData.get("currentCrop") as string;
    const landSize = Number(formData.get("landSize"));

    if (!fullName || !phone) {
      return { error: "الاسم ورقم الهاتف مطلوبان" };
    }

    // 1. Validate caller is a logged-in distributor
    const supabaseSession = await createServerClient();
    const {
      data: { user: currentUser },
    } = await supabaseSession.auth.getUser();

    if (!currentUser) {
      return { error: "غير مصرح لك بإضافة فلاحين" };
    }

    // Initialize Admin Client to bypass Auth requirements
    const supabaseAdmin = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. Create Farmer Auth User
    // We use a dummy email because farmers may only have phones,
    // and Supabase requires unique emails by default.
    const dummyEmail = `${phone}@farmer.ela.com`;
    const defaultPassword = `Delta${phone}`; // In production, generate random/send via SMS

    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: dummyEmail,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: "farmer",
        },
      });

    if (authError || !authData.user) {
      console.error("[registerFarmer] Auth Error:", authError);
      return { error: "فشل إنشاء حساب الفلاح، قد يكون رقم الهاتف مسجلاً مسبقاً." };
    }

    const newFarmerId = authData.user.id;

    // 3. The `on_auth_user_created` Postgres Trigger automatically creates a `profiles` row.
    // Wait a brief moment to ensure trigger completes (or rely on robust retry/upsert logic)
    // Here we'll just update the profile with the phone number, then insert the farmer row.

    await supabaseAdmin
      .from("profiles")
      .update({ phone: phone })
      .eq("id", newFarmerId);

    // 4. Insert into farmers table linked to current distributor
    const { error: farmerError } = await supabaseAdmin.from("farmers").insert({
      profile_id: newFarmerId,
      distributor_id: currentUser.id,
      land_size: landSize,
      current_crop: currentCrop,
    });

    if (farmerError) {
      console.error("[registerFarmer] Insert Error:", farmerError);
      // Ideally rollback user creation here in production
      return { error: "فشل حفظ بيانات الفلاح" };
    }

    // Revalidate the farmers directory page
    revalidatePath("/distributor/farmers");

    return { success: true };
  } catch (error) {
    console.error("[registerFarmer] Unexpected Error:", error);
    return { error: "حدث خطأ غير متوقع أثناء تسجيل الفلاح" };
  }
}

/**
 * Server Action: Create a new order
 */
export async function createOrder(formData: FormData) {
  try {
    const farmerId = formData.get("farmerId") as string;
    const productId = formData.get("productId") as string;
    const quantity = Number(formData.get("quantity"));
    const totalPrice = Number(formData.get("totalPrice"));

    if (!farmerId || !productId || !quantity || !totalPrice) {
      return { error: "جميع الحقول مطلوبة" };
    }

    const supabase = await createServerClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return { error: "غير مصرح لك بإصدار طلب" };
    }

    // Insert into orders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: orderData, error: orderError } = await (supabase as any)
      .from("orders")
      .insert({
        farmer_id: farmerId,
        distributor_id: currentUser.id,
        total_price: totalPrice,
        status: "pending",
        payment_status: "unpaid",
      })
      .select("id")
      .single();

    if (orderError || !orderData) {
      console.error("[createOrder] Order Error:", orderError);
      return { error: "فشل إنشاء الطلب" };
    }

    // Insert into order_items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: itemError } = await (supabase as any).from("order_items").insert({
      order_id: orderData.id,
      product_id: productId,
      quantity: quantity,
    });

    if (itemError) {
      console.error("[createOrder] Order Item Error:", itemError);
      return { error: "فشل حفظ تفاصيل الطلب" };
    }

    revalidatePath("/distributor/orders");
    return { success: true };
  } catch (error) {
    console.error("[createOrder] Unexpected Error:", error);
    return { error: "حدث خطأ غير متوقع أثناء إصدار الطلب" };
  }
}

/**
 * Server Action: AI Crop Doctor Scanner with Key Rotation
 * Processes the base64 image via Gemini 3.5 Flash API using active keys from api_keys table
 */
export async function diagnoseCrop(imageBase64: string) {
  try {
    const supabase = await createServerClient();

    // 1. Validate auth
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return { error: "غير مصرح لك" };
    }

    // 2. Fetch all products to inject into the system prompt.
    // NOTE: `description_ar` does not exist on the products table, use `active_ingredient`.
    const { data: products } = await supabase
      .from("products")
      .select("id, name_ar, active_ingredient");

    const productsContext = products?.map((p: any) => `- ID: ${p.id} | Name: ${p.name_ar} | Active Ingredient: ${p.active_ingredient ?? "N/A"}`).join("\n") || "No products available"; // eslint-disable-line @typescript-eslint/no-explicit-any

    // 3. Define the prompt
    const promptText = `
You are an expert agronomist. Analyze this plant leaf image. Identify the disease name in Arabic. 
Here is our product database:
${productsContext}

Return a JSON object strictly matching this format without markdown code blocks (just the raw JSON string):
{
  "disease_name_ar": "اسم المرض بالعربية",
  "disease_name_en": "Disease name in English",
  "recommended_product_id": "The exact UUID of our product that treats this disease (if found, otherwise null)",
  "confidence_percentage": 95,
  "description_ar": "وصف مبسط للمرض وكيفية علاجه"
}
    `;

    const base64Data = imageBase64.split(",")[1] || imageBase64;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        response_mime_type: "application/json"
      }
    };

    // Recursive function to handle Key Rotation
    async function attemptDiagnosis(attemptCount = 0): Promise<Record<string, unknown>> {
      if (attemptCount > 5) {
        return { error: "فشلت جميع المحاولات للاتصال بخدمة التشخيص (Keys exhausted)" };
      }

      // Fetch the first available key
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: keyData, error: keyError } = await (supabase as any)
        .from("api_keys")
        .select("id, api_key, daily_usage")
        .eq("status", "active")
        .eq("project_name", "gemini")
        .lt("daily_usage", 1450)
        .order("daily_usage", { ascending: true })
        .limit(1)
        .single();

      if (keyError || !keyData) {
        console.error("[diagnoseCrop] No active keys available:", keyError);
        return { error: "نظام الذكاء الاصطناعي غير متاح حالياً (جميع المفاتيح مستنفدة)" };
      }

      // The model identifier: gemini-3.5-flash (verified working).
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${keyData.api_key}`;

      const response = await fetch(geminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        // Handle 429 Rate Limit
        if (response.status === 429) {
          console.warn(`[diagnoseCrop] Key ${keyData.id} hit rate limit (429). Rotating...`);
          // Immediately mark this key as rate_limited
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("api_keys")
            .update({ status: "rate_limited" })
            .eq("id", keyData.id);

          // Recursively try again with the next key
          return attemptDiagnosis(attemptCount + 1);
        }

        console.error("[diagnoseCrop] Gemini API Error:", await response.text());
        return { error: "فشل الاتصال بخدمة التشخيص" };
      }

      // Call successful!
      // Increment daily usage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("api_keys")
        .update({ daily_usage: keyData.daily_usage + 1 })
        .eq("id", keyData.id);

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!resultText) {
        return { error: "لم يتم التعرف على المرض" };
      }

      let aiResult;
      try {
        aiResult = JSON.parse(resultText);
      } catch (_parseError) {
        console.error("Failed to parse JSON from Gemini:", resultText);
        return { error: "صيغة غير مدعومة من خدمة التشخيص" };
      }

      let recommendedProduct = null;
      if (aiResult.recommended_product_id) {
        const { data: prodData } = await supabase
          .from("products")
          .select("id, name_ar, price_to_farmer")
          .eq("id", aiResult.recommended_product_id)
          .single();
        if (prodData) {
          recommendedProduct = prodData;
        }
      }

      return {
        success: true,
        diagnosis: aiResult,
        recommendedProduct
      };
    }

    // Start the recursive API call chain
    return await attemptDiagnosis(0);

  } catch (error) {
    console.error("[diagnoseCrop] Unexpected Error:", error);
    return { error: "حدث خطأ غير متوقع أثناء تحليل الصورة" };
  }
}

/**
 * Server Action: Mark Order Delivered
 * Updates order status to delivered, payment to paid, and calculates commission.
 */
export async function markOrderDelivered(orderId: string) {
  try {
    const supabase = await createServerClient();

    // 1. Validate auth
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      return { error: "غير مصرح لك" };
    }

    // 2. Fetch the order details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: order, error: orderError } = await (supabase as any)
      .from("orders")
      .select("status, total_price, order_items(quantity, products(agent_commission))")
      .eq("id", orderId)
      .eq("distributor_id", currentUser.id)
      .single();

    if (orderError || !order) {
      return { error: "الطلب غير موجود" };
    }

    if (order.status === "delivered") {
      return { error: "الطلب تم تسليمه مسبقاً" };
    }

    // 3. Calculate total commission for this order
    let totalCommission = 0;
    if (order.order_items) {
      order.order_items.forEach((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const commissionPerUnit = item.products?.agent_commission || 0;
        totalCommission += commissionPerUnit * item.quantity;
      });
    }

    // 4. Update the order atomically and only if it is not already delivered
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updatedOrders, error: updateError } = await (supabase as any)
      .from("orders")
      .update({
        status: "delivered",
        payment_status: "paid"
      })
      .eq("id", orderId)
      .eq("distributor_id", currentUser.id);

    if (updateError) {
      console.error("[markOrderDelivered] Update Error:", updateError);
      return { error: "فشل تحديث حالة الطلب" };
    }

    // 5. Update distributor wallet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: distData } = await (supabase as any)
      .from("distributors")
      .select("wallet_balance")
      .eq("profile_id", currentUser.id)
      .single();

    if (distData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("distributors")
        .update({
          wallet_balance: distData.wallet_balance + totalCommission
        })
        .eq("profile_id", currentUser.id);
    }

    revalidatePath("/distributor/deliveries");
    revalidatePath("/distributor");
    return { success: true };

  } catch (error) {
    console.error("[markOrderDelivered] Unexpected Error:", error);
    return { error: "حدث خطأ غير متوقع أثناء تحديث الطلب" };
  }
}
