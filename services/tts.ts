import * as Crypto from "expo-crypto";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split(".")[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

const WSS_BASE =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
const VOICE = "en-US-EmmaMultilingualNeural";

// Windows epoch offset (seconds between 1601-01-01 and 1970-01-01)
const WIN_EPOCH = 11644473600;

function uuid(): string {
  return "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function generateSecMsGec(): Promise<string> {
  // Current time in seconds since Unix epoch
  const now = Math.floor(Date.now() / 1000);
  // Convert to Windows file time (100-nanosecond intervals since 1601-01-01)
  // Round down to nearest 5-minute interval
  const winTime = now + WIN_EPOCH;
  const rounded = winTime - (winTime % 300);
  const ticks = BigInt(rounded) * BigInt(10000000); // 100ns intervals

  // SHA256 of ticks + token
  const input = `${ticks}${TRUSTED_CLIENT_TOKEN}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
  );
  return hash.toUpperCase();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateSpeech(text: string): Promise<ArrayBuffer> {
  const connectionId = uuid();
  const requestId = uuid();
  const secMsGec = await generateSecMsGec();
  const muid = randomHex(16);

  const url =
    `${WSS_BASE}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
    `&ConnectionId=${connectionId}` +
    `&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      url,
      null as any,
      {
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache",
          Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
          "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
          Cookie: `muid=${muid};`,
        },
      } as any,
    );

    ws.binaryType = "arraybuffer";

    const audioChunks: Uint8Array[] = [];
    let done = false;

    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        ws.close();
        reject(new Error("TTS timed out after 30s"));
      }
    }, 30000);

    ws.onopen = () => {
      // Speech config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "true",
                  },
                  outputFormat: OUTPUT_FORMAT,
                },
              },
            },
          }),
      );

      // SSML request
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n` +
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${VOICE}'>` +
          `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>` +
          `${escapeXml(text)}` +
          `</prosody></voice></speak>`,
      );
    };

    ws.onmessage = (event: MessageEvent) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          done = true;
          ws.close();
          finalize();
        }
      } else if (event.data instanceof ArrayBuffer) {
        const view = new DataView(event.data);
        const headerLen = view.getUint16(0);
        const audioStart = 2 + headerLen;
        if (audioStart < event.data.byteLength) {
          audioChunks.push(new Uint8Array(event.data.slice(audioStart)));
        }
      }
    };

    ws.onerror = (err: any) => {
      clearTimeout(timeout);
      if (!done) {
        done = true;
        reject(new Error(`TTS WebSocket error: ${err.message || "unknown"}`));
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (!done) {
        done = true;
        finalize();
      }
    };

    function finalize() {
      if (audioChunks.length === 0) {
        reject(new Error("TTS: no audio data received"));
        return;
      }
      const total = audioChunks.reduce((s, c) => s + c.length, 0);
      const result = new Uint8Array(total);
      let offset = 0;
      for (const chunk of audioChunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      resolve(result.buffer);
    }
  });
}
