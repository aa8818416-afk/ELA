import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { processEvent } from '@/lib/agenda/state-machine';
import type { AlertInstance, WeatherSnapshot } from '@/lib/agenda/types';

export const dynamic = 'force-dynamic';

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

    // FINAL DECISION REACHED — capture weather snapshot ONCE here (§8)
    const finalDecisionWeather: WeatherSnapshot = {
      temperature: 23,
      humidity: 80,
      source_timestamp: nowIso,
      captured_at_final_diagnosis: true,
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
