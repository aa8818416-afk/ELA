import { NextResponse } from "next/server";
import { EdgeTTS } from "edge-tts-universal";

/**
 * POST /api/text-to-speech
 * Accepts: { text: string, voice?: string }
 * Returns: MP3 audio stream using edge-tts-universal
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { text, voice = "ar-EG-SalmaNeural" } = body as {
            text: string;
            voice?: string;
        };

        if (!text) {
            return NextResponse.json({ error: "لم يتم إرسال النص" }, { status: 400 });
        }

        console.log(`[tts] Generating speech via edge-tts-universal: "${text.substring(0, 50)}..." using voice ${voice}`);

        // Initialize EdgeTTS directly with text and voice parameters
        const tts = new EdgeTTS(text, voice);
        
        // Synthesize the text to audio
        const result = await tts.synthesize();

        // Convert the audio response blob into an ArrayBuffer and then a Buffer
        const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.length.toString(),
            },
        });
    } catch (error) {
        console.error("[tts] TTS Error:", error);
        return NextResponse.json(
            { error: "فشل تحويل النص إلى كلام" },
            { status: 500 }
        );
    }
}
