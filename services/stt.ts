const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function transcribeAudio(fileUri: string): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set in .env");

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: "audio/wav",
    name: "recording.wav",
  } as any);
  formData.append("model", "whisper-large-v3-turbo");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`STT failed: ${error}`);
  }

  const result = await response.json();
  return result.text;
}
