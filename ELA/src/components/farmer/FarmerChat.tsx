"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send,
    Loader2,
    Mic,
    Square,
    Volume2,
    VolumeX,
    AlertCircle,
    ArrowRight,
    User,
    Bot,
} from "lucide-react";
import Link from "next/link";
import {
    useSpeechRecognition,
    speakArabic,
    isTtsSupported,
    stopSpeaking,
} from "@/utils/speech";

interface Message {
    id: string;
    role: "user" | "model";
    content: string;
    timestamp: Date;
}

export default function FarmerChat() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "model",
            content:
                "أهلاً بك يا حاج! أنا مرشدك الزراعي الذكي 🌾. إسألني عن أي حاجة تخص زرعك، الري، التسميد، أو الأمراض اللي بتواجهك وأنا هجاوبك حالاً.",
            timestamp: new Date(),
        },
    ]);
    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
    const [ttsSupported, setTtsSupported] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const {
        isListening,
        supported: speechSupported,
        error: speechError,
        startListening,
        stopListening,
    } = useSpeechRecognition();

    useEffect(() => {
        setTtsSupported(isTtsSupported());
        return () => {
            stopSpeaking();
        };
    }, []);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isLoading]);

    const handleSend = async (textToSend?: string) => {
        const text = (textToSend || inputText).trim();
        if (!text || isLoading) return;

        setInputText("");
        setError(null);

        const userMsg: Message = {
            id: `msg-${Date.now()}-user`,
            role: "user",
            content: text,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);

        try {
            // Prepare history in the format: { role: 'user' | 'model', content: string }
            // Exclude welcome message to avoid noise or keep it, up to you.
            const chatHistory = messages
                .filter((m) => m.id !== "welcome")
                .map((m) => ({
                    role: m.role,
                    content: m.content,
                }));

            const res = await fetch("/api/crop-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    history: chatHistory,
                    message: text,
                }),
            });

            const data = await res.json();

            if (!res.ok || data.error) {
                setError(data.error || "عذراً، حدث خطأ في معالجة طلبك.");
            } else if (data.success && data.text) {
                const modelMsg: Message = {
                    id: `msg-${Date.now()}-model`,
                    role: "model",
                    content: data.text,
                    timestamp: new Date(),
                };
                setMessages((prev) => [...prev, modelMsg]);

                // Auto-play the AI response if TTS is supported to assist the farmer
                if (isTtsSupported()) {
                    handleSpeak(modelMsg.content, modelMsg.id);
                }
            }
        } catch (err) {
            console.error("[chat] error sending message:", err);
            setError("تعذر الاتصال بالخادم، تأكد من اتصال الإنترنت وحاول مرة أخرى.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleMicClick = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening((transcript) => {
                setInputText((prev) => (prev ? prev + " " + transcript : transcript));
            });
        }
    };

    const handleSpeak = (text: string, msgId: string) => {
        if (activeSpeechId === msgId) {
            stopSpeaking();
            setActiveSpeechId(null);
        } else {
            stopSpeaking();
            setActiveSpeechId(msgId);
            speakArabic(text);

            // Simple listener approximation to clear state when voice ends
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
                const checkSpeech = setInterval(() => {
                    if (!window.speechSynthesis.speaking) {
                        setActiveSpeechId(null);
                        clearInterval(checkSpeech);
                    }
                }, 500);
            }
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] max-w-2xl mx-auto bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 bg-slate-900 border-b border-slate-800">
                <Link
                    href="/farmer"
                    className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors"
                >
                    <ArrowRight className="w-5 h-5" />
                </Link>
                <div>
                    <h2 className="text-white font-bold text-lg">المرشد الزراعي الذكي</h2>
                    <p className="text-emerald-400 text-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        متاح للاستشارة الصوتية والكتابية
                    </p>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "mr-auto flex-row-reverse" : "ml-auto"
                            }`}
                    >
                        {/* Avatar */}
                        <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${msg.role === "user"
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-slate-800 border-slate-700 text-slate-300"
                                }`}
                        >
                            {msg.role === "user" ? (
                                <User className="w-5 h-5" />
                            ) : (
                                <Bot className="w-5 h-5" />
                            )}
                        </div>

                        {/* Bubble */}
                        <div className="space-y-1">
                            <div
                                className={`rounded-2xl p-4 text-sm leading-relaxed relative ${msg.role === "user"
                                        ? "bg-emerald-600 text-white rounded-tr-none"
                                        : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none"
                                    }`}
                            >
                                <p className="whitespace-pre-line">{msg.content}</p>

                                {/* TTS Speaker icon for model replies */}
                                {msg.role === "model" && ttsSupported && (
                                    <button
                                        onClick={() => handleSpeak(msg.content, msg.id)}
                                        className={`absolute -bottom-3 -left-3 p-1.5 rounded-full border shadow-md transition-colors ${activeSpeechId === msg.id
                                                ? "bg-emerald-500 text-white border-emerald-400"
                                                : "bg-slate-800 text-slate-400 hover:text-white border-slate-700 hover:bg-slate-700"
                                            }`}
                                        title={activeSpeechId === msg.id ? "إيقاف الصوت" : "قراءة الرسالة بصوت عالي"}
                                    >
                                        {activeSpeechId === msg.id ? (
                                            <VolumeX className="w-4 h-4" />
                                        ) : (
                                            <Volume2 className="w-4 h-4" />
                                        )}
                                    </button>
                                )}
                            </div>
                            <span className="text-[10px] text-slate-500 block px-1">
                                {msg.timestamp.toLocaleTimeString("ar-EG", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                })}
                            </span>
                        </div>
                    </div>
                ))}

                {/* Loading / Writing Indicator */}
                {isLoading && (
                    <div className="flex gap-3 max-w-[85%] ml-auto">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-800 border border-slate-700 text-slate-300">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div className="bg-slate-900 border border-slate-800 text-slate-400 rounded-2xl rounded-tl-none p-4 text-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            <span>جاري كتابة الرد الزراعي...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Errors or Mic Alerts */}
            {(error || speechError) && (
                <div className="mx-4 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-2.5 text-red-400 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">{error || speechError}</p>
                </div>
            )}

            {/* Footer / Input form */}
            <div className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex items-center gap-2"
                >
                    {/* Microphone button */}
                    {speechSupported && (
                        <button
                            type="button"
                            onClick={handleMicClick}
                            className={`p-3 rounded-full border transition-all duration-300 ${isListening
                                    ? "bg-red-500 text-white border-red-400 animate-pulse scale-105"
                                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                                }`}
                            title={isListening ? "إيقاف التسجيل" : "تحدث بالصوت"}
                        >
                            {isListening ? (
                                <Square className="w-5 h-5 fill-current" />
                            ) : (
                                <Mic className="w-5 h-5" />
                            )}
                        </button>
                    )}

                    {/* Text Input */}
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        disabled={isLoading}
                        placeholder={
                            isListening
                                ? "تحدث الآن بوضوح، جاري كتابة صوتك..."
                                : "اكتب سؤالك هنا عن الزرع والسماد والأمراض..."
                        }
                        className="flex-1 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-emerald-500 text-white placeholder-slate-500 rounded-full py-3 px-5 text-sm outline-none transition-colors disabled:opacity-50"
                    />

                    {/* Send Button */}
                    <button
                        type="submit"
                        disabled={isLoading || !inputText.trim()}
                        className="p-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-full transition-colors active:scale-95 shadow-md flex items-center justify-center shrink-0"
                        title="إرسال"
                    >
                        <Send className="w-5 h-5 rotate-180" />
                    </button>
                </form>
                {isListening && (
                    <p className="text-center text-[10px] text-red-400 animate-pulse">
                        الميكروفون نشط الآن. انقر على المربع الأحمر عند الانتهاء للتسجيل والتعديل.
                    </p>
                )}
            </div>
        </div>
    );
}
