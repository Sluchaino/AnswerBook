import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initializeStorage,readStored,themeKey } from './lib/storage'
import {applyTheme,parseTheme} from './lib/theme'
import './theme.css'
import './design/studio.css'
document.documentElement.dataset.design = 'studio'
import { isAndroid } from './lib/mobile'

if (isAndroid) document.documentElement.dataset.platform = 'android'

async function start() {
  try { await initializeStorage() }
  catch { document.getElementById('root')!.textContent = 'Не удалось открыть сохранённые данные. Закройте и снова откройте приложение.'; return }
  applyTheme(parseTheme(readStored(themeKey)))
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
}
void start()
