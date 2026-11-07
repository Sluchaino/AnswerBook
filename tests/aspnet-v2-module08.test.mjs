import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {normalizeAspNetV2Controllers} from '../scripts/lib/aspnet-v2-markdown.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,8)}),m=raw.modules.find(m=>m.id==='m08'),placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m08')
test('controllers module has nine original lessons, all 83 questions and five distinct exercises',()=>{
 assert.equal(m.lessons.length,9);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 assert.equal(allLearningQuestions(course).length,657);assert.equal(scoredLearningQuestions(course).length,515);assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,657)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,8);assert.ok(plan[7].lessons.every(l=>l.available));assert.ok(plan.slice(8).every(m=>!m.available))
})
test('first seven modules, exercises and C# remain unchanged',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module08.json');assert.deepEqual(raw.modules.slice(0,7),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>Number(p.moduleId.slice(1))<=7),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('controller reference answers and wrong API attributes grade correctly',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'api'};bad={...good,fixId:'produces'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='api')}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()}}
  assert.ok(checkExercise(e,good).correct,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('MVC source fences remain intact without author notes and keys',()=>{
 const names=['01_mvc_controllerbase.md','02_controllers_and_di.md','03_attribute_routing.md','04_apicontroller_automatic400.md','05_model_binding_modelstate.md','06_actionresult_contract.md','07_content_negotiation.md','08_mvc_filters.md','09_controllers_vs_minimal.md']
 for(const [i,n]of names.entries()){const text=normalizeAspNetV2Controllers(fs.readFileSync('server/theory-source/aspnet-core-v2-module08/'+n,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number:8,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
})
