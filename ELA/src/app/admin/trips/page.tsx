"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { dispatchTrip } from "@/app/actions/admin-trips";
import { Truck, Navigation, CheckSquare, Square, CheckCircle2 } from "lucide-react";

type PendingOrder = {
  id: string;
  total_price: number;
  created_at: string;
  distributors: {
    village: string | null;
    profiles: { full_name: string | null };
  };
};

export default function TripsPage() {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  const supabase = createClient();

  useEffect(() => {
    fetchPendingOrders();
  }, []);

  async function fetchPendingOrders() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("orders")
      .select("id, total_price, created_at, distributors(village, profiles(full_name))")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setOrders(data);
    }
    setLoading(false);
  }

  function toggleOrderSelection(id: string) {
    const newSet = new Set(selectedOrderIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedOrderIds(newSet);
  }

  function selectAll() {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map((o) => o.id)));
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (selectedOrderIds.size === 0) {
      alert("الرجاء تحديد طلب واحد على الأقل.");
      return;
    }

    setDispatching(true);
    setSuccessMsg("");

    const res = await dispatchTrip(driverName, driverPhone, Array.from(selectedOrderIds));

    if (res.error) {
      alert(res.error);
    } else {
      setSuccessMsg(`تم إنطلاق الرحلة بنجاح وتحديث حالة ${res.simulatedNotifCount} طلب! تم محاكاة إرسال رسائل الواتساب للمزارعين.`);
      setDriverName("");
      setDriverPhone("");
      setSelectedOrderIds(new Set());
      fetchPendingOrders();
    }

    setDispatching(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Truck className="w-6 h-6 text-indigo-600" />
          منسق الشحن والرحلات
        </h2>
      </div>

      {successMsg && (
        <div className="bg-green-50 text-green-800 p-4 rounded-lg flex items-center gap-3 border border-green-200">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trip Creation Form */}
        <div className="lg:col-span-1">
          <form onSubmit={handleDispatch} className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 sticky top-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Navigation className="w-5 h-5 text-indigo-500" />
              تكوين رحلة جديدة
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">اسم السائق</label>
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="مثال: محمود محمد"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">رقم هاتف السائق</label>
                <input
                  type="tel"
                  required
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                  placeholder="010XXXXXXXX"
                  dir="ltr"
                />
              </div>
              
              <div className="pt-4 border-t border-slate-100">
                <div className="flex justify-between text-sm mb-4">
                  <span className="text-slate-500">الطلبات المحددة:</span>
                  <span className="font-bold text-indigo-600">{selectedOrderIds.size} طلب</span>
                </div>
                
                <button
                  type="submit"
                  disabled={dispatching || selectedOrderIds.size === 0}
                  className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {dispatching ? "جاري الإطلاق..." : "إطلاق الرحلة (Dispatch)"}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Orders Selection Table */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-700">الطلبات قيد الانتظار (Pending)</h3>
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {selectedOrderIds.size === orders.length && orders.length > 0 ? "إلغاء تحديد الكل" : "تحديد الكل"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-white border-b border-slate-100 text-slate-500 text-sm">
                  <tr>
                    <th className="px-4 py-3 w-12"></th>
                    <th className="px-4 py-3 font-medium">رقم الطلب</th>
                    <th className="px-4 py-3 font-medium">الموزع / القرية</th>
                    <th className="px-4 py-3 font-medium">تاريخ الطلب</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                        لا توجد طلبات معلقة حالياً.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => {
                      const isSelected = selectedOrderIds.has(order.id);
                      return (
                        <tr 
                          key={order.id} 
                          onClick={() => toggleOrderSelection(order.id)}
                          className={`cursor-pointer transition-colors ${isSelected ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                        >
                          <td className="px-4 py-4 text-center">
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-indigo-600 inline-block" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-300 inline-block" />
                            )}
                          </td>
                          <td className="px-4 py-4 text-slate-500 font-mono text-xs uppercase" dir="ltr">
                            {order.id.split('-')[0]}
                          </td>
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-800">{order.distributors?.profiles?.full_name}</div>
                            <div className="text-xs text-slate-500">{order.distributors?.village}</div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-500" dir="ltr">
                            {new Date(order.created_at).toLocaleDateString('ar-EG')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
