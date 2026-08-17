import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { processEvent } from '@/lib/agenda/state-machine';
import { EGYPT_CENTERS_COORDINATES } from '@/data/egyptCenters';
import { getOrFetchCenterWeather } from '@/lib/weatherLogic';
import type { AlertInstance, WeatherSnapshot } from '@/lib/agenda/types';

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

interface DiagnosisRequestBody {
  alertInstanceId: string;
  userMessage?: string;
  finalDecision?: 'CONFIRMED_SAME' | 'DIFFERENT_PROBLEM' | 'INCONCLUSIVE';
  newRiskType?: string;
  newRiskDetails?: string;
}

/**
 * POST /api/agenda/diagnosis
 * Interactive AI diagnosis endpoint.
 * Captures weather_snapshot_at_response ONCE at final decision moment (§8/expert audit).
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body: DiagnosisRequestBody = await req.json();
    const nowIso = new Date().toISOString();

    if (!body.alertInstanceId) {
      return NextResponse.json({ error: 'alertInstanceId is required' }, { status: 400 });
    }

    // Fetch alert instance
    const { data: alert, error: fetchErr } = await (supabase as any)
      .from('alert_instances')
      .select('*')
      .eq('id', body.alertInstanceId)
      .single();

    if (fetchErr || !alert) {
      return NextResponse.json({ error: 'Alert instance not found' }, { status: 404 });
    }

    const alertInstance: AlertInstance = alert;

    // Intermediate chat turn (no final decision yet) — do NOT capture weather here (§8)
    if (!body.finalDecision) {
      return NextResponse.json({
        success: true,
        alertId: alertInstance.id,
        status: alertInstance.status,
        message: 'متابعة التشخيص جارية — أرسل تفاصيل أكتر أو صورة',
      });
    }

    // FINAL DECISION REACHED — capture real weather snapshot ONCE here (§8)
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

    const finalDecisionWeather: WeatherSnapshot = {
      temperature: weatherData?.temperature_2m ?? 24,
      humidity: weatherData?.relative_humidity_2m ?? 55,
      wind_speed: weatherData?.wind_speed_10m ?? 10,
      radiation: weatherData?.et0_fao_evapotranspiration ?? 15,
      source_timestamp: weatherData?.fetched_at ?? nowIso,
      captured_at_final_diagnosis: true,
      stale: !weatherData,
    };

    let transitionResult;
    if (body.finalDecision === 'CONFIRMED_SAME') {
      // Transition 10: CONFIRMED_ACTIVE
      transitionResult = processEvent(alertInstance, { type: 'DIAGNOSIS_CONFIRMED_SAME' }, nowIso);
    } else if (body.finalDecision === 'DIFFERENT_PROBLEM') {
      // Transition 11: MISDIAGNOSED_ORIGINAL
      transitionResult = processEvent(
        alertInstance,
        {
          type: 'DIAGNOSIS_DIFFERENT_PROBLEM',
          newRiskType: body.newRiskType || 'unknown_risk',
          newRiskDetails: body.newRiskDetails || 'مشكلة مختلفة تم تشخيصها',
        },
        nowIso
      );
    } else {
      // Transition 12: INCONCLUSIVE
      transitionResult = processEvent(alertInstance, { type: 'DIAGNOSIS_INCONCLUSIVE' }, nowIso);
    }

    // Apply updates + final decision weather snapshot
    const finalUpdates = {
      ...transitionResult.updates,
      weather_snapshot_at_response: finalDecisionWeather,
    };

    const { data: updatedAlert, error: updateErr } = await (supabase as any)
      .from('alert_instances')
      .update(finalUpdates)
      .eq('id', alertInstance.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update alert instance', details: updateErr }, { status: 500 });
    }

    // Execute side effects (e.g. create parent-linked alert for MISDIAGNOSED_ORIGINAL)
    for (const effect of transitionResult.sideEffects) {
      if (effect.type === 'CREATE_NEW_ALERT') {
        await (supabase as any).from('alert_instances').insert(effect.data);
      }
    }

    return NextResponse.json({
      success: true,
      decision: body.finalDecision,
      alert: updatedAlert,
      sideEffects: transitionResult.sideEffects,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Diagnosis failed', message: err.message }, { status: 500 });
  }
}
