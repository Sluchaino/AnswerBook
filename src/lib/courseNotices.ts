import type {LearningManifest} from './learningDownloads.ts'

export type CourseNotice={id:string;courseId:string;version:number;title:string;createdAt:string;read:boolean;changes:string[]}
export type NoticeSnapshot={schemaVersion:1;baseline:LearningManifest;items:CourseNotice[]}

export function reconcileNotices(previous:NoticeSnapshot|null,manifest:LearningManifest,now=new Date().toISOString()):NoticeSnapshot {
 if(!previous)return {schemaVersion:1,baseline:manifest,items:[]}
 if(manifest.revision<previous.baseline.revision)return previous
 const items=[...previous.items],oldCourses=new Map(previous.baseline.courses.map(c=>[c.id,c]))
 for(const entry of manifest.courses){
  const old=oldCourses.get(entry.id),summary=entry.summary
  if(old&&entry.version<old.version)throw Error('Нельзя понизить версию курса в уведомлениях')
  if(!summary||old&&entry.version<=old.version)continue
  const changes:string[]=[]
  if(!old)changes.push('Новый курс')
  else if(old.summary){
   for(const module of summary.modules){
    const prior=old.summary.modules.find(m=>m.id===module.id)
    if(!prior){changes.push(`Новый модуль: ${module.title}`);continue}
    let lessonChanged=false
    for(const lesson of module.lessons){
     const before=prior.lessons.find(l=>l.id===lesson.id)
     if(!before){changes.push(`Новый урок: ${lesson.title}`);lessonChanged=true}
     else if(lesson.title!==before.title||lesson.contentHash&&before.contentHash&&lesson.contentHash!==before.contentHash){changes.push(`Обновлён урок: ${lesson.title}`);lessonChanged=true}
    }
    if(!lessonChanged&&(module.title!==prior.title||module.contentHash&&prior.contentHash&&module.contentHash!==prior.contentHash))changes.push(`Обновлён модуль: ${module.title}`)
   }
  }
  if(!changes.length)changes.push('Обновлены материалы курса')
  const id=`${entry.id}:v${entry.version}`
  if(!items.some(item=>item.id===id))items.unshift({id,courseId:entry.id,version:entry.version,title:summary.title,createdAt:now,read:false,changes})
 }
 return {schemaVersion:1,baseline:manifest,items:items.slice(0,100)}
}
