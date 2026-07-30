'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertTriangle, Clock, ChevronLeft, Users } from 'lucide-react';
import Link from 'next/link';

interface AlertSummary {
  id: string;
  risk_type: string;
  severity_snapshot: 'critical' | 'moderate' | 'preventive';
  status: string;
  advice_text_snapshot: string;
  created_at: string;
  farmer_name?: string;
  field_name?: string;
}

const severityConfig = {
  critical: {
    label: 'حرجة',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    dot: 'bg-red-400',
    emoji: '🔴',
  },
  moderate: {
    label: 'متوسطة',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    emoji: '🟡',
  },
  preventive: {
    label: 'وقائية',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    emoji: '🟢',
  },
};

const statusLabels: Record<string, string> = {
  SENT: 'أُرسل - بانتظار رد',
  FOLLOW_UP_SENT: 'متابعة مُرسلة',
  AWAITING_DIAGNOSIS: 'في تشخيص ذكي',
  CONFIRMED_ACTIVE: 'مؤكد - نشط',
  PRODUCT_ORDERED: 'منتج مطلوب',
  AWAITING_DISTRIBUTOR_ACTION: 'ينتظر تدخلك ⚡',
  INCONCLUSIVE: 'غير محسوم',
  NO_RESPONSE: 'لا رد من الفلاح',
  AMBIGUOUS_RETRY: 'رد غامض - إعادة',
};

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
  return `منذ ${Math.floor(diff / 86400)} يوم`;
}

export default function DistributorAgendaWidget({ distributorId }: { distributorId: string }) {
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAlerts() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch open alerts for all farmers under this distributor
        // Ordered by severity (critical first), then by created_at
        const { data, count } = await (supabase as any)
          .from('alert_instances')
          .select(
            `
            id,
            risk_type,
            severity_snapshot,
            status,
            advice_text_snapshot,
            created_at,
            farmer_fields!inner (
              field_name,
              farmers!inner (
                distributor_id,
                profiles ( full_name )
              )
            )
          `,
            { count: 'exact' }
          )
          .eq('farmer_fields.farmers.distributor_id', distributorId)
          .not('status', 'in', '("CLOSED_FALSE_ALARM","AUTO_CLOSED_NO_RESPONSE","RESOLVED","CROP_LOSS","CLOSED_SEASON_END","MISDIAGNOSED_ORIGINAL")')
          .order('severity_snapshot', { ascending: true }) // critical sorts first in enum
          .order('created_at', { ascending: true })
          .limit(5);

        setTotalCount(count || 0);

        if (data) {
          const mapped: AlertSummary[] = data.map((row: any) => ({
            id: row.id,
            risk_type: row.risk_type,
            severity_snapshot: row.severity_snapshot,
            status: row.status,
            advice_text_snapshot: row.advice_text_snapshot,
            created_at: row.created_at,
            farmer_name: row.farmer_fields?.farmers?.profiles?.full_name || 'فلاح',
            field_name: row.farmer_fields?.field_name || 'حقل',
          }));
          setAlerts(mapped);
        }
      } catch (err) {
        console.error('Failed to load distributor agenda:', err);
      } finally {
        setLoading(false);
      }
    }

    if (distributorId) loadAlerts();
  }, [distributorId]);

  return (
    <div className="mt-8">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-white font-bold text-lg">أجندة المزارعين</h2>
            <p className="text-slate-400 text-xs">التنبيهات الزراعية المفتوحة لمزارعيك</p>
          </div>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold px-3 py-1 rounded-full">
              {totalCount} مفتوح
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-slate-700 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-700 rounded w-2/3" />
                  <div className="h-3 bg-slate-700 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-10 text-center">
          <div className="text-4xl mb-3">🌱</div>
          <p className="text-slate-400 text-sm font-medium">لا توجد تنبيهات مفتوحة</p>
          <p className="text-slate-500 text-xs mt-1">مزارعوك بخير الآن</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const sev = severityConfig[alert.severity_snapshot] || severityConfig.preventive;
            const isUrgent = alert.status === 'AWAITING_DISTRIBUTOR_ACTION';
            return (
              <div
                key={alert.id}
                className={`border rounded-2xl p-4 transition-all ${sev.bg} ${sev.border} ${
                  isUrgent ? 'ring-1 ring-red-500/40 animate-[pulse_3s_ease-in-out_infinite]' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Severity Dot */}
                  <div className="mt-1 flex-shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${sev.dot} ${isUrgent ? 'animate-ping' : ''}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Farmer + Risk */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-white text-sm font-bold truncate">
                        {alert.farmer_name}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-slate-900/50 ${sev.color}`}>
                        {sev.emoji} {sev.label}
                      </span>
                    </div>

                    {/* Risk Type & Field */}
                    <p className="text-slate-300 text-xs mb-1">
                      🌿 {alert.risk_type} — {alert.field_name}
                    </p>

                    {/* Status */}
                    <p className={`text-xs font-medium ${isUrgent ? 'text-red-300' : 'text-slate-400'}`}>
                      {statusLabels[alert.status] || alert.status}
                    </p>
                  </div>

                  {/* Time */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1 text-slate-500 text-[10px]">
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(alert.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* View All Button */}
          {totalCount > 5 && (
            <Link
              href="/distributor/farmers"
              className="flex items-center justify-center gap-2 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 rounded-2xl py-3 text-sm transition-all group"
            >
              <Users className="w-4 h-4" />
              <span>عرض جميع المزارعين ({totalCount - 5} تنبيه إضافي)</span>
              <ChevronLeft className="w-4 h-4 group-hover:translate-x-[-3px] transition-transform" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
