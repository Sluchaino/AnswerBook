import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {normalizeAspNetV2Rest} from '../scripts/lib/aspnet-v2-markdown.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,10)}),m=course.modules[9],placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m10')
test('validation module has ten supplied lessons, 90 questions and five distinct interactives',()=>{
 assert.equal(m.id,'m10');assert.equal(m.lessons.length,10);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5);assert.equal(new Set(placements.map(p=>p.lessonId)).size,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 assert.equal(allLearningQuestions(course).length,830);assert.equal(scoredLearningQuestions(course).length,650);assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,830)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,10);assert.ok(plan[9].lessons.every(l=>l.available));assert.ok(plan.slice(10).every(m=>!m.available))
})
test('previous nine modules, placements and C# course remain identical',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module10.json');assert.deepEqual(raw.modules.slice(0,9),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>Number(p.moduleId.slice(1))<=9),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('module10 exercises accept reference solutions and reject wrong solutions',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'different'};bad={...good,fixId:'equal'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='different')}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()}}
  assert.ok(checkExercise(e,good).correct,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('all module10 source code fences preserved; no author keys or sources in theory',()=>{
 const names=['01_resources_and_uri.md','02_http_methods_semantics.md','03_safe_and_idempotent.md','04_statuses_and_headers.md','05_dto_design_guidelines.md','06_filtering_and_sorting.md','07_pagination_offset_and_cursor.md','08_etag_and_conditional_requests.md','09_versioning_compatibility.md','10_openapi_contract_review.md']
 for(const [i,n]of names.entries()){const text=normalizeAspNetV2Rest(fs.readFileSync('server/theory-source/aspnet-core-v2-module10/'+n,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number:10,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);assert.ok(text.includes(m.lessons[i].title));for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
})

