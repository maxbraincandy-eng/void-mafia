import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'one.voidmafia.app',
  appName: 'Void Mafia',
  webDir: 'dist',

  // Load the live production site — no separate bundle needed.
  // The socket connects to the same origin (voidmafia.one) automatically.
  server: {
    url: 'https://voidmafia.one',
    cleartext: false,
    androidScheme: 'https',
  },

  android: {
    backgroundColor: '#060314',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#060314',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
