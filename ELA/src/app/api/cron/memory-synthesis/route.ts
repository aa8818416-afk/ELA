import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { runDailySynthesis } from "@/lib/memory/dailySynthesis";

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const querySecret = searchParams.get("secret");
        const authHeader = request.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;
        
        const isAuthorized = !cronSecret || 
            authHeader === `Bearer ${cronSecret}` || 
            querySecret === cronSecret ||
            process.env.NODE_ENV === "development";

        if (!isAuthorized) {
            return NextResponse.json({ error: "غير مصرح لك باستدعاء مهمة الدمج" }, { status: 401 });
        }

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (!serviceRoleKey || !supabaseUrl) {
            return NextResponse.json({ error: "إعدادات البيئة غير مكتملة (Supabase)" }, { status: 500 });
        }

        const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey);

        let geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            const { data: dbKey } = await (supabaseAdmin as any)
                .from("api_keys")
                .select("api_key")
                .eq("status", "active")
                .eq("project_name", "gemini")
                .limit(1)
                .single();

            if (dbKey?.api_key) {
                geminiApiKey = dbKey.api_key;
            }
        }

        if (!geminiApiKey) {
            return NextResponse.json({ error: "لا يوجد مفتاح Gemini نشط لتشغيل التلخيص" }, { status: 500 });
        }

        const result = await runDailySynthesis(supabaseAdmin, geminiApiKey);

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            result,
        });
    } catch (err: any) {
        console.error("[api/cron/memory-synthesis] Error:", err);
        return NextResponse.json({ error: err.message || "حدث خطأ غير متوقع" }, { status: 500 });
    }
}

export async function GET(request: Request) {
    return POST(request);
}
