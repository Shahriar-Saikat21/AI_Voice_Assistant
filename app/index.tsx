import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AudioRecorder, FileFormat, FilePreset } from "react-native-audio-api";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { type Message } from "../services/llm";
import { transcribeAudio } from "../services/stt";
import { StreamOrchestrator } from "../utils/streamOrchestrator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ORB_SIZE = SCREEN_WIDTH * 0.45;

type AppState =
  | "idle"
  | "recording"
  | "transcribing"
  | "streaming"
  | "speaking";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const STATUS_TEXT: Record<AppState, string> = {
  idle: "Tap to speak",
  recording: "Listening...",
  transcribing: "Thinking...",
  streaming: "Responding...",
  speaking: "Speaking...",
};

const ORB_COLORS: Record<AppState, { inner: string; mid: string; outer: string; glow: string }> = {
  idle: {
    inner: "#475569",
    mid: "#334155",
    outer: "#1e293b",
    glow: "#334155",
  },
  recording: {
    inner: "#f87171",
    mid: "#ef4444",
    outer: "#dc2626",
    glow: "#ef4444",
  },
  transcribing: {
    inner: "#fbbf24",
    mid: "#f59e0b",
    outer: "#d97706",
    glow: "#f59e0b",
  },
  streaming: {
    inner: "#2dd4bf",
    mid: "#14b8a6",
    outer: "#0d9488",
    glow: "#14b8a6",
  },
  speaking: {
    inner: "#4ade80",
    mid: "#22c55e",
    outer: "#16a34a",
    glow: "#22c55e",
  },
};

const MAX_MESSAGES_PER_HOUR = 20;

