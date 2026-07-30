'use client';

import { useState, useCallback } from 'react';
import { DailyAgendaView, FieldAgendaViewData } from '@/components/agenda/DailyAgendaView';
import type { AlertInstance, CropQualityTip } from '@/lib/agenda/types';

interface FieldRaw {
  id: string;
  field_name: string | null;
  crop_type: string;
  planting_date: string;
  area_feddan: number | null;
  notifications_enabled: boolean;
}

interface AlertRaw {
  id: string;
  farmer_field_id: string;
  risk_type: string;
  severity_snapshot: string;
  status: string;
  advice_text_snapshot: string;
  advice_reason_snapshot?: string;
  follow_up_due_at?: string;
  no_response_count: number;
  false_alarm_streak_count: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

interface LogRaw {
  farmer_field_id: string;
  quality_tip_id: string | null;
  crop_quality_tips: CropQualityTip | null;
}

interface Props {
  fields: FieldRaw[];
  openAlerts: AlertRaw[];
  todayLogs: LogRaw[];
}

function getDaysSincePlanting(plantingDate: string): number {
  const planting = new Date(plantingDate);
  const now = new Date();
  return Math.floor((now.getTime() - planting.getTime()) / (1000 * 60 * 60 * 24));
}

import AddFieldModal from '@/components/agenda/AddFieldModal';

export default function FarmerAgendaClient({ fields, openAlerts, todayLogs }: Props) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Build FieldAgendaViewData for each field
  const fieldsAgendaData: FieldAgendaViewData[] = fields.map((field) => {
    const fieldAlerts = openAlerts
      .filter((a) => a.farmer_field_id === field.id)
      .map((a) => a as unknown as AlertInstance);

    const todayLog = todayLogs.find((l) => l.farmer_field_id === field.id);
    const qualityTip = todayLog?.crop_quality_tips || null;

    return {
      fieldId: field.id,
      fieldName: field.field_name || `حقل ${field.crop_type}`,
      cropType: field.crop_type,
      plantingDate: field.planting_date,
      cropAgeDays: getDaysSincePlanting(field.planting_date),
      alerts: fieldAlerts,
      qualityTip,
    };
  });

  const handleRespond = useCallback(async (alertId: string, responseType: string) => {
    setLoadingKey(alertId);
    try {
      const res = await fetch('/api/agenda/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertInstanceId: alertId, responseType }),
      });
      if (!res.ok) throw new Error('فشل إرسال الرد');
      // Refresh the page to get updated data
      window.location.reload();
    } catch (err) {
      console.error('Respond error:', err);
    } finally {
      setLoadingKey(null);
    }
  }, []);

  const handleHarvest = useCallback(async (fieldId: string) => {
    setLoadingKey(`harvest-${fieldId}`);
    try {
      const res = await fetch('/api/agenda/harvest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerFieldId: fieldId }),
      });
      if (!res.ok) throw new Error('فشل تسجيل الحصاد');
      window.location.reload();
    } catch (err) {
      console.error('Harvest error:', err);
    } finally {
      setLoadingKey(null);
    }
  }, []);

  // Suppress unused variable warning
  void loadingKey;

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-3xl p-4">
        <div>
          <h3 className="text-white font-bold text-sm">أراضيك ومحاصيلك</h3>
          <p className="text-slate-400 text-xs">إجمالي الحقول: {fields.length}</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2.5 rounded-2xl flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-950/50"
        >
          <span>🌱</span>
          <span>إضافة محصول جديد</span>
        </button>
      </div>

      <DailyAgendaView
        fieldsAgendaData={fieldsAgendaData}
        onRespond={handleRespond}
        onHarvest={handleHarvest}
        onAddNewField={() => setIsAddModalOpen(true)}
      />

      <AddFieldModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => window.location.reload()}
      />
    </div>
  );
}
