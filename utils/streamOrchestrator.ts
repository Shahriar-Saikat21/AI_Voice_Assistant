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
    let fullText = "";
    let ttsChain = Promise.resolve();
    const signal = this.abortController.signal;

    const enqueueSentence = (sentence: string) => {
      ttsChain = ttsChain.then(async () => {
        if (this.cancelled) return;
        try {
          const audio = await generateSpeech(sentence);
          if (this.cancelled) return;
          await this.audioQueue.enqueue(audio);
        } catch (err) {
          // Skip failed sentence TTS, don't break the pipeline
          console.warn("TTS failed for sentence, skipping:", err);
        }
      });
    };

    try {
      // Stream LLM tokens
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

      // Flush remaining text
      if (!this.cancelled) {
        const remaining = this.splitter.flush();
        if (remaining) {
          enqueueSentence(remaining);
        }
      }

      // Wait for all TTS + playback to finish
      await ttsChain;
      if (!this.cancelled) {
        await this.audioQueue.waitForCompletion();
      }

      if (!this.cancelled) {
        this.onComplete(fullText);
      }
    } catch (err: any) {
      if (!this.cancelled && err.name !== "AbortError") {
        this.onError(err);
      }
    } finally {
      this.audioQueue.dispose();
    }
  }

  cancel() {
    this.cancelled = true;
    this.abortController.abort();
    this.audioQueue.stop();
  }
}
