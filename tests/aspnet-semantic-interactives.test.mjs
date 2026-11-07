import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {withCurrentExampleFixes} from './fixtures/aspnet-current-example-fixes.mjs'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {freshTrace,moveTrace,chooseTraceOption,submitTraceOption} from '../src/lib/codeTraces.ts'
import {runData,dataResult} from '../src/lib/dataTransforms.ts'
import {referenceAnswer,wrongAnswer} from './fixtures/exercise-solutions.mjs'
const read=p=>JSON.parse(fs.readFileSync(p)),raw=read('server/course-source/aspnet-core-foundations-v2.json'),before=read('tests/fixtures/aspnet-before-semantic-interactives.json'),all=c=>c.modules.flatMap(m=>m.lessons.flatMap(l=>l.blocks.filter(b=>b.kind==='exercise').map(b=>b.exercise))),old=new Map(all(before).map(e=>[e.id,e])),changed=all(raw).filter(e=>JSON.stringify(old.get(e.id))!==JSON.stringify(e))
test('fourteen semantic replacements preserve all theory, quizzes, exercise IDs and count',()=>{
 const strip=c=>c.modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))
 assert.deepEqual(strip(raw),strip(withCurrentExampleFixes(before)));assert.equal(changed.length,14);assert.equal(all(raw).length,135)
 for(const e of changed){assert.equal(e.version,old.get(e.id).version+1);validateExercise(e);assert.equal(checkExercise(e,referenceAnswer(e)).correct,true,e.id);assert.equal(checkExercise(e,wrongAnswer(e)).correct,false,e.id)}
 assert.equal(changed.filter(e=>e.type==='architecture-builder').length,6);assert.equal(changed.filter(e=>e.type==='code-trace').length,4);assert.equal(changed.filter(e=>e.type==='code-order').length,3);assert.equal(changed.filter(e=>e.type==='data-transform').length,1)
})
test('trace practice gates every next step and accepts predictions only through the real player state machine',()=>{
 for(const e of changed.filter(e=>e.type==='code-trace')){
 let a=freshTrace(e)
 assert.throws(()=>moveTrace(e,a,e.content.steps[0].id))
 for(const [i,p]of e.content.predictions.entries()){
 a=chooseTraceOption(e,a,p.id,p.correctOptionId);a=submitTraceOption(e,a,p.id);a=moveTrace(e,a,e.content.steps[i].id)
 }
 assert.equal(checkExercise(e,a).correct,true)
 const wrong=structuredClone(a),p=e.content.predictions[0],choice=p.options.find(o=>o.id!==p.correctOptionId).id;wrong.responses[p.id]={choiceId:choice,checkedChoiceId:choice,firstChoiceId:choice,attempts:1}
 assert.equal(checkExercise(e,wrong).correct,false)
 }
})
test('architecture direction and extra connections matter; independent JwtBearer assignments allow all six permutations',()=>{
 for(const e of changed.filter(e=>e.type==='architecture-builder')){
 const a=referenceAnswer(e),edge=a.graph.edges[0];[edge.source,edge.target]=[edge.target,edge.source];assert.equal(checkExercise(e,a).correct,false)
 }
 const jwt=changed.find(e=>e.title==='Настройте доверенный источник ключей');assert.equal(jwt.validation.acceptedOrders.length,6)
 for(const order of jwt.validation.acceptedOrders)assert.equal(checkExercise(jwt,{type:'code-order',order}).correct,true)
})
test('DTO projection never substitutes for ownership; stable tie-break and completed filter are required by the data',()=>{
 const e=changed.find(e=>e.type==='data-transform'),s=e.validation.solution
 assert.deepEqual(dataResult(runData(e,s).frame),e.content.target)
 for(const omitted of [0,1,3])assert.equal(checkExercise(e,{type:'data-transform',steps:s.filter((_,i)=>i!==omitted)}).correct,false)
 const swapped=[s[1],s[0],...s.slice(2)];assert.equal(checkExercise(e,{type:'data-transform',steps:swapped}).correct,true)
})
