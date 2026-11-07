import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {questionRedirects} from '../src/lib/questionRedirects.ts'
import {parseKnowledge,eligibleIds,beginSession,freshSession,restoreSession} from '../src/lib/session.ts'
const catalog=JSON.parse(readFileSync(new URL('../src/data/questions.json',import.meta.url),'utf8'))
const all=catalog.topics.flatMap(t=>t.questions),live=new Set(all.map(q=>q.id))

test('all catalog questions are concise and have distinct normalized wording',()=>{
 assert.equal(all.length,702)
 const unique=new Set()
 for(const q of all){
  assert.ok(q.text.length<=160,q.id)
  const key=q.text.toLocaleLowerCase('ru').replace(/[\p{P}\p{Z}\s]/gu,'')
  assert.ok(!unique.has(key),q.id);unique.add(key)
 }
})
test('all removed duplicate IDs map directly to a retained question',()=>{
 assert.equal(Object.keys(questionRedirects).length,283)
 for(const [id,target] of Object.entries(questionRedirects)){
  assert.ok(!live.has(id),id);assert.ok(live.has(target),target)
  assert.equal(questionRedirects[target],undefined)
 }
})
test('known flags migrate from removed duplicates without marking unrelated questions',()=>{
 const known=parseKnowledge(JSON.stringify({knownIds:['open-csharp-language-oop-strings-1','csharp-pdf1-26-5','custom-topic-question'],includeKnown:false,includeKnownByTopic:{csharp:true}}))
 assert.deepEqual(known.knownIds,['csharp-pdf1-26-5','custom-topic-question'])
 assert.deepEqual(known.includeKnownByTopic,{csharp:true})
 const ids=eligibleIds(catalog.topics,catalog.topics.map(t=>t.id),['open-csharp-language-oop-strings-1'],false)
 assert.ok(!ids.includes('csharp-pdf1-26-5'))
 assert.equal(ids.length,all.length-1)
})
test('a running survey keeps removed question text and its answer in its snapshot',()=>{
 const id='open-csharp-language-oop-strings-1'
 const oldTopic={...catalog.topics[0],questions:[{id,text:'Прежняя формулировка'}]}
 const session=beginSession(freshSession(),[oldTopic],[oldTopic.id],[id])
 session.answers[id]='Мой сохранённый ответ'
 const restored=restoreSession(JSON.stringify(session),catalog.topics)
 assert.deepEqual(restored.questionIds,[id])
 assert.equal(restored.topicSnapshot[0].questions[0].text,'Прежняя формулировка')
 assert.equal(restored.answers[id],'Мой сохранённый ответ')
})
