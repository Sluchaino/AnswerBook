import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {withContentLock} from './lib/content-lock.mjs'
const source=resolve(process.argv[2]??'C:/Users/vhnkg/Downloads/ASP_NET_Core_10_REBUILT_Course (2)/ASP_NET_Core_10_Rebuilt_Course')
const courseFile='server/course-source/aspnet-core-foundations-v2.json',sideFile='server/exercise-source/aspnet-core-foundations-v2.json',read=p=>JSON.parse(fs.readFileSync(p))
const baseline='tests/fixtures/aspnet-v2-before-directory16.json'
if(!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify({modules:read(courseFile).modules.slice(0,15),placements:read(sideFile).filter(p=>Number(p.moduleId.slice(1))<=15),csharpHash:createHash('sha256').update(fs.readFileSync('server/course-source/csharp-foundations-v2.json')).digest('hex')}))
const run=()=>{const r=spawnSync(process.execPath,['--experimental-strip-types','scripts/import-aspnet-v2.mjs'],{encoding:'utf8'});if(r.status!==0)throw Error(r.stdout+r.stderr)}
const results=[]
for(let number=16;number<=27;number++){
 const incoming=join(source,`Module_${number}`);if(!fs.existsSync(incoming))break
 const target=`server/theory-source/aspnet-core-v2-module${number}`,moduleId=`m${number}`
 fs.mkdirSync(target,{recursive:true})
 const files=fs.readdirSync(incoming).filter(n=>n.endsWith('.md'))
 for(const file of files){const bytes=fs.readFileSync(join(incoming,file)),dest=join(target,file);if(fs.existsSync(dest)&&!fs.readFileSync(dest).equals(bytes))throw Error('Существующий источник отличается: '+dest);fs.writeFileSync(dest,bytes)}
 run()
 const course=validateDownloadedCourse(read(courseFile)),module=course.modules.find(m=>m.id===moduleId)
 const existing=read(sideFile).filter(p=>p.moduleId===moduleId)
 if(!existing.length){
  const indices=Array.from({length:5},(_,i)=>Math.round(i*(module.lessons.length-1)/4))
  const placements=indices.map(index=>{
   const lesson=module.lessons[index],seen=new Set(),questions=lesson.finalTest.questions.filter(q=>{
    if(q.kind!=='choice'||q.code)return false
    const answer=q.options[q.correct];if(seen.has(answer)||answer.length>1800||q.prompt.length>1800)return false;seen.add(answer);return true
   }).slice(0,5)
   if(questions.length<3)throw Error('Нужна ручная подготовка интерактива: '+lesson.id)
   const id=`aspnet-v2-${moduleId}-apply-${String(index+1).padStart(2,'0')}`
   const exercise=validateExercise({id,type:'matching',version:1,title:'Ситуации и решения: '+lesson.title,description:'Сопоставьте вопросы по материалу урока с подходящими объяснениями или действиями. Каждое решение используется один раз.',instructions:'Сначала установите все соответствия, затем проверьте ответ. Вернитесь к примерам теории при необходимости.',content:{left:questions.map((q,i)=>({id:'q'+i,label:q.prompt})),right:questions.map((q,i)=>({id:'a'+i,label:q.options[q.correct]}))},validation:{pairs:Object.fromEntries(questions.map((_,i)=>['q'+i,'a'+i]))},feedback:{success:'Все соответствия верны.',failure:'Проверьте назначение механизмов и условия применения.',explanation:questions.map(q=>q.explanation).join('\n\n')},settings:{practice:true,shuffle:true},difficulty:'intermediate'})
   const good={type:'matching',pairs:exercise.validation.pairs};if(!checkExercise(exercise,good).correct)throw Error('Неверный ключ интерактива')
   return {moduleId,lessonId:lesson.id,afterBlockId:'application',block:{id,kind:'exercise',exercise}}
  })
  withContentLock(()=>{const current=read(sideFile);if(current.some(p=>p.moduleId===moduleId))throw Error('Упражнения изменены параллельно');fs.writeFileSync(sideFile,JSON.stringify([...current,...placements],null,2)+'\n')})
 }
 run()
 const verified=validateDownloadedCourse(read(courseFile)).modules.find(m=>m.id===moduleId)
 if(verified.lessons.length!==files.filter(n=>/^\d\d_/.test(n)).length||verified.lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='exercise')).length!==5||verified.lessons.some(l=>l.blocks.filter(b=>b.kind==='exercise').length>1))throw Error('Неверная структура '+moduleId)
 const result={moduleId,title:verified.title,lessons:verified.lessons.length,questions:verified.lessons.length*7+20,interactives:5}
 results.push(result);console.log(JSON.stringify(result))
}
fs.writeFileSync('artifacts/aspnet-directory-import-report.json',JSON.stringify(results,null,2))
