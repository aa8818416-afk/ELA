import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { processEvent } from '@/lib/agenda/state-machine';
import { EGYPT_CENTERS_COORDINATES } from '@/data/egyptCenters';
import { getOrFetchCenterWeather } from '@/lib/weatherLogic';
import type { AlertEvent, AlertInstance, WeatherSnapshot } from '@/lib/agenda/types';

export const dynamic = 'force-dynamic';

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface RespondRequestBody {
  alertInstanceId: string;
  responseType:
    | 'OK'                // "تمام"
    | 'PROBLEM'           // "في مشكلة"
    | 'WANT_PRODUCT'      // "عايز المنتج"
    | 'IMPROVED'          // "اتحسن"
    | 'SAME'              // "لسه زي ما هو"
    | 'WORSE'             // "زاد سوء"
    | 'CROP_LOSS'         // "فقدت المحصول بالكامل"
    | 'AMBIGUOUS';        // رد غامض
  rawText?: string;
}

/**
 * POST /api/agenda/respond
 * Handles farmer feedback on alerts and triggers state machine transitions.
 * Captures real weather_snapshot_at_response upon response.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body: RespondRequestBody = await req.json();
    const nowIso = new Date().toISOString();

    if (!body.alertInstanceId || !body.responseType) {
      return NextResponse.json({ error: 'alertInstanceId and responseType are required' }, { status: 400 });
    }

    // 1. Fetch current alert instance
    const { data: alert, error: fetchErr } = await (supabase as any)
      .from('alert_instances')
      .select('*')
      .eq('id', body.alertInstanceId)
      .single();

    if (fetchErr || !alert) {
      return NextResponse.json({ error: 'Alert instance not found' }, { status: 404 });
    }

    const alertInstance: AlertInstance = alert;

    // 2. Fetch real weather snapshot at response time for farmer's field location
    const { data: fieldData } = await (supabase as any)
      .from('farmer_fields')
      .select('latitude, longitude')
      .eq('id', alertInstance.farmer_field_id)
      .maybeSingle();

    const fieldLat = fieldData?.latitude ?? 30.0444;
    const fieldLng = fieldData?.longitude ?? 31.2357;

    const nearestCenter = EGYPT_CENTERS_COORDINATES.reduce(
      (best, c) => {
        const d = haversineKm(fieldLat, fieldLng, c.lat, c.lng);
        return d < best.dist ? { center: c, dist: d } : best;
      },
      { center: EGYPT_CENTERS_COORDINATES[0], dist: Infinity }
    ).center;

    const weatherData = await getOrFetchCenterWeather(nearestCenter, supabase);

    const currentResponseWeather: WeatherSnapshot = {
      temperature: weatherData?.temperature_2m ?? 24,
      humidity: weatherData?.relative_humidity_2m ?? 55,
      wind_speed: weatherData?.wind_speed_10m ?? 10,
      radiation: weatherData?.et0_fao_evapotranspiration ?? 15,
      source_timestamp: weatherData?.fetched_at ?? nowIso,
      captured_at_response: true,
      stale: !weatherData,
    };

    // 3. Map request responseType to AlertEvent
    let event: AlertEvent;
    switch (body.responseType) {
      case 'OK':
        event = { type: 'FARMER_RESPONSE_OK' };
        break;
      case 'PROBLEM':
        event = { type: 'FARMER_RESPONSE_PROBLEM' };
        break;
      case 'WANT_PRODUCT':
        event = { type: 'FARMER_RESPONSE_WANT_PRODUCT' };
        break;
      case 'IMPROVED':
        event = { type: 'FOLLOW_UP_RESPONSE_IMPROVED' };
        break;
      case 'SAME':
        event = { type: 'FOLLOW_UP_RESPONSE_SAME' };
        break;
      case 'WORSE':
        event = { type: 'FOLLOW_UP_RESPONSE_WORSE' };
        break;
      case 'CROP_LOSS':
        event = { type: 'FOLLOW_UP_RESPONSE_CROP_LOSS' };
        break;
      case 'AMBIGUOUS':
        event = { type: 'AMBIGUOUS_RESPONSE', rawText: body.rawText || '' };
        break;
      default:
        return NextResponse.json({ error: 'Invalid responseType' }, { status: 400 });
    }

    // 4. Process transition using state machine
    const transitionResult = processEvent(alertInstance, event, nowIso);

    const finalUpdates = {
      ...transitionResult.updates,
      weather_snapshot_at_response: currentResponseWeather,
    };

    const hasCascadeClose = transitionResult.sideEffects.some((e) => e.type === 'CLOSE_ALL_FIELD_ALERTS');

    let updatedAlert;

    if (hasCascadeClose) {
      // 5a. True single DB transaction via atomic RPC: closes ALL alerts for this field in 1 SQL query (§4 transition 19)
      await (supabase as any).rpc('close_all_field_alerts_on_crop_loss', {
        p_farmer_field_id: alertInstance.farmer_field_id,
        p_closed_at: nowIso,
        p_weather_snapshot: currentResponseWeather,
      });

      const { data: refreshed } = await (supabase as any)
        .from('alert_instances')
        .select('*')
        .eq('id', alertInstance.id)
        .single();

      updatedAlert = refreshed;
    } else {
      // 5b. Standard single alert update
      const { data: updated, error: updateErr } = await (supabase as any)
        .from('alert_instances')
        .update(finalUpdates)
        .eq('id', alertInstance.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json({ error: 'Failed to update alert instance', details: updateErr }, { status: 500 });
      }

      updatedAlert = updated;
    }

    // 6. Execute remaining side effects (e.g. CREATE_RULE_REVIEW_FLAG)
    for (const effect of transitionResult.sideEffects) {
      if (effect.type === 'CREATE_RULE_REVIEW_FLAG') {
        await (supabase as any).from('rule_review_flags').insert({
          farmer_field_id: effect.farmerFieldId,
          risk_type: effect.riskType,
          matched_risk_rule_id: effect.ruleId,
          streak_count: effect.streakCount,
        });
      }
    }

    return NextResponse.json({
      success: true,
      alert: updatedAlert,
      sideEffects: transitionResult.sideEffects,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Respond processing failed', message: err.message }, { status: 500 });
  }
}
