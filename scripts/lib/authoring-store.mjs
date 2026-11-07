import {readFileSync,writeFileSync,renameSync,existsSync,mkdirSync,readdirSync,unlinkSync,mkdtempSync,rmSync} from 'node:fs'
import {resolve,join,relative,dirname} from 'node:path'
import {createHash,randomUUID} from 'node:crypto'
import {validateExercise,exerciseFingerprint} from '../../src/lib/exercises.ts'
import {validateDownloadedCourse} from '../../src/lib/learningDownloads.ts'
import {attachExercises} from './attach-exercises.mjs'
import {publishLearning} from '../publish-learning.mjs'
import {withContentLock} from './content-lock.mjs'
export class AuthoringError extends Error {constructor(status,message){super(message);this.status=status}}
const bad=message=>{throw new AuthoringError(400,message)}
const identifier=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(value)&&!['constructor','prototype'].includes(value)
const read=(path,fallback)=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):fallback
const hash=value=>createHash('sha256').update(value).digest('hex')
function atomic(path,value){mkdirSync(dirname(path),{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,value);renameSync(temp,path)}finally{if(existsSync(temp))unlinkSync(temp)}}
export function authoringCommand(root,input) {
 return withContentLock(()=>{
  const draftsPath=join(root,'server/exercise-drafts/drafts.json'),journal=join(root,'.tools/authoring-transaction.json'),sourceDir=join(root,'server/course-source'),contentDir=join(root,'server/AnswerBook.ContentApi/content')
  const safe=path=>{const file=resolve(root,path),rel=relative(root,file).replaceAll('\\','/');if(!rel.startsWith('server/')||rel.includes('..')||!rel.endsWith('.json'))throw new Error('Небезопасный путь транзакции');return file}
  function recover(){
   if(!existsSync(journal))return
   const entries=read(journal,[])
   // A crash after the final manifest rename must keep the committed version,
   // rather than rolling it back and reusing an already downloaded version.
   const complete=entries.length>0&&entries.every(old=>typeof old.newHash==='string'&&existsSync(safe(old.path))&&hash(readFileSync(safe(old.path),'utf8'))===old.newHash)
   if(!complete)for(const old of entries){const path=safe(old.path);if(old.value===null){if(existsSync(path))unlinkSync(path)}else atomic(path,old.value)}
   unlinkSync(journal)
  }
  recover()
  const courses=readdirSync(sourceDir).filter(f=>f.endsWith('.json')&&f!=='directions.json').map(f=>read(join(sourceDir,f)))
  for(const course of courses)validateDownloadedCourse(course)
  let drafts=read(draftsPath,[]);if(!Array.isArray(drafts)||drafts.length>1000)throw new Error('Повреждено хранилище черновиков')
  const sidePath=id=>join(root,'server/exercise-source',id+'.json'),sidecars=new Map(courses.map(c=>[c.id,read(sidePath(c.id),[])]))
  // Disk content is validated on reads too, before it can reach form renderers.
  for(const c of courses){const list=sidecars.get(c.id);if(!Array.isArray(list)||list.length>1000)bad('Повреждён источник упражнений');const modules=structuredClone(c.modules);for(const m of modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise');attachExercises(modules,list);validateDownloadedCourse({...c,modules})}
  for(const d of drafts){if(!d||!courses.some(c=>c.id===d.courseId))bad('Черновик ссылается на отсутствующий курс');validateExercise(d.exercise)}
  function revision(){return hash(JSON.stringify([drafts,courses,[...sidecars]]))}
  function load(){return {revision:revision(),courses:courses.map(c=>({id:c.id,title:c.title,version:c.version,modules:c.modules.map(m=>({id:m.id,title:m.title,lessons:m.lessons.map(l=>({id:l.id,title:l.title,blocks:l.blocks.filter(b=>b.kind!=='exercise').map(b=>({id:b.id,title:b.title,kind:b.kind}))}))}))})),entries:courses.flatMap(c=>{const published=sidecars.get(c.id);const ids=new Set([...published.map(p=>p.block.exercise.id),...drafts.filter(d=>d.courseId===c.id).map(d=>d.exercise.id)]);return [...ids].map(id=>({courseId:c.id,published:published.find(p=>p.block.exercise.id===id)??null,draft:drafts.find(d=>d.courseId===c.id&&d.exercise.id===id)??null}))})}}
  if(!input||typeof input.action!=='string')bad('Не указано действие редактора')
  if(input.action==='load')return load()
  if(input.revision!==revision())throw new AuthoringError(409,'Контент изменён в другом окне или импортёром. Сохранение отменено; обновите список и сравните изменения.')
  if(!identifier(input.courseId))bad('Неверный ID курса')
  const course=courses.find(c=>c.id===input.courseId);if(!course)bad('Курс не найден')
  let placements=sidecars.get(course.id)
  const current=id=>placements.find(p=>p.block.exercise.id===id)
  function placement(value){if(!value||Object.keys(value).sort().join(',')!=='afterBlockId,lessonId,moduleId')bad('Выберите модуль, урок и позицию');const lesson=course.modules.find(m=>m.id===value.moduleId)?.lessons.find(l=>l.id===value.lessonId);if(!lesson?.blocks.some(b=>b.kind!=='exercise'&&b.id===value.afterBlockId))bad('Позиция не найдена: выберите существующий блок урока');return structuredClone(value)}
  function entry(exercise,p,baseFingerprint){try{validateExercise(exercise)}catch(error){bad(`${exercise?.title??'Упражнение'}: ${error.message}`)}const published=current(exercise.id);if(published&&exercise.version!==published.block.exercise.version)bad('Черновик должен иметь номер текущей опубликованной версии; новая версия назначается при публикации');if(!published&&exercise.version!==1)bad('Новое упражнение начинается с версии 1');return {courseId:course.id,exercise:structuredClone(exercise),placement:placement(p),baseFingerprint}}
  function upsert(draft){drafts=drafts.filter(d=>!(d.courseId===course.id&&d.exercise.id===draft.exercise.id));drafts.push(draft)}
  let publish=false
  if(input.action==='save') {
   const old=current(input.exercise?.id),base=old?exerciseFingerprint(old.block.exercise):null
   if(input.baseFingerprint!==base)throw new AuthoringError(409,'Опубликованная версия отличается от основы черновика. Загрузите опубликованную версию или создайте копию.')
   upsert(entry(input.exercise,input.placement,base))
  } else if(input.action==='duplicate') {
   const original=drafts.find(d=>d.courseId===course.id&&d.exercise.id===input.id)??(current(input.id)?{exercise:current(input.id).block.exercise,placement:(({moduleId,lessonId,afterBlockId})=>({moduleId,lessonId,afterBlockId}))(current(input.id))}:null)
   if(!original)bad('Упражнение не найдено')
   const e=structuredClone(original.exercise);e.id='copy-'+randomUUID();e.version=1;e.title=(e.title+' — копия').slice(0,200);upsert(entry(e,original.placement,null))
  } else if(input.action==='import') {
   const values=Array.isArray(input.value)?input.value:[input.value];if(!values.length||values.length>100)bad('Импортируйте от 1 до 100 упражнений')
   const imported=[]
   for(const value of values){const e=structuredClone(value?.block?.exercise??value);if(input.asCopies){e.id='copy-'+randomUUID();e.version=1}if(current(e.id)||drafts.some(d=>d.courseId===course.id&&d.exercise.id===e.id)||imported.some(d=>d.exercise.id===e.id))bad('ID уже существует. Выберите импорт как копии; существующее упражнение не перезаписано.');const p=value?.block?{moduleId:value.moduleId,lessonId:value.lessonId,afterBlockId:value.afterBlockId}:input.placement;imported.push(entry(e,p,null))}
   drafts.push(...imported)
  } else if(input.action==='publish') {
   const draft=drafts.find(d=>d.courseId===course.id&&d.exercise.id===input.id);if(!draft)bad('Сначала сохраните черновик')
   const old=current(input.id),base=old?exerciseFingerprint(old.block.exercise):null
   if(draft.baseFingerprint!==base)throw new AuthoringError(409,'Опубликованная версия была изменена. Загрузите её заново или создайте копию черновика.')
   const next=entry(draft.exercise,draft.placement,base),exercise=next.exercise
   if(old&&JSON.stringify({...old.block.exercise,version:0})!==JSON.stringify({...exercise,version:0}))exercise.version=old.block.exercise.version+1
   placements=placements.filter(p=>p.block.exercise.id!==exercise.id)
   const p={...draft.placement,block:{id:old?.block.id??exercise.id,kind:'exercise',exercise}}
   const index=old?sidecars.get(course.id).indexOf(old):placements.length;placements.splice(index,0,p)
   upsert({...next,exercise,baseFingerprint:exerciseFingerprint(exercise)});publish=true
  } else if(input.action==='delete') {
   if(input.confirm!==input.id)bad('Подтвердите удаление выбранного упражнения')
   if(!current(input.id)&&!drafts.some(d=>d.courseId===course.id&&d.exercise.id===input.id))bad('Упражнение не найдено')
   const before=placements.length;placements=placements.filter(p=>p.block.exercise.id!==input.id);drafts=drafts.filter(d=>!(d.courseId===course.id&&d.exercise.id===input.id));publish=before!==placements.length
  } else if(input.action==='move') {
   const old=current(input.id);if(!old||![-1,1].includes(input.direction))bad('Неверное перемещение')
   const group=placements.filter(p=>p.moduleId===old.moduleId&&p.lessonId===old.lessonId&&p.afterBlockId===old.afterBlockId),pos=group.indexOf(old),other=group[pos+input.direction]
   if(!other)bad('Достигнут край группы упражнений');placements=[...placements];const a=placements.indexOf(old),b=placements.indexOf(other);[placements[a],placements[b]]=[placements[b],placements[a]];publish=true
  } else bad('Неизвестное действие редактора')
  if(drafts.length>1000||JSON.stringify(drafts).length>10_000_000)bad('Достигнут лимит черновиков: 1000 заданий или 10 МБ')
  const writes=new Map([[draftsPath,JSON.stringify(drafts,null,2)+'\n']]);let stage
  try {
   if(publish){const next=structuredClone(course);for(const m of next.modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise');attachExercises(next.modules,placements)
    if(JSON.stringify({...next,version:0})!==JSON.stringify({...course,version:0}))next.version++
    validateDownloadedCourse(next);writes.set(sidePath(course.id),JSON.stringify(placements,null,2)+'\n');writes.set(join(sourceDir,course.id+'.json'),JSON.stringify(next,null,2)+'\n')
    // Prepare immutable payloads before exposing any changed canonical source.
    mkdirSync(join(root,'.tools'),{recursive:true});stage=mkdtempSync(join(root,'.tools/author-publish-'));mkdirSync(join(stage,'source'));mkdirSync(join(stage,'content'))
    for(const c of courses)writeFileSync(join(stage,'source',c.id+'.json'),JSON.stringify(c.id===course.id?next:c))
    const oldManifest=read(join(contentDir,'catalog.json'),null)
    if(oldManifest)writeFileSync(join(stage,'content/catalog.json'),JSON.stringify(oldManifest))
    const manifest=publishLearning({input:join(stage,'source'),output:join(stage,'content'),revision:(oldManifest?.revision??0)+1})
    for(const f of manifest.courses){const dest=join(contentDir,'courses',f.file);if(!existsSync(dest)){mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(stage,'content/courses',f.file)))}}
    writes.set(join(contentDir,'catalog.json'),JSON.stringify(manifest,null,2)+'\n')
   }
   const undo=[...writes.keys()].map(path=>({path:relative(root,path),newHash:hash(writes.get(path)),value:existsSync(path)?readFileSync(path,'utf8'):null}));atomic(journal,JSON.stringify(undo))
   try{for(const [path,value] of writes)atomic(path,value);unlinkSync(journal)}catch(error){recover();throw error}
  } finally {if(stage&&dirname(stage)===join(root,'.tools')&&relative(join(root,'.tools'),stage).startsWith('author-publish-'))rmSync(stage,{recursive:true,force:true})}
  return {saved:true}
 },root)
}
