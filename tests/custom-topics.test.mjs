import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {makeCustomTopic,parseCustomTopics,mergeTopics} from '../src/lib/customTopics.ts'
import {filterTopics} from '../src/lib/topicFilters.ts'
import {beginSession,freshSession,restoreSession} from '../src/lib/session.ts'

const bundled=JSON.parse(readFileSync(new URL('../src/data/questions.json',import.meta.url),'utf8')).topics
test('custom topics persist independently, merge with catalog updates and enter surveys',()=>{
  const topic=makeCustomTopic(' Моя тема ','',[{id:'draft',text:' Мой вопрос? '}])
  const restored=parseCustomTopics(JSON.stringify([topic]))
  const all=mergeTopics(bundled,restored)
  assert.equal(all.length,bundled.length+1)
  assert.deepEqual(filterTopics(all,'моя','custom').map(t=>t.id),[topic.id])
  assert.equal(all.at(-1).number,29)
  const session=beginSession(freshSession(),all,[topic.id],[topic.questions[0].id])
  assert.deepEqual(restoreSession(JSON.stringify(session),all).questionIds,session.questionIds)
  assert.equal(session.topicSnapshot.find(t=>t.id===topic.id).questions[0].text,'Мой вопрос?')
  assert.equal(mergeTopics(bundled.slice(0,2),restored).at(-1).id,topic.id)
})
test('editing retains unchanged IDs and replaces IDs for changed questions without mutating an active snapshot',()=>{
  const topic=makeCustomTopic('Тема','',[{id:'a',text:'Первый?'},{id:'b',text:'Второй?'}])
  const active=beginSession(freshSession(),[topic],[topic.id],topic.questions.map(q=>q.id))
  const edited=makeCustomTopic('Тема новая','', [topic.questions[0],{...topic.questions[1],text:'Изменённый?'}],topic)
  assert.equal(edited.id,topic.id)
  assert.equal(edited.questions[0].id,topic.questions[0].id)
  assert.notEqual(edited.questions[1].id,topic.questions[1].id)
  assert.equal(active.topicSnapshot[0].questions[1].text,'Второй?')
})
test('invalid drafts and damaged storage are rejected instead of overwritten',()=>{
  assert.deepEqual(parseCustomTopics(null),[])
  assert.deepEqual(parseCustomTopics('[]'),[])
  for(const raw of ['{}','null','broken',JSON.stringify([bundled[0]])])assert.throws(()=>parseCustomTopics(raw))
  for(const questions of [[],[{id:'x',text:' '}],Array.from({length:101},()=>({id:'x',text:'?'}))])assert.throws(()=>makeCustomTopic('Тема','',questions))
  assert.throws(()=>makeCustomTopic(' ','',[{id:'x',text:'?'}]))
})
