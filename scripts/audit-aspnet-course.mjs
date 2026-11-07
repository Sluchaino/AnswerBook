import fs from 'node:fs'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {validateExercise,checkExercise} from '../src/lib/exercises.ts'
import {referenceAnswer,wrongAnswer} from '../tests/fixtures/exercise-solutions.mjs'

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const raw=read('server/course-source/aspnet-core-foundations-v2.json')
validateDownloadedCourse(raw)
const placements=read('server/exercise-source/aspnet-core-foundations-v2.json')
const questions=[],exercises=[],modules=[],issues=[],lessons=[],types={}
for(const m of raw.modules){
 const moduleQuestions=[],moduleExercises=[]
 for(const l of m.lessons){
  const inline=l.blocks.filter(b=>b.kind==='test').flatMap(b=>b.questions)
  const final=l.finalTest.questions
  const es=l.blocks.filter(b=>b.kind==='exercise').map(b=>b.exercise)
  const parts=l.blocks.filter(b=>b.kind==='theory').flatMap(b=>b.content)
  const words=parts.filter(p=>p.kind==='paragraph').map(p=>p.text).join(' ').split(/\s+/).filter(Boolean).length
  lessons.push({module:m.id,id:l.id,title:l.title,words,codeBlocks:parts.filter(p=>p.kind==='code').length,inline:inline.length,final:final.length,exercises:es.length,blockKinds:l.blocks.map(b=>b.kind)})
  if(inline.length!==2||final.length!==5||es.length>1)issues.push({lesson:l.id,inline:inline.length,final:final.length,exercises:es.length})
  moduleQuestions.push(...[...inline,...final].map(q=>({...q,module:m.id,lesson:l.id})))
  moduleExercises.push(...es)
 }
 moduleQuestions.push(...m.exam.questions.map(q=>({...q,module:m.id,lesson:'exam'})))
 for(const e of moduleExercises){
  validateExercise(e)
  if(!checkExercise(e,referenceAnswer(e)).correct)issues.push({exercise:e.id,error:'Reference answer rejected'})
  if(checkExercise(e,wrongAnswer(e)).correct)issues.push({exercise:e.id,error:'Known wrong answer accepted'})
  types[e.type]=(types[e.type]??0)+1
  const placement=placements.find(p=>p.block.exercise.id===e.id)
  if(!placement||JSON.stringify(placement.block.exercise)!==JSON.stringify(e))issues.push({exercise:e.id,error:'Placement source differs'})
 }
 if(moduleExercises.length<5)issues.push({module:m.id,error:'Fewer than five exercises'})
 modules.push({id:m.id,title:m.title,lessons:m.lessons.length,questions:moduleQuestions.length,exam:m.exam.questions.length,exercises:moduleExercises.length,types:moduleExercises.map(e=>e.type)})
 questions.push(...moduleQuestions);exercises.push(...moduleExercises)
}
for(const q of questions){
 if(q.kind==='choice'){
  if(q.options.length!==4)issues.push({question:q.id,error:'Not four choices'})
  // Case is semantic in code and JSON names (ProductName versus productName).
  if(new Set(q.options.map(s=>s.trim())).size!==q.options.length)issues.push({question:q.id,error:'Duplicate choices'})
 }
}
function groups(values,key){const map=new Map();for(const x of values){const k=key(x);map.set(k,[...(map.get(k)??[]),x.id])}return [...map].filter(([,ids])=>ids.length>1).map(([text,ids])=>({text,ids})).sort((a,b)=>b.ids.length-a.ids.length)}
const repeatedPrompts=groups(questions,q=>q.prompt.trim().toLowerCase().replaceAll('ё','е'))
const repeatedExplanations=groups(questions,q=>(q.explanation??'').trim()).filter(x=>x.text)
const totals={modules:modules.length,lessons:lessons.length,questions:questions.length,exercises:exercises.length,types,codeBlocks:lessons.reduce((n,l)=>n+l.codeBlocks,0)}
const result={courseId:raw.id,version:raw.version,totals,issues,modules,lessons,repeatedPrompts,repeatedExplanations}
fs.writeFileSync('artifacts/aspnet-course-audit.json',JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(totals));console.log('Structural/engine issues:',JSON.stringify(issues))
console.log('Shortest lessons:',JSON.stringify([...lessons].sort((a,b)=>a.words-b.words).slice(0,10)))
console.log('Most repeated explanations:',JSON.stringify(repeatedExplanations.slice(0,6)))
console.log('Repeated prompts:',repeatedPrompts.length,JSON.stringify(repeatedPrompts.slice(0,8)))
