import {historicalCourse} from './fixtures/csharp-historical-edition.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,exerciseFingerprint,checkTracePrediction} from '../src/lib/exercises.ts'
import {traceSnapshots,moveTrace,chooseTraceOption,retryTraceOption,traceReady} from '../src/lib/codeTraces.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,restoreLearningAttempt,scoredLearningQuestions,finishLearningAttempt,learningScore,submitLessonAssessment} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'))
// Historical batch01 checks exclude later additive exercises, whose preservation is tested in batch02.
const placements=read('./fixtures/exercises-before-batch02.json')
const baseline=read('./fixtures/exercises-before-batch01.json')
const hashes=read('./fixtures/csharp-content-before-batch01.json')
const raw=historicalCourse('02',placements)
const batch=placements.filter(p=>p.block.exercise.id.startsWith('csharp-b01-'))
const exercises=batch.map(p=>validateExercise(p.block.exercise))
const [il,cast,short,switchOrder,ref,index]=exercises
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const withoutExercises=modules=>modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))
const completeTrace=(e,wrong=false)=>{
 let s=freshExercise(e)
 for(const p of e.content.predictions){
  s=editExercise(e,s,moveTrace(e,s.answer,p.atStepId))
  s=editExercise(e,s,chooseTraceOption(e,s.answer,p.id,wrong?p.options.find(o=>o.id!==p.correctOptionId).id:p.correctOptionId))
  s=checkTracePrediction(e,s,p.id)
 }
 s=editExercise(e,s,moveTrace(e,s.answer,e.content.steps.at(-1).id))
 assert.ok(traceReady(e,s.answer))
 return submitExercise(e,s)
}
const debugAnswer=(e,fixId)=>({type:'code-debug',selection:{kind:'line',line:e.content.errors[0].location.line},fixId})

test('batch adds exactly six unique, valid exercises to real anchors in modules 1–6',()=>{
 assert.equal(baseline.length,24);assert.equal(placements.length,30);assert.equal(batch.length,6)
 assert.equal(new Set(placements.map(p=>p.block.exercise.id)).size,30)
 assert.deepEqual(batch.map(p=>p.moduleId),['m01','m02','m03','m04','m05','m06'])
 const signatures=new Set(baseline.map(p=>JSON.stringify(p.block.exercise.content)))
 for(const p of batch){
  const lesson=raw.modules.find(m=>m.id===p.moduleId)?.lessons.find(l=>l.id===p.lessonId)
  assert.ok(lesson,p.lessonId)
  const anchor=lesson.blocks.findIndex(b=>b.id===p.afterBlockId)
  assert.ok(anchor>=0);assert.deepEqual(lesson.blocks[anchor+1],p.block)
  assert.equal(p.block.exercise.version,1);assert.equal(p.block.exercise.settings.practice,true)
  assert.equal(signatures.has(JSON.stringify(p.block.exercise.content)),false)
  signatures.add(JSON.stringify(p.block.exercise.content))
 }
})

test('all original IDs, content, versions, fingerprints and placement order are preserved exactly',()=>{
 assert.deepEqual(placements.filter(p=>!p.block.exercise.id.startsWith('csharp-b01-')),baseline)
 for(const p of baseline){
  const actual=placements.find(a=>a.block.exercise.id===p.block.exercise.id)
  assert.equal(exerciseFingerprint(actual.block.exercise),exerciseFingerprint(p.block.exercise))
 }
 const {version,modules,...metadata}=raw
 assert.equal(hash(metadata),hashes.metadataHash)
 assert.equal(hash(withoutExercises(modules)),hashes.ordinaryContentHash)
 for(const m of modules.slice(6))assert.equal(hash(m),hashes.moduleHashes[m.id],m.id)
 assert.ok(version>32)
})

test('shared importer reconstructs all exercises identically on two clean imports',()=>{
 const clean=withoutExercises(raw.modules)
 assert.deepEqual(attachExercises(structuredClone(clean),placements),raw.modules)
 assert.deepEqual(attachExercises(structuredClone(clean),placements),raw.modules)
})

test('IL sequence and both mutually exclusive switch arm orders accept correct solutions and reject misplaced stages',()=>{
 for(const e of [il,switchOrder]){
  for(const order of e.validation.acceptedOrders){
   const answer={type:e.type,order}
   assert.equal(checkExercise(e,answer).correct,true)
   let s=submitExercise(e,editExercise(e,freshExercise(e),answer))
   assert.ok(s.solvedAnswer);assert.equal(s.attempts,1)
   assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)
   s=resetExercise(e,s);assert.equal(s.checkedAnswer,undefined);assert.equal(s.attempts,1)
  }
  const wrong=[...e.validation.acceptedOrders[0]];[wrong[0],wrong[3]]=[wrong[3],wrong[0]]
  assert.equal(checkExercise(e,{type:e.type,order:wrong}).correct,false)
 }
 assert.deepEqual(il.validation.acceptedOrders[0],['source','assembly','load','jit','execute'])
 assert.equal(switchOrder.validation.acceptedOrders.length,2)
})

