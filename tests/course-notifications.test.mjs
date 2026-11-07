import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {reconcileNotices} from '../src/lib/courseNotices.ts'
import {summarizeCourse,validateCourseSummary} from '../src/lib/courseCatalog.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'

const cases=JSON.parse(fs.readFileSync('android/app/src/test/resources/course-notice-cases.json','utf8'))
for(const c of cases)test(`notification diff: ${c.name}`,()=>{
 if(c.reject)assert.throws(()=>reconcileNotices(c.previous,c.manifest,c.now))
 else assert.deepEqual(reconcileNotices(c.previous,c.manifest,c.now),c.expected)
})

test('published fingerprints identify a changed lesson without downloading it; old summaries still validate',()=>{
 const raw=JSON.parse(fs.readFileSync('server/course-source/aspnet-core-foundations-v2.json','utf8'))
 const fingerprint=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex')
 const old=summarizeCourse(validateDownloadedCourse(structuredClone(raw)),fingerprint)
 const lesson=raw.modules[0].lessons[0];lesson.blocks.find(b=>b.kind==='theory').content.push({kind:'paragraph',text:'Новое пояснение.'})
 const next=summarizeCourse(validateDownloadedCourse(raw),fingerprint)
 assert.notEqual(next.modules[0].lessons[0].contentHash,old.modules[0].lessons[0].contentHash)
 assert.equal(next.modules[0].lessons[1].contentHash,old.modules[0].lessons[1].contentHash)
 assert.notEqual(next.modules[0].contentHash,old.modules[0].contentHash)
 assert.doesNotThrow(()=>validateCourseSummary(summarizeCourse(validateDownloadedCourse(raw))))
 const bad=structuredClone(next);bad.modules[0].contentHash='broken';assert.throws(()=>validateCourseSummary(bad))
})

test('history stays bounded and a read release is not reported again',()=>{
 const source=cases.find(c=>c.name==='new course')
 let state=structuredClone(source.expected);state.items[0].read=true
 assert.deepEqual(reconcileNotices(state,source.manifest,source.now).items,state.items)
 state.items=Array.from({length:100},(_,i)=>({...state.items[0],id:`old-${i}`}))
 const next=structuredClone(source.manifest);next.revision++;next.courses[1].version++;next.courses[1].summary.version++
 state=reconcileNotices(state,next,source.now);assert.equal(state.items.length,100);assert.equal(state.items[0].version,next.courses[1].version)
})
