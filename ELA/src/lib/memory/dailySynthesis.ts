import { createClient } from "@supabase/supabase-js";

interface SynthesisDeltaResult {
    farmersProcessed: number;
    successCount: number;
    cleanedOldMessagesCount: number;
    details: Array<{ farmerId: string; status: "success" | "error" | "skipped"; message?: string }>;
}

/**
 * Runs the Delta Synthesis Batch Job.
 * Examines messages created/modified within the last 24 hours,
 * updates the General Master Profile and Topic-specific files,
 * extracts permanent memories, and prunes messages older than 7 days.
 */
export async function runDailySynthesis(
    supabaseAdmin: any,
    geminiApiKey: string
): Promise<SynthesisDeltaResult> {
    const result: SynthesisDeltaResult = {
        farmersProcessed: 0,
        successCount: 0,
        cleanedOldMessagesCount: 0,
        details: [],
    };

    try {
        console.log("[daily-synthesis] 🔄 Starting Delta-Only Batch Memory Synthesis...");

        // 1. Find all farmers who had chat activity in the last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentMessages, error: msgErr } = await supabaseAdmin
            .from("chat_messages")
            .select("farmer_id, role, content, created_at")
            .gte("created_at", twentyFourHoursAgo)
            .order("created_at", { ascending: true });

        if (msgErr) {
            console.error("[daily-synthesis] ❌ Error fetching recent messages:", msgErr);
            return result;
        }

        if (!recentMessages || recentMessages.length === 0) {
            console.log("[daily-synthesis] ℹ️ No new chat messages in the last 24 hours to synthesize.");
        }

        // Group messages by farmer_id
        const messagesByFarmer = new Map<string, Array<{ role: string; content: string; created_at: string }>>();
        for (const msg of recentMessages || []) {
            if (!messagesByFarmer.has(msg.farmer_id)) {
                messagesByFarmer.set(msg.farmer_id, []);
            }
            messagesByFarmer.get(msg.farmer_id)!.push({
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at,
            });
        }

        result.farmersProcessed = messagesByFarmer.size;
        console.log(`[daily-synthesis] 👥 Found ${messagesByFarmer.size} active farmer(s) with new delta interactions.`);

        // 2. Process each farmer's delta
        for (const [farmerId, farmerMsgs] of messagesByFarmer.entries()) {
            try {
                console.log(`[daily-synthesis] 🧠 Processing farmer ${farmerId} (${farmerMsgs.length} new messages)...`);

                // Fetch current master synthesis and topic syntheses
                const [synthesisRes, memoryRes, fieldsRes, farmerProfileRes] = await Promise.all([
                    supabaseAdmin.from("farmer_synthesis").select("id, area_scope, title, summary_content, work_context, personal_context, top_of_mind, brief_history").eq("farmer_id", farmerId),
                    supabaseAdmin.from("farmer_memory").select("id, category, fact, confidence").eq("farmer_id", farmerId).eq("is_active", true),
                    supabaseAdmin.from("farmer_fields").select("id, field_name, crop_type, area_feddan, area_unit, planting_date").eq("farmer_id", farmerId).eq("is_active", true),
                    supabaseAdmin.from("farmers").select("farm_profile, governorate, center, village").eq("profile_id", farmerId).maybeSingle(),
                ]);

                const existingSyntheses = (synthesisRes.data as any[]) || [];
                const masterSynthesis = existingSyntheses.find(s => s.area_scope === "general") || null;
                const topicSyntheses = existingSyntheses.filter(s => s.area_scope !== "general");
                const currentMemories = (memoryRes.data as any[]) || [];
                const activeFields = (fieldsRes.data as any[]) || [];
                const farmProfile = farmerProfileRes.data?.farm_profile || {};
                const locationText = [farmerProfileRes.data?.village, farmerProfileRes.data?.center, farmerProfileRes.data?.governorate].filter(Boolean).join("، ") || "غير محدد";

                // Format messages transcript
                const transcriptText = farmerMsgs.map(m => `[${m.role === "user" ? "الفلاح" : "المرشد"} (${m.created_at.slice(11, 16)})]: ${m.content}`).join("\n");

                const synthesisPrompt = `<role>
أنت "محلل الذاكرة التجميعية" لمنصة ELA الزراعية.
هدفك الأسمى: التكثيف المعلوماتي الشديد وتدوين أدق تفاصيل الفلاح بأقل عدد ممكن من الكلمات والرموز المركزة، لمنع تضخم الملخصات نهائياً مع الحفاظ على القيمة الاستشارية الكاملة.
مهمتك: مراجعة محادثات اليوم الجديدة للفلاح (Delta Interaction)، ومقارنتها بالملف العام القائم وملفات الموضوعات والحقائق المسجلة في <input_context>، ثم إدراج ما هو جديد فقط وتحديث المتغيرات في مكانها دون أي تكرار لأي معلومة مسجلة مسبقاً.
</role>

<input_context>
الموقع الجغرافي: ${locationText}
الأراضي المسجلة الحالية:
${activeFields.map(f => `- [${f.id}] ${f.field_name || 'بدون اسم'}: ${f.crop_type || 'غير محدد'} (${f.area_feddan || 1} فدان)`).join("\n") || "لا توجد أراضٍ مسجلة"}

الملف العام القائم حالياً للفلاح (General Master Profile):
${masterSynthesis ? JSON.stringify({
    work_context: masterSynthesis.work_context,
    personal_context: masterSynthesis.personal_context,
    top_of_mind: masterSynthesis.top_of_mind,
    brief_history: masterSynthesis.brief_history,
    summary_content: masterSynthesis.summary_content
}, null, 2) : "لا يوجد ملف عام سابق (سيتم إنشاؤه لأول مرة)"}

ملفات الموضوعات القائمة حالياً:
${topicSyntheses.map(t => `- [نطاق: ${t.area_scope}] ${t.title || 'بدون عنوان'}: ${t.summary_content}`).join("\n") || "لا توجد ملفات موضوعية سابقة"}

الحقائق السلوكية والمعدات المسجلة حالياً:
${currentMemories.map(m => `- [${m.category}] ${m.fact} (ثقة: ${m.confidence})`).join("\n") || "لا توجد حقائق مسجلة"}

محادثات وتفاعلات اليوم الجديدة (Delta of Today):
${transcriptText}
</input_context>

<instructions>
1. **قاعدة التكثيف وعدم التكرار الصارمة (Zero Redundancy & Maximum Density)**:
   - قارن كل معلومة في محادثات اليوم بالبيانات الموجودة في <input_context> (الملف العام، ملفات الموضوعات، والحقائق المسجلة).
   - **إذا كانت المعلومة مسجلة وموجودة بالفعل مسبقاً: لا تعد كتابتها أو إدراجها في الذاكرة إطلاقاً**.
   - **إذا طرأ تحديث أو تغيير على معلومة سابقة: قم بتعديلها واستبدالها في مكانها داخل الملف المناسب بدلاً من تكديس النصوص**.
   - **اكتب بأسلوب برقي ومكثف جداً وبأقل عدد من الكلمات المفيدة**.

2. **تحديث الملف العام (General Master Profile)**:
   * work_context: طبيعة نشاط المزرعة والمعدات ونظام الزراعة (مكثف وموجز).
   * personal_context: أسلوب تواصل الفلاح، لهجته، مدى تفضيله للإيجاز أو الشرح.
   * top_of_mind: ما يشغل بال الفلاح حالياً (عروة يجهز لها، قلق من مرض معين، محصول ينتظر ريه أو قطفه).
   * brief_history: ملخص تراكمي مستمر لأهم الأحداث والقرارات التاريخية.
   * summary_content: فقرة مركزة جامعة تلخص الفلاح لمهندس زراعي يريد فهم حالته في ثوانٍ.

3. **ملفات الموضوعات (Topic Syntheses)**:
   * إذا دارت المحادثة حول حقل محدد أو موضوع كبير مستقل (مثل: تجربة مركب معين، مشكلة ملوحة بئر، حقل البطاطس)، حدّث ملف الموضوع الخاص به (area_scope: field_<id> أو topic_<slug>). لا تكرر ما هو في الملف العام.

4. **استخراج الذاكرة والقيود والمعدات (Memory Facts)**:
   * استخرج **فقط الحقائق الجديدة تماماً** التي لم تكن مسجلة مسبقاً في قائمة "الحقائق السلوكية والمعدات المسجلة حالياً" أعلاه:
     - equipment_inventory: الجرارات، الماشية، المعدات المتوفرة غير المقيدة في البروفايل الثابت.
     - farm_constraints: محددات المزرعة، ملوحة التربة/الماء، حساسية من مركبات معينة.
     - budget_level: القدرة المالية (اقتصادي/متوسط/حر).
     - risk_tolerance: تقبل تجربة أساليب جديدة.
     - communication_style: أسلوب الشرح المفضل.
     - crop_preference: المحاصيل المفضلة.
     - trusted_source: الجهات الموثوقة للفلاح.
     - soil_water_notes: ملاحظات جودة المياه والتربة.
   * **إذا كانت الحقيقة موجودة بالفعل في الحقائق المسجلة أعلاه ➔ لا تُخرجها في memory_facts_to_upsert إطلاقاً**.
   * حدد supersedes_previous: true فقط إذا كانت الحقيقة تلغي ما قبلها لنفس التصنيف (مثلاً: اشترى جراراً جديداً بدلاً من القديم أو غيّر رأيه الصريح).

5. **البيانات الهيكلية للمزرعة (farm_profile_properties)**:
   * إذا صرح الفلاح بسعة رشاشة، أو طريقة ري (تنقيط/غمر)، أو نوع تربة (طينية/رملية)، أو صنف تقاوي، ضعها في farm_profile_properties.
</instructions>

<output_contract>
يجب أن يكون ردك JSON فقط بالشكل التالي دون أي نصوص إضافية:
{
  "master_profile_update": {
    "work_context": "...",
    "personal_context": "...",
    "top_of_mind": "...",
    "brief_history": "...",
    "summary_content": "..."
  },
  "topic_syntheses": [
    {
      "area_scope": "field_<field_id> أو topic_<name_slug>",
      "title": "عنوان الموضوع",
      "summary_content": "ملخص الموضوع المستمر",
      "key_topics": ["موضوع 1", "موضوع 2"]
    }
  ],
  "memory_facts_to_upsert": [
    {
      "category": "equipment_inventory | farm_constraints | budget_level | risk_tolerance | communication_style | crop_preference | trusted_source | soil_water_notes",
      "fact": "نص الحقيقة بوضوح ودقة",
      "confidence": "high | medium",
      "supersedes_previous": true
    }
  ],
  "farm_profile_properties": {
    "sprayer_capacity": "...",
    "land_area": "...",
    "irrigation_type": "...",
    "seed_variety": "...",
    "soil_type": "..."
  }
}
</output_contract>`;

                // Select least-used Gemini Flash-Lite model key from api_key_models
                let selectedApiKey = geminiApiKey;
                let selectedModel = "gemini-3.1-flash-lite";
                let selectedKeyModelId: string | null = null;

                try {
                    const { data: flashKeys } = await supabaseAdmin
                        .from("api_key_models")
                        .select("id, model_name, daily_usage, daily_limit, status, api_keys!inner(id, api_key, status, project_name)")
                        .eq("api_keys.status", "active")
                        .eq("api_keys.project_name", "gemini")
                        .eq("status", "active")
                        .in("model_name", ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);

                    const available = (flashKeys || []).filter((km: any) =>
                        km.api_keys?.api_key && (km.daily_usage || 0) < (km.daily_limit || 1000)
                    );

                    if (available.length > 0) {
                        // Sort by daily_usage ascending (الأقل استخداماً)
                        available.sort((a: any, b: any) => (a.daily_usage || 0) - (b.daily_usage || 0));
                        const chosen = available[0];
                        selectedApiKey = chosen.api_keys.api_key;
                        selectedModel = chosen.model_name;
                        selectedKeyModelId = chosen.id;
                        console.log(`[daily-synthesis] 🔑 Selected least-used Flash-Lite model: ${selectedModel} (usage: ${chosen.daily_usage}) on key: ${chosen.api_keys.id.slice(0, 6)}...`);
                    }
                } catch (keySelectErr) {
                    console.warn("[daily-synthesis] Failed to query api_key_models, using fallback key:", keySelectErr);
                }

                const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${selectedApiKey}`;
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [{ role: "user", parts: [{ text: synthesisPrompt }] }],
                        generationConfig: {
                            temperature: 0.1,
                            responseMimeType: "application/json",
                        },
                    }),
                });

                if (!response.ok) {
                    const errBody = await response.text();
                    console.error(`[daily-synthesis] ❌ Gemini Flash-Lite call failed for farmer ${farmerId} (HTTP ${response.status}):`, errBody);
                    result.details.push({ farmerId, status: "error", message: `HTTP ${response.status}` });
                    continue;
                }

                // Increment daily_usage for the chosen key model
                if (selectedKeyModelId) {
                    try {
                        await (supabaseAdmin as any).rpc("increment_model_usage", { model_id: selectedKeyModelId });
                    } catch {}
                }

                const responseData = await response.json();
                const rawJsonText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!rawJsonText) {
                    console.warn(`[daily-synthesis] ⚠️ Empty candidate output for farmer ${farmerId}`);
                    result.details.push({ farmerId, status: "skipped", message: "Empty output" });
                    continue;
                }

                const parsed = JSON.parse(rawJsonText);

                // 1. Upsert General Master Profile Synthesis
                if (parsed.master_profile_update) {
                    const masterData = {
                        farmer_id: farmerId,
                        area_scope: "general",
                        title: "الملف العام للفلاح",
                        work_context: parsed.master_profile_update.work_context || masterSynthesis?.work_context || "",
                        personal_context: parsed.master_profile_update.personal_context || masterSynthesis?.personal_context || "",
                        top_of_mind: parsed.master_profile_update.top_of_mind || masterSynthesis?.top_of_mind || "",
                        brief_history: parsed.master_profile_update.brief_history || masterSynthesis?.brief_history || "",
                        summary_content: parsed.master_profile_update.summary_content || masterSynthesis?.summary_content || "",
                        last_synthesized_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };

                    await supabaseAdmin
                        .from("farmer_synthesis")
                        .upsert(masterData, { onConflict: "farmer_id,area_scope" });

                    console.log(`[daily-synthesis] ✅ Updated Master Profile Synthesis for farmer ${farmerId}`);
                }

                // 2. Upsert Topic Syntheses
                if (Array.isArray(parsed.topic_syntheses) && parsed.topic_syntheses.length > 0) {
                    for (const topic of parsed.topic_syntheses) {
                        if (!topic.area_scope || !topic.summary_content) continue;
                        await supabaseAdmin
                            .from("farmer_synthesis")
                            .upsert({
                                farmer_id: farmerId,
                                area_scope: topic.area_scope,
                                title: topic.title || "موضوع متخصص",
                                summary_content: topic.summary_content,
                                key_topics: topic.key_topics || [],
                                last_synthesized_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            }, { onConflict: "farmer_id,area_scope" });
                    }
                    console.log(`[daily-synthesis] ✅ Updated ${parsed.topic_syntheses.length} Topic Syntheses for farmer ${farmerId}`);
                }

                // 3. Upsert Memory Facts with Superseding Chain
                if (Array.isArray(parsed.memory_facts_to_upsert) && parsed.memory_facts_to_upsert.length > 0) {
                    for (const mem of parsed.memory_facts_to_upsert) {
                        if (!mem.category || !mem.fact) continue;

                        let previousActiveId: string | null = null;
                        if (mem.supersedes_previous) {
                            const { data: prevMem } = await supabaseAdmin
                                .from("farmer_memory")
                                .select("id")
                                .eq("farmer_id", farmerId)
                                .eq("category", mem.category)
                                .eq("is_active", true)
                                .maybeSingle();

                            if (prevMem) {
                                previousActiveId = prevMem.id;
                            }
                        }

                        const { data: newInserted, error: insertErr } = await supabaseAdmin
                            .from("farmer_memory")
                            .insert({
                                farmer_id: farmerId,
                                category: mem.category,
                                fact: mem.fact,
                                confidence: mem.confidence || "high",
                                source: "daily_synthesis",
                                is_active: true,
                            })
                            .select("id")
                            .single();

                        if (!insertErr && newInserted && previousActiveId) {
                            await supabaseAdmin
                                .from("farmer_memory")
                                .update({ is_active: false, superseded_by: newInserted.id })
                                .eq("id", previousActiveId);
                        }
                    }
                    console.log(`[daily-synthesis] ✅ Synced ${parsed.memory_facts_to_upsert.length} Memory Fact(s) for farmer ${farmerId}`);
                }

                // 4. Update rigid farm profile if extracted
                if (parsed.farm_profile_properties && typeof parsed.farm_profile_properties === "object") {
                    const cleanedProfileProps = Object.fromEntries(
                        Object.entries(parsed.farm_profile_properties).filter(([_, v]) => v !== null && v !== undefined && v !== "")
                    );
                    if (Object.keys(cleanedProfileProps).length > 0) {
                        await supabaseAdmin.rpc("merge_farm_profile", {
                            farmer_id: farmerId,
                            target_scope: "general",
                            new_data: cleanedProfileProps,
                        });
                        console.log(`[daily-synthesis] ✅ Updated farm_profile for farmer ${farmerId}:`, Object.keys(cleanedProfileProps));
                    }
                }

                result.successCount++;
                result.details.push({ farmerId, status: "success" });
            } catch (farmerErr) {
                console.error(`[daily-synthesis] ❌ Error processing farmer ${farmerId}:`, farmerErr);
                result.details.push({ farmerId, status: "error", message: String(farmerErr) });
            }
        }

        // 3. Clean up chat messages older than 7 days (7-Day Rolling TTL)
        const { data: deletedCount, error: cleanupErr } = await supabaseAdmin.rpc("cleanup_old_chat_messages_7d");
        if (cleanupErr) {
            console.error("[daily-synthesis] ⚠️ Error running cleanup_old_chat_messages_7d:", cleanupErr);
        } else {
            result.cleanedOldMessagesCount = Number(deletedCount) || 0;
            console.log(`[daily-synthesis] 🧹 Cleaned up ${deletedCount} chat message(s) older than 7 days.`);
        }

        console.log(`[daily-synthesis] 🏁 Daily Batch Synthesis completed: ${result.successCount}/${result.farmersProcessed} farmers processed successfully.`);
        return result;
    } catch (outerErr) {
        console.error("[daily-synthesis] ❌ Critical unhandled error in runDailySynthesis:", outerErr);
        return result;
    }
}