test('cast and indexing check every offered fix, wrong location, retry, reset and save',()=>{
 for(const e of [cast,index]){
  const accepted=e.validation.acceptedFixes[e.content.errors[0].id]
  for(const fix of e.content.fixOptions){
   const answer=debugAnswer(e,fix.id),expected=accepted.includes(fix.id)
   assert.equal(checkExercise(e,answer).correct,expected,fix.id)
   let s=submitExercise(e,editExercise(e,freshExercise(e),answer))
   assert.equal(!!s.solvedAnswer,expected)
   assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)
   s=editExercise(e,s,debugAnswer(e,accepted[0]));s=submitExercise(e,s)
   assert.ok(s.solvedAnswer)
   assert.equal(resetExercise(e,s).checkedAnswer,undefined)
  }
  assert.equal(checkExercise(e,{...debugAnswer(e,accepted[0]),selection:{kind:'line',line:1}}).correct,false)
 }
 assert.deepEqual(index.validation.acceptedFixes.index,['from-end','length-minus-one'])
 assert.deepEqual(cast.validation.acceptedFixes.conversion,['truncate'])
})

test('both traces enforce practice predictions, accept all reference answers, reject wrong answers and retain first choices',()=>{
 for(const e of [short,ref]){
  const fresh=freshExercise(e),p=e.content.predictions[0]
  assert.throws(()=>moveTrace(e,fresh.answer,e.content.steps.at(-1).id))
  const correct=completeTrace(e);assert.ok(correct.solvedAnswer)
  assert.deepEqual(restoreExercises({[e.id]:correct},[e])[e.id],correct)
  let wrong=completeTrace(e,true);assert.equal(!!wrong.solvedAnswer,false)
  wrong=editExercise(e,wrong,moveTrace(e,wrong.answer,p.atStepId))
  const first=wrong.answer.responses[p.id].firstChoiceId
  wrong=editExercise(e,wrong,retryTraceOption(e,wrong.answer,p.id))
  wrong=editExercise(e,wrong,chooseTraceOption(e,wrong.answer,p.id,p.correctOptionId))
  wrong=checkTracePrediction(e,wrong,p.id)
  assert.equal(wrong.answer.responses[p.id].firstChoiceId,first)
  assert.equal(wrong.attempts,e.content.predictions.length+1)
  const reset=resetExercise(e,wrong);assert.equal(reset.answer.stepId,'initial')
  assert.deepEqual(restoreExercises({[e.id]:reset},[e])[e.id],reset)
 }
})

test('short circuit states never evaluate division and assign allowed only after the expression finishes',()=>{
 const states=Object.fromEntries(traceSnapshots(short).map(s=>[s.id,s]))
 const variable=(step,id)=>states[step].variables.find(v=>v.id===id)?.value.value
 for(const step of ['guard','skip']){assert.equal(variable(step,'checks'),0);assert.equal(variable(step,'allowed'),undefined)}
 assert.equal(variable('increment','checks'),1)
 assert.equal(variable('assign','allowed'),true)
 assert.deepEqual(states.print.output,['True:1'])
 assert.match(short.content.code,/divisor != 0 && 12 \/ divisor > 2 \|\| \+\+checks == 1/)
})

test('parameter snapshots distinguish caller variables, local copies, aliases and independent array objects',()=>{
 const states=Object.fromEntries(traceSnapshots(ref).map(s=>[s.id,s]))
 const value=(step,id)=>states[step].variables.find(v=>v.id===id)?.value
 assert.equal(value('copy-add','count').value,1);assert.equal(value('copy-add','copy-value').value,3)
 assert.equal(value('ref-add','count').value,3);assert.equal(value('ref-add','ref-value').value,3)
 assert.equal(value('copy-return','copy-value'),undefined)
 assert.equal(value('array-rebind-copy','values').objectId,'array-1')
 assert.equal(value('array-rebind-copy','copy-item').objectId,'array-2')
 assert.deepEqual(states['array-mutate'].objects.find(o=>o.id==='array-1').fields.Items.items.map(v=>v.value),[7])
 assert.equal(value('array-copy-return','copy-item'),undefined)
 assert.equal(value('array-ref-rebind','values').objectId,'array-3')
 assert.equal(value('array-ref-rebind','ref-item').objectId,'array-3')
 assert.equal(value('array-ref-return','ref-item'),undefined)
 assert.deepEqual(states.print.output,['3:11'])
})

test('upgrading v32 preserves all 24 exercise states, assessment history, answers and final grade',()=>{
 const beforeRaw={...raw,version:32,modules:raw.modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise'||!b.exercise.id.startsWith('csharp-b01-'))}))}))}
 const before=validateDownloadedCourse(beforeRaw),after=validateDownloadedCourse(raw)
 let attempt=freshLearningAttempt(before)
 attempt.answers=Object.fromEntries(scoredLearningQuestions(before).map(q=>[q.id,q.kind==='multi'?[...q.correct].sort().join(','):String(q.correct)]))
 attempt.exercises=Object.fromEntries(baseline.map(p=>[p.block.exercise.id,freshExercise(p.block.exercise,()=>0.4)]))
 const old=baseline[0].block.exercise
 attempt.exercises[old.id]=submitExercise(old,editExercise(old,attempt.exercises[old.id],{type:'matching',pairs:old.validation.pairs}))
 const exam=before.lessons.find(l=>l.step?.kind==='module-test')
 attempt=submitLessonAssessment(before,attempt,exam.id,new Date('2026-10-27T10:00:00Z'))
 attempt=finishLearningAttempt(before,attempt,new Date('2026-10-27T10:01:00Z'))
 const restored=restoreLearningAttempt(JSON.stringify(attempt),after,before)
 assert.deepEqual(restored.answers,attempt.answers);assert.deepEqual(restored.exercises,attempt.exercises)
 assert.deepEqual(restored.assessments,attempt.assessments);assert.deepEqual(restored.lastResult,attempt.lastResult)
 assert.equal(restored.finished,true);assert.deepEqual(learningScore(after,restored),learningScore(before,attempt))
 assert.equal(restored.lastResult.percent,100);assert.equal(restored.lastResult.total,1265)
})
