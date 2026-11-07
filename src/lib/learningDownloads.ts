import {validateLearningCourse} from './learning.ts'
import type {LearningCourse} from './learning.ts'
import {retiredCourseIds} from './retiredCourses.ts'
import {validateCourseSummary} from './courseCatalog.ts'
import type {CourseSummary} from './courseCatalog.ts'

export type LearningDirection={id:string;title:string;description:string}
export type DownloadedCourse=LearningCourse & {direction:string;scope:string;symbol:string;color:string;topicIds:string[]}
export type LearningBundle={schemaVersion:1;revision:number;source?:string;directions:LearningDirection[];courses:DownloadedCourse[];fingerprints:Record<string,string>;removedIds?:string[]}
export type CourseEntry={id:string;version:number;file:string;sha256:string;bytes:number;summary?:CourseSummary}
export type LearningManifest={schemaVersion:1;revision:number;directions:LearningDirection[];courses:CourseEntry[];removedIds?:string[]}
const identifier=(s:unknown):s is string=>typeof s==='string' && /^[a-z0-9][a-z0-9-]{0,119}$/.test(s)
const text=(s:unknown):s is string=>typeof s==='string' && s.trim().length>0 && s.length<=20000
const colors=new Set(['violet','blue','orange','green','pink','teal'])
function validateDirections(input:unknown):LearningDirection[] {
  const list=input as LearningDirection[]
  if(!Array.isArray(list)||list.length>100||new Set(list.map(d=>d?.id)).size!==list.length||list.some(d=>!d||!identifier(d.id)||!text(d.title)||!text(d.description)))throw new Error('Неверные направления курсов')
  return list
}
export function validateDownloadedCourse(input:unknown):DownloadedCourse {
  const course=validateLearningCourse(input) as DownloadedCourse
  if(!identifier(course.id)||!identifier(course.direction)||!['dotnet','python','universal'].includes(course.scope)||!text(course.symbol)||!colors.has(course.color)||!Array.isArray(course.topicIds)||course.topicIds.some(id=>!identifier(id)))throw new Error('Неверная карточка курса')
  let questions=0,parts=0
  if(course.lessons.length>(course.modules ? 10000 : 2000))throw new Error('Слишком большой курс')
  for(const lesson of course.lessons) {
    questions+=lesson.questions.length
    if(!Array.isArray(lesson.reading)||lesson.reading.length>300)throw new Error('Нет теории курса')
    for(const section of lesson.reading) {
      if(!section||!text(section.title)||(!course.modules && (!text(section.source)||!text(section.pages)))||!Array.isArray(section.content)||!section.content.length)throw new Error('Неверный раздел теории')
      for(const part of section.content)if(!part||!['paragraph','heading','code','table'].includes(part.kind)||!text(part.text)||++parts>30000)throw new Error('Неверная теория')
    }
  }
  if(questions>5000)throw new Error('Слишком много заданий')
  const previousEdition=(input:LearningCourse,parentVersion:number,depth:number):LearningCourse=>{
    if(depth>5 || input.id!==course.id || input.version>=parentVersion)throw new Error('Неверная история курса')
    const previous=validateLearningCourse(input)
    return {...previous,previous:previous.previous ? previousEdition(previous.previous,previous.version,depth+1) : undefined}
  }
  if(course.previous)course.previous=previousEdition(course.previous,course.version,1)
  return course
}
export function validateLearningBundle(input:unknown):LearningBundle {
  const b=input as LearningBundle
  if(!b||b.schemaVersion!==1||!Number.isSafeInteger(b.revision)||b.revision<0||!Array.isArray(b.courses)||b.courses.length>500||new Set(b.courses.map(c=>c?.id)).size!==b.courses.length||!b.fingerprints||typeof b.fingerprints!=='object'||Array.isArray(b.fingerprints))throw new Error('Неверный кеш курсов')
  validateRemovedIds(b.removedIds)
  validateDirections(b.directions)
  const courses=b.courses.map(validateDownloadedCourse)
  for(const course of courses)if(!b.directions.some(d=>d.id===course.direction))throw new Error('Неизвестное направление')
  if(Object.values(b.fingerprints).some(hash=>typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)))throw new Error('Неверная контрольная сумма')
  return {...b,courses}
}
export function validateLearningManifest(input:unknown):LearningManifest {
  const m=input as LearningManifest
  if(!m||m.schemaVersion!==1||!Number.isSafeInteger(m.revision)||m.revision<1||!Array.isArray(m.courses)||m.courses.length>500||new Set(m.courses.map(c=>c?.id)).size!==m.courses.length)throw new Error('Неверный каталог курсов')
  validateRemovedIds(m.removedIds)
  if(m.courses.some(c=>m.removedIds?.includes(c.id)))throw new Error('Удалённый курс есть в каталоге')
  validateDirections(m.directions)
  for(const c of m.courses)if(!c||!identifier(c.id)||!Number.isSafeInteger(c.version)||c.version<1||typeof c.sha256!=='string'||!/^[a-f0-9]{64}$/.test(c.sha256)||c.file!==`${c.id}-v${c.version}-${c.sha256}.json`||!Number.isSafeInteger(c.bytes)||c.bytes<1||c.bytes>8_000_000)throw new Error('Неверный файл курса')
  for(const c of m.courses)if(c.summary){c.summary=validateCourseSummary(c.summary);if(c.summary.id!==c.id||c.summary.version!==c.version||!m.directions.some(d=>d.id===c.summary!.direction))throw Error('Описание не соответствует курсу')}
  return m
}
function validateRemovedIds(ids:unknown) {
  if(ids!==undefined && (!Array.isArray(ids)||ids.length>5000||new Set(ids).size!==ids.length||ids.some(id=>!identifier(id))))throw new Error('Неверный список удалённых курсов')
}
export function purgeRemovedCourses(bundle:LearningBundle,extraIds:readonly string[]=[]):LearningBundle {
  const removedIds=[...new Set([...retiredCourseIds,...(bundle.removedIds??[]),...extraIds])]
  const removed=new Set(removedIds),courses=bundle.courses.filter(c=>!removed.has(c.id))
  const fingerprints=Object.fromEntries(Object.entries(bundle.fingerprints).filter(([id])=>!removed.has(id)))
  if(courses.length===bundle.courses.length && Object.keys(fingerprints).length===Object.keys(bundle.fingerprints).length && JSON.stringify(removedIds)===JSON.stringify(bundle.removedIds))return bundle
  return {...bundle,courses,fingerprints,removedIds}
}
export async function fetchLearningBundle(url:string,current:LearningBundle,persist:(bundle:LearningBundle)=>Promise<void>,fetcher:typeof fetch=fetch):Promise<LearningBundle> {
  const base=new URL(url)
  if(base.username||base.password||base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw new Error('Для сервера курсов нужен HTTPS без пароля в адресе')
  const get=async(url:string,limit:number)=>{
    const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(20000)})
    if(!response.ok)throw new Error('Сервер курсов недоступен')
    if(Number(response.headers.get('content-length'))>limit)throw new Error('Файл курса слишком большой')
    if(!response.body)throw new Error('Пустой ответ сервера')
    const reader=response.body.getReader(),chunks:Uint8Array[]=[],decoder=new TextDecoder('utf-8',{fatal:true})
    let length=0
    try {while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>limit)throw new Error('Файл курса слишком большой');chunks.push(chunk.value)}}finally{await reader.cancel().catch(()=>{})}
    const bytes=new Uint8Array(length);let offset=0
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return {bytes,text:decoder.decode(bytes)}
  }
  const manifest=validateLearningManifest(JSON.parse((await get(base.href,1_000_000)).text))
  if(current.source===base.href && manifest.revision<=current.revision) {
    const cleaned=purgeRemovedCourses(current)
    if(cleaned!==current)await persist(cleaned)
    return cleaned
  }
  current=purgeRemovedCourses(current,manifest.removedIds)
  const courses=new Map(current.courses.map(c=>[c.id,c])),fingerprints={...current.fingerprints}
  // Download at most four courses at a time. Nothing becomes visible before the full update is saved.
  const queue=manifest.courses.filter(c=>!current.removedIds?.includes(c.id))
  await Promise.all(Array.from({length:4},async()=>{
    while(queue.length) {
      const entry=queue.shift()!,old=courses.get(entry.id)
      if(old && old.version>entry.version)continue
      if(old && old.version===entry.version && Object.hasOwn(fingerprints,entry.id)) {
        if(fingerprints[entry.id]!==entry.sha256)throw new Error('Содержимое курса изменено без повышения версии')
        continue
      }
      const file=await get(new URL(`courses/${entry.file}`,base).href,entry.bytes)
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',file.bytes))).map(b=>b.toString(16).padStart(2,'0')).join('')
      if(file.bytes.length!==entry.bytes||hash!==entry.sha256)throw new Error('Файл курса загружен не полностью')
      const course=validateDownloadedCourse(JSON.parse(file.text))
      if(course.id!==entry.id||course.version!==entry.version)throw new Error('Версия курса не совпадает с каталогом')
      // Retain the preceding version for old result reconstruction, without discarding server history.
      if(old && old.version<course.version && !course.previous) {
        const retain=(previous:LearningCourse,depth:number):LearningCourse=>({...previous,previous:previous.previous && depth<4 ? retain(previous.previous,depth+1) : undefined})
        course.previous=retain(old,1)
      }
      courses.set(course.id,course);fingerprints[course.id]=hash
    }
  }))
  const directions=new Map(current.directions.map(d=>[d.id,d]))
  for(const d of manifest.directions)directions.set(d.id,d)
  const next=validateLearningBundle({schemaVersion:1,revision:manifest.revision,source:base.href,directions:[...directions.values()],courses:[...courses.values()],fingerprints,removedIds:current.removedIds})
  if(JSON.stringify(next).length>40_000_000)throw new Error('Каталог слишком большой для устройства')
  await persist(next)
  return next
}
