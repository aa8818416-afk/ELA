import { NextResponse } from "next/server";

import { createClient as createServerClient } from "@/utils/supabase/server";

/**
 * POST /api/crop-doctor
 * Accepts: { imageBase64: string }
 * Performs AI diagnosis with Gemini 3.5 Flash + Key Rotation.
 * Returns: { diagnosis, recommendedProduct, distributorContact }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createServerClient();

    // 1. Validate auth
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (!currentUser) {
      return NextResponse.json({ error: "غير مصرح لك" }, { status: 401 });
    }

    const body = await request.json();
    const { imageBase64 } = body as { imageBase64: string };

    if (!imageBase64) {
      return NextResponse.json(
        { error: "لم يتم إرسال الصورة" },
        { status: 400 }
      );
    }

    // 2. Fetch all products to inject into the system prompt
    const { data: products } = await supabase
      .from("products")
      .select("id, name_ar, description_ar");

    const productsContext =
      products
        ?.map(
          (p: any) => // eslint-disable-line @typescript-eslint/no-explicit-any
            `- ID: ${p.id} | Name: ${p.name_ar} | Desc: ${p.description_ar}`
        )
        .join("\n") || "No products available";

    // 3. Define the system prompt
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
    async function attemptDiagnosis(attemptCount = 0): Promise<NextResponse> {
      if (attemptCount > 5) {
        return NextResponse.json(
          { error: "جميع المفاتيح مستنفدة، حاول مرة أخرى لاحقاً" },
          { status: 503 }
        );
      }

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
        return NextResponse.json(
          { error: "نظام الذكاء الاصطناعي غير متاح حالياً" },
          { status: 503 }
        );
      }

      const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyData.api_key}`;

      const response = await fetch(geminiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn(
            `[crop-doctor] Key ${keyData.id} rate limited (429). Rotating...`
          );
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("api_keys")
            .update({ status: "rate_limited" })
            .eq("id", keyData.id);
          return attemptDiagnosis(attemptCount + 1);
        }
        return NextResponse.json(
          { error: "فشل الاتصال بخدمة الذكاء الاصطناعي" },
          { status: 502 }
        );
      }

      // Success — increment usage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("api_keys")
        .update({ daily_usage: keyData.daily_usage + 1 })
        .eq("id", keyData.id);

      const data = await response.json();
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!resultText) {
        return NextResponse.json(
          { error: "لم يتمكن النظام من التعرف على المرض" },
          { status: 422 }
        );
      }

      let aiResult;
      try {
        aiResult = JSON.parse(resultText);
      } catch {
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
