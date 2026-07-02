"use client";

import { useState, useRef } from "react";
import { diagnoseCrop } from "@/app/actions/distributor";
import { Camera, Loader2, Leaf, AlertCircle, ShoppingCart } from "lucide-react";


interface DiagnosisResult {
  diagnosis?: { disease_name_ar?: string; description_ar?: string; confidence_percentage?: number };
  recommendedProduct?: { name_ar?: string; price_to_farmer?: number };
}

export default function CropScanner() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset previous state
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setIsLoading(true);
    setError(null);

    const response = await diagnoseCrop(image);
    
    if (response.error) {
      setError(response.error);
    } else {
      setResult(response);
    }
    setIsLoading(false);
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Upload Section */}
      {!image && (
        <div
          className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-3xl p-12 text-center cursor-pointer transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Camera className="w-10 h-10 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">التقط أو ارفع صورة للمحصول</h3>
          <p className="text-slate-400 text-sm">
            قم بتصوير ورقة النبات المصابة بوضوح ودع الذكاء الاصطناعي يقوم بالتشخيص
          </p>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Image Preview & Analyze Button */}
      {image && !result && (
        <div className="space-y-6">
          <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="Crop preview" className="w-full h-full object-cover" />
            <button
              onClick={() => setImage(null)}
              className="absolute top-4 right-4 bg-slate-900/80 text-white p-2 rounded-full hover:bg-red-500 transition-colors"
            >
              <AlertCircle className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white font-bold rounded-xl py-4 flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-500/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>جاري تحليل الصورة بالذكاء الاصطناعي...</span>
              </>
            ) : (
              <>
                <ScanLine className="w-6 h-6" />
                <span>بدء التشخيص</span>
              </>
            )}
          </button>
          {error && (
            <p className="text-red-400 text-center text-sm">{error}</p>
          )}
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-2xl font-bold text-emerald-400 mb-2">
                {result.diagnosis?.disease_name_ar}
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed max-w-2xl">
                {result.diagnosis?.description_ar}
              </p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full text-emerald-400 text-xs font-bold whitespace-nowrap">
              دقة: {result.diagnosis?.confidence_percentage}%
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6 mt-6">
            <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emerald-400" />
              العلاج المقترح
            </h4>
            
            {result.recommendedProduct ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-white font-bold text-lg">{result.recommendedProduct.name_ar}</p>
                  <p className="text-emerald-400 font-medium">{result.recommendedProduct.price_to_farmer} ج.م</p>
                </div>
                <button className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  <ShoppingCart className="w-5 h-5" />
                  أضف إلى الطلب الفوري
                </button>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">لا يوجد منتج مطابق في قاعدة البيانات حالياً.</p>
            )}
          </div>

          <button
            onClick={() => {
              setImage(null);
              setResult(null);
            }}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl py-3 transition-colors mt-4"
          >
            فحص صورة أخرى
          </button>
        </div>
      )}
    </div>
  );
}

// Temporary icon to avoid adding more imports at the top
function ScanLine(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <line x1="7" x2="17" y1="12" y2="12" />
    </svg>
  );
}
