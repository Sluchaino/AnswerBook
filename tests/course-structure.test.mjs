import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {modularDocument} from './fixtures/modular-course.mjs'
import {courseDocument,courseLessonCount,lessonTheoryForReview} from '../src/lib/courseStructure.ts'
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {resolve,join,sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import {validateDownloadedCourse,validateLearningBundle,fetchLearningBundle} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,nextLearningStep,previousLearningStep,checkLearningAnswer,learningScore,finishLearningAttempt,restoreLearningAttempt,openLearningAttempt,allLearningQuestions,learningProgress,startMistakeReview} from '../src/lib/learning.ts'

const make=()=>validateDownloadedCourse(structuredClone(modularDocument))
const checkStep=(course,attempt)=>{
  for(const q of course.lessons.find(l=>l.id===attempt.lessonId).questions){attempt={...attempt,answers:{...attempt.answers,[q.id]:'0'}};attempt=checkLearningAnswer(course,attempt,q.id)}
  return attempt
}

test('modules expand into ordered theory, inline tests, examples and end-of-lesson tests without duplicating questions',()=>{
  const c=make()
  assert.equal(c.modules.length,2);assert.equal(courseLessonCount(c),3)
  assert.deepEqual(c.lessons.slice(0,4).map(l=>l.step.kind),['theory','inline-test','theory','lesson-test'])
  assert.equal(c.lessons.length,12);assert.equal(allLearningQuestions(c).length,6)
  assert.equal(new Set(c.lessons.map(l=>l.id)).size,12)
  assert.equal(c.lessons[8].step.moduleId,'second-module')
  assert.deepEqual(validateDownloadedCourse(courseDocument(c)),c)
  assert.equal('lessons' in courseDocument(c),false)
  // Untrusted derived data is rebuilt from modules, never used as another assessment.
  assert.deepEqual(validateDownloadedCourse({...modularDocument,lessons:[{id:'injected'}]}),c)
})

test('the authoring template validates and theory review collects all parts of the correct lesson',()=>{
  const template=JSON.parse(readFileSync(new URL('../docs/course-template.json.example',import.meta.url),'utf8'))
  assert.equal(validateDownloadedCourse(template).modules.length,1)
  const c=make(),theory=lessonTheoryForReview(c,c.lessons[3].id)
  assert.equal(theory.title,c.modules[0].lessons[0].title)
  assert.equal(theory.reading.length,2)
  assert.deepEqual(theory.questions,[])
  assert.equal(lessonTheoryForReview(c,'missing'),undefined)
})

test('learning moves through tests during and after a lesson; unverified answers block advancing',()=>{
  const c=make();let a=freshLearningAttempt(c)
  assert.equal(a.view,'theory');assert.equal(previousLearningStep(c,a),a)
  a=nextLearningStep(c,a);assert.equal(a.view,'practice')
  assert.equal(nextLearningStep(c,a),a)
  a={...a,answers:{'first-inline':'0'}};assert.equal(nextLearningStep(c,a),a)
  a=checkStep(c,a);a=nextLearningStep(c,a)
  assert.equal(a.view,'theory');assert.equal(c.lessons.find(l=>l.id===a.lessonId).title,'Fixture theory')
  a=nextLearningStep(c,a);assert.equal(c.lessons.find(l=>l.id===a.lessonId).step.kind,'lesson-test')
  assert.equal(nextLearningStep(c,a),a)
  a=nextLearningStep(c,checkStep(c,a));assert.equal(c.lessons.find(l=>l.id===a.lessonId).step.unitLessonId,'second')
  const back=previousLearningStep(c,a);assert.equal(back.view,'practice');assert.equal(c.lessons.find(l=>l.id===back.lessonId).step.kind,'lesson-test')
  while(!a.finished)a=nextLearningStep(c,a.view==='practice' ? checkStep(c,a) : a)
  assert.equal(a.lastResult.total,6);assert.equal(a.lastResult.correct,6)
  assert.equal(learningProgress(c,a).percent,100)
  assert.match(a.lastResult.items[0].lessonTitle,/Fixture module one.*Fixture lesson first/)
})

test('early exam, scoring, saved results and mistake reviews include both types of test',()=>{
  const c=make();let a=openLearningAttempt(null,c,'exam')
  assert.equal(a.view,'all');assert.throws(()=>finishLearningAttempt(c,a))
  for(const q of allLearningQuestions(c))a.answers[q.id]='1'
  assert.equal(learningScore(c,a).total,6)
  a=finishLearningAttempt(c,a);assert.equal(a.lastResult.percent,0)
  const restored=restoreLearningAttempt(JSON.stringify(a),c)
  assert.equal(restored.finished,true);assert.deepEqual(restored.lastResult,a.lastResult)
  assert.equal(startMistakeReview(restored.lastResult).items.length,6)
})

