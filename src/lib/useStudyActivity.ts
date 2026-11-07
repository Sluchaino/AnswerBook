import {createTransactionQueue} from './transactionQueue'
import {useCallback,useEffect,useRef,useState} from 'react'
import {emptyActivity,parseActivity,recordStudyEvent,reconcileFreezes} from './activity'
import type {StudyActivity,StudyEventInput} from './activity'
import {activityKey,readStored,writeStored} from './storage'

export function useStudyActivity(){
  const [load]=useState(()=>{try{const activity=parseActivity(readStored(activityKey));delete activity.economy;return {activity,failed:false}}catch{return {activity:emptyActivity(),failed:true}}})
  const [activity,setActivity]=useState(load.activity)
  const [transactions]=useState(()=>createTransactionQueue<StudyActivity>(load.activity,async next=>{await writeStored(activityKey,JSON.stringify(next))},setActivity))
  const [activityError,setError]=useState(load.failed?'Не удалось прочитать историю занятий. Прежние данные сохранены.':'')
  const pending=useRef(false)
  const recordStudy=useCallback((event?:StudyEventInput)=>{
    if(load.failed)return
    void transactions.run(value=>recordStudyEvent(value,event)).then(()=>setError(''),()=>setError('Не удалось сохранить историю занятий.'))
  },[load.failed,transactions])
  useEffect(()=>{
    if(load.failed)return
    const refresh=()=>{if(pending.current)return;pending.current=true;void transactions.run(value=>({...reconcileFreezes(value)})).then(()=>setError(''),()=>setError('Не удалось сохранить историю занятий.')).finally(()=>{pending.current=false})}
    refresh();const timer=window.setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh)
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}
  },[load.failed,transactions])
  return {activity,recordStudy,activityError}
}
