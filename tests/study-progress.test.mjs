import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {freshLearningAttempt,restoreLearningAttempt,openLearningAttempt,nextLearningStep,checkLearningAnswer,isAnswerChecked,finishLearningAttempt,restartLearningAttempt,learningProgress,resultItems,isLearningCorrect} from '../src/lib/learning.ts'
import {courseProgress} from '../src/lib/profile.ts'
import {emptyActivity,parseActivity,recordStudyDay,studyStreak,localStudyDay} from '../src/lib/activity.ts'
const read=name=>JSON.parse(readFileSync(new URL('../src/data/'+name,import.meta.url),'utf8'))
const entries=read('learning-catalog.json'),course=read(entries[0].file),previous=read('learning-previous-editions.json')[0]
const questions=course.lessons.flatMap(l=>l.questions)
function filled(source=course) {const a=freshLearningAttempt(source);for(const q of source.lessons.flatMap(l=>l.questions))a.answers[q.id]=q.kind==='choice' ? String(q.correct) : q.answers[0];return a}

test('draft answers do not reveal feedback or advance before explicit checking',()=>{
 let attempt=nextLearningStep(course,freshLearningAttempt(course))
 for(const q of course.lessons[0].questions)attempt.answers[q.id]=String((q.correct+1)%4)
 assert.equal(nextLearningStep(course,attempt),attempt)
 const q=course.lessons[0].questions[0]
 assert.equal(isAnswerChecked(attempt,q),false)
 attempt=checkLearningAnswer(course,attempt,q.id)
 assert.equal(isAnswerChecked(attempt,q),true)
 assert.equal(isLearningCorrect(q,attempt.answers[q.id]),false)
 assert.equal(checkLearningAnswer(course,attempt,q.id),attempt)
 const changed={...attempt,answers:{...attempt.answers,[q.id]:String(q.correct)}}
 assert.equal(isAnswerChecked(changed,q),false)
 assert.equal(checkLearningAnswer(course,{...attempt,view:'all'},q.id).view,'all')
 assert.equal(checkLearningAnswer(course,{...attempt,view:'all'},q.id).checkedAnswers[q.id],attempt.answers[q.id])
 assert.deepEqual(restoreLearningAttempt(JSON.stringify(attempt),course),attempt)
})
test('completed results survive reopening, retries and immutable question snapshots',()=>{
 const attempt=filled(),q=questions[0]
 attempt.answers[q.id]=String((q.correct+1)%4)
 const finished=finishLearningAttempt(course,attempt,new Date('2026-10-23T12:00:00Z'))
 assert.equal(finished.lastResult.correct,questions.length-1)
 assert.deepEqual(openLearningAttempt(JSON.stringify(finished),course,'learn'),finished)
 assert.equal(finishLearningAttempt(course,finished),finished)
 const restarted=restartLearningAttempt(course,finished)
 assert.deepEqual(restarted.answers,{})
 assert.deepEqual(restarted.lastResult,finished.lastResult)
 assert.equal(restarted.results.length,1)
 assert.equal(learningProgress(course,restarted).completed,true)
 const exam=openLearningAttempt(JSON.stringify(finished),course,'exam')
 assert.equal(exam.finished,false);assert.equal(exam.view,'all');assert.equal(exam.lastResult.id,finished.lastResult.id)
 const snapshot=finished.lastResult.items[0].question
 assert.notEqual(snapshot,q)
 const changed=structuredClone(course);changed.lessons[0].questions[0].correct=(q.correct+1)%4
 assert.deepEqual(restoreLearningAttempt(JSON.stringify(finished),changed).lastResult,finished.lastResult)
})
test('results from previous editions retain old option order; new choices discard old numeric answers',()=>{
 const old=filled(previous);old.finished=true
 const saved=restoreLearningAttempt(JSON.stringify(old),course,previous)
 assert.equal(saved.finished,false)
 assert.equal(saved.lastResult.correct,40)
 assert.equal(saved.lastResult.courseVersion,previous.version)
 assert.deepEqual(saved.lastResult.items[0].question,previous.lessons[0].questions[0])
 assert.equal(saved.answers[questions[0].id],undefined)
 for(const q of questions.filter(q=>q.kind==='output'))assert.equal(saved.answers[q.id],q.answers[0])
 assert.deepEqual(restoreLearningAttempt(JSON.stringify(saved),course,previous),saved)
})
test('wrong answers appear first globally while original result order is preserved',()=>{
 const a=filled();const last=questions.at(-1);a.answers[last.id]=last.kind==='choice' ? String((last.correct+1)%4) : 'wrong output'
 const r=finishLearningAttempt(course,a).lastResult,order=r.items.map(i=>i.question.id)
 const sorted=resultItems(r)
 assert.equal(sorted[0].question.id,last.id)
 assert.equal(isLearningCorrect(sorted[0].question,sorted[0].answer),false)
 assert.deepEqual(r.items.map(i=>i.question.id),order)
 assert.ok(sorted.slice(1).every(i=>isLearningCorrect(i.question,i.answer)))
})
test('course progress and profession completion are distinct from accuracy and known surveys',()=>{
 const a=freshLearningAttempt(course)
 assert.deepEqual(learningProgress(course,a),{started:false,percent:0,completed:false})
 a.answers[questions[0].id]=String((questions[0].correct+1)%4)
 assert.deepEqual(learningProgress(course,a),{started:true,percent:2.5,completed:false})
 const linked={id:'learning:'+course.id,title:course.title,learningCourseId:course.id},custom={id:'custom:one',title:'Own'}
 const learning={[course.id]:learningProgress(course,a)}
 assert.deepEqual(courseProgress([linked,custom],[],learning),{total:2,done:0,percent:1.25})
 assert.deepEqual(courseProgress([linked,custom],[custom.id],learning),{total:2,done:1,percent:51.25})
 const finished=finishLearningAttempt(course,filled())
 assert.deepEqual(courseProgress([linked],[],{[course.id]:learningProgress(course,finished)}),{total:1,done:1,percent:100})
 const oneThird=courseProgress([linked,{id:'other',title:'Other',learningCourseId:'other'},custom],[],{[course.id]:{percent:100,completed:true}})
 assert.equal(oneThird.percent,33.33)
})
test('history keeps the last twenty scores and rejects corrupt results',()=>{
 let a=filled()
 for(let i=0;i<22;i++){a=finishLearningAttempt(course,a,new Date(2026,9,1,0,0,i));if(i<21){a=restartLearningAttempt(course,a);a.answers=filled().answers}}
 assert.equal(a.results.length,20)
 assert.deepEqual(restoreLearningAttempt(JSON.stringify(a),course),a)
 const broken=structuredClone(a);broken.lastResult.correct=-1
 assert.throws(()=>restoreLearningAttempt(JSON.stringify(broken),course))
})
test('every block has substantial sourced reading and revised question IDs',()=>{
 const library=read('learning-readings.json'),old=read('learning-previous-editions.json')
 let lessons=0,codes=0,choices=0
 for(const entry of entries.slice(0,15)){const c=read(entry.file),prior=old.find(o=>o.id===c.id);assert.equal(c.version,prior.version+1)
  for(const l of c.lessons){lessons++;const sections=library[c.id][l.id];assert.ok(sections.length)
   assert.ok(sections.flatMap(s=>s.content).reduce((n,p)=>n+p.text.length,0)>=400,c.id+'/'+l.id)
   for(const section of sections){assert.ok(entry.sources.some(s=>s.file===section.source));codes+=section.content.filter(p=>p.kind==='code').length}
   for(const q of l.questions)if(q.kind==='choice'){choices++;assert.ok(q.id.endsWith('-v2'));assert.equal(new Set(q.options).size,4)}
  }
 }
 assert.equal(lessons,181);assert.equal(choices,309);assert.ok(codes>100)
})
test('study activity counts a local calendar day once and survives reload',()=>{
 const morning=new Date(2026,9,23,0,1),evening=new Date(2026,9,23,23,59)
 assert.equal(localStudyDay(morning),'2026-10-23')
 const day=recordStudyDay(emptyActivity(),morning)
 assert.equal(recordStudyDay(day,evening),day)
 assert.deepEqual(parseActivity(JSON.stringify(day)),day)
 const stats=studyStreak(day,evening)
 assert.equal(stats.current,1);assert.equal(stats.today,true);assert.equal(stats.best,1);assert.equal(stats.week.length,7)
})
test('streak survives until the end of the next day, then resets while keeping the record',()=>{
 const a={version:1,days:['2026-10-20','2026-10-21','2026-10-22']}
 assert.equal(studyStreak(a,new Date(2026,9,23,23,59)).current,3)
 assert.equal(studyStreak(a,new Date(2026,9,24,0,0)).current,0)
 const resumed=recordStudyDay(a,new Date(2026,9,24))
 assert.equal(studyStreak(resumed,new Date(2026,9,24)).current,1)
 assert.equal(studyStreak(resumed,new Date(2026,9,24)).best,3)
})
test('calendar streak handles leap days, year boundaries, DST dates and duplicate saves',()=>{
 for(const days of [['2024-02-28','2024-02-29','2024-03-01'],['2025-12-30','2025-12-31','2026-01-01'],['2026-03-28','2026-03-29','2026-03-30']]) {
  const [y,m,d]=days[2].split('-').map(Number)
  const a=parseActivity(JSON.stringify({version:1,days:[...days,days[0]]}))
  assert.equal(studyStreak(a,new Date(y,m-1,d,12)).current,3)
 }
 assert.throws(()=>parseActivity('{'))
 assert.throws(()=>parseActivity(JSON.stringify({version:1,days:['2026-02-30']})))
 assert.throws(()=>parseActivity(JSON.stringify({version:1,days:[null]})))
 assert.equal(studyStreak({version:1,days:['2026-10-24']},new Date(2026,9,23)).current,0)
})
