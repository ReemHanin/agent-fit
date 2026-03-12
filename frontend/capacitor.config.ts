import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.agentfit.app',
  appName: 'Agent Fit',
  webDir: 'dist',
  server: {
    // HTTPS required for microphone and notifications on iOS.
    // The Vite build bakes VITE_API_URL into the bundle at build time,
    // so the native app calls Railway directly (no proxy needed).
    cleartext: false,
  },
  ios: {
    backgroundColor: '#0f0a1a',
    contentInset: 'always',
    infoPlist: {
      // Required for @capacitor-community/contacts
      NSContactsUsageDescription:
        'Agent Fit reads your contacts so the AI agent can send messages to people by name.',
    },
  },
};

export default config;
