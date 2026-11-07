import test from 'node:test'
import assert from 'node:assert/strict'
import {course} from './fixtures/synthetic-course.mjs'
import {freshLearningAttempt,restoreLearningAttempt,isAnswerChecked} from '../src/lib/learning.ts'

test('changed options invalidate saved answers while unchanged answers and history survive',()=>{
 const old=structuredClone(course),next=structuredClone(course);next.version++
 const q=next.lessons[0].questions[0],unchanged=next.lessons[0].questions[1]
 ;[q.options[0],q.options[1]]=[q.options[1],q.options[0]];q.correct=1
 const saved={...freshLearningAttempt(old),answers:{[q.id]:'0',[unchanged.id]:'0'},checkedAnswers:{[q.id]:'0',[unchanged.id]:'0'}}
 const restored=restoreLearningAttempt(JSON.stringify(saved),next,old)
 assert.equal(restored.answers[q.id],undefined);assert.equal(isAnswerChecked(restored,q),false)
 assert.equal(restored.answers[unchanged.id],'0');assert.equal(isAnswerChecked(restored,unchanged),true)
 assert.equal(JSON.parse(restored.previousEdition).answers[q.id],'0')
 const theoryOnly=structuredClone(old);theoryOnly.version++;theoryOnly.lessons[0].theory.push('More theory')
 assert.deepEqual(restoreLearningAttempt(JSON.stringify(saved),theoryOnly,old).answers,saved.answers)
})
