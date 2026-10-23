import {useEffect,useState} from 'react'
import {SystemBars,SystemBarsStyle,registerPlugin} from '@capacitor/core'
import {readStored,writeStored,themeKey} from './storage'
import {applyTheme,parseTheme,nextTheme} from './theme'
import {isAndroid} from './mobile'
import type {Theme} from './theme'
const Appearance=registerPlugin<{setTheme:(options:{theme:Theme})=>Promise<void>}>('Appearance')

export function useTheme() {
  const [theme,setTheme]=useState(()=>parseTheme(readStored(themeKey)))
  const [themeError,setError]=useState('')
  useEffect(()=>{
    applyTheme(theme)
    let active=true
    if(isAndroid)void Appearance.setTheme({theme}).then(()=>{if(active)return SystemBars.setStyle({style:theme==='dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light})}).catch(()=>{})
    return ()=>{active=false}
  },[theme])
  function toggleTheme(){const next=nextTheme(theme);setTheme(next);void writeStored(themeKey,next).then(()=>setError(''),()=>setError('Не удалось сохранить выбранную тему. После перезапуска выбор может сброситься.'))}
  return {theme,toggleTheme,themeError}
}
