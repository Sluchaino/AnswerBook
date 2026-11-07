import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateCatalog, newerCatalog, sessionTopics } from '../src/lib/catalog.ts'
import { eligibleIds, parseKnowledge, beginSession, freshSession, restoreSession } from '../src/lib/session.ts'
import {questionRedirects} from '../src/lib/questionRedirects.ts'

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const catalog = validateCatalog(read('../src/data/questions.json'))
const previous = read('./fixtures/catalog-v2-fingerprints.json')
const historical=read('./fixtures/catalog-v6-identities.json')
const historicalTopics=()=>previous.topics.map(old=>({...catalog.topics.find(t=>t.id===old.id),questions:historical.topics.find(t=>t.id===old.id).questions.slice(0,old.count).map(q=>({...q,text:'Историческая формулировка вопроса'}))}))

test('historical topics survive while removed duplicate IDs point to a live canonical question', () => {
  assert.equal(previous.topics.reduce((sum,t) => sum + t.count, 0), 248)
  for (const old of previous.topics) {
    const current = catalog.topics.find(t => t.id === old.id)
    assert.ok(current, old.id)
    const live=new Set(catalog.topics.flatMap(t=>t.questions.map(q=>q.id)))
    for(const q of historical.topics.find(t=>t.id===old.id).questions.slice(0,old.count))assert.ok(live.has(questionRedirects[q.id]??q.id),q.id)
  }
})

test('separate survey topics and open questions cover every updated PDF from 01 through 27', () => {
  assert.ok(catalog.revision >= 4)
  assert.ok(catalog.topics.length >= 28)
  assert.deepEqual(catalog.topics.map(t => t.number), Array.from({length:catalog.topics.length}, (_,i) => i+1))
  for(const id of ['postgresql','ef-core','redis-caching','http','aspnet-core','rest-api-design','backend-security','rabbitmq-messaging'])assert.ok(catalog.topics.some(t=>t.id===id),id)
  const questions = catalog.topics.flatMap(t => t.questions)
  const added = questions.filter(q => q.id.startsWith('open-'))
  assert.ok(added.length>0)
  for (const q of added) {
    assert.ok(q.block && q.source)
    assert.deepEqual(Object.keys(q).sort(), ['block','id','source','text'])
    assert.ok(!/выберите.*вариант/i.test(q.text))
  }
  const sourceNumbers=[...new Set(added.map(q=>Number(q.source.slice(0,2))))].sort((a,b)=>a-b)
  assert.deepEqual(sourceNumbers,Array.from({length:27},(_,i)=>i+1))
})

test('old known-question IDs still work and new questions are not silently marked known', () => {
  const knowledge = parseKnowledge(JSON.stringify({knownIds:['csharp-001'],includeKnown:false}))
  const topic = catalog.topics.find(t => t.id === 'csharp')
  const ids = eligibleIds(catalog.topics, ['csharp'], knowledge.knownIds, knowledge.includeKnown)
  assert.equal(ids.length, topic.questions.length - 1)
  assert.ok(!ids.includes('csharp-001'))
  for (const q of topic.questions.filter(q => q.id.startsWith('open-'))) assert.ok(ids.includes(q.id))
})

test('an older feed cannot replace the latest catalog and a running old survey keeps its snapshot', () => {
  const oldTopics = historicalTopics()
  assert.equal(newerCatalog(catalog, {revision:2,topics:oldTopics}), catalog)
  const ids = eligibleIds(oldTopics, ['csharp'], [], false)
  const running = beginSession(freshSession(), oldTopics, ['csharp'], ids)
  running.answers['csharp-001'] = 'Мой начатый ответ'
  const restored = restoreSession(JSON.stringify(running), catalog.topics)
  const visible = sessionTopics(restored.topicSnapshot, catalog.topics)
  assert.equal(visible[0].questions.length, previous.topics[0].count)
  assert.equal(restored.answers['csharp-001'], 'Мой начатый ответ')
  assert.equal(restored.questionIds.length, ids.length)
})

test('a newly selected topic survives reload even when an old survey snapshot exists', () => {
  const oldTopics = historicalTopics()
  const saved = {...freshSession(),selected:['rabbitmq-messaging'],topicSnapshot:oldTopics}
  const restored = restoreSession(JSON.stringify(saved), catalog.topics)
  assert.deepEqual(restored.selected, ['rabbitmq-messaging'])
  assert.equal(restored.stage, 'topics')
  assert.equal(eligibleIds(catalog.topics, restored.selected, [], false).length, catalog.topics.find(t=>t.id==='rabbitmq-messaging').questions.length)
  assert.equal(restored.topicSnapshot.length, 9)
})
