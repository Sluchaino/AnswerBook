import {historicalCourse} from './fixtures/csharp-historical-edition.mjs'
import {csharpBatch05Moves} from '../scripts/lib/csharp-batch05-plan.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,exerciseFingerprint,checkTracePrediction,previewDebugCode} from '../src/lib/exercises.ts'
import {moveTrace,chooseTraceOption} from '../src/lib/codeTraces.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,restoreLearningAttempt,allLearningQuestions,scoredLearningQuestions,finishLearningAttempt,learningScore,submitLessonAssessment} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'
import {learningCourseOrder} from '../src/lib/courseStructure.ts'
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'))
const placements=read('../server/exercise-source/csharp-foundations-v2.json'),baseline=read('./fixtures/exercises-before-batch05.json'),hashes=read('./fixtures/csharp-content-before-batch05.json'),raw=read('../server/course-source/csharp-foundations-v2.json')
const batch=placements.filter(p=>p.block.exercise.id.startsWith('csharp-b05-')),exercises=batch.map(p=>validateExercise(p.block.exercise)),get=id=>exercises.find(e=>e.id==='csharp-b05-'+id)
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
test('published C# invariant: at least five per module and at most one per lesson',()=>{
 const manifest=read('../server/AnswerBook.ContentApi/content/catalog.json'),entry=manifest.courses.find(c=>c.id===raw.id),bytes=readFileSync(new URL('../server/AnswerBook.ContentApi/content/courses/'+entry.file,import.meta.url)),published=JSON.parse(bytes)
 assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.equal(bytes.length,entry.bytes);assert.deepEqual(published,{...raw,source:raw.source??''})
 assert.equal(published.modules.length,19);assert.equal(placements.length,96);assert.equal(batch.length,34);assert.equal(baseline.length,62)
 for(const m of published.modules){const n=m.lessons.reduce((n,l)=>n+l.blocks.filter(b=>b.kind==='exercise').length,0);assert.ok(n>=5,`${m.id}: ${n}`);assert.equal(n,m.id==='m04'?6:5);for(const l of m.lessons)assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1,l.id)}
 assert.equal(new Set(placements.map(p=>p.block.exercise.id)).size,96)
})
test('the ten placement-only moves preserve every old ID, version, block and exercise fingerprint',()=>{
 assert.equal(csharpBatch05Moves.length,10)
 for(const old of baseline){const now=placements.find(p=>p.block.exercise.id===old.block.exercise.id);assert.ok(now);assert.deepEqual(now.block,old.block);assert.equal(exerciseFingerprint(now.block.exercise),exerciseFingerprint(old.block.exercise));const move=csharpBatch05Moves.find(m=>m.id===old.block.exercise.id);if(move){const {id:_id,reason:_reason,...target}=move;assert.deepEqual(now,{...target,block:old.block})}else assert.deepEqual(now,old)}
 assert.equal(placements.filter(p=>!p.block.exercise.id.startsWith('csharp-b05-')).length,62)
})
test('ordinary teaching content, 177 lessons, all questions, module order and assessment metadata are unchanged',()=>{
 const {version,modules,...metadata}=raw;assert.ok(version>hashes.version);assert.equal(hash(metadata),hashes.metadataHash);assert.equal(hash(remove(modules,b=>b.kind!=='exercise')),hashes.ordinaryContentHash);assert.deepEqual(modules.map(m=>m.id),Object.keys(hashes.moduleHashes));assert.equal(modules.flatMap(m=>m.lessons).length,177)
 const course=validateDownloadedCourse(raw);assert.equal(allLearningQuestions(course).length,1619);assert.equal(scoredLearningQuestions(course).length,1265);assert.deepEqual(learningCourseOrder(course).modules.map(m=>m.id),['m02','m03','m04','m05','m06','m07','m08','m09','m10','m11','m12','m13','m14','m15','m16','m17','m18','m19','m01'])
})
test('all 96 exercises validate with unique blocks, existing theory anchors and exact repeat imports',()=>{
 for(const p of placements){validateExercise(p.block.exercise);const lesson=raw.modules.find(m=>m.id===p.moduleId)?.lessons.find(l=>l.id===p.lessonId);assert.ok(lesson);const anchor=lesson.blocks.findIndex(b=>b.id===p.afterBlockId);assert.ok(anchor>=0);assert.equal(lesson.blocks[anchor].kind,'theory');assert.deepEqual(lesson.blocks[anchor+1],p.block);assert.equal(new Set(lesson.blocks.map(b=>b.id)).size,lesson.blocks.length)}
 const clean=remove(raw.modules,b=>b.kind!=='exercise');for(let i=0;i<2;i++)assert.deepEqual(attachExercises(structuredClone(clean),placements),raw.modules)
})
test('all 34 new exercises have distinct content, version one, accepted reference solutions and reset/restore',()=>{
 const signatures=new Set(baseline.map(p=>JSON.stringify(p.block.exercise.content))),course=validateDownloadedCourse(raw)
 for(const e of exercises){assert.equal(e.version,1);assert.equal(e.settings.practice,true);assert.doesNotMatch(JSON.stringify(e),/\b(junior|middle|senior)\b/i);const key=JSON.stringify(e.content);assert.equal(signatures.has(key),false,e.id);signatures.add(key);const solved=solve(e);assert.ok(solved.solvedAnswer,e.id);assert.equal(checkExercise(e,solved.checkedAnswer).correct,true);assert.deepEqual(restoreExercises({[e.id]:solved},[e])[e.id],solved);assert.equal(submitExercise(e,solved),solved);const reset=resetExercise(e,solved);assert.equal(reset.checkedAnswer,undefined);assert.deepEqual(reset.solvedAnswer,solved.solvedAnswer);assert.deepEqual(restoreExercises({[e.id]:reset},[e])[e.id],reset);const step=course.lessons.find(l=>l.exercise?.id===e.id),a={...freshLearningAttempt(course),lessonId:step.id,view:'practice',exercises:{[e.id]:solved}};assert.equal(restoreLearningAttempt(JSON.stringify(a),course).lessonId,step.id)}
})
test('all 23 new debug exercises accept every offered semantic alternative and reject every distractor and wrong line',()=>{
 const list=exercises.filter(e=>e.type==='code-debug');assert.equal(list.length,23)
 for(const e of list){const accepted=e.validation.acceptedFixes.problem;for(const f of e.content.fixOptions){const a=debugAnswer(e,f.id);assert.equal(checkExercise(e,a).correct,accepted.includes(f.id),e.id+'/'+f.id);assert.equal(previewDebugCode(e,a).split('\n')[e.content.errors[0].location.line-1],f.code)}const wrong={...debugAnswer(e,accepted[0]),selection:{kind:'line',line:e.content.errors[0].location.line===1?2:1}};assert.equal(checkExercise(e,wrong).correct,false);assert.throws(()=>checkExercise(e,debugAnswer(e,'missing')))}
})
test('eight matchings reject missing, swapped and nonexistent correspondences',()=>{
 const list=exercises.filter(e=>e.type==='matching');assert.equal(list.length,8)
 for(const e of list){assert.equal(checkExercise(e,{type:'matching',pairs:e.validation.pairs}).correct,true);const pairs={...e.validation.pairs},keys=Object.keys(pairs);[pairs[keys[0]],pairs[keys[1]]]=[pairs[keys[1]],pairs[keys[0]]];assert.equal(checkExercise(e,{type:'matching',pairs}).correct,false);assert.equal(checkExercise(e,{type:'matching',pairs:{}}).correct,false);assert.throws(()=>checkExercise(e,{type:'matching',pairs:{...pairs,[keys[0]]:'missing'}}))}
})
test('three code assemblies enforce causal order and reject incomplete or incorrectly ordered fragments',()=>{
 const list=exercises.filter(e=>e.type==='code-order');assert.equal(list.length,3)
 for(const e of list){for(const order of e.validation.acceptedOrders)assert.equal(checkExercise(e,{type:e.type,order}).correct,true);const order=[...e.validation.acceptedOrders[0]];[order[0],order[1]]=[order[1],order[0]];assert.equal(checkExercise(e,{type:e.type,order}).correct,false);assert.equal(checkExercise(e,{type:e.type,order:order.slice(1)}).correct,false)}
})
test('a completed v70 save keeps all 62 solved exercises, results, assessments and 100% score after upgrade',()=>{
 const before=validateDownloadedCourse(historicalCourse('05',baseline)),after=validateDownloadedCourse(raw)
 let a=freshLearningAttempt(before);a.answers=Object.fromEntries(scoredLearningQuestions(before).map(q=>[q.id,q.kind==='multi'?[...q.correct].sort().join(','):String(q.correct)]));a.exercises=Object.fromEntries(baseline.map(p=>{const e=p.block.exercise,s=solve(e);assert.ok(s.solvedAnswer,e.id);return[e.id,s]}));a=submitLessonAssessment(before,a,before.lessons.find(l=>l.step?.kind==='module-test').id,new Date('2026-10-27T18:30:00Z'));a=finishLearningAttempt(before,a,new Date('2026-10-27T18:31:00Z'))
 for(const previous of [before,undefined]){const restored=restoreLearningAttempt(JSON.stringify(a),after,previous);assert.deepEqual(restored.answers,a.answers);assert.deepEqual(restored.exercises,a.exercises);assert.deepEqual(restored.assessments,a.assessments);assert.deepEqual(restored.lastResult,a.lastResult);assert.equal(restored.finished,true);assert.equal(restored.lastResult.percent,100);assert.deepEqual(learningScore(after,restored),learningScore(before,a))}
})
test('every moved exercise resumes at its new lesson, both with and without the prior downloaded course',()=>{
 const before=validateDownloadedCourse(historicalCourse('05',baseline)),after=validateDownloadedCourse(raw)
 for(const move of csharpBatch05Moves){const old=before.lessons.find(l=>l.exercise?.id===move.id),now=after.lessons.find(l=>l.exercise?.id===move.id);assert.notEqual(old.id,now.id)
  for(const state of [freshExercise(old.exercise),solve(old.exercise)]){const saved={...freshLearningAttempt(before),lessonId:old.id,view:'practice',exercises:{[move.id]:state}};for(const previous of [before,undefined]){const restored=restoreLearningAttempt(JSON.stringify(saved),after,previous);assert.equal(restored.lessonId,now.id,move.id);assert.equal(restored.view,'practice');assert.deepEqual(restored.exercises[move.id],state)}}
 }
})
test('exercise relocation fallback does not guess unknown steps or ambiguous block names',()=>{
 const course=validateDownloadedCourse(raw),e=get('real-division'),step=course.lessons.find(l=>l.exercise?.id===e.id),saved={...freshLearningAttempt(course),lessonId:'unknown/unknown/not-a-block',exercises:{[e.id]:solve(e)}}
 assert.equal(restoreLearningAttempt(JSON.stringify(saved),course).lessonId,course.lessons[0].id)
 const ambiguous=structuredClone(course);ambiguous.lessons.push({...step,id:'other/other/'+step.id.split('/').at(-1)})
 saved.lessonId='old/old/'+step.id.split('/').at(-1);assert.equal(restoreLearningAttempt(JSON.stringify(saved),ambiguous).lessonId,course.lessons[0].id)
})
