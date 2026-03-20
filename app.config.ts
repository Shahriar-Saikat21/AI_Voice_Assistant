module.exports = {
  expo: {
    name: "Saikat Voice Assistant",
    slug: "uraanai",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    scheme: "uraanai",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.magpieinc.uraanai",
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
      package: "com.magpieinc.uraanai",
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
        projectId: "6b4b9176-41d3-48aa-b44c-2d5bbc7635a7",
      },
    },
  },
};
