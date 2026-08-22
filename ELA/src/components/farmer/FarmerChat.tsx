"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
    Send,
    Loader2,
    Mic,
    Square,
    Volume2,
    VolumeX,
    AlertCircle,
    Camera,
    FolderOpen,
    X,
    RotateCcw,
    WifiOff,
    Globe,
    ExternalLink,
    MessageSquare,
    Plus,
    Trash2,
    Clock,
    PanelRightOpen,
    Pencil,
    Check,
    ArrowDown,
} from "lucide-react";
import {
    useAudioRecorder,
    speakArabic,
    isTtsSupported,
    stopSpeaking,
} from "@/utils/speech";
import ProductRecommendationCard from "@/components/chat/ProductRecommendationCard";
import type { RecommendedProduct } from "@/components/chat/QuickOrderModal";

interface Message {
    id: string;
    session_id?: string;
    role: "user" | "model";
    content: string;
    timestamp: Date;
    imagePreview?: string;
    recommendedProduct?: RecommendedProduct;
    sources?: Array<{ title: string; url: string }>;
}

interface ChatSession {
    id: string;
    title: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

type FailedPayload = {
    message: string;
    session_id?: string | null;
    history: { role: "user" | "model"; content: string; imageBase64?: string }[];
    imageBase64?: string;
};

const WELCOME_MESSAGE: Message = {
    id: "welcome",
    role: "model",
    content:
        "أهلاً بك يا حاج! أنا مرشدك الزراعي الذكي 🌾.\nاسألني عن أي حاجة تخص زرعك، الري، التسميد، أو الأمراض اللي بتواجهك وأنا هجاوبك حالاً. يمكنك كمان ترفق صورة من المحصول وأنا هحللها بدقة.",
    timestamp: new Date(),
};

/**
 * Lightweight & Rich Markdown Formatter for Arabic Chat
 */
/**
 * Lightweight & Robust Markdown Formatter for Arabic Chat
 */
function MarkdownMessage({ content }: { content: string }) {
    const rendered = useMemo(() => {
        if (!content) return null;

        // Pre-normalize content to fix common LLM formatting inconsistencies:
        // 1. Separate inline headers onto their own lines (e.g. "...حقلك: ## العنوان" -> "...حقلك:\n\n## العنوان")
        // 2. Re-attach detached headers with their following text (e.g. "#\n\nتشخيص" -> "# تشخيص")
        // 3. Fix detached numbers (e.g. "1.\nالاسم" -> "1. الاسم")
        // 4. Normalize horizontal rules (e.g. "---" onto separate lines)
        let normalized = content
            .replace(/([^\n])\s*(#{1,6}\s+)/g, "$1\n\n$2")
            .replace(/^(#{1,6})\s*\n+([^\n#])/gm, "$1 $2")
            .replace(/(^|\n)(\d+\.)\s*\n\s*/g, "$1$2 ")
            .replace(/([^\n])\s*(---|___|\*\*\*)\s*/g, "$1\n\n---\n\n");

        const lines = normalized.split("\n");
        const elements: React.ReactNode[] = [];

        lines.forEach((line, lineIdx) => {
            const trimmed = line.trim();

            if (!trimmed) {
                elements.push(<div key={`empty-${lineIdx}`} className="h-2" />);
                return;
            }

            // Horizontal Divider (---)
            if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
                elements.push(
                    <hr key={`hr-${lineIdx}`} className="my-3.5 border-t border-slate-200" />
                );
                return;
            }

            // Ignore lone/orphaned hashtags with no title text
            if (/^#{1,6}$/.test(trimmed)) {
                return;
            }

            // Headings (#, ##, ###)
            const headingMatch = trimmed.match(/^(#{1,6})\s*(.+)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const headingText = headingMatch[2].trim();

                if (level === 1) {
                    elements.push(
                        <h1 key={`h1-${lineIdx}`} className="text-xl sm:text-2xl font-black text-slate-900 mt-4 mb-2">
                            {formatInline(headingText)}
                        </h1>
                    );
                    return;
                }
                if (level === 2) {
                    elements.push(
                        <h2 key={`h2-${lineIdx}`} className="text-lg sm:text-xl font-bold text-slate-900 mt-4 mb-2 pb-1 border-b border-emerald-100 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0 inline-block" />
                            <span>{formatInline(headingText)}</span>
                        </h2>
                    );
                    return;
                }
                elements.push(
                    <h3 key={`h3-${lineIdx}`} className="text-base sm:text-lg font-bold text-emerald-900 mt-3 mb-1">
                        {formatInline(headingText)}
                    </h3>
                );
                return;
            }

            // Bullet lists (- or * or •)
            if (/^[-*•]\s+/.test(trimmed)) {
                elements.push(
                    <div key={`li-${lineIdx}`} className="flex items-start gap-2 mr-2 my-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-2 shrink-0" />
                        <span className="text-slate-800 text-sm sm:text-base leading-relaxed">
                            {formatInline(trimmed.replace(/^[-*•]\s+/, ""))}
                        </span>
                    </div>
                );
                return;
            }

            // Numbered list (1. ...)
            const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
            if (numMatch) {
                elements.push(
                    <div key={`num-${lineIdx}`} className="flex items-start gap-2 mr-1 my-1">
                        <span className="font-bold text-emerald-700 text-sm sm:text-base shrink-0 min-w-5">
                            {numMatch[1]}.
                        </span>
                        <span className="text-slate-800 text-sm sm:text-base leading-relaxed">
                            {formatInline(numMatch[2])}
                        </span>
                    </div>
                );
                return;
            }

            // Regular paragraph
            elements.push(
                <p key={`p-${lineIdx}`} className="text-slate-800 text-sm sm:text-base leading-relaxed my-1">
                    {formatInline(trimmed)}
                </p>
            );
        });

        return elements;
    }, [content]);

    return <div className="space-y-1 text-right">{rendered}</div>;
}

/**
 * Inline formatting for **bold**, `code`, and #hashtags
 */
function formatInline(text: string): React.ReactNode[] {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);

    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return (
                <strong key={i} className="font-bold text-slate-950">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return (
                <code key={i} className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-xs sm:text-sm font-mono border border-emerald-200">
                    {part.slice(1, -1)}
                </code>
            );
        }
        return part;
    });
}

export default function FarmerChat() {
    const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Chat Session Title Editing State
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitleText, setEditTitleText] = useState("");
    const [isSavingTitle, setIsSavingTitle] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    const [inputText, setInputText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
    const [loadingSpeechId, setLoadingSpeechId] = useState<string | null>(null);
    const [ttsSupported, setTtsSupported] = useState(false);

    // Scroll-to-bottom visibility
    const [showScrollButton, setShowScrollButton] = useState(false);

    // Image attachment state
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Stores the last failed request so we can retry it
    const [failedPayload, setFailedPayload] = useState<FailedPayload | null>(null);

    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        isRecording,
        transcribing,
        error: recorderError,
        hasMic,
        startRecording,
        stopRecording,
    } = useAudioRecorder();

    useEffect(() => {
        setTtsSupported(isTtsSupported());
        return () => {
            stopSpeaking();
        };
    }, []);

    // ── Load Sessions List ──────────────────────────────────────────────────
    const loadSessions = useCallback(async () => {
        try {
            const res = await fetch("/api/crop-chat?action=sessions");
            if (res.ok) {
                const data = await res.json();
                if (data.sessions) {
                    setSessions(data.sessions);
                }
            }
        } catch (err) {
            console.warn("Failed to load sessions:", err);
        }
    }, []);

    // ── Load Messages for a specific Session ────────────────────────────────
    const loadSessionMessages = useCallback(async (sessionId?: string | null) => {
        setIsLoadingHistory(true);
        try {
            const url = sessionId ? `/api/crop-chat?session_id=${sessionId}` : "/api/crop-chat";
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    setMessages(data.messages.map((m: any) => ({
                        id: m.id || String(Math.random()),
                        session_id: m.session_id,
                        role: m.role,
                        content: m.content,
                        timestamp: new Date(m.created_at || Date.now()),
                        imagePreview: m.imageBase64,
                    })));
                    if (data.session_id) {
                        setCurrentSessionId(data.session_id);
                    }
                } else if (sessionId) {
                    setMessages([WELCOME_MESSAGE]);
                }
            }
        } catch (err) {
            console.warn("Failed to load messages:", err);
        } finally {
            setIsLoadingHistory(false);
        }
    }, []);

    // Initial Load: Sessions & Latest History
    useEffect(() => {
        loadSessions();
        loadSessionMessages();
    }, [loadSessions, loadSessionMessages]);

    // Handle scroll to check if user is away from bottom
    const handleScroll = () => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setShowScrollButton(distanceFromBottom > 200);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Scroll to bottom on new messages
    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    // Auto-resize textarea whenever inputText changes
    const autoResize = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }, []);

    useEffect(() => {
        autoResize();
    }, [inputText, autoResize]);

    // ── iOS / Safari Virtual Keyboard Fix ────────────────────────────────────
    // On iOS Safari, interactive-widget=resizes-content isn't fully supported.
    // We use the visualViewport API to detect keyboard open/close and adjust
    // the chat container height so only the input moves, not the whole page.
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const chatRoot = document.getElementById('farmer-chat-root');
        if (!chatRoot) return;

        const onResize = () => {
            // When keyboard is open, vv.height < window.innerHeight
            const keyboardOffset = window.innerHeight - vv.height;
            if (keyboardOffset > 50) {
                // Keyboard is open — shrink the container from the bottom
                chatRoot.style.height = `${vv.height - chatRoot.getBoundingClientRect().top}px`;
                chatRoot.style.transition = 'height 0.15s ease-out';
            } else {
                // Keyboard closed — restore full height
                chatRoot.style.height = '';
                chatRoot.style.transition = '';
            }
            // Prevent any page scroll that iOS might try
            window.scrollTo(0, 0);
        };

        vv.addEventListener('resize', onResize);
        vv.addEventListener('scroll', () => window.scrollTo(0, 0));

        return () => {
            vv.removeEventListener('resize', onResize);
            if (chatRoot) {
                chatRoot.style.height = '';
                chatRoot.style.transition = '';
            }
        };
    }, []);

    // ── Start New Chat Session ──────────────────────────────────────────────
    const startNewChat = () => {
        setCurrentSessionId(null);
        setMessages([WELCOME_MESSAGE]);
        setIsSidebarOpen(false);
        setError(null);
        setAttachedImage(null);
        setIsEditingTitle(false);
        setEditTitleText("");
    };

    // ── Select Past Session ─────────────────────────────────────────────────
    const selectSession = (sessionId: string) => {
        setIsEditingTitle(false);
        setEditTitleText("");
        if (sessionId === currentSessionId) {
            setIsSidebarOpen(false);
            return;
        }
        setCurrentSessionId(sessionId);
        loadSessionMessages(sessionId);
        setIsSidebarOpen(false);
    };

    // ── Chat Session Title Editing Handlers ─────────────────────────────────
    const startEditingTitle = () => {
        setEditTitleText(currentSessionTitle);
        setIsEditingTitle(true);
        setTimeout(() => {
            titleInputRef.current?.focus();
            titleInputRef.current?.select();
        }, 50);
    };

    const saveTitle = async () => {
        if (!editTitleText.trim()) {
            setIsEditingTitle(false);
            return;
        }
        const newTitle = editTitleText.trim().slice(0, 100);
        setIsEditingTitle(false);

        if (currentSessionId) {
            setIsSavingTitle(true);
            // Optimistic update
            setSessions((prev) =>
                prev.map((s) => (s.id === currentSessionId ? { ...s, title: newTitle } : s))
            );
            try {
                await fetch("/api/crop-chat", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        session_id: currentSessionId,
                        title: newTitle,
                    }),
                });
            } catch (err) {
                console.error("Failed to save title:", err);
            } finally {
                setIsSavingTitle(false);
            }
        }
    };

    const cancelEditingTitle = () => {
        setIsEditingTitle(false);
        setEditTitleText("");
    };

    // ── Delete a Session ────────────────────────────────────────────────────
    const deleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (!confirm("هل تريد بالتأكيد حذف هذه المحادثة؟")) return;

        try {
            const res = await fetch(`/api/crop-chat?session_id=${sessionId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                setSessions((prev) => prev.filter((s) => s.id !== sessionId));
                if (currentSessionId === sessionId) {
                    startNewChat();
                }
            }
        } catch (err) {
            console.error("Failed to delete session:", err);
        }
    };

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

    // Handle image file selection
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setAttachedImage(ev.target?.result as string);
        };
        reader.readAsDataURL(file);
        if (cameraInputRef.current) cameraInputRef.current.value = "";
        if (galleryInputRef.current) galleryInputRef.current.value = "";
    };

    // Core API call
    const callChatApi = async (payload: FailedPayload) => {
        setIsLoading(true);
        setError(null);
        setFailedPayload(null);

        try {
            const res = await fetch("/api/crop-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    session_id: currentSessionId,
                }),
            });

            let data: any = null;
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                try {
                    data = await res.json();
                } catch {
                    data = null;
                }
            }

            if (res.status === 401) {
                setError("انتهت جلستك، يرجى تسجيل الدخول مجدداً.");
                setFailedPayload(null);
            } else if (!res.ok || !data || data.error) {
                const errorMsg =
                    data?.error ||
                    (res.status >= 500
                        ? "تعذر الاتصال بخدمة المرشد الزراعي حالياً، يرجى المحاولة مرة أخرى."
                        : "عذراً، حدث خطأ في معالجة طلبك.");
                setError(errorMsg);
                setFailedPayload(payload);
            } else if (data.success && data.text) {
                if (data.session_id && data.session_id !== currentSessionId) {
                    setCurrentSessionId(data.session_id);
                    loadSessions();
                }

                const modelMsg: Message = {
                    id: `msg-${Date.now()}-model`,
                    session_id: data.session_id || currentSessionId || undefined,
                    role: "model",
                    content: data.text,
                    timestamp: new Date(),
                    recommendedProduct: data.recommendedProduct || undefined,
                    sources: data.sources || undefined,
                };
                setMessages((prev) => [...prev, modelMsg]);

                if (isTtsSupported()) {
                    handleSpeak(modelMsg.content, modelMsg.id);
                }
            } else {
                setError("عذراً، حدث خطأ غير متوقع في استلام الرد.");
                setFailedPayload(payload);
            }
        } catch (err) {
            const isNetworkError =
                err instanceof TypeError &&
                (err.message.toLowerCase().includes("fetch") ||
                    err.message.toLowerCase().includes("network") ||
                    err.message.toLowerCase().includes("failed to fetch"));

            if (isNetworkError) {
                setError("__network__");
            } else {
                console.error("[chat] error sending message:", err);
                setError("عذراً، حدث خطأ غير متوقع. حاول مرة أخرى.");
            }
            setFailedPayload(payload);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async (textToSend?: string) => {
        const text = (textToSend || inputText).trim();
        if ((!text && !attachedImage) || isLoading) return;

        let compressedImage: string | undefined = undefined;
        if (attachedImage) {
            try {
                compressedImage = await compressImage(attachedImage);
            } catch {
                compressedImage = attachedImage;
            }
        }

        const imagePreview = attachedImage || undefined;
        setInputText("");
        setAttachedImage(null);

        const userMsg: Message = {
            id: `msg-${Date.now()}-user`,
            session_id: currentSessionId || undefined,
            role: "user",
            content: text || "📷",
            timestamp: new Date(),
            imagePreview,
        };

        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);

        const historyPayload = nextMessages
            .filter((m) => m.id !== "welcome" && m.id !== userMsg.id)
            .map((m) => ({
                role: m.role,
                content: m.content,
                imageBase64: m.imagePreview,
            }));

        const payload: FailedPayload = {
            message: text || "صف هذه الصورة الزراعية وحللها بدقة وقدم التوصيات المناسبة.",
            session_id: currentSessionId,
            history: historyPayload,
            imageBase64: compressedImage,
        };

        await callChatApi(payload);
    };

    const handleRetry = () => {
        if (!failedPayload) return;
        callChatApi(failedPayload);
    };

    const handleMicClick = async () => {
        if (isRecording) {
            await stopRecording((transcript) => {
                setInputText((prev) => (prev ? prev + " " + transcript : transcript));
            });
        } else {
            await startRecording();
        }
    };

    const handleSpeak = (text: string, msgId: string) => {
        if (activeSpeechId === msgId || loadingSpeechId === msgId) {
            stopSpeaking();
            setActiveSpeechId(null);
            setLoadingSpeechId(null);
            return;
        }

        stopSpeaking();
        setActiveSpeechId(null);
        setLoadingSpeechId(null);
        setLoadingSpeechId(msgId);

        speakArabic(
            text,
            () => {},
            () => {
                setLoadingSpeechId(null);
                setActiveSpeechId(msgId);
            },
            () => {
                setActiveSpeechId(null);
                setLoadingSpeechId(null);
            }
        );
    };

    // Find current active session title for the header
    const currentSessionTitle = useMemo(() => {
        if (!currentSessionId) return "استشارة جديدة";
        const found = sessions.find((s) => s.id === currentSessionId);
        return found?.title || "استشارة زراعية";
    }, [currentSessionId, sessions]);

    return (
        <div id="farmer-chat-root" className="relative flex-1 min-h-0 flex flex-col w-full bg-slate-50/40 rounded-2xl overflow-hidden">
            {/* ── Sliding Right Sidebar Drawer ────── */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <div
                className={`fixed top-0 right-0 h-full w-80 max-w-[85vw] bg-white border-l border-slate-200 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
                    isSidebarOpen ? "translate-x-0" : "translate-x-full"
                }`}
            >
                {/* Sidebar Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-2 text-slate-800">
                        <MessageSquare className="w-5 h-5 text-emerald-600" />
                        <h3 className="font-bold text-sm">سجل المحادثات</h3>
                        {sessions.length > 0 && (
                            <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                {sessions.length}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200/60 transition-colors"
                        title="إغلاق القائمة"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* New Chat Button in Sidebar */}
                <div className="p-3 bg-white border-b border-slate-100">
                    <button
                        onClick={startNewChat}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-xs active:scale-[0.98]"
                    >
                        <Plus className="w-4 h-4" />
                        <span>محادثة جديدة</span>
                    </button>
                </div>

                {/* Sessions List */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-400 px-2 pb-1">سجل آخر 7 أيام</p>
                    {sessions.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 text-xs flex flex-col items-center gap-2">
                            <MessageSquare className="w-8 h-8 opacity-30 text-slate-400" />
                            <span>لا توجد محادثات سابقة مسجلة</span>
                            <span className="text-[10px] text-slate-400">ابدأ استشارتك الأولى الآن</span>
                        </div>
                    ) : (
                        sessions.map((sess) => {
                            const isCurrent = sess.id === currentSessionId;
                            return (
                                <div
                                    key={sess.id}
                                    onClick={() => selectSession(sess.id)}
                                    className={`group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all border ${
                                        isCurrent
                                            ? "bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs font-bold"
                                            : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200/80 hover:border-slate-300"
                                    }`}
                                >
                                    <div className="flex items-start gap-2.5 flex-1 min-w-0 pr-1 text-right">
                                        <MessageSquare
                                            className={`w-4 h-4 shrink-0 mt-0.5 ${
                                                isCurrent ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600"
                                            }`}
                                        />
                                        <div className="truncate flex-1">
                                            <p className="text-xs truncate leading-snug">
                                                {sess.title || "استشارة زراعية"}
                                            </p>
                                            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-1 font-normal">
                                                <Clock className="w-3 h-3" />
                                                {new Date(sess.updated_at).toLocaleDateString("ar-EG", {
                                                    weekday: "short",
                                                    month: "numeric",
                                                    day: "numeric",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => deleteSession(e, sess.id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                                        title="حذف المحادثة"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Top Floating Controls (100% Transparent Row, Only Buttons are Floating Glass Pills) ─── */}
            <div className="absolute top-3.5 right-3.5 left-3.5 sm:top-4 sm:right-4 sm:left-4 z-20 flex items-center justify-between pointer-events-none transition-all">
                {/* Right-aligned in RTL: Door / Sidebar + Plus (New Chat) + Title + Pencil */}
                <div className="flex items-center gap-2 min-w-0 flex-1 pointer-events-auto">
                    {/* 1. Sidebar Toggle (Door / Drawer icon) */}
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 text-slate-700 hover:text-emerald-700 bg-white/80 hover:bg-white border border-slate-200/80 shadow-xs rounded-xl backdrop-blur-md transition-all active:scale-95 shrink-0"
                        title="سجل المحادثات السابقة"
                    >
                        <PanelRightOpen className="w-5 h-5 text-emerald-700" />
                    </button>

                    {/* 2. Quick New Chat (+) */}
                    <button
                        onClick={startNewChat}
                        className="p-2 text-slate-700 hover:text-emerald-700 bg-white/80 hover:bg-white border border-slate-200/80 shadow-xs rounded-xl backdrop-blur-md transition-all active:scale-95 shrink-0"
                        title="محادثة جديدة"
                    >
                        <Plus className="w-5 h-5 text-slate-700 hover:text-emerald-700" />
                    </button>

                    {/* 3 & 4. Session Title & Inline Edit */}
                    {isEditingTitle ? (
                        <div className="flex items-center gap-1.5 min-w-0 bg-white/95 backdrop-blur-md p-1 rounded-xl border border-emerald-400 shadow-sm">
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={editTitleText}
                                onChange={(e) => setEditTitleText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") saveTitle();
                                    if (e.key === "Escape") cancelEditingTitle();
                                }}
                                className="bg-transparent px-2 py-0.5 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none max-w-[180px] sm:max-w-xs"
                                placeholder="عنوان المحادثة..."
                                maxLength={80}
                            />
                            <button
                                onClick={saveTitle}
                                disabled={isSavingTitle}
                                className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="حفظ"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                            <button
                                onClick={cancelEditingTitle}
                                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="إلغاء"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 min-w-0 max-w-[calc(100%-90px)] bg-white/80 hover:bg-white backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-xs transition-all">
                            <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                                {currentSessionTitle}
                            </span>
                            <button
                                onClick={startEditingTitle}
                                className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all active:scale-95 shrink-0"
                                title="تعديل عنوان المحادثة"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Main Conversation Stream (Edge-to-Edge Free Flow Layout) ─── */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-4 scrollbar-thin scrollbar-thumb-slate-300 overscroll-contain"
            >
                <div className="max-w-4xl xl:max-w-5xl mx-auto space-y-6">
                    {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-48 text-slate-500 text-sm gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                            <span>جاري استرجاع المحادثة...</span>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div key={msg.id} className="w-full flex flex-col">
                                {msg.role === "user" ? (
                                    /* User Bubble (Right Aligned in RTL, sleek dark pill like screenshot) */
                                    <div className="self-end max-w-[90%] sm:max-w-[80%] space-y-1.5 mb-2">
                                        {msg.imagePreview && (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={msg.imagePreview}
                                                alt="صورة مرفقة"
                                                className="w-56 h-44 object-cover rounded-2xl border border-slate-300 shadow-sm ml-auto mb-1"
                                            />
                                        )}
                                        <div className="bg-slate-800 text-white rounded-3xl rounded-tr-sm px-5 py-3.5 text-sm sm:text-base leading-relaxed shadow-sm text-right">
                                            <p className="whitespace-pre-line">{msg.content}</p>
                                        </div>
                                    </div>
                                ) : (
                                    /* Assistant AI Message (Open Stream, No enclosing box, Rich Markdown) */
                                    <div className="w-full text-right py-2 space-y-3">
                                        <div className="flex items-center gap-2 mb-1 text-xs font-bold text-emerald-800">
                                            <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-xs text-emerald-800">
                                                🌿
                                            </div>
                                            <span>طبيب المحاصيل الذكي</span>
                                        </div>

                                        {/* Rich Formatted Markdown Content */}
                                        <div className="pr-1 text-slate-800">
                                            <MarkdownMessage content={msg.content} />
                                        </div>

                                        {/* Product Recommendation Card */}
                                        {msg.recommendedProduct && (
                                            <div className="mt-4 pt-2">
                                                <ProductRecommendationCard product={msg.recommendedProduct} userRole="farmer" />
                                            </div>
                                        )}

                                        {/* Web Search Sources */}
                                        {msg.sources && msg.sources.length > 0 && (
                                            <div className="mt-3 pt-2.5 border-t border-slate-200/80 text-xs">
                                                <div className="flex items-center gap-1 text-emerald-800 font-bold mb-1.5">
                                                    <Globe className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                    <span>مصادر ومراجع الويب:</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {msg.sources.map((source, idx) => (
                                                        <a
                                                            key={idx}
                                                            href={source.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 text-[11px] px-2.5 py-1 rounded-lg transition-colors max-w-full truncate shadow-2xs"
                                                            title={source.url}
                                                        >
                                                            <span className="truncate max-w-[200px]">{source.title}</span>
                                                            <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Audio Speaker Button */}
                                        {ttsSupported && msg.content && (
                                            <div className="pt-1 flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSpeak(msg.content, msg.id)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                                        loadingSpeechId === msg.id || activeSpeechId === msg.id
                                                            ? "bg-emerald-600 text-white border-emerald-500"
                                                            : "bg-white text-slate-600 hover:text-emerald-700 border-slate-200 hover:bg-slate-50"
                                                    }`}
                                                    title="استماع صوتي للإجابة"
                                                >
                                                    {loadingSpeechId === msg.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : activeSpeechId === msg.id ? (
                                                        <VolumeX className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <Volume2 className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>
                                                        {loadingSpeechId === msg.id
                                                            ? "جاري التحميل..."
                                                            : activeSpeechId === msg.id
                                                            ? "إيقاف الصوت"
                                                            : "استمع للإجابة"}
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Loading Indicator */}
                    {isLoading && (
                        <div className="w-full text-right py-2 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-xs text-emerald-800">
                                    🌿
                                </div>
                                <span>طبيب المحاصيل الذكي</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-slate-500 text-sm py-2">
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                                <span>جاري فحص السؤال وتحضير الإجابة بدقة...</span>
                            </div>
                        </div>
                    )}

                    {/* Audio transcribing indicator */}
                    {transcribing && (
                        <div className="self-end max-w-[80%] bg-slate-100 border border-slate-200 rounded-2xl p-3 text-sm text-slate-700 flex items-center gap-2 shadow-2xs">
                            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                            <span>جاري تحويل صوتك لنص...</span>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* ── Scroll to Bottom Floating Button (↓) ─── */}
            {showScrollButton && (
                <button
                    onClick={scrollToBottom}
                    className="absolute bottom-28 left-1/2 -translate-x-1/2 p-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-full shadow-lg transition-all active:scale-95 z-20"
                    title="النزول لأسفل المحادثة"
                >
                    <ArrowDown className="w-4 h-4" />
                </button>
            )}

            {/* ── Floating / Fixed Bottom Input Area ─── */}
            <div className="w-full px-2 sm:px-6 pb-2 pt-1 shrink-0 bg-transparent overscroll-contain">
                <div className="max-w-4xl xl:max-w-5xl mx-auto space-y-2">
                    {/* Error Box */}
                    {(error || recorderError) && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-red-600 text-xs">
                            <div className="flex items-center gap-2">
                                {error === "__network__" ? (
                                    <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                )}
                                <span>
                                    {error === "__network__"
                                        ? "مشكلة في الاتصال بالإنترنت، يرجى المحاولة ثانية"
                                        : (error || recorderError)}
                                </span>
                            </div>
                            {failedPayload && (
                                <button
                                    onClick={handleRetry}
                                    className="flex items-center gap-1 font-bold text-red-700 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    إعادة المحاولة
                                </button>
                            )}
                        </div>
                    )}

                    {/* Attached Image Preview */}
                    {attachedImage && (
                        <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-2 shadow-2xs">
                            <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={attachedImage}
                                    alt="معاينة الصورة"
                                    className="w-14 h-12 object-cover rounded-xl border border-emerald-500"
                                />
                                <button
                                    onClick={() => setAttachedImage(null)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-xs text-xs"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                            <span className="text-slate-700 text-xs font-medium">
                                صورة المحصول جاهزة للفحص والتحليل
                            </span>
                        </div>
                    )}

                    {/* Main Input Box (Rounded & Modern like ChatGPT/Claude) */}
                    <div className="bg-white border border-slate-200/90 rounded-3xl p-2 sm:p-2.5 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                        <textarea
                            ref={textareaRef}
                            rows={1}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            disabled={isLoading || transcribing}
                            placeholder={
                                isRecording
                                    ? "🎙️ جاري تسجيل صوتك الآن..."
                                    : transcribing
                                    ? "⏳ جاري تحويل الصوت إلى نص..."
                                    : attachedImage
                                    ? "اكتب تفاصيل أو استفسار عن الصورة..."
                                    : "اكتب استشارتك الزراعية أو اسأل بصوتك..."
                            }
                            className="w-full bg-transparent text-slate-900 placeholder-slate-400 py-1.5 px-3 text-sm sm:text-base outline-none resize-none overflow-y-auto leading-relaxed"
                            style={{ minHeight: "44px", maxHeight: "160px" }}
                            onFocus={() => {
                                // Prevent mobile browsers from scrolling the document window
                                window.scrollTo(0, 0);
                                document.body.scrollTop = 0;
                                setTimeout(() => {
                                    window.scrollTo(0, 0);
                                    document.body.scrollTop = 0;
                                }, 50);
                                setTimeout(() => {
                                    window.scrollTo(0, 0);
                                    document.body.scrollTop = 0;
                                }, 150);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />

                        {/* Input Footer: Camera, Gallery, Mic + Send Button */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            {/* Media Controls */}
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => cameraInputRef.current?.click()}
                                    disabled={isLoading || transcribing}
                                    className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors"
                                    title="تصوير بالكاميرا"
                                >
                                    <Camera className="w-4 h-4" />
                                </button>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    ref={cameraInputRef}
                                    onChange={handleImageSelect}
                                    className="hidden"
                                />

                                <button
                                    type="button"
                                    onClick={() => galleryInputRef.current?.click()}
                                    disabled={isLoading || transcribing}
                                    className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-xl transition-colors"
                                    title="اختيار صورة"
                                >
                                    <FolderOpen className="w-4 h-4" />
                                </button>
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={galleryInputRef}
                                    onChange={handleImageSelect}
                                    className="hidden"
                                />

                                {hasMic && (
                                    <button
                                        type="button"
                                        onClick={handleMicClick}
                                        disabled={isLoading || transcribing}
                                        className={`p-2 rounded-xl transition-colors ${
                                            isRecording
                                                ? "bg-red-500 text-white animate-pulse"
                                                : "text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                                        }`}
                                        title={isRecording ? "إيقاف التسجيل" : "تسجيل صوتي"}
                                    >
                                        {isRecording ? (
                                            <Square className="w-4 h-4 fill-current" />
                                        ) : (
                                            <Mic className="w-4 h-4" />
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Send Button */}
                            <button
                                type="button"
                                onClick={() => handleSend()}
                                disabled={isLoading || transcribing || (!inputText.trim() && !attachedImage)}
                                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl transition-all active:scale-95 shadow-xs"
                                title="إرسال"
                            >
                                <Send className="w-4 h-4 rotate-180" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
