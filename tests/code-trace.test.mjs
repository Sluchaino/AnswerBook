import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,checkTracePrediction,exerciseFingerprint} from '../src/lib/exercises.ts'
import {traceSnapshots,traceAccessibleIndex,moveTrace,changeTraceMode,chooseTraceOption,retryTraceOption,validateTraceAnswer,traceValueKey,traceReady,gradeTrace} from '../src/lib/codeTraces.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,initializeExerciseStep,restoreLearningAttempt,learningScore,scoredLearningQuestions} from '../src/lib/learning.ts'
const placements=JSON.parse(readFileSync(new URL('../server/exercise-source/csharp-foundations-v2.json',import.meta.url)))
const [loop,alias,asyncTrace]=placements.filter(p=>p.block.exercise.type==='code-trace').map(p=>validateExercise(p.block.exercise))
const raw=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url)))
const all=e=>traceSnapshots(e)
function complete(e,correct=true){let s=freshExercise(e);for(const p of e.content.predictions){s=editExercise(e,s,moveTrace(e,s.answer,p.atStepId));s=editExercise(e,s,chooseTraceOption(e,s.answer,p.id,correct?p.correctOptionId:p.options.find(o=>o.id!==p.correctOptionId).id));s=checkTracePrediction(e,s,p.id)}s=editExercise(e,s,moveTrace(e,s.answer,e.content.steps.at(-1).id));return submitExercise(e,s)}

