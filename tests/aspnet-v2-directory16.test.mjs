import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {normalizeAspNetV2Authentication} from '../scripts/lib/aspnet-v2-markdown.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse({...raw,modules:raw.modules.slice(0,25)}),placements=read('server/exercise-source/aspnet-core-foundations-v2.json'),before=read('tests/fixtures/aspnet-v2-before-directory16.json')
test('sequential directory import preserves modules 1–15, their activities and the C# course',()=>{
 assert.deepEqual(raw.modules.slice(0,15),before.modules)
 assert.deepEqual(placements.filter(p=>Number(p.moduleId.slice(1))<=15),before.placements)
 assert.equal(createHash('sha256').update(fs.readFileSync('server/course-source/csharp-foundations-v2.json')).digest('hex'),before.csharpHash)
})
test('every module 16–25 has exactly the supplied lessons, complete quizzes and five distinct activities',()=>{
 let added=0
 for(const m of course.modules.slice(15)){
  const names=fs.readdirSync(`server/theory-source/aspnet-core-v2-module${Number(m.id.slice(1))}`).filter(n=>/^\d\d_.*\.md$/.test(n))
  assert.equal(m.lessons.length,names.length);added+=names.length
  assert.equal(m.exam.questions.length,20)
  const own=placements.filter(p=>p.moduleId===m.id);assert.equal(own.length,5);assert.equal(new Set(own.map(p=>p.lessonId)).size,5)
  for(const l of m.lessons){assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.equal(l.finalTest.questions.length,5)}
 }
 assert.equal(added,108);assert.equal(allLearningQuestions(course).length,2236);assert.equal(scoredLearningQuestions(course).length,1740)
 const ids=allLearningQuestions(course).map(q=>q.id);assert.equal(new Set(ids).size,ids.length)
 const plan=coursePlanModules(course);assert.equal(plan.filter(m=>m.available).length,25);assert.ok(plan.slice(25).every(m=>!m.available))
})
test('remaining matching activities have unambiguous answers, accept solutions and reject swapped pairs',()=>{
 for(const p of placements.filter(p=>Number(p.moduleId.slice(1))>=16&&Number(p.moduleId.slice(1))<=25&&p.block.exercise.type==='matching')){
  const e=validateExercise(p.block.exercise);assert.equal(e.type,'matching');assert.equal(new Set(e.content.right.map(i=>i.label)).size,e.content.right.length)
  const good={type:'matching',pairs:e.validation.pairs};assert.equal(checkExercise(e,good).correct,true)
  const bad=structuredClone(good),keys=Object.keys(bad.pairs);[bad.pairs[keys[0]],bad.pairs[keys[1]]]=[bad.pairs[keys[1]],bad.pairs[keys[0]]];assert.equal(checkExercise(e,bad).correct,false)
 }
})
test('source theory code blocks survive import while answer keys and reference lists stay outside lesson theory',()=>{
 for(const m of course.modules.slice(15)){
  const number=Number(m.id.slice(1)),folder=`server/theory-source/aspnet-core-v2-module${number}`,names=fs.readdirSync(folder).filter(n=>/^\d\d_.*\.md$/.test(n)).sort()
  for(const [i,name] of names.entries()){
   const text=normalizeAspNetV2Authentication(fs.readFileSync(folder+'/'+name,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content)
   for(const match of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===match[1].trimEnd()),`${m.id}/${name}`)
   assert.ok(parts.every(p=>!p.text.includes('Правильный ответ:')))
  }
 }
})
