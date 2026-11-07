import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions,freshLearningAttempt,learningScore,isLearningCorrect,hasLearningAnswer,checkLearningAnswer,submitLessonAssessment,retryLessonAssessment,restoreLearningAttempt,finishLearningAttempt,withOptionOrders,nextLearningStep,learningProgress} from '../src/lib/learning.ts'
import {courseLessonCount} from '../src/lib/courseStructure.ts'
import {qualifiesForCourseReward} from '../src/lib/courseReward.ts'

const completeDocument=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url),'utf8'))
const document={...completeDocument,modules:completeDocument.modules.filter(m=>m.id==='m01').map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))}
const course=validateDownloadedCourse(document)
const answer=q=>q.kind==='multi' ? [...q.correct].sort().join(',') : String(q.correct)
const fill=(attempt,questions=allLearningQuestions(course))=>({...attempt,answers:{...attempt.answers,...Object.fromEntries(questions.map(q=>[q.id,answer(q)]))}})

test('new C# course contains all seven lessons, 14 training questions, 35 lesson questions and 20 exam questions',()=>{
  assert.equal(course.modules.length,1);assert.equal(courseLessonCount(course),7)
  assert.equal(allLearningQuestions(course).length,69);assert.equal(scoredLearningQuestions(course).length,55)
  assert.equal(allLearningQuestions(course).filter(q=>q.kind==='multi').length,3)
  assert.equal(course.lessons.at(-1).step.kind,'module-test')
  assert.equal(course.modules[0].exam.passPercent,80)
  for(const lesson of course.modules[0].lessons){assert.equal(lesson.blocks.filter(b=>b.kind==='test').length,2);assert.equal(lesson.finalTest.questions.length,5)}
  assert.equal(JSON.stringify(document.modules).includes('09_answer_key'),false)
})

