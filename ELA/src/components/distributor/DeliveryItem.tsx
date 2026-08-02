"use client";

import { useState } from "react";
import { markOrderDelivered } from "@/app/actions/distributor";
import { Loader2, CheckCircle, Package, Clock, Calendar, UserCheck, Globe } from "lucide-react";
import { ZoomableImage } from "@/components/ui/ImageModal";

type OrderItemProp = {
  id: string;
  name_ar: string;
  image_url: string | null;
  quantity?: number;
};

type OrderProp = {
  id: string;
  total_price: number;
  farmer_name: string;
  village: string | null;
  items_count: number;
  status: string;
  created_at?: string;
  created_by_type?: string;
  is_seen?: boolean;
  items?: OrderItemProp[];
};

interface DeliveryItemProps {
  order: OrderProp;
  onDelivered?: (orderId: string) => void;
  onMarkSeen?: (orderId: string) => void;
}

export default function DeliveryItem({ order, onDelivered, onMarkSeen }: DeliveryItemProps) {
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
      // Notify parent to move order to completed tab immediately
      onDelivered?.(order.id);
    }
  };

  const handleBadgeClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkSeen?.(order.id);
  };

  // Extract first product image if available
  const firstItemWithImage = order.items?.find((item) => item.image_url);

  const formattedDateTime = order.created_at
    ? new Date(order.created_at).toLocaleString("ar-EG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const isByDistributor = order.created_by_type === "distributor";
  const isUnseen = order.is_seen === false;

  return (
    <div className={`bg-slate-900/50 backdrop-blur-xl border ${isUnseen ? "border-rose-500/40 bg-slate-900/80 shadow-lg shadow-rose-500/5" : "border-slate-800"} rounded-3xl p-6 transition-colors ${isSuccess ? "opacity-50" : "hover:bg-slate-800/50"}`}>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">

        <div className="flex gap-4 items-start">
          {firstItemWithImage?.image_url ? (
            <ZoomableImage
              src={firstItemWithImage.image_url}
              alt={firstItemWithImage.name_ar}
              className="w-14 h-14 rounded-2xl object-cover border border-slate-700/80 bg-slate-950 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shrink-0">
              <Package className="w-7 h-7 text-indigo-400" />
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="text-white font-bold text-lg">{order.farmer_name}</h4>

              {/* Unread / New Badge */}
              {isUnseen && (
                <button
                  type="button"
                  onClick={handleBadgeClick}
                  title="اضغط لتعليم هذا الطلب كـ مقروء"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 animate-pulse transition-all cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  جديد (اضغط للشواهد)
                </button>
              )}
              
              {/* Source Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  isByDistributor
                    ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                    : "bg-teal-500/10 text-teal-300 border-teal-500/20"
                }`}
              >
                {isByDistributor ? (
                  <>
                    <UserCheck className="w-3 h-3" />
                    عن طريق الموزع
                  </>
                ) : (
                  <>
                    <Globe className="w-3 h-3" />
                    عن طريق المنصة
                  </>
                )}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400 mb-2">
              <span className="bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 font-semibold text-indigo-300">
                {order.items_count} {order.items_count === 1 ? "صنف" : "أصناف"}
              </span>
              {order.village && (
                <>
                  <span>•</span>
                  <span>{order.village}</span>
                </>
              )}
              {formattedDateTime && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded-md border border-slate-800/80">
                    <Clock className="w-3 h-3 text-amber-400/80" />
                    {formattedDateTime}
                  </span>
                </>
              )}
            </div>

            {/* List of items if available */}
            {order.items && order.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-xl text-xs text-slate-300">
                    {item.image_url ? (
                      <ZoomableImage
                        src={item.image_url}
                        alt={item.name_ar}
                        className="w-5 h-5 rounded-md object-cover"
                      />
                    ) : null}
                    <span>{item.name_ar}</span>
                  </div>
                ))}
              </div>
            )}
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
