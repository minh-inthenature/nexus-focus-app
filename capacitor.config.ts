import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.minh.vault',
  appName: 'Nexus',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