test('resume restores the exact intra-lesson step and resolves stale step IDs after an update',()=>{
  const c=make();let a=nextLearningStep(c,freshLearningAttempt(c))
  a=checkStep(c,a)
  const saved=JSON.stringify(a),restored=restoreLearningAttempt(saved,c)
  assert.equal(restored.lessonId,a.lessonId);assert.equal(restored.view,'practice');assert.equal(restored.checkedAnswers['first-inline'],'0')
  const exam=openLearningAttempt(saved,c,'exam')
  assert.equal(openLearningAttempt(JSON.stringify(exam),c,'learn').view,'practice')
  const edit=structuredClone(modularDocument);edit.version=2;edit.modules[0].lessons[0].blocks[1].id='renamed-check'
  const updated=restoreLearningAttempt(saved,validateDownloadedCourse(edit))
  assert.equal(updated.view,'theory');assert.equal(updated.lessonId,c.lessons[0].id)
  assert.equal(updated.answers['first-inline'],'0')
})

test('invalid hierarchy, duplicate IDs, missing inline/final tests and malformed questions are rejected',()=>{
  const changes=[
    c=>{c.formatVersion=3},c=>{c.modules=[]},c=>{c.modules[1].id=c.modules[0].id},
    c=>{c.modules[0].lessons=[]},c=>{c.modules[0].lessons[1].id='first'},
    c=>{delete c.modules[0].lessons[0].finalTest},c=>{c.modules[0].lessons[0].finalTest.questions=[]},
    c=>{c.modules[0].lessons[0].blocks=c.modules[0].lessons[0].blocks.filter(b=>b.kind==='theory')},
    c=>{c.modules[0].lessons[0].blocks[0].content=[]},c=>{c.modules[0].lessons[0].finalTest.id='intro'},
    c=>{c.modules[0].lessons[0].finalTest.questions[0].correct=4},
    c=>{c.modules[0].lessons[0].finalTest.questions[0].id='first-inline'},
    c=>{c.modules[0].lessons[0].blocks[0].content[0].kind='html'},
  ]
  for(const change of changes){const c=structuredClone(modularDocument);change(c);assert.throws(()=>validateDownloadedCourse(c))}
})

test('a hierarchical course downloads and restores offline with an unchanged assessment',async()=>{
  const json=JSON.stringify(modularDocument),sha256=createHash('sha256').update(json).digest('hex')
  const entry={id:modularDocument.id,version:1,file:`${modularDocument.id}-v1-${sha256}.json`,sha256,bytes:Buffer.byteLength(json)}
  const directions=[{id:'fundamentals',title:'Fixture',description:'Fixture'}]
  const manifest={schemaVersion:1,revision:1,directions,courses:[entry]},empty={schemaVersion:1,revision:0,directions,courses:[],fingerprints:{}}
  let stored
  const bundle=await fetchLearningBundle('https://example.test/api/catalog',empty,async b=>{stored=JSON.stringify(b)},async url=>new Response(url.endsWith('/catalog') ? JSON.stringify(manifest) : json))
  assert.equal(bundle.courses[0].lessons.length,12)
  const offline=validateLearningBundle(JSON.parse(stored))
  assert.deepEqual(offline.courses[0],bundle.courses[0])
  assert.equal(allLearningQuestions(offline.courses[0]).length,6)
})

test('the publisher writes the hierarchical document without a duplicate flat assessment',()=>{
  const tmpRoot=resolve('tmp');mkdirSync(tmpRoot,{recursive:true})
  const root=mkdtempSync(join(tmpRoot,'course-structure-'))
  try {
    const input=join(root,'input'),output=join(root,'output');mkdirSync(input)
    writeFileSync(join(input,'fixture.json'),JSON.stringify(modularDocument))
    const published=spawnSync(process.execPath,['--experimental-strip-types','scripts/publish-learning.mjs','--input',input,'--output',output],{encoding:'utf8'})
    assert.equal(published.status,0,published.stderr)
    const manifest=JSON.parse(readFileSync(join(output,'catalog.json'),'utf8'))
    assert.equal(manifest.courses.length,1)
    const payload=JSON.parse(readFileSync(join(output,'courses',manifest.courses[0].file),'utf8'))
    assert.equal(payload.formatVersion,2);assert.equal(payload.modules.length,2);assert.equal('lessons' in payload,false)
    assert.equal(allLearningQuestions(validateDownloadedCourse(payload)).length,6)
  } finally {
    if(!resolve(root).startsWith(tmpRoot+sep))throw new Error('Temporary path outside workspace')
    rmSync(root,{recursive:true,force:true})
  }
})