test('every supplied answer key is matched exactly, including all-or-nothing multiple selection',()=>{
  const key=readFileSync(new URL('../server/theory-source/csharp-module01/09_answer_key_module01.md',import.meta.url),'utf8')
  const rows=[...key.matchAll(/\| `(M01-[^`]+)` \| (один|несколько) \| \*\*([A-D, ]+)\*\* \|/g)]
  assert.equal(rows.length,69)
  for(const [,id,type,letters] of rows){const q=allLearningQuestions(course).find(q=>q.id===id);assert.ok(q,id);const expected=letters.split(/,\s*/).map(c=>'ABCD'.indexOf(c)).sort().join(',');assert.equal(answer(q),expected);assert.equal(q.kind==='multi',type==='несколько');assert.ok(isLearningCorrect(q,expected))}
})

test('the import retains every code example from lesson files without publishing administrative notes',()=>{
  const root=new URL('../server/theory-source/csharp-module01/',import.meta.url)
  const files=readdirSync(root).filter(f=>/^0[1-7]_/.test(f)).sort()
  for(const [i,file] of files.entries()) {
    const raw=readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n'),lesson=document.modules[0].lessons[i]
    const samples=lesson.blocks.flatMap(b=>b.kind==='theory' ? b.content.filter(p=>p.kind==='code').map(p=>p.text) : b.questions.map(q=>q.code??''))
    samples.push(...lesson.finalTest.questions.map(q=>q.code??''))
    for(const [,code] of raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(samples.some(s=>s.includes(code.trimEnd())),`${file}: missing code ${code.slice(0,50)}`)
    const theory=JSON.stringify(lesson.blocks.filter(b=>b.kind==='theory'))
    assert.ok(theory.includes('Результаты обучения'));assert.ok(theory.includes('Применение и важные нюансы'))
    assert.ok(!theory.includes('административном файле'))
  }
})

test('training answers do not increase graded accuracy or earn a course completion reward',()=>{
  const practice=course.lessons.filter(l=>l.step.kind==='inline-test').flatMap(l=>l.questions)
  const a=fill(freshLearningAttempt(course),practice),score=learningScore(course,a)
  assert.equal(score.answered,0);assert.equal(score.correct,0);assert.equal(score.total,55)
  assert.equal(score.canFinish,false);assert.throws(()=>finishLearningAttempt(course,a))
  assert.equal(qualifiesForCourseReward(course,a),false)
  assert.equal(learningProgress(course,a).percent,20.29)
})

test('multi answers require the exact set, survive shuffling and reject duplicates or extra selections',()=>{
  const q=allLearningQuestions(course).find(q=>q.id==='M01-K10')
  assert.ok(isLearningCorrect(q,'2,0,1'));assert.ok(!isLearningCorrect(q,'0,1'));assert.ok(!isLearningCorrect(q,'0,1,2,3'))
  assert.ok(!hasLearningAnswer(q,'0,0,1,2'));assert.ok(!hasLearningAnswer(q,'4'))
  const a=withOptionOrders(course,fill(freshLearningAttempt(course)))
  assert.equal(a.optionOrders[q.id].length,4)
  assert.ok(isLearningCorrect(q,restoreLearningAttempt(JSON.stringify(a),course).answers[q.id]))
})

test('graded tests reveal feedback only after whole-test submission; first and best survive retries and reload',()=>{
  const step=course.lessons.find(l=>l.step.kind==='lesson-test')
  let a={...freshLearningAttempt(course),lessonId:step.id,view:'practice'}
  a.answers[step.questions[0].id]=answer(step.questions[0])
  assert.equal(checkLearningAnswer(course,a,step.questions[0].id),a)
  assert.throws(()=>submitLessonAssessment(course,a));assert.equal(nextLearningStep(course,a),a)
  a={...a,answers:Object.fromEntries(step.questions.map(q=>[q.id,String((q.correct+1)%4)]))}
  a=submitLessonAssessment(course,a)
  assert.equal(a.assessments[step.id].first.percent,0)
  const first=structuredClone(a.assessments[step.id].first)
  a=retryLessonAssessment(course,a);assert.equal(a.checkedAnswers[step.questions[0].id],undefined)
  a=submitLessonAssessment(course,fill(a,step.questions))
  assert.deepEqual(a.assessments[step.id].first,first);assert.equal(a.assessments[step.id].best.percent,100)
  assert.equal(a.assessments[step.id].last.percent,100)
  const restored=restoreLearningAttempt(JSON.stringify(a),course)
  assert.deepEqual(restored.assessments,a.assessments)
  assert.equal(nextLearningStep(course,restored).view,'theory')
})

test('early completion grades 55 questions, saves every assessed test and never includes training in the result',()=>{
  const a=finishLearningAttempt(course,{...fill(freshLearningAttempt(course),scoredLearningQuestions(course)),view:'all'})
  assert.equal(a.lastResult.total,55);assert.equal(a.lastResult.correct,55)
  assert.equal(a.lastResult.items.some(i=>/-I\d+$/.test(i.question.id)),false)
  assert.equal(Object.keys(a.assessments).length,8);assert.ok(qualifiesForCourseReward(course,a))
  assert.equal(restoreLearningAttempt(JSON.stringify(a),course).finished,true)
})

test('theory resumes after a mini-test and the final lesson leads to the module exam',()=>{
  let a=nextLearningStep(course,freshLearningAttempt(course))
  assert.equal(course.lessons.find(l=>l.id===a.lessonId).step.kind,'inline-test')
  const q=course.lessons.find(l=>l.id===a.lessonId).questions[0]
  a=checkLearningAnswer(course,fill(a,[q]),q.id)
  assert.equal(nextLearningStep(course,a).view,'theory')
  const lastLesson=course.lessons.at(-2)
  a=submitLessonAssessment(course,fill({...freshLearningAttempt(course),view:'practice',lessonId:lastLesson.id},lastLesson.questions))
  assert.equal(nextLearningStep(course,a).lessonId,course.lessons.at(-1).id)
})
