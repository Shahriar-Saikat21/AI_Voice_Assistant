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
  console.log("[LLM] Starting non-streaming completion...");
  const startTime = Date.now();
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
    console.error(`[LLM] API error (${response.status}):`, error);
    throw new Error(`LLM failed: ${error}`);
  }

  const result = await response.json();
  const content = result.choices[0].message.content;
  console.log(`[LLM] Completion done in ${Date.now() - startTime}ms`);
  console.log(`[LLM] Response: "${content.substring(0, 100)}..."`);
  return content;
}

// Streaming via SSE — yields tokens as they arrive
export async function* chatCompletionStream(
  messages: Message[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  console.log("[LLM] Starting streaming completion...");
  console.log(`[LLM] Model: ${MODEL}`);
  console.log(`[LLM] Messages count: ${messages.length + 1} (incl system)`);
  const startTime = Date.now();

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
    console.error(`[LLM] Stream API error (${response.status}):`, error);
    throw new Error(`LLM stream failed: ${error}`);
  }

  console.log(`[LLM] Stream connected in ${Date.now() - startTime}ms`);
  let tokenCount = 0;
  let firstTokenTime = 0;

  // Use ReadableStream if available (RN 0.83+ with Hermes)
  if (response.body && typeof response.body.getReader === "function") {
    console.log("[LLM] Using ReadableStream reader");
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
          if (data === "[DONE]") {
            console.log(`[LLM] Stream DONE — ${tokenCount} tokens in ${Date.now() - startTime}ms (first token: ${firstTokenTime - startTime}ms)`);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              tokenCount++;
              if (tokenCount === 1) firstTokenTime = Date.now();
              yield content;
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    // Fallback: read entire response and parse
    console.log("[LLM] Using fallback (full text read)");
    const text = await response.text();
    const lines = text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        console.log(`[LLM] Fallback stream DONE — ${tokenCount} tokens in ${Date.now() - startTime}ms`);
        return;
      }
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          tokenCount++;
          yield content;
        }
      } catch {}
    }
  }

  console.log(`[LLM] Stream ended — ${tokenCount} tokens in ${Date.now() - startTime}ms`);
}
