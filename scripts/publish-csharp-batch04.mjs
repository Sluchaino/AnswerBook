// Use the existing authenticated authoring API; no direct source writes.
import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const file=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:'server/exercise-source/csharp-foundations-v2.json'
const placements=JSON.parse(fs.readFileSync(file,'utf8')).filter(p=>p.block.exercise.id.startsWith('csharp-b04-')),courseId='csharp-foundations-v2'
if(placements.length!==13)throw new Error('Ожидается только четвёртая партия из тринадцати заданий')
for(const p of placements){validateExercise(p.block.exercise);if(!p.block.exercise.id.startsWith('csharp-b04-')||!['m01','m03','m05','m06','m07','m10','m15','m18','m19'].includes(p.moduleId))throw new Error('Партия выходит за пределы девяти разрешённых модулей')}
const token=fs.readFileSync('.tools/authoring-token.txt','utf8').trim(),url='http://127.0.0.1:5129/api/authoring'
async function request(body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(`${r.status}: ${data.error??data.detail??'Ошибка редактора'}`);return data}
let state=await request(),pending=[]
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
for(const p of placements){const entry=state.entries.find(e=>e.courseId===courseId&&(e.draft?.exercise.id??e.published?.block.exercise.id)===p.block.exercise.id);if(entry?.published){if(!same(entry.published,p))throw new Error('ID уже опубликован с другим содержимым: '+p.block.exercise.id)}else if(entry?.draft){const {moduleId,lessonId,afterBlockId}=p;if(!same(entry.draft.exercise,p.block.exercise)||!same(entry.draft.placement,{moduleId,lessonId,afterBlockId}))throw new Error('Есть другой черновик с ID '+p.block.exercise.id)}else pending.push(p)}
if(pending.length){await request({action:'import',revision:state.revision,courseId,value:pending});state=await request();console.log('Validated drafts imported:',pending.length)}
for(const p of placements){const entry=state.entries.find(e=>e.courseId===courseId&&e.published?.block.exercise.id===p.block.exercise.id);if(entry){console.log('Already published:',p.block.exercise.id);continue}await request({action:'publish',revision:state.revision,courseId,id:p.block.exercise.id});state=await request();console.log('Published:',p.block.exercise.id)}
fs.writeFileSync('artifacts/csharp-batch04-publication.json',JSON.stringify({courseVersion:state.courses.find(c=>c.id===courseId).version,exerciseCount:state.entries.filter(e=>e.courseId===courseId&&e.published).length,ids:placements.map(p=>p.block.exercise.id)},null,2)+'\n')
console.log('Publication verified:',state.courses.find(c=>c.id===courseId).version)
