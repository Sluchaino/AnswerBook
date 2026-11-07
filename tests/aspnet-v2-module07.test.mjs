import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,7)}),m=raw.modules.find(m=>m.id==='m07'),placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m07')
test('Minimal APIs module has nine supplied lessons, 83 questions and five distinct exercises',()=>{
 assert.equal(m.lessons.length,9);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 assert.equal(allLearningQuestions(course).length,574);assert.equal(scoredLearningQuestions(course).length,450);assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,574)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,7);assert.ok(plan[6].lessons.every(l=>l.available));assert.ok(plan.slice(7).every(m=>!m.available))
})
test('first six modules, placements and C# remain unchanged',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module07.json');assert.deepEqual(raw.modules.slice(0,6),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>Number(p.moduleId.slice(1))<=6),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('Minimal API references, reversed orders and validation registrations grade correctly',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'validation'};bad={...good,fixId:'problem'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='validation')}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()};assert.ok(checkExercise(e,good).correct)}
  assert.ok(checkExercise(e,good).correct,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('Minimal API fenced examples are retained without source footers or service keys',()=>{
 const names=['01_endpoint_groups.md','02_crud_contract.md','03_handler_dependencies.md','04_typed_results_unions.md','05_endpoint_filters.md','06_validation_net10.md','07_endpoint_openapi.md','08_file_upload_download.md','09_feature_modules.md']
 for(const [i,n]of names.entries()){const text=fs.readFileSync('server/theory-source/aspnet-core-v2-module07/'+n,'utf8').replaceAll('\r\n','\n'),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
})
