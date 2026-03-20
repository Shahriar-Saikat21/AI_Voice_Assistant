# Saikat AI - Voice Assistant

A real-time voice assistant app built with React Native and Expo. Talk to an AI and get spoken responses — like ChatGPT Voice, but open-source.

## How It Works

```
User speaks → Record WAV → Groq STT → OpenRouter LLM (streaming) → Edge TTS → Audio Playback
```

The app uses a **streaming pipeline** architecture for low latency:

1. **Record** — Captures audio as WAV using `react-native-audio-api`
2. **Speech-to-Text** — Sends WAV to Groq's Whisper API for transcription
3. **LLM Streaming** — Streams the transcript to OpenRouter (Nvidia Nemotron) via SSE
4. **Sentence Splitting** — Splits the streaming LLM output into sentences as they complete
5. **Text-to-Speech** — Each sentence is sent to Edge TTS (Microsoft) in parallel via WebSocket
6. **Gapless Playback** — Audio chunks are scheduled sequentially using `AudioContext` for seamless playback

The sentence-level pipelining means TTS starts generating audio for the first sentence while the LLM is still generating the rest — significantly reducing perceived latency.

## Architecture

```
app/
  _layout.tsx              # Root layout (dark theme, status bar)
  index.tsx                # Main VoiceChat UI (orb, messages, rate limiter)

services/
  stt.ts                   # Groq Whisper API (speech-to-text)
  llm.ts                   # OpenRouter streaming LLM
  tts.ts                   # Edge TTS via WebSocket (SSML + Sec-MS-GEC auth)

utils/
  streamOrchestrator.ts    # Coordinates: LLM stream → sentence split → TTS → audio queue
  sentenceSplitter.ts      # Splits streaming text on sentence boundaries
  audio.ts                 # AudioQueue with gapless scheduled playback
```

## Tech Stack

- **Expo SDK 55** / React Native 0.83 (New Architecture)
- **NativeWind** (Tailwind CSS for React Native)
- **React Native Reanimated** (animated orb UI)
- **react-native-audio-api** (recording + audio playback)
- **expo-crypto** (SHA256 for Edge TTS authentication)
- **AsyncStorage** (persisted rate limiting)

## Setup

### Prerequisites

- Node.js 18+
- Android phone or emulator
- Groq API key (free at [console.groq.com](https://console.groq.com))
- OpenRouter API key (free at [openrouter.ai](https://openrouter.ai))

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd App

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Add your API keys to `.env`:

```
EXPO_PUBLIC_GROQ_API_KEY=your_groq_key_here
EXPO_PUBLIC_OPENROUTER_API_KEY=your_openrouter_key_here
```

### Running

This app uses native modules (`react-native-audio-api`, `expo-crypto`), so it requires a **development build** — Expo Go will not work.

```bash
# Generate native projects and build
npx expo prebuild --clean
npx expo run:android

# Or for iOS
npx expo run:ios
```

After the first build, you can start the dev server with:

```bash
npx expo start --dev-client
```

## Rate Limiting

The app enforces a built-in usage limit to stay within free API tiers:

- **20 messages per hour** — After 20 user messages, the app enters a 1-hour cooldown
- **Persisted across restarts** — Closing and reopening the app does not reset the cooldown
- **Live countdown** — A timer shows remaining cooldown time above the orb
- **Usage counter** — The header shows remaining messages (e.g., `15/20`), turns red when <= 5 left

The limit is configurable via the `MAX_MESSAGES_PER_HOUR` constant in `app/index.tsx`.

## Free Tier Limitations

All three services are used on their free tiers:

| Service | Provider | Free Limit | Notes |
|---------|----------|------------|-------|
| **STT** | Groq (whisper-large-v3-turbo) | ~28,800 audio-seconds/day | ~20 requests/minute |
| **LLM** | OpenRouter (nemotron-3-super-120b-a12b:free) | ~200 requests/day | May have queue delays at peak hours |
| **TTS** | Microsoft Edge TTS | No official limit | Unofficial API, uses Edge browser's Read Aloud backend |

The in-app rate limiter (20/hour) keeps usage well within these provider limits.

## UI

The app features an orb-centric interface:

- **Tap the orb** to start recording, tap again to stop and process
- **Tap during streaming/speaking** to cancel the response
- **Clear button** in the header to reset chat history (with confirmation)

### Orb States

| State | Color | Animation | Icon |
|-------|-------|-----------|------|
| Idle | Gray | Static | Mic |
| Recording | Red | Breathing + ripple rings | Stop square |
| Transcribing | Amber | Gentle pulse + fade | Three dots |
| Streaming | Teal | Subtle breathing + glow | X (cancel) |
| Speaking | Green | Organic pulse + glow | X (cancel) |

### Message Bubbles

- **User messages** — Blue, aligned right
- **Assistant messages** — Dark slate, aligned left
- **Streaming** — Live text with colored cursor, teal border glow

## License

MIT
