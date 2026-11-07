import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions,freshLearningAttempt,finishLearningAttempt,restoreLearningAttempt,learningScore,nextLearningStep,submitLessonAssessment,isLearningCorrect} from '../src/lib/learning.ts'
import {courseLessonCount} from '../src/lib/courseStructure.ts'
import {importMarkdownModule} from '../scripts/lib/import-markdown-module.mjs'

const completeDocument=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url),'utf8'))
const document={...completeDocument,version:5,modules:completeDocument.modules.slice(0,5).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))}
const course=validateDownloadedCourse(document),module=course.modules.find(m=>m.id==='m05')
const questions=allLearningQuestions(course).filter(q=>q.id.startsWith('M05-'))
const root=new URL('../server/theory-source/csharp-module05/',import.meta.url)
const answer=q=>q.kind==='multi' ? [...q.correct].sort().join(',') : String(q.correct)
const fill=(c,a)=>({...a,answers:{...a.answers,...Object.fromEntries(scoredLearningQuestions(c).map(q=>[q.id,answer(q)]))}})

test('module 5 adds nine lessons and 83 unique questions to the existing course',()=>{
  assert.equal(course.version,5);assert.equal(course.modules.length,5);assert.equal(courseLessonCount(course),41)
  assert.equal(module.lessons.length,9);assert.equal(module.exam.questions.length,20);assert.equal(questions.length,83)
  for(const l of module.lessons){assert.equal(l.blocks.filter(b=>b.kind==='test').length,2);assert.equal(l.finalTest.questions.length,5)}
  assert.equal(allLearningQuestions(course).length,387);assert.equal(scoredLearningQuestions(course).length,305)
  assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,387)
  assert.ok(questions.some(q=>q.id==='M05-L01-P1'));assert.ok(questions.some(q=>q.id==='M05-L09-F5'));assert.ok(questions.some(q=>q.id==='M05-EX-20'))
})

test('all new narrative answer keys match their original question IDs and exact sets',()=>{
  const key=readFileSync(new URL('11_answer_key_module05.md',root),'utf8')
  const entries=key.split(/^### /m).slice(1);assert.equal(entries.length,83)
  for(const entry of entries) {
    const id=entry.split(' · ')[0],letters=entry.match(/\*\*Правильный ответ:\*\* ([A-D, ]+)(?= \()/)?.[1]
    assert.ok(letters,id)
    const q=questions.find(q=>q.id===id);assert.ok(q,id)
    const expected=letters.split(/,\s*/).map(l=>'ABCD'.indexOf(l)).sort().join(',')
    assert.equal(answer(q),expected,id);assert.ok(isLearningCorrect(q,expected))
    assert.ok(q.explanation.trim().length>0)
  }
})

test('all supplied code fragments survive import and administrative labels are absent from lesson theory',()=>{
  const files=readdirSync(root).filter(f=>/^0[1-9]_/.test(f)).sort();assert.equal(files.length,9)
  for(const [i,file] of files.entries()) {
    const raw=readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n'),lesson=module.lessons[i]
    const samples=lesson.blocks.flatMap(b=>b.kind==='theory' ? b.content.filter(p=>p.kind==='code').map(p=>p.text) : b.questions.map(q=>q.code??''))
    samples.push(...lesson.finalTest.questions.map(q=>q.code??''))
    for(const [,code] of raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(samples.some(s=>s.includes(code.trimEnd())),`${file}: missing ${code.slice(0,35)}`)
    const theory=JSON.stringify(lesson.blocks.filter(b=>b.kind==='theory'))
    assert.equal(theory.includes('10_answer_key'),false)
    assert.equal(theory.includes('**Режим:**'),false)
    assert.equal(lesson.finalTest.questions.some(q=>q.prompt.includes('*Выберите')),false)
  }
})

test('adding module 5 retains answers and immutable results from all four previous modules',()=>{
  const previous=validateDownloadedCourse({...document,version:4,modules:document.modules.slice(0,4)})
  const completed=finishLearningAttempt(previous,fill(previous,{...freshLearningAttempt(previous),view:'all'}))
  const restored=restoreLearningAttempt(JSON.stringify(completed),course,previous)
  assert.equal(restored.finished,false);assert.deepEqual(restored.lastResult,completed.lastResult)
  assert.deepEqual(restored.answers,completed.answers);assert.deepEqual(restored.assessments,completed.assessments)
  assert.equal(learningScore(course,restored).answered,240);assert.equal(learningScore(course,restored).total,305)
  const final=finishLearningAttempt(course,fill(course,restored))
  assert.equal(final.lastResult.total,305);assert.equal(final.lastResult.correct,305);assert.equal(Object.keys(final.assessments).length,46)
  for(const [id,record] of Object.entries(completed.assessments))assert.deepEqual(final.assessments[id].first,record.first)
})

test('module 4 exam leads to the first theory step of module 5',()=>{
  const exam=course.lessons.find(l=>l.step.moduleId==='m04'&&l.step.kind==='module-test')
  let a={...freshLearningAttempt(course),lessonId:exam.id,view:'practice',answers:Object.fromEntries(exam.questions.map(q=>[q.id,answer(q)]))}
  a=submitLessonAssessment(course,a)
  const next=nextLearningStep(course,a)
  assert.equal(next.view,'theory');assert.equal(course.lessons.find(l=>l.id===next.lessonId).step.moduleId,'m05')
})

test('the importer supports the new layout without changing the module on repeated imports',()=>{
  const rebuilt=importMarkdownModule({source:fileURLToPath(root),number:5,title:module.title,description:module.description,names:readdirSync(root).filter(f=>/^0[1-9]_/.test(f)).sort(),keyFile:'11_answer_key_module05.md',examFile:'10_module05_exam.md'})
  const withoutEditorialFix=structuredClone(module)
  const q=withoutEditorialFix.lessons[0].blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions).find(q=>q.id==='M05-L01-P2')
  delete q.code;q.prompt=q.prompt.replace('для следующей функции?','для функции из третьего раздела?')
  assert.deepEqual(rebuilt,withoutEditorialFix)
  const fixed=questions.find(q=>q.id==='M05-L01-P2')
  assert.ok(fixed.code.startsWith('static void PrintLine('));assert.ok(!fixed.code.includes('AAB'))
  assert.ok(!fixed.code.includes('Вывод:'))
})