test('three trace demos validate and are embedded in existing lessons',()=>{
 const course=validateDownloadedCourse(raw)
 for(const e of [loop,alias,asyncTrace])assert.equal(course.lessons.filter(l=>l.exercise?.id===e.id).length,1)
 assert.equal(course.lessons.filter(l=>l.exercise).length,96)
 assert.equal(scoredLearningQuestions(course).length,1265)
})
test('loop states represent initialization, condition, body, increment and loop scope exactly',()=>{
 const steps=loop.content.steps
 assert.deepEqual(steps.map(s=>s.id),['sum-init','init-i','condition-1','body-1','inc-2','condition-2','body-2','inc-3','condition-3','body-3','inc-4','condition-4','print'])
 assert.deepEqual(steps.filter(s=>s.id.startsWith('body')).map(s=>s.variables[0].value.value),[1,3,6])
 assert.deepEqual(steps.filter(s=>s.id.startsWith('condition')).map(s=>s.variables[1].value.value),[1,2,3,4])
 assert.deepEqual(steps.at(-1).output,['6']);assert.equal(steps.at(-1).variables.some(v=>v.name==='i'),false)
 assert.equal(steps.filter(s=>s.lines.includes(2)).length,8)
})
test('navigation restores whole snapshots backwards and to initial without altering them or attempts',()=>{
 const before=structuredClone(loop),s=freshExercise(loop)
 let a=moveTrace(loop,s.answer,'condition-3');assert.equal(all(loop).find(s=>s.id===a.stepId).variables[0].value.value,3)
 a=moveTrace(loop,a,'body-1');assert.equal(all(loop).find(s=>s.id===a.stepId).variables[0].value.value,1)
 a=moveTrace(loop,a,'initial');assert.deepEqual(all(loop)[0].variables,[])
 assert.equal(s.attempts,0);assert.deepEqual(loop,before)
 assert.throws(()=>moveTrace(loop,a,'missing'))
})
test('prediction blocks future navigation until checked, including wrong answers',()=>{
 let s=freshExercise(loop);assert.equal(traceAccessibleIndex(loop,s.answer),9)
 assert.throws(()=>moveTrace(loop,s.answer,'body-3'))
 s=editExercise(loop,s,moveTrace(loop,s.answer,'condition-3'))
 s=editExercise(loop,s,chooseTraceOption(loop,s.answer,'sum-next','n3'))
 assert.throws(()=>moveTrace(loop,s.answer,'body-3'))
 s=checkTracePrediction(loop,s,'sum-next');assert.equal(s.attempts,1)
 assert.equal(checkTracePrediction(loop,s,'sum-next'),s)
 s=editExercise(loop,s,moveTrace(loop,s.answer,'body-3'));assert.equal(s.answer.stepId,'body-3')
 assert.equal(gradeTrace(loop,s.answer).correct,false)
 s=editExercise(loop,s,moveTrace(loop,s.answer,'condition-3'))
 s=editExercise(loop,s,retryTraceOption(loop,s.answer,'sum-next'))
 s=editExercise(loop,s,chooseTraceOption(loop,s.answer,'sum-next','n6'))
 s=checkTracePrediction(loop,s,'sum-next');assert.equal(s.attempts,2);assert.equal(s.answer.responses['sum-next'].firstChoiceId,'n3')
 s=editExercise(loop,s,moveTrace(loop,s.answer,'print'));assert.ok(traceReady(loop,s.answer))
 s=submitExercise(loop,s);assert.ok(s.solvedAnswer);assert.equal(s.attempts,2)
 const back=editExercise(loop,s,moveTrace(loop,s.answer,'initial'));assert.ok(back.checkedAnswer)
 assert.deepEqual(restoreExercises({[loop.id]:back},[loop])[loop.id],back)
})
test('demo is free to view but cannot satisfy practice completion or unlock untouched practice gates',()=>{
 const e=structuredClone(loop);let a=changeTraceMode(e,freshExercise(e).answer,'demo')
 a=moveTrace(e,a,'print');assert.equal(traceReady(e,a),false)
 a=changeTraceMode(e,a,'practice');assert.equal(a.stepId,'initial');assert.throws(()=>moveTrace(e,a,'print'))
 e.validation.completion='either';let s=freshExercise(e);s=editExercise(e,s,moveTrace(e,changeTraceMode(e,s.answer,'demo'),'print'));s=submitExercise(e,s)
 assert.equal(s.attempts,0);assert.ok(s.solvedAnswer);assert.deepEqual(restoreExercises({[e.id]:s},[e])[e.id],s)
})
test('references and objects are independent; alias mutation and output agree with C#',()=>{
 const [initial,create,assign,change,print]=all(alias)
 assert.deepEqual(initial.objects,[]);assert.equal(create.objects.length,1)
 assert.deepEqual(assign.variables.map(v=>v.value.objectId),['person-1','person-1'])
 assert.deepEqual(change.variables,assign.variables);assert.equal(change.objects[0].fields.Name.value,'Max')
 assert.equal(assign.objects[0].fields.Name.value,'Alex');assert.deepEqual(print.output,['Max'])
 assert.equal(complete(alias).answer.responses.target.checkedChoiceId,'same')
})
test('async demo guarantees synchronous start, incomplete await, caller, controlled completion and result',()=>{
 const states=all(asyncTrace)
 assert.deepEqual(states.map(s=>s.id),['initial','gate','start','suspend','caller','resume','return','print'])
 assert.equal(states[2].objects.find(o=>o.id==='source-task').fields.IsCompleted.value,false)
 assert.equal(states[3].variables.some(v=>v.name==='value'),false)
 assert.equal(states[5].variables.find(v=>v.name==='value').value.value,5)
 assert.equal(states[6].variables.find(v=>v.name==='result').value.value,6)
 assert.deepEqual(states.at(-1).output,['start','caller','6'])
 assert.ok(complete(asyncTrace).solvedAnswer)
})
test('typed values distinguish strings, numbers, booleans, null, null references and structured values',()=>{
 const values=[{kind:'scalar',value:'null'},{kind:'scalar',value:null},{kind:'scalar',value:5},{kind:'scalar',value:'5'},{kind:'scalar',value:false},{kind:'reference',objectId:null}]
 assert.equal(new Set(values.map(traceValueKey)).size,6)
 const e=structuredClone(alias);e.content.initial.variables=values.map((v,i)=>({id:`v${i}`,name:`v${i}`,value:v}))
 e.content.initial.variables.push({id:'nested',name:'nested',value:{kind:'array',items:[{kind:'record',fields:{Text:values[0]}}]}})
 assert.ok(validateExercise(e))
 assert.equal(traceValueKey({kind:'record',fields:{B:values[0],A:values[1]}}),traceValueKey({kind:'record',fields:{A:values[1],B:values[0]}}))
})
test('output snapshots preserve absent panel, empty output and empty line independently',()=>{
 const e=structuredClone(loop);delete e.content.initial.output;e.content.steps[0].output=[];e.content.steps[1].output=['']
 validateExercise(e);assert.equal(all(e)[0].output,undefined);assert.deepEqual(all(e)[1].output,[]);assert.deepEqual(all(e)[2].output,[''])
})
test('strict scenario validator rejects malformed IDs, objects, values, bounds, prediction keys and extra executable fields',()=>{
 const mutations=[e=>e.content.steps[0].id='initial',e=>e.content.steps[0].lines=[0],e=>e.content.steps[0].lines=[51],e=>e.content.initial.phase='after',e=>e.content.steps[0].phase='initial',e=>e.content.steps[0].lines=[],e=>e.content.steps[0].variables[0].value={kind:'reference',objectId:'missing'},e=>e.content.steps[0].variables[0].value={kind:'scalar',value:Infinity},e=>e.content.steps[0].variables[0].value={kind:'execute',code:'alert(1)'},e=>e.content.steps[0].variables[0].value={kind:'record',fields:{constructor:{kind:'scalar',value:1}}},e=>e.content.steps[0].objects=[{id:'x',type:'X',fields:{Other:{kind:'reference',objectId:'missing'}}}],e=>e.content.steps[0].variables[0].name='',e=>e.content.steps[1].variables[0].declaredType='string',e=>e.content.predictions[0].atStepId='missing',e=>e.content.predictions[0].correctOptionId='missing',e=>e.content.predictions[0].correctOptionId='n3',e=>e.content.predictions[0].options[0].id='n6',e=>e.content.steps=Array(101).fill(e.content.steps[0]),e=>e.content.code='x\n'.repeat(51),e=>e.content.run='alert(1)',e=>e.content.steps[0].output=[null],e=>e.content.steps[0].explanation='x'.repeat(2001)]
 for(const mutate of mutations){const e=structuredClone(loop);mutate(e);assert.throws(()=>validateExercise(e))}
})
test('strict saved-answer validation rejects unknown steps, options and forged gates',()=>{
 for(const mutate of [a=>a.stepId='missing',a=>a.furthestStepId='print',a=>a.responses={missing:{attempts:0}},a=>a.responses={'sum-next':{attempts:1,choiceId:'missing',firstChoiceId:'missing'}},a=>a.responses={'sum-next':{attempts:0,firstChoiceId:'n6'}},a=>a.responses={'sum-next':{attempts:1,firstChoiceId:'n6',checkedChoiceId:'n6',choiceId:'n3'}},a=>a.mode='script']){const a=freshExercise(loop).answer;mutate(a);assert.throws(()=>validateTraceAnswer(loop,a))}
})
test('save/restore retains current step, prediction checks and completion, resets changed versions only',()=>{
 let s=complete(loop);const serialized=JSON.stringify({[loop.id]:s});assert.equal(serialized.includes('Console.WriteLine'),false);assert.equal(serialized.includes('variables'),false)
 assert.deepEqual(restoreExercises(JSON.parse(serialized),[loop])[loop.id],s)
 const other=freshExercise(alias),changed={...loop,version:2}
 assert.deepEqual(restoreExercises({[loop.id]:s,[alias.id]:other},[changed,alias]),{[alias.id]:other})
 assert.notEqual(exerciseFingerprint(loop),exerciseFingerprint(changed))
 s=resetExercise(loop,s);assert.equal(s.answer.stepId,'initial');assert.deepEqual(s.answer.responses,{});assert.equal(s.attempts,1);assert.ok(s.solvedAnswer)
 const corrupt=complete(loop);corrupt.attempts=0;assert.throws(()=>restoreExercises({[loop.id]:corrupt},[loop]))
})
test('course persistence reopens trace at the same step without changing graded progress',()=>{
 const course=validateDownloadedCourse(raw),step=course.lessons.find(l=>l.exercise?.id===loop.id)
 let a=initializeExerciseStep(course,{...freshLearningAttempt(course),lessonId:step.id,view:'practice'})
 const before=learningScore(course,a);a.exercises[loop.id]=complete(loop)
 const restored=restoreLearningAttempt(JSON.stringify(a),course)
 assert.equal(restored.lessonId,step.id);assert.deepEqual(restored.exercises,a.exercises);assert.deepEqual(learningScore(course,restored),before)
})
test('repeated content updates retain one previous edition without exponentially nested archives',()=>{
 const course=validateDownloadedCourse(raw)
 let a=freshLearningAttempt({...course,version:1})
 for(let version=2;version<=24;version++)a=restoreLearningAttempt(JSON.stringify(a),{...course,version})
 assert.equal(JSON.parse(a.previousEdition).previousEdition,undefined)
 assert.equal(JSON.parse(a.previousEdition).courseVersion,23)
 assert.ok(JSON.stringify(a).length<10000)
})
test('code and text remain literal, with no HTML evaluation path in trace component',()=>{
 const e=structuredClone(loop);e.content.code='<img src=x onerror=alert(1)>\n'+e.content.code;e.content.initial.variables=[{id:'text',name:'text',value:{kind:'scalar',value:'<script>alert(1)</script>'}}];validateExercise(e)
 const source=readFileSync(new URL('../src/exercises/CodeTraceInput.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(source,/dangerouslySetInnerHTML|\beval\s*\(|new Function/)
 assert.match(source,/aria-current/);assert.match(source,/disabled=\{index>=accessible\}/)
})
