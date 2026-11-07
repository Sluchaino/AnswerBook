import {fetchLearningBundle,validateLearningBundle,validateLearningManifest,purgeRemovedCourses} from './learningDownloads.ts'
import type {DownloadedCourse,LearningBundle,LearningManifest,CourseEntry} from './learningDownloads.ts'
import {summarizeCourse} from './courseCatalog.ts'
import {learningProgress,learningModuleProgress,restoreLearningAttempt} from './learning.ts'

export type CourseProgressSummary={started:boolean;completed:boolean;percent:number;modulesCompleted:number;modulesTotal:number}
export type LibrarySnapshot={libraryVersion:1;manifest:LearningManifest;installed:LearningBundle;progress:Record<string,CourseProgressSummary>;pendingPurges?:string[]}
export function savedCourseProgress(course:DownloadedCourse,raw:string|null):CourseProgressSummary {
  const attempt=restoreLearningAttempt(raw,course,course.previous),modules=learningModuleProgress(course,attempt)
  return {...learningProgress(course,attempt),modulesCompleted:modules.completed,modulesTotal:modules.total}
}
export function emptyLibrary(manifest:LearningManifest):LibrarySnapshot {
  return {libraryVersion:1,manifest:validateLearningManifest(structuredClone(manifest)),installed:{schemaVersion:1,revision:0,directions:manifest.directions,courses:[],fingerprints:{}},progress:{}}
}
export function restoreLibrary(raw:string|null,seed:LearningManifest):LibrarySnapshot {
  const initial=emptyLibrary(seed)
  if(!raw)return initial
  const value=JSON.parse(raw)
  if(value.libraryVersion===undefined){const installed=purgeRemovedCourses(validateLearningBundle(value));return {...initial,installed}}
  if(value.libraryVersion!==1)throw Error('Неизвестная версия библиотеки курсов')
  const installed=purgeRemovedCourses(validateLearningBundle(value.installed)),manifest=validateLearningManifest(value.manifest)
  if(!value.progress||typeof value.progress!=='object'||Array.isArray(value.progress))throw Error('Неверные сохранённые показатели курсов')
  for(const p of Object.values(value.progress) as CourseProgressSummary[])if(!p||typeof p.started!=='boolean'||typeof p.completed!=='boolean'||!Number.isFinite(p.percent)||p.percent<0||p.percent>100||![p.modulesCompleted,p.modulesTotal].every(n=>Number.isSafeInteger(n)&&n>=0)||p.modulesCompleted>p.modulesTotal)throw Error('Неверный прогресс курса')
  if(value.pendingPurges!==undefined&&(!Array.isArray(value.pendingPurges)||value.pendingPurges.some((id:unknown)=>typeof id!=='string'||!id)))throw Error('Неверный журнал удаления')
  return {libraryVersion:1,manifest:manifest.revision>=seed.revision?manifest:initial.manifest,installed,progress:value.progress,...(value.pendingPurges?{pendingPurges:[...new Set<string>(value.pendingPurges)]}:{})}
}
export function libraryEntries(state:LibrarySnapshot):CourseEntry[] {
  return state.manifest.courses.map(entry=>({...entry,summary:entry.summary??(state.installed.courses.find(c=>c.id===entry.id)?summarizeCourse(state.installed.courses.find(c=>c.id===entry.id)!):undefined)}))
}
// All cache mutations are serialized. Publish only after durable storage succeeds.
export class CourseLibrary {
  state:LibrarySnapshot
  private queue:Promise<unknown>=Promise.resolve()
  private url:string
  private persist:(next:LibrarySnapshot)=>Promise<void>
  private publish:(next:LibrarySnapshot)=>void
  private fetcher:typeof fetch
  constructor(state:LibrarySnapshot,url:string,persist:(next:LibrarySnapshot)=>Promise<void>,publish:(next:LibrarySnapshot)=>void=()=>{},fetcher:typeof fetch=fetch){this.state=state;this.url=url;this.persist=persist;this.publish=publish;this.fetcher=(input,init)=>fetcher(input,init)}
  private run(action:()=>Promise<LibrarySnapshot>){
    const next=this.queue.catch(()=>{}).then(async()=>{const state=await action();if(state===this.state)return;await this.persist(state);this.state=state;this.publish(state)})
    this.queue=next;return next
  }
  refresh(){return this.run(async()=>{
    const response=await this.fetcher(this.url,{cache:'no-store',signal:AbortSignal.timeout(20000)})
    if(!response.ok)throw Error('Не удалось загрузить каталог')
    if(!response.body)throw Error('Пустой каталог')
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0
    try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1_000_000)throw Error('Каталог слишком большой');text+=decoder.decode(value,{stream:true})}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
    const manifest=validateLearningManifest(JSON.parse(text))
    if(manifest.revision<this.state.manifest.revision)return this.state
    const old=new Map(this.state.manifest.courses.map(c=>[c.id,c]))
    for(const entry of manifest.courses){
      const prior=old.get(entry.id)
      if(prior&&prior.version===entry.version&&prior.sha256!==entry.sha256)throw Error('Курс изменён без новой версии')
      entry.summary??=prior?.version===entry.version?prior.summary:undefined
      if(!entry.summary)throw Error('Для курса отсутствует описание: обновите catalog.json')
    }
    return {...this.state,manifest,installed:purgeRemovedCourses(this.state.installed,manifest.removedIds)}
  })}
  download(id:string){return this.run(async()=>{
    const entry=this.state.manifest.courses.find(c=>c.id===id)
    if(!entry)throw Error('Курс не найден в каталоге')
    const old=this.state.installed.courses.find(c=>c.id===id)
    if(old?.version===entry.version&&this.state.installed.fingerprints[id]===entry.sha256)return this.state
    const manifest={...this.state.manifest,courses:[entry]}
    const fetcher:typeof fetch=(input,init)=>String(input)===this.url?Promise.resolve(new Response(JSON.stringify(manifest))):this.fetcher(input,init)
    const installed=await fetchLearningBundle(this.url,{...this.state.installed,source:undefined},async()=>{},fetcher)
    return {...this.state,installed}
  })}
  remove(id:string,rawAttempt:string|null,clearProgress=false){return this.run(async()=>{
    const course=this.state.installed.courses.find(c=>c.id===id)
    if(!course&&!clearProgress)return this.state
    const progress={...this.state.progress}
    if(clearProgress)delete progress[id]
    else if(course)progress[id]=savedCourseProgress(course,rawAttempt)
    const fingerprints={...this.state.installed.fingerprints};delete fingerprints[id]
    return {...this.state,progress,...(clearProgress?{pendingPurges:[...new Set([...(this.state.pendingPurges??[]),id])]}:{}),installed:{...this.state.installed,courses:this.state.installed.courses.filter(c=>c.id!==id),fingerprints}}
  })}
  completePurge(id:string){return this.run(async()=>({...this.state,pendingPurges:(this.state.pendingPurges??[]).filter(value=>value!==id)}))}
}
