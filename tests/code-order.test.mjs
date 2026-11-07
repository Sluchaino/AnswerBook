import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateExercise,validateExerciseAnswer,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,assembleExerciseCode,exerciseAnswerComplete} from '../src/lib/exercises.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,initializeExerciseStep,restoreLearningAttempt,learningScore,scoredLearningQuestions} from '../src/lib/learning.ts'
import {learningCourseOrder,courseDocument} from '../src/lib/courseStructure.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'

const placements=JSON.parse(readFileSync(new URL('../server/exercise-source/csharp-foundations-v2.json',import.meta.url)))
const demos=placements.filter(p=>p.block.exercise.type==='code-order'&&p.block.exercise.id.startsWith('csharp-code-'))
const [loop,exceptions,asyncMethod]=demos.map(p=>validateExercise(p.block.exercise))
const answer=e=>({type:'code-order',order:[...e.validation.acceptedOrders[0]]})
const raw=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url)))
const course=learningCourseOrder(validateDownloadedCourse(raw))

test('code order validates all three demonstrations and checks IDs without running their source',()=>{
 assert.equal(demos.length,3)
 assert.deepEqual(demos.map(d=>[d.moduleId,d.lessonId]),[['m04','m04-l08'],['m14','m14-l01'],['m16','m16-l02']])
 for(const e of [loop,exceptions,asyncMethod]){
  assert.equal(checkExercise(e,answer(e)).correct,true)
  const wrong=answer(e);[wrong.order[0],wrong.order[1]]=[wrong.order[1],wrong.order[0]]
  assert.equal(checkExercise(e,wrong).correct,false)
  for(const random of [()=>0,()=>0.5,()=>0.999])assert.equal(checkExercise(e,freshExercise(e,random).answer).correct,false)
 }
 assert.match(assembleExerciseCode(loop,answer(loop).order),/for \(int i = 0; i < 3; i\+\+\)\n\{\n    Console.WriteLine\(i\);\n\}/)
 assert.match(assembleExerciseCode(asyncMethod,answer(asyncMethod).order),/using System.Threading.Tasks;[\s\S]*await ShowAsync\(\);[\s\S]*static async Task ShowAsync\(\)\n\{\n    await Task.Delay\(10\);\n    Console.WriteLine\("Готово"\);\n\}/)
})

test('multiple allowed orders compare identities even for identical source fragments',()=>{
 const e=structuredClone(loop)
 e.content.fragments=[{id:'outer-open',code:'{'},{id:'inner-open',code:'{'},{id:'inner-close',code:'}'},{id:'outer-close',code:'}'}]
 e.validation.acceptedOrders=[['outer-open','inner-open','inner-close','outer-close']]
 validateExercise(e)
 const wrong={type:'code-order',order:['inner-open','outer-open','inner-close','outer-close']}
 assert.equal(checkExercise(e,wrong).correct,false)
 assert.equal(assembleExerciseCode(e,wrong.order),assembleExerciseCode(e,answer(e).order))
 e.validation.acceptedOrders.push(wrong.order)
 assert.equal(checkExercise(validateExercise(e),wrong).correct,true)
 assert.equal(checkExercise(e,answer(e)).correct,true)
 assert.equal(checkExercise(e,freshExercise(e,()=>0.99).answer).correct,false)
})

test('multi-line code, whitespace, fixed regions and special characters survive preview exactly',()=>{
 const e=structuredClone(exceptions)
 e.content.language='python'
 e.content.context='x < 3 and y > 0'
 e.content.prefix='# before\n'
 e.content.suffix='\n# after'
 e.content.fragments[0].code='if x < 3:\n\tprint("<tag>&\\n")\n'
 validateExercise(e)
 assert.equal(assembleExerciseCode(e,answer(e).order),[e.content.prefix,...e.content.fragments.map(f=>f.code),e.content.suffix].join('\n'))
 assert.equal(assembleExerciseCode(exceptions,answer(exceptions).order),[exceptions.content.prefix,...exceptions.content.fragments.map(f=>f.code)].join('\n'))
})

test('incomplete code is not a solution, while edits and saves cannot lose or duplicate fragments',()=>{
 const incomplete={type:'code-order',order:answer(loop).order.slice(0,-1)}
 assert.equal(exerciseAnswerComplete(loop,incomplete),false)
 assert.equal(checkExercise(loop,incomplete).correct,false)
 assert.ok(checkExercise(loop,incomplete).incorrectIds.includes('close'))
 assert.throws(()=>validateExerciseAnswer(loop,incomplete))
 assert.throws(()=>assembleExerciseCode(loop,incomplete.order))
 assert.throws(()=>submitExercise(loop,{...freshExercise(loop),answer:incomplete}))
 for(const order of [['header','header','open','close'],['header','open','print','unknown'],null,'header'])assert.throws(()=>checkExercise(loop,{type:'code-order',order}))
 assert.throws(()=>editExercise(loop,freshExercise(loop),incomplete))
})

