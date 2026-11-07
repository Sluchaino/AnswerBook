import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions,freshLearningAttempt,finishLearningAttempt,restoreLearningAttempt,learningScore,nextLearningStep,submitLessonAssessment,isLearningCorrect} from '../src/lib/learning.ts'
import {courseLessonCount} from '../src/lib/courseStructure.ts'
import {importMarkdownModule} from '../scripts/lib/import-markdown-module.mjs'

const completeDocument=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url),'utf8'))
const document={...completeDocument,version:10,modules:completeDocument.modules.slice(0,10).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))}
const course=validateDownloadedCourse(document),module=course.modules.find(m=>m.id==='m10')
const questions=allLearningQuestions(course).filter(q=>q.id.startsWith('M10-'))
const root=new URL('../server/theory-source/csharp-module10/',import.meta.url)
const answer=q=>q.kind==='multi' ? [...q.correct].sort().join(',') : String(q.correct)
const fill=(c,a)=>({...a,answers:{...a.answers,...Object.fromEntries(scoredLearningQuestions(c).map(q=>[q.id,answer(q)]))}})

test('module 10 adds eight lessons and 76 questions without colliding with earlier modules',()=>{
  assert.equal(course.version,10);assert.equal(course.modules.length,10);assert.equal(courseLessonCount(course),85)
  assert.equal(module.lessons.length,8);assert.equal(module.exam.questions.length,20);assert.equal(questions.length,76)
  assert.equal(questions.filter(q=>q.kind==='multi').length,13)
  for(const l of module.lessons){assert.equal(l.blocks.filter(b=>b.kind==='test').length,2);assert.equal(l.finalTest.questions.length,5)}
  assert.equal(allLearningQuestions(course).length,795);assert.equal(scoredLearningQuestions(course).length,625)
  assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,795)
})

test('all locally numbered keys map to the correct lesson rather than reusing another lesson’s answers',()=>{
  const text=readFileSync(new URL('10_answer_key_module10.md',root),'utf8')
  const sections=text.split(/^## /m).slice(1);let count=0
  for(const section of sections) {
    const lesson=section.match(/^Урок (\d+)\./)?.[1]
    const entries=[...section.matchAll(/^- \*\*([^:]+): ([A-D, ]+)\.\*\* (.+)$/gm)]
    for(const [,local,letters,explanation] of entries) {
      const id=lesson ? `M10-L${lesson.padStart(2,'0')}-${local.startsWith('М') ? 'P'+local[1] : 'F'+local}` : `M10-EX-${local.padStart(2,'0')}`
      const q=questions.find(q=>q.id===id);assert.ok(q,id)
      assert.equal(answer(q),letters.split(/,\s*/).map(l=>'ABCD'.indexOf(l)).sort().join(','),id)
      assert.ok(isLearningCorrect(q,answer(q)));assert.ok(q.explanation.trim().length>0)
      assert.ok(explanation.includes(q.explanation)||explanation.replace(/\*\*|`/g,'').includes(q.explanation))
      count++
    }
  }
  assert.equal(count,76)
  assert.equal(questions.find(q=>q.id==='M10-L01-P1').correct,1)
})

test('all user-defined type code examples survive import, without administrative key text in lessons',()=>{
  const files=readdirSync(root).filter(f=>/^0[1-8]_/.test(f)).sort();assert.equal(files.length,8)
  for(const [i,file] of files.entries()) {
    const raw=readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n'),lesson=module.lessons[i]
    const samples=lesson.blocks.flatMap(b=>b.kind==='theory' ? b.content.filter(p=>p.kind==='code').map(p=>p.text) : b.questions.map(q=>q.code??''))
    samples.push(...lesson.finalTest.questions.map(q=>q.code??''))
    for(const [,code] of raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(samples.some(s=>s.includes(code.trimEnd())),`${file}: missing ${code.slice(0,35)}`)
    assert.equal(JSON.stringify(lesson).includes('09_answer_key'),false)
    assert.equal(lesson.finalTest.questions.some(q=>q.prompt.includes('*Выберите')),false)
  }
})

test('adding module 10 preserves all nine previous modules’ answers, results and first attempts',()=>{
  const previous=validateDownloadedCourse({...document,version:9,modules:document.modules.slice(0,9)})
  const completed=finishLearningAttempt(previous,fill(previous,{...freshLearningAttempt(previous),view:'all'}))
  const restored=restoreLearningAttempt(JSON.stringify(completed),course,previous)
  assert.equal(restored.finished,false);assert.deepEqual(restored.lastResult,completed.lastResult)
  assert.deepEqual(restored.answers,completed.answers);assert.deepEqual(restored.assessments,completed.assessments)
  assert.equal(learningScore(course,restored).answered,565);assert.equal(learningScore(course,restored).total,625)
  const final=finishLearningAttempt(course,fill(course,restored))
  assert.equal(final.lastResult.total,625);assert.equal(final.lastResult.correct,625);assert.equal(Object.keys(final.assessments).length,95)
  for(const [id,record] of Object.entries(completed.assessments))assert.deepEqual(final.assessments[id].first,record.first)
})

test('module 9 exam advances to module 10 theory',()=>{
  const exam=course.lessons.find(l=>l.step.moduleId==='m09'&&l.step.kind==='module-test')
  let a={...freshLearningAttempt(course),lessonId:exam.id,view:'practice',answers:Object.fromEntries(exam.questions.map(q=>[q.id,answer(q)]))}
  a=submitLessonAssessment(course,a)
  const next=nextLearningStep(course,a)
  assert.equal(next.view,'theory');assert.equal(course.lessons.find(l=>l.id===next.lessonId).step.moduleId,'m10')
})

test('local source numbering produces the same stable identities on every import',()=>{
  const rebuilt=importMarkdownModule({source:fileURLToPath(root),number:10,layout:'local-ids',title:module.title,description:module.description,names:readdirSync(root).filter(f=>/^0[1-8]_/.test(f)).sort(),keyFile:'10_answer_key_module10.md',examFile:'09_module10_exam.md'})
  assert.deepEqual(rebuilt,module)
})
