import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/utils/supabase/server";
import type { Database } from "@/types/database.types";

/**
 * POST /api/crop-doctor
 * Accepts: { imageBase64: string }
 * Performs AI diagnosis with Gemini 3.5 Flash + Key Rotation.
 * Returns: { diagnosis, recommendedProduct, distributorContact }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();

    // 1. Validate auth (uses the user's session cookies — subject to RLS, which is fine here)
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
    }

    const body = await request.json();
    const { imageBase64, farmerNotes } = body as { imageBase64: string; farmerNotes?: string };

    if (!imageBase64) {
      return NextResponse.json(
        { error: "لم يتم إرسال الصورة" },
        { status: 400 }
      );
    }

    // Admin client (service_role) — bypasses RLS so the server can always read/update api_keys.
    // Same pattern already used in src/app/actions/distributor.ts and src/app/api/cron/reset-keys/route.ts.
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error(
        "[crop-doctor] SUPABASE_SERVICE_ROLE_KEY is missing from environment."
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

    // 2. Fetch all products to inject into the system prompt.
    // Include stock_status + price so the model recommends only available products.
    const { data: products } = await supabase
      .from("products")
      .select("id, name_ar, active_ingredient, price_to_farmer, stock_status");

    const productsContext =
      products
        ?.map(
          (p: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
            `- ID: ${p.id} | Name: ${p.name_ar} | Active Ingredient: ${p.active_ingredient ?? "N/A"} | Price: ${p.price_to_farmer} EGP | In Stock: ${p.stock_status ? "YES" : "NO"}`
        )
        .join("\n") || "No products available";

    // 3. Define the system prompt
    const promptText = `
You are an expert agronomist. Analyze this plant leaf image and identify the disease.
${farmerNotes ? `The farmer added these notes about the crop: "${farmerNotes}". Take them into account.\n` : ""}
Here is our product database (only recommend products where In Stock = YES):
${productsContext}

STRICT RULES:
1. You MUST recommend a product ONLY if it exists in the database above AND In Stock = YES.
2. If a matching product exists and is in stock: set "recommended_product_id" to its exact UUID.
3. If NO matching product exists OR it is out of stock: set "recommended_product_id" to null, and set "availability_note" to "سيوفر المنتج في أقرب وقت، تواصل مع السفير".

Return a JSON object strictly matching this format (no markdown, just raw JSON):
{
  "disease_name_ar": "اسم المرض بالعربية",
  "disease_name_en": "Disease name in English",
  "recommended_product_id": "exact UUID from the list, or null",
  "confidence_percentage": 95,
  "description_ar": "وصف مبسط للمرض وكيفية علاجه",
  "availability_note": "رسالة عن توفر المنتج، أو null إذا كان متوفراً"
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
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
      },
    };

    // 4. Recursive Key Rotation
    async function attemptDiagnosis(attemptCount = 0, excludedIds: string[] = []): Promise<NextResponse> {
      if (attemptCount > 5) {
        return NextResponse.json(
          { error: "خدمة الذكاء الاصطناعي مشغولة حالياً، يرجى المحاولة بعد بضع دقائق" },
          { status: 503 }
        );
      }

      // Read the active key via the service-role client to bypass RLS.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabaseAdmin as any)
        .from("api_keys")
        .select("id, api_key, daily_usage, model_name")
        .eq("status", "active")
        .eq("project_name", "gemini")
        .lt("daily_usage", 1450);

      if (excludedIds.length > 0) {
        query = query.not("id", "in", `(${excludedIds.join(",")})`);
      }

      const { data: keyData, error: keyError } = await query
        .order("daily_usage", { ascending: true })
        .limit(1)
        .single();

      if (keyError || !keyData) {
        console.error(
          "[crop-doctor] No active Gemini key available in DB:",
          keyError
        );
        return NextResponse.json(
          { error: "نظام الذكاء الاصطناعي غير متاح حالياً" },
          { status: 503 }
        );
      }

      // Model name: dynamically loaded from DB
      const modelName = keyData.model_name || "gemini-3.5-flash";
      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyData.api_key}`;

      console.log(`[crop-doctor] Attempt ${attemptCount + 1}: Using key ${keyData.id} (usage: ${keyData.daily_usage}), model: gemini-3.5-flash`);

      // AbortController so a hung request never blocks the response forever.
      // 90s timeout — images from phone cameras can be large (5-10 MB base64).
      const controller = new AbortController();
      const timeoutMs = 90_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetch(geminiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (fetchError) {
        clearTimeout(timeout);
        const aborted =
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError";
        console.error(
          `[crop-doctor] FETCH FAILED | Attempt ${attemptCount + 1} | Key: ${keyData.id.slice(0, 6)}... | Error:`,
          fetchError
        );
        // On timeout, retry (image may have been too large — next attempt may succeed)
        if (aborted && attemptCount < 5) {
          console.warn(
            `[crop-doctor] Request timed out after ${timeoutMs}ms. Retrying... (attempt ${attemptCount + 1}/6)`
          );
          return attemptDiagnosis(attemptCount + 1, [...excludedIds, keyData.id]);
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

      console.log(`[crop-doctor] Gemini responded with HTTP ${response.status} | Attempt ${attemptCount + 1} | Key: ${keyData.id.slice(0, 6)}...`);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `[crop-doctor] API ERROR | HTTP ${response.status} | Key: ${keyData.id.slice(0, 6)}... | Body:`,
          errorBody
        );
        if (response.status === 429) {
          console.warn(
            `[crop-doctor] Key ${keyData.id} rate limited (429). Rotating...`
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabaseAdmin as any)
            .from("api_keys")
            .update({ status: "rate_limited" })
            .eq("id", keyData.id);
          return attemptDiagnosis(attemptCount + 1, [...excludedIds, keyData.id]);
        }
        // 503 = model overloaded (temporary). Retry after a short delay.
        if (response.status === 503) {
          console.warn(
            `[crop-doctor] Model overloaded (503). Retrying in 5s... (attempt ${attemptCount + 1}/6)`
          );
          await new Promise((r) => setTimeout(r, 5000));
          return attemptDiagnosis(attemptCount + 1, [...excludedIds, keyData.id]);
        }
        // Other errors: return immediately with details.
        return NextResponse.json(
          {
            error: `فشل الاتصال بخدمة الذكاء الاصطناعي (${response.status})`,
            debug_info: errorBody.slice(0, 200),
          },
          { status: 502 }
        );
      }

      // Success — increment usage via the service-role client (bypass RLS).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from("api_keys")
        .update({ daily_usage: keyData.daily_usage + 1 })
        .eq("id", keyData.id);

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!resultText) {
        console.error("[crop-doctor] Gemini returned no candidate text:", data);
        return NextResponse.json(
          { error: "لم يتمكن النظام من التعرف على المرض" },
          { status: 422 }
        );
      }

      let aiResult;
      try {
        aiResult = JSON.parse(resultText);
      } catch {
        console.error(
          "[crop-doctor] Failed to parse JSON from Gemini:",
          resultText
        );
        return NextResponse.json(
          { error: "خطأ في قراءة نتيجة التشخيص" },
          { status: 422 }
        );
      }

      // 5. Fetch matched product
      let recommendedProduct = null;
      if (aiResult.recommended_product_id) {
        const { data: prodData } = await supabase
          .from("products")
          .select("id, name_ar, price_to_farmer")
          .eq("id", aiResult.recommended_product_id)
          .single();
        if (prodData) recommendedProduct = prodData;
      }

      // 6. Fetch farmer's assigned distributor contact
      let distributorContact = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: farmerData } = await (supabase as any)
        .from("farmers")
        .select("distributor_id, distributors(village, profiles(full_name, phone))")
        .eq("profile_id", currentUser!.id)
        .single();

      if (farmerData?.distributor_id) {
        const distProfile = farmerData.distributors?.profiles;
        distributorContact = {
          name: distProfile?.full_name || "السفير",
          phone: distProfile?.phone || null,
          village: farmerData.distributors?.village || null,
        };
      }

      return NextResponse.json({
        success: true,
        diagnosis: aiResult,
        recommendedProduct,
        distributorContact,
      });
    }

    return attemptDiagnosis(0);
  } catch (error) {
    console.error("[crop-doctor] Unexpected Error:", error);
    return NextResponse.json(
      { error: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى" },
      { status: 500 }
    );
  }
}
