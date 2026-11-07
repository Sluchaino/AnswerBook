import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {topicMerges,mergeBasicCsharpTopics} from '../src/lib/topicMerges.ts'
import {restoreSession,leaveSession,parseKnowledge} from '../src/lib/session.ts'
const catalog=JSON.parse(readFileSync(new URL('../src/data/questions.json',import.meta.url),'utf8'))

test('eight fundamentals topics merge into C# without losing or duplicating questions',()=>{
 assert.equal(catalog.revision,11)
 assert.equal(catalog.topics.find(t=>t.id==='csharp').questions.length,64)
 assert.ok(catalog.topics.every(t=>!topicMerges[t.id]))
 assert.equal(catalog.topics.flatMap(t=>t.questions).length,702)
 assert.deepEqual(mergeBasicCsharpTopics(catalog.topics),catalog.topics)
})
test('catalog selections migrate but running surveys preserve their original topic snapshot',()=>{
 const selected=['csharp-methods','csharp-arrays-strings','csharp']
 const catalogSession=restoreSession(JSON.stringify({stage:'topics',selected,answers:{},index:0}),catalog.topics)
 assert.deepEqual(catalogSession.selected,['csharp'])
 const legacyTopic={...catalog.topics[0],id:'csharp-methods',questions:[{id:'old-question',text:'Старый вопрос'}]}
 const running=restoreSession(JSON.stringify({stage:'questions',selected:['csharp-methods'],topicSnapshot:[legacyTopic],questionIds:['old-question'],answers:{'old-question':'Сохранённый ответ'},index:0}),catalog.topics)
 assert.deepEqual(running.selected,['csharp-methods'])
 assert.equal(running.answers['old-question'],'Сохранённый ответ')
 assert.deepEqual(leaveSession(running).selected,['csharp'])
})
test('explicit C# settings take precedence; otherwise merged settings retain an opted-in choice',()=>{
 const parse=settings=>parseKnowledge(JSON.stringify({knownIds:['csharp-001'],includeKnown:false,includeKnownByTopic:settings}))
 assert.deepEqual(parse({'csharp-methods':false,'csharp-generics':true}).includeKnownByTopic,{csharp:true})
 assert.deepEqual(parse({csharp:false,'csharp-methods':true,'custom-topic':true}).includeKnownByTopic,{csharp:false,'custom-topic':true})
 assert.deepEqual(parse({'csharp-methods':false}).knownIds,['csharp-001'])
})

test('language fundamentals contain no ORM, web-hosting or dependency-container requirements',()=>{
 const basics=catalog.topics.find(t=>t.id==='csharp')
 assert.ok(basics.questions.every(q=>!/DbContext|EF Core|ASP\.NET|middleware|IConfiguration|IHttpClientFactory|NuGet|TargetFramework|\bDI\b/i.test(q.text)))
 const owners=new Map(catalog.topics.flatMap(t=>t.questions.map(q=>[q.id,t.id])))
 assert.equal(owners.get('dotnet-practical-pdf4-7-3'),'ef-core')
 assert.equal(owners.get('csharp-pdf1-22-1'),'dotnet-practical')
 assert.equal(owners.get('open-dotnet-engineering-tools-host-options-1'),'aspnet-core')
 assert.equal(owners.get('open-rabbitmq-messaging-rabbit-outbox-1'),'rabbitmq-messaging')
 const tools=catalog.topics.find(t=>t.id==='dotnet-practical')
 assert.equal(tools.title,'Инструменты и инфраструктура .NET')
 assert.ok(tools.questions.every(q=>!/DbContext|HTTP|DTO|trace ID|unit-тест/.test(q.text)))
})

test('selection and known-question settings migrate for other consolidated subjects',()=>{
 const saved=restoreSession(JSON.stringify({stage:'topics',selected:['aspnet-routing','aspnet-controllers','aspnet-auth-sessions','networks-http-tls'],answers:{}}),catalog.topics)
 assert.deepEqual(new Set(saved.selected),new Set(['aspnet-core','backend-security','http']))
 const knowledge=parseKnowledge(JSON.stringify({knownIds:[],includeKnown:false,includeKnownByTopic:{'aspnet-routing':true,'aspnet-controllers':false,'dotnet-xunit-testing':true}}))
 assert.deepEqual(knowledge.includeKnownByTopic,{'aspnet-core':true,'testing-test-design':true})
})
