"use client";

import { useState, useRef, useEffect } from "react";
import { diagnoseCrop } from "@/app/actions/distributor";
import {
  Camera,
  Loader2,
  Leaf,
  AlertCircle,
  ShoppingCart,
  Send,
  Bot,
  User,
} from "lucide-react";

interface DiagnosisResult {
  diagnosis?: {
    disease_name_ar?: string;
    description_ar?: string;
    confidence_percentage?: number;
  };
  recommendedProduct?: { name_ar?: string; price_to_farmer?: number; image_url?: string | null };
}

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
};

export default function CropScanner() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Follow-up chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  // When result arrives, seed chat with a context message
  useEffect(() => {
    if (!result?.diagnosis) return;
    const productInfo = result.recommendedProduct
      ? ` والدواء المقترح هو "${result.recommendedProduct.name_ar}" بسعر ${result.recommendedProduct.price_to_farmer} جنيهاً`
      : " ولا يوجد دواء مطابق متوفر حالياً";
    setChatMessages([
      {
        id: "seed",
        role: "model",
        content: `تم تشخيص المحصول بـ **${result.diagnosis.disease_name_ar}** بنسبة ثقة ${result.diagnosis.confidence_percentage}%${productInfo}. هل تريد مزيداً من المعلومات عن المرض أو طريقة العلاج؟ 🌾`,
      },
    ]);
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setChatMessages([]);
    setChatInput("");
    setChatError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setIsLoading(true);
    setError(null);
    const response = await diagnoseCrop(image);
    if (response.error) {
      setError(response.error as string);
    } else {
      setResult(response as DiagnosisResult);
    }
    setIsLoading(false);
  };

  const handleReset = () => {
    setImage(null);
    setResult(null);
    setError(null);
    setChatMessages([]);
    setChatInput("");
    setChatError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Follow-up chat send ─────────────────────────────────────────────────
  const handleChatSend = async (textOverride?: string) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text || isChatLoading) return;

    setChatInput("");
    setChatError(null);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text,
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setIsChatLoading(true);

    try {
      const historyForApi = updatedMessages
        .filter((m) => m.id !== "seed")
        .slice(0, -1) // exclude last user msg (sent as `message`)
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/crop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history: historyForApi }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        setChatError(data.error || "حدث خطأ، حاول مرة أخرى");
      } else {
        setChatMessages((prev) => [
          ...prev,
          { id: `m-${Date.now()}`, role: "model", content: data.text },
        ]);
      }
    } catch {
      setChatError("تعذر الاتصال، تأكد من الإنترنت");
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 lg:p-8 max-w-3xl mx-auto">

      {/* ── Upload Section ──────────────────────────────────────────────── */}
      {!image && (
        <div
          className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-3xl p-12 text-center cursor-pointer transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Camera className="w-10 h-10 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            التقط أو ارفع صورة للمحصول
          </h3>
          <p className="text-slate-400 text-sm">
            قم بتصوير ورقة النبات المصابة بوضوح ودع الذكاء الاصطناعي يقوم
            بالتشخيص
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

      {/* ── Image Preview & Analyze ─────────────────────────────────────── */}
      {image && !result && (
        <div className="space-y-6">
          <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="Crop preview"
              className="w-full h-full object-cover"
            />
            <button
              onClick={handleReset}
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

      {/* ── Results Section ─────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* Disease card */}
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

          {/* Recommended product */}
          <div className="border-t border-slate-800 pt-6">
            <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emerald-400" />
              العلاج المقترح
            </h4>

            {result.recommendedProduct ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4">
                {/* Product image */}
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 flex-shrink-0 flex items-center justify-center">
                  {result.recommendedProduct.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.recommendedProduct.image_url}
                      alt={result.recommendedProduct.name_ar}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🧪</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-center sm:text-right">
                  <p className="text-white font-bold text-lg">
                    {result.recommendedProduct.name_ar}
                  </p>
                  <p className="text-emerald-400 font-medium">
                    {result.recommendedProduct.price_to_farmer} ج.م
                  </p>
                </div>
                <button className="w-full sm:w-auto bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors flex-shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                  أضف إلى الطلب الفوري
                </button>
              </div>
            ) : (
              <p className="text-slate-400 text-sm">
                لا يوجد منتج مطابق في قاعدة البيانات حالياً.
              </p>
            )}
          </div>

          {/* ── Follow-up Chat ──────────────────────────────────────────── */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900 border-b border-slate-800">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Bot className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-white text-sm font-bold">استفسر عن التشخيص</p>
                <p className="text-slate-500 text-xs">اسأل أي سؤال عن المرض أو طريقة العلاج</p>
              </div>
            </div>

            {/* Messages */}
            <div className="max-h-64 overflow-y-auto p-4 space-y-3 bg-slate-950/40">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                      msg.role === "model"
                        ? "bg-emerald-500/10 border border-emerald-500/20"
                        : "bg-slate-700"
                    }`}
                  >
                    {msg.role === "model" ? (
                      <Bot className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <User className="w-4 h-4 text-slate-300" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "model"
                        ? "bg-slate-800 text-slate-200 rounded-tl-sm"
                        : "bg-emerald-600 text-white rounded-tr-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isChatLoading && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              {chatError && (
                <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl p-2">
                  {chatError}
                </p>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input bar */}
            <div className="border-t border-slate-800 p-3 flex gap-2 bg-slate-900">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder="اسأل عن المرض أو طريقة العلاج..."
                disabled={isChatLoading}
                className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-3 py-2.5 border border-slate-700 focus:border-emerald-500 outline-none placeholder:text-slate-600 disabled:opacity-50"
              />
              <button
                onClick={() => handleChatSend()}
                disabled={isChatLoading || !chatInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white p-2.5 rounded-xl transition-colors flex-shrink-0"
                aria-label="إرسال"
              >
                {isChatLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Scan again */}
          <button
            onClick={handleReset}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl py-3 transition-colors"
          >
            فحص صورة أخرى
          </button>
        </div>
      )}
    </div>
  );
}

// Inline SVG icon to keep imports minimal
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
