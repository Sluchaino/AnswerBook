import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {withCurrentExampleFixes} from './fixtures/aspnet-current-example-fixes.mjs'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {checkExercise,validateExercise,freshExercise,submitExercise} from '../src/lib/exercises.ts'
import {freshLearningAttempt,restoreLearningAttempt} from '../src/lib/learning.ts'
import {referenceAnswer,wrongAnswer} from './fixtures/exercise-solutions.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),before=read('tests/fixtures/aspnet-interactives-before-variety.json'),course=validateDownloadedCourse(raw)
const exercises=c=>c.modules.flatMap(m=>m.lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='exercise').map(b=>({moduleId:m.id,lessonId:l.id,exercise:b.exercise}))))
test('all 27 modules have five exercises, at least three distinct formats and at most one exercise per lesson',()=>{
 for(const m of raw.modules){const e=m.lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='exercise').map(b=>b.exercise));assert.equal(e.length,5,m.id);assert.ok(new Set(e.map(e=>e.type)).size>=3,m.id);for(const l of m.lessons)assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
})
test('only 34 targeted exercise definitions change; all theory, quizzes, IDs and placements remain intact',()=>{
 const strip=c=>c.modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))
 assert.deepEqual(strip(raw),strip(withCurrentExampleFixes(before)))
 const old=exercises(before),next=exercises(raw);assert.equal(next.length,135);let changed=0
 for(const [i,n]of next.entries()){assert.equal(n.lessonId,old[i].lessonId);assert.equal(n.exercise.id,old[i].exercise.id);if(JSON.stringify(n.exercise)!==JSON.stringify(old[i].exercise)){changed++;assert.equal(n.exercise.version,old[i].exercise.version+1);assert.ok(Number(n.moduleId.slice(1))>=16&&Number(n.moduleId.slice(1))<=27)}}
 assert.equal(changed,34)
})
test('new debug and sequence activities accept reference solutions and reject all distractors or reversed ordering',()=>{
 for(const {moduleId,exercise:input}of exercises(raw).filter(e=>Number(e.moduleId.slice(1))>=16&&Number(e.moduleId.slice(1))<=25&&e.exercise.type!=='matching')){
 const e=validateExercise(input)
 if(e.type==='code-debug'){
  for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{type:e.type,selection:e.content.errors[0].location,fixId:f.id}).correct,f.id==='f0',e.id)
  assert.equal(checkExercise(e,{type:e.type,selection:{kind:'line',line:1},fixId:'f0'}).correct,false)
 }else if(['sequence','code-order'].includes(e.type)){
  const order=e.validation.acceptedOrders[0];assert.equal(checkExercise(e,{type:e.type,order}).correct,true,moduleId);assert.equal(checkExercise(e,{type:e.type,order:[...order].reverse()}).correct,false)
 }else {assert.equal(checkExercise(e,referenceAnswer(e)).correct,true);assert.equal(checkExercise(e,wrongAnswer(e)).correct,false)}
 }
})
test('updating exercise formats preserves ordinary answers and unaffected solved exercises, resets changed exercise states',()=>{
 const previous=validateDownloadedCourse(structuredClone(before)),old=exercises(before),changed=old.find(e=>e.lessonId==='m16-l04').exercise,unchanged=old.find(e=>e.lessonId==='m16-l01').exercise
 const solve=e=>submitExercise(e,{...freshExercise(e),answer:{type:'matching',pairs:e.validation.pairs}})
 const q=previous.lessons.flatMap(l=>l.questions)[0],attempt={...freshLearningAttempt(previous),answers:{[q.id]:'0'},exercises:{[changed.id]:solve(changed),[unchanged.id]:solve(unchanged)}}
 const restored=restoreLearningAttempt(JSON.stringify(attempt),course,previous)
 assert.equal(restored.answers[q.id],'0');assert.deepEqual(restored.exercises[unchanged.id],attempt.exercises[unchanged.id]);assert.equal(restored.exercises[changed.id],undefined)
})
