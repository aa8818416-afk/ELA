"use client";

import { useState, useMemo } from "react";
import { createOrder } from "@/app/actions/distributor";
import { ShoppingCart, Loader2, CheckCircle2 } from "lucide-react";

type Farmer = { profile_id: string; full_name: string };
type Product = { id: string; name_ar: string; price_to_farmer: number; image_url?: string | null };

export default function OrderForm({
  farmers,
  products,
}: {
  farmers: Farmer[];
  products: Product[];
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState<number>(1);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const totalPrice = selectedProduct
    ? selectedProduct.price_to_farmer * quantity
    : 0;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    formData.append("totalPrice", totalPrice.toString());

    const result = await createOrder(formData);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      // Reset form on success
      setSelectedProductId("");
      setQuantity(1);
      (e.target as HTMLFormElement).reset();
    }
    setIsLoading(false);
  }

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 lg:p-8">
      <h3 className="text-xl font-bold text-white mb-6">إنشاء طلب جديد</h3>

      {success && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-2xl flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6" />
          <p>تم إصدار الطلب بنجاح! سيتم إرسال رسالة تأكيد للمزارع.</p>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-300 p-4 rounded-2xl">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            اختر الفلاح
          </label>
          <select
            name="farmerId"
            required
            className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none"
          >
            <option value="">-- اختر الفلاح --</option>
            {farmers.map((f) => (
              <option key={f.profile_id} value={f.profile_id}>
                {f.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            المنتج / المبيد
          </label>
          <div className="flex gap-3 items-center">
            {selectedProduct?.image_url ? (
              <img
                src={selectedProduct.image_url}
                alt={selectedProduct.name_ar}
                className="w-12 h-12 rounded-xl object-cover bg-slate-800 shrink-0 border border-slate-700"
              />
            ) : selectedProduct ? (
              <div className="w-12 h-12 rounded-xl bg-slate-850 border border-slate-800 flex items-center justify-center shrink-0 text-slate-400 text-lg">
                📦
              </div>
            ) : null}
            <div className="relative flex-1">
              <select
                name="productId"
                required
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 appearance-none"
              >
                <option value="">-- اختر المنتج --</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_ar} - {p.price_to_farmer} ج.م
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              الكمية (عبوة)
            </label>
            <input
              name="quantity"
              type="number"
              min="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-right"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              الإجمالي (ج.م)
            </label>
            <div className="w-full bg-slate-950/50 border border-slate-800/50 text-emerald-400 font-bold rounded-xl px-4 py-3 text-lg flex items-center justify-between">
              <span>{totalPrice.toLocaleString()}</span>
              <span className="text-sm font-medium text-emerald-500/70">ج.م</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !selectedProductId}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900 disabled:text-emerald-500/50 disabled:cursor-not-allowed text-white font-bold rounded-xl py-4 mt-4 flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ShoppingCart className="w-5 h-5" />
              تأكيد الطلب
            </>
          )}
        </button>
      </form>
    </div>
  );
}
