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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={handleReset}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {success ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-3xl animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-1">تم إرسال طلبك بنجاح! 🎉</h3>
              <p className="text-slate-400 text-sm leading-relaxed px-4">
                تم تسجيل طلب <span className="text-emerald-400 font-bold">{product.name_ar}</span> ({quantity} عبوة) بنجاح وإشعاره لسفير القرية للمتابعة معك.
              </p>
            </div>

            <div className="pt-3 flex flex-col gap-2">
              <Link
                href="/farmer/orders"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <span>متابعة حالة الطلبات</span>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </Link>
              <button
                onClick={handleReset}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-2xl transition-colors"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تأكيد طلب المنتج</h3>
                <p className="text-slate-400 text-xs">طلب مباشر عبر سفير القرية</p>
              </div>
            </div>

            {/* Product Brief */}
            <div className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
              {product.image_url ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-slate-800">
                  <ZoomableImage
                    src={product.image_url}
                    alt={product.name_ar}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 shrink-0 text-xl font-bold">
                  🧪
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-white font-bold text-sm truncate">{product.name_ar}</h4>
                {product.active_ingredient && (
                  <p className="text-slate-400 text-xs truncate mt-0.5">
                    المادة الفعالة: {product.active_ingredient}
                  </p>
                )}
                <p className="text-emerald-400 text-xs font-bold mt-1">
                  {product.price_to_farmer} ج.م / للعبوة
                </p>
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">حدد كمية العبوات المطلوبة:</label>
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-2xl p-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                  disabled={quantity <= 1 || loading}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-lg font-bold text-white px-4">{quantity} عبوة</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                  disabled={loading}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Field Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                ربط المنتج بأرض (اختياري — يساعد المرشد يتابعك)
              </label>

              {fieldsLoading ? (
                <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>جاري تحميل أراضيك...</span>
                </div>
              ) : fields.length === 0 ? (
                <p className="text-slate-500 text-xs bg-slate-800/50 rounded-xl px-3 py-2">
                  لا توجد أراضٍ مسجلة — سيتم إتمام الشراء بدون ربط بأرض
                </p>
              ) : fields.length === 1 ? (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                  <span className="text-emerald-400 text-sm">🌾</span>
                  <span className="text-emerald-300 text-sm font-medium">
                    {fields[0].field_name || fields[0].crop_type || "أرضي"}
                  </span>
                  <span className="text-emerald-500 text-xs mr-auto">تم التحديد تلقائياً</span>
                </div>
              ) : (
                <select
                  value={selectedFieldId ?? ""}
                  onChange={(e) => setSelectedFieldId(e.target.value || null)}
                  disabled={loading}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all disabled:opacity-50"
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
            <div className="flex items-center justify-between p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <span className="text-xs text-emerald-300 font-medium">إجمالي التكلفة المتوقعة:</span>
              <span className="text-lg font-black text-emerald-400">{totalPrice.toLocaleString()} ج.م</span>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              onClick={handleOrderConfirm}
              disabled={loading}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl transition-all active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
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
