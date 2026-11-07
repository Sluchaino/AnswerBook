import fs from 'node:fs'
import {exerciseFingerprint} from '../src/lib/exercises.ts'
const token=fs.readFileSync('.tools/authoring-token.txt','utf8').trim(),url='http://127.0.0.1:5129/api/authoring',courseId='aspnet-core-foundations-v2'
async function request(body){const r=await fetch(url,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});const value=await r.json();if(!r.ok)throw Error(JSON.stringify(value));return value}
let state=await request();const p=state.entries.find(e=>e.courseId===courseId&&e.published?.block.exercise.id==='aspnet-v2-m08-automatic-modelstate').published,e=p.block.exercise
if(e.content.code.includes('[property:')){const exercise=structuredClone(e);exercise.content.code=exercise.content.code.replaceAll('[property:','[param:');await request({action:'save',courseId,revision:state.revision,exercise,placement:{moduleId:p.moduleId,lessonId:p.lessonId,afterBlockId:p.afterBlockId},baseFingerprint:exerciseFingerprint(e)});state=await request();await request({action:'publish',courseId,revision:state.revision,id:e.id})}
console.log('Record validation metadata repaired')
