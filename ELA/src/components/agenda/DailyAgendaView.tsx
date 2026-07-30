'use client';

import React, { useState } from 'react';
import type { AlertInstance, CropQualityTip, CropRiskSeverity } from '@/lib/agenda/types';

export interface FieldAgendaViewData {
  fieldId: string;
  fieldName: string;
  cropType: string;
  plantingDate: string;
  cropAgeDays: number;
  alerts: AlertInstance[];
  qualityTip: CropQualityTip | null;
}

export const CROP_MATURITY_DAYS: Record<string, number> = {
  قمح: 150,
  طماطم: 90,
  بطاطس: 110,
  بصل: 120,
  ذرة: 100,
  قطن: 180,
  أرز: 120,
  برسيم: 30,
  "قصب السكر": 360,
  "بنجر السكر": 180,
  خيار: 60,
  كوسة: 50,
  باذنجان: 90,
  فلفل: 90,
  ثوم: 150,
  فراولة: 120,
  عنب: 150,
  مانجو: 180,
  موالح: 210,
  "فول بلدي": 130,
};

interface DailyAgendaViewProps {
  fieldsAgendaData: FieldAgendaViewData[];
  onRespond: (alertId: string, responseType: string) => Promise<void>;
  onHarvest?: (fieldId: string) => Promise<void>;
  onAddNewField?: () => void;
}

