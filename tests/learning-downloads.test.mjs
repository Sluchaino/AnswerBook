import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {fetchLearningBundle,validateLearningBundle,validateLearningManifest} from '../src/lib/learningDownloads.ts'
import {restoreLearningAttempt,finishLearningAttempt,freshLearningAttempt} from '../src/lib/learning.ts'

import {downloadCourse as course} from './fixtures/synthetic-course.mjs'
const direction={id:'fundamentals',title:'Основы',description:'Описание'}
const empty={schemaVersion:1,revision:0,directions:[direction],courses:[{...course,id:'bundled'}],fingerprints:{}}
function fixture(courses=[course],revision=1) {
  const files=new Map(),entries=courses.map(c=>{
    const json=JSON.stringify(c),sha256=createHash('sha256').update(json).digest('hex')
    const file=`${c.id}-v${c.version}-${sha256}.json`
    files.set(file,json)
    return {id:c.id,version:c.version,file,sha256,bytes:Buffer.byteLength(json)}
  })
  const manifest={schemaVersion:1,revision,directions:[direction],courses:entries},requests=[]
  const fetcher=async url=>{
    requests.push(url)
    return url.endsWith('/api/catalog') ? new Response(JSON.stringify(manifest)) : files.has(url.split('/').at(-1)) ? new Response(files.get(url.split('/').at(-1))) : new Response('',{status:404})
  }
  return {manifest,files,fetcher,requests}
}
const url='https://content.example.test/api/catalog'

test('a new server course is fully validated and saved before becoming available offline; built-ins survive',async()=>{
  const f=fixture();let stored
  const next=await fetchLearningBundle(url,empty,async b=>{stored=JSON.stringify(b)},f.fetcher)
  assert.equal(next.courses.length,2);assert.equal(next.revision,1)
  assert.deepEqual(validateLearningBundle(JSON.parse(stored)),next)
  assert.equal(f.requests[1],`https://content.example.test/api/courses/${f.manifest.courses[0].file}`)
  const offline=validateLearningBundle(JSON.parse(stored))
  assert.equal(offline.courses.find(c=>c.id===course.id).lessons[0].reading[0].content[0].kind,'code')
})

test('same revision and rollback skip downloads; a newer manifest only downloads changed files',async()=>{
  const first=fixture(),cache=await fetchLearningBundle(url,empty,async()=>{},first.fetcher)
  first.requests.length=0
  assert.equal(await fetchLearningBundle(url,cache,async()=>assert.fail(),first.fetcher),cache)
  assert.equal(first.requests.length,1)
  const second=fixture([course],2)
  const next=await fetchLearningBundle(url,cache,async()=>{},second.fetcher)
  assert.equal(second.requests.length,1);assert.equal(next.revision,2)
  assert.equal(await fetchLearningBundle(url,next,async()=>assert.fail(),first.fetcher),next)
  const third=fixture([{...course,id:'new-course'},course],3)
  const updated=await fetchLearningBundle(url,next,async()=>{},third.fetcher)
  assert.equal(third.requests.length,2);assert.equal(updated.courses.length,3)
})

test('interruption, damaged JSON/hash, failed disk write and version collisions never replace the old cache',async()=>{
  let writes=0
  const save=async()=>{writes++},f=fixture()
  await assert.rejects(fetchLearningBundle(url,empty,save,async()=>{throw new Error('offline')}))
  await assert.rejects(fetchLearningBundle(url,empty,save,async()=>new Response('',{status:503})))
  const bad=fixture();bad.files.set(bad.manifest.courses[0].file,'not JSON')
  await assert.rejects(fetchLearningBundle(url,empty,save,bad.fetcher))
  assert.equal(writes,0)
  await assert.rejects(fetchLearningBundle(url,empty,async()=>{throw new Error('disk full')},f.fetcher),/disk full/)
  const cache=await fetchLearningBundle(url,empty,save,f.fetcher)
  const changed=fixture([{...course,title:'Changed without version'}],2)
  await assert.rejects(fetchLearningBundle(url,cache,save,changed.fetcher),/без повышения/)
  assert.equal(cache.courses.find(c=>c.id===course.id).title,course.title)
  assert.equal(writes,1)
})

test('updated courses retain answer IDs and old results; removed courses and built-ins remain available',async()=>{
  const f=fixture(),cache=await fetchLearningBundle(url,empty,async()=>{},f.fetcher)
  const old=cache.courses.find(c=>c.id===course.id),a=freshLearningAttempt(old)
  a.answers[old.lessons[0].questions[0].id]='8'
  const result=finishLearningAttempt(old,a)
  const fresh={...course,version:2,lessons:[...course.lessons,{...course.lessons[0],id:'next',questions:[{...course.lessons[0].questions[0],id:'new-question'}]}]}
  const updated=await fetchLearningBundle(url,cache,async()=>{},fixture([fresh],2).fetcher)
  const c=updated.courses.find(c=>c.id===course.id),restored=restoreLearningAttempt(JSON.stringify(result),c,c.previous)
  assert.equal(restored.finished,false);assert.equal(restored.answers['test-output-1'],'8')
  assert.equal(restored.answers['new-question'],undefined);assert.deepEqual(restored.lastResult,result.lastResult)
  const removed=await fetchLearningBundle(url,updated,async()=>{},fixture([{...course,id:'other'}],3).fetcher)
  assert.ok(removed.courses.some(c=>c.id===course.id));assert.ok(removed.courses.some(c=>c.id==='bundled'))
})

test('unknown schema, unsafe paths, missing directions and inconsistent payload versions are rejected',async()=>{
  const f=fixture()
  for(const bad of [{...f.manifest,schemaVersion:2},{...f.manifest,courses:[{...f.manifest.courses[0],file:'../../secret'}]},{...f.manifest,courses:[f.manifest.courses[0],f.manifest.courses[0]]}])assert.throws(()=>validateLearningManifest(bad))
  assert.throws(()=>validateLearningBundle({...empty,directions:[{...direction,id:'other'}]}))
  await assert.rejects(fetchLearningBundle('http://public.example.com/api/catalog',empty,async()=>{},f.fetcher),/HTTPS/)
  const wrong=fixture([{...course,direction:'unknown'}])
  await assert.rejects(fetchLearningBundle(url,empty,async()=>assert.fail(),wrong.fetcher),/направление/)
})

test('many successive updates keep a bounded prior-version chain and never break future downloads',async()=>{
  let cache=empty
  for(let version=1;version<=12;version++)cache=await fetchLearningBundle(url,cache,async()=>{},fixture([{...course,version}],version).fetcher)
  const latest=cache.courses.find(c=>c.id===course.id)
  assert.equal(latest.version,12)
  let count=0,previous=latest.previous
  while(previous){count++;previous=previous.previous}
  assert.equal(count,4)
})

test('moving the public endpoint can start its revision sequence while retaining offline courses',async()=>{
  const cache=await fetchLearningBundle(url,empty,async()=>{},fixture([course],10).fetcher)
  const next=await fetchLearningBundle('https://new.example.test/api/catalog',cache,async()=>{},fixture([{...course,id:'new-host-course'}],1).fetcher)
  assert.equal(next.revision,1);assert.equal(next.source,'https://new.example.test/api/catalog')
  assert.ok(next.courses.some(c=>c.id===course.id));assert.ok(next.courses.some(c=>c.id==='new-host-course'))
})
