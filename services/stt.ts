import { transcribeLocal, initLocalWhisper } from "./whisper";

// Primary: Local whisper.cpp (no network, ~0.3-0.8s)
export async function transcribeAudio(fileUri: string): Promise<string> {
  console.log("[STT] Starting transcription pipeline...");
  console.log("[STT] Trying local whisper first...");

  try {
    const result = await transcribeLocal(fileUri);
    console.log("[STT] Local whisper SUCCESS");
    return result;
  } catch (err) {
    console.warn("[STT] Local whisper FAILED:", err);
    console.log("[STT] Falling back to Groq API...");
    return transcribeRemote(fileUri);
  }
}

// Fallback: Groq Whisper API
async function transcribeRemote(fileUri: string): Promise<string> {
  const startTime = Date.now();
  console.log("[STT-Groq] Starting remote transcription...");

  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    console.error("[STT-Groq] GROQ_API_KEY not set!");
    throw new Error("GROQ_API_KEY not set and local STT failed");
  }

  console.log("[STT-Groq] API key found, preparing request...");

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: "audio/wav",
    name: "recording.wav",
  } as any);
  formData.append("model", "whisper-large-v3-turbo");

  console.log("[STT-Groq] Sending to Groq API...");
  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[STT-Groq] API error (${response.status}):`, error);
    throw new Error(`STT failed: ${error}`);
  }

  const result = await response.json();
  console.log(`[STT-Groq] SUCCESS in ${Date.now() - startTime}ms`);
  console.log(`[STT-Groq] Result: "${result.text}"`);
  return result.text;
}

// Pre-initialize whisper on app start
export function preloadWhisper() {
  console.log("[STT] Preloading whisper model...");
  initLocalWhisper()
    .then(() => console.log("[STT] Whisper preload SUCCESS"))
    .catch((err) => console.warn("[STT] Whisper preload FAILED:", err));
}
