import { initWhisper, WhisperContext } from "whisper.rn";
import * as FileSystem from "expo-file-system";

const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin";
const MODEL_DIR = `${FileSystem.documentDirectory}models/`;
const MODEL_PATH = `${MODEL_DIR}ggml-tiny.en.bin`;

let whisperContext: WhisperContext | null = null;
let initPromise: Promise<WhisperContext> | null = null;

async function ensureModelDownloaded(): Promise<string> {
  // Check if model already cached
  const fileInfo = await FileSystem.getInfoAsync(MODEL_PATH);
  if (fileInfo.exists) {
    console.log(`[Whisper] Model already cached (${((fileInfo as any).size / 1024 / 1024).toFixed(1)}MB)`);
    return MODEL_PATH;
  }

  // Create directory
  console.log("[Whisper] Model not found, creating directory...");
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });

  // Download model
  console.log("[Whisper] Downloading model from HuggingFace...");
  const startTime = Date.now();

  const download = FileSystem.createDownloadResumable(
    MODEL_URL,
    MODEL_PATH,
    {},
    (progress) => {
      const pct = (
        (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) *
        100
      ).toFixed(1);
      console.log(
        `[Whisper] Download progress: ${pct}% (${(progress.totalBytesWritten / 1024 / 1024).toFixed(1)}MB)`
      );
    }
  );

  const result = await download.downloadAsync();
  if (!result || result.status !== 200) {
    throw new Error(`Model download failed with status ${result?.status}`);
  }

  console.log(
    `[Whisper] Download complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s`
  );
  return MODEL_PATH;
}

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
    const modelPath = await ensureModelDownloaded();
    console.log("[Whisper] Loading model into whisper.rn...");
    const ctx = await initWhisper({ filePath: modelPath });
    whisperContext = ctx;
    console.log(
      `[Whisper] Model loaded successfully in ${Date.now() - startTime}ms`
    );
    return ctx;
  })();

  try {
    return await initPromise;
  } catch (err) {
    console.error(
      `[Whisper] Model init FAILED after ${Date.now() - startTime}ms:`,
      err
    );
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
  console.log(
    `[Whisper] Transcription complete in ${Date.now() - startTime}ms`
  );
  console.log(`[Whisper] Result: "${result}"`);
  return result || "";
}
