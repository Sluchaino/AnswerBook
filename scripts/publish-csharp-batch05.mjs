// All writes use the existing authenticated authoring API; no direct source mutation.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {validateExercise,exerciseFingerprint} from '../src/lib/exercises.ts'
import {csharpBatch05Moves} from './lib/csharp-batch05-plan.mjs'
import {attachExercises} from './lib/attach-exercises.mjs'
const source=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const courseId='csharp-foundations-v2',baseline=JSON.parse(fs.readFileSync('tests/fixtures/exercises-before-batch05.json')),course=JSON.parse(fs.readFileSync('server/course-source/'+courseId+'.json'))
const additions=JSON.parse(fs.readFileSync(source)).filter(p=>p.block.exercise.id.startsWith('csharp-b05-'))
assert.equal(additions.length,34)
const moving=new Map(csharpBatch05Moves.map(m=>[m.id,m])),normalized=p=>({...p,block:{...p.block,id:p.block.exercise.id}})
const expected=[...baseline.map(p=>moving.has(p.block.exercise.id)?(({id:_id,reason:_reason,...placement})=>({...placement,block:p.block}))(moving.get(p.block.exercise.id)):p),...additions.map(normalized)]
assert.equal(expected.length,96);assert.equal(new Set(expected.map(p=>p.block.exercise.id)).size,96)
for(const p of expected)validateExercise(p.block.exercise)
const modules=structuredClone(course.modules).map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))
attachExercises(modules,expected)
for(const m of modules){assert.ok(m.lessons.reduce((n,l)=>n+l.blocks.filter(b=>b.kind==='exercise').length,0)>=5,m.id);for(const l of m.lessons)assert.ok(l.blocks.filter(b=>b.kind==='exercise').length<=1,l.id)}
if(process.argv.includes('--check-only')){console.log('Validated plan: 34 new, 10 placement-only moves, 96 total; minimum five and maximum one per lesson');process.exit(0)}
const token=fs.readFileSync('.tools/authoring-token.txt','utf8').trim(),url='http://127.0.0.1:5129/api/authoring'
async function request(body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw new Error(`${r.status}: ${value.error??value.detail??'Ошибка редактора'}`);return value}
let state=await request()
for(const target of csharpBatch05Moves){
 const entry=state.entries.find(e=>e.courseId===courseId&&e.published?.block.exercise.id===target.id),old=baseline.find(p=>p.block.exercise.id===target.id)
 assert.ok(entry?.published);assert.deepEqual(entry.published.block,old.block)
 const {id:_id,reason:_reason,...placement}=target
 if(['moduleId','lessonId','afterBlockId'].every(k=>entry.published[k]===placement[k])){console.log('Already moved:',target.id);continue}
 assert.deepEqual(entry.published,old)
 await request({action:'save',revision:state.revision,courseId,exercise:old.block.exercise,placement,baseFingerprint:exerciseFingerprint(old.block.exercise)});state=await request()
 await request({action:'publish',revision:state.revision,courseId,id:target.id});state=await request();console.log('Moved without changing exercise:',target.id)
}
let pending=[]
for(const p of additions){const e=state.entries.find(e=>e.courseId===courseId&&(e.published?.block.exercise.id??e.draft?.exercise.id)===p.block.exercise.id);if(e?.published)assert.deepEqual(e.published,normalized(p));else if(e?.draft){assert.deepEqual(e.draft.exercise,p.block.exercise);assert.deepEqual(e.draft.placement,(({moduleId,lessonId,afterBlockId})=>({moduleId,lessonId,afterBlockId}))(p))}else pending.push(p)}
if(pending.length){await request({action:'import',revision:state.revision,courseId,value:pending});state=await request();console.log('Validated new drafts imported:',pending.length)}
for(const p of additions){if(state.entries.some(e=>e.courseId===courseId&&e.published?.block.exercise.id===p.block.exercise.id)){console.log('Already published:',p.block.exercise.id);continue}await request({action:'publish',revision:state.revision,courseId,id:p.block.exercise.id});state=await request();console.log('Published:',p.block.exercise.id)}
const published=state.entries.filter(e=>e.courseId===courseId&&e.published).map(e=>e.published)
assert.deepEqual(published,expected)
fs.writeFileSync('artifacts/csharp-batch05-publication.json',JSON.stringify({courseVersion:state.courses.find(c=>c.id===courseId).version,exercises:published.length,moves:csharpBatch05Moves,ids:additions.map(p=>p.block.exercise.id)},null,2)+'\n')
console.log('Publication verified:',published.length,'course v'+state.courses.find(c=>c.id===courseId).version)
