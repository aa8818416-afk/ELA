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

/**
 * Text-to-Speech: Converts text to Egyptian Neural voice (ar-EG-SalmaNeural)
 * using ELA's Edge-TTS Next.js API endpoint (/api/text-to-speech).
 */
export async function speakArabic(text: string, onStart?: () => void, onEnd?: () => void): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    stopSpeaking();
    onStart?.();

    const response = await fetch("/api/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: "ar-EG-SalmaNeural", // Egyptian Neural Voice (Female)
      }),
    });

    if (!response.ok) {
      throw new Error("TTS generation failed");
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    globalTtsAudio = audio;

    audio.onended = () => {
      onEnd?.();
      URL.revokeObjectURL(audioUrl);
    };

    audio.onerror = () => {
      onEnd?.();
      URL.revokeObjectURL(audioUrl);
    };

    await audio.play();
  } catch (error) {
    console.error("[tts] speakArabic failed:", error);
    onEnd?.();
  }
}

export function stopSpeaking(): void {
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
