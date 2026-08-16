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
        return <span className="bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-full font-black border border-red-200">⚠️ خطر حرج</span>;
      case 'moderate':
        return <span className="bg-amber-100 text-amber-900 text-xs px-2.5 py-1 rounded-full font-bold border border-amber-200">⚡ خطر متوسط</span>;
      case 'preventive':
        return <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold border border-emerald-200">🛡️ نصيحة وقائية</span>;
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
    <div className="space-y-4 text-right dir-rtl font-sans text-slate-900" dir="rtl">
      {/* Header */}
      <div className="bg-white border border-slate-200/80 p-4 rounded-3xl shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-black text-slate-900 mb-0.5 leading-tight">📅 الأجندة الزراعية اليومية</h1>
            <p className="text-xs text-slate-500 leading-relaxed">تنبيهات الطقس وتوصيات المحاصيل اليومية</p>
          </div>
          {onAddNewField && (
            <button
              onClick={onAddNewField}
              className="flex-shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 text-xs font-black px-3.5 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 active:scale-95"
            >
              <span>➕</span>
              <span>حقل جديد</span>
            </button>
          )}
        </div>
      </div>

      {fieldsAgendaData.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-3xl border border-slate-200/80 space-y-4 shadow-xs">
          <div className="text-5xl mb-2">🌱</div>
          <h3 className="text-slate-900 font-black text-base">لا توجد حقول زراعية مسجلة حالياً</h3>
          <p className="text-slate-500 text-xs max-w-sm mx-auto leading-relaxed">
            يمكنك إضافة محصولك الأول الآن لمتابعة التنبيهات ونفحات الجودة اليومية تلقائياً.
          </p>
          {onAddNewField && (
            <button
              onClick={onAddNewField}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-5 py-2.5 rounded-xl inline-flex items-center gap-2 shadow-xs border border-emerald-700 transition-colors"
            >
              <span>🌱</span>
              <span>إضافة حقل جديد الآن</span>
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
              className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs hover:border-slate-300 transition-all"
            >
              {/* Field Title */}
              <div className="p-4 bg-slate-50/70 border-b border-slate-100">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>🌾</span>
                      <span>{data.fieldName || data.cropType}</span>
                    </h2>
                    <span className="text-xs text-slate-500 font-medium block mt-0.5">
                      العمر: <strong className="text-slate-700">{data.cropAgeDays}</strong> يوم — {data.cropType}
                    </span>
                  </div>
                  <span className={`self-start sm:self-center text-xs px-3 py-1.5 rounded-xl font-bold border ${
                    isNearHarvest
                      ? 'bg-amber-100 text-amber-900 border-amber-300 font-black'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    {isNearHarvest ? '🌾 اقتراب موعد الحصاد' : `🗓️ مرحلة النمو (${data.cropAgeDays}/${expectedDays} يوم)`}
                  </span>
                </div>
              </div>

              {/* Automatic Expected Harvest Prompt */}
              {isNearHarvest && (
                <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-start gap-3">
                  <span className="text-xl mt-0.5">🌾</span>
                  <div>
                    <h4 className="text-xs font-black text-amber-900 mb-0.5">
                      فترة الحصاد المتوقعة ({data.cropAgeDays} يوم / المتوقع: {expectedDays} يوم)
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      وصل المحصول إلى فترة النضج والحصاد المتوقعة بحسب تاريخ الزراعة. يتفاعل المساعد الذكي والإدارة تلقائياً لتأكيد وتحديد اكتمال الحصاد.
                    </p>
                  </div>
                </div>
              )}

            {/* Quality Tip Section */}
            {data.qualityTip && (
              <div className="p-4 bg-emerald-50/80 border-b border-emerald-100 flex items-start gap-3">
                <span className="text-xl mt-0.5">💡</span>
                <div>
                  <h4 className="text-xs font-black text-emerald-900 mb-0.5">نصيحة الجودة للمرحلة الحالية:</h4>
                  <p className="text-xs text-slate-800 leading-relaxed">{data.qualityTip.tip_text}</p>
                  {data.qualityTip.tip_reason && (
                    <span className="text-[11px] text-slate-500 block mt-1">السبب: {data.qualityTip.tip_reason}</span>
                  )}
                </div>
              </div>
            )}

            {/* Alerts Container */}
            <div className="p-5 space-y-3.5">
              {data.alerts.length === 0 ? (
                <div className="p-4 text-center bg-emerald-50/60 rounded-2xl text-xs font-bold text-emerald-800 border border-emerald-200">
                  ✅ الوضع ممتاز اليوم! لا توجد مخاطر طقس أو أمراض مرصودة لحقلك.
                </div>
              ) : (
                data.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-2xl bg-[#fbfdfa] border border-slate-200 space-y-3 shadow-xs"
                  >
                    {/* Badge & Risk Title */}
                    <div className="flex justify-between items-start gap-2">
                      {getSeverityBadge(alert.severity_snapshot)}
                      <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                        {alert.status}
                      </span>
                    </div>

                    <p className="text-sm text-slate-900 font-bold leading-relaxed">
                      {alert.advice_text_snapshot}
                    </p>

                    {alert.advice_reason_snapshot && (
                      <p className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed">
                        🔍 سبب التنبيه: {alert.advice_reason_snapshot}
                      </p>
                    )}

                    {/* Action Buttons — stacked full-width for easy tapping on mobile */}
                    <div className="pt-2 border-t border-slate-100 space-y-2">
                      {alert.status === 'SENT' && (
                        <>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'OK')}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm py-3 rounded-xl font-black border border-emerald-700 shadow-xs transition-colors disabled:opacity-50"
                          >
                            👍 تمام (لا توجد مشكلة)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'PROBLEM')}
                            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white text-sm py-3 rounded-xl font-black border border-amber-600 shadow-xs transition-colors disabled:opacity-50"
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
                            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm py-3 rounded-xl font-black border border-blue-700 shadow-xs transition-colors disabled:opacity-50"
                          >
                            🛍️ طلب العلاج
                          </button>
                        </>
                      )}

                      {alert.status === 'FOLLOW_UP_SENT' && (
                        <>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'IMPROVED')}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm py-3 rounded-xl font-black border border-emerald-700 shadow-xs transition-colors disabled:opacity-50"
                          >
                            ✅ اتصلح / اتحسن الوضع
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'SAME')}
                            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-800 text-sm py-3 rounded-xl font-bold border border-slate-300 shadow-xs transition-colors disabled:opacity-50"
                          >
                            🔄 لسه زي ما هو (تصعيد للموزع)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'WORSE')}
                            className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white text-sm py-3 rounded-xl font-black border border-orange-700 shadow-xs transition-colors disabled:opacity-50"
                          >
                            🚨 زاد سوء (تصعيد عاجل)
                          </button>
                          <button
                            disabled={loadingAlertId === alert.id}
                            onClick={() => handleAction(alert.id, 'CROP_LOSS')}
                            className="w-full flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 active:scale-[0.98] text-white text-sm py-3 rounded-xl font-black border border-red-800 shadow-xs transition-colors disabled:opacity-50"
                          >
                            🛑 فقدت المحصول بالكامل
                          </button>
                        </>
                      )}

                      {alert.status === 'AWAITING_DIAGNOSIS' && (
                        <div className="w-full bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-sm font-bold text-amber-900 text-center">
                          🤖 جاري تشخيص المحاصيل مع الذكاء الاصطناعي...
                        </div>
                      )}

                      {alert.status === 'AWAITING_DISTRIBUTOR_ACTION' && (
                        <div className="w-full bg-blue-50 p-3.5 rounded-xl border border-blue-200 text-sm font-bold text-blue-900 text-center">
                          📞 تم تصعيد التنبيه للموزع للمتابعة الميدانية.
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

      {/* Catalog Fallback Modal */}
      {catalogModalCrop && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 max-w-md w-full text-right space-y-4 shadow-xl">
            <h3 className="text-base font-black text-slate-900">🛍️ كتالوج المنتجات المتاحة لـ {catalogModalCrop}</h3>
            <p className="text-xs text-slate-600">
              تصفح المنتجات والمبيدات الوقائية المناسبة لمحصولك حالياً.
            </p>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs font-medium text-slate-600">
              كتالوج المنتجات المعتمدة لـ {catalogModalCrop}
            </div>
            <button
              onClick={() => setCatalogModalCrop(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 py-2.5 text-xs rounded-xl transition-colors font-bold border border-slate-300"
            >
              إغلاق الكتالوج
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
