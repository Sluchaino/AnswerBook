import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {normalizeAspNetV2Storage} from '../scripts/lib/aspnet-v2-markdown.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,14)}),m=course.modules[13],placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m14')
test('validation module has eight supplied lessons, 76 questions and five distinct interactives',()=>{
 assert.equal(m.id,'m14');assert.equal(m.lessons.length,8);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5);assert.equal(new Set(placements.map(p=>p.lessonId)).size,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 assert.equal(allLearningQuestions(course).length,1197);assert.equal(scoredLearningQuestions(course).length,935);assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,1197)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,14);assert.ok(plan[13].lessons.every(l=>l.available));assert.ok(plan.slice(14).every(m=>!m.available))
})
test('previous thirteen modules, placements and C# course remain identical',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module14.json');assert.deepEqual(raw.modules.slice(0,13),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>Number(p.moduleId.slice(1))<=13),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('module14 exercises accept reference solutions and reject wrong solutions',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'lexicographic'};bad={...good,fixId:'inclusive'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='lexicographic')}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()}}
  assert.ok(checkExercise(e,good).correct,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('all module14 source code fences preserved; no author keys or sources in theory',()=>{
 const names=['01_dbcontext_unit_of_work.md','02_repository_tradeoffs.md','03_application_service.md','04_atomic_updates.md','05_transaction_isolation.md','06_transactional_outbox.md','07_keyset_pagination.md','08_storage_layer_testing.md']
 for(const [i,n]of names.entries()){const text=normalizeAspNetV2Storage(fs.readFileSync('server/theory-source/aspnet-core-v2-module14/'+n,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number:14,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);assert.ok(text.includes(m.lessons[i].title));for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
})

