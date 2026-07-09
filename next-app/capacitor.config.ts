import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.aytes.app",
  appName: "AYTES",
  webDir: "out",
  server: {
    url: "https://aytes-gold.vercel.app",
    cleartext: false,
  },
};

export default config;
