'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AlertTriangle, Clock, ChevronLeft, Users, ShieldAlert, Sparkles, MessageCircle, ShoppingCart } from 'lucide-react';
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
    label: 'حرجة عاجلة',
    color: 'text-rose-800',
    bg: 'bg-rose-50/80',
    border: 'border-rose-200',
    dot: 'bg-rose-600',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    emoji: '🔴',
  },
  moderate: {
    label: 'متوسطة',
    color: 'text-amber-800',
    bg: 'bg-amber-50/80',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    emoji: '🟡',
  },
  preventive: {
    label: 'وقائية',
    color: 'text-emerald-800',
    bg: 'bg-emerald-50/80',
    border: 'border-emerald-200',
    dot: 'bg-emerald-600',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    emoji: '🟢',
  },
};

const statusLabels: Record<string, string> = {
  SENT: 'أُرسل - بانتظار رد الفلاح',
  FOLLOW_UP_SENT: 'متابعة مُرسلة',
  AWAITING_DIAGNOSIS: 'في تشخيص ذكي',
  CONFIRMED_ACTIVE: 'مؤكد - إصابة نشطة',
  PRODUCT_ORDERED: 'تم طلب المنتج العلاجي',
  AWAITING_DISTRIBUTOR_ACTION: 'ينتظر تدخل السفير ⚡',
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          .order('severity_snapshot', { ascending: true }) // critical sorts first
          .order('created_at', { ascending: true })
          .limit(5);

        setTotalCount(count || 0);

        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    <div className="bg-white rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shadow-2xs flex-shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-slate-900 font-bold text-sm sm:text-base leading-tight">أجندة المزارعين والمخاطر</h2>
            <p className="text-slate-500 text-[11px] sm:text-xs mt-0.5 truncate">تنبيهات تتطلب متابعة ميدانية</p>
          </div>
        </div>
        {totalCount > 0 && (
          <span className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold px-2.5 sm:px-3 py-1 rounded-full shadow-2xs flex-shrink-0">
            {totalCount} تنبيه
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-slate-200 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-6 sm:p-8 text-center">
          <div className="text-3xl sm:text-4xl mb-2">🌱</div>
          <p className="text-slate-900 font-bold text-sm">كافة حقول المزارعين بخير ومستقرة</p>
          <p className="text-slate-500 text-xs mt-1">لا توجد تنبيهات آفات أو أمراض مفتوحة حالياً في قريتك</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const sev = severityConfig[alert.severity_snapshot] || severityConfig.preventive;
            const isUrgent = alert.status === 'AWAITING_DISTRIBUTOR_ACTION';
            return (
              <div
                key={alert.id}
                className={`border rounded-2xl p-3.5 sm:p-4 transition-all ${sev.bg} ${sev.border} ${
                  isUrgent ? 'ring-2 ring-rose-400/40 shadow-xs' : 'shadow-2xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    {/* Severity Dot */}
                    <div className="mt-1 shrink-0">
                      <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${sev.dot} ${isUrgent ? 'animate-ping' : ''}`} />
                    </div>

                    <div className="min-w-0">
                      {/* Farmer + Risk */}
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                        <span className="text-slate-900 text-xs sm:text-sm font-bold truncate">
                          {alert.farmer_name}
                        </span>
                        <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full border ${sev.badge}`}>
                          {sev.emoji} {sev.label}
                        </span>
                        {isUrgent && (
                          <span className="text-[9px] sm:text-[10px] bg-rose-600 text-white font-bold px-2 py-0.5 rounded-md">
                            تدخل عاجل مطلوب
                          </span>
                        )}
                      </div>

                      {/* Risk Type & Field */}
                      <p className="text-slate-700 text-xs font-medium mb-1">
                        🌿 {alert.risk_type} — <span className="text-slate-500">{alert.field_name}</span>
                      </p>

                      {/* Status */}
                      <p className={`text-[11px] sm:text-xs font-semibold ${isUrgent ? 'text-rose-700' : 'text-slate-500'}`}>
                        الحالة: {statusLabels[alert.status] || alert.status}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Time */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                    <div className="flex items-center gap-1 text-slate-500 text-[10px] font-medium">
                      <Clock className="w-3 h-3" />
                      <span>{timeAgo(alert.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Link
                        href="/distributor/orders"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl border border-emerald-700 shadow-xs flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>طلب علاج</span>
                      </Link>
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
              className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold rounded-2xl py-3 text-xs transition-all shadow-xs active:scale-[0.98]"
            >
              <Users className="w-4 h-4 text-emerald-700" />
              <span>عرض جميع المزارعين ({totalCount - 5} تنبيه إضافي)</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

