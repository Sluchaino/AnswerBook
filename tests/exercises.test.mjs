import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises} from '../src/lib/exercises.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,learningScore,restoreLearningAttempt,finishLearningAttempt,scoredLearningQuestions,nextLearningStep,previousLearningStep,initializeExerciseStep,restartLearningAttempt} from '../src/lib/learning.ts'
import {learningCourseOrder,courseDocument} from '../src/lib/courseStructure.ts'

const placements=JSON.parse(readFileSync(new URL('../server/exercise-source/csharp-foundations-v2.json',import.meta.url)))
const [matching,sequence]=placements.map(p=>validateExercise(p.block.exercise))
const raw=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url)))
const course=learningCourseOrder(validateDownloadedCourse(raw))
const correct=e=>e.type==='matching'?{type:'matching',pairs:{...e.validation.pairs}}:{type:'sequence',order:[...e.validation.acceptedOrders[0]]}
const currentExercises=course.lessons.flatMap(l=>l.exercise?[l.exercise]:[])

test('strict exercise schemas reject malformed, unknown and unsafe data before rendering',()=>{
 const bad=[e=>{e.type='script'},e=>{e.settings.practice=false},e=>{e.settings.shuffle='yes'},e=>{e.validation.execute='alert(1)'},e=>{e.version=0},e=>{e.content.left[0].id='__proto__'},e=>{e.content.left[0].label=''},e=>{e.content.right[1].id=e.content.right[0].id},e=>{e.validation.pairs.int='missing'},e=>{e.validation.pairs.extra='int32'},e=>{e.content.left=null},e=>{e.feedback.explanation=null}]
 for(const mutate of bad){const e=structuredClone(matching);mutate(e);assert.throws(()=>validateExercise(e))}
 for(const orders of [[],[['try','throw']],[['try','try','catch','finally','continue']],['not-an-order']])assert.throws(()=>validateExercise({...sequence,validation:{acceptedOrders:orders}}))
 const literal=structuredClone(matching);literal.content.left[0].label='<img src=x onerror=alert(1)>'
 assert.equal(validateExercise(literal).content.left[0].label,'<img src=x onerror=alert(1)>') // React renders plain text.
})

test('matching checks canonical identities, incomplete mappings and wrong pairs deterministically',()=>{
 assert.equal(checkExercise(matching,correct(matching)).correct,true)
 assert.deepEqual(checkExercise(matching,{type:'matching',pairs:{}}).incorrectIds,['int','string','bool','object'])
 const a=correct(matching);[a.pairs.int,a.pairs.bool]=[a.pairs.bool,a.pairs.int]
 assert.deepEqual(checkExercise(matching,a),{correct:false,incorrectIds:['int','bool']})
 assert.throws(()=>checkExercise(matching,{type:'matching',pairs:{int:'int32',bool:'int32'}}))
 assert.throws(()=>checkExercise(matching,{type:'sequence',order:[]}))
})

test('sequence supports alternate complete orders without executing or normalizing text',()=>{
 const alternate=[...sequence.validation.acceptedOrders[0]].reverse()
 const e=validateExercise({...sequence,validation:{acceptedOrders:[sequence.validation.acceptedOrders[0],alternate]}})
 assert.equal(checkExercise(e,{type:'sequence',order:alternate}).correct,true)
 const a=correct(sequence);[a.order[0],a.order[1]]=[a.order[1],a.order[0]]
 assert.deepEqual(checkExercise(sequence,a),{correct:false,incorrectIds:['throw','try']})
 assert.throws(()=>checkExercise(sequence,{type:'sequence',order:['try']}))
})

test('attempts, repeat checks, editing, success, resets and partial restoration are consistent',()=>{
 let s=freshExercise(matching,()=>0)
 assert.equal(s.attempts,0);assert.equal(s.checkedAnswer,undefined)
 assert.throws(()=>submitExercise(matching,s))
 s=editExercise(matching,s,{type:'matching',pairs:{int:'int32'}})
 assert.deepEqual(restoreExercises({[matching.id]:s},[matching])[matching.id],s)
 s=editExercise(matching,s,correct(matching));s=submitExercise(matching,s)
 assert.equal(s.attempts,1);assert.equal(submitExercise(matching,s),s);assert.ok(s.solvedAnswer)
 const reset=resetExercise(matching,s,()=>0.5)
 assert.deepEqual(reset.answer.pairs,{});assert.equal(reset.attempts,1);assert.ok(reset.solvedAnswer);assert.equal(reset.checkedAnswer,undefined)
 s=submitExercise(matching,editExercise(matching,reset,correct(matching)))
 assert.equal(s.attempts,2)
 assert.deepEqual(restoreExercises({[matching.id]:s},[matching])[matching.id],s)
 let q=freshExercise(sequence,()=>0.4)
 assert.deepEqual(restoreExercises({[sequence.id]:q},[sequence])[sequence.id].answer,q.answer)
 q=submitExercise(sequence,editExercise(sequence,q,correct(sequence)))
 assert.equal(resetExercise(sequence,q).attempts,1)
})

