"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { saveProduct } from "@/app/actions/admin-products";
import type { Database } from "@/types/database.types";
import { Package, Plus, Edit2, X, CheckCircle2, TrendingUp } from "lucide-react";

type Product = Database["public"]["Tables"]["products"]["Row"];

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name_ar: "",
    active_ingredient: "",
    wholesale_cost: 0,
    price_to_farmer: 0,
    agent_commission: 0,
    stock_status: true,
  });

  const supabase = createClient();

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase.from("products").select("*").order("name_ar");
    if (!error && data) {
      setProducts(data);
    }
    setLoading(false);
  }

  function openNewProduct() {
    setEditingId(null);
    setFormData({
      name_ar: "",
      active_ingredient: "",
      wholesale_cost: 0,
      price_to_farmer: 0,
      agent_commission: 0,
      stock_status: true,
    });
    setIsModalOpen(true);
  }

  function openEditProduct(product: Product) {
    setEditingId(product.id);
    setFormData({
      name_ar: product.name_ar,
      active_ingredient: product.active_ingredient || "",
      wholesale_cost: product.wholesale_cost,
      price_to_farmer: product.price_to_farmer,
      agent_commission: product.agent_commission,
      stock_status: product.stock_status,
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await saveProduct(formData, editingId || undefined);
    if (res.error) {
      alert(res.error);
    } else {
      setIsModalOpen(false);
      fetchProducts();
    }
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Package className="w-6 h-6 text-green-600" />
          إدارة المنتجات والتسعير
        </h2>
        <button
          onClick={openNewProduct}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          إضافة منتج جديد
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium">اسم المنتج</th>
                <th className="px-6 py-4 font-medium">المادة الفعالة</th>
                <th className="px-6 py-4 font-medium">تكلفة الجملة</th>
                <th className="px-6 py-4 font-medium">سعر المزارع</th>
                <th className="px-6 py-4 font-medium">عمولة الموزع</th>
                <th className="px-6 py-4 font-medium text-green-700">الربح الصافي</th>
                <th className="px-6 py-4 font-medium">المخزون</th>
                <th className="px-6 py-4 font-medium">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    جاري التحميل...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    لا توجد منتجات مسجلة.
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const netProfit = p.price_to_farmer - p.wholesale_cost - p.agent_commission;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">{p.name_ar}</td>
                      <td className="px-6 py-4 text-slate-500 text-sm">{p.active_ingredient || "—"}</td>
                      <td className="px-6 py-4 text-slate-600">{p.wholesale_cost} ج.م</td>
                      <td className="px-6 py-4 font-semibold text-blue-600">{p.price_to_farmer} ج.م</td>
                      <td className="px-6 py-4 text-slate-600">{p.agent_commission} ج.م</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-bold bg-green-50 text-green-700 border border-green-100">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {netProfit} ج.م
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {p.stock_status ? (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-green-600">
                            <CheckCircle2 className="w-4 h-4" /> متوفر
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-red-500">
                            <X className="w-4 h-4" /> غير متوفر
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openEditProduct(p)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden" dir="rtl">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-bold text-slate-800">
                {editingId ? "تعديل بيانات المنتج" : "إضافة منتج جديد"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">اسم المنتج</label>
                  <input
                    type="text"
                    required
                    value={formData.name_ar}
                    onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">المادة الفعالة (اختياري)</label>
                  <input
                    type="text"
                    value={formData.active_ingredient}
                    onChange={(e) => setFormData({ ...formData, active_ingredient: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">التكلفة (جملة)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.wholesale_cost || ""}
                    onChange={(e) => setFormData({ ...formData, wholesale_cost: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">سعر البيع للمزارع</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.price_to_farmer || ""}
                    onChange={(e) => setFormData({ ...formData, price_to_farmer: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">عمولة السفير (الموزع)</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.agent_commission || ""}
                    onChange={(e) => setFormData({ ...formData, agent_commission: Number(e.target.value) })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.stock_status}
                      onChange={(e) => setFormData({ ...formData, stock_status: e.target.checked })}
                      className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                    />
                    <span className="font-medium text-slate-700">متوفر في المخزن</span>
                  </label>
                </div>
              </div>

              {/* Profit Preview */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100 flex justify-between items-center">
                <span className="text-blue-800 font-medium">الربح الصافي المتوقع:</span>
                <span className="text-xl font-bold text-blue-700">
                  {formData.price_to_farmer - formData.wholesale_cost - formData.agent_commission} ج.م
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                >
                  حفظ البيانات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
