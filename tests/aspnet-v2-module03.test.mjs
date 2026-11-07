import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,3)}),m=raw.modules.find(m=>m.id==='m03'),placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m03')
test('routing module contains nine original lessons, all 83 questions and five distinct exercises',()=>{
 assert.equal(m.lessons.length,9);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 assert.equal(allLearningQuestions(course).length,228);assert.equal(scoredLearningQuestions(course).length,180);assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,228)
 const q=allLearningQuestions(course).find(q=>q.id==='ASPN2-M03-EX-06');assert.equal(q.options[2],'/reports/{**year:int}');assert.equal(q.correct,1)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,3);assert.ok(plan[2].lessons.every(l=>l.available));assert.ok(plan.slice(3).every(m=>!m.available))
})
test('routing import preserves first two modules, their placements and C#',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module03.json');assert.deepEqual(raw.modules.slice(0,2),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>['m01','m02'].includes(p.moduleId)),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('routing exercise references, both group orders and wrong fixes grade correctly',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'int'};bad={...good,fixId:'same'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='int')}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()};for(const order of e.validation.acceptedOrders)assert.ok(checkExercise(e,{type:e.type,order}).correct)}
  assert.ok(checkExercise(e,good).correct,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('routing source examples and literal catch-all syntax remain intact',()=>{
 const names=['01_endpoint_selection.md','02_literal_parameter_routes.md','03_route_constraints.md','04_optional_defaults.md','05_catch_all_complex.md','06_precedence_ambiguity.md','07_route_groups.md','08_named_endpoints.md','09_routing_diagnostics.md']
 for(const [i,n]of names.entries()){const text=fs.readFileSync('server/theory-source/aspnet-core-v2-module03/'+n,'utf8').replaceAll('\r\n','\n'),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content);for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),n);assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))}
 const words=m.lessons[4].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).map(p=>p.text).join('\n');assert.ok(words.includes('{**path}'));assert.ok(words.includes('{*path}'))
})
