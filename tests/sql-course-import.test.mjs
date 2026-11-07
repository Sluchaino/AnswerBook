import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {importSqlCourse,sqlPlain,sqlQuestion} from '../scripts/import-sql-course.mjs'
import {validateDownloadedCourse,validateLearningManifest,fetchLearningBundle} from '../src/lib/learningDownloads.ts'
import {courseDocument} from '../src/lib/courseStructure.ts'
import {referenceAnswer,wrongAnswer} from './fixtures/exercise-solutions.mjs'
import {checkExercise} from '../src/lib/exercises.ts'

const root='server/theory-source/sql-foundations-v1'
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const input=read('server/course-source/sql-foundations-v1.json')
const course=validateDownloadedCourse(input),bank=read(root+'/question-bank.json')
const questions=new Map(course.lessons.flatMap(l=>l.questions).map(q=>[q.id,q]))
const sourceManifest=read(root+'/course_manifest.json')

test('SQL import keeps all reviewed questions, answer identities and seven mechanics',()=>{
  assert.equal(course.modules.length,16)
  assert.equal(course.modules.reduce((n,m)=>n+m.lessons.length,0),98)
  assert.equal(questions.size,1041)
  assert.equal(course.direction,'storage');assert.equal(course.scope,'universal')
  for(const row of bank)assert.deepEqual(questions.get(row.id),sqlQuestion(row),row.id)
  assert.equal(questions.get('sql-foundations-m13-l01-q01').correct,0)
  const placements=read(root+'/interactive_contracts.json')
  const actual=course.lessons.filter(l=>l.exercise).map(l=>l.exercise)
  assert.equal(actual.length,97)
  assert.equal(new Set(actual.map(e=>e.type)).size,7)
  for(const p of placements)assert.deepEqual(actual.find(e=>e.id===p.exercise.id),p.exercise)
  for(const e of actual){
    assert(checkExercise(e,referenceAnswer(e)).correct,e.id)
    const wrong=wrongAnswer(e)
    if(e.validation.acceptedOrders?.some(o=>JSON.stringify(o)===JSON.stringify(wrong.order)))continue
    assert(!checkExercise(e,wrong).correct,e.id)
  }
})

for(const [i,source]of sourceManifest.modules.entries())test(`SQL module ${i+1} preserves lessons, check placement and variable exam length`,()=>{
  const module=course.modules[i]
  assert.equal(module.lessons.length,source.lessons.length)
  let interactives=0
  for(const [j,lesson]of module.lessons.entries()){
    assert.equal(lesson.id,source.lessons[j].lessonId.replace('sql-foundations-',''))
    assert.equal(lesson.blocks[0].kind,'theory')
    assert.equal(lesson.blocks.filter(b=>b.kind==='test').length,2)
    assert.equal(lesson.finalTest.questions.length,5)
    const own=lesson.blocks.filter(b=>b.kind==='exercise')
    assert(own.length<=1);interactives+=own.length
    const text=lesson.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content).map(p=>p.text).join('\n')
    assert(!/^(?:questionId|lessonId|moduleId):/m.test(text),lesson.id)
    assert(!/Выполните `?sql-foundations-m\d+-ex/.test(text),lesson.id)
    if(i>=1&&i<=5){
      const check=lesson.blocks.findIndex(b=>b.id==='check-1')
      assert(lesson.blocks.slice(check+1).some(b=>b.kind==='theory'),lesson.id+' continuation')
    }
  }
  assert(interactives>=5)
  const expected=[...fs.readFileSync(path.join(root,source.examFile),'utf8').matchAll(/^questionId:/gm)].length
  assert.equal(module.exam.questions.length,expected)
})

test('all 28 supplementary SQL scripts are available verbatim inside their modules',()=>{
  let total=0
  for(const [i,m]of sourceManifest.modules.entries()){
    const dir=path.join(root,m.directory,'examples')
    if(!fs.existsSync(dir))continue
    const parts=course.modules[i].lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content))
    for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.sql'))){
      const expected=fs.readFileSync(path.join(dir,name),'utf8').replaceAll('\r\n','\n').trimEnd()
      assert(parts.some(p=>p.kind==='code'&&p.text===expected),name);total++
    }
  }
  assert.equal(total,28)
})

test('SQL notation survives Markdown cleanup, including the literal backtick distractor',()=>{
  assert.equal(sqlPlain('`SELECT * FROM t WHERE name LIKE \'A_%\'`'),'SELECT * FROM t WHERE name LIKE \'A_%\'')
  assert.deepEqual(questions.get('sql-foundations-m02-exam-q05').options,['cancelled',"'cancelled'",'[cancelled]','`cancelled`'])
  assert.equal(importSqlCourse(root,input).version,input.version)
  const roundtrip=validateDownloadedCourse(JSON.parse(JSON.stringify(courseDocument(course))))
  assert.equal(roundtrip.lessons.flatMap(l=>l.questions).length,1041)
})

test('published SQL payload downloads through the app integrity validator and preserves existing courses',async()=>{
  const manifest=validateLearningManifest(read('server/AnswerBook.ContentApi/content/catalog.json'))
  assert(manifest.courses.some(c=>c.id===course.id))
  for(const id of ['csharp-foundations-v2','aspnet-core-foundations-v2'])assert(manifest.courses.some(c=>c.id===id))
  const base='https://content.example.test/catalog.json'
  const current={schemaVersion:1,revision:0,directions:[],courses:[],fingerprints:{}}
  let saved
  const result=await fetchLearningBundle(base,current,async b=>{saved=b},async url=>{
    const relative=new URL(url).pathname.slice(1)
    return new Response(fs.readFileSync(path.join('server/AnswerBook.ContentApi/content',relative)))
  })
  assert.equal(saved,result)
  assert.equal(result.courses.find(c=>c.id===course.id).modules.length,16)
  assert.equal(result.courses.length,manifest.courses.length)
})
