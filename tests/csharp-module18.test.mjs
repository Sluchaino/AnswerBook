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
const document={...completeDocument,version:18,modules:completeDocument.modules.slice(0,18).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))}
const course=validateDownloadedCourse(document),module=course.modules.find(m=>m.id==='m18')
const questions=allLearningQuestions(course).filter(q=>q.id.startsWith('M18-'))
const root=new URL('../server/theory-source/csharp-module18/',import.meta.url)
const answer=q=>q.kind==='multi' ? [...q.correct].sort().join(',') : String(q.correct)
const fill=(c,a)=>({...a,answers:{...a.answers,...Object.fromEntries(scoredLearningQuestions(c).map(q=>[q.id,answer(q)]))}})

test('module 18 adds nine lessons and 83 single-choice questions',()=>{
  assert.equal(course.version,18);assert.equal(course.modules.length,18);assert.equal(courseLessonCount(course),167)
  assert.equal(module.lessons.length,9);assert.equal(module.exam.questions.length,20);assert.equal(questions.length,83)
  assert.ok(questions.every(q=>q.kind==='choice'))
  for(const l of module.lessons){assert.equal(l.blocks.filter(b=>b.kind==='test').length,2);assert.equal(l.finalTest.questions.length,5)}
  assert.equal(allLearningQuestions(course).length,1529);assert.equal(scoredLearningQuestions(course).length,1195)
  assert.equal(new Set(allLearningQuestions(course).map(q=>q.id)).size,1529)
})

test('all 83 imported answers match the machine-readable key and retain explanations',()=>{
  const raw=readFileSync(new URL('11_answer_key_module18.md',root),'utf8')
  const matrix=JSON.parse(raw.match(/```json\s*\n([\s\S]*?)```/)[1])
  let count=0
  for(const [section,entries] of Object.entries(matrix))for(const [label,letter] of Object.entries(entries)){
    const id=section==='exam' ? `M18-EX-${label.slice(1).padStart(2,'0')}` : `M18-L${section.slice(-2)}-${label.startsWith('M')?'P':'F'}${label.slice(1)}`
    const q=questions.find(q=>q.id===id);assert.ok(q,id)
    assert.equal(q.correct,'ABCD'.indexOf(letter));assert.ok(q.explanation.trim());count++
  }
  assert.equal(count,83)
})

test('all supplied memory management examples and closing caveats are retained in theory',()=>{
  const files=readdirSync(root).filter(f=>/^0[1-9]_/.test(f)).sort();assert.equal(files.length,9)
  for(const [i,file] of files.entries()) {
    const raw=readFileSync(new URL(file,root),'utf8').replace(/\r\n/g,'\n'),lesson=module.lessons[i]
    const samples=lesson.blocks.flatMap(b=>b.kind==='theory' ? b.content.filter(p=>p.kind==='code').map(p=>p.text) : b.questions.map(q=>q.code??''))
    samples.push(...lesson.finalTest.questions.map(q=>q.code??''))
    for(const [,code] of raw.matchAll(/```[^\n]*\n([\s\S]*?)```/g))assert.ok(samples.some(s=>s.includes(code.trimEnd())),`${file}: missing example`)
    const theory=lesson.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).map(p=>p.text).join('\n')
    const notes=raw.split('## Перед следующим уроком')[1]?.split('## Источники для проверки материалов')[0]
    if(notes)for(const line of notes.split('\n').filter(l=>l.trim()))assert.ok(theory.includes(line.replace(/^- /,'').replace(/`|\*/g,'')),file)
    assert.equal(JSON.stringify(lesson).includes('11_answer_key'),false)
    assert.equal(JSON.stringify(lesson).includes('Источники для проверки материалов'),false)
    assert.equal(JSON.stringify(lesson).includes('learn.microsoft.com'),false)
  }
})

test('adding module 18 preserves previous answers, results and first attempts',()=>{
  const previous=validateDownloadedCourse({...document,version:17,modules:document.modules.slice(0,17)})
  const completed=finishLearningAttempt(previous,fill(previous,{...freshLearningAttempt(previous),view:'all'}))
  const restored=restoreLearningAttempt(JSON.stringify(completed),course,previous)
  assert.equal(restored.finished,false);assert.deepEqual(restored.lastResult,completed.lastResult)
  assert.deepEqual(restored.answers,completed.answers);assert.deepEqual(restored.assessments,completed.assessments)
  assert.equal(learningScore(course,restored).answered,1130);assert.equal(learningScore(course,restored).total,1195)
  const final=finishLearningAttempt(course,fill(course,restored))
  assert.equal(final.lastResult.correct,1195);assert.equal(Object.keys(final.assessments).length,185)
  for(const [id,record] of Object.entries(completed.assessments))assert.deepEqual(final.assessments[id].first,record.first)
})

test('the module 17 exam advances to module 18 theory',()=>{
  const exam=course.lessons.find(l=>l.step.moduleId==='m17'&&l.step.kind==='module-test')
  let a={...freshLearningAttempt(course),lessonId:exam.id,view:'practice',answers:Object.fromEntries(exam.questions.map(q=>[q.id,answer(q)]))}
  a=submitLessonAssessment(course,a)
  const next=nextLearningStep(course,a)
  assert.equal(next.view,'theory');assert.equal(course.lessons.find(l=>l.id===next.lessonId).step.moduleId,'m18')
})

test('single-choice correctness follows the original option identity after shuffling and reloading',()=>{
  const a=withOptionOrders(course,fill(course,freshLearningAttempt(course)),()=>0)
  const restored=restoreLearningAttempt(JSON.stringify(a),course)
  assert.deepEqual(restored.optionOrders,a.optionOrders)
  let changed=0
  for(const q of questions){const order=restored.optionOrders[q.id],screenIndex=order.indexOf(q.correct);if(screenIndex!==q.correct){changed++;assert.equal(isLearningCorrect(q,String(screenIndex)),false)}assert.ok(isLearningCorrect(q,String(order[screenIndex])))}
  assert.ok(changed>0);assert.equal(learningScore(course,restored).correct,1195)
})

test('the alternate Markdown layout is rebuilt deterministically',()=>{
  const rebuilt=importMarkdownModule({source:fileURLToPath(root),number:18,layout:'cyrillic-single',title:module.title,description:module.description,names:readdirSync(root).filter(f=>/^0[1-9]_/.test(f)).sort(),keyFile:'11_answer_key_module18.md',examFile:'10_module18_exam.md'})
  assert.deepEqual(rebuilt,module)
})

test('the importer rejects disagreement between narrative and machine-readable answer keys',()=>{
  const raw=readFileSync(new URL('11_answer_key_module18.md',root),'utf8')
  const damaged=raw.replace('**М1: B**','**М1: A**')
  assert.notEqual(raw,damaged)
  assert.throws(()=>normalizeCyrillicSingleModule(damaged,{number:18,kind:'key'}),/не совпадают/)
})
