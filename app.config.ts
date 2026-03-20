module.exports = {
  expo: {
    name: "Saikat Voice Assistant",
    slug: "saikatai",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "saikatai",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.saikatvoiceassistant.saikatai",
      infoPlist: {
        NSMicrophoneUsageDescription:
          "Uraan AI needs microphone access for voice chat",
      },
      config: {
        usesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundColor: "#020618",
      },
      softwareKeyboardLayoutMode: "pan",
      package: "com.saikatvoiceassistant.saikatai",
      edgeToEdgeEnabled: true,
      permissions: ["android.permission.RECORD_AUDIO"],
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/icon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#020618",
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: "2b94f4d2-3fdf-4886-966e-1c2a66c5c319",
      },
    },
  },
};
