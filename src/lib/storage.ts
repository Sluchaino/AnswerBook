import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {privacyKey} from './privacy'
import {advertisingKey} from './advertising'
import { learningStorageKey } from './learning'
export { learningStorageKey } from './learning'

export const sessionKey = 'answerbook.session.v1'
export const customTopicsKey = 'answerbook.custom-topics.v1'
export const catalogKey = 'answerbook.catalog.v1'
export const profileKey = 'answerbook.profile.v1'
export const profileCleanupKey = 'answerbook.profile-cleanup.v1'
export const knowledgeKey = 'answerbook.knowledge.v1'
export const activityKey = 'answerbook.activity.v1'
export const themeKey = 'answerbook.theme.v1'
export const learningKey = 'answerbook.learning.csharp.v1'
const memory = new Map<string, string|null>()
let writes = Promise.resolve()
let revision=0
const listeners=new Set<()=>void>()
export function subscribeStorage(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener)}}
export const storageRevision=()=>revision
function publish() {revision++;for(const listener of listeners)listener()}

export function readStored(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!
  try { return localStorage.getItem(key) } catch { return null }
}

export async function initializeLearningStorage(ids:string[]) {
  if(!Capacitor.isNativePlatform())return
  for(const id of ids) {
    const key=learningStorageKey(id)
    if(!memory.has(stampKey(key)))memory.set(stampKey(key),(await Preferences.get({key:stampKey(key)})).value)
    if(memory.has(key))continue
    const {value}=await Preferences.get({key})
    memory.set(key,value)
  }
}
export async function initializeStorage(additionalCourseIds:string[]=[]) {
  if (!Capacitor.isNativePlatform()) return
  for (const key of [sessionKey, customTopicsKey, catalogKey, profileKey, profileCleanupKey, knowledgeKey, activityKey, themeKey, privacyKey, advertisingKey]) {
    const { value } = await Preferences.get({ key })
    if (value !== null) memory.set(key, value)
    else {
      const previous = readStored(key)
      if (previous !== null) { await Preferences.set({ key, value: previous }); memory.set(key, previous) }
    }
    const stamp=stampKey(key)
    memory.set(stamp,(await Preferences.get({key:stamp})).value)
  }
  await initializeLearningStorage(additionalCourseIds)
}

const stampKey=(key:string)=>`answerbook.revision:${key}`
export function readStorageSnapshot(key:string){
  const value=readStored(key)
  return {value,token:JSON.stringify([readStored(stampKey(key)),value])}
}
export const readStorageToken=(key:string)=>readStorageSnapshot(key).token
type ExpectedToken=string|(()=>string)
export class StorageWriteError extends Error {
  readonly retryToken:string
  constructor(message:string,retryToken:string){super(message);this.name='StorageWriteError';this.retryToken=retryToken}
}
function storeMutation<T>(key:string,action:()=>Promise<T>):Promise<T>{
  const run=()=>!Capacitor.isNativePlatform()&&typeof navigator!=='undefined'&&navigator.locks
    ?navigator.locks.request(`kodshag-storage:${key}`,action):action()
  const next=writes.catch(()=>{}).then(run);writes=next.then(()=>{},()=>{});return next
}
export function writeStored(key:string,value:string,expected?:ExpectedToken):Promise<string>{
  return storeMutation(key,async()=>{
    const current=readStorageSnapshot(key)
    if(expected!==undefined&&current.token!==(typeof expected==='function'?expected():expected))throw Error('Данные изменены в другой вкладке. Откройте раздел заново или перезагрузите страницу.')
    if(current.value===value)return current.token
    const stamp=crypto.randomUUID()
    const oldStamp=readStored(stampKey(key))
    try{
      if(Capacitor.isNativePlatform()){
        await Preferences.set({key:stampKey(key),value:stamp});memory.set(stampKey(key),stamp)
        await Preferences.set({key,value});memory.set(key,value)
      }else{localStorage.setItem(stampKey(key),stamp);localStorage.setItem(key,value)}
    }catch(error){
      // Failed payload writes must not turn an ordinary retry into a stale-save conflict.
      try{
        if(Capacitor.isNativePlatform()){
          if(oldStamp===null)await Preferences.remove({key:stampKey(key)})
          else await Preferences.set({key:stampKey(key),value:oldStamp})
          memory.set(stampKey(key),oldStamp)
        }else if(oldStamp===null)localStorage.removeItem(stampKey(key))
        else localStorage.setItem(stampKey(key),oldStamp)
      }catch{/* Preserve a retry token even if metadata rollback also fails. */}
      throw new StorageWriteError(error instanceof Error?error.message:'Не удалось сохранить данные.',readStorageToken(key))
    }
    publish();return readStorageToken(key)
  })
}
export function removeStored(key:string):Promise<void>{
  return storeMutation(key,async()=>{
    const stamp=crypto.randomUUID()
    if(Capacitor.isNativePlatform()){
      await Preferences.set({key:stampKey(key),value:stamp});memory.set(stampKey(key),stamp)
      try{localStorage.removeItem(key)}catch{/* Native Preferences is authoritative. */}
      await Preferences.remove({key});memory.set(key,null)
    }else{localStorage.setItem(stampKey(key),stamp);localStorage.removeItem(key)}
    publish()
  })
}
