import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateExercise,checkExercise,exerciseAnswerComplete,editExercise,freshExercise,submitExercise,resetExercise,restoreExercises,previewDebugCode,debugCodeLines,debugFixOptions} from '../src/lib/exercises.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {learningCourseOrder} from '../src/lib/courseStructure.ts'
import {freshLearningAttempt,initializeExerciseStep,restoreLearningAttempt,scoredLearningQuestions,learningScore,finishLearningAttempt,restartLearningAttempt} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'

const placements=JSON.parse(readFileSync(new URL('../server/exercise-source/csharp-foundations-v2.json',import.meta.url)))
const demos=placements.filter(p=>p.block.exercise.type==='code-debug'&&p.block.exercise.id.startsWith('csharp-debug-'))
const [equality,rethrow,asyncDebug]=demos.map(p=>validateExercise(p.block.exercise))
const correct=e=>({type:'code-debug',selection:{...e.content.errors[0].location},fixId:e.validation.acceptedFixes[e.content.errors[0].id][0]})
const raw=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url)))
const course=learningCourseOrder(validateDownloadedCourse(raw))

test('every selected line has local fixes; unrelated snippets never leak and attempts restore',()=>{
 const e=structuredClone(rethrow)
 e.content.code='int count = 2;\n    throw ex;\n}'
 e.content.errors[0].location.line=2
 for(let line=1;line<=3;line++)assert.ok(debugFixOptions(e,line).length>=2)
 assert.deepEqual(debugFixOptions(e,2),e.content.fixOptions)
 const options=debugFixOptions(e,1)
 assert.ok(options.every(f=>!f.code.includes('throw')))
 const fix=options.find(f=>f.code.includes('3'))
 const answer={type:'code-debug',selection:{kind:'line',line:1},fixId:fix.id}
 assert.equal(previewDebugCode(e,answer),'int count = 3;\n    throw ex;\n}')
 assert.equal(checkExercise(e,answer).debugStatus,'wrong-line')
 const state=submitExercise(e,editExercise(e,freshExercise(e),answer))
 assert.deepEqual(restoreExercises({[e.id]:state},[e])[e.id].answer,answer)
 assert.throws(()=>previewDebugCode(e,{...answer,selection:{kind:'line',line:3}}))
})

test('blank source lines have distinct visible fixes and stable retained IDs',()=>{
 const e=structuredClone(rethrow)
 e.content.code='\nthrow ex;'
 e.content.errors[0].location.line=2
 const fixes=debugFixOptions(e,1)
 assert.equal(fixes.filter(f=>!f.code.trim()).length,1)
 assert.equal(new Set(fixes.map(f=>f.code.trimEnd())).size,fixes.length)
 assert.equal(fixes[0].id,'local-line-1-fix-0')
})

test('1.54 duplicate blank-line choices migrate without losing the course or other progress',()=>{
 const step=course.lessons.find(l=>l.exercise?.id===equality.id),e=step.exercise
 const line=debugCodeLines(e.content.code).findIndex((text,index)=>!text.trim()&&index+1!==e.content.errors[0].location.line)+1
 assert.ok(line>0)
 const solved=submitExercise(e,editExercise(e,freshExercise(e),correct(e)))
 const other=submitExercise(rethrow,editExercise(rethrow,freshExercise(rethrow),correct(rethrow)))
 const questions=scoredLearningQuestions(course)
 const allAnswers=Object.fromEntries(questions.map(q=>[q.id,q.kind==='output'?q.answers[0]:q.kind==='multi'?q.correct.join(','):String(q.correct)]))
 const completed=finishLearningAttempt(course,{...freshLearningAttempt(course),answers:allAnswers})
 const resumed=restartLearningAttempt(course,completed),q=questions[0]
 const base={...resumed,lessonId:step.id,view:'practice',answers:{[q.id]:allAnswers[q.id]},checkedAnswers:{[q.id]:allAnswers[q.id]}}
 for(const index of [2,3])for(const checked of [false,true]){
  const legacy={type:'code-debug',selection:{kind:'line',line},fixId:`local-line-${line}-fix-${index}`}
  assert.ok(!debugFixOptions(e,line).some(f=>f.id===legacy.fixId))
  const {checkedAnswer:_oldChecked,...prior}=solved
  const state={...prior,attempts:checked?2:1,answer:legacy,...(checked?{checkedAnswer:structuredClone(legacy)}:{})}
  const saved={...base,exercises:{[e.id]:state,[rethrow.id]:other}}
  const restored=restoreLearningAttempt(JSON.stringify(saved),course)
  assert.deepEqual(restored.exercises[e.id].answer,{type:'code-debug',selection:legacy.selection})
  assert.equal(restored.exercises[e.id].checkedAnswer,undefined)
  assert.equal(restored.exercises[e.id].attempts,state.attempts)
  assert.deepEqual(restored.exercises[e.id].solvedAnswer,solved.solvedAnswer)
  assert.deepEqual(restored.exercises[e.id].rightOrder,state.rightOrder)
  assert.deepEqual(restored.exercises[rethrow.id],other)
  for(const key of ['lessonId','view','answers','checkedAnswers','lastResult','results','assessments','startedAt'])assert.deepEqual(restored[key],saved[key],key)
 }
})

