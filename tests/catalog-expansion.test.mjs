import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { validateCatalog, newerCatalog, sessionTopics } from '../src/lib/catalog.ts'
import { eligibleIds, parseKnowledge, beginSession, freshSession, restoreSession } from '../src/lib/session.ts'

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const catalog = validateCatalog(read('../src/data/questions.json'))
const previous = read('./fixtures/catalog-v2-fingerprints.json')
const courses = read('../src/data/learning-catalog.json')

test('all 248 previous questions retain their IDs, wording, metadata and order', () => {
  assert.equal(previous.topics.reduce((sum,t) => sum + t.count, 0), 248)
  for (const old of previous.topics) {
    const current = catalog.topics.find(t => t.id === old.id)
    assert.ok(current, old.id)
    const originalQuestions = current.questions.slice(0, old.count)
    const fingerprint = createHash('sha256').update(JSON.stringify(originalQuestions)).digest('hex')
    assert.equal(fingerprint, old.sha256, old.id)
  }
})

test('separate survey topics and open questions cover every updated PDF from 01 through 27', () => {
  assert.equal(catalog.revision, 4)
  assert.equal(catalog.topics.length, 28)
  assert.deepEqual(catalog.topics.map(t => t.number), Array.from({length:28}, (_,i) => i+1))
  assert.deepEqual(catalog.topics.slice(9,17).map(t => t.id), ['postgresql','ef-core','redis-caching','networks-http-tls','aspnet-core','rest-api-design','backend-security','rabbitmq-messaging'])
  const questions = catalog.topics.flatMap(t => t.questions)
  const added = questions.filter(q => q.id.startsWith('open-'))
  assert.equal(added.length, 490)
  assert.equal(questions.length, 738)
  for (const q of added) {
    assert.ok(q.block && q.source)
    assert.deepEqual(Object.keys(q).sort(), ['block','id','source','text'])
    assert.ok(!/выберите.*вариант/i.test(q.text))
  }
  for (const entry of courses) {
    for (const source of entry.sources) assert.ok(added.some(q => q.source.startsWith(source.file + ',')), source.file)
    for (const id of entry.topicIds) assert.ok(catalog.topics.some(t => t.id === id), id)
  }
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
  const oldTopics = previous.topics.map(t => ({...catalog.topics.find(item => item.id === t.id),questions:catalog.topics.find(item => item.id === t.id).questions.slice(0,t.count)}))
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
  const oldTopics = previous.topics.map(t => ({...catalog.topics.find(item => item.id === t.id),questions:catalog.topics.find(item => item.id === t.id).questions.slice(0,t.count)}))
  const saved = {...freshSession(),selected:['rabbitmq-messaging'],topicSnapshot:oldTopics}
  const restored = restoreSession(JSON.stringify(saved), catalog.topics)
  assert.deepEqual(restored.selected, ['rabbitmq-messaging'])
  assert.equal(restored.stage, 'topics')
  assert.equal(eligibleIds(catalog.topics, restored.selected, [], false).length, 22)
  assert.equal(restored.topicSnapshot.length, 9)
})