test('partial work, wrong checks, retry and reset round-trip through existing saves',()=>{
 let s=freshExercise(loop,()=>0)
 s=submitExercise(loop,s)
 assert.equal(s.attempts,1);assert.equal(checkExercise(loop,s.checkedAnswer).correct,false)
 const loaded=restoreExercises({[loop.id]:s},[loop])[loop.id]
 assert.deepEqual(loaded,s)
 s=editExercise(loop,loaded,answer(loop));assert.equal(s.checkedAnswer,undefined)
 s=submitExercise(loop,s);assert.equal(s.attempts,2);assert.ok(s.solvedAnswer)
 assert.equal(submitExercise(loop,s),s)
 const reset=resetExercise(loop,s,()=>0.5)
 assert.equal(reset.attempts,2);assert.ok(reset.solvedAnswer);assert.equal(reset.checkedAnswer,undefined)
 assert.deepEqual(restoreExercises({[loop.id]:reset},[loop])[loop.id],reset)
 assert.deepEqual(new Set(reset.answer.order),new Set(loop.content.fragments.map(f=>f.id)))
})

test('strict schema rejects malformed code exercise content and keys',()=>{
 const mutate=[e=>{e.content.language=''},e=>{e.content.language='../../js'},e=>{e.content.fragments=[]},e=>{e.content.fragments[0].code=' '},e=>{e.content.fragments[0].id=e.content.fragments[1].id},e=>{e.content.fragments[0].eval='x'},e=>{e.content.context=42},e=>{e.content.prefix=null},e=>{e.content.suffix=''},e=>{e.content.run=true},e=>{e.validation.acceptedOrders=[['missing']]},e=>{e.validation.acceptedOrders=[]},e=>{e.settings.practice=false}]
 for(const change of mutate){const e=structuredClone(loop);change(e);assert.throws(()=>validateExercise(e))}
 assert.throws(()=>restoreExercises({[loop.id]:{...freshExercise(loop),answer:{type:'sequence',order:answer(loop).order}}},[loop]))
})

test('changed versions or fragments reset only the changed code activity',()=>{
 const s=submitExercise(loop,editExercise(loop,freshExercise(loop),answer(loop)))
 const oldMatching=placements[0].block.exercise,m=freshExercise(oldMatching)
 for(const change of [e=>{e.version++},e=>{e.content.fragments[0].id='updated-header';e.validation.acceptedOrders[0][0]='updated-header'},e=>{e.content.fragments[0].code+=' // updated'}]){
  const e=structuredClone(loop);change(e);validateExercise(e)
  const restored=restoreExercises({[loop.id]:s,[oldMatching.id]:m},[e,oldMatching])
  assert.equal(restored[loop.id],undefined);assert.deepEqual(restored[oldMatching.id],m)
 }
})

test('import preserves stage one exercises and all test questions without changing grading',()=>{
 const clean=structuredClone(raw.modules)
 for(const m of clean)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise')
 assert.deepEqual(attachExercises(clean,placements),raw.modules)
 const rebuilt=validateDownloadedCourse(courseDocument(course))
 assert.equal(rebuilt.lessons.filter(l=>l.exercise?.type==='matching').length,15)
 assert.equal(rebuilt.lessons.filter(l=>l.exercise?.type==='sequence').length,5)
 assert.equal(rebuilt.lessons.filter(l=>l.exercise?.type==='code-order').length,11)
 const old=structuredClone(raw)
 old.version=20
 for(const m of old.modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise'||b.exercise.type!=='code-order')
 assert.deepEqual(scoredLearningQuestions(course),scoredLearningQuestions(learningCourseOrder(validateDownloadedCourse(old))))
 const step=course.lessons.find(l=>l.exercise?.id===loop.id)
 let attempt=initializeExerciseStep(course,{...freshLearningAttempt(course),lessonId:step.id,view:'practice'})
 const score=learningScore(course,attempt)
 attempt={...attempt,exercises:{[loop.id]:submitExercise(loop,editExercise(loop,attempt.exercises[loop.id],answer(loop)))}}
 const restored=restoreLearningAttempt(JSON.stringify(attempt),course)
 assert.deepEqual(restored.exercises,attempt.exercises);assert.deepEqual(learningScore(course,restored),score)
})
