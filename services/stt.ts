// Primary: Groq Whisper API (fast, accurate)
export async function transcribeAudio(fileUri: string): Promise<string> {
  console.log("[STT] Starting transcription pipeline...");
  const startTime = Date.now();

  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    console.error("[STT] GROQ_API_KEY not set!");
    throw new Error("GROQ_API_KEY not set");
  }

  console.log("[STT] Sending to Groq API...");

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: "audio/wav",
    name: "recording.wav",
  } as any);
  formData.append("model", "whisper-large-v3-turbo");

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
    console.error(`[STT] API error (${response.status}):`, error);
    throw new Error(`STT failed: ${error}`);
  }

  const result = await response.json();
  console.log(`[STT] SUCCESS in ${Date.now() - startTime}ms`);
  console.log(`[STT] Result: "${result.text}"`);
  return result.text;
}