test('legacy fix migration keeps strict validation for unknown IDs and malformed selections',()=>{
 const e=structuredClone(rethrow)
 e.content.code='\nthrow ex;'
 e.content.errors[0].location.line=2
 const state=freshExercise(e),answer={type:'code-debug',selection:{kind:'line',line:1},fixId:'local-line-1-fix-2'}
 const restore=answer=>restoreExercises({[e.id]:{...state,answer}},[e])
 assert.deepEqual(restore(answer)[e.id].answer,{type:'code-debug',selection:answer.selection})
 for(const invalid of [
  {...answer,fixId:'missing'},
  {...answer,fixId:'local-line-1-fix-99'},
  {...answer,fixId:'local-line-2-fix-2'},
  {...answer,selection:{kind:'line',line:0}},
  {...answer,selection:{kind:'line',line:1,column:2}},
  {...answer,execute:true},
 ])assert.throws(()=>restore(invalid))
 const current={...answer,fixId:'local-line-1-fix-0'}
 assert.deepEqual(restore(current)[e.id].answer,current)
})

test('debug distinguishes correct, wrong location, wrong fix and unfinished answers',()=>{
 const a=correct(rethrow)
 assert.equal(checkExercise(rethrow,a).debugStatus,'correct')
 assert.equal(checkExercise(rethrow,{...a,selection:{kind:'line',line:1}}).debugStatus,'wrong-line')
 assert.equal(checkExercise(rethrow,{...a,fixId:'swallow'}).debugStatus,'wrong-fix')
 for(const partial of [{type:'code-debug'},{type:'code-debug',selection:a.selection}]){
  assert.equal(checkExercise(rethrow,partial).debugStatus,'incomplete')
  assert.equal(exerciseAnswerComplete(rethrow,partial),false)
  assert.throws(()=>submitExercise(rethrow,{...freshExercise(rethrow),answer:partial}))
 }
 assert.equal(exerciseAnswerComplete(rethrow,a),true)
 assert.deepEqual(checkExercise(rethrow,a).incorrectIds,[])
})

test('all declared fixes are accepted and identity is independent of visible source text',()=>{
 for(const e of [equality,rethrow,asyncDebug])for(const fixId of e.validation.acceptedFixes[e.content.errors[0].id])assert.equal(checkExercise(e,{...correct(e),fixId}).correct,true)
 const e=structuredClone(rethrow)
 e.content.fixOptions.push({id:'duplicate-text',code:e.content.fixOptions.find(f=>f.id==='preserve').code})
 validateExercise(e)
 assert.equal(checkExercise(e,{...correct(e),fixId:'duplicate-text'}).debugStatus,'wrong-fix')
 e.validation.acceptedFixes['main-error'].push('duplicate-text')
 assert.equal(checkExercise(validateExercise(e),{...correct(e),fixId:'duplicate-text'}).correct,true)
})

test('repeated lines are selected and replaced by physical position, not text search',()=>{
 const e=structuredClone(rethrow)
 e.content.code='    throw ex;\n    throw ex;\n'
 e.content.errors[0].location.line=2
 validateExercise(e)
 assert.equal(checkExercise(e,{...correct(e),selection:{kind:'line',line:1}}).debugStatus,'wrong-line')
 assert.equal(previewDebugCode(e,correct(e)),'    throw ex;\n    throw;\n')
 assert.equal(previewDebugCode(e,{...correct(e),selection:{kind:'line',line:1}}),'    throw;\n    throw ex;\n')
})

