import {Capacitor,registerPlugin} from '@capacitor/core'
import type {PluginListenerHandle} from '@capacitor/core'
import {readStored,writeStored} from './storage'
import {validateLearningManifest} from './learningDownloads'
import type {LearningManifest} from './learningDownloads'
import {reconcileNotices} from './courseNotices'
import type {NoticeSnapshot,CourseNotice} from './courseNotices'

type NativeState={snapshot:NoticeSnapshot;enabled:boolean;permitted:boolean;openInbox?:boolean}
const native=Capacitor.getPlatform()==='android'
const bridge=registerPlugin<{
 configure(options:{manifest:LearningManifest;url:string}):Promise<NativeState>
 observe(options:{manifest:LearningManifest}):Promise<NativeState>
 state():Promise<NativeState>
 markRead(options:{id?:string}):Promise<NativeState>
 enable():Promise<NativeState>
 disable():Promise<NativeState>
 openSettings():Promise<void>
 addListener(event:'openInbox',listener:()=>void):Promise<PluginListenerHandle>
}>('CourseNotifications')
const key='answerbook.course-notices.v1'
let snapshot:NoticeSnapshot|null=null,revision=0,enabled=false,permitted=false,error='',openRequest=0,failed=false
const listeners=new Set<()=>void>()
let queue:Promise<unknown>=Promise.resolve()
const emit=()=>{revision++;for(const listener of listeners)listener()}
export const subscribeCourseNotices=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}}
export const courseNoticesRevision=()=>revision
export const courseNoticesState=()=>({items:snapshot?.items??[],enabled,permitted,error,openRequest,native})

function parse(value:unknown):NoticeSnapshot{
 const s=value as NoticeSnapshot
 if(!s||s.schemaVersion!==1||!Array.isArray(s.items)||s.items.length>100)throw Error('Не удалось прочитать уведомления')
 const baseline=validateLearningManifest(s.baseline),ids=new Set<string>()
 for(const n of s.items){
  if(!n||![n.id,n.courseId,n.title].every(v=>typeof v==='string'&&!!v.trim())||!Number.isSafeInteger(n.version)||n.version<1||typeof n.read!=='boolean'||!Number.isFinite(Date.parse(n.createdAt))||!Array.isArray(n.changes)||n.changes.some(c=>typeof c!=='string'||!c.trim())||ids.has(n.id))throw Error('Повреждён журнал уведомлений')
  ids.add(n.id)
 }
 return {schemaVersion:1,baseline,items:s.items}
}
function install(state:NativeState){snapshot=parse(state.snapshot);enabled=state.enabled;permitted=state.permitted;if(state.openInbox)openRequest++;error='';emit()}
function serial(action:()=>Promise<void>){const next=queue.catch(()=>{}).then(action).catch(()=>{error='Не удалось сохранить или проверить уведомления. Повторите позже.';emit()});queue=next;return next}

export async function initializeCourseNotifications(manifest:LearningManifest,url:string){
 try{
  if(native){install(await bridge.configure({manifest,url}));await bridge.addListener('openInbox',()=>{openRequest++;emit();void refreshCourseNotices()})}
  else{const stored=readStored(key);snapshot=stored?parse(JSON.parse(stored)):reconcileNotices(null,manifest);if(!stored)await writeStored(key,JSON.stringify(snapshot));emit()}
 }catch{failed=true;error='Не удалось открыть журнал уведомлений. Сохранённые данные не перезаписаны.';emit()}
}
export function observeCourseManifest(manifest:LearningManifest){return serial(async()=>{
 if(failed)return
 if(native)install(await bridge.observe({manifest}))
 else{const next=reconcileNotices(snapshot,manifest);await writeStored(key,JSON.stringify(next));snapshot=next;error='';emit()}
})}
export function refreshCourseNotices(){return serial(async()=>{if(native&&!failed)install(await bridge.state())})}
export function readCourseNotice(id?:string){return serial(async()=>{
 if(failed)return
 if(native)install(await bridge.markRead(id?{id}:{}))
 else if(snapshot){const next={...snapshot,items:snapshot.items.map((n:CourseNotice)=>!id||n.id===id?{...n,read:true}:n)};await writeStored(key,JSON.stringify(next));snapshot=next;error='';emit()}
})}
export function setSystemCourseNotices(value:boolean){return serial(async()=>{if(native&&!failed)install(await(value?bridge.enable():bridge.disable()))})}
export function openCourseNoticeSettings(){return serial(async()=>{if(native)await bridge.openSettings()})}
