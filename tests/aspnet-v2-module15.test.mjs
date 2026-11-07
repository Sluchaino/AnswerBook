import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {allLearningQuestions,scoredLearningQuestions,freshLearningAttempt,restoreLearningAttempt,finishLearningAttempt} from '../src/lib/learning.ts'
import {validateExercise,checkExercise,freshExercise,submitExercise} from '../src/lib/exercises.ts'
import {normalizeAspNetV2Authentication} from '../scripts/lib/aspnet-v2-markdown.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,15)}),m=course.modules[14],placements=read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>p.moduleId==='m15')
test('authentication module contains nine source lessons, 83 questions and five interactives, maximum one per lesson',()=>{
 assert.equal(m.id,'m15');assert.equal(m.lessons.length,9);assert.equal(m.exam.questions.length,20);assert.equal(placements.length,5);assert.equal(new Set(placements.map(p=>p.lessonId)).size,5)
 for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}
 const questions=allLearningQuestions(course);assert.equal(questions.length,1280);assert.equal(scoredLearningQuestions(course).length,1000);assert.equal(new Set(questions.map(q=>q.id)).size,1280)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,15);assert.ok(plan[14].lessons.every(l=>l.available));assert.ok(plan.slice(15).every(m=>!m.available))
})
test('first fourteen modules, earlier exercises and the C# course remain unchanged',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module15.json');assert.deepEqual(raw.modules.slice(0,14),before.modules);assert.deepEqual(read('server/exercise-source/aspnet-core-foundations-v2.json').filter(p=>Number(p.moduleId.slice(1))<=14),before.placements)
 for(const [p,h]of Object.entries(before.protected))assert.equal(createHash('sha256').update(fs.readFileSync(p)).digest('hex'),h,p)
})
test('all five interactive solutions are accepted and incorrect answers rejected',()=>{
 for(const p of placements){const e=validateExercise(p.block.exercise);let good,bad
  if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]]}
  else if(e.type==='code-debug'){good={type:e.type,selection:e.content.errors[0].location,fixId:'cookie-type'};bad={...good,fixId:'claim-only'};for(const f of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:f.id}).correct,f.id==='cookie-type');assert.equal(checkExercise(e,{...good,selection:{kind:'line',line:7}}).correct,false)}
  else{good={type:e.type,order:e.validation.acceptedOrders[0]};bad={type:e.type,order:[...good.order].reverse()}}
  assert.equal(checkExercise(e,good).correct,true,e.id);assert.equal(checkExercise(e,bad).correct,false,e.id)
  const l=m.lessons.find(l=>l.id===p.lessonId);assert.deepEqual(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1],p.block)
 }
})
test('every supplied source code fence is retained; author answer keys and source links stay outside theory',()=>{
 const source='server/theory-source/aspnet-core-v2-module15/',names=fs.readdirSync(source).filter(n=>/^\d\d_/.test(n)).sort()
 assert.equal(names.length,m.lessons.length)
 for(const [i,name]of names.entries()){
  const text=normalizeAspNetV2Authentication(fs.readFileSync(source+name,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number:15,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content)
  assert.ok(text.includes(m.lessons[i].title))
  for(const c of [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(x=>x[1].trimEnd()))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c),name)
  assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')&&!p.text.includes('https://learn.microsoft.com')))
 }
})
test('earlier completed results and interactive progress survive the added module',()=>{
 const before=read('tests/fixtures/aspnet-v2-before-module15.json'),old=validateDownloadedCourse({...raw,version:raw.version-1,modules:before.modules}),first=allLearningQuestions(old)[0]
 const exercise=before.placements[0].block.exercise
 const answers=Object.fromEntries(allLearningQuestions(old).map(q=>[q.id,q.kind==='choice'?String(q.correct):q.kind==='multi'?JSON.stringify(q.correct):q.answers[0]]))
 const attempt=finishLearningAttempt(old,{...freshLearningAttempt(old),answers})
 attempt.exercises={[exercise.id]:submitExercise(exercise,{...freshExercise(exercise),answer:{type:exercise.type,pairs:exercise.validation.pairs}})}
 const restored=restoreLearningAttempt(JSON.stringify(attempt),course,old)
 assert.equal(restored.answers[first.id],attempt.answers[first.id]);assert.deepEqual(restored.lastResult,attempt.lastResult);assert.deepEqual(restored.exercises[exercise.id],attempt.exercises[exercise.id])
})