export function DailyAgendaView({ fieldsAgendaData, onRespond, onAddNewField }: DailyAgendaViewProps) {
  const [loadingAlertId, setLoadingAlertId] = useState<string | null>(null);
  const [catalogModalCrop, setCatalogModalCrop] = useState<string | null>(null);

  const getSeverityBadge = (severity: CropRiskSeverity) => {
    switch (severity) {
      case 'critical':
        return <span className="bg-red-500/20 text-red-400 text-xs px-2.5 py-1 rounded-full font-bold">⚠️ خطر حرج</span>;
      case 'moderate':
        return <span className="bg-amber-500/20 text-amber-400 text-xs px-2.5 py-1 rounded-full font-semibold">⚡ خطر متوسط</span>;
      case 'preventive':
        return <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2.5 py-1 rounded-full font-medium">🛡️ نصيحة وقائية</span>;
    }
  };

  const handleAction = async (alertId: string, responseType: string) => {
    setLoadingAlertId(alertId);
    try {
      await onRespond(alertId, responseType);
    } finally {
      setLoadingAlertId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6 text-right dir-rtl font-sans text-slate-100" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-900/40 via-teal-900/30 to-slate-900 p-6 rounded-2xl border border-emerald-500/30 shadow-xl">
        <h1 className="text-2xl font-bold text-emerald-400 mb-1">📅 الأجندة الزراعية اليومية</h1>
        <p className="text-sm text-slate-300">تنبيهات الطقس وتوصيات المحاصيل المخصصة لحقولك اليوم</p>
      </div>

      {fieldsAgendaData.length === 0 ? (
        <div className="p-10 text-center bg-slate-900/60 rounded-3xl border border-slate-800 space-y-4">
          <div className="text-5xl mb-2">🌱</div>
          <h3 className="text-white font-bold text-base">لا توجد أراضي زراعية مسجلة حالياً</h3>
          <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed">
            يمكنك إضافة محصولك الأول الآن لمتابعة التنبيهات ونفحات الجودة اليومية تلقائياً.
          </p>
          {onAddNewField && (
            <button
              onClick={onAddNewField}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-5 py-2.5 rounded-2xl inline-flex items-center gap-2 shadow-lg shadow-emerald-950/50 transition-colors"
            >
              <span>🌱</span>
              <span>إضافة محصولك الأول الآن</span>
            </button>
          )}
        </div>
      ) : (
        fieldsAgendaData.map((data) => {
          const expectedDays = CROP_MATURITY_DAYS[data.cropType] || 120;
          const isNearHarvest = data.cropAgeDays >= expectedDays - 7;

          return (
            <div
              key={data.fieldId}
              className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-lg hover:border-slate-700 transition-all"
            >
              {/* Field Title */}
              <div className="p-5 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>🌾</span> {data.fieldName || data.cropType}
                  </h2>
                  <span className="text-xs text-slate-400">
                    العمر: {data.cropAgeDays} يوم من تاريخ الزراعة ({data.cropType})
                  </span>
                </div>
                <div className="text-left">
                  <span className={`text-xs px-3 py-1 rounded-full font-medium border ${
                    isNearHarvest
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {isNearHarvest ? '🌾 اقتراب موعد الحصاد المتوقع' : `🗓️ مرحلة النمو (المتوقع: ${expectedDays} يوم)`}
                  </span>
                </div>
              </div>

              {/* Automatic Expected Harvest Prompt */}
              {isNearHarvest && (
                <div className="p-4 bg-amber-950/30 border-b border-amber-900/40 flex items-start gap-3">
                  <span className="text-xl mt-0.5">🌾</span>
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 mb-0.5">
                      فترة الحصاد المتوقعة ({data.cropAgeDays} يوم / المتوقع: {expectedDays} يوم)
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      وصل المحصول إلى فترة النضج والحصاد المتوقعة بحسب تاريخ الزراعة. يتفاعل المساعد الذكي والإدارة تلقائياً لتأكيد وتحديد اكتمال الحصاد.
                    </p>
                  </div>
                </div>
              )}

            {/* Quality Tip Section */}
            {data.qualityTip && (
              <div className="p-4 bg-emerald-950/20 border-b border-emerald-900/30 flex items-start gap-3">
                <span className="text-xl mt-0.5">💡</span>
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 mb-0.5">نصيحة الجودة للمرحلة الحالية</h4>
                  <p className="text-sm text-slate-200">{data.qualityTip.tip_text}</p>
                  {data.qualityTip.tip_reason && (
                    <span className="text-xs text-slate-400 block mt-1">السبب: {data.qualityTip.tip_reason}</span>
                  )}
                </div>
              </div>
            )}

            {/* Alerts Container */}
            <div className="p-5 space-y-4">
              {data.alerts.length === 0 ? (
                <div className="p-4 text-center bg-slate-950/40 rounded-xl text-xs text-emerald-400/90 border border-emerald-900/20">
                  ✅ الوضع ممتاز اليوم! لا توجد مخاطر طقس مرصودة لأرضك.
                </div>
              ) : (
                data.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3 relative overflow-hidden"
                  >
                    {/* Badge & Risk Title */}
                    <div className="flex justify-between items-start">
                      {getSeverityBadge(alert.severity_snapshot)}
                      <span className="text-xs text-slate-500 font-mono">الحالة: {alert.status}</span>
                    </div>

                    <p className="text-sm text-slate-100 font-medium leading-relaxed">
                      {alert.advice_text_snapshot}
                    </p>

                    {alert.advice_reason_snapshot && (
                      <p className="text-xs text-slate-400 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        🔍 سبب التنبيه: {alert.advice_reason_snapshot}
                      </p>
                    )}

                    {/* Action Buttons depending on status */}
                    <div className="pt-2 flex flex-wrap gap-2 border-t border-slate-800/80">
                      {alert.status === 'SENT' && (
                        <>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'OK')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium transition-colors"
                          >
                            👍 تمام (لا توجد مشكلة)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'PROBLEM')}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium transition-colors"
                          >
                            ⚠️ في مشكلة (تشخيص AI)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => {
                              if (alert.product_link_snapshot) {
                                handleAction(alert.id, 'WANT_PRODUCT');
                              } else {
                                setCatalogModalCrop(data.cropType);
                                handleAction(alert.id, 'WANT_PRODUCT');
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3.5 py-2 rounded-lg font-medium transition-colors"
                          >
                            🛒 طلب العلاج
                          </button>
                        </>
                      )}

                      {alert.status === 'FOLLOW_UP_SENT' && (
                        <>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'IMPROVED')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-lg font-medium"
                          >
                            ✅ اتصلح / اتأثر بالتحسن
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'SAME')}
                            className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-3 py-2 rounded-lg font-medium"
                          >
                            🔄 لسه زي ما هو (تصعيد للموزع)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'WORSE')}
                            className="bg-orange-600 hover:bg-orange-500 text-white text-xs px-3 py-2 rounded-lg font-medium"
                          >
                            🚨 زاد سوء (تصعيد عاجل)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'CROP_LOSS')}
                            className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-2 rounded-lg font-medium"
                          >
                            🛑 فقدت المحصول بالكامل
                          </button>
                        </>
                      )}

                      {alert.status === 'AWAITING_DIAGNOSIS' && (
                        <div className="w-full bg-amber-950/30 p-3 rounded-lg border border-amber-900/40 text-xs text-amber-300">
                          🤖 جاري تشخيص المحاصيل تفاعلياً مع الذكاء الاصطناعي...
                        </div>
                      )}

                      {alert.status === 'AWAITING_DISTRIBUTOR_ACTION' && (
                        <div className="w-full bg-blue-950/30 p-3 rounded-lg border border-blue-900/40 text-xs text-blue-300">
                          📞 تم تصعيد التنبيه للموزع المعتمد للمتابعة الميدانية.
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })
      )}

      {/* Catalog Fallback Modal (§5.5) */}
      {catalogModalCrop && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-700 max-w-md w-full text-right space-y-4">
            <h3 className="text-lg font-bold text-emerald-400">🛍️ كتالوج المنتجات المتاحة لـ {catalogModalCrop}</h3>
            <p className="text-xs text-slate-300">
              تصفح المنتجات والمبيدات الوقائية المناسبة لمحصولك حالياً.
            </p>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-center text-xs text-slate-400">
              كتالوج المنتجات العامة لـ {catalogModalCrop}
            </div>
            <button
              onClick={() => setCatalogModalCrop(null)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 text-xs rounded-xl transition-colors font-medium"
            >
              إغلاق الكتالوج
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
