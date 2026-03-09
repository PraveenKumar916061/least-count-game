import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leastcount.game',
  appName: 'Least Count',
  webDir: 'build',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