test('corrupt saves are rejected and only a changed exercise resets after content updates',()=>{
 const s=freshExercise(matching)
 for(const state of [{...s,attempts:-1},{...s,rightOrder:['missing']},{...s,solvedAnswer:correct(matching)},{...s,checkedAnswer:correct(matching)}])assert.throws(()=>restoreExercises({[matching.id]:state},[matching]))
 const q=freshExercise(sequence)
 const updated={...matching,version:2}
 const restored=restoreExercises({[matching.id]:s,[sequence.id]:q},[updated,sequence])
 assert.equal(restored[matching.id],undefined);assert.deepEqual(restored[sequence.id],q)
 assert.deepEqual(restoreExercises(undefined,[matching]),{})
})

test('lesson placement retains order, supports multiple activities and rejects missing anchors and duplicates',()=>{
 const modules=structuredClone(raw.modules).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))
 const p=structuredClone(placements[0]),second=structuredClone(p);second.block.id='second-exercise';second.block.exercise.id='second-matching'
 const updated=attachExercises(modules,[p,second])
 assert.deepEqual(updated[1].lessons[0].blocks.slice(0,3).map(b=>b.id),['theory-1',p.block.id,second.block.id])
 assert.throws(()=>attachExercises(structuredClone(modules),[{...p,afterBlockId:'missing'}]))
 assert.throws(()=>attachExercises(structuredClone(modules),[p]))
 const duplicate=structuredClone(raw);duplicate.modules[1].lessons[1].blocks.splice(1,0,{...placements[0].block,id:'duplicate'})
 assert.throws(()=>validateDownloadedCourse(duplicate),/Повторный ID/)
 assert.deepEqual(validateDownloadedCourse(courseDocument(course)).modules,course.modules)
})

test('exercises are navigable and restored without changing scores or previous graded results',()=>{
 const eStep=course.lessons.find(l=>l.exercise?.id===matching.id)
 let a=initializeExerciseStep(course,{...freshLearningAttempt(course),lessonId:eStep.id,view:'practice'})
 const originalScore=learningScore(course,a)
 a={...a,exercises:{[matching.id]:submitExercise(matching,editExercise(matching,a.exercises[matching.id],correct(matching)))}}
 assert.deepEqual(learningScore(course,a),originalScore)
 const loaded=restoreLearningAttempt(JSON.stringify(a),course)
 assert.deepEqual(loaded.exercises,a.exercises);assert.equal(loaded.lessonId,eStep.id)
 assert.equal(previousLearningStep(course,a).lessonId,course.lessons[course.lessons.indexOf(eStep)-1].id)
 assert.equal(nextLearningStep(course,a).lessonId,course.lessons[course.lessons.indexOf(eStep)+1].id)
 assert.deepEqual(restartLearningAttempt(course,a).exercises,a.exercises)
 const oldRaw=structuredClone(raw);oldRaw.version=19
 for(const m of oldRaw.modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise')
 const old=validateDownloadedCourse(oldRaw)
 const answers=Object.fromEntries(scoredLearningQuestions(old).map(q=>[q.id,q.kind==='multi'?[...q.correct].sort().join(','):q.kind==='choice'?String(q.correct):q.answers[0]]))
 const finished=finishLearningAttempt(old,{...freshLearningAttempt(old),answers})
 const migrated=restoreLearningAttempt(JSON.stringify(finished),course,old)
 assert.equal(migrated.finished,true);assert.deepEqual(migrated.lastResult,finished.lastResult)
 assert.deepEqual(migrated.answers,finished.answers);assert.deepEqual(migrated.assessments,finished.assessments)
 assert.equal(learningScore(course,migrated).total,1265)
 assert.equal(currentExercises.length,96)
})
