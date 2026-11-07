import {historicalCourse} from './fixtures/csharp-historical-edition.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,exerciseFingerprint,checkTracePrediction} from '../src/lib/exercises.ts'
import {traceSnapshots,moveTrace,chooseTraceOption,retryTraceOption} from '../src/lib/codeTraces.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,restoreLearningAttempt,allLearningQuestions,scoredLearningQuestions,finishLearningAttempt,learningScore,submitLessonAssessment} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'
import {assembleExerciseCode} from '../src/lib/exercises.ts'

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'))
// Historical v57 edition; batch04 separately protects the exact 49-item snapshot.
const placements=read('./fixtures/exercises-before-batch04.json')
const baseline=read('./fixtures/exercises-before-batch03.json')
const hashes=read('./fixtures/csharp-content-before-batch03.json')
const raw=historicalCourse('04',placements)
const batch=placements.filter(p=>p.block.exercise.id.startsWith('csharp-b03-'))
const exercises=batch.map(p=>validateExercise(p.block.exercise))
const byId=id=>exercises.find(e=>e.id==='csharp-b03-'+id)
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

test('batch03 adds ten valid exercises in m13–m19, completing coverage of all 19 modules',()=>{
 assert.equal(baseline.length,39);assert.equal(placements.length,49);assert.equal(batch.length,10)
 assert.deepEqual(Object.fromEntries(['m13','m14','m15','m16','m17','m18','m19'].map(m=>[m,batch.filter(p=>p.moduleId===m).length])),{m13:1,m14:1,m15:2,m16:1,m17:2,m18:2,m19:1})
 for(const m of raw.modules)assert.ok(placements.some(p=>p.moduleId===m.id),m.id)
 const signatures=new Set(baseline.map(p=>JSON.stringify(p.block.exercise.content)))
 for(const p of batch){
  const lesson=raw.modules.find(m=>m.id===p.moduleId)?.lessons.find(l=>l.id===p.lessonId)
  assert.ok(lesson);const i=lesson.blocks.findIndex(b=>b.id===p.afterBlockId)
  assert.ok(i>=0);assert.equal(lesson.blocks[i].kind,'theory');assert.deepEqual(lesson.blocks[i+1],p.block)
  const signature=JSON.stringify(p.block.exercise.content);assert.equal(signatures.has(signature),false);signatures.add(signature)
  assert.equal(p.block.exercise.version,1);assert.equal(p.block.exercise.settings.practice,true)
 }
 assert.equal(batch.find(p=>p.block.exercise.id.endsWith('record-shallow')).afterBlockId,'application')
})

test('whole course keeps unique IDs, valid snapshots and all seven supported exercise types',()=>{
 assert.equal(raw.modules.length,19);assert.equal(raw.modules.reduce((s,m)=>s+m.lessons.length,0),177)
 assert.equal(new Set(raw.modules.map(m=>m.id)).size,19)
 const lessons=raw.modules.flatMap(m=>m.lessons);assert.equal(new Set(lessons.map(l=>l.id)).size,177)
 for(const l of lessons)assert.equal(new Set(l.blocks.map(b=>b.id)).size,l.blocks.length)
 assert.equal(new Set(placements.map(p=>p.block.exercise.id)).size,49)
 for(const p of placements)validateExercise(p.block.exercise)
 assert.deepEqual([...new Set(placements.map(p=>p.block.exercise.type))].sort(),['architecture-builder','code-debug','code-order','code-trace','data-transform','matching','sequence'])
 const course=validateDownloadedCourse(raw),questions=allLearningQuestions(course)
 assert.equal(questions.length,1619);assert.equal(scoredLearningQuestions(course).length,1265)
 assert.equal(new Set(questions.map(q=>q.id)).size,1619)
})

test('all 39 earlier exercises, ordinary theory and tests, metadata, and full m01–m12 are unchanged',()=>{
 assert.deepEqual(placements.filter(p=>!p.block.exercise.id.startsWith('csharp-b03-')),baseline)
 for(const p of baseline)assert.equal(exerciseFingerprint(p.block.exercise),exerciseFingerprint(placements.find(q=>q.block.exercise.id===p.block.exercise.id).block.exercise))
 const {version,modules,...metadata}=raw
 assert.equal(hash(metadata),hashes.metadataHash);assert.equal(hash(remove(modules,b=>b.kind!=='exercise')),hashes.ordinaryContentHash)
 for(const m of modules.slice(0,12))assert.equal(hash(m),hashes.moduleHashes[m.id],m.id)
 assert.ok(version>hashes.version)
})

test('two independent imports through existing attachExercises exactly reconstruct every lesson',()=>{
 const clean=remove(raw.modules,b=>b.kind!=='exercise')
 for(let i=0;i<2;i++)assert.deepEqual(attachExercises(structuredClone(clean),placements),raw.modules)
})

