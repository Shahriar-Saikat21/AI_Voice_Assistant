import { useEffect, useRef, useState } from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AudioRecorder, FileFormat, FilePreset } from "react-native-audio-api";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { type Message } from "../services/llm";
import { preloadWhisper, transcribeAudio } from "../services/stt";
import { StreamOrchestrator } from "../utils/streamOrchestrator";

type AppState =
  | "idle"
  | "recording"
  | "transcribing"
  | "streaming" // LLM streaming + TTS pipelining
  | "speaking"; // final audio playing out

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const STATUS_TEXT: Record<AppState, string> = {
  idle: "Tap the mic to start",
  recording: "Listening...",
  transcribing: "Transcribing...",
  streaming: "Responding...",
  speaking: "Speaking...",
};

const ORB_COLORS: Record<AppState, string> = {
  idle: "#334155",
  recording: "#ef4444",
  transcribing: "#f59e0b",
  streaming: "#14b8a6",
  speaking: "#22c55e",
};

export default function VoiceChat() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const orchestratorRef = useRef<StreamOrchestrator | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep messages ref in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Animation shared values
  const orbScale = useSharedValue(1);
  const orbOpacity = useSharedValue(0.4);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);

  // Init recorder
  useEffect(() => {
    console.log("[App] Initializing AudioRecorder...");
    const recorder = new AudioRecorder();
    recorder.enableFileOutput({
      format: FileFormat.Wav,
      preset: FilePreset.Lossless,
    });
    recorder.onError((err) => {
      console.error("[App] Recorder error:", err.message);
      setError(err.message);
      setAppState("idle");
    });
    recorderRef.current = recorder;
    console.log("[App] AudioRecorder ready");

    return () => {
      if (recorder.isRecording()) {
        recorder.stop();
      }
    };
  }, []);

  // Preload Whisper model on startup
  useEffect(() => {
    console.log("[App] App mounted, preloading Whisper...");
    preloadWhisper();
  }, []);

  // Animate orb based on state
  useEffect(() => {
    cancelAnimation(orbScale);
    cancelAnimation(orbOpacity);
    cancelAnimation(ringScale);
    cancelAnimation(ringOpacity);

    switch (appState) {
      case "recording":
        orbScale.value = withRepeat(
          withTiming(1.2, {
            duration: 600,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true,
        );
        orbOpacity.value = withRepeat(
          withTiming(0.9, { duration: 600 }),
          -1,
          true,
        );
        ringScale.value = withRepeat(
          withSequence(
            withTiming(1.6, { duration: 1000 }),
            withTiming(1, { duration: 0 }),
          ),
          -1,
        );
        ringOpacity.value = withRepeat(
          withSequence(
            withTiming(0, { duration: 1000 }),
            withTiming(0.4, { duration: 0 }),
          ),
          -1,
        );
        break;

      case "streaming":
        orbScale.value = withRepeat(
          withTiming(1.12, {
            duration: 500,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true,
        );
        orbOpacity.value = withTiming(0.8);
        ringOpacity.value = withTiming(0);
        break;

      case "speaking":
        orbScale.value = withRepeat(
          withTiming(1.15, {
            duration: 400,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true,
        );
        orbOpacity.value = withTiming(0.85);
        ringOpacity.value = withTiming(0);
        break;

      case "transcribing":
        orbScale.value = withRepeat(
          withTiming(1.08, { duration: 800 }),
          -1,
          true,
        );
        orbOpacity.value = withTiming(0.7);
        ringOpacity.value = withTiming(0);
        break;

      default:
        orbScale.value = withTiming(1);
        orbOpacity.value = withTiming(0.4);
        ringScale.value = withTiming(1);
        ringOpacity.value = withTiming(0);
    }
  }, [appState]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
    opacity: orbOpacity.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const requestMicPermission = async (): Promise<boolean> => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message: "Saikat AI needs your microphone for voice chat",
          buttonPositive: "Allow",
          buttonNegative: "Deny",
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };

  const startRecording = async () => {
    try {
      console.log("[App] Requesting mic permission...");
      const hasPermission = await requestMicPermission();
      if (!hasPermission) {
        console.warn("[App] Mic permission DENIED");
        Alert.alert(
          "Permission Denied",
          "Microphone access is required for voice chat",
        );
        return;
      }
      console.log("[App] Mic permission granted");

      setError(null);
      setAppState("recording");

      console.log("[App] Starting recording...");
      const result = recorderRef.current!.start();
      if (result.status !== "success") {
        throw new Error("Failed to start recording");
      }
      console.log("[App] Recording STARTED");
    } catch (err: any) {
      console.error("[App] Recording start FAILED:", err.message);
      setError(err.message);
      setAppState("idle");
    }
  };

  const stopRecordingAndProcess = async () => {
    try {
      console.log("[App] Stopping recording...");
      const result = recorderRef.current!.stop();

      if (result.status !== "success") {
        console.warn("[App] Recording stop failed:", result.message);
        setAppState("idle");
        return;
      }

      const filePath = result.path;
      console.log("[App] Recording stopped, path:", filePath);

      // --- STT ---
      setAppState("transcribing");
      const fileUri = filePath.startsWith("file://")
        ? filePath
        : `file://${filePath}`;
      console.log("[App] Starting STT for:", fileUri);
      const transcript = await transcribeAudio(fileUri);
      console.log(`[App] STT result: "${transcript}"`);

      if (!transcript.trim()) {
        console.warn("[App] Empty transcript, returning to idle");
        setAppState("idle");
        return;
      }

      // Add user message
      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: transcript,
      };
      setMessages((prev) => [...prev, userMsg]);
      console.log("[App] User message added, starting LLM + TTS pipeline...");

      // --- Streaming LLM + Pipelined TTS ---
      setAppState("streaming");
      setStreamingText("");

      const llmMessages: Message[] = [
        ...messagesRef.current.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: transcript },
      ];

      const orchestrator = new StreamOrchestrator(
        // onToken — update streaming text in real-time
        (fullText) => {
          setStreamingText(fullText);
          setAppState("streaming");
        },
        // onComplete — finalize assistant message
        (fullText) => {
          setStreamingText("");
          const assistantMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: fullText,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          orchestratorRef.current = null;
          setAppState("idle");
        },
        // onError
        (err) => {
          setStreamingText("");
          setError(err.message);
          orchestratorRef.current = null;
          setAppState("idle");
        },
      );

      orchestratorRef.current = orchestrator;
      console.log("[App] Orchestrator launched");
      orchestrator.run(llmMessages);
    } catch (err: any) {
      console.error("[App] Pipeline error:", err.message);
      setError(err.message);
      setAppState("idle");
    }
  };

  const cancelOrchestrator = () => {
    console.log("[App] User cancelled orchestrator");
    if (orchestratorRef.current) {
      orchestratorRef.current.cancel();
      orchestratorRef.current = null;
    }
    // Save whatever text was streamed so far
    if (streamingText.trim()) {
      const partialMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: streamingText,
      };
      setMessages((prev) => [...prev, partialMsg]);
    }
    setStreamingText("");
    setAppState("idle");
  };

  const handleMicPress = () => {
    console.log(`[App] Mic pressed — current state: ${appState}`);
    if (appState === "idle") {
      startRecording();
    } else if (appState === "recording") {
      stopRecordingAndProcess();
    } else if (appState === "streaming" || appState === "speaking") {
      cancelOrchestrator();
    }
  };

  const isProcessing = appState === "transcribing";

  return (
    <SafeAreaView className="flex-1 bg-[#020618]">
      {/* Header */}
      <View className="items-center pt-6 pb-2">
        <Text className="text-white text-2xl font-bold">Saikat AI</Text>
        <Text className="text-slate-500 text-sm mt-1">Voice Assistant</Text>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-4 mt-4"
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && !streamingText && appState === "idle" && (
          <View className="items-center mt-8">
            <Text className="text-slate-600 text-base text-center">
              Tap the microphone to start a conversation
            </Text>
          </View>
        )}

        {messages.map((msg) => (
          <View
            key={msg.id}
            className={`mb-3 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <View
              style={{ maxWidth: "85%" }}
              className={`rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-blue-600 rounded-br-sm"
                  : "bg-slate-800 rounded-bl-sm"
              }`}
            >
              <Text className="text-white text-base leading-6">
                {msg.content}
              </Text>
            </View>
            <Text className="text-slate-600 text-xs mt-1">
              {msg.role === "user" ? "You" : "Saikat AI"}
            </Text>
          </View>
        ))}

        {/* Streaming assistant message */}
        {streamingText ? (
          <View className="mb-3 items-start">
            <View
              style={{ maxWidth: "85%" }}
              className="rounded-2xl px-4 py-3 bg-slate-800 rounded-bl-sm"
            >
              <Text className="text-white text-base leading-6">
                {streamingText}
                <Text className="text-slate-400"> |</Text>
              </Text>
            </View>
            <Text className="text-slate-600 text-xs mt-1">Uraan AI</Text>
          </View>
        ) : null}

        <View className="h-4" />
      </ScrollView>

      {/* Orb + Controls */}
      <View className="items-center pb-6">
        {/* Animated Orb */}
        <View
          className="items-center justify-center mb-4"
          style={{ width: 140, height: 140 }}
        >
          <Animated.View
            style={[
              ringStyle,
              {
                position: "absolute",
                width: 130,
                height: 130,
                borderRadius: 65,
                backgroundColor: ORB_COLORS[appState],
              },
            ]}
          />
          <Animated.View
            style={[
              orbStyle,
              {
                width: 100,
                height: 100,
                borderRadius: 50,
                backgroundColor: ORB_COLORS[appState],
              },
            ]}
          />
        </View>

        {/* Status */}
        <Text className="text-slate-400 text-base mb-4">
          {STATUS_TEXT[appState]}
        </Text>

        {/* Error */}
        {error && (
          <Text className="text-red-400 text-sm mb-3 px-8 text-center">
            {error}
          </Text>
        )}

        {/* Mic Button */}
        <TouchableOpacity
          onPress={handleMicPress}
          disabled={isProcessing}
          activeOpacity={0.7}
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor:
              appState === "recording"
                ? "#ef4444"
                : appState === "streaming" || appState === "speaking"
                  ? "#64748b"
                  : "#1e293b",
            opacity: isProcessing ? 0.4 : 1,
          }}
        >
          {appState === "recording" ? (
            // Stop icon
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 4,
                backgroundColor: "#ffffff",
              }}
            />
          ) : appState === "streaming" || appState === "speaking" ? (
            // Cancel X icon
            <View style={{ alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  width: 24,
                  height: 3,
                  backgroundColor: "#ffffff",
                  borderRadius: 1,
                  transform: [{ rotate: "45deg" }],
                  position: "absolute",
                }}
              />
              <View
                style={{
                  width: 24,
                  height: 3,
                  backgroundColor: "#ffffff",
                  borderRadius: 1,
                  transform: [{ rotate: "-45deg" }],
                  position: "absolute",
                }}
              />
            </View>
          ) : (
            // Mic icon
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 16,
                  height: 24,
                  borderRadius: 8,
                  backgroundColor: "#ffffff",
                }}
              />
              <View
                style={{
                  width: 24,
                  height: 2,
                  backgroundColor: "#ffffff",
                  marginTop: 4,
                }}
              />
              <View
                style={{
                  width: 2,
                  height: 6,
                  backgroundColor: "#ffffff",
                  marginTop: -2,
                }}
              />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