test('previews preserve indentation, special characters and CRLF without executing text',()=>{
 const e=structuredClone(rethrow)
 e.content.code='// <script>globalThis.__answerbookDebugExecuted = true</script>\r\n\tthrow ex;\r\n'
 e.content.errors[0].location.line=2
 e.content.fixOptions.find(f=>f.id==='preserve').code='\tthrow; // <img src=x onerror="globalThis.__answerbookDebugExecuted=true">'
 validateExercise(e)
 assert.deepEqual(debugCodeLines(e.content.code).slice(0,2),['// <script>globalThis.__answerbookDebugExecuted = true</script>','\tthrow ex;'])
 const preview=previewDebugCode(e,correct(e))
 assert.equal(preview,e.content.code.split('\r\n')[0]+'\r\n'+e.content.fixOptions[0].code+'\r\n')
 assert.equal(globalThis.__answerbookDebugExecuted,undefined)
 assert.equal(previewDebugCode(e,{type:'code-debug'}),e.content.code)
 assert.equal(checkExercise(e,correct(e)).correct,true)
})

test('invalid IDs, selections, unsupported ranges and unknown options fail validation',()=>{
 for(const line of [0,-1,1.5,'2',10000])assert.throws(()=>checkExercise(rethrow,{...correct(rethrow),selection:{kind:'line',line}}))
 assert.throws(()=>checkExercise(rethrow,{...correct(rethrow),selection:{kind:'range',start:1,end:2}}))
 assert.throws(()=>checkExercise(rethrow,{...correct(rethrow),selection:{kind:'line',line:1,column:2}}))
 assert.throws(()=>checkExercise(rethrow,{...correct(rethrow),fixId:'missing'}))
 assert.throws(()=>checkExercise(rethrow,{type:'code-debug',fixId:'preserve'}))
 assert.throws(()=>checkExercise(rethrow,{...correct(rethrow),execute:true}))
 assert.throws(()=>checkExercise(rethrow,{type:'sequence',order:[]}))
})

test('strict JSON rejects malformed code, error positions, multiple errors and broken answer keys',()=>{
 const cases=[e=>{e.content.code=[]},e=>{e.content.code=''},e=>{e.content.language='../../js'},e=>{e.content.errors=[]},e=>{e.content.errors.push(structuredClone(e.content.errors[0]))},e=>{e.content.errors[0].id='__proto__'},e=>{e.content.errors[0].location.line=0},e=>{e.content.errors[0].location.line=999},e=>{e.content.errors[0].explanation=''},e=>{e.content.fixOptions=[]},e=>{e.content.fixOptions[0].id=e.content.fixOptions[1].id},e=>{e.content.fixOptions[0].code=' '},e=>{e.content.errors[0].location={kind:'line',line:2}},e=>{e.validation.acceptedFixes={missing:['preserve']}},e=>{e.validation.acceptedFixes['main-error']=[]},e=>{e.validation.acceptedFixes['main-error']=['missing']},e=>{e.validation.acceptedFixes['main-error']=['preserve','preserve']},e=>{e.content.eval='alert(1)'},e=>{e.settings.practice=false}]
 for(const change of cases){const e=structuredClone(rethrow);change(e);assert.throws(()=>validateExercise(e))}
})

test('selection-only and checked attempts restore through the existing course storage model',()=>{
 const step=course.lessons.find(l=>l.exercise?.id===rethrow.id)
 let a=initializeExerciseStep(course,{...freshLearningAttempt(course),lessonId:step.id,view:'practice'})
 let s=editExercise(rethrow,a.exercises[rethrow.id],{type:'code-debug',selection:correct(rethrow).selection})
 a={...a,exercises:{[rethrow.id]:s}}
 let restored=restoreLearningAttempt(JSON.stringify(a),course)
 assert.deepEqual(restored.exercises,a.exercises);assert.equal(restored.lessonId,step.id)
 s=submitExercise(rethrow,editExercise(rethrow,s,{...correct(rethrow),fixId:'swallow'}))
 a={...a,exercises:{[rethrow.id]:s}}
 restored=restoreLearningAttempt(JSON.stringify(a),course)
 assert.equal(checkExercise(rethrow,restored.exercises[rethrow.id].checkedAnswer).debugStatus,'wrong-fix')
 assert.equal(restored.exercises[rethrow.id].attempts,1)
})

