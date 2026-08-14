"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Bot,
  User,
  Loader2,
  Camera,
  FolderOpen,
  RotateCcw,
  Mic,
  Square,
  Volume2,
  VolumeX,
  Globe,
  ExternalLink,
} from "lucide-react";
import {
  useAudioRecorder,
  speakArabic,
  isTtsSupported,
  stopSpeaking,
} from "@/utils/speech";
import ProductRecommendationCard from "@/components/chat/ProductRecommendationCard";
import type { RecommendedProduct } from "@/components/chat/QuickOrderModal";

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  /** Image specifically attached to this message turn (base64 preview) */
  chatImagePreview?: string;
  recommendedProduct?: RecommendedProduct;
  sources?: Array<{ title: string; url: string }>;
};

type FailedPayload = {
  message: string;
  history: { role: "user" | "model"; content: string; imageBase64?: string }[];
  imageBase64?: string;
};

export default function FarmerCropScanner() {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content:
        "أهلاً بك يا فلاحنا العزيز 🌾! يمكنك سؤالي عن أي شيء بخصوص المحاصيل والأمراض والري والتسميد، أو إرفاق صورة للمحصول المشتبه به وأنا هشوفه وأشخصه لك حالاً.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatAttachedImage, setChatAttachedImage] = useState<string | null>(null);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  
  // Stores the last failed request so we can retry it
  const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const {
    isRecording,
    transcribing,
    error: recorderError,
    hasMic,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  // Auto-resize textarea whenever chatInput changes
  const autoResize = useCallback(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 144) + "px";
  }, []);

  useEffect(() => {
    autoResize();
  }, [chatInput, autoResize]);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  // Image compression helper
  function compressImage(dataUrl: string, maxWidth = 768, quality = 0.65): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject("Canvas not supported"); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject("Failed to load image");
      img.src = dataUrl;
    });
  }

  // Handle image selection (camera or gallery)
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setChatAttachedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const callChatApi = async (payload: FailedPayload) => {
    setIsChatLoading(true);
    setChatError(null);
    setFailedPayload(null);
    try {
      const res = await fetch("/api/crop-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setChatError(data.error || "حدث خطأ، حاول مرة أخرى");
        setFailedPayload(payload);
      } else {
        const newMsgId = `m-${Date.now()}`;
        setChatMessages((prev) => [
          ...prev,
          { id: newMsgId, role: "model", content: data.text, recommendedProduct: data.recommendedProduct || undefined, sources: data.sources || undefined },
        ]);

        // Auto-play the AI response if TTS is supported
        if (isTtsSupported()) {
          handleSpeak(data.text, newMsgId);
        }
      }
    } catch {
      setChatError("تعذر الاتصال، تأكد من الإنترنت");
      setFailedPayload(payload);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleChatSend = async () => {
    const text = chatInput.trim();
    if ((!text && !chatAttachedImage) || isChatLoading) return;

    let compressedImageToSend: string | undefined = undefined;
    if (chatAttachedImage) {
      try {
        compressedImageToSend = await compressImage(chatAttachedImage);
      } catch {
        compressedImageToSend = chatAttachedImage;
      }
    }

    const chatImagePreview = chatAttachedImage || undefined;
    setChatInput("");
    setChatAttachedImage(null);

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: text || "📷",
      chatImagePreview,
    };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);

    const historyForApi = updatedMessages
      .filter((m) => m.id !== "welcome")
      .slice(0, -1)
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageBase64: m.chatImagePreview,
      }));

    await callChatApi({
      message: text || "انظر إلى الصورة المرفقة وأخبرني بما تراه من إصابات أو أمراض",
      history: historyForApi,
      imageBase64: compressedImageToSend,
    });
  };

  const handleRetry = () => {
    if (!failedPayload) return;
    callChatApi(failedPayload);
  };

  const handleMicClick = async () => {
    if (isRecording) {
      await stopRecording((transcript) => {
        setChatInput((prev) => (prev ? prev + " " + transcript : transcript));
      });
    } else {
      await startRecording();
    }
  };

  const handleSpeak = (text: string, msgId: string) => {
    if (activeSpeechId === msgId) {
      stopSpeaking();
      setActiveSpeechId(null);
    } else {
      setActiveSpeechId(msgId);
      speakArabic(
        text,
        () => setActiveSpeechId(msgId),
        () => setActiveSpeechId(msgId),
        () => setActiveSpeechId(null)
      );
    }
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden shadow-xs flex flex-col" style={{ minHeight: "72vh" }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 bg-[#fbfdfa] shrink-0">
        <div className="w-9 h-9 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-xs">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <p className="text-slate-900 font-black text-sm">المرشد الزراعي الذكي (طبيب المحاصيل)</p>
          <p className="text-slate-500 text-[11px] flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse" />
            جاهز لتشخيص الأمراض والإجابة عن كل استفساراتك الزراعية
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth bg-[#f8faf9]">
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            {/* Avatar */}
            <div
              className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center shadow-xs ${
                msg.role === "model"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {msg.role === "model" ? (
                <Bot className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>

            {/* Bubble */}
            <div className={`max-w-[85%] flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
              {/* Attached image */}
              {msg.chatImagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.chatImagePreview}
                  alt="صورة مرفقة"
                  className="w-52 h-40 object-cover rounded-2xl border border-slate-200 shadow-xs"
                />
              )}
              {/* Text content */}
              {msg.content && msg.content !== "📷" && (
                <div
                  className={`px-4 py-3 rounded-2xl text-xs leading-relaxed relative shadow-xs border ${
                    msg.role === "model"
                      ? "bg-white text-slate-800 border-slate-200/80 rounded-tr-sm"
                      : "bg-emerald-600 text-white border-emerald-700 rounded-tl-sm font-medium"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Product Recommendation Card */}
                  {msg.role === "model" && msg.recommendedProduct && (
                    <ProductRecommendationCard product={msg.recommendedProduct} userRole="farmer" />
                  )}

                  {/* Web Search Grounding Sources */}
                  {msg.role === "model" && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1.5">
                        <Globe className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                        <span>المصادر ومراجع البحث:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.sources.map((source, idx) => (
                          <a
                            key={idx}
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-emerald-800 text-[11px] px-2.5 py-1 rounded-lg transition-colors shadow-xs"
                            title={source.url}
                          >
                            <span className="truncate max-w-[180px] font-medium">{source.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TTS Speaker icon for model replies */}
                  {msg.role === "model" && isTtsSupported() && (
                    <button
                      onClick={() => handleSpeak(msg.content, msg.id)}
                      className={`absolute -bottom-3 -left-3 p-1.5 rounded-full border shadow-xs transition-colors ${
                        activeSpeechId === msg.id
                          ? "bg-emerald-600 text-white border-emerald-700"
                          : "bg-white text-slate-600 hover:text-emerald-800 border-slate-200 hover:bg-slate-50"
                      }`}
                      title={activeSpeechId === msg.id ? "إيقاف الصوت" : "قراءة الرسالة بصوت عالي"}
                    >
                      {activeSpeechId === msg.id ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isChatLoading && (
          <div className="flex gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tr-sm shadow-xs">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Audio transcribing indicator */}
        {transcribing && (
          <div className="flex gap-2.5 mr-auto flex-row-reverse">
            <div className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center bg-slate-200 text-slate-700">
              <User className="w-4 h-4" />
            </div>
            <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-tl-sm shadow-xs">
              <div className="flex gap-2 items-center text-slate-600 text-xs font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span>جاري تحويل صوتك لنص...</span>
              </div>
            </div>
          </div>
        )}

        {/* Errors display */}
        {(chatError || recorderError) && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-red-700 text-xs text-center bg-red-50 border border-red-200 rounded-xl px-4 py-2 font-medium">
              {chatError || recorderError}
            </p>
            {failedPayload && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 px-4 py-2 rounded-xl transition-colors shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                إعادة الإرسال
              </button>
            )}
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Image preview before send */}
      {chatAttachedImage && (
        <div className="px-4 py-2 flex items-center gap-3 bg-emerald-50 border-t border-emerald-200 shrink-0">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chatAttachedImage}
              alt="معاينة الصورة"
              className="w-16 h-12 object-cover rounded-xl border border-emerald-300 shadow-xs"
            />
            <button
              onClick={() => setChatAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white shadow-xs hover:bg-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <span className="text-emerald-900 text-xs font-medium">صورة الورقة جاهزة للتشخيص — اكتب سؤالك أو أرسلها مباشرة</span>
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-slate-200 px-3 pt-2.5 pb-3 flex flex-col bg-white shrink-0">
        {/* Row 1: Textarea + Send */}
        <div className="flex items-end gap-2 mb-2">
          <textarea
            ref={chatInputRef}
            rows={1}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleChatSend();
              }
            }}
            placeholder={
              isRecording
                ? "🎙️ جاري تسجيل صوتك..."
                : transcribing
                ? "⏳ جاري ترجمة صوتك..."
                : chatAttachedImage
                ? "اكتب سؤالك عن الصورة (اختياري)..."
                : "اسأل المرشد أو صوّر الورقة المصابة..."
            }
            disabled={isChatLoading || transcribing}
            className="flex-1 bg-[#f8faf9] border border-slate-200 hover:border-slate-300 focus:border-emerald-500 text-slate-900 placeholder-slate-400 rounded-2xl py-2.5 px-4 text-xs outline-none transition-colors disabled:opacity-50 resize-none overflow-y-auto leading-relaxed"
            style={{ minHeight: "44px", maxHeight: "144px" }}
          />

          <button
            onClick={handleChatSend}
            disabled={isChatLoading || transcribing || (!chatInput.trim() && !chatAttachedImage)}
            className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl transition-all active:scale-95 shadow-xs border border-emerald-700 flex items-center justify-center shrink-0 self-end"
            aria-label="إرسال"
          >
            {isChatLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5 rotate-180" />
            )}
          </button>
        </div>

        {/* Row 2: Framed Camera / Gallery / Mic buttons */}
        <div className="flex items-center gap-2">
          {/* Camera */}
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={isChatLoading || transcribing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-700 disabled:opacity-40 transition-colors text-xs font-bold shadow-xs"
            title="تصوير فوري بالكاميرا"
          >
            <Camera className="w-4 h-4 text-emerald-600" />
            <span>كاميرا</span>
          </button>
          <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} onChange={handleImageSelect} className="hidden" />

          {/* Gallery */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isChatLoading || transcribing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-700 disabled:opacity-40 transition-colors text-xs font-bold shadow-xs"
            title="اختر صورة من الجهاز"
          >
            <FolderOpen className="w-4 h-4 text-teal-600" />
            <span>معرض</span>
          </button>
          <input type="file" accept="image/*" ref={galleryInputRef} onChange={handleImageSelect} className="hidden" />

          {/* Microphone */}
          {hasMic && (
            <button
              type="button"
              onClick={handleMicClick}
              disabled={isChatLoading || transcribing}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border transition-all text-xs font-bold shadow-xs ${
                isRecording
                  ? "bg-red-500 text-white border-red-600 animate-pulse"
                  : "bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-700 border-slate-200"
              }`}
              title={isRecording ? "إيقاف التسجيل" : "تحدث بالصوت"}
            >
              {isRecording ? (
                <><Square className="w-4 h-4 fill-current text-white" /><span>إيقاف</span></>
              ) : (
                <><Mic className="w-4 h-4 text-amber-600" /><span>صوت</span></>
              )}
            </button>
          )}
        </div>

        {isRecording && (
          <p className="text-center text-[10px] text-red-600 font-bold animate-pulse mt-1.5">
            الميكروفون نشط — انقر «إيقاف» عند الانتهاء
          </p>
        )}
      </div>
    </div>
  );
}
