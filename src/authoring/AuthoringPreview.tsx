import {useEffect,useState} from 'react'
import {ExercisePlayer} from '../exercises/ExercisePlayer'
import {validateExercise,freshExercise} from '../lib/exercises'
import type {Exercise,ExerciseState} from '../lib/exercises'
// Standalone frame has its own viewport and no imports of progress/storage/activity.
export default function AuthoringPreview(){const [value,setValue]=useState<{exercise:Exercise;state:ExerciseState}>();useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==location.origin||event.data?.kind!=='answerbook-preview')return;try{const exercise=validateExercise(event.data.exercise);setValue({exercise,state:freshExercise(exercise)})}catch{setValue(undefined)}};window.addEventListener('message',receive);window.parent.postMessage({kind:'answerbook-preview-ready'},location.origin);return()=>window.removeEventListener('message',receive)},[]);return value?<ExercisePlayer exercise={value.exercise} state={value.state} onChange={state=>setValue({...value,state})} onSubmit={()=>{}}/>:<p>Ожидаем упражнение для изолированного предпросмотра…</p>}
