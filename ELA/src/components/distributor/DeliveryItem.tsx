"use client";

import { useState } from "react";
import { markOrderDelivered } from "@/app/actions/distributor";
import { Loader2, CheckCircle, Package, Clock, Calendar, UserCheck, Globe, MessageCircle, Phone, Check } from "lucide-react";
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
  farmer_phone?: string | null;
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

  const whatsappMessage = encodeURIComponent(
    `السلام عليكم يا حاج ${order.farmer_name}، بخصوص طلبك من منصة ELA (ال اي) بقيمة ${order.total_price} ج.م، الشحنة جاهزة للتسليم معك.`
  );

  return (
    <div
      className={`bg-white border ${
        isUnseen ? "border-rose-300 ring-2 ring-rose-200/50 shadow-md" : "border-slate-200/90"
      } rounded-3xl p-5 md:p-6 transition-all shadow-xs ${
        isSuccess ? "opacity-60" : "hover:border-emerald-300"
      }`}
    >
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex gap-3.5 items-start">
          {firstItemWithImage?.image_url ? (
            <ZoomableImage
              src={firstItemWithImage.image_url}
              alt={firstItemWithImage.name_ar}
              className="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-slate-50 shrink-0 shadow-2xs"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 shadow-2xs">
              <Package className="w-7 h-7" />
            </div>
          )}

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h4 className="text-slate-900 font-bold text-base">{order.farmer_name}</h4>

              {/* Unread / New Badge */}
              {isUnseen && (
                <button
                  type="button"
                  onClick={handleBadgeClick}
                  title="اضغط لتعليم هذا الطلب كـ مقروء"
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200 animate-pulse cursor-pointer shadow-2xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
                  جديد
                </button>
              )}

              {/* Source Badge */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                  isByDistributor
                    ? "bg-purple-50 text-purple-800 border-purple-200"
                    : "bg-teal-50 text-teal-800 border-teal-200"
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

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
              <span className="bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 font-semibold text-slate-700">
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
                  <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                    <Clock className="w-3 h-3 text-amber-600" />
                    {formattedDateTime}
                  </span>
                </>
              )}
            </div>

            {/* List of items if available */}
            {order.items && order.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs text-slate-800 font-medium"
                  >
                    {item.image_url ? (
                      <ZoomableImage
                        src={item.image_url}
                        alt={item.name_ar}
                        className="w-4 h-4 rounded object-cover"
                      />
                    ) : null}
                    <span>{item.name_ar}</span>
                    {item.quantity && item.quantity > 1 && (
                      <span className="font-bold text-emerald-800">({item.quantity})</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Price & Primary Delivery Action */}
        <div className="text-right w-full sm:w-auto flex flex-row sm:flex-col justify-between items-center sm:items-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <div>
            <p className="text-slate-500 text-[11px] font-medium mb-0.5">المطلوب تحصيله</p>
            <p className="text-emerald-800 font-black text-xl font-mono">
              {Math.round(order.total_price).toLocaleString("ar-EG")} <span className="text-xs font-normal">ج.م</span>
            </p>
          </div>

          <button
            onClick={handleMarkDelivered}
            disabled={isLoading || isSuccess}
            className={`font-bold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs border active:scale-95 ${
              isSuccess
                ? "bg-emerald-100 text-emerald-900 border-emerald-300 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSuccess ? (
              <Check className="w-4 h-4 text-emerald-700" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isSuccess ? "تم التحصيل والتسليم" : "تأكيد التسليم والتحصيل"}
          </button>
        </div>
      </div>

      {/* Addition from Model B: Direct WhatsApp & Phone Call Action Bar */}
      <div className="flex items-center gap-2 pt-4 mt-4 border-t border-slate-100">
        {order.farmer_phone ? (
          <>
            <a
              href={`https://wa.me/2${order.farmer_phone}?text=${whatsappMessage}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs py-2 px-3 rounded-xl border border-emerald-200 flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
              واتساب الفلاح
            </a>
            <a
              href={`tel:${order.farmer_phone}`}
              className="flex-1 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs py-2 px-3 rounded-xl border border-slate-300 flex items-center justify-center gap-1.5 transition-all shadow-2xs active:scale-95"
            >
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              اتصال هاتف
            </a>
          </>
        ) : (
          <div className="text-[11px] text-slate-400">لا يوجد رقم هاتف مسجل لهذا المزارع</div>
        )}
      </div>

      {error && (
        <div className="mt-3 text-red-700 text-xs bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
