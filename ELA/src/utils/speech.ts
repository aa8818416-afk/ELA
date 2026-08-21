"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Custom hook for recording audio from browser microphone using MediaRecorder API.
 * Transcribes the audio using ELA's Groq Whisper API endpoint (/api/speech-to-text).
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMic, setHasMic] = useState(true); // Default to true, verify on mount
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Check if any audio input device exists on mount
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setHasMic(false);
      return;
    }

    navigator.mediaDevices.enumerateDevices()
      .then((devices) => {
        const hasAudioInput = devices.some(device => device.kind === "audioinput");
        setHasMic(hasAudioInput);
      })
      .catch((err) => {
        console.warn("[recorder] Failed to enumerate devices:", err);
        setHasMic(false);
      });
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    audioChunksRef.current = [];

    if (typeof window === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("متصفحك لا يدعم تسجيل الصوت أو يحتاج إلى اتصال آمن (HTTPS).");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(200); // chunk every 200ms
      setIsRecording(true);
    } catch (err: any) {
      console.error("[recorder] getUserMedia failed:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("تم رفض الوصول للميكروفون. يرجى تفعيله من إعدادات المتصفح.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("لم يتم العثور على ميكروفون متصل بجهازك.");
        setHasMic(false);
      } else {
        setError("تعذر الوصول إلى الميكروفون. تأكد أنه متصل.");
      }
    }
  }, []);

  const stopRecording = useCallback(async (onTranscript: (text: string) => void) => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") return;

    return new Promise<void>((resolve) => {
      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        setTranscribing(true);

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          
          // Stop all audio tracks from stream to release the mic icon
          mediaRecorder.stream.getTracks().forEach((track) => track.stop());

          if (audioBlob.size < 1000) {
            setError("لم يتم التقاط صوت واضح. تحدث بوضوح.");
            setTranscribing(false);
            resolve();
            return;
          }

          // Upload audio blob to our speech-to-text API
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const res = await fetch("/api/speech-to-text", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();

          if (!res.ok || data.error) {
            setError(data.error || "فشل تحويل الصوت إلى نص");
          } else if (data.success && data.text) {
            onTranscript(data.text);
          }
        } catch (err) {
          console.error("[recorder] transcription request failed:", err);
          setError("تعذر الاتصال بخادم تحويل الصوت. تأكد من الإنترنت.");
        } finally {
          setTranscribing(false);
          resolve();
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  return {
    isRecording,
    transcribing,
    error,
    hasMic,
    startRecording,
    stopRecording,
    clearError: () => setError(null),
  };
}

// Global active audio to ensure only one audio plays at a time
let globalTtsAudio: HTMLAudioElement | null = null;
// Abort controller for any in-flight TTS fetch — cancelled when stopSpeaking() is called
let globalTtsAbortController: AbortController | null = null;

/**
 * Strips markdown, emojis, horizontal dividers, and special formatting markers so that Edge-TTS speaks natural, fluent Arabic.
 */
export function stripMarkdownForTts(text: string): string {
  if (!text) return "";

  return text
    // 1. Remove recommendation system tags like [RECOMMEND_PRODUCT:xyz]
    .replace(/\[RECOMMEND_PRODUCT:[^\]]+\]/gi, "")
    // 2. Remove markdown links [Title](url) -> Title
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // 3. Remove horizontal dividers (---, ___, ***) and repeated hyphens/dashes
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    .replace(/[-–—]{2,}/g, " ")
    // 4. Remove emojis and pictographs so TTS doesn't say "علامة تحذير" or "سنبلة"
    .replace(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, "")
    // 5. Remove header markers (# Title, ## Title, ### Title) -> Title
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/#{1,6}\s+/g, " ")
    // 6. Remove bold & italic (**text**, *text*, __text__, _text_) -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // 7. Remove inline code (`code`) -> code
    .replace(/`([^`]+)`/g, "$1")
    // 8. Convert bullet lists (- item, * item, • item) -> item
    .replace(/^[-*•]\s+/gm, "")
    // 9. Remove blockquotes (> text) -> text
    .replace(/^>\s+/gm, "")
    // 10. Clean up stray markdown symbols (#, *, _, ~, `, |, ^)
    .replace(/[#*_~`|^]/g, "")
    // 11. Normalize multiple line breaks to full stop + pause
    .replace(/\n{2,}/g, ".\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Text-to-Speech: Converts text to Egyptian Neural voice (ar-EG-SalmaNeural)
 * using ELA's Edge-TTS Next.js API endpoint (/api/text-to-speech).
 */
export async function speakArabic(
  text: string,
  onLoading?: () => void,
  onStart?: () => void,
  onEnd?: () => void,
  voice?: string
): Promise<void> {
  if (typeof window === "undefined") return;

  const sanitizedText = stripMarkdownForTts(text);
  if (!sanitizedText) {
    onEnd?.();
    return;
  }

  try {
    // Cancel any previous in-flight fetch + stop any playing audio
    stopSpeaking();

    // Create a new abort controller for this request
    const abortController = new AbortController();
    globalTtsAbortController = abortController;

    // Signal: loading has started (fetching audio from server)
    onLoading?.();

    const response = await fetch("/api/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: sanitizedText,
        ...(voice ? { voice } : {}),
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error("TTS generation failed");
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    globalTtsAudio = audio;

    let hasStarted = false;
    const handleStart = () => {
      if (!hasStarted) {
        hasStarted = true;
        onStart?.();
      }
    };

    audio.onplay = handleStart;
    audio.onplaying = handleStart;

    audio.onended = () => {
      onEnd?.();
      URL.revokeObjectURL(audioUrl);
    };

    audio.onerror = () => {
      onEnd?.();
      URL.revokeObjectURL(audioUrl);
    };

    // Some browsers (especially mobile) throw on autoplay even if audio plays
    await audio.play().catch(() => {
      // Only signal failure if audio is truly not playing
      if (audio.paused) {
        onEnd?.();
      }
      // If audio is not paused, it's playing — let onplay/onplaying/onended handle state
    });
  } catch (error) {
    // AbortError = intentionally cancelled by stopSpeaking() — not a real error
    if (error instanceof DOMException && error.name === "AbortError") {
      return;
    }
    console.error("[tts] speakArabic failed:", error);
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  // Cancel any in-flight TTS fetch first
  if (globalTtsAbortController) {
    globalTtsAbortController.abort();
    globalTtsAbortController = null;
  }
  // Stop any currently playing audio
  if (globalTtsAudio) {
    try {
      globalTtsAudio.pause();
      globalTtsAudio.currentTime = 0;
    } catch (e) {
      // ignore
    }
    globalTtsAudio = null;
  }
}

export function isTtsSupported(): boolean {
  // Edge-TTS API is fully supported on all modern devices since it works over standard HTMLAudioElement
  return typeof window !== "undefined" && typeof Audio !== "undefined";
}
