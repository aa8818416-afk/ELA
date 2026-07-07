"use client";

import { useState } from "react";
import { markOrderDelivered } from "@/app/actions/distributor";
import { Loader2, CheckCircle, Package } from "lucide-react";

type OrderProp = {
  id: string;
  total_price: number;
  farmer_name: string;
  village: string | null;
  items_count: number;
  status: string;
};

export default function DeliveryItem({ order }: { order: OrderProp }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(order.status === "delivered");

  const handleMarkDelivered = async () => {
    if (isLoading || isSuccess) return;

    setIsLoading(true);
    setError(null);

    const result = await markOrderDelivered(order.id);
    if (result.error) {
      setError(result.error);
      setIsLoading(false);
    } else {
      setIsSuccess(true);
      setIsLoading(false);
    }
  };

  return (
    <div className={`bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 transition-colors ${isSuccess ? "opacity-50" : "hover:bg-slate-800/50"}`}>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">

        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
            <Package className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-white font-bold text-lg mb-1">{order.farmer_name}</h4>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
                {order.items_count} أصناف
              </span>
              <span>•</span>
              <span>{order.village || "قرية غير محددة"}</span>
            </div>
          </div>
        </div>

        <div className="text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between items-center sm:items-end">
          <div className="mb-2">
            <p className="text-slate-400 text-xs mb-1">المطلوب تحصيله</p>
            <p className="text-amber-400 font-bold text-xl">{order.total_price.toLocaleString()} ج.م</p>
          </div>
          <button
            onClick={handleMarkDelivered}
            disabled={isLoading || isSuccess}
            className={`text-white text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${isSuccess
              ? "bg-emerald-800/60 cursor-not-allowed"
              : "bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500"
              }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSuccess ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {isSuccess ? "تم التأكيد" : "تأكيد التسليم"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 text-red-400 text-sm bg-red-500/10 px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
