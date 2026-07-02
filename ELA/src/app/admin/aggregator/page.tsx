"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Network, RefreshCw } from "lucide-react";

type AggregationResult = {
  village: string;
  distributorName: string;
  productName: string;
  totalQuantity: number;
};

export default function AggregatorPage() {
  const [aggregations, setAggregations] = useState<AggregationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchAggregatedData();
  }, []);

  async function fetchAggregatedData() {
    setLoading(true);
    
    // Fetch orders with status pending or in_transit, joined with necessary relations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("orders")
      .select(`
        status,
        distributor_id,
        distributors:distributor_id(village, profiles(full_name)),
        order_items(
          quantity,
          products:product_id(name_ar)
        )
      `)
      .in("status", ["pending", "in_transit"]);

    if (!error && data) {
      // Aggregate the data manually
      const aggMap = new Map<string, AggregationResult>();

      data.forEach((order: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const village = order.distributors?.village || "قرية غير محددة";
        const distributorName = order.distributors?.profiles?.full_name || "موزع غير معروف";
        
        order.order_items.forEach((item: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          const productName = item.products?.name_ar || "منتج غير معروف";
          const key = `${village}_${distributorName}_${productName}`;

          if (aggMap.has(key)) {
            const existing = aggMap.get(key)!;
            existing.totalQuantity += item.quantity;
          } else {
            aggMap.set(key, {
              village,
              distributorName,
              productName,
              totalQuantity: item.quantity,
            });
          }
        });
      });

      // Convert map to array and sort by village then product name
      const sortedAggregations = Array.from(aggMap.values()).sort((a, b) => {
        if (a.village === b.village) return a.productName.localeCompare(b.productName, 'ar');
        return a.village.localeCompare(b.village, 'ar');
      });

      setAggregations(sortedAggregations);
    }
    
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Network className="w-6 h-6 text-blue-600" />
            مجمع طلبيات القرى (Demand Aggregator)
          </h2>
          <p className="text-slate-500 mt-1">يجمع كل الطلبات قيد الانتظار أو الشحن حسب القرية والمنتج</p>
        </div>
        <button
          onClick={fetchAggregatedData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          تحديث البيانات
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">القرية</th>
                <th className="px-6 py-4 font-medium">الموزع (السفير)</th>
                <th className="px-6 py-4 font-medium">المنتج المطلوب</th>
                <th className="px-6 py-4 font-medium">إجمالي العبوات المطلوبة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    جاري تجميع البيانات...
                  </td>
                </tr>
              ) : aggregations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                    لا توجد طلبات معلقة حالياً.
                  </td>
                </tr>
              ) : (
                aggregations.map((agg, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{agg.village}</td>
                    <td className="px-6 py-4 text-slate-600">{agg.distributorName}</td>
                    <td className="px-6 py-4 font-medium text-blue-700">{agg.productName}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-50 text-blue-800">
                        {agg.totalQuantity} عبوة
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
