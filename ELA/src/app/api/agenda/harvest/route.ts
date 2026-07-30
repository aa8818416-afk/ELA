import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { processEvent } from '@/lib/agenda/state-machine';

export const dynamic = 'force-dynamic';

interface HarvestRequestBody {
  farmerFieldId: string;
}

/**
 * POST /api/agenda/harvest
 * Manual harvest registration endpoint (§5.4).
 * Closes all open alerts for the field with CLOSED_SEASON_END (transition 22).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body: HarvestRequestBody = await req.json();
    const nowIso = new Date().toISOString();

    if (!body.farmerFieldId) {
      return NextResponse.json({ error: 'farmerFieldId is required' }, { status: 400 });
    }

    // 1. Fetch all open alerts for this field
    const { data: openAlerts } = await (supabase as any)
      .from('alert_instances')
      .select('*')
      .eq('farmer_field_id', body.farmerFieldId)
      .not('status', 'in', '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")');

    if (openAlerts && openAlerts.length > 0) {
      for (const alert of (openAlerts as any[])) {
        const res = processEvent(alert, { type: 'HARVEST_EVENT' }, nowIso);
        await (supabase as any)
          .from('alert_instances')
          .update(res.updates)
          .eq('id', alert.id);
      }
    }

    // 2. Set field inactive
    await (supabase as any)
      .from('farmer_fields')
      .update({ is_active: false })
      .eq('id', body.farmerFieldId);

    return NextResponse.json({
      success: true,
      farmerFieldId: body.farmerFieldId,
      closedAlertsCount: openAlerts?.length || 0,
      message: 'تم تسجيل الحصاد وإغلاق جميع التنبيهات للموسم الحالي بنجاح',
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Harvest registration failed', message: err.message }, { status: 500 });
  }
}
