"use client";

import { useState } from "react";
import { TrendingUp, Share2 } from "lucide-react";

interface CampaignCardProps {
  product: {
    id: string;
    name_ar: string;
    price_to_farmer: number;
    stock_status: boolean;
    image_url?: string | null;
  };
  currentVolume: number;
  targetVolume: number;
  discountPercent: number;
  distributorName: string;
  distributorPhone: string | null;
}

export default function CampaignCard({
  product,
  currentVolume,
  targetVolume,
  discountPercent,
  distributorName,
  distributorPhone,
}: CampaignCardProps) {
  const [shared, setShared] = useState(false);
  const remaining = Math.max(targetVolume - currentVolume, 0);
  const progressPercent = Math.min(
    Math.round((currentVolume / targetVolume) * 100),
    100
  );
  const isAchieved = currentVolume >= targetVolume;

  const handleWhatsAppShare = () => {
    const phone = distributorPhone || "";
    const message = `يا جاري العزيز 🌾\n\nإحنا حاجزين مبيد *${product.name_ar}* على منصة ELA وناقصنا *${remaining} عبوة* بس عشان يوصلنا خصم الـ *${discountPercent}%* للكل!\n\nالسعر بعد الخصم هيبقى أوفر للجميع 💪\n\nاحجز معايا كاش بسرعة عند السفير *${distributorName}* على الرقم ده:\n📞 *${phone || "تواصل مع السفير"}*\n\nعشان نكسب الخصم سوا! 🤝\n\n_تطبيق منصة ELA_`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    setShared(true);
    setTimeout(() => setShared(false), 3000);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border transition-all ${
        isAchieved
          ? "bg-emerald-500/10 border-emerald-500/30"
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
              الهدف: {targetVolume}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isAchieved
                  ? "bg-gradient-to-l from-emerald-400 to-emerald-600"
                  : "bg-gradient-to-l from-amber-400 to-amber-600"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-2 text-center">
            {isAchieved ? (
              <span className="text-emerald-400 text-sm font-bold">
                ✅ تم تفعيل خصم {discountPercent}% للجميع!
              </span>
            ) : (
              <span className="text-amber-400/80 text-xs">
                متبقي{" "}
                <strong className="text-amber-400">{remaining} عبوة</strong>{" "}
                للوصول لخصم {discountPercent}%
              </span>
            )}
          </div>
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

      {/* Trending badge */}
      {currentVolume > targetVolume * 0.7 && !isAchieved && (
        <div className="absolute top-3 left-3 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          يقترب!
        </div>
      )}
    </div>
  );
}
