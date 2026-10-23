import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {validateLearningCourse,freshLearningAttempt,withOptionOrders,finishLearningAttempt,restoreLearningAttempt,learningProgress,startMistakeReview} from '../src/lib/learning.ts'
import {validateCatalog,newerCatalog} from '../src/lib/catalog.ts'
import {courseProgress} from '../src/lib/profile.ts'
const read=name=>JSON.parse(readFileSync(new URL('../src/data/'+name,import.meta.url),'utf8'))
const manifest=read('learning-catalog.json'),directions=read('learning-directions.json'),library=read('learning-readings.json'),catalog=validateCatalog(read('questions.json'))
const hash=value=>createHash('sha256').update(value).digest('hex')
const fingerprint=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))

test('all 557 previous open questions and fifteen existing course editions remain unchanged',()=>{
 const previous=fingerprint('catalog-v3-fingerprints.json')
 assert.equal(previous.topics.reduce((n,t)=>n+t.count,0),557)
 for(const old of previous.topics){const topic=catalog.topics.find(t=>t.id===old.id);assert.equal(hash(JSON.stringify(topic.questions.slice(0,old.count))),old.sha256,old.id)}
 for(const old of fingerprint('learning-before-expansion.json')) {
  assert.equal(hash(readFileSync(new URL('../src/data/'+old.file,import.meta.url))),old.sha256,old.id)
  assert.equal(hash(JSON.stringify(library[old.id])),old.readingSha256,old.id+' theory')
 }
})
test('the complete remaining eleven PDFs form independent courses in three additional directions',()=>{
 assert.equal(manifest.length,26);assert.equal(catalog.topics.length,28);assert.equal(catalog.revision,4)
 assert.deepEqual(directions.slice(5).map(d=>d.id),['quality','operations','architecture'])
 assert.deepEqual(directions.slice(5).map(d=>manifest.filter(c=>c.direction===d.id).length),[3,5,3])
 assert.deepEqual(manifest.slice(15).map(c=>Number(c.sources[0].file.slice(0,2))),Array.from({length:11},(_,i)=>i+17))
 const courses=manifest.slice(15).map(c=>read(c.file))
 assert.equal(courses.flatMap(c=>c.lessons).length,96)
 assert.equal(courses.flatMap(c=>c.lessons.flatMap(l=>l.questions)).length,192)
 assert.equal(catalog.topics.slice(17).flatMap(t=>t.questions).length,181)
 assert.equal(manifest[16].scope,'dotnet')
 assert.ok(manifest.slice(15).filter((_,i)=>i!==1).every(c=>c.scope==='universal'))
})
test('new reading blocks cover every extracted chapter including lettered additions and retain examples',()=>{
 const counts=[21,21,24,13,14,15,16,16,18,21,22]
 let chars=0,codes=0,outputs=0
 for(const [index,entry] of manifest.slice(15).entries()) {
  const course=validateLearningCourse(read(entry.file)),covered=new Set()
  assert.equal(course.version,1)
  for(const lesson of course.lessons) {
   const sections=library[entry.id][lesson.id]
   assert.equal(sections.length,lesson.readingChapters.length)
   for(const n of lesson.readingChapters)covered.add(String(n))
   assert.ok(sections.flatMap(s=>s.content).reduce((n,p)=>n+p.text.length,0)>=400)
   for(const section of sections) {
    assert.equal(section.source,entry.sources[0].file)
    assert.ok([...section.pages.matchAll(/\d+/g)].every(m=>Number(m[0])>=1 && Number(m[0])<=entry.pageCount))
    for(const part of section.content){chars+=part.text.length;if(part.kind==='code')codes++}
   }
   for(const question of lesson.questions) {
    if(question.kind==='output'){outputs++;continue}
    assert.equal(question.options.length,4)
    assert.ok(question.options.every(v=>v.length>3))
    const open=catalog.topics.find(t=>t.id===entry.id).questions.find(q=>q.block===lesson.title && q.text.startsWith(question.prompt))
    assert.ok(open,question.id);assert.ok(open.source.startsWith(entry.sources[0].file))
   }
  }
  const expected=Array.from({length:counts[index]},(_,i)=>String(i+1))
  if(index<3)expected.push(...'АБВГДЕ'.split('').map(letter=>(index===2 ? '23' : '20')+letter))
  assert.deepEqual([...covered].sort(),expected.sort(),entry.id)
 }
 assert.ok(chars>150000);assert.ok(codes>30);assert.equal(outputs,11)
})
test('new course saves, shuffled answers, results, mistake reviews and profession progress use existing mechanisms',()=>{
 for(const entry of manifest.slice(15)) {
  const course=validateLearningCourse(read(entry.file))
  let attempt=withOptionOrders(course,freshLearningAttempt(course))
  for(const question of course.lessons.flatMap(l=>l.questions))attempt.answers[question.id]=question.kind==='choice' ? String(question.correct) : question.answers[0]
  const q=course.lessons[0].questions[0];attempt.answers[q.id]=String((q.correct+1)%4)
  attempt=finishLearningAttempt(course,attempt)
  const review=startMistakeReview(attempt.lastResult)
  assert.equal(review.items.length,1)
  assert.deepEqual(restoreLearningAttempt(JSON.stringify({...attempt,review}),course),{...attempt,review})
  const progress=learningProgress(course,attempt)
  assert.deepEqual(courseProgress([{id:'learning:'+course.id,title:course.title,learningCourseId:course.id}],[],{[course.id]:progress}),{done:1,total:1,percent:100})
 }
 assert.equal(newerCatalog(catalog,{revision:3,topics:catalog.topics.slice(0,17)}),catalog)
})
