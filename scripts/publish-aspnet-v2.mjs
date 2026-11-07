import fs from 'node:fs'
import {validateExercise} from '../src/lib/exercises.ts'
const moduleId=process.argv.includes('--module')?process.argv[process.argv.indexOf('--module')+1]:'m01'
if(!/^m\d{2}$/.test(moduleId))throw Error('Неверный модуль')
const id='aspnet-core-foundations-v2',file=process.argv.includes('--source')?process.argv[process.argv.indexOf('--source')+1]:`server/exercise-source/${id}.json`,placements=JSON.parse(fs.readFileSync(file)).filter(p=>p.moduleId===moduleId)
if(placements.length!==5||new Set(placements.map(p=>p.lessonId)).size!==5)throw Error('Нужно пять заданий в пяти разных уроках')
for(const p of placements){validateExercise(p.block.exercise);if(!p.block.exercise.id.startsWith(`aspnet-v2-${moduleId}-`))throw Error('Чужое упражнение')}
const token=fs.readFileSync('.tools/authoring-token.txt','utf8').trim()
async function request(body){const r=await fetch('http://127.0.0.1:5129/api/authoring',{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value}
let state=await request();const missing=placements.filter(p=>!state.entries.some(e=>e.courseId===id&&(e.published?.block.exercise.id??e.draft?.exercise.id)===p.block.exercise.id))
if(missing.length){await request({action:'import',courseId:id,revision:state.revision,value:missing});state=await request()}
for(const p of placements){const entry=state.entries.find(e=>e.courseId===id&&(e.published?.block.exercise.id??e.draft?.exercise.id)===p.block.exercise.id);if(entry?.published){if(JSON.stringify(entry.published)!==JSON.stringify(p))throw Error('Другой опубликованный вариант');continue}await request({action:'publish',courseId:id,revision:state.revision,id:p.block.exercise.id});state=await request()}
console.log('Published exercises:',placements.length,'course version:',state.courses.find(c=>c.id===id).version)
