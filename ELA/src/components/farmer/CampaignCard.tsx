"use client";

import { useState } from "react";
import { TrendingUp, Share2, Calendar } from "lucide-react";

interface CampaignCardProps {
  campaign: {
    id: string;
    product_id: string;
    tier1_qty: number;
    tier1_discount: number;
    tier2_qty: number | null;
    tier2_discount: number | null;
    tier3_qty: number | null;
    tier3_discount: number | null;
    end_date: string | null;
    products: {
      id: string;
      name_ar: string;
      price_to_farmer: number;
      stock_status: boolean;
      image_url?: string | null;
    } | null;
  };
  currentVolume: number;
  distributorName: string;
  distributorPhone: string | null;
}

export default function CampaignCard({
  campaign,
  currentVolume,
  distributorName,
  distributorPhone,
}: CampaignCardProps) {
  const [shared, setShared] = useState(false);

  const product = campaign.products;
  if (!product) return null;

  // Calculate active discount based on volume
  let activeDiscount = 0;
  if (campaign.tier3_qty && campaign.tier3_discount && currentVolume >= campaign.tier3_qty) {
    activeDiscount = campaign.tier3_discount;
  } else if (campaign.tier2_qty && campaign.tier2_discount && currentVolume >= campaign.tier2_qty) {
    activeDiscount = campaign.tier2_discount;
  } else if (currentVolume >= campaign.tier1_qty) {
    activeDiscount = campaign.tier1_discount;
  }

  // Calculate next target tier details
  let nextTargetQty: number | null = null;
  let nextTargetDiscount: number | null = null;
  let nextTargetTierIndex = 0;

  if (currentVolume < campaign.tier1_qty) {
    nextTargetQty = campaign.tier1_qty;
    nextTargetDiscount = campaign.tier1_discount;
    nextTargetTierIndex = 1;
  } else if (campaign.tier2_qty && campaign.tier2_discount && currentVolume < campaign.tier2_qty) {
    nextTargetQty = campaign.tier2_qty;
    nextTargetDiscount = campaign.tier2_discount;
    nextTargetTierIndex = 2;
  } else if (campaign.tier3_qty && campaign.tier3_discount && currentVolume < campaign.tier3_qty) {
    nextTargetQty = campaign.tier3_qty;
    nextTargetDiscount = campaign.tier3_discount;
    nextTargetTierIndex = 3;
  }

  const remaining = nextTargetQty ? Math.max(nextTargetQty - currentVolume, 0) : 0;
  const maxTargetQty = campaign.tier3_qty || campaign.tier2_qty || campaign.tier1_qty;
  const progressPercent = Math.min(
    Math.round((currentVolume / maxTargetQty) * 100),
    100
  );
  
  const isMaxAchieved = nextTargetQty === null;

  const handleWhatsAppShare = () => {
    const phone = distributorPhone || "";
    let nextTierName = "";
    if (nextTargetTierIndex === 1) nextTierName = "الخصم الأول";
    else if (nextTargetTierIndex === 2) nextTierName = "الخصم الثاني";
    else if (nextTargetTierIndex === 3) nextTierName = "الخصم الثالث";

    let message = "";
    if (nextTargetQty) {
      message = `يا جاري العزيز 🌾\n\nإحنا حاجزين مبيد *${product.name_ar}* على منصة ELA وحالياً حجز قريتنا هو *${currentVolume} عبوة*.\nناقصنا *${remaining} عبوة* بس عشان نفعل *${nextTierName} (${nextTargetDiscount}%)* للكل!\n\nالسعر بعد الخصم هيبقى أوفر للجميع 💪\n\nاحجز معايا كاش بسرعة عند السفير *${distributorName}* على الرقم ده:\n📞 *${phone || "تواصل مع السفير"}*\n\nعشان نكسب الخصم سوا! 🤝\n\n_تطبيق منصة ELA_`;
    } else {
      message = `يا جاري العزيز 🌾\n\nحققنا الحد الأقصى للخصم (خصم ${activeDiscount}%) على مبيد *${product.name_ar}* للقرية كلها! 🎉\n\nمستمرين في الحجز كاش عند السفير *${distributorName}*:\n📞 *${phone || "تواصل مع السفير"}*\n\n_تطبيق منصة ELA_`;
    }

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    setShared(true);
    setTimeout(() => setShared(false), 3000);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border transition-all ${
        isMaxAchieved
          ? "bg-emerald-500/10 border-emerald-500/30 shadow-lg shadow-emerald-500/5"
          : activeDiscount > 0
          ? "bg-slate-900/80 border-emerald-500/20"
          : "bg-slate-900/70 border-slate-800"
      }`}
    >
      {/* Product Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-white font-bold text-lg leading-tight mb-1">
              {product.name_ar}
            </h3>
            <p className="text-emerald-400 font-bold text-xl">
              {product.price_to_farmer}{" "}
              <span className="text-sm font-medium text-emerald-500/70">ج.م</span>
            </p>
          </div>
          {/* Product Image or Emoji Icon Placeholder */}
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name_ar}
              className="w-14 h-14 rounded-2xl object-cover border border-emerald-500/20 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-3xl shrink-0">
              🧪
            </div>
          )}
        </div>

        {/* Progress Info */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-400">
              حجز القرية:{" "}
              <span className="text-white font-bold">{currentVolume}</span> عبوة
            </span>
            <span className="text-emerald-500 font-bold">
              الهدف النهائي: {maxTargetQty}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isMaxAchieved
                  ? "bg-gradient-to-l from-emerald-400 to-emerald-600"
                  : activeDiscount > 0
                  ? "bg-gradient-to-l from-emerald-500 to-amber-500"
                  : "bg-gradient-to-l from-amber-400 to-amber-600"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-2 text-center">
            {isMaxAchieved ? (
              <span className="text-emerald-400 text-sm font-bold flex items-center justify-center gap-1">
                ✅ تم تفعيل الحد الأقصى للخصم {activeDiscount}% للجميع! 🎉
              </span>
            ) : activeDiscount > 0 ? (
              <span className="text-emerald-400 text-xs font-bold block">
                مفعّل حالياً: خصم {activeDiscount}%! متبقي <strong className="text-amber-400">{remaining} عبوة</strong> للوصول للخصم التالي ({nextTargetDiscount}%)
              </span>
            ) : (
              <span className="text-amber-400/80 text-xs">
                متبقي{" "}
                <strong className="text-amber-400">{remaining} عبوة</strong>{" "}
                للوصول للخصم الأول ({nextTargetDiscount}%)
              </span>
            )}
          </div>
        </div>

        {/* Discount Tiers Visual Display */}
        <div className="mt-4 pt-4 border-t border-slate-800/40 grid grid-cols-3 gap-2 text-center text-xs">
          <div className={`p-2 rounded-2xl border transition-all ${
            currentVolume >= campaign.tier1_qty
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold'
              : 'bg-slate-950/40 border-slate-900/60 text-slate-500'
          }`}>
            <p className="text-slate-400 text-[10px] mb-1">الخصم الأول</p>
            <p className="font-bold text-sm">%{campaign.tier1_discount}</p>
            <p className="text-[10px] font-normal">{campaign.tier1_qty} عبوة</p>
          </div>
          
          {campaign.tier2_qty ? (
            <div className={`p-2 rounded-2xl border transition-all ${
              currentVolume >= campaign.tier2_qty
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold'
                : currentVolume >= campaign.tier1_qty
                ? 'bg-amber-500/5 border-amber-500/20 text-amber-400 font-bold'
                : 'bg-slate-950/40 border-slate-900/60 text-slate-500'
            }`}>
              <p className="text-slate-400 text-[10px] mb-1">الخصم الثاني</p>
              <p className="font-bold text-sm">%{campaign.tier2_discount}</p>
              <p className="text-[10px] font-normal">{campaign.tier2_qty} عبوة</p>
            </div>
          ) : (
            <div className="p-2 rounded-2xl border bg-slate-950/10 border-slate-900/30 text-slate-600 flex flex-col justify-center items-center">
              <span className="text-slate-600 text-[10px]">—</span>
            </div>
          )}

          {campaign.tier3_qty ? (
            <div className={`p-2 rounded-2xl border transition-all ${
              currentVolume >= campaign.tier3_qty
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold'
                : campaign.tier2_qty !== null && currentVolume >= campaign.tier2_qty
                ? 'bg-amber-500/5 border-amber-500/20 text-amber-400 font-bold'
                : 'bg-slate-950/40 border-slate-900/60 text-slate-500'
            }`}>
              <p className="text-slate-400 text-[10px] mb-1">الخصم الثالث</p>
              <p className="font-bold text-sm">%{campaign.tier3_discount}</p>
              <p className="text-[10px] font-normal">{campaign.tier3_qty} عبوة</p>
            </div>
          ) : (
            <div className="p-2 rounded-2xl border bg-slate-950/10 border-slate-900/30 text-slate-600 flex flex-col justify-center items-center">
              <span className="text-slate-600 text-[10px]">—</span>
            </div>
          )}
        </div>
      </div>

      {/* WhatsApp Share Footer */}
      <div className="border-t border-slate-800/50 px-5 py-3">
        <button
          onClick={handleWhatsAppShare}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
            shared
              ? "bg-emerald-600 text-white"
              : "bg-[#25D366] hover:bg-[#20ba5a] text-white shadow-lg shadow-[#25D366]/25"
          }`}
        >
          <Share2 className="w-4 h-4" />
          {shared ? "تم الإرسال! 👍" : `أقنع جارك! شارك على واتساب`}
        </button>
      </div>

      {/* Expiry Badge */}
      {campaign.end_date && (
        <div className="absolute top-3 left-3 bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          ينتهي {new Date(campaign.end_date).toLocaleDateString("ar-EG")}
        </div>
      )}
    </div>
  );
}
