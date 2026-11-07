import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {retiredCourseIds} from '../src/lib/retiredCourses.ts'
import {purgeRemovedCourses,validateLearningManifest,validateLearningBundle,fetchLearningBundle} from '../src/lib/learningDownloads.ts'
import {parseProfile} from '../src/lib/profile.ts'
import {parseEconomy,freshEconomy,coursePrice} from '../src/lib/economy.ts'
import {downloadCourse} from './fixtures/synthetic-course.mjs'

test('retired courses, their theory and previous editions remain absent while new modular content is allowed',()=>{
  assert.deepEqual(JSON.parse(readFileSync(new URL('../src/data/learning-catalog.json',import.meta.url),'utf8')),[])
  assert.equal(readdirSync(new URL('../src/data/',import.meta.url)).filter(f=>f.endsWith('-course.json')).length,0)
  for(const file of readdirSync(new URL('../server/course-source/',import.meta.url)).filter(f=>f.endsWith('.json'))) {const c=JSON.parse(readFileSync(new URL('../server/course-source/'+file,import.meta.url),'utf8'));assert.equal(retiredCourseIds.includes(c.id),false);assert.equal(c.formatVersion,2)}
  assert.equal(existsSync(new URL('../src/data/learning-readings.json',import.meta.url)),false)
  assert.equal(existsSync(new URL('../src/data/learning-previous-editions.json',import.meta.url)),false)
  assert.equal(retiredCourseIds.length,28)
})

test('empty server catalogs and offline bundles are valid; malformed removal lists are rejected',()=>{
  const m={schemaVersion:1,revision:9,directions:[],courses:[],removedIds:[...retiredCourseIds]}
  assert.deepEqual(validateLearningManifest(m),m)
  assert.equal(validateLearningBundle({...m,fingerprints:{}}).courses.length,0)
  assert.throws(()=>validateLearningManifest({...m,removedIds:['../../bad']}))
  assert.throws(()=>validateLearningManifest({...m,removedIds:['a','a']}))
})

test('withdrawn ASP.NET and Python courses are absent from sources, drafts and published catalog',()=>{
 const root=new URL('../server/',import.meta.url)
 for(const id of ['aspnet-core-foundations-v1','python-foundations-v1']){
  assert.ok(retiredCourseIds.includes(id))
  assert.equal(existsSync(new URL('course-source/'+id+'.json',root)),false)
  assert.equal(existsSync(new URL('exercise-source/'+id+'.json',root)),false)
  assert.equal(readdirSync(new URL('theory-source/',root)).some(n=>n.startsWith(id==='python-foundations-v1'?'python-module':'aspnet-core-module')),false)
  assert.equal(JSON.parse(readFileSync(new URL('exercise-drafts/drafts.json',root),'utf8')).some(d=>d.courseId===id),false)
  const catalog=JSON.parse(readFileSync(new URL('AnswerBook.ContentApi/content/catalog.json',root),'utf8'))
  assert.ok(catalog.removedIds.includes(id));assert.equal(catalog.courses.some(c=>c.id===id),false)
  assert.ok(catalog.courses.some(c=>c.id==='csharp-foundations-v2'))
 }
})

test('known retired courses and their fingerprints are purged offline while future courses survive',()=>{
  const old={schemaVersion:1,revision:8,directions:[{id:'fundamentals',title:'Fixture',description:'Fixture'}],courses:[{...downloadCourse,id:retiredCourseIds[0]},downloadCourse],fingerprints:{[retiredCourseIds[0]]:'a'.repeat(64)}}
  const cleaned=purgeRemovedCourses(old)
  assert.deepEqual(cleaned.courses,[downloadCourse]);assert.deepEqual(cleaned.fingerprints,{})
  assert.equal(purgeRemovedCourses(cleaned),cleaned)
  assert.equal(old.courses.length,2)
})

test('explicit server deletion persists an empty cache and cannot be undone by an older manifest',async()=>{
  const current={schemaVersion:1,revision:8,source:'https://example.test/api/catalog',directions:[{id:'fundamentals',title:'Fixture',description:'Fixture'}],courses:[downloadCourse],fingerprints:{[downloadCourse.id]:'a'.repeat(64)}}
  const m={schemaVersion:1,revision:9,directions:[],courses:[],removedIds:[downloadCourse.id]}
  let saved
  const next=await fetchLearningBundle(current.source,current,async b=>{saved=JSON.stringify(b)},async()=>new Response(JSON.stringify(m)))
  assert.equal(next.courses.length,0);assert.deepEqual(next.fingerprints,{})
  assert.equal(validateLearningBundle(JSON.parse(saved)).courses.length,0)
  assert.equal(await fetchLearningBundle(current.source,next,async()=>assert.fail(),async()=>new Response(JSON.stringify({...m,revision:8}))),next)
  await assert.rejects(fetchLearningBundle(current.source,current,async()=>{throw new Error('disk full')},async()=>new Response(JSON.stringify(m))),/disk full/)
  assert.equal(current.courses.length,1)
})

test('retired links and price surcharges disappear but professions, personal courses and coin balance remain',()=>{
  const id=retiredCourseIds[0],profile=parseProfile(JSON.stringify({version:1,name:'',professions:[{id:'p',title:'My profession',courses:[{id:'learning:'+id,title:'Retired',learningCourseId:id},{id:'custom',title:'Personal'}]}],completedCourseIds:['learning:'+id,'custom']}))
  assert.equal(profile.professions[0].title,'My profession');assert.deepEqual(profile.professions[0].courses,[{id:'custom',title:'Personal'}]);assert.deepEqual(profile.completedCourseIds,['custom'])
  const e=parseEconomy({...freshEconomy([],'2026-10-26'),balance:42,unlockedIds:[id],purchasedIds:[id]})
  assert.equal(e.balance,42);assert.equal(coursePrice(e),100);assert.deepEqual(e.purchasedIds,[])
})
