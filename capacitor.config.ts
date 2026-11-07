import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ru.sluchaino.answerbook',
  appName: 'КодШаг: учим программирование',
  webDir: 'dist',
  android: { backgroundColor: '#f3f5fa' },
  // Android keeps the WebView inside the system bars. CSS must not add them again.
  plugins: { SystemBars: { insetsHandling: 'native' } },
}
export default config
