import {lazy,Suspense,useEffect,useState} from 'react'
import App from './App'
import {PrivacyGate,PrivacyPage} from './privacy/PrivacyGate'
import {isAndroid} from './lib/mobile'
const AuthoringPage=lazy(()=>import('./authoring/AuthoringPage'))
const AuthoringPreview=lazy(()=>import('./authoring/AuthoringPreview'))
export default function AppRouter(){const [route,setRoute]=useState(location.hash);useEffect(()=>{const listener=()=>setRoute(location.hash);window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener)},[]);return route==='#/privacy'?<PrivacyPage/>:route==='#/authoring-preview'?<Suspense fallback={<p>Предпросмотр…</p>}><AuthoringPreview/></Suspense>:route==='#/authoring'?<Suspense fallback={<p>Открываем редактор…</p>}><AuthoringPage/></Suspense>:isAndroid?<PrivacyGate><App/></PrivacyGate>:<App/>}
