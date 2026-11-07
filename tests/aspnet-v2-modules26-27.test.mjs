import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {withCurrentExampleFixes} from './fixtures/aspnet-current-example-fixes.mjs'
import {createHash} from 'node:crypto'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {allLearningQuestions,scoredLearningQuestions} from '../src/lib/learning.ts'
import {normalizeAspNetV2Authentication} from '../scripts/lib/aspnet-v2-markdown.mjs'
import {coursePlanModules} from '../src/lib/coursePlan.ts'
import {referenceAnswer,wrongAnswer} from './fixtures/exercise-solutions.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),course=validateDownloadedCourse(raw),placements=read('server/exercise-source/aspnet-core-foundations-v2.json')
test('modules 26 and 27 complete the plan with source lesson counts and all 194 new questions',()=>{
 assert.equal(course.modules.length,27);assert.equal(course.modules[25].lessons.length,10);assert.equal(course.modules[26].lessons.length,12)
 assert.equal(course.lessons.filter(l=>l.step?.kind==='theory').length>0,true)
 assert.equal(allLearningQuestions(course).length,2430);assert.equal(scoredLearningQuestions(course).length,1890)
 assert.ok(coursePlanModules(course).every(m=>m.available&&m.lessons.every(l=>l.available)))
 for(const m of course.modules.slice(25)){assert.equal(m.exam.questions.length,20);for(const l of m.lessons){assert.equal(l.finalTest.questions.length,5);assert.equal(l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).length,2);assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1)}}
})
test('previous 25 modules retain the published content except the three audited example corrections',()=>{
 const baseline=read('tests/fixtures/aspnet-v2-before-modules26-27.json')
 const strip=m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))})
 const historical=read('tests/fixtures/aspnet-before-semantic-interactives.json')
 const hashes=c=>c.modules.slice(0,25).map(m=>createHash('sha256').update(JSON.stringify(strip(m))).digest('hex'))
 assert.deepEqual(hashes(historical),baseline.lessonHashes)
 assert.deepEqual(hashes(raw),hashes(withCurrentExampleFixes(historical)))
})
test('ten activities accept reference answers and reject wrong choices, swaps and reverse ordering',()=>{
 for(const m of ['m26','m27']){const own=placements.filter(p=>p.moduleId===m);assert.equal(own.length,5);assert.equal(new Set(own.map(p=>p.lessonId)).size,5)
 for(const p of own){const e=validateExercise(p.block.exercise);let good,bad
 if(['code-trace','architecture-builder','data-transform'].includes(e.type)){good=referenceAnswer(e);bad=wrongAnswer(e)}
 else if(e.type==='matching'){good={type:e.type,pairs:e.validation.pairs};bad=structuredClone(good);const ids=Object.keys(bad.pairs);[bad.pairs[ids[0]],bad.pairs[ids[1]]]=[bad.pairs[ids[1]],bad.pairs[ids[0]]]}
 else if(e.type==='sequence'){good={type:e.type,order:e.validation.acceptedOrders[0]};bad={...good,order:[...good.order].reverse()}}
 else{good={type:e.type,selection:e.content.errors[0].location,fixId:'f0'};bad={...good,fixId:'f1'};for(const fix of e.content.fixOptions)assert.equal(checkExercise(e,{...good,fixId:fix.id}).correct,fix.id==='f0')}
 assert.equal(checkExercise(e,good).correct,true);assert.equal(checkExercise(e,bad).correct,false)
 const l=course.modules.find(x=>x.id===m).lessons.find(l=>l.id===p.lessonId);assert.equal(l.blocks[l.blocks.findIndex(b=>b.id===p.afterBlockId)+1].id,e.id)
 }}
})
test('wrapped Markdown options and all theory code fences are preserved',()=>{
 for(const m of course.modules.slice(25)){
 const number=Number(m.id.slice(1)),root=`server/theory-source/aspnet-core-v2-module${number}/`,names=fs.readdirSync(root).filter(n=>/^\d\d_.*\.md$/.test(n)).sort()
 assert.equal(names.length,m.lessons.length)
 for(const [i,name] of names.entries()){
 const normalized=normalizeAspNetV2Authentication(fs.readFileSync(root+name,'utf8').replaceAll('\r\n','\n'),{kind:'lesson',number,lesson:i+1}),parts=m.lessons[i].blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content)
 for(const c of normalized.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(parts.some(p=>p.kind==='code'&&p.text.trimEnd()===c[1].trimEnd()),name)
 for(const q of m.lessons[i].finalTest.questions)assert.ok(q.options.every(o=>o.trim().length>0))
 }
 }
 assert.ok(course.modules[26].lessons[0].blocks.find(b=>b.kind==='test').questions[0].options.every(o=>!o.endsWith('можно')))
})
