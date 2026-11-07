import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AppRouter from './AppRouter'
import { initializeStorage,readStored,themeKey } from './lib/storage'
import {applyTheme,parseTheme} from './lib/theme'
import {initializeLearningContent} from './lib/courseUpdates'
import {courseCatalog} from './lib/learningContent'
import './theme.css'
import './design/studio.css'
import './design/web-layout.css'
document.documentElement.dataset.design = 'studio'
import { isAndroid } from './lib/mobile'
import {installDialogDismiss} from './lib/dialogDismiss'

const removeDialogDismiss=installDialogDismiss(document)
if(import.meta.hot)import.meta.hot.dispose(removeDialogDismiss)

if (isAndroid) document.documentElement.dataset.platform = 'android'

async function start() {
  try { if(location.hash!=='#/authoring-preview'){await initializeLearningContent();await initializeStorage(courseCatalog.map(c=>c.id))} }
  catch { document.getElementById('root')!.textContent = 'Не удалось открыть сохранённые данные. Закройте и снова откройте приложение.'; return }
  applyTheme(parseTheme(readStored(themeKey)))
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
)
}
void start()
