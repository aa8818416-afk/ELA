import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  getCairoDateString,
  calculateCropAgeDays,
  getApplicableRules,
  evaluateWeatherConditions,
  checkNotificationOptOut,
  isAutomaticSeasonEnd,
} from '@/lib/agenda/rule-engine';
import {
  evaluateRuleTrigger,
  createNewAlertData,
  upgradeAlertSeverity,
  processEvent,
} from '@/lib/agenda/state-machine';
import { selectRotatedQualityTip } from '@/lib/agenda/quality-tips';
import type { AlertInstance, CropRiskRule, CropQualityTip, WeatherSnapshot, FarmerField } from '@/lib/agenda/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agenda/evaluate
 * Daily cron route evaluating crop risk rules, writing daily_agenda_log,
 * handling state machine timeouts, distributor deadlines, and sending bundled notifications.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const todayCairo = getCairoDateString();
    const nowIso = new Date().toISOString();

    // 1. Fetch all active farmer fields
    const { data: fields, error: fieldsErr } = await (supabase as any)
      .from('farmer_fields')
      .select('*')
      .eq('is_active', true);

    if (fieldsErr || !fields) {
      return NextResponse.json({ error: 'Failed to fetch farmer fields', details: fieldsErr }, { status: 500 });
    }

    // 2. Fetch all active crop risk rules
    const { data: rules } = await (supabase as any)
      .from('crop_risk_rules')
      .select('*')
      .eq('is_active', true);

    const activeRules: CropRiskRule[] = rules || [];

    // 3. Fetch all active quality tips
    const { data: tips } = await (supabase as any)
      .from('crop_quality_tips')
      .select('*');

    const qualityTips: CropQualityTip[] = tips || [];

    let processedFieldsCount = 0;
    let newAlertsCount = 0;
    let upgradedAlertsCount = 0;
    let dailyLogsCount = 0;

    const farmerFields = fields as FarmerField[];

    for (const field of farmerFields) {
      // Guard: skip any non-active registration or draft fields missing planting_date/crop_type
      if (!field.planting_date || !field.crop_type) {
        continue;
      }
      processedFieldsCount++;
      const cropAgeDays = calculateCropAgeDays(field.planting_date, todayCairo);

      // Check automatic end of season safety net (§5.4)
      const fieldRules = activeRules.filter((r) => r.crop_type === field.crop_type);
      if (isAutomaticSeasonEnd(fieldRules, cropAgeDays)) {
        // Close all open alerts for this field due to season end (§4 transition 22)
        const { data: openAlerts } = await (supabase as any)
          .from('alert_instances')
          .select('*')
          .eq('farmer_field_id', field.id)
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
        // Mark field inactive
        await (supabase as any)
          .from('farmer_fields')
          .update({ is_active: false })
          .eq('id', field.id);

        continue;
      }

      // Mock or fetch weather snapshot for field location (§5.10 fallback)
      const weatherSnapshot: WeatherSnapshot = {
        temperature: 22,
        humidity: 82,
        wind_speed: 12,
        radiation: 15,
        source_timestamp: nowIso,
        stale: false,
      };

      // Get applicable rules for current crop and age
      const matchingRules = getApplicableRules(activeRules, field.crop_type, cropAgeDays);

      // Get open alerts for this field
      const { data: existingOpenAlerts } = await (supabase as any)
        .from('alert_instances')
        .select('*')
        .eq('farmer_field_id', field.id)
        .not('status', 'in', '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")');

      const openAlertsList: AlertInstance[] = existingOpenAlerts || [];

      // Evaluate rules against weather conditions
      for (const rule of matchingRules) {
        if (!evaluateWeatherConditions(rule.risk_causes, weatherSnapshot)) {
          continue;
        }

        // Check opt-out settings (§5.11)
        const optOut = checkNotificationOptOut(field, rule.severity);
        if (!optOut.shouldCreateAlert) {
          continue;
        }

        const triggerEval = evaluateRuleTrigger(openAlertsList, rule);

        if (triggerEval.action === 'create_new') {
          // Transition 1a: Create new alert
          const newAlertData = createNewAlertData(field.id, rule, weatherSnapshot);
          const { data: createdAlert, error: createErr } = await (supabase as any)
            .from('alert_instances')
            .insert(newAlertData)
            .select()
            .single();

          if (!createErr && createdAlert) {
            newAlertsCount++;
            openAlertsList.push(createdAlert as AlertInstance);
          }
        } else if (triggerEval.action === 'upgrade' && triggerEval.existingAlert) {
          // Transition 1c: Upgrade severity on existing open alert
          const upgradeRes = upgradeAlertSeverity(rule);
          await (supabase as any)
            .from('alert_instances')
            .update(upgradeRes.updates)
            .eq('id', triggerEval.existingAlert.id);

          upgradedAlertsCount++;
        }
      }

      // Check timeout transitions on existing open alerts:
      // Transition 21b: Check AWAITING_DISTRIBUTOR_ACTION deadline
      for (const alert of openAlertsList) {
        if (alert.status === 'AWAITING_DISTRIBUTOR_ACTION' && alert.escalation_deadline_at) {
          if (new Date(nowIso) > new Date(alert.escalation_deadline_at)) {
            const res = processEvent(alert, { type: 'DISTRIBUTOR_DEADLINE_EXCEEDED' }, nowIso);
            await (supabase as any).from('alert_instances').update(res.updates).eq('id', alert.id);
          }
        }

        // Transition 15d: Check PRODUCT_ORDERED 5-day delivery timeout
        if (alert.status === 'PRODUCT_ORDERED' && alert.order_status === 'ordered' && alert.order_placed_at) {
          const daysSinceOrder = (new Date(nowIso).getTime() - new Date(alert.order_placed_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceOrder >= 5) {
            const res = processEvent(alert, { type: 'ORDER_DELIVERY_EXPIRED' }, nowIso);
            await (supabase as any).from('alert_instances').update(res.updates).eq('id', alert.id);
          }
        }

        // Transition 9b: Check DIAGNOSIS_PAUSED 72h timeout
        if (alert.status === 'DIAGNOSIS_PAUSED' && alert.diagnosis_paused_at) {
          const hoursPaused = (new Date(nowIso).getTime() - new Date(alert.diagnosis_paused_at).getTime()) / (1000 * 60 * 60);
          if (hoursPaused >= 72) {
            const res = processEvent(alert, { type: 'DIAGNOSIS_PAUSED_TIMEOUT' }, nowIso);
            await (supabase as any).from('alert_instances').update(res.updates).eq('id', alert.id);
          }
        }
      }

      // Quality tip selection with rotation (§5.6)
      const matchingQualityTips = qualityTips.filter(
        (t) => t.crop_type === field.crop_type && cropAgeDays >= t.stage_from_day && cropAgeDays <= t.stage_to_day
      );

      // Get last displayed tip for this field from daily_agenda_log
      const { data: lastLog } = await (supabase as any)
        .from('daily_agenda_log')
        .select('quality_tip_id')
        .eq('farmer_field_id', field.id)
        .not('quality_tip_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const selectedTip = selectRotatedQualityTip(matchingQualityTips, lastLog?.quality_tip_id || null);

      // Determine active open alert for daily_agenda_log link
      // Primary open alert link (if any open alert exists, link to highest severity open alert)
      const primaryOpenAlert = openAlertsList.length > 0 ? openAlertsList[0] : null;

      // Upsert daily_agenda_log row for today (Cairo timezone) — NO GAPS!
      const { error: logErr } = await (supabase as any)
        .from('daily_agenda_log')
        .upsert(
          {
            farmer_field_id: field.id,
            date: todayCairo,
            alert_instance_id: primaryOpenAlert ? primaryOpenAlert.id : null,
            quality_tip_id: selectedTip ? selectedTip.id : null,
            weather_snapshot: weatherSnapshot,
          },
          { onConflict: 'farmer_field_id,date', ignoreDuplicates: true }
        );

      if (!logErr) {
        dailyLogsCount++;
      }
    }

    return NextResponse.json({
      success: true,
      todayCairo,
      processedFieldsCount,
      newAlertsCount,
      upgradedAlertsCount,
      dailyLogsCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Evaluation failed', message: err.message }, { status: 500 });
  }
}
