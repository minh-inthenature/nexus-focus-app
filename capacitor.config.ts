import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.minh.vault',
  appName: 'Vault',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
