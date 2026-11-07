import {historicalCourse} from './fixtures/csharp-historical-edition.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,exerciseFingerprint,checkTracePrediction} from '../src/lib/exercises.ts'
import {traceSnapshots,moveTrace,chooseTraceOption,retryTraceOption} from '../src/lib/codeTraces.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,restoreLearningAttempt,scoredLearningQuestions,finishLearningAttempt,learningScore,submitLessonAssessment} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'))
// Historical batch02 assertions exclude later batch03; the full 39-item snapshot is protected there.
const placements=read('./fixtures/exercises-before-batch03.json')
const baseline=read('./fixtures/exercises-before-batch02.json')
const hashes=read('./fixtures/csharp-content-before-batch02.json')
const raw=historicalCourse('03',placements)
const batch=placements.filter(p=>p.block.exercise.id.startsWith('csharp-b02-'))
const exercises=batch.map(p=>validateExercise(p.block.exercise))
const byId=id=>exercises.find(e=>e.id==='csharp-b02-'+id)
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const remove=(modules,predicate)=>modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(predicate)}))}))
const completeTrace=(e,wrong=false)=>{
 let s=freshExercise(e)
 for(const p of e.content.predictions){s=editExercise(e,s,moveTrace(e,s.answer,p.atStepId));s=editExercise(e,s,chooseTraceOption(e,s.answer,p.id,wrong?p.options.find(o=>o.id!==p.correctOptionId).id:p.correctOptionId));s=checkTracePrediction(e,s,p.id)}
 s=editExercise(e,s,moveTrace(e,s.answer,e.content.steps.at(-1).id))
 return submitExercise(e,s)
}
const debugAnswer=(e,fixId)=>({type:'code-debug',selection:e.content.errors[0].location,fixId})
function solve(e){
 if(e.type==='code-trace')return completeTrace(e)
 let a
 if(e.type==='matching')a={type:e.type,pairs:e.validation.pairs}
 else if(['sequence','code-order'].includes(e.type))a={type:e.type,order:e.validation.acceptedOrders[0]}
 else if(e.type==='code-debug')a=debugAnswer(e,Object.values(e.validation.acceptedFixes)[0][0])
 else if(e.type==='data-transform')a={type:e.type,steps:e.validation.solution}
 else{const v=e.validation.variants[0];a={type:e.type,graph:{nodes:v.nodes.map(n=>({...n,x:0.5,y:0.5})),edges:v.edges},closed:true,undo:[]}}
 return submitExercise(e,editExercise(e,freshExercise(e),a))
}

test('batch02 publishes nine unique exercises only in the six intended modules, at existing theory anchors',()=>{
 assert.equal(baseline.length,30);assert.equal(placements.length,39);assert.equal(batch.length,9)
 assert.equal(new Set(placements.map(p=>p.block.exercise.id)).size,39)
 assert.deepEqual(Object.fromEntries(['m07','m08','m09','m10','m11','m12'].map(m=>[m,batch.filter(p=>p.moduleId===m).length])),{m07:2,m08:1,m09:1,m10:2,m11:1,m12:2})
 const signatures=new Set(baseline.map(p=>JSON.stringify(p.block.exercise.content)))
 for(const p of batch){
  const l=raw.modules.find(m=>m.id===p.moduleId)?.lessons.find(l=>l.id===p.lessonId)
  assert.ok(l);const i=l.blocks.findIndex(b=>b.id===p.afterBlockId)
  assert.ok(i>=0);assert.equal(l.blocks[i].kind,'theory');assert.deepEqual(l.blocks[i+1],p.block)
  assert.equal(p.block.exercise.version,1);assert.equal(p.block.exercise.settings.practice,true)
  const signature=JSON.stringify(p.block.exercise.content);assert.equal(signatures.has(signature),false);signatures.add(signature)
 }
 assert.equal(batch.find(p=>p.block.exercise.id.endsWith('-variance')).lessonId,'m10-l08')
 assert.equal(batch.find(p=>p.block.exercise.id.endsWith('-nullable-unboxing')).afterBlockId,'application')
})

test('all 30 previous placements, versions, fingerprints, ordinary lessons and untouched modules remain byte-equivalent as JSON',()=>{
 assert.deepEqual(placements.filter(p=>!p.block.exercise.id.startsWith('csharp-b02-')),baseline)
 for(const p of baseline)assert.equal(exerciseFingerprint(placements.find(a=>a.block.exercise.id===p.block.exercise.id).block.exercise),exerciseFingerprint(p.block.exercise))
 const {version,modules,...metadata}=raw
 assert.equal(hash(metadata),hashes.metadataHash)
 assert.equal(hash(remove(modules,b=>b.kind!=='exercise')),hashes.ordinaryContentHash)
 for(const m of modules.filter(m=>!['m07','m08','m09','m10','m11','m12'].includes(m.id)))assert.equal(hash(m),hashes.moduleHashes[m.id],m.id)
 assert.ok(version>hashes.version)
})

