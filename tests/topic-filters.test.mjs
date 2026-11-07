import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { filterTopics, topicDirections,groupTopics } from '../src/lib/topicFilters.ts'

const {topics} = JSON.parse(readFileSync(new URL('../src/data/questions.json', import.meta.url),'utf8'))
test('all survey topics belong to one direction; filters intersect without changing source data', () => {
  const before = structuredClone(topics)
  assert.ok(topics.every(topic => topicDirections[topic.id]))
  assert.equal(filterTopics(topics,'','all').length,topics.length)
  assert.deepEqual(filterTopics(topics,'  REDIS  ','storage').map(t=>t.id),['redis-caching'])
  assert.equal(filterTopics(topics,'redis','web').length,0)
  assert.equal(filterTopics(topics,'невозможный запрос','all').length,0)
  assert.deepEqual(topics,before)
})
test('search matches all words in titles and descriptions, normalizes ё, and exposes new unknown topics', () => {
  const extra = {...topics[0],id:'future-topic',title:'Будущая тема',description:'Надёжные сервисы'}
  assert.deepEqual(filterTopics([extra],'НАДЕЖНЫЕ будущая','other'),[extra])
  assert.equal(filterTopics([extra],'будущая','dotnet').length,0)
  assert.deepEqual(filterTopics([extra],'','all'),[extra])
})
test('direction groups contain every topic once, including custom and future unclassified topics',()=>{
  const directions=JSON.parse(readFileSync(new URL('../src/data/learning-directions.json',import.meta.url),'utf8'))
  const custom={...topics[0],id:'custom-test'},future={...topics[0],id:'future-topic'}
  const all=[...topics,custom,future]
  const groups=groupTopics(all,[...directions,{id:'custom'},{id:'other'}])
  const ids=groups.flatMap(group=>group.topics.map(topic=>topic.id))
  assert.equal(ids.length,all.length);assert.equal(new Set(ids).size,all.length)
  assert.deepEqual(new Set(ids),new Set(all.map(topic=>topic.id)))
  assert.deepEqual(groups.find(group=>group.direction.id==='custom').topics,[custom])
  assert.deepEqual(groups.find(group=>group.direction.id==='other').topics,[future])
  const filtered=groupTopics(filterTopics(all,'redis','all'),directions)
  assert.equal(filtered.length,1);assert.equal(filtered[0].direction.id,'storage')
})
