import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {CourseLibrary,emptyLibrary,restoreLibrary,savedCourseProgress} from '../src/lib/courseLibrary.ts'
import {summarizeCourse} from '../src/lib/courseCatalog.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,finishLearningAttempt,restoreLearningAttempt} from '../src/lib/learning.ts'
import {downloadCourse} from './fixtures/synthetic-course.mjs'

const url='https://content.example.test/catalog.json'
test('full deletion commits a recoverable cleanup journal; failed commits retain the previous state',async()=>{
 const f=fixture();let raw,fail=false
 const lib=new CourseLibrary(emptyLibrary(f.manifest),url,async state=>{if(fail)throw Error('disk full');raw=JSON.stringify(state)},()=>{},f.fetcher)
 await lib.download(downloadCourse.id)
 const before=lib.state
 fail=true
 await assert.rejects(lib.remove(downloadCourse.id,null,true),/disk full/)
 assert.equal(lib.state,before)
 assert.equal(lib.state.pendingPurges,undefined)
 fail=false
 await lib.remove(downloadCourse.id,null,true)
 const recovered=restoreLibrary(raw,f.manifest)
 assert.deepEqual(recovered.pendingPurges,[downloadCourse.id])
 assert.equal(recovered.installed.courses.length,0)
 assert.equal(recovered.progress[downloadCourse.id],undefined)
 await lib.completePurge(downloadCourse.id)
 assert.deepEqual(restoreLibrary(raw,f.manifest).pendingPurges,[])
})
test('full course removal clears persisted summaries, retains other courses and allows a fresh download',async()=>{
  const f=fixture();let persisted
  const lib=new CourseLibrary(emptyLibrary(f.manifest),url,async s=>{persisted=JSON.stringify(s)},()=>{},f.fetcher)
  await Promise.all(f.manifest.courses.map(c=>lib.download(c.id)))
  const course=lib.state.installed.courses.find(c=>c.id===downloadCourse.id)
  const raw=JSON.stringify(finishLearningAttempt(course,{...freshLearningAttempt(course),answers:{'test-output-1':'8'}}))
  await lib.remove(course.id,raw)
  assert.equal(lib.state.progress[course.id].percent,100)
  await lib.remove(course.id,null,true)
  assert.equal(lib.state.progress[course.id],undefined)
  assert.equal(lib.state.installed.courses.length,1)
  assert.equal(lib.state.installed.courses[0].id,'another-course')
  const restored=restoreLibrary(persisted,f.manifest)
  assert.equal(restored.progress[course.id],undefined)
  await lib.download(course.id)
  assert.equal(savedCourseProgress(lib.state.installed.courses.find(c=>c.id===course.id),null).percent,0)
  await lib.remove(course.id,raw,true)
  assert.equal(lib.state.installed.courses.some(c=>c.id===course.id),false)
  assert.equal(lib.state.progress[course.id],undefined)
})
function fixture(courses=[downloadCourse,{...downloadCourse,id:'another-course'}],revision=1){
  const files=new Map(),requests=[]
  const manifest={schemaVersion:1,revision,directions:[{id:'fundamentals',title:'Основы',description:'Описание'}],courses:courses.map(input=>{
    const c=validateDownloadedCourse(structuredClone(input)),json=JSON.stringify(input),sha256=createHash('sha256').update(json).digest('hex'),file=`${c.id}-v${c.version}-${sha256}.json`
    files.set(file,json);return {id:c.id,version:c.version,file,sha256,bytes:Buffer.byteLength(json),summary:summarizeCourse(c)}
  })}
  const fetcher=async input=>{const address=String(input);requests.push(address);return address===url?new Response(JSON.stringify(manifest)):files.has(address.split('/').at(-1))?new Response(files.get(address.split('/').at(-1))):new Response('',{status:404})}
  return {manifest,files,requests,fetcher}
}
test('catalog refresh never downloads courses; explicitly download only one, including offline reload',async()=>{
  const f=fixture();let persisted
  const lib=new CourseLibrary(emptyLibrary(f.manifest),url,async s=>{persisted=JSON.stringify(s)},()=>{},f.fetcher)
  await lib.refresh();assert.deepEqual(f.requests,[url]);assert.equal(lib.state.installed.courses.length,0)
  await lib.download(downloadCourse.id);assert.equal(lib.state.installed.courses.length,1);assert.equal(f.requests.length,2)
  const restored=restoreLibrary(persisted,f.manifest)
  assert.equal(restored.installed.courses[0].lessons[0].reading[0].content[0].text,'TEST')
  assert.equal(restored.manifest.courses.length,2)
})
test('browser fetch is invoked without binding it to the library instance',async()=>{
  const f=fixture()
  const browserFetch=async function(input,init){assert.equal(this,undefined);return f.fetcher(input,init)}
  const lib=new CourseLibrary(emptyLibrary(f.manifest),url,async()=>{},()=>{},browserFetch)
  await lib.refresh();await lib.download(downloadCourse.id)
  assert.equal(lib.state.installed.courses.length,1)
})
test('deleting all course materials preserves progress/results, survives restart and refresh without redownload',async()=>{
  const f=fixture();let persisted
  const lib=new CourseLibrary(emptyLibrary(f.manifest),url,async s=>{persisted=JSON.stringify(s)},()=>{},f.fetcher)
  await lib.download(downloadCourse.id)
  const course=lib.state.installed.courses[0],attempt=finishLearningAttempt(course,{...freshLearningAttempt(course),answers:{'test-output-1':'8'}}),raw=JSON.stringify(attempt)
  await lib.remove(course.id,raw)
  assert.equal(lib.state.installed.courses.length,0);assert.deepEqual(lib.state.installed.fingerprints,{})
  assert.equal(lib.state.progress[course.id].percent,100)
  assert.doesNotMatch(persisted,/"reading"|"questions"|"correct"|"exercises"/)
  const reloaded=new CourseLibrary(restoreLibrary(persisted,f.manifest),url,async()=>{},()=>{},f.fetcher)
  const before=f.requests.length;await reloaded.refresh();assert.equal(f.requests.length,before+1);assert.equal(reloaded.state.installed.courses.length,0)
  await reloaded.download(course.id)
  const restored=restoreLearningAttempt(raw,reloaded.state.installed.courses[0]);assert.deepEqual(restored.lastResult,attempt.lastResult)
  assert.equal(savedCourseProgress(reloaded.state.installed.courses[0],raw).percent,100)
})
test('corrupt payloads, offline errors and failed writes retain the previous library; queued mutations do not lose other courses',async()=>{
  const f=fixture();let fail=false
  const lib=new CourseLibrary(emptyLibrary(f.manifest),url,async()=>{if(fail)throw Error('disk full')},()=>{},f.fetcher)
  await Promise.all(f.manifest.courses.map(c=>lib.download(c.id)));assert.equal(lib.state.installed.courses.length,2)
  const before=lib.state;fail=true;await assert.rejects(lib.remove(downloadCourse.id,null),/disk full/);assert.equal(lib.state,before)
  fail=false;await lib.remove(downloadCourse.id,null)
  f.files.set(f.manifest.courses[0].file,'broken');const deleted=lib.state
  await assert.rejects(lib.download(downloadCourse.id));assert.equal(lib.state,deleted)
  const offline=new CourseLibrary(lib.state,url,async()=>assert.fail(),()=>{},async()=>{throw Error('offline')})
  await assert.rejects(offline.refresh());assert.equal(offline.state,deleted)
})
test('updating is explicit, preserves previous edition and saved answers, and upgrades just one course',async()=>{
  const f=fixture(),lib=new CourseLibrary(emptyLibrary(f.manifest),url,async()=>{},()=>{},f.fetcher)
  await lib.download(downloadCourse.id)
  const attempt={...freshLearningAttempt(lib.state.installed.courses[0]),answers:{'test-output-1':'8'}}
  const v2=fixture([{...downloadCourse,version:2,title:'Updated course'}, {...downloadCourse,id:'another-course'}],2)
  const updated=new CourseLibrary(lib.state,url,async()=>{},()=>{},v2.fetcher)
  await updated.refresh();assert.equal(updated.state.installed.courses[0].version,1);assert.deepEqual(v2.requests,[url])
  await updated.download(downloadCourse.id);const c=updated.state.installed.courses[0]
  assert.equal(c.version,2);assert.equal(c.previous.version,1);assert.equal(updated.state.installed.courses.length,1)
  assert.equal(restoreLearningAttempt(JSON.stringify(attempt),c,c.previous).answers['test-output-1'],'8')
})
test('legacy caches migrate and shipped catalog has structure without theory, tests or exercise payloads',()=>{
  const f=fixture(),legacy={schemaVersion:1,revision:1,directions:f.manifest.directions,courses:[downloadCourse],fingerprints:{}}
  assert.equal(restoreLibrary(JSON.stringify(legacy),f.manifest).installed.courses.length,1)
  const catalog=readFileSync(new URL('../src/data/download-catalog.json',import.meta.url),'utf8')
  assert.doesNotMatch(catalog,/"reading"|"questions"|"blocks"|"correct"|"exercises"|"content"/)
  const source=readFileSync(new URL('../src/lib/learningContent.ts',import.meta.url),'utf8')
  assert.doesNotMatch(source,/import\.meta\.glob|course-source/)
})
