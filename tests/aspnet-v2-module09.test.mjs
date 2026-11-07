import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {normalizeAspNetV2Errors} from '../scripts/lib/aspnet-v2-markdown.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,9)}),m=course.modules[8],placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m09')
test('validation module has nine supplied lessons, 83 questions and five distinct interactives',()=>{
 assert.equal(m.id,'m09');assert.equal(m.lessons.length,9);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5);assert.equal(new Set(placements.map(p=>p.lessonId)).size,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 assert.equal(allLearningQuestions(course).length,740);assert.equal(scoredLearningQuestions(course).length,580);assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,740)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,9);assert.ok(plan[8].lessons.every(l=>l.available));assert.ok(plan.slice(9).every(m=>!m.available))
})
test('previous eight modules, placements and C# course remain identical',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module09.json');assert.deepEqual(raw.modules.slice(0,8),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>Number(p.moduleId.slice(1))<=8),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('module09 exercises accept reference solutions and reject wrong solutions',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'handler'};bad={...good,fixId:'status'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='handler')}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()}}
  assert.ok(checkExercise(e,good).correct,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('all module09 source code fences preserved; no author keys or sources in theory',()=>{
 const names=['01_data_annotations.md','02_request_dto_validation.md','03_business_invariants.md','04_domain_error_design.md','05_problem_details_rfc9457.md','06_exception_handler.md','07_binding_validation_auth.md','08_safe_error_messages.md','09_negative_scenario_testing.md']
 for(const [i,n]of names.entries()){const text=normalizeAspNetV2Errors(fs.readFileSync('server/theory-source/aspnet-core-v2-module09/'+n,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number:9,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);assert.ok(text.includes(m.lessons[i].title));for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
})