test('two clean imports through the existing sidecar attachment reproduce the published lesson structure',()=>{
 const clean=remove(raw.modules,b=>b.kind!=='exercise')
 for(let i=0;i<2;i++)assert.deepEqual(attachExercises(structuredClone(clean),placements),raw.modules)
})

test('every new reference solution is accepted; checked answers, retry, successful state and reset survive storage',()=>{
 for(const e of exercises){
  const solved=solve(e);assert.ok(solved.solvedAnswer,e.id)
  assert.equal(checkExercise(e,solved.checkedAnswer).correct,true,e.id)
  assert.deepEqual(restoreExercises({[e.id]:solved},[e])[e.id],solved)
  assert.equal(submitExercise(e,solved),solved)
  const reset=resetExercise(e,solved,()=>0.4);assert.equal(reset.checkedAnswer,undefined);assert.deepEqual(reset.solvedAnswer,solved.solvedAnswer)
  assert.deepEqual(restoreExercises({[e.id]:reset},[e])[e.id],reset)
  const step=validateDownloadedCourse(raw).lessons.find(l=>l.exercise?.id===e.id)
  const course=validateDownloadedCourse(raw),attempt={...freshLearningAttempt(course),lessonId:step.id,view:'practice',exercises:{[e.id]:solved}}
  const restored=restoreLearningAttempt(JSON.stringify(attempt),course)
  assert.equal(restored.lessonId,step.id);assert.deepEqual(restored.exercises[e.id],solved)
 }
})

test('constructor stages and generic code reject wrong permutations and missing references',()=>{
 for(const e of exercises.filter(e=>['sequence','code-order'].includes(e.type))){
  for(const order of e.validation.acceptedOrders)assert.equal(checkExercise(e,{type:e.type,order}).correct,true)
  const order=[...e.validation.acceptedOrders[0]];[order[0],order[2]]=[order[2],order[0]]
  assert.equal(checkExercise(e,{type:e.type,order}).correct,false)
  assert.throws(()=>checkExercise(e,{type:e.type,order:[...order.slice(1),'missing']}))
 }
 assert.deepEqual(byId('constructor-chain').validation.acceptedOrders[0],['delegate','assign','inner','outer','return','print'])
 assert.deepEqual(byId('generic-contract').validation.acceptedOrders[0],['header','where','open','create','return','close'])
})

test('debug engines check every offered correction, alternative fixes and the selected line',()=>{
 for(const e of exercises.filter(e=>e.type==='code-debug')){
  const accepted=e.validation.acceptedFixes.problem
  for(const f of e.content.fixOptions){
   const a=debugAnswer(e,f.id),good=accepted.includes(f.id)
   assert.equal(checkExercise(e,a).correct,good,e.id+'/'+f.id)
   let s=submitExercise(e,editExercise(e,freshExercise(e),a))
   assert.equal(!!s.solvedAnswer,good);assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)
   s=submitExercise(e,editExercise(e,s,debugAnswer(e,accepted[0])));assert.ok(s.solvedAnswer)
  }
  assert.equal(checkExercise(e,{...debugAnswer(e,accepted[0]),selection:{kind:'line',line:1}}).correct,false)
  assert.throws(()=>checkExercise(e,debugAnswer(e,'missing')))
 }
 assert.deepEqual(byId('nullable-unboxing').validation.acceptedFixes.problem,['unbox','widen','convert'])
 assert.deepEqual(byId('dictionary-missing').validation.acceptedFixes.problem,['try','contains','default'])
 assert.deepEqual(byId('unsubscribe').validation.acceptedFixes.problem,['saved'])
})

test('variance matching distinguishes covariance, contravariance, invariance and boxing',()=>{
 const e=byId('variance'),a={type:'matching',pairs:{...e.validation.pairs}}
 assert.equal(checkExercise(e,a).correct,true)
 ;[a.pairs.sequence,a.pairs.comparer]=[a.pairs.comparer,a.pairs.sequence]
 assert.deepEqual(checkExercise(e,a).incorrectIds,['sequence','comparer'])
 assert.throws(()=>checkExercise(e,{type:'matching',pairs:{...e.validation.pairs,list:'missing'}}))
 assert.equal(checkExercise(e,{type:'matching',pairs:{}}).correct,false)
})

