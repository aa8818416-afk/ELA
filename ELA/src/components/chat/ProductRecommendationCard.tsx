"use client";

import { useState } from "react";
import { ShoppingBag, ArrowLeft, Tag } from "lucide-react";
import Link from "next/link";
import { ZoomableImage } from "@/components/ui/ImageModal";
import QuickOrderModal, { RecommendedProduct } from "./QuickOrderModal";

interface ProductRecommendationCardProps {
  product: RecommendedProduct;
  userRole?: "farmer" | "distributor";
}

export default function ProductRecommendationCard({
  product,
  userRole = "farmer",
}: ProductRecommendationCardProps) {
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const productsLink = userRole === "distributor" ? "/distributor/products" : "/farmer/products";

  return (
    <>
      <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2.5 text-right" dir="rtl">
        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
          <Tag className="w-3.5 h-3.5 text-emerald-600" />
          <span>المنتج الموصى به من المرشد الزراعي:</span>
        </div>

        <div className="bg-white border border-emerald-300 hover:border-emerald-400 transition-all rounded-2xl p-3 flex gap-3 items-center shadow-xs">
          {/* Image */}
          {product.image_url ? (
            <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200 bg-slate-50">
              <ZoomableImage
                src={product.image_url}
                alt={product.name_ar}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0 text-xl font-bold">
              🧪
            </div>
          )}

          {/* Details */}
          <div className="flex-1 min-w-0">
            <h4 className="text-slate-900 font-bold text-sm truncate">{product.name_ar}</h4>
            {product.active_ingredient && (
              <p className="text-slate-500 text-xs truncate mt-0.5">
                المادة الفعالة: {product.active_ingredient}
              </p>
            )}
            <p className="text-emerald-700 font-black text-sm mt-1 font-mono">
              {product.price_to_farmer} ج.م
            </p>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-0.5">
          {/* Order Now Button */}
          <button
            type="button"
            onClick={() => setIsOrderModalOpen(true)}
            className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl transition-all shadow-xs border border-emerald-700 flex items-center justify-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>اطلب الآن</span>
          </button>

          {/* More Button */}
          <Link
            href={productsLink}
            className="flex-1 py-2.5 px-3 bg-white hover:bg-slate-50 active:scale-95 text-slate-700 hover:text-slate-900 text-xs font-bold rounded-xl transition-all border border-slate-300 flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>المزيد من المنتجات</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Quick Order Modal */}
      <QuickOrderModal
        product={product}
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
      />
    </>
  );
}
