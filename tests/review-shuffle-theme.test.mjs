import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {shuffled,isOptionOrder} from '../src/lib/shuffle.ts'
import {freshLearningAttempt,withOptionOrders,isLearningCorrect,finishLearningAttempt,restoreLearningAttempt,restartLearningAttempt,startMistakeReview,answerMistake,checkMistake,finishMistakeReview,learningProgress} from '../src/lib/learning.ts'
import {beginSession,freshSession,leaveSession,restoreSession,testTopics} from '../src/lib/session.ts'
import {parseTheme,nextTheme} from '../src/lib/theme.ts'
const course=JSON.parse(readFileSync(new URL('../src/data/csharp-foundations-course.json',import.meta.url),'utf8'))
const all=course.lessons.flatMap(l=>l.questions)
function resultWithErrors(){const a=freshLearningAttempt(course);for(const q of all)a.answers[q.id]=q.kind==='choice'? String(q.correct):q.answers[0];const choice=all.find(q=>q.kind==='choice'),output=all.find(q=>q.kind==='output');a.answers[choice.id]=String((choice.correct+1)%4);a.answers[output.id]='wrong';return finishLearningAttempt(course,a)}

test('shuffle preserves input and changes the previous presentation even on identical RNG output',()=>{
 const input=[0,1,2,3],copy=[...input],one=shuffled(input,()=>.99),two=shuffled(input,()=>.99,one)
 assert.deepEqual(input,copy);assert.notDeepEqual(two,one);assert.deepEqual([...two].sort(),input)
 assert.equal(isOptionOrder([0,1,1,2]),false);assert.equal(isOptionOrder([3,0,2,1]),true)
 assert.deepEqual(shuffled([],()=>0),[]);assert.deepEqual(shuffled(['one'],()=>0,['one']),['one'])
})
test('course options shuffle independently of canonical answer indices and survive resume',()=>{
 let a=withOptionOrders(course,freshLearningAttempt(course),()=>0)
 const q=all.find(q=>q.kind==='choice'),order=a.optionOrders[q.id]
 const shown=order.indexOf(q.correct)
 a.answers[q.id]=String(order[shown])
 assert.equal(isLearningCorrect(q,a.answers[q.id]),true)
 assert.deepEqual(restoreLearningAttempt(JSON.stringify(a),course),a)
 assert.deepEqual(withOptionOrders(course,a,()=>.99).optionOrders,a.optionOrders)
 const retry=restartLearningAttempt(course,a)
 for(const id of Object.keys(a.optionOrders))assert.notDeepEqual(retry.optionOrders[id],a.optionOrders[id])
 assert.equal(Object.keys(a.optionOrders).length,all.filter(q=>q.kind==='choice').length)
})
test('survey questions shuffle inside topics, retain order on resume and reshuffle after completion',()=>{
 const topics=[{id:'a',questions:[{id:'a1',text:'1'},{id:'a2',text:'2'},{id:'a3',text:'3'}]},{id:'b',questions:[{id:'b1',text:'4'},{id:'b2',text:'5'}]}]
 const ids=topics.flatMap(t=>t.questions.map(q=>q.id))
 const a=beginSession(freshSession(),topics,['a','b'],ids,()=>0)
 assert.deepEqual(a.questionIds,['a2','a3','a1','b2','b1'])
 assert.deepEqual(testTopics(topics,a.selected,a.questionIds).flatMap(t=>t.questions.map(q=>q.id)),a.questionIds)
 const paused=leaveSession({...a,index:2,answers:{a1:'saved'}})
 const restored=restoreSession(JSON.stringify(paused),topics)
 const resumed=beginSession(restored,topics,a.selected,ids,()=>.99)
 assert.deepEqual(resumed.questionIds,a.questionIds);assert.equal(resumed.index,2);assert.deepEqual(resumed.answers,{a1:'saved'})
 const home=leaveSession({...a,stage:'result',completedAt:'2026-10-23T12:00:00Z'})
 const again=beginSession(restoreSession(JSON.stringify(home),topics),topics,a.selected,ids,()=>0)
 assert.notDeepEqual(again.questionIds.slice(0,3),a.questionIds.slice(0,3));assert.notDeepEqual(again.questionIds.slice(3),a.questionIds.slice(3));assert.deepEqual(again.answers,{})
})
test('mistake review isolates only wrong items and preserves the full course result and progress',()=>{
 const a=resultWithErrors(),original=structuredClone(a),review=startMistakeReview(a.lastResult,undefined,()=>0)
 assert.equal(review.items.length,2);assert.deepEqual(review.answers,{})
 assert.ok(review.items.every(i=>!isLearningCorrect(i.question,i.answer)))
 assert.deepEqual(a,original)
 assert.deepEqual(learningProgress(course,{...a,review}),learningProgress(course,a))
 assert.deepEqual(restoreLearningAttempt(JSON.stringify({...a,review}),course).review,review)
 assert.throws(()=>finishMistakeReview(review))
 const noErrors=structuredClone(a.lastResult);for(const item of noErrors.items)item.answer=item.question.kind==='choice'?String(item.question.correct):item.question.answers[0]
 assert.equal(startMistakeReview(noErrors),null)
})
test('review checks answers explicitly, locks checked answers and persists unfinished drafts',()=>{
 const a=resultWithErrors();let r=startMistakeReview(a.lastResult)
 const [item]=r.items,q=item.question
 r=answerMistake(r,q.id,q.kind==='choice' ? String(q.correct):q.answers[0])
 assert.equal(r.checkedAnswers[q.id],undefined)
 r=checkMistake(r,q.id)
 assert.equal(r.checkedAnswers[q.id],r.answers[q.id])
 assert.equal(answerMistake(r,q.id,'changed'),r)
 const output=r.items.find(i=>i.question.kind==='output').question
 r=answerMistake(r,output.id,'')
 assert.deepEqual(restoreLearningAttempt(JSON.stringify({...a,review:r}),course).review,r)
 assert.throws(()=>finishMistakeReview(r))
})
test('review result has its own saved score and retries only remaining mistakes',()=>{
 const a=resultWithErrors(),source=structuredClone(a.lastResult);let r=startMistakeReview(source)
 for(const [index,item] of r.items.entries()){
  const q=item.question,value=index===0 ? q.kind==='choice'?String(q.correct):q.answers[0] : q.kind==='choice'?String((q.correct+1)%4):'still wrong'
  r=checkMistake(answerMistake(r,q.id,value),q.id)
 }
 r=finishMistakeReview(r,new Date('2026-10-23T12:00:00Z'))
 assert.equal(r.lastResult.correct,1);assert.equal(r.lastResult.total,2);assert.equal(r.results.length,1)
 assert.deepEqual(restoreLearningAttempt(JSON.stringify({...a,review:r}),course).review,r)
 assert.deepEqual(a.lastResult,source)
 let retry=startMistakeReview(source,r)
 assert.equal(retry.items.length,1);assert.deepEqual(retry.answers,{})
 const q=retry.items[0].question
 retry=finishMistakeReview(checkMistake(answerMistake(retry,q.id,q.kind==='choice'?String(q.correct):q.answers[0]),q.id))
 assert.equal(retry.lastResult.percent,100);assert.equal(retry.results.length,2)
 assert.equal(startMistakeReview(source,retry),null)
 assert.equal(finishMistakeReview(retry),retry)
 const broken=structuredClone(r);broken.optionOrders[broken.items[0].question.id]=[0,0,0,0]
 assert.throws(()=>restoreLearningAttempt(JSON.stringify({...a,review:broken}),course))
})
test('explicit light theme is the default; chosen theme has no system preference dependency',()=>{
 assert.equal(parseTheme(null),'light');assert.equal(parseTheme('dark'),'dark');assert.equal(parseTheme('light'),'light');assert.equal(parseTheme('system'),'light');assert.equal(nextTheme('light'),'dark');assert.equal(nextTheme('dark'),'light')
})