test('both traces gate predictions, reject wrong answers and retain first responses on retry',()=>{
 for(const e of exercises.filter(e=>e.type==='code-trace')){
  assert.throws(()=>moveTrace(e,freshExercise(e).answer,e.content.steps.at(-1).id))
  let s=completeTrace(e,true);assert.equal(s.solvedAnswer,undefined)
  const p=e.content.predictions[0],first=s.answer.responses[p.id].firstChoiceId
  s=editExercise(e,s,moveTrace(e,s.answer,p.atStepId));s=editExercise(e,s,retryTraceOption(e,s.answer,p.id))
  s=editExercise(e,s,chooseTraceOption(e,s.answer,p.id,p.correctOptionId));s=checkTracePrediction(e,s,p.id)
  assert.equal(s.answer.responses[p.id].firstChoiceId,first);assert.equal(s.attempts,e.content.predictions.length+1)
  assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)
  const bad=structuredClone(e);bad.content.predictions[0].atStepId='missing';assert.throws(()=>validateExercise(bad))
 }
})

test('virtual trace preserves actual Dog identity and static types while varying the selected implementation',()=>{
 const e=byId('virtual-hiding'),states=Object.fromEntries(traceSnapshots(e).map(s=>[s.id,s]))
 assert.equal(states.create.variables[0].declaredType,'Animal');assert.equal(states.create.objects[0].type,'Dog')
 assert.deepEqual(states.alias.variables.map(v=>v.value.objectId),['dog-1','dog-1'])
 assert.deepEqual(states.alias.variables.map(v=>v.declaredType),['Animal','Dog'])
 for(const s of e.content.steps)assert.deepEqual(s.objects,[{id:'dog-1',type:'Dog',fields:{}}])
 assert.deepEqual(states.virtual.output,['dog']);assert.deepEqual(states['hidden-base'].output,['dog','base'])
 assert.deepEqual(states['hidden-derived'].output,['dog','base','derived'])
 assert.match(e.content.code,/override string Speak/);assert.match(e.content.code,/new string Describe/)
})

test('closure snapshots keep ordinary copy independent and both delegates linked to the same changing cell',()=>{
 const e=byId('closure-cell'),states=Object.fromEntries(traceSnapshots(e).map(s=>[s.id,s]))
 for(const s of e.content.steps){
  const count=s.variables.find(v=>v.id==='count').value.value,cell=s.objects.find(o=>o.id==='cell-1')
  if(cell)assert.equal(cell.fields.Value.value,count)
  const snapshot=s.variables.find(v=>v.id==='snapshot');if(snapshot)assert.equal(snapshot.value.value,1)
  for(const delegate of s.objects.filter(o=>o.type==='Func<int>'))assert.equal(delegate.fields.Capture.objectId,'cell-1')
 }
 assert.equal(states['read-created'].variables.find(v=>v.id==='count').value.value,1)
 assert.equal(states.change.variables.find(v=>v.id==='count').value.value,5)
 assert.equal(states.increment.variables.find(v=>v.id==='count').value.value,6)
 assert.deepEqual(states.increment.output,['5']);assert.deepEqual(states['next-written'].output,['5','6'])
 assert.deepEqual(states['snapshot-written'].output,['5','6','6','1'])
})

test('v38 upgrade preserves completed states of all seven old mechanics, all 30 exercise states and ordinary results',()=>{
 const oldRaw={...raw,version:hashes.version,modules:remove(raw.modules,b=>b.kind!=='exercise'||!b.exercise.id.startsWith('csharp-b02-'))}
 const before=validateDownloadedCourse(oldRaw),after=validateDownloadedCourse(raw)
 let a=freshLearningAttempt(before)
 a.answers=Object.fromEntries(scoredLearningQuestions(before).map(q=>[q.id,q.kind==='multi'?[...q.correct].sort().join(','):String(q.correct)]))
 a.exercises=Object.fromEntries(baseline.map(p=>{const e=p.block.exercise,s=solve(e);assert.ok(s.solvedAnswer,e.id);return[e.id,s]}))
 const exam=before.lessons.find(l=>l.step?.kind==='module-test')
 a=submitLessonAssessment(before,a,exam.id,new Date('2026-10-27T10:00:00Z'))
 a=finishLearningAttempt(before,a,new Date('2026-10-27T10:01:00Z'))
 const restored=restoreLearningAttempt(JSON.stringify(a),after,before)
 assert.deepEqual(restored.exercises,a.exercises);assert.deepEqual(restored.answers,a.answers)
 assert.deepEqual(restored.assessments,a.assessments);assert.deepEqual(restored.lastResult,a.lastResult)
 assert.equal(restored.finished,true);assert.deepEqual(learningScore(after,restored),learningScore(before,a))
 assert.equal(restored.lastResult.percent,100);assert.equal(restored.lastResult.total,1265)
})