test('editing, repeated checks, retry and reset keep attempt counts and prior success',()=>{
 let s=submitExercise(rethrow,editExercise(rethrow,freshExercise(rethrow),{...correct(rethrow),fixId:'swallow'}))
 assert.equal(s.attempts,1);assert.equal(submitExercise(rethrow,s),s)
 s=editExercise(rethrow,s,correct(rethrow));assert.equal(s.checkedAnswer,undefined)
 s=submitExercise(rethrow,s);assert.equal(s.attempts,2);assert.ok(s.solvedAnswer)
 const retry=editExercise(rethrow,s,s.answer);assert.deepEqual(retry.answer,s.answer);assert.equal(retry.checkedAnswer,undefined)
 const reset=resetExercise(rethrow,s,()=>0)
 assert.deepEqual(reset.answer,{type:'code-debug'});assert.equal(reset.attempts,2);assert.ok(reset.solvedAnswer)
 assert.deepEqual(restoreExercises({[rethrow.id]:reset},[rethrow])[rethrow.id],reset)
 assert.throws(()=>restoreExercises({[rethrow.id]:{...s,rightOrder:['missing']}},[rethrow]))
 assert.throws(()=>restoreExercises({[rethrow.id]:{...s,solvedAnswer:{...correct(rethrow),fixId:'swallow'}}},[rethrow]))
})

test('updates reset only the changed debug exercise and preserve earlier activity progress',()=>{
 const s=submitExercise(rethrow,editExercise(rethrow,freshExercise(rethrow),correct(rethrow)))
 const old=placements[0].block.exercise,prior=freshExercise(old)
 for(const change of [e=>{e.version++},e=>{e.content.code='// updated\n'+e.content.code;e.content.errors[0].location.line++},e=>{e.content.fixOptions[0].code+=' // updated'},e=>{e.content.errors[0].id='changed';e.validation.acceptedFixes={changed:['preserve']}}]){
  const e=structuredClone(rethrow);change(e);validateExercise(e)
  const restored=restoreExercises({[rethrow.id]:s,[old.id]:prior},[e,old])
  assert.equal(restored[rethrow.id],undefined);assert.deepEqual(restored[old.id],prior)
 }
})

test('all three activities target existing lessons and keep scoring and stage 1–2 content intact',()=>{
 assert.deepEqual(demos.map(p=>[p.moduleId,p.lessonId]),[['m09','m09-l05'],['m14','m14-l03'],['m16','m16-l01']])
 const clean=structuredClone(raw.modules)
 for(const m of clean)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise')
 assert.deepEqual(attachExercises(clean,placements),raw.modules)
 const previous=structuredClone(raw);previous.version=21
 for(const m of previous.modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise'||b.exercise.type!=='code-debug')
 const before=learningCourseOrder(validateDownloadedCourse(previous))
 assert.deepEqual(scoredLearningQuestions(course),scoredLearningQuestions(before))
 const oldStep=before.lessons.find(l=>l.exercise?.type==='code-order')
 const a=initializeExerciseStep(before,{...freshLearningAttempt(before),lessonId:oldStep.id,view:'practice'})
 const restored=restoreLearningAttempt(JSON.stringify(a),course,before)
 assert.deepEqual(restored.exercises,a.exercises);assert.equal(restored.lessonId,a.lessonId)
 assert.deepEqual(learningScore(course,restored),learningScore(before,a))
 assert.equal(course.lessons.filter(l=>l.exercise).length,96)
 const sourceLine=asyncDebug.content.errors[0].location.line
 assert.equal(debugCodeLines(asyncDebug.content.code)[sourceLine-1],'var text = LoadAsync();')
 assert.match(previewDebugCode(asyncDebug,correct(asyncDebug)),/var text = await LoadAsync\(\);\nConsole.WriteLine\(text.Length\);/)
})
