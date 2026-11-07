import fs from 'node:fs'
import assert from 'node:assert/strict'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {referenceAnswer,wrongAnswer} from '../tests/fixtures/exercise-solutions.mjs'

const root=process.argv[2]??'artifacts/sql-course-answerbook-revised-2026-11-04/sql-course'
const entries=JSON.parse(fs.readFileSync(`${root}/interactive_contracts.json`,'utf8'))
const modules=new Map(),ids=new Set(),slots=new Set(),types={}
let assertions=0
for(const {lessonId,exercise:e} of entries){
  assert(!ids.has(e.id),e.id);ids.add(e.id)
  assert(!slots.has(lessonId),lessonId);slots.add(lessonId)
  const module=lessonId.slice(0,-4);modules.set(module,(modules.get(module)??0)+1)
  types[e.type]=(types[e.type]??0)+1
  validateExercise(e)
  assert(checkExercise(e,referenceAnswer(e)).correct,e.id+' reference');assertions++
  if(e.type==='sequence'||e.type==='code-order'){
    for(const order of e.validation.acceptedOrders){assert(checkExercise(e,{type:e.type,order}).correct);assertions++}
    if(e.type==='sequence')assert.throws(()=>checkExercise(e,{type:e.type,order:[]}))
    else assert(!checkExercise(e,{type:e.type,order:[]}).correct)
    assertions++
    // A reverse order may itself be an explicitly accepted alternative (independent GRANTs).
    const wrong=wrongAnswer(e)
    if(!e.validation.acceptedOrders.some(o=>JSON.stringify(o)===JSON.stringify(wrong.order))){assert(!checkExercise(e,wrong).correct,e.id);assertions++}
  }else{
    assert(!checkExercise(e,wrongAnswer(e)).correct,e.id+' wrong answer');assertions++
  }
  if(e.type==='matching'){
    for(const left of e.content.left){for(const right of e.content.right){
      const a=referenceAnswer(e),other=Object.keys(a.pairs).find(k=>a.pairs[k]===right.id)
      ;[a.pairs[left.id],a.pairs[other]]=[a.pairs[other],a.pairs[left.id]]
      if(e.validation.pairs[left.id]!==right.id){assert(!checkExercise(e,a).correct,e.id);assertions++}
    }}
  }
  if(e.type==='code-debug'){
    const a=referenceAnswer(e)
    for(const fix of e.content.fixOptions){
      const expected=e.validation.acceptedFixes[e.content.errors[0].id].includes(fix.id)
      assert.equal(checkExercise(e,{...a,fixId:fix.id}).correct,expected,e.id);assertions++
    }
    for(let line=1;line<=e.content.code.split('\n').length;line++){
      assert.equal(checkExercise(e,{...a,selection:{kind:'line',line}}).correct,line===a.selection.line,e.id);assertions++
    }
  }
  if(e.type==='code-trace'){
    for(const p of e.content.predictions){for(const opt of p.options){
      const a=referenceAnswer(e)
      a.responses[p.id]={choiceId:opt.id,checkedChoiceId:opt.id,firstChoiceId:opt.id,attempts:1}
      assert.equal(checkExercise(e,a).correct,opt.id===p.correctOptionId,e.id);assertions++
    }}
  }
  if(e.type==='architecture-builder'){
    const a=referenceAnswer(e)
    for(let i=0;i<a.graph.edges.length;i++){
      const b=structuredClone(a);[b.graph.edges[i].source,b.graph.edges[i].target]=[b.graph.edges[i].target,b.graph.edges[i].source]
      // Opposite edges are an error; a two-node wait cycle can produce a duplicate but must still fail.
      if(new Set(b.graph.edges.map(x=>`${x.source}:${x.target}`)).size!==b.graph.edges.length)assert.throws(()=>checkExercise(e,b))
      else assert(!checkExercise(e,b).correct,e.id)
      assertions++
    }
  }
}
assert.equal(entries.length,97)
assert.equal(modules.size,16)
assert.equal(Object.keys(types).length,7)
for(const [id,count]of modules)assert(count>=5,id)
const result={exercises:entries.length,modules:modules.size,assertions,types,passed:true}
fs.writeFileSync('artifacts/sql-revised-exercise-validation.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result,null,2))
