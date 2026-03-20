const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT: Message = {
  role: "system",
  content:
    "You are Uraan AI, a helpful voice assistant. Keep responses concise and conversational — typically 1-3 sentences. Speak naturally as in a conversation. Do not use markdown, bullet points, or formatting — just plain spoken language.",
};

// Non-streaming (kept for backward compat)
export async function chatCompletion(messages: Message[]): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [SYSTEM_PROMPT, ...messages],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM failed: ${error}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

// Streaming via SSE — yields tokens as they arrive
export async function* chatCompletionStream(
  messages: Message[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const apiKey = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set in .env");

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [SYSTEM_PROMPT, ...messages],
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM stream failed: ${error}`);
  }

  // Use ReadableStream if available (RN 0.83+ with Hermes)
  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    // Fallback: read entire response and parse
    const text = await response.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {}
    }
  }
}