test('all ten reference solutions accept and preserve checked state, successful result, reset and lesson position',()=>{
 const course=validateDownloadedCourse(raw)
 for(const e of exercises){
  const s=solve(e);assert.ok(s.solvedAnswer,e.id);assert.equal(checkExercise(e,s.checkedAnswer).correct,true)
  assert.equal(submitExercise(e,s),s);assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)
  const reset=resetExercise(e,s,()=>0.4);assert.equal(reset.checkedAnswer,undefined);assert.deepEqual(reset.solvedAnswer,s.solvedAnswer)
  assert.deepEqual(restoreExercises({[e.id]:reset},[e])[e.id],reset)
  const step=course.lessons.find(l=>l.exercise?.id===e.id)
  const a={...freshLearningAttempt(course),lessonId:step.id,view:'practice',exercises:{[e.id]:s}}
  const restored=restoreLearningAttempt(JSON.stringify(a),course)
  assert.equal(restored.lessonId,step.id);assert.deepEqual(restored.exercises[e.id],s)
 }
})

test('ordered tasks reject incorrect steps and accept independent Assert alternatives',()=>{
 for(const e of exercises.filter(e=>['sequence','code-order'].includes(e.type))){
  for(const order of e.validation.acceptedOrders)assert.equal(checkExercise(e,{type:e.type,order}).correct,true)
  const order=[...e.validation.acceptedOrders[0]];[order[0],order[2]]=[order[2],order[0]]
  assert.equal(checkExercise(e,{type:e.type,order}).correct,false)
  assert.throws(()=>checkExercise(e,{type:e.type,order:[...order.slice(1),'missing']}))
 }
 assert.equal(byId('aaa-wallet').validation.acceptedOrders.length,2)
 const dispose=byId('using-dispose'),wrong=['open','body','throw','catch','dispose','finally','after']
 assert.equal(checkExercise(dispose,{type:'sequence',order:wrong}).correct,false)
 const sem=byId('semaphore-owner'),program=assembleExerciseCode(sem,sem.validation.acceptedOrders[0])
 assert.ok(program.indexOf('await gate.WaitAsync(token)')<program.indexOf('    try'))
 assert.match(program,/finally\s*\{\s*gate.Release\(\)/)
})

test('boundary matching rejects wrong reasons, incomplete answers and nonexistent IDs',()=>{
 const e=byId('boundary-cases'),a={type:'matching',pairs:{...e.validation.pairs}}
 assert.equal(checkExercise(e,a).correct,true)
 ;[a.pairs.lower,a.pairs.upper]=[a.pairs.upper,a.pairs.lower]
 assert.equal(checkExercise(e,a).correct,false)
 assert.equal(checkExercise(e,{type:'matching',pairs:{}}).correct,false)
 assert.throws(()=>checkExercise(e,{type:'matching',pairs:{...e.validation.pairs,below:'missing'}}))
})

test('all five traces gate predictions and support incorrect responses, retry and storage without forgetting first answers',()=>{
 const traces=exercises.filter(e=>e.type==='code-trace');assert.equal(traces.length,5)
 for(const e of traces){
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

test('LINQ snapshot remains fixed while the deferred query retains the original changing source',()=>{
 const states=Object.fromEntries(traceSnapshots(byId('deferred-snapshot')).map(s=>[s.id,s]))
 assert.equal(states.query.objects.some(o=>o.id==='snapshot-1'),false)
 assert.equal(states.query.objects.find(o=>o.id==='query-1').fields.Source.objectId,'source-1')
 for(const s of Object.values(states).filter(s=>s.objects.some(o=>o.id==='snapshot-1'))){
  assert.deepEqual(s.objects.find(o=>o.id==='snapshot-1').fields.Items.items.map(i=>i.value),[2,3])
 }
 assert.deepEqual(states['add-four'].objects.find(o=>o.id==='source-1').fields.Items.items.map(i=>i.value),[1,2,3,4])
 assert.deepEqual(states.snapshot.output,['2,3,4','2,3'])
})

test('WhenAny observes the winner and leaves second pending until its own explicit completion',()=>{
 const states=Object.fromEntries(traceSnapshots(byId('whenany-pending')).map(s=>[s.id,s]))
 const second=s=>s.objects.find(o=>o.id==='second-task')
 assert.equal(second(states.winner).fields.IsCompleted.value,false)
 assert.equal(states.winner.variables.find(v=>v.id==='winner').value.objectId,'first-task')
 assert.equal(states.winner.objects.find(o=>o.id==='first-task').fields.Result.value,10)
 assert.equal(second(states['complete-second']).fields.IsCompleted.value,true)
 assert.equal(second(states['complete-second']).fields.Result.value,20)
 assert.deepEqual(states['second-output'].output,['10','False','20'])
})

test('lost update follows the declared two-thread interleaving and removes local read variables after Join',()=>{
 const states=Object.fromEntries(traceSnapshots(byId('lost-update')).map(s=>[s.id,s]))
 const number=(s,id)=>states[s].variables.find(v=>v.id===id)?.value.value
 assert.equal(number('left-read','left-read'),0);assert.equal(number('right-read','right-read'),0)
 assert.equal(number('left-write','counter'),1);assert.equal(number('right-write','counter'),1)
 assert.equal(number('right-write','right-read'),0)
 assert.equal(states.joined.variables.some(v=>v.id.includes('read')),false)
 assert.deepEqual(states.print.output,['1'])
 assert.match(byId('lost-update').instructions,/не утверждение/)
})

test('GC classification agrees with traversal from the sole root and rejects reachable/candidate swaps',()=>{
 const e=byId('gc-reachability'),edges={root:['a'],a:['b'],b:['c'],c:[],d:['e'],e:['d']},reachable=new Set(),pending=['root']
 while(pending.length){const node=pending.shift();if(reachable.has(node))continue;reachable.add(node);pending.push(...edges[node])}
 const answer=solve(e).answer
 for(const edge of answer.graph.edges)assert.equal(edge.target,reachable.has(edge.source)?'live':'candidate')
 const wrong=structuredClone(answer);wrong.graph.edges.find(edge=>edge.source==='d').target='live'
 assert.equal(checkExercise(e,wrong).correct,false)
 const omitted=structuredClone(answer);omitted.graph.nodes=omitted.graph.nodes.filter(n=>n.id!=='e');omitted.graph.edges=omitted.graph.edges.filter(edge=>edge.source!=='e')
 assert.equal(checkExercise(e,omitted).correct,false)
 const moved=structuredClone(answer);moved.graph.nodes.forEach(n=>{n.x=0.05;n.y=0.95});assert.equal(checkExercise(e,moved).correct,true)
 const duplicate=structuredClone(answer);duplicate.graph.nodes.push({id:'another-a',componentId:'a',x:0.5,y:0.5});assert.throws(()=>checkExercise(e,duplicate))
 assert.match(e.description,/D → E и E → D/);assert.match(e.instructions,/не обещает немедленную/)
})

test('Span is a bounded value view over the same buffer, with array range represented as a separate object',()=>{
 const states=Object.fromEntries(traceSnapshots(byId('span-view-copy')).map(s=>[s.id,s]))
 for(const s of Object.values(states)){
  assert.equal(s.objects.some(o=>o.type==='Span<int>'),false)
  const view=s.variables.find(v=>v.id==='view')
  if(view){assert.equal(view.value.kind,'record');assert.equal(view.value.fields.Buffer.objectId,'values-1');assert.equal(view.value.fields.Offset.value,1);assert.equal(view.value.fields.Length.value,2)}
 }
 const values=s=>states[s].objects.find(o=>o.id==='values-1').fields.Items.items.map(i=>i.value)
 const copy=s=>states[s].objects.find(o=>o.id==='copy-1').fields.Items.items.map(i=>i.value)
 assert.deepEqual(values('view-write'),[1,20,3,4]);assert.deepEqual(copy('view-write'),[2,3])
 assert.deepEqual(values('copy-write'),[1,20,3,4]);assert.deepEqual(copy('copy-write'),[2,99])
 assert.deepEqual(states['copy-output'].output,['1,20,3,4','2,99'])
})

test('record with copies the outer object while keeping one nested list and independent names',()=>{
 const states=Object.fromEntries(traceSnapshots(byId('record-shallow')).map(s=>[s.id,s])),copy=states.copy
 assert.deepEqual(copy.variables.map(v=>v.value.objectId),['basket-1','basket-2'])
 const records=copy.objects.filter(o=>o.type==='Basket')
 assert.deepEqual(records.map(o=>o.fields.Name.value),['old','new'])
 assert.deepEqual(records.map(o=>o.fields.Items.objectId),['list-1','list-1'])
 assert.deepEqual(states.add.objects.find(o=>o.id==='list-1').fields.Items.items.map(v=>v.value),[1,2])
 assert.deepEqual(states['inner-identity'].output,['old:new','1,2','False','True'])
})

test('upgrade from v47 preserves all 39 solved states, assessments, answers and final 100% grade',()=>{
 const old={...raw,version:hashes.version,modules:remove(raw.modules,b=>b.kind!=='exercise'||!b.exercise.id.startsWith('csharp-b03-'))}
 const before=validateDownloadedCourse(old),after=validateDownloadedCourse(raw)
 let a=freshLearningAttempt(before)
 a.answers=Object.fromEntries(scoredLearningQuestions(before).map(q=>[q.id,q.kind==='multi'?[...q.correct].sort().join(','):String(q.correct)]))
 a.exercises=Object.fromEntries(baseline.map(p=>{const e=p.block.exercise,s=solve(e);assert.ok(s.solvedAnswer,e.id);return[e.id,s]}))
 a=submitLessonAssessment(before,a,before.lessons.find(l=>l.step?.kind==='module-test').id,new Date('2026-10-27T11:00:00Z'))
 a=finishLearningAttempt(before,a,new Date('2026-10-27T11:01:00Z'))
 const restored=restoreLearningAttempt(JSON.stringify(a),after,before)
 assert.deepEqual(restored.answers,a.answers);assert.deepEqual(restored.exercises,a.exercises)
 assert.deepEqual(restored.assessments,a.assessments);assert.deepEqual(restored.lastResult,a.lastResult)
 assert.equal(restored.finished,true);assert.deepEqual(learningScore(after,restored),learningScore(before,a))
 assert.equal(restored.lastResult.total,1265);assert.equal(restored.lastResult.percent,100)
})

