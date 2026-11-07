import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateCatalog,newerCatalog} from '../src/lib/catalog.ts'
import {topicDirections} from '../src/lib/topicFilters.ts'
import {eligibleIds,parseKnowledge} from '../src/lib/session.ts'
import {questionRedirects} from '../src/lib/questionRedirects.ts'
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'))
const catalog=validateCatalog(read('../src/data/questions.json'))
const old=read('./fixtures/catalog-v6-identities.json')
const live=new Map(catalog.topics.flatMap(t=>t.questions.map(q=>[q.id,q])))
test('all original question identities remain live or have a direct semantic replacement',()=>{
 assert.ok(catalog.revision>=7)
 assert.equal(newerCatalog(catalog,{revision:old.revision,topics:catalog.topics}),catalog)
 for(const topic of old.topics)for(const q of topic.questions){
  const replacement=live.get(questionRedirects[q.id]??q.id)
  assert.ok(replacement,q.id)
  if(!questionRedirects[q.id]){const {text,...metadata}=replacement;assert.deepEqual(metadata,q)}
 }
})
test('retained course-derived prompts remain standalone and keep valid module provenance',()=>{
 const modules=new Map()
 for(const name of ['csharp-foundations-v2','aspnet-core-foundations-v2']){
  const course=read(`../server/course-source/${name}.json`)
  for(const module of course.modules)modules.set(`${course.id}:${module.id}`,module.title)
 }
 for(const question of [...live.values()].filter(q=>q.id.startsWith('survey-course-'))){
  assert.equal(question.block,modules.get(question.source),question.id)
  assert.ok(!/вариант ответа|код из теории|в примере выше/i.test(question.text),question.id)
 }
})
test('all topics retain a direction and new questions are independently eligible',()=>{
 assert.equal(catalog.topics.length,29)
 assert.ok(catalog.topics.every(t=>topicDirections[t.id]&&t.questions.length))
 const knowledge=parseKnowledge(JSON.stringify({knownIds:['csharp-001'],includeKnown:false}))
 const ids=eligibleIds(catalog.topics,catalog.topics.map(t=>t.id),knowledge.knownIds,false)
 assert.ok(!ids.includes('csharp-001'))
 assert.equal(ids.length,live.size-1)
})
