const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Allow .bin files to be bundled as assets (whisper model)
config.resolver.assetExts.push("bin");

module.exports = withNativeWind(config, { input: "./global.css" });
