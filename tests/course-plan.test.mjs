import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {coursePlanModules,validateCoursePlan} from '../src/lib/coursePlan.ts'
import {validateDownloadedCourse,validateLearningBundle} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {courseDocument} from '../src/lib/courseStructure.ts'
import {checkExercise,validateExercise} from '../src/lib/exercises.ts'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,1)})
test('new ASP.NET has seven supplied lessons, 69 questions and five exercises in distinct lessons',()=>{
 assert.equal(course.modules.length,1);assert.equal(course.modules[0].lessons.length,7)
 assert.equal(allLearningQuestions(course).length,69);assert.equal(scoredLearningQuestions(course).length,55)
 const exercises=course.modules[0].lessons.flatMap(l=>{const e=l.blocks.filter(b=>b.kind==='exercise');assert.ok(e.length<=1);return e})
 assert.equal(exercises.length,5);for(const b of exercises){const e=validateExercise(b.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'created'};bad={...good,fixId:'ok'}}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()}}
  assert.ok(checkExercise(e,good).correct);assert.equal(checkExercise(e,bad).correct,false)
 }
})
test('availability follows downloaded materials, not the completed status in source outline',()=>{
 const plan=coursePlanModules(course);assert.equal(plan.length,27);assert.equal(plan.filter(m=>m.available).length,1)
 assert.ok(plan[0].lessons.every(l=>l.available));assert.ok(plan.slice(1).every(m=>!m.available&&m.lessons.every(l=>!l.available)))
 assert.equal(course.lessons.some(l=>l.step?.moduleId==='m02'),false)
 const received={...course,modules:[...course.modules,{...course.modules[0],id:'m02',lessons:[{id:'m02-l01',title:'Generic Host и минимальная модель хостинга'}]}]}
 assert.ok(coursePlanModules(received)[1].available);assert.equal(coursePlanModules(received)[1].lessons.filter(l=>l.available).length,1)
})
test('plan survives publication and offline cache without becoming scoreable content',()=>{
 const document=courseDocument(course);assert.deepEqual(document.plan,raw.plan);const restored=validateDownloadedCourse(JSON.parse(JSON.stringify(document)))
 const bundle=validateLearningBundle({schemaVersion:1,revision:1,directions:[{id:'web',title:'Web',description:'Web'}],courses:[document],fingerprints:{}})
 assert.deepEqual(bundle.courses[0].plan,raw.plan);assert.equal(scoredLearningQuestions(restored).length,55)
})
test('existing C# receives an overview from actual modules without source migration',()=>{
 const cs=validateDownloadedCourse(read('server/course-source/csharp-foundations-v2.json')),plan=coursePlanModules(cs)
 assert.equal(plan.length,19);assert.ok(plan.every(m=>m.available&&m.lessons.every(l=>l.available)));assert.equal(cs.plan,undefined)
})
test('invalid plans cannot hide actual lessons or reuse identities',()=>{
 for(const mutate of [p=>p.modules.push(p.modules[0]),p=>p.modules[1].lessons.push(p.modules[0].lessons[0]),p=>p.modules.shift(),p=>p.modules[0].lessons.pop(),p=>p.prerequisites=['']]){
  const plan=structuredClone(raw.plan);mutate(plan);assert.throws(()=>validateCoursePlan(plan,raw.modules))
 }
})
test('all source fenced examples remain in new lessons and source footers stay hidden',()=>{
 const names=['01_aspnet_ecosystem.md','02_http_request_response.md','03_kestrel_pipeline.md','04_install_cli_project.md','05_program_host_lifecycle.md','06_first_endpoints.md','07_http_diagnostics.md']
 for(const [i,n]of names.entries()){const text=fs.readFileSync('server/theory-source/aspnet-core-v2-module01/'+n,'utf8').replaceAll('\r\n','\n'),parts=raw.modules[0].lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
})
