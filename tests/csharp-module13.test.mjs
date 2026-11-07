import {normalizeCyrillicSingleModule} from '../scripts/lib/cyrillic-single-module.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {allLearningQuestions,scoredLearningQuestions,freshLearningAttempt,finishLearningAttempt,restoreLearningAttempt,learningScore,nextLearningStep,submitLessonAssessment,isLearningCorrect,withOptionOrders} from '../src/lib/learning.ts'
import {courseLessonCount} from '../src/lib/courseStructure.ts'
import {importMarkdownModule} from '../scripts/lib/import-markdown-module.mjs'

const completeDocument=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url),'utf8'))
const document={...completeDocument,version:13,modules:completeDocument.modules.slice(0,13).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))}
const course=validateDownloadedCourse(document),module=course.modules.find(m=>m.id==='m13')
const questions=allLearningQuestions(course).filter(q=>q.id.startsWith('M13-'))
const root=new URL('../server/theory-source/csharp-module13/',import.meta.url)
const answer=q=>q.kind==='multi' ? [...q.correct].sort().join(',') : String(q.correct)
const fill=(c,a)=>({...a,answers:{...a.answers,...Object.fromEntries(scoredLearningQuestions(c).map(q=>[q.id,answer(q)]))}})

test('module 13 adds ten lessons and ninety single-choice questions',()=>{
  assert.equal(course.version,13);assert.equal(course.modules.length,13);assert.equal(courseLessonCount(course),115)
  assert.equal(module.lessons.length,10);assert.equal(module.exam.questions.length,20);assert.equal(questions.length,90)
  assert.ok(questions.every(q=>q.kind==='choice'))
  for(const l of module.lessons){assert.equal(l.blocks.filter(b=>b.kind==='test').length,2);assert.equal(l.finalTest.questions.length,5)}
  assert.equal(allLearningQuestions(course).length,1065);assert.equal(scoredLearningQuestions(course).length,835)
  assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,1065)
})

test('all ninety imported answers match the machine-readable key and retain explanations',()=>{
  const raw=readFileSync(new URL('12_answer_key_module13.md',root),'utf8')
  const matrix=JSON.parse(raw.match(/```json\s*\n([\s\S]*?)```/)[1])
  let count=0
  for(const [lesson,entry] of Object.entries(matrix.lessons))for(const [field,prefix] of [['mini','P'],['final','F']])for(const [i,letter] of entry[field].entries()){
    const q=questions.find(q=>q.id===`M13-L${lesson}-${prefix}${i+1}`);assert.ok(q)
    assert.equal(q.correct,'ABCD'.indexOf(letter));assert.ok(q.explanation.trim());count++
  }
  for(const [i,letter] of matrix.exam.entries()){
    const q=questions.find(q=>q.id===`M13-EX-${String(i+1).padStart(2,'0')}`);assert.ok(q)
    assert.equal(q.correct,'ABCD'.indexOf(letter));assert.ok(q.explanation.trim());count++
  }
  assert.equal(count,90)
})

test('all supplied LINQ examples and closing caveats are retained in theory',()=>{
  const files=readdirSync(root).filter(f=>/^(?:0[1-9]|10)_/.test(f)).sort();assert.equal(files.length,10)
  for(const [i,file] of files.entries()) {
    const raw=readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n'),lesson=module.lessons[i]
    const samples=lesson.blocks.flatMap(b=>b.kind==='theory' ? b.content.filter(p=>p.kind==='code').map(p=>p.text) : b.questions.map(q=>q.code??''))
    samples.push(...lesson.finalTest.questions.map(q=>q.code??''))
    for(const [,code] of raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(samples.some(s=>s.includes(code.trimEnd())),`${file}: missing example`)
    const theory=lesson.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).map(p=>p.text).join('\n')
    const notes=raw.split('## Что повторить при ошибках')[1]?.split('\n---')[0]
    if(notes)for(const line of notes.split('\n').filter(l=>l.startsWith('- ')))assert.ok(theory.includes(line.slice(2).replace(/`|\*\*/g,'')),file)
    assert.equal(JSON.stringify(lesson).includes('12_answer_key'),false)
  }
})

test('adding module 13 preserves previous answers, results and first attempts',()=>{
  const previous=validateDownloadedCourse({...document,version:12,modules:document.modules.slice(0,12)})
  const completed=finishLearningAttempt(previous,fill(previous,{...freshLearningAttempt(previous),view:'all'}))
  const restored=restoreLearningAttempt(JSON.stringify(completed),course,previous)
  assert.equal(restored.finished,false);assert.deepEqual(restored.lastResult,completed.lastResult)
  assert.deepEqual(restored.answers,completed.answers);assert.deepEqual(restored.assessments,completed.assessments)
  assert.equal(learningScore(course,restored).answered,765);assert.equal(learningScore(course,restored).total,835)
  const final=finishLearningAttempt(course,fill(course,restored))
  assert.equal(final.lastResult.correct,835);assert.equal(Object.keys(final.assessments).length,128)
  for(const [id,record] of Object.entries(completed.assessments))assert.deepEqual(final.assessments[id].first,record.first)
})

test('the module 12 exam advances to module 13 theory',()=>{
  const exam=course.lessons.find(l=>l.step.moduleId==='m12'&&l.step.kind==='module-test')
  let a={...freshLearningAttempt(course),lessonId:exam.id,view:'practice',answers:Object.fromEntries(exam.questions.map(q=>[q.id,answer(q)]))}
  a=submitLessonAssessment(course,a)
  const next=nextLearningStep(course,a)
  assert.equal(next.view,'theory');assert.equal(course.lessons.find(l=>l.id===next.lessonId).step.moduleId,'m13')
})

test('single-choice correctness follows the original option identity after shuffling and reloading',()=>{
  const a=withOptionOrders(course,fill(course,freshLearningAttempt(course)),()=>0)
  const restored=restoreLearningAttempt(JSON.stringify(a),course)
  assert.deepEqual(restored.optionOrders,a.optionOrders)
  let changed=0
  for(const q of questions){const order=restored.optionOrders[q.id],screenIndex=order.indexOf(q.correct);if(screenIndex!==q.correct){changed++;assert.equal(isLearningCorrect(q,String(screenIndex)),false)}assert.ok(isLearningCorrect(q,String(order[screenIndex])))}
  assert.ok(changed>0);assert.equal(learningScore(course,restored).correct,835)
})

test('the alternate Markdown layout is rebuilt deterministically',()=>{
  const rebuilt=importMarkdownModule({source:fileURLToPath(root),number:13,layout:'cyrillic-single',title:module.title,description:module.description,names:readdirSync(root).filter(f=>/^(?:0[1-9]|10)_/.test(f)).sort(),keyFile:'12_answer_key_module13.md',examFile:'11_module13_exam.md'})
  assert.deepEqual(rebuilt,module)
})

test('the importer rejects disagreement between narrative and machine-readable answer keys',()=>{
  const raw=readFileSync(new URL('12_answer_key_module13.md',root),'utf8')
  const damaged=raw.replace('**М1: B**','**М1: A**')
  assert.notEqual(raw,damaged)
  assert.throws(()=>normalizeCyrillicSingleModule(damaged,{number:13,kind:'key'}),/не совпадают/)
})
