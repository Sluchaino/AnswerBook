import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions,freshLearningAttempt,finishLearningAttempt,restoreLearningAttempt,learningScore,nextLearningStep,submitLessonAssessment} from '../src/lib/learning.ts'
import {courseLessonCount} from '../src/lib/courseStructure.ts'
import {qualifiesForCourseReward} from '../src/lib/courseReward.ts'
import {freshEconomy,rewardCompletions} from '../src/lib/economy.ts'
import {importMarkdownModule} from '../scripts/lib/import-markdown-module.mjs'

const completeDocument=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url),'utf8'))
const document={...completeDocument,version:2,modules:completeDocument.modules.filter(m=>['m01','m02'].includes(m.id)).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))}
const course=validateDownloadedCourse(document),module=course.modules.find(m=>m.id==='m02')
const moduleQuestions=allLearningQuestions(course).filter(q=>q.id.startsWith('M02-'))
const answer=q=>q.kind==='multi' ? [...q.correct].sort().join(',') : String(q.correct)
const fill=(c,a)=>({...a,answers:{...a.answers,...Object.fromEntries(scoredLearningQuestions(c).map(q=>[q.id,answer(q)]))}})

test('the C# course now contains two modules with 16 lessons, 32 training and 120 graded questions',()=>{
  assert.equal(course.version,2);assert.equal(course.modules.length,2);assert.equal(courseLessonCount(course),16)
  assert.equal(module.lessons.length,9);assert.equal(module.exam.questions.length,20)
  assert.equal(moduleQuestions.length,83);assert.equal(moduleQuestions.filter(q=>q.kind==='multi').length,11)
  for(const l of module.lessons){assert.equal(l.blocks.filter(b=>b.kind==='test').length,2);assert.equal(l.finalTest.questions.length,5)}
  assert.equal(allLearningQuestions(course).length,152);assert.equal(scoredLearningQuestions(course).length,120)
  assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,152)
})

test('all 83 new answer keys match their questions including eleven multiple-selection questions',()=>{
  const key=readFileSync(new URL('../server/theory-source/csharp-module02/11_answer_key_module02.md',import.meta.url),'utf8')
  const rows=[...key.matchAll(/\| `(M02-[^`]+)` \| (один|несколько) \| \*\*([A-D, ]+)\*\* \|/g)]
  assert.equal(rows.length,83)
  for(const [,id,type,letters] of rows){const q=moduleQuestions.find(q=>q.id===id);assert.ok(q,id);assert.equal(answer(q),letters.split(/,\s*/).map(l=>'ABCD'.indexOf(l)).sort().join(','));assert.equal(q.kind==='multi',type==='несколько')}
})

test('all code fragments in all nine supplied lessons are retained; keys and file references are absent from theory',()=>{
  const root=new URL('../server/theory-source/csharp-module02/',import.meta.url)
  const files=readdirSync(root).filter(f=>/^0[1-9]_/.test(f)).sort();assert.equal(files.length,9)
  for(const [i,file] of files.entries()) {
    const raw=readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n'),lesson=module.lessons[i]
    const samples=lesson.blocks.flatMap(b=>b.kind==='theory' ? b.content.filter(p=>p.kind==='code').map(p=>p.text) : b.questions.map(q=>q.code??''))
    samples.push(...lesson.finalTest.questions.map(q=>q.code??''))
    for(const [,code] of raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(samples.some(s=>s.includes(code.trimEnd())),`${file}: missing example ${code.slice(0,40)}`)
    assert.ok(JSON.stringify(lesson.blocks).includes('Результаты обучения'))
    assert.equal(JSON.stringify(lesson).includes('11_answer_key'),false)
  }
})

test('adding module 2 preserves module 1 answers, immutable results, first attempts and purchased course identity',()=>{
  const previous=validateDownloadedCourse({...document,version:1,modules:[document.modules[0]]})
  const finished=finishLearningAttempt(previous,fill(previous,{...freshLearningAttempt(previous),view:'all'}))
  const restored=restoreLearningAttempt(JSON.stringify(finished),course,previous)
  assert.equal(restored.finished,false);assert.deepEqual(restored.answers,finished.answers)
  assert.deepEqual(restored.lastResult,finished.lastResult);assert.deepEqual(restored.assessments,finished.assessments)
  assert.equal(learningScore(course,restored).answered,55);assert.equal(learningScore(course,restored).total,120)
  assert.equal(qualifiesForCourseReward(course,restored),false)
  const complete=finishLearningAttempt(course,fill(course,restored))
  assert.equal(complete.lastResult.total,120);assert.equal(complete.lastResult.correct,120)
  assert.equal(Object.keys(complete.assessments).length,18)
  for(const [id,record] of Object.entries(finished.assessments))assert.deepEqual(complete.assessments[id].first,record.first)
  const fact={id:course.id,started:true,completed:true,rewardEligible:true},e=freshEconomy([fact],'2026-10-26')
  assert.equal(rewardCompletions(e,[fact],'2026-10-26').balance,e.balance)
})

test('the first module exam now leads into the theory of the second module',()=>{
  const exam=course.lessons.find(l=>l.step.moduleId==='m01' && l.step.kind==='module-test')
  let a={...freshLearningAttempt(course),lessonId:exam.id,view:'practice'}
  a={...a,answers:Object.fromEntries(exam.questions.map(q=>[q.id,answer(q)]))}
  a=submitLessonAssessment(course,a)
  const next=nextLearningStep(course,a)
  assert.equal(next.view,'theory');assert.equal(course.lessons.find(l=>l.id===next.lessonId).step.moduleId,'m02')
})

test('the reusable importer rebuilds the new module deterministically from the supplied sources',()=>{
  const rebuilt=importMarkdownModule({source:fileURLToPath(new URL('../server/theory-source/csharp-module02/',import.meta.url)),number:2,title:module.title,description:module.description,names:readdirSync(new URL('../server/theory-source/csharp-module02/',import.meta.url)).filter(f=>/^0[1-9]_/.test(f)).sort(),keyFile:'11_answer_key_module02.md',examFile:'10_module02_exam.md'})
  assert.deepEqual(rebuilt,module)
})
