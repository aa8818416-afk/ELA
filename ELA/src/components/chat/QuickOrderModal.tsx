"use client";

import { useState, useEffect } from "react";
import { X, ShoppingBag, Plus, Minus, Loader2, CheckCircle2, AlertCircle, ArrowLeft, MapPin } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { createFarmerOrderDirectly, createTreatmentFromPurchase } from "@/app/actions/farmer";
import { ZoomableImage } from "@/components/ui/ImageModal";

export type RecommendedProduct = {
  id: string;
  name_ar: string;
  price_to_farmer: number;
  image_url?: string | null;
  active_ingredient?: string | null;
};

interface FarmerField {
  id: string;
  field_name: string | null;
  crop_type: string;
}

interface QuickOrderModalProps {
  product: RecommendedProduct | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function QuickOrderModal({
  product,
  isOpen,
  onClose,
}: QuickOrderModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // حالة اختيار الأرض
  const [fields, setFields] = useState<FarmerField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const supabase = createClient();

  // جلب أراضي المزارع عند فتح المودال
  useEffect(() => {
    if (!isOpen || !product) return;

    setFieldsLoading(true);
    supabase
      .from("farmer_fields")
      .select("id, field_name, crop_type")
      .eq("is_active", true)
      .then(({ data }) => {
        const activeFields: FarmerField[] = (data as FarmerField[] | null) ?? [];
        setFields(activeFields);
        // إذا كان للمزارع أرض واحدة فقط، يتم تحديدها تلقائياً
        if (activeFields.length === 1) {
          setSelectedFieldId(activeFields[0].id);
        } else {
          setSelectedFieldId(null);
        }
        setFieldsLoading(false);
      });
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const totalPrice = product.price_to_farmer * quantity;

  const handleOrderConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. إتمام الطلب
      const res = await createFarmerOrderDirectly({
        productId: product.id,
        quantity,
      });

      if (res.error) {
        setError(res.error);
        setLoading(false);
        return;
      }

      // 2. إنشاء صف نشاط رش فقط لو تم تحديد أرض — لو ما فيش أرض محددة لا نسجل أي شيء
      if (selectedFieldId) {
        await createTreatmentFromPurchase({
          productId: product.id,
          fieldId: selectedFieldId,
        });
      }

      setSuccess(true);
    } catch {
      setError("حدث خطأ غير متوقع أثناء الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setQuantity(1);
    setSuccess(false);
    setError(null);
    setSelectedFieldId(null);
    setFields([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={handleReset}
          className="absolute top-4 left-4 p-2 text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors border border-slate-200 shadow-xs"
        >
          <X className="w-4 h-4" />
        </button>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full flex items-center justify-center mx-auto animate-bounce shadow-xs">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 mb-1">تم إرسال طلبك بنجاح! 🎉</h3>
              <p className="text-slate-500 text-xs leading-relaxed px-4">
                تم تسجيل طلب <span className="text-emerald-700 font-bold">{product.name_ar}</span> ({quantity} عبوة) بنجاح وإشعاره لسفير القرية للمتابعة معك.
              </p>
            </div>

            <div className="pt-3 flex flex-col gap-2">
              <Link
                href="/farmer/orders"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-xs border border-emerald-700"
              >
                <span>متابعة حالة الطلبات</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Link>
              <button
                onClick={handleReset}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-2xl transition-colors border border-slate-200"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shadow-xs">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">تأكيد طلب المنتج</h3>
                <p className="text-slate-500 text-xs">طلب مباشر عبر سفير القرية</p>
              </div>
            </div>

            {/* Product Brief */}
            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-xs">
              {product.image_url ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-200 shadow-xs">
                  <ZoomableImage
                    src={product.image_url}
                    alt={product.name_ar}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 text-2xl">
                  🧪
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-slate-900 font-black text-sm truncate">{product.name_ar}</h4>
                {product.active_ingredient && (
                  <p className="text-slate-500 text-xs truncate mt-0.5">
                    المادة الفعالة: {product.active_ingredient}
                  </p>
                )}
                <p className="text-emerald-700 text-xs font-black mt-1 font-mono">
                  {product.price_to_farmer} ج.م / للعبوة
                </p>
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">حدد كمية العبوات المطلوبة:</label>
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-2 shadow-xs">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 shadow-xs"
                  disabled={quantity <= 1 || loading}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-lg font-black text-slate-900 px-4 font-mono">{quantity} عبوة</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 shadow-xs"
                  disabled={loading}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Field Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                ربط المنتج بأرض (اختياري — يساعد المرشد يتابعك)
              </label>

              {fieldsLoading ? (
                <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري تحميل أراضيك...</span>
                </div>
              ) : fields.length === 0 ? (
                <p className="text-slate-500 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  لا توجد أراضٍ مسجلة — سيتم إتمام الشراء بدون ربط بأرض
                </p>
              ) : fields.length === 1 ? (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 shadow-xs">
                  <span className="text-emerald-700 text-sm">🌾</span>
                  <span className="text-emerald-900 text-xs font-bold">
                    {fields[0].field_name || fields[0].crop_type || "أرضي"}
                  </span>
                  <span className="text-emerald-600 text-[11px] mr-auto">تم التحديد تلقائياً</span>
                </div>
              ) : (
                <select
                  value={selectedFieldId ?? ""}
                  onChange={(e) => setSelectedFieldId(e.target.value || null)}
                  disabled={loading}
                  className="w-full bg-white border border-slate-300 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all disabled:opacity-50 shadow-xs"
                >
                  <option value="">— اختر الأرض (اختياري) —</option>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.field_name || f.crop_type || `أرض ${f.id.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Total Price Summary */}
            <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-xs">
              <span className="text-xs text-emerald-900 font-bold">إجمالي التكلفة المتوقعة:</span>
              <span className="text-lg font-black text-emerald-700 font-mono">{totalPrice.toLocaleString()} ج.م</span>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-red-800 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleOrderConfirm}
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black rounded-2xl transition-all active:scale-[0.98] shadow-xs border border-emerald-700 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span>جاري تسجيل الطلب...</span>
                </>
              ) : (
                <>
                  <ShoppingBag className="w-5 h-5" />
                  <span>تأكيد وشراء الطلب الآن</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