export default function VoiceChat() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownText, setCooldownText] = useState("");

  const recorderRef = useRef<AudioRecorder | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const orchestratorRef = useRef<StreamOrchestrator | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const requestTimestamps = useRef<number[]>([]);
  const storageLoaded = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load persisted rate limit data on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedTimestamps, savedCooldown] = await Promise.all([
          AsyncStorage.getItem("rate_timestamps"),
          AsyncStorage.getItem("rate_cooldown_end"),
        ]);
        if (savedTimestamps) {
          const parsed: number[] = JSON.parse(savedTimestamps);
          const oneHourAgo = Date.now() - 3600000;
          requestTimestamps.current = parsed.filter((t) => t > oneHourAgo);
        }
        if (savedCooldown) {
          const end = parseInt(savedCooldown, 10);
          if (end > Date.now()) {
            setCooldownEnd(end);
          }
        }
        storageLoaded.current = true;
        console.log(
          `[App] Rate limit loaded — ${requestTimestamps.current.length} requests this hour`,
        );
      } catch (e) {
        storageLoaded.current = true;
        console.warn("[App] Failed to load rate limit data:", e);
      }
    })();
  }, []);

  const persistRateData = useCallback(async (timestamps: number[], cooldownEndMs: number | null) => {
    try {
      await Promise.all([
        AsyncStorage.setItem("rate_timestamps", JSON.stringify(timestamps)),
        cooldownEndMs
          ? AsyncStorage.setItem("rate_cooldown_end", cooldownEndMs.toString())
          : AsyncStorage.removeItem("rate_cooldown_end"),
      ]);
    } catch (e) {
      console.warn("[App] Failed to persist rate limit data:", e);
    }
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (!cooldownEnd) {
      setCooldownText("");
      return;
    }
    const tick = () => {
      const remaining = cooldownEnd - Date.now();
      if (remaining <= 0) {
        setCooldownEnd(null);
        setCooldownText("");
        requestTimestamps.current = [];
        persistRateData([], null);
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setCooldownText(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [cooldownEnd]);

  // Animation shared values
  const orbScale = useSharedValue(1);
  const orbOpacity = useSharedValue(0.5);
  const ring1Scale = useSharedValue(1);
  const ring1Opacity = useSharedValue(0);
  const ring2Scale = useSharedValue(1);
  const ring2Opacity = useSharedValue(0);
  const ring3Scale = useSharedValue(1);
  const ring3Opacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0.15);

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

  // Animate orb based on state
  useEffect(() => {
    cancelAnimation(orbScale);
    cancelAnimation(orbOpacity);
    cancelAnimation(ring1Scale);
    cancelAnimation(ring1Opacity);
    cancelAnimation(ring2Scale);
    cancelAnimation(ring2Opacity);
    cancelAnimation(ring3Scale);
    cancelAnimation(ring3Opacity);
    cancelAnimation(glowOpacity);

    switch (appState) {
      case "recording":
        // Breathing orb
        orbScale.value = withRepeat(
          withTiming(1.15, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
        orbOpacity.value = withRepeat(
          withTiming(1, { duration: 700 }),
          -1,
          true,
        );
        // Ripple rings
        ring1Scale.value = withRepeat(
          withSequence(
            withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
            withTiming(1, { duration: 0 }),
          ),
          -1,
        );
        ring1Opacity.value = withRepeat(
          withSequence(
            withTiming(0, { duration: 1200 }),
            withTiming(0.5, { duration: 0 }),
          ),
          -1,
        );
        ring2Scale.value = withDelay(
          400,
          withRepeat(
            withSequence(
              withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
              withTiming(1, { duration: 0 }),
            ),
            -1,
          ),
        );
        ring2Opacity.value = withDelay(
          400,
          withRepeat(
            withSequence(
              withTiming(0, { duration: 1200 }),
              withTiming(0.3, { duration: 0 }),
            ),
            -1,
          ),
        );
        ring3Scale.value = withDelay(
          800,
          withRepeat(
            withSequence(
              withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }),
              withTiming(1, { duration: 0 }),
            ),
            -1,
          ),
        );
        ring3Opacity.value = withDelay(
          800,
          withRepeat(
            withSequence(
              withTiming(0, { duration: 1200 }),
              withTiming(0.2, { duration: 0 }),
            ),
            -1,
          ),
        );
        glowOpacity.value = withRepeat(
          withTiming(0.4, { duration: 700 }),
          -1,
          true,
        );
        break;

      case "streaming":
        orbScale.value = withRepeat(
          withTiming(1.08, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
        orbOpacity.value = withTiming(0.9);
        ring1Opacity.value = withTiming(0);
        ring2Opacity.value = withTiming(0);
        ring3Opacity.value = withTiming(0);
        glowOpacity.value = withRepeat(
          withTiming(0.35, { duration: 600 }),
          -1,
          true,
        );
        break;

      case "speaking":
        orbScale.value = withRepeat(
          withSequence(
            withTiming(1.12, { duration: 300, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.05, { duration: 200, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.1, { duration: 250, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.02, { duration: 250, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
        );
        orbOpacity.value = withTiming(0.95);
        ring1Opacity.value = withTiming(0);
        ring2Opacity.value = withTiming(0);
        ring3Opacity.value = withTiming(0);
        glowOpacity.value = withRepeat(
          withTiming(0.45, { duration: 400 }),
          -1,
          true,
        );
        break;

      case "transcribing":
        orbScale.value = withRepeat(
          withTiming(1.06, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        );
        orbOpacity.value = withRepeat(
          withSequence(
            withTiming(0.5, { duration: 900 }),
            withTiming(0.8, { duration: 900 }),
          ),
          -1,
        );
        ring1Opacity.value = withTiming(0);
        ring2Opacity.value = withTiming(0);
        ring3Opacity.value = withTiming(0);
        glowOpacity.value = withRepeat(
          withTiming(0.25, { duration: 900 }),
          -1,
          true,
        );
        break;

      default:
        orbScale.value = withSpring(1, { damping: 15 });
        orbOpacity.value = withTiming(0.5, { duration: 400 });
        ring1Scale.value = withTiming(1);
        ring1Opacity.value = withTiming(0);
        ring2Scale.value = withTiming(1);
        ring2Opacity.value = withTiming(0);
        ring3Scale.value = withTiming(1);
        ring3Opacity.value = withTiming(0);
        glowOpacity.value = withTiming(0.15, { duration: 400 });
    }
  }, [appState]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
    opacity: orbOpacity.value,
  }));

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring1Scale.value }],
    opacity: ring1Opacity.value,
  }));

  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring2Scale.value }],
    opacity: ring2Opacity.value,
  }));

  const ring3Style = useAnimatedStyle(() => ({
    transform: [{ scale: ring3Scale.value }],
    opacity: ring3Opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
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

      const userMsg: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content: transcript,
      };
      setMessages((prev) => [...prev, userMsg]);
      requestTimestamps.current.push(Date.now());
      persistRateData(requestTimestamps.current, cooldownEnd);
      console.log(`[App] User message added (${requestTimestamps.current.length}/${MAX_MESSAGES_PER_HOUR} this hour)`);

      setAppState("streaming");
      setStreamingText("");

      // Keep last 20 messages for context (saves tokens on longer convos)
      const recentMessages = messagesRef.current.slice(-20);
      const llmMessages: Message[] = [
        ...recentMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: transcript },
      ];

      const orchestrator = new StreamOrchestrator(
        (fullText) => {
          setStreamingText(fullText);
          setAppState("streaming");
        },
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

  const checkRateLimit = (): boolean => {
    if (cooldownEnd && Date.now() < cooldownEnd) return false;

    const now = Date.now();
    const oneHourAgo = now - 3600000;
    requestTimestamps.current = requestTimestamps.current.filter(
      (t) => t > oneHourAgo,
    );

    if (requestTimestamps.current.length >= MAX_MESSAGES_PER_HOUR) {
      console.log("[App] Rate limit reached — cooldown for 1 hour");
      const end = now + 3600000;
      setCooldownEnd(end);
      persistRateData(requestTimestamps.current, end);
      return false;
    }
    return true;
  };

  const handleOrbPress = () => {
    console.log(`[App] Orb pressed — current state: ${appState}`);
    if (appState === "idle") {
      if (!checkRateLimit()) return;
      startRecording();
    } else if (appState === "recording") {
      stopRecordingAndProcess();
    } else if (appState === "streaming" || appState === "speaking") {
      cancelOrchestrator();
    }
  };

  const clearChat = () => {
    Alert.alert("Clear Chat", "This will delete all messages.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setMessages([]);
          setStreamingText("");
          setError(null);
        },
      },
    ]);
  };

  const isProcessing = appState === "transcribing";
  const isCoolingDown = cooldownEnd !== null && Date.now() < cooldownEnd;
  const colors = ORB_COLORS[appState];
  const hasMessages = messages.length > 0 || streamingText;
  const usedCount = requestTimestamps.current.filter(
    (t) => t > Date.now() - 3600000,
  ).length;
  const remaining = MAX_MESSAGES_PER_HOUR - usedCount;

  return (
    <SafeAreaView className="flex-1 bg-[#020618]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <View>
          <Text className="text-white text-xl font-bold tracking-wide">
            Saikat AI
          </Text>
          <Text className="text-slate-600 text-xs mt-0.5">Voice Assistant</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          {/* Usage counter */}
          <View
            className="px-2.5 py-1 rounded-full"
            style={{
              backgroundColor:
                remaining <= 5
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(51, 65, 85, 0.4)",
            }}
          >
            <Text
              className="text-[10px] font-bold"
              style={{
                color: remaining <= 5 ? "#f87171" : "#64748b",
              }}
            >
              {remaining}/{MAX_MESSAGES_PER_HOUR}
            </Text>
          </View>

          {/* Clear button */}
          {hasMessages ? (
            <TouchableOpacity
              onPress={clearChat}
              activeOpacity={0.6}
              className="px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "rgba(51, 65, 85, 0.5)" }}
            >
              <Text className="text-slate-400 text-xs">Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 px-4 mt-2"
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
        showsVerticalScrollIndicator={false}
      >
        {!hasMessages && appState === "idle" && (
          <Animated.View
            entering={FadeIn.duration(600)}
            className="items-center mt-16 px-8"
          >
            <Text className="text-slate-700 text-6xl mb-6">
              {"{}"}
            </Text>
            <Text className="text-slate-500 text-base text-center leading-6">
              Hi, I'm Saikat AI
            </Text>
            <Text className="text-slate-600 text-sm text-center mt-2 leading-5">
              Tap the orb below to start talking.{"\n"}I'll listen, think, and
              respond with voice.
            </Text>
          </Animated.View>
        )}

        {messages.map((msg) => (
          <Animated.View
            entering={FadeIn.duration(300)}
            key={msg.id}
            className={`mb-3 ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <View
              style={{
                maxWidth: "85%",
                backgroundColor:
                  msg.role === "user"
                    ? "rgba(59, 130, 246, 0.8)"
                    : "rgba(30, 41, 59, 0.7)",
                borderWidth: 1,
                borderColor:
                  msg.role === "user"
                    ? "rgba(96, 165, 250, 0.3)"
                    : "rgba(71, 85, 105, 0.3)",
              }}
              className={`rounded-2xl px-4 py-3 ${
                msg.role === "user" ? "rounded-br-sm" : "rounded-bl-sm"
              }`}
            >
              <Text className="text-white text-[15px] leading-6">
                {msg.content}
              </Text>
            </View>
            <Text className="text-slate-700 text-[10px] mt-1 px-1">
              {msg.role === "user" ? "You" : "Saikat AI"}
            </Text>
          </Animated.View>
        ))}

        {/* Streaming message */}
        {streamingText ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="mb-3 items-start"
          >
            <View
              style={{
                maxWidth: "85%",
                backgroundColor: "rgba(30, 41, 59, 0.7)",
                borderWidth: 1,
                borderColor: "rgba(20, 184, 166, 0.3)",
              }}
              className="rounded-2xl px-4 py-3 rounded-bl-sm"
            >
              <Text className="text-white text-[15px] leading-6">
                {streamingText}
                <Text style={{ color: colors.inner }}> |</Text>
              </Text>
            </View>
            <Text className="text-slate-700 text-[10px] mt-1 px-1">
              Saikat AI
            </Text>
          </Animated.View>
        ) : null}

        <View className="h-4" />
      </ScrollView>

      {/* Orb Area */}
      <View className="items-center pb-8 pt-2">
        {/* Error */}
        {error && (
          <Animated.Text
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            className="text-red-400/80 text-xs mb-3 px-8 text-center"
          >
            {error}
          </Animated.Text>
        )}

        {/* Cooldown banner */}
        {isCoolingDown && (
          <Animated.View
            entering={FadeIn.duration(300)}
            className="mb-3 px-5 py-2 rounded-full"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.15)" }}
          >
            <Text className="text-red-400 text-xs text-center">
              Limit reached — resets in {cooldownText}
            </Text>
          </Animated.View>
        )}

        {/* Status — only show when active */}
        {appState !== "idle" && !isCoolingDown && (
          <Text
            className="text-sm mb-5 tracking-wider uppercase"
            style={{ color: colors.inner }}
          >
            {STATUS_TEXT[appState]}
          </Text>
        )}
        {(appState === "idle" || isCoolingDown) && !isCoolingDown && (
          <View className="mb-5" />
        )}

        {/* Orb */}
        <Pressable
          onPress={handleOrbPress}
          disabled={isProcessing || isCoolingDown}
          style={{
            width: ORB_SIZE + 60,
            height: ORB_SIZE + 60,
            alignItems: "center",
            justifyContent: "center",
            opacity: isProcessing || isCoolingDown ? 0.3 : 1,
          }}
        >
          {/* Background glow */}
          <Animated.View
            style={[
              glowStyle,
              {
                position: "absolute",
                width: ORB_SIZE + 80,
                height: ORB_SIZE + 80,
                borderRadius: (ORB_SIZE + 80) / 2,
                backgroundColor: colors.glow,
              },
            ]}
          />

          {/* Ring 3 (outermost) */}
          <Animated.View
            style={[
              ring3Style,
              {
                position: "absolute",
                width: ORB_SIZE + 20,
                height: ORB_SIZE + 20,
                borderRadius: (ORB_SIZE + 20) / 2,
                borderWidth: 1,
                borderColor: colors.outer,
              },
            ]}
          />

          {/* Ring 2 */}
          <Animated.View
            style={[
              ring2Style,
              {
                position: "absolute",
                width: ORB_SIZE + 10,
                height: ORB_SIZE + 10,
                borderRadius: (ORB_SIZE + 10) / 2,
                borderWidth: 1.5,
                borderColor: colors.mid,
              },
            ]}
          />

          {/* Ring 1 */}
          <Animated.View
            style={[
              ring1Style,
              {
                position: "absolute",
                width: ORB_SIZE,
                height: ORB_SIZE,
                borderRadius: ORB_SIZE / 2,
                borderWidth: 2,
                borderColor: colors.inner,
              },
            ]}
          />

          {/* Outer orb layer */}
          <Animated.View
            style={[
              orbStyle,
              {
                position: "absolute",
                width: ORB_SIZE - 10,
                height: ORB_SIZE - 10,
                borderRadius: (ORB_SIZE - 10) / 2,
                backgroundColor: colors.outer,
              },
            ]}
          />

          {/* Mid orb layer */}
          <Animated.View
            style={[
              orbStyle,
              {
                position: "absolute",
                width: ORB_SIZE - 30,
                height: ORB_SIZE - 30,
                borderRadius: (ORB_SIZE - 30) / 2,
                backgroundColor: colors.mid,
              },
            ]}
          />

          {/* Inner orb core */}
          <Animated.View
            style={[
              orbStyle,
              {
                width: ORB_SIZE - 55,
                height: ORB_SIZE - 55,
                borderRadius: (ORB_SIZE - 55) / 2,
                backgroundColor: colors.inner,
              },
            ]}
          />

          {/* Icon overlay */}
          <View
            style={{
              position: "absolute",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {appState === "recording" ? (
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  backgroundColor: "rgba(255,255,255,0.9)",
                }}
              />
            ) : appState === "streaming" || appState === "speaking" ? (
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: 22,
                    height: 2.5,
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: 1,
                    transform: [{ rotate: "45deg" }],
                    position: "absolute",
                  }}
                />
                <View
                  style={{
                    width: 22,
                    height: 2.5,
                    backgroundColor: "rgba(255,255,255,0.9)",
                    borderRadius: 1,
                    transform: [{ rotate: "-45deg" }],
                    position: "absolute",
                  }}
                />
              </View>
            ) : appState === "transcribing" ? (
              // Three dots
              <View style={{ flexDirection: "row", gap: 6 }}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "rgba(255,255,255,0.7)",
                    }}
                  />
                ))}
              </View>
            ) : (
              // Mic icon
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    width: 14,
                    height: 22,
                    borderRadius: 7,
                    backgroundColor: "rgba(255,255,255,0.85)",
                  }}
                />
                <View
                  style={{
                    width: 22,
                    height: 2,
                    backgroundColor: "rgba(255,255,255,0.85)",
                    marginTop: 3,
                  }}
                />
                <View
                  style={{
                    width: 2,
                    height: 5,
                    backgroundColor: "rgba(255,255,255,0.85)",
                    marginTop: -1,
                  }}
                />
              </View>
            )}
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
