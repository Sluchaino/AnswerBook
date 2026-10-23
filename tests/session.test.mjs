import test from 'node:test'
import assert from 'node:assert/strict'
import { freshSession, leaveSession, beginSession, eligibleIds, testTopics, parseKnowledge, topicIncludesKnown } from '../src/lib/session.ts'

const topics = [{ id: 'csharp', questions: [{ id: 'q1', text: 'Первый?' }, { id: 'q2', text: 'Второй?' }] }]
test('leaving completed results clears answers whether or not they were exported', () => {
  for (const stage of ['result', 'questions', 'topics']) {
    const session = { ...freshSession(), stage, selected: ['csharp'], answers: { q1: 'Ответ' }, index: 1, completedAt: '2026-10-21T12:00:00Z', questionIds: ['q1', 'q2'] }
    const home = leaveSession(session)
    assert.deepEqual(home.answers, {})
    assert.equal(home.index, 0)
    assert.equal(home.completedAt, null)
    assert.deepEqual(home.selected, ['csharp'])
    assert.deepEqual(beginSession(home, topics, home.selected, ['q1', 'q2']).answers, {})
  }
})
test('unfinished answers resume only when the question set stays the same', () => {
  const unfinished = { ...beginSession(freshSession(), topics, ['csharp'], ['q1', 'q2']), answers: { q1: 'Ответ' }, index: 1 }
  const paused = leaveSession(unfinished)
  assert.equal(beginSession(paused, topics, ['csharp'], ['q1', 'q2']).answers.q1, 'Ответ')
  assert.deepEqual(beginSession(paused, topics, ['csharp'], ['q2']).answers, {})
  const updated = structuredClone(topics)
  updated[0].questions[0].text = 'Изменённый вопрос'
  assert.equal(beginSession(paused, updated, ['csharp'], ['q1', 'q2']).topicSnapshot[0].questions[0].text, 'Первый?')
})
test('known questions are excluded by default, can be included and survive a reload', () => {
  const knowledge = parseKnowledge(JSON.stringify({ knownIds: ['q1', 'q1'], includeKnown: false }))
  assert.deepEqual(eligibleIds(topics, ['csharp'], knowledge.knownIds, knowledge.includeKnown), ['q2'])
  assert.deepEqual(eligibleIds(topics, ['csharp'], knowledge.knownIds, true), ['q1', 'q2'])
  assert.deepEqual(eligibleIds(topics, ['csharp'], ['q1', 'q2'], false), [])
  assert.deepEqual(parseKnowledge(null), { knownIds: [], includeKnown: false })
  assert.throws(() => parseKnowledge('{'))
  assert.throws(() => parseKnowledge('{"knownIds":[1],"includeKnown":false}'))
})
test('the running question list and export contain only the questions selected at launch', () => {
  const session = beginSession(freshSession(), topics, ['csharp'], eligibleIds(topics, ['csharp'], ['q1'], false))
  assert.deepEqual(testTopics(session.topicSnapshot, session.selected, session.questionIds)[0].questions.map(q => q.id), ['q2'])
  const changedKnowledge = ['q1', 'q2']
  assert.equal(eligibleIds(topics, ['csharp'], changedKnowledge, false).length, 0)
  assert.equal(testTopics(session.topicSnapshot, session.selected, session.questionIds)[0].questions.length, 1)
  assert.deepEqual(testTopics(topics, ['csharp'], []), [])
})

test('including known questions is independent for each topic and survives reload', () => {
  const mixed = [...topics, { id:'sql', questions:[{id:'sql-1', text:'SQL?'}] }]
  const settings = parseKnowledge(JSON.stringify({ knownIds:['q1','sql-1'], includeKnown:false, includeKnownByTopic:{csharp:true, sql:false} }))
  assert.deepEqual(eligibleIds(mixed, ['csharp','sql'], settings.knownIds, settings.includeKnown, settings.includeKnownByTopic), ['q1','q2'])
  assert.equal(topicIncludesKnown(settings,'csharp'),true)
  assert.equal(topicIncludesKnown(settings,'sql'),false)
  const legacy = parseKnowledge('{"knownIds":["q1"],"includeKnown":true}')
  assert.equal(topicIncludesKnown(legacy,'csharp'),true)
  assert.throws(() => parseKnowledge('{"knownIds":[],"includeKnown":false,"includeKnownByTopic":{"csharp":"yes"}}'))
})
