import { chatCompletionStream, type Message } from "../services/llm";
import { generateSpeech } from "../services/tts";
import { AudioQueue } from "./audio";
import { SentenceSplitter } from "./sentenceSplitter";

export class StreamOrchestrator {
  private abortController = new AbortController();
  private audioQueue: AudioQueue;
  private splitter: SentenceSplitter;
  private cancelled = false;

  constructor(
    private onToken: (fullText: string) => void,
    private onComplete: (fullText: string) => void,
    private onError: (error: Error) => void
  ) {
    this.audioQueue = new AudioQueue();
    this.splitter = new SentenceSplitter();
  }

  async run(messages: Message[]) {
    console.log("[Orchestrator] Starting pipeline...");
    const startTime = Date.now();
    let fullText = "";
    let ttsChain = Promise.resolve();
    let sentenceCount = 0;
    const signal = this.abortController.signal;

    const enqueueSentence = (sentence: string) => {
      const idx = ++sentenceCount;
      console.log(`[Orchestrator] Sentence #${idx} queued for TTS: "${sentence.substring(0, 60)}${sentence.length > 60 ? '...' : ''}"`);

      ttsChain = ttsChain.then(async () => {
        if (this.cancelled) return;
        try {
          console.log(`[Orchestrator] TTS processing sentence #${idx}...`);
          const audio = await generateSpeech(sentence);
          if (this.cancelled) return;
          console.log(`[Orchestrator] Enqueueing audio for sentence #${idx}`);
          await this.audioQueue.enqueue(audio);
          console.log(`[Orchestrator] Audio enqueued for sentence #${idx}`);
        } catch (err) {
          console.warn(`[Orchestrator] TTS FAILED for sentence #${idx}, skipping:`, err);
        }
      });
    };

    try {
      // Stream LLM tokens
      console.log("[Orchestrator] Starting LLM stream...");
      const stream = chatCompletionStream(messages, signal);

      for await (const token of stream) {
        if (this.cancelled) break;

        fullText += token;
        this.onToken(fullText);

        // Check for complete sentences
        const sentences = this.splitter.push(token);
        for (const sentence of sentences) {
          enqueueSentence(sentence);
        }
      }

      console.log(`[Orchestrator] LLM stream complete — ${fullText.length} chars`);

      // Flush remaining text
      if (!this.cancelled) {
        const remaining = this.splitter.flush();
        if (remaining) {
          console.log(`[Orchestrator] Flushing remaining text: "${remaining.substring(0, 60)}..."`);
          enqueueSentence(remaining);
        }
      }

      // Wait for all TTS + playback to finish
      console.log("[Orchestrator] Waiting for TTS chain + audio playback...");
      await ttsChain;
      if (!this.cancelled) {
        console.log("[Orchestrator] Waiting for audio queue completion...");
        await this.audioQueue.waitForCompletion();
      }

      if (!this.cancelled) {
        console.log(`[Orchestrator] Pipeline COMPLETE in ${Date.now() - startTime}ms — ${sentenceCount} sentences`);
        this.onComplete(fullText);
      }
    } catch (err: any) {
      if (!this.cancelled && err.name !== "AbortError") {
        console.error("[Orchestrator] Pipeline ERROR:", err.message);
        this.onError(err);
      }
    } finally {
      this.audioQueue.dispose();
      console.log("[Orchestrator] Disposed audio queue");
    }
  }

  cancel() {
    console.log("[Orchestrator] CANCELLED by user");
    this.cancelled = true;
    this.abortController.abort();
    this.audioQueue.stop();
  }
}
