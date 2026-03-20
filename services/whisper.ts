import { initWhisper, WhisperContext } from "whisper.rn";

let whisperContext: WhisperContext | null = null;
let initPromise: Promise<WhisperContext> | null = null;

export async function initLocalWhisper(): Promise<WhisperContext> {
  if (whisperContext) {
    console.log("[Whisper] Already initialized, reusing context");
    return whisperContext;
  }
  if (initPromise) {
    console.log("[Whisper] Init already in progress, waiting...");
    return initPromise;
  }

  console.log("[Whisper] Starting model initialization...");
  const startTime = Date.now();

  initPromise = (async () => {
    const ctx = await initWhisper({
      filePath: require("../assets/models/ggml-tiny.en.bin"),
    });
    whisperContext = ctx;
    console.log(`[Whisper] Model loaded successfully in ${Date.now() - startTime}ms`);
    return ctx;
  })();

  try {
    return await initPromise;
  } catch (err) {
    console.error(`[Whisper] Model load FAILED after ${Date.now() - startTime}ms:`, err);
    initPromise = null;
    throw err;
  }
}

export async function transcribeLocal(fileUri: string): Promise<string> {
  console.log("[Whisper] Starting local transcription...");
  console.log("[Whisper] File URI:", fileUri);
  const startTime = Date.now();

  const ctx = await initLocalWhisper();

  console.log("[Whisper] Context ready, transcribing...");
  const { promise } = ctx.transcribe(fileUri, {
    language: "en",
    maxLen: 1,
    tokenTimestamps: false,
  });

  const { result } = await promise;
  console.log(`[Whisper] Transcription complete in ${Date.now() - startTime}ms`);
  console.log(`[Whisper] Result: "${result}"`);
  return result || "";
}
