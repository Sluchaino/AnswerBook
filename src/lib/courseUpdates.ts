import {clearCourseCompletion,parseProfile} from './profile'
import {Capacitor} from '@capacitor/core'
import contentHost from '../data/content-host.json'
import {shippedCatalog,installLibrary,learningCourses,savedProgress} from './learningContent'
import {CourseLibrary,emptyLibrary,restoreLibrary,savedCourseProgress} from './courseLibrary'
import {readLearningCache,writeLearningCache} from './learningCache'
import {initializeLearningStorage,readStored,readStorageSnapshot,removeStored,writeStored,profileKey,profileCleanupKey,initializeStorage,learningStorageKey} from './storage'
import {initializeCourseNotifications,observeCourseManifest} from './courseNotifications'

export const coursesUrl=import.meta.env.VITE_COURSES_URL || (import.meta.env.DEV && !Capacitor.isNativePlatform() ? '/api/catalog' : contentHost.catalogUrl)
let library:CourseLibrary
let storageError=false
const makeLibrary=(state:ReturnType<typeof emptyLibrary>,raw:string|null)=>{
  let baseline=raw
  return new CourseLibrary(state,new URL(coursesUrl,location.href).href,async next=>{
    await initializeLearningStorage(next.manifest.courses.map(c=>c.id))
    const text=JSON.stringify(next)
    await writeLearningCache(text,baseline);baseline=text
  },installLibrary)
}
function deferredProfileIds():string[]{
  try{const ids=JSON.parse(readStored(profileCleanupKey)??'[]');return Array.isArray(ids)?ids.filter((id:unknown):id is string=>typeof id==='string'):[]}catch{return []}
}
async function cleanProfile(ids:string[]){
  const snapshot=readStorageSnapshot(profileKey)
  let profile
  try{profile=parseProfile(snapshot.value)}catch{
    // Preserve the damaged profile; isolate its cleanup from application startup.
    await writeStored(profileCleanupKey,JSON.stringify([...new Set([...deferredProfileIds(),...ids])]))
    return
  }
  for(const id of [...new Set([...deferredProfileIds(),...ids])])profile=clearCourseCompletion(profile,id)
  await writeStored(profileKey,JSON.stringify(profile),snapshot.token)
  if(readStored(profileCleanupKey)!==null)await removeStored(profileCleanupKey)
}
async function finishPending(){
  for(const id of [...(ready().state.pendingPurges??[])]){
    await removeStored(learningStorageKey(id))
    await cleanProfile([id])
    await ready().completePurge(id)
  }
  if(deferredProfileIds().length)await cleanProfile([])
}
let operations:Promise<unknown>=Promise.resolve()
function operation(action:()=>Promise<void>){
  const run=async()=>{
    if(!Capacitor.isNativePlatform()){
      const raw=await readLearningCache()
      library=makeLibrary(restoreLibrary(raw,shippedCatalog),raw)
    }
    await finishPending();await action()
  }
  const next=operations.catch(()=>{}).then(()=>!Capacitor.isNativePlatform()&&navigator.locks?navigator.locks.request('kodshag-course-library',run):run())
  operations=next;return next
}
export async function initializeLearningContent(){
  try{const raw=await readLearningCache();library=makeLibrary(restoreLibrary(raw,shippedCatalog),raw)}
  catch{storageError=true;library=makeLibrary(emptyLibrary(shippedCatalog),null)}
  if(!storageError){await initializeStorage();await operation(async()=>{})}
  installLibrary(library.state)
  await initializeCourseNotifications(library.state.manifest,new URL(coursesUrl,location.href).href)
}
function ready(){if(storageError)throw Error('Не удалось прочитать хранилище курсов. Перезапустите приложение: прежние материалы не перезаписаны.');if(!library)throw Error('Библиотека ещё не открыта');return library}
export async function refreshLearningContent(){await operation(async()=>{await ready().refresh();await observeCourseManifest(ready().state.manifest)});return 'Каталог обновлён · выберите курсы для скачивания'}
export async function downloadCourse(id:string){await operation(async()=>{await ready().download(id)})}
export async function removeCourse(id:string,clearProgress=false){
  await operation(async()=>{
    // Commit the durable deletion intent before touching answers or profile.
    await ready().remove(id,readStored(learningStorageKey(id)),clearProgress)
    if(clearProgress){
      try{await finishPending()}
      catch{throw Error('Удаление сохранено и будет завершено при следующем запуске. Повторите действие или перезапустите приложение.')}
    }
  })
}
export function readCourseProgress(id:string){
  const installed=learningCourses.find(c=>c.id===id)
  return installed?savedCourseProgress(installed,readStored(learningStorageKey(id))):savedProgress[id]
}
