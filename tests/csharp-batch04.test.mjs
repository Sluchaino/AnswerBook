import {historicalCourse} from './fixtures/csharp-historical-edition.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,exerciseFingerprint,checkTracePrediction,previewDebugCode} from '../src/lib/exercises.ts'
import {traceSnapshots,moveTrace,chooseTraceOption,retryTraceOption} from '../src/lib/codeTraces.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,restoreLearningAttempt,allLearningQuestions,scoredLearningQuestions,finishLearningAttempt,learningScore,submitLessonAssessment} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'
import {courseDocument} from '../src/lib/courseStructure.ts'
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'))
const placements=read('./fixtures/exercises-before-batch05.json'),baseline=read('./fixtures/exercises-before-batch04.json'),hashes=read('./fixtures/csharp-content-before-batch04.json'),raw=historicalCourse('05',placements)
const batch=placements.filter(p=>p.block.exercise.id.startsWith('csharp-b04-')),exercises=batch.map(p=>validateExercise(p.block.exercise)),get=id=>exercises.find(e=>e.id==='csharp-b04-'+id)
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
const remove=(modules,predicate)=>modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(predicate)}))}))
function completeTrace(e,wrong=false){let s=freshExercise(e);for(const p of e.content.predictions){s=editExercise(e,s,moveTrace(e,s.answer,p.atStepId));s=editExercise(e,s,chooseTraceOption(e,s.answer,p.id,wrong?p.options.find(o=>o.id!==p.correctOptionId).id:p.correctOptionId));s=checkTracePrediction(e,s,p.id)}s=editExercise(e,s,moveTrace(e,s.answer,e.content.steps.at(-1).id));return submitExercise(e,s)}
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
test('published v70 C# invariant: every one of 19 modules has at least three interactive exercises',()=>{
 const manifest=read('./fixtures/csharp-published-before-batch05.json'),entry=manifest.courses.find(c=>c.id===raw.id)
 // Recreate the immutable v70 payload; old generated server files need not survive cleanup.
 const bytes=Buffer.from(JSON.stringify(courseDocument(validateDownloadedCourse(raw))))
 assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.length,entry.bytes)
 const published=JSON.parse(bytes)
 // The existing publisher normalizes the optional source label to an empty string.
 assert.deepEqual(published,{...raw,source:raw.source??''});assert.equal(published.modules.length,19)
 let total=0
 for(const m of published.modules){const blocks=m.lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='exercise'));assert.ok(blocks.length>=3,`${m.id} ${m.title}: ${blocks.length} < 3`);total+=blocks.length}
 assert.equal(total,62);assert.equal(placements.length,total)
 assert.equal(published.modules.find(m=>m.id==='m04').lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='exercise')).length,6)
})
test('batch04 adds exactly thirteen in the nine allowed modules; old order, lessons and question counts remain',()=>{
 assert.equal(baseline.length,49);assert.equal(batch.length,13)
 assert.deepEqual(Object.fromEntries([...new Set(batch.map(p=>p.moduleId))].sort().map(id=>[id,batch.filter(p=>p.moduleId===id).length])),{m01:2,m03:2,m05:1,m06:2,m07:1,m10:1,m15:1,m18:1,m19:2})
 assert.deepEqual(raw.modules.map(m=>m.id),Object.keys(hashes.moduleHashes))
 const course=validateDownloadedCourse(raw)
 assert.equal(raw.modules.flatMap(m=>m.lessons).length,177);assert.equal(allLearningQuestions(course).length,1619);assert.equal(scoredLearningQuestions(course).length,1265)
 assert.equal(new Set(placements.map(p=>p.block.exercise.id)).size,62)
 for(const m of raw.modules)for(const l of m.lessons)assert.equal(new Set(l.blocks.map(b=>b.id)).size,l.blocks.length)
 for(const p of placements)validateExercise(p.block.exercise)
})
test('all old 49 placements and versions, theory, tests, metadata and the ten untouched modules are identical',()=>{
 assert.deepEqual(placements.filter(p=>!p.block.exercise.id.startsWith('csharp-b04-')),baseline)
 for(const p of baseline)assert.equal(exerciseFingerprint(p.block.exercise),exerciseFingerprint(placements.find(q=>q.block.exercise.id===p.block.exercise.id).block.exercise))
 const {version,modules,...metadata}=raw
 assert.ok(version>hashes.version);assert.equal(hash(metadata),hashes.metadataHash);assert.equal(hash(remove(modules,b=>b.kind!=='exercise')),hashes.ordinaryContentHash)
 const changed=new Set(batch.map(p=>p.moduleId));assert.equal(changed.size,9)
 for(const m of modules.filter(m=>!changed.has(m.id)))assert.equal(hash(m),hashes.moduleHashes[m.id],m.id)
})
test('all thirteen placements follow existing relevant theory, with unique content and two repeat imports',()=>{
 const signatures=new Set(baseline.map(p=>JSON.stringify(p.block.exercise.content)))
 for(const p of batch){const l=raw.modules.find(m=>m.id===p.moduleId).lessons.find(l=>l.id===p.lessonId),i=l.blocks.findIndex(b=>b.id===p.afterBlockId);assert.ok(i>=0);assert.equal(l.blocks[i].kind,'theory');assert.deepEqual(l.blocks[i+1],p.block);assert.equal(p.block.exercise.version,1);assert.equal(p.block.exercise.settings.practice,true);const signature=JSON.stringify(p.block.exercise.content);assert.equal(signatures.has(signature),false);signatures.add(signature);assert.doesNotMatch(JSON.stringify(p.block.exercise),/\b(junior|middle|senior)\b/i)}
 const clean=remove(raw.modules,b=>b.kind!=='exercise');for(let i=0;i<2;i++)assert.deepEqual(attachExercises(structuredClone(clean),placements),raw.modules)
})
test('every new solution survives checked-state restore and reset, including lesson position',()=>{
 const course=validateDownloadedCourse(raw)
 for(const e of exercises){const s=solve(e);assert.ok(s.solvedAnswer,e.id);assert.equal(checkExercise(e,s.checkedAnswer).correct,true);assert.equal(submitExercise(e,s),s);assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s);const reset=resetExercise(e,s);assert.equal(reset.checkedAnswer,undefined);assert.deepEqual(reset.solvedAnswer,s.solvedAnswer);assert.deepEqual(restoreExercises({[e.id]:reset},[e])[e.id],reset);const step=course.lessons.find(l=>l.exercise?.id===e.id),a={...freshLearningAttempt(course),lessonId:step.id,view:'practice',exercises:{[e.id]:s}};const restored=restoreLearningAttempt(JSON.stringify(a),course);assert.equal(restored.lessonId,step.id);assert.deepEqual(restored.exercises[e.id],s)}
})
test('all five new debug exercises accept both semantic fixes, reject every distractor and wrong line',()=>{
 const debug=exercises.filter(e=>e.type==='code-debug');assert.equal(debug.length,5)
 for(const e of debug){const accepted=e.validation.acceptedFixes.problem;assert.equal(accepted.length,2);for(const option of e.content.fixOptions){const a=debugAnswer(e,option.id);assert.equal(checkExercise(e,a).correct,accepted.includes(option.id),e.id+'/'+option.id);assert.equal(previewDebugCode(e,a).split('\n')[e.content.errors[0].location.line-1],option.code)}const wrong={...debugAnswer(e,accepted[0]),selection:{kind:'line',line:e.content.errors[0].location.line===1?2:1}};assert.equal(checkExercise(e,wrong).correct,false);assert.throws(()=>checkExercise(e,debugAnswer(e,'missing')))}
})
test('all three new matchings reject swapped or incomplete pairs and unknown IDs',()=>{
 const matching=exercises.filter(e=>e.type==='matching');assert.equal(matching.length,3)
 for(const e of matching){assert.equal(checkExercise(e,{type:'matching',pairs:e.validation.pairs}).correct,true);const pairs={...e.validation.pairs},keys=Object.keys(pairs);[pairs[keys[0]],pairs[keys[1]]]=[pairs[keys[1]],pairs[keys[0]]];assert.equal(checkExercise(e,{type:'matching',pairs}).correct,false);assert.equal(checkExercise(e,{type:'matching',pairs:{}}).correct,false);assert.throws(()=>checkExercise(e,{type:'matching',pairs:{...pairs,[keys[0]]:'missing'}}))}
})
test('all five traces gate unanswered predictions, reject wrong answers and preserve retry history',()=>{
 const traces=exercises.filter(e=>e.type==='code-trace');assert.equal(traces.length,5)
 for(const e of traces){assert.throws(()=>moveTrace(e,freshExercise(e).answer,e.content.steps.at(-1).id));let s=completeTrace(e,true);assert.equal(s.solvedAnswer,undefined);const p=e.content.predictions[0],first=s.answer.responses[p.id].firstChoiceId;s=editExercise(e,s,moveTrace(e,s.answer,p.atStepId));s=editExercise(e,s,retryTraceOption(e,s.answer,p.id));s=editExercise(e,s,chooseTraceOption(e,s.answer,p.id,p.correctOptionId));s=checkTracePrediction(e,s,p.id);assert.equal(s.answer.responses[p.id].firstChoiceId,first);assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)}
})
test('bit-mask predicates are snapshots: any=true, all=false even after later flags changes',()=>{
 const ss=Object.fromEntries(traceSnapshots(get('bit-masks')).map(s=>[s.id,s])),v=(step,id)=>ss[step].variables.find(v=>v.id===id).value.value
 assert.equal(v('all','any'),true);assert.equal(v('all','all'),false);assert.equal(v('set','flags'),3);assert.equal(v('clear','flags'),2);assert.equal(v('clear','all'),false);assert.deepEqual(ss.print.output,['True:False:2'])
})
test('null default does not assign, empty string survives ??, and ?: selects empty',()=>{
 const ss=Object.fromEntries(traceSnapshots(get('null-default')).map(s=>[s.id,s])),v=(step,id)=>ss[step].variables.find(v=>v.id===id).value.value
 assert.equal(v('first','name'),null);assert.equal(v('first','first'),'guest');assert.equal(v('assign','name'),'');assert.equal(v('second','second'),'');assert.equal(v('label','label'),'empty');assert.deepEqual(ss.print.output,['guest::empty'])
})
test('rectangular shape is 2 by 3 and only the last cell changes',()=>{
 const ss=traceSnapshots(get('matrix-shape')).slice(1),first=ss[0].objects[0],last=ss.at(-1).objects[0]
 for(const s of ss){assert.equal(s.objects.length,1);assert.equal(s.objects[0].type,'int[,]');assert.equal(s.objects[0].fields.Rows.value,2);assert.equal(s.objects[0].fields.Columns.value,3)}
 assert.deepEqual(first.fields.RowMajorValues.items.map(v=>v.value),[1,2,3,4,5,6]);assert.deepEqual(last.fields.RowMajorValues.items.map(v=>v.value),[1,2,3,4,5,9]);assert.deepEqual(ss.at(-1).output,['2:3:6:9'])
})
test('string Replace rebinds only second, preserving the original immutable object',()=>{
 const ss=Object.fromEntries(traceSnapshots(get('string-rebind')).map(s=>[s.id,s]))
 assert.deepEqual(ss.alias.variables.map(v=>v.value.objectId),['cat-1','cat-1']);assert.deepEqual(ss.replace.variables.map(v=>v.value.objectId),['cat-1','bat-1']);for(const s of Object.values(ss).filter(s=>s.objects.length))assert.equal(s.objects.find(o=>o.id==='cat-1').fields.Text.value,'cat');assert.deepEqual(ss.identity.output,['cat','bat','False'])
})
test('struct fields are copied values, class fields are shared through one object',()=>{
 const ss=Object.fromEntries(traceSnapshots(get('struct-class-copy')).map(s=>[s.id,s])),last=ss.print
 assert.equal(last.variables.find(v=>v.id==='a').value.fields.X.value,2);assert.equal(last.variables.find(v=>v.id==='b').value.fields.X.value,9);assert.deepEqual(last.variables.filter(v=>v.declaredType==='Box').map(v=>v.value.objectId),['box-1','box-1']);assert.equal(last.objects.length,1);assert.equal(last.objects[0].fields.X.value,7);assert.deepEqual(last.output,['2:9:7:7']);assert.equal(Object.values(ss).some(s=>s.objects.some(o=>o.type==='Point')),false)
})
test('v57 saved progress for all 49 old exercises and a finished 100% course survives upgrade',()=>{
 const old={...raw,version:hashes.version,modules:remove(raw.modules,b=>b.kind!=='exercise'||!b.exercise.id.startsWith('csharp-b04-'))},before=validateDownloadedCourse(old),after=validateDownloadedCourse(raw)
 let a=freshLearningAttempt(before);a.answers=Object.fromEntries(scoredLearningQuestions(before).map(q=>[q.id,q.kind==='multi'?[...q.correct].sort().join(','):String(q.correct)]));a.exercises=Object.fromEntries(baseline.map(p=>{const e=p.block.exercise,s=solve(e);assert.ok(s.solvedAnswer,e.id);return[e.id,s]}));a=submitLessonAssessment(before,a,before.lessons.find(l=>l.step?.kind==='module-test').id,new Date('2026-10-27T17:00:00Z'));a=finishLearningAttempt(before,a,new Date('2026-10-27T17:01:00Z'))
 const restored=restoreLearningAttempt(JSON.stringify(a),after,before);assert.deepEqual(restored.answers,a.answers);assert.deepEqual(restored.exercises,a.exercises);assert.deepEqual(restored.assessments,a.assessments);assert.deepEqual(restored.lastResult,a.lastResult);assert.equal(restored.finished,true);assert.equal(restored.lastResult.percent,100);assert.deepEqual(learningScore(after,restored),learningScore(before,a))
})
