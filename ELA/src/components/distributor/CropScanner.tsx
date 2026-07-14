"use client";

import { useState, useRef, useEffect } from "react";
import {
  Camera,
  Loader2,
  Send,
  Bot,
  User,
  FolderOpen,
  X,
  RotateCcw,
} from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "model";
  content: string;
  /** Image specifically attached to this message turn (already compressed base64) */
  chatImagePreview?: string;
};

type FailedPayload = {
  message: string;
  history: { role: "user" | "model"; content: string; imageBase64?: string }[];
  imageBase64?: string;
};

export default function CropScanner() {
  // Follow-up chat state - persistent from the start
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content: "أهلاً بك يا سفير قريتنا 🌾! يمكنك استخدام هذه الدردشة مباشرة لمناقشة أي استفسار زراعي، أو التقاط صورة فورا بالكاميرا وتوفيرها للذكاء الاصطناعي للمساعدة في تشخيص المرض وحجز العلاج.",
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  
  // Image attached inside chat
  const [chatAttachedImage, setChatAttachedImage] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatImageGalleryInputRef = useRef<HTMLInputElement>(null);
  const chatImageCameraInputRef = useRef<HTMLInputElement>(null);

  // Stores the last failed request so we can retry it
  const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatLoading]);

  // Compress image helper
  function compressImage(
    dataUrl: string,
    maxWidth = 768,
    quality = 0.65
  ): Promise<string> {
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

  // Handlers for attaching an image inside the chat
  const handleChatImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setChatAttachedImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    if (chatImageGalleryInputRef.current) chatImageGalleryInputRef.current.value = "";
    if (chatImageCameraInputRef.current) chatImageCameraInputRef.current.value = "";
  };

  const removeChatAttachedImage = () => setChatAttachedImage(null);

  // Core API call shared for retry
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
        setChatMessages((prev) => [
          ...prev,
          { id: `m-${Date.now()}`, role: "model", content: data.text },
        ]);
      }
    } catch {
      setChatError("تعذر الاتصال، تأكد من الإنترنت");
      setFailedPayload(payload);
    } finally {
      setIsChatLoading(false);
    }
  };

  // ── Follow-up chat send ─────────────────────────────────────────────────
  const handleChatSend = async (textOverride?: string) => {
    const text = (textOverride ?? chatInput).trim();
    if (!text && !chatAttachedImage) return;
    if (isChatLoading) return;

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
      .filter((m) => m.id !== "welcome" && !m.id.startsWith("diag-"))
      .slice(0, -1) // exclude last user msg (sent as `message`)
      .map((m) => ({
        role: m.role,
        content: m.content,
        imageBase64: m.chatImagePreview,
      }));

    const payload: FailedPayload = {
      message: text || "انظر إلى الصورة المرفقة وأخبرني بما تراه من إصابات أو أمراض",
      history: historyForApi,
      imageBase64: compressedImageToSend,
    };

    await callChatApi(payload);
  };

  const handleRetry = () => {
    if (!failedPayload) return;
    callChatApi(failedPayload);
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      {/* ── Follow-up Chat directly underneath ── */}
      <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-lg bg-slate-955/40 flex flex-col" style={{ minHeight: "65vh" }}>
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">المرشد الزراعي الذكي (سفير القرية)</p>
            <p className="text-slate-500 text-xs">اسأل المرشد أو صوّر الإصابة مباشرة لمساعدتك</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/40">
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
              <div className={`max-w-[80%] flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.chatImagePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={msg.chatImagePreview}
                    alt="صورة مرفقة"
                    className="w-48 h-36 object-cover rounded-xl border border-slate-750 shadow-md"
                  />
                )}
                {msg.content && msg.content !== "📷" && (
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "model"
                        ? "bg-slate-800 text-slate-200 rounded-tl-sm"
                        : "bg-emerald-600 text-white rounded-tr-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                )}
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
            <div className="flex flex-col items-center gap-2">
              <p className="text-red-400 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
                {chatError}
              </p>
              {failedPayload && (
                <button
                  onClick={handleRetry}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 px-4 py-2 rounded-xl transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إعادة الإرسال
                </button>
              )}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat-attached image preview */}
        {chatAttachedImage && (
          <div className="px-4 py-2 flex items-center gap-2 bg-slate-900 border-t border-slate-800 shrink-0">
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chatAttachedImage}
                alt="صورة مرفقة"
                className="w-16 h-12 object-cover rounded-xl border border-emerald-500/40"
              />
              <button
                onClick={removeChatAttachedImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <span className="text-slate-400 text-xs">صورة مرفقة جاهزة للإرسال</span>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t border-slate-800 p-3 flex gap-2 items-center bg-slate-900 shrink-0">
          {/* Action Button 1: Camera capture */}
          <button
            type="button"
            onClick={() => chatImageCameraInputRef.current?.click()}
            disabled={isChatLoading}
            className="flex-shrink-0 text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors p-2 bg-slate-850 rounded-xl"
            title="التقاط صورة فورا بالكاميرا"
          >
            <Camera className="w-5 h-5" />
          </button>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={chatImageCameraInputRef}
            onChange={handleChatImageSelect}
            className="hidden"
          />

          {/* Action Button 2: Upload from gallery */}
          <button
            type="button"
            onClick={() => chatImageGalleryInputRef.current?.click()}
            disabled={isChatLoading}
            className="flex-shrink-0 text-slate-400 hover:text-emerald-400 disabled:opacity-40 transition-colors p-2 bg-slate-850 rounded-xl"
            title="إرفاق صورة من الهاتف"
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          <input
            type="file"
            accept="image/*"
            ref={chatImageGalleryInputRef}
            onChange={handleChatImageSelect}
            className="hidden"
          />

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
            placeholder={chatAttachedImage ? "اكتب سؤالك عن الصورة (اختياري)..." : "اسأل المرشد أو أرفق صورة..."}
            disabled={isChatLoading}
            className="flex-1 bg-slate-800 text-white text-sm rounded-xl px-3 py-2.5 border border-slate-700 focus:border-emerald-500 outline-none placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            onClick={() => handleChatSend()}
            disabled={isChatLoading || (!chatInput.trim() && !chatAttachedImage)}
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
    </div>
  );
}
