import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  getCairoDateString,
  calculateCropAgeDays,
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
import { EGYPT_CENTERS_COORDINATES, CenterCoordinates } from '@/data/egyptCenters';
import { getOrFetchCenterWeather } from '@/lib/weatherLogic';
import type { AlertInstance, CropRiskRule, CropQualityTip, WeatherSnapshot, FarmerField } from '@/lib/agenda/types';

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

function findNearestCenter(lat: number, lng: number): { center: CenterCoordinates; index: number } {
  let bestDist = Infinity;
  let bestCenter = EGYPT_CENTERS_COORDINATES[0];
  let bestIndex = 0;

  for (let i = 0; i < EGYPT_CENTERS_COORDINATES.length; i++) {
    const c = EGYPT_CENTERS_COORDINATES[i];
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) {
      bestDist = d;
      bestCenter = c;
      bestIndex = i;
    }
  }

  return { center: bestCenter, index: bestIndex };
}

const TERMINAL_STATUS_SQL = '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")';

/**
 * POST /api/agenda/evaluate
 * Rule-First Inverted Agenda Evaluation Engine:
 * 1. Pre-evaluates all Crop Risk Rules against Egyptian centers' weather in bulk.
 * 2. Matches triggered rules against targeted active fields with matching crop & growth stage.
 * 3. Handles state-machine transitions, safety timeouts, and writes daily_agenda_log with real weather snapshots.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const todayCairo = getCairoDateString();
    const nowIso = new Date().toISOString();

    // 1. Fetch all active crop risk rules
    const { data: rules } = await (supabase as any)
      .from('crop_risk_rules')
      .select('*')
      .eq('is_active', true);

    const activeRules: CropRiskRule[] = rules || [];

    // 2. Fetch all quality tips
    const { data: tips } = await (supabase as any)
      .from('crop_quality_tips')
      .select('*');

    const qualityTips: CropQualityTip[] = tips || [];

    // 3. Fetch all active farmer fields
    const { data: fields, error: fieldsErr } = await (supabase as any)
      .from('farmer_fields')
      .select('*')
      .eq('is_active', true);

    if (fieldsErr || !fields) {
      return NextResponse.json({ error: 'Failed to fetch farmer fields', details: fieldsErr }, { status: 500 });
    }

    const farmerFields: FarmerField[] = (fields as FarmerField[]).filter(
      (f) => f.planting_date && f.crop_type
    );

    if (farmerFields.length === 0) {
      return NextResponse.json({
        success: true,
        todayCairo,
        message: 'No active farmer fields with planting dates found.',
        processedFieldsCount: 0,
        newAlertsCount: 0,
        upgradedAlertsCount: 0,
        dailyLogsCount: 0,
      });
    }

    const fieldIds = farmerFields.map((f) => f.id);

    // 4. Fetch all cached weather data in one go
    const { data: weatherCacheRows } = await (supabase as any)
      .from('weather_cache')
      .select('*');

    const weatherByCenterKey = new Map<string, any>();
    if (weatherCacheRows) {
      for (const row of weatherCacheRows) {
        const key = `${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`;
        weatherByCenterKey.set(key, row);
      }
    }

    // 5. Build WeatherSnapshot for all Egyptian Centers
    const centerWeatherSnapshots: WeatherSnapshot[] = [];
    for (const center of EGYPT_CENTERS_COORDINATES) {
      const key = `${center.lat.toFixed(2)},${center.lng.toFixed(2)}`;
      let weatherData = weatherByCenterKey.get(key);

      if (!weatherData) {
        // Fallback: fetch directly if not in cache
        weatherData = await getOrFetchCenterWeather(center, supabase);
      }

      centerWeatherSnapshots.push({
        temperature: weatherData?.temperature_2m ?? 24,
        humidity: weatherData?.relative_humidity_2m ?? 55,
        wind_speed: weatherData?.wind_speed_10m ?? 10,
        radiation: weatherData?.et0_fao_evapotranspiration ?? 15,
        source_timestamp: weatherData?.fetched_at ?? nowIso,
        stale: !weatherData,
      });
    }

    // 6. [RULE-FIRST INVERTED EVALUATION]: Pre-evaluate Rules against Center Weather
    // triggeredRulesByCenter: centerIndex -> Array of triggered CropRiskRule
    const triggeredRulesByCenter: CropRiskRule[][] = EGYPT_CENTERS_COORDINATES.map((_, centerIdx) => {
      const snap = centerWeatherSnapshots[centerIdx];
      return activeRules.filter((rule) => evaluateWeatherConditions(rule.risk_causes, snap));
    });

    // 7. Bulk fetch all open alerts for active fields
    const { data: openAlertsData } = await (supabase as any)
      .from('alert_instances')
      .select('*')
      .in('farmer_field_id', fieldIds)
      .not('status', 'in', TERMINAL_STATUS_SQL);

    const openAlertsByFieldId = new Map<string, AlertInstance[]>();
    for (const alert of (openAlertsData || []) as AlertInstance[]) {
      const list = openAlertsByFieldId.get(alert.farmer_field_id) || [];
      list.push(alert);
      openAlertsByFieldId.set(alert.farmer_field_id, list);
    }

    // 7b. Bulk fetch recent alerts within last 14 days for Cooldown / Suppression Window check
    const fourteenDaysAgoIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentAlertsData } = await (supabase as any)
      .from('alert_instances')
      .select('id, farmer_field_id, risk_type, created_at, closed_at, follow_up_days_snapshot')
      .in('farmer_field_id', fieldIds)
      .gte('created_at', fourteenDaysAgoIso);

    const latestAlertByFieldAndRisk = new Map<string, { timestamp: string; followUpDays: number }>();
    if (recentAlertsData) {
      for (const alert of recentAlertsData) {
        const key = `${alert.farmer_field_id}:${alert.risk_type}`;
        const refTime = alert.closed_at || alert.created_at;
        const existing = latestAlertByFieldAndRisk.get(key);
        if (!existing || new Date(refTime) > new Date(existing.timestamp)) {
          latestAlertByFieldAndRisk.set(key, {
            timestamp: refTime,
            followUpDays: alert.follow_up_days_snapshot || 7,
          });
        }
      }
    }

    // 8. Bulk fetch last daily_agenda_log tips for rotation
    const { data: recentLogs } = await (supabase as any)
      .from('daily_agenda_log')
      .select('farmer_field_id, quality_tip_id')
      .in('farmer_field_id', fieldIds)
      .not('quality_tip_id', 'is', null)
      .order('created_at', { ascending: false });

    const lastTipByFieldId = new Map<string, string>();
    if (recentLogs) {
      for (const log of recentLogs) {
        if (!lastTipByFieldId.has(log.farmer_field_id)) {
          lastTipByFieldId.set(log.farmer_field_id, log.quality_tip_id);
        }
      }
    }

    let processedFieldsCount = 0;
    let newAlertsCount = 0;
    let upgradedAlertsCount = 0;
    let dailyLogsCount = 0;

    const newAlertsToInsert: any[] = [];
    const dailyLogsToUpsert: any[] = [];

    for (const field of farmerFields) {
      processedFieldsCount++;
      const cropAgeDays = calculateCropAgeDays(field.planting_date, todayCairo);
      const fieldLat = (field as any).latitude ?? 30.0444;
      const fieldLng = (field as any).longitude ?? 31.2357;

      const { index: nearestCenterIndex } = findNearestCenter(fieldLat, fieldLng);
      const weatherSnapshot = centerWeatherSnapshots[nearestCenterIndex];

      // Automatic end of season safety net (§5.4)
      const fieldCropRules = activeRules.filter((r) => r.crop_type === field.crop_type);
      if (isAutomaticSeasonEnd(fieldCropRules, cropAgeDays)) {
        const fieldAlerts = openAlertsByFieldId.get(field.id) || [];
        for (const alert of fieldAlerts) {
          const res = processEvent(alert, { type: 'HARVEST_EVENT' }, nowIso);
          await (supabase as any)
            .from('alert_instances')
            .update(res.updates)
            .eq('id', alert.id);
        }
        await (supabase as any)
          .from('farmer_fields')
          .update({ is_active: false })
          .eq('id', field.id);
        continue;
      }

      // Get applicable triggered rules for this field from pre-evaluated matrix
      const centerTriggeredRules = triggeredRulesByCenter[nearestCenterIndex] || [];
      const applicableTriggeredRules = centerTriggeredRules.filter(
        (r) =>
          r.crop_type === field.crop_type &&
          cropAgeDays >= r.stage_from_day &&
          cropAgeDays <= r.stage_to_day
      );

      const fieldOpenAlerts = openAlertsByFieldId.get(field.id) || [];

      for (const rule of applicableTriggeredRules) {
        // Opt-out check (§5.11)
        const optOut = checkNotificationOptOut(field, rule.severity);
        if (!optOut.shouldCreateAlert) {
          continue;
        }

        const triggerEval = evaluateRuleTrigger(fieldOpenAlerts, rule);

        if (triggerEval.action === 'create_new') {
          // Cooldown / Suppression Check (§Alert Fatigue Prevention)
          const riskKey = `${field.id}:${rule.risk_type}`;
          const lastAlert = latestAlertByFieldAndRisk.get(riskKey);
          if (lastAlert) {
            const cooldownDays = rule.follow_up_days || lastAlert.followUpDays || 7;
            const daysSinceLastAlert = (new Date(nowIso).getTime() - new Date(lastAlert.timestamp).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceLastAlert < cooldownDays) {
              // Still in cooldown period after previous alert/treatment -> skip duplicate alert
              continue;
            }
          }

          const newAlertData = createNewAlertData(field.id, rule, weatherSnapshot);
          newAlertsToInsert.push(newAlertData);
          newAlertsCount++;
          latestAlertByFieldAndRisk.set(riskKey, { timestamp: nowIso, followUpDays: rule.follow_up_days || 7 });
        } else if (triggerEval.action === 'upgrade' && triggerEval.existingAlert) {
          const upgradeRes = upgradeAlertSeverity(rule);
          await (supabase as any)
            .from('alert_instances')
            .update(upgradeRes.updates)
            .eq('id', triggerEval.existingAlert.id);
          upgradedAlertsCount++;
        }
      }

      // Check timeout transitions on open alerts:
      for (const alert of fieldOpenAlerts) {
        // Transition 21b: AWAITING_DISTRIBUTOR_ACTION deadline
        if (alert.status === 'AWAITING_DISTRIBUTOR_ACTION' && alert.escalation_deadline_at) {
          if (new Date(nowIso) > new Date(alert.escalation_deadline_at)) {
            const res = processEvent(alert, { type: 'DISTRIBUTOR_DEADLINE_EXCEEDED' }, nowIso);
            await (supabase as any).from('alert_instances').update(res.updates).eq('id', alert.id);
          }
        }

        // Transition 15d: PRODUCT_ORDERED 5-day delivery timeout
        if (alert.status === 'PRODUCT_ORDERED' && alert.order_status === 'ordered' && alert.order_placed_at) {
          const daysSinceOrder = (new Date(nowIso).getTime() - new Date(alert.order_placed_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceOrder >= 5) {
            const res = processEvent(alert, { type: 'ORDER_DELIVERY_EXPIRED' }, nowIso);
            await (supabase as any).from('alert_instances').update(res.updates).eq('id', alert.id);
          }
        }

        // Transition 9b: DIAGNOSIS_PAUSED 72h timeout
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
      const lastTipId = lastTipByFieldId.get(field.id) || null;
      const selectedTip = selectRotatedQualityTip(matchingQualityTips, lastTipId);

      const primaryOpenAlert = fieldOpenAlerts.length > 0 ? fieldOpenAlerts[0] : null;

      dailyLogsToUpsert.push({
        farmer_field_id: field.id,
        date: todayCairo,
        alert_instance_id: primaryOpenAlert ? primaryOpenAlert.id : null,
        quality_tip_id: selectedTip ? selectedTip.id : null,
        weather_snapshot: weatherSnapshot,
      });
    }

    // Bulk insert new alerts
    if (newAlertsToInsert.length > 0) {
      await (supabase as any).from('alert_instances').insert(newAlertsToInsert);
    }

    // Bulk upsert daily logs (No Gaps)
    if (dailyLogsToUpsert.length > 0) {
      const { error: logUpsertErr } = await (supabase as any)
        .from('daily_agenda_log')
        .upsert(dailyLogsToUpsert, { onConflict: 'farmer_field_id,date', ignoreDuplicates: true });

      if (!logUpsertErr) {
        dailyLogsCount = dailyLogsToUpsert.length;
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

