import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {learningCourseOrder,lessonTheoryForReview} from '../src/lib/courseStructure.ts'
import {freshLearningAttempt,restoreLearningAttempt,learningModuleProgress,allLearningQuestions,submitLessonAssessment,nextLearningStep} from '../src/lib/learning.ts'
const original=validateDownloadedCourse(JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url),'utf8')))
const course=learningCourseOrder(original)

test('intro moves last for learners without modifying authored content or saved identities',()=>{
 assert.equal(course.modules[0].id,'m02');assert.equal(course.modules.at(-1).id,'m01')
 assert.equal(original.modules[0].id,'m01');assert.equal(freshLearningAttempt(course).lessonId,course.lessons[0].id)
 assert.deepEqual(new Set(allLearningQuestions(course).map(q=>q.id)),new Set(allLearningQuestions(original).map(q=>q.id)))
 const saved={...freshLearningAttempt(original),lessonId:original.lessons[3].id,answers:{'M01-L01-I01':'0'}}
 const restored=restoreLearningAttempt(JSON.stringify(saved),course,original)
 assert.equal(restored.lessonId,saved.lessonId);assert.deepEqual(restored.answers,saved.answers)
 const exam=course.lessons.find(l=>l.step.moduleId==='m19'&&l.step.kind==='module-test')
 let a={...freshLearningAttempt(course),lessonId:exam.id,view:'practice',answers:Object.fromEntries(exam.questions.map(q=>[q.id,'0']))}
 a=submitLessonAssessment(course,a)
 assert.equal(course.lessons.find(l=>l.id===nextLearningStep(course,a).lessonId).step.moduleId,'m01')
})

test('module progress requires submitted graded answers; accuracy and practice do not inflate it',()=>{
 let a=freshLearningAttempt(course)
 const steps=course.lessons.filter(l=>l.step.moduleId==='m02')
 const graded=steps.filter(l=>l.questions.length&&l.step.kind!=='inline-test')
 a={...a,answers:Object.fromEntries(steps.flatMap(l=>l.questions).map(q=>[q.id,'0']))}
 assert.equal(learningModuleProgress(course,a).completed,0)
 assert.equal(learningModuleProgress(course,a).modules[0].percent,0)
 for(const step of graded)a=submitLessonAssessment(course,a,step.id)
 const p=learningModuleProgress(course,a)
 assert.equal(p.completed,1);assert.equal(p.total,19);assert.equal(p.modules[0].percent,100)
 assert.equal(p.modules[0].total,65)
 const restored=restoreLearningAttempt(JSON.stringify(a),course)
 assert.deepEqual(learningModuleProgress(course,restored),p)
})

test('tests can reveal complete lesson examples without answer keys or unrelated lessons',()=>{
 const step=course.lessons.find(l=>l.step.moduleId==='m02'&&l.step.kind==='lesson-test')
 const reference=lessonTheoryForReview(course,step.id)
 const source=course.modules[0].lessons.find(l=>l.id===step.step.unitLessonId)
 const codes=source.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content.filter(c=>c.kind==='code').map(c=>c.text))
 assert.ok(codes.length>0)
 assert.deepEqual(reference.reading.flatMap(r=>r.content.filter(c=>c.kind==='code').map(c=>c.text)),codes)
 assert.deepEqual(reference.questions,[])
 const exam=course.lessons.find(l=>l.step.moduleId==='m02'&&l.step.kind==='module-test')
 assert.ok(lessonTheoryForReview(course,exam.id).reading.length>reference.reading.length)
})
