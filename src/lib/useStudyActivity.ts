import {createTransactionQueue} from './transactionQueue'
import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyActivity, parseActivity, recordStudyEvent, reconcileFreezes,localStudyDay,studyStreak } from './activity'
import type { StudyActivity,StudyEventInput } from './activity'
import { freshEconomy,buyCourse,rewardStudy,rewardCompletions,buyFreeze } from './economy'
import type { CourseFact } from './economy'
import { learningCourses } from './learningContent'
import { restoreLearningAttempt,learningProgress } from './learning'
import { activityKey, readStored, writeStored,subscribeStorage,learningStorageKey } from './storage'

const factCache=new Map<string,{raw:string|null;fact:CourseFact}>()
function courseFacts():CourseFact[] {
  return learningCourses.map(course=>{
    const raw=readStored(learningStorageKey(course.id)),cached=factCache.get(course.id)
    if(cached?.raw===raw)return cached.fact
    let fact:CourseFact={id:course.id,title:course.title,started:false,completed:false}
    try {const attempt=restoreLearningAttempt(raw,course,course.previous);fact={id:course.id,title:course.title,started:learningProgress(course,attempt).started,completed:!!attempt.lastResult || attempt.finished}}catch { /* Corrupt course saves grant neither currency nor access. */ }
    factCache.set(course.id,{raw,fact});return fact
  })
}
export function useStudyActivity() {
  const [load]=useState(()=>{try{
    const activity=parseActivity(readStored(activityKey))
    return {activity:{...activity,economy:activity.economy??freshEconomy(courseFacts(),localStudyDay())},failed:false}
  }catch{return {activity:emptyActivity(),failed:true}}})
  const [activity,setActivity]=useState<StudyActivity>(load.activity)
  const [transactions]=useState(()=>createTransactionQueue<StudyActivity>(load.activity,async next=>{
    try {await writeStored(activityKey,JSON.stringify(next))}
    catch {throw new Error('Не удалось сохранить монеты и прогресс на устройстве. Повторите действие.')}
  },setActivity))
  const pending=useRef(0)
  const [busy,setBusy]=useState(false)
  const [saveError,setSaveError]=useState('')
  // A single persisted document makes purchases, balance and freeze inventory atomic.
  const transact=useCallback((transform:(value:StudyActivity)=>StudyActivity)=>{
    pending.current++;setBusy(true)
    const task=transactions.run(value=>{
      if(load.failed)throw new Error('Не удалось прочитать сохранения. Покупки и награды заблокированы.')
      return transform(value)
    }).then(()=>setSaveError(''))
    return task.catch(error=>{setSaveError(error instanceof Error ? error.message : 'Не удалось сохранить изменения.');throw error}).finally(()=>{pending.current--;if(!pending.current)setBusy(false)})
  },[load.failed,transactions])
  const recordStudy=useCallback((event?:StudyEventInput)=>{
    void transact(value=>{
      const now=new Date(),next=recordStudyEvent(value,event,now)
      const economy=rewardStudy(next.economy!,localStudyDay(now),studyStreak(next,now).current)
      return next===value && economy===next.economy ? value : {...next,economy}
    }).catch(()=>{})
  },[transact])
  useEffect(()=>{
    if(load.failed)return
    // Persist migration before accepting subsequent purchases or granting rewards.
    void transact(value=>({...value})).catch(()=>{})
    const refresh=()=>{
      void transact(value=>{
        const next=reconcileFreezes(value),economy=rewardCompletions(next.economy!,courseFacts(),localStudyDay())
        return economy===next.economy ? next : {...next,economy}
      }).catch(()=>{})
    }
    refresh()
    const timer=window.setInterval(refresh,60000)
    document.addEventListener('visibilitychange',refresh)
    const unsubscribe=subscribeStorage(refresh)
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);unsubscribe()}
  },[load.failed,transact])
  const purchaseCourse=useCallback((id:string,quotedPrice:number)=>transact(value=>{
    const course=learningCourses.find(course=>course.id===id)
    if(!course)throw new Error('Курс не найден.')
    const economy=buyCourse(value.economy!,id,localStudyDay(),quotedPrice,course.title)
    return economy===value.economy ? value : {...value,economy}
  }),[transact])
  const purchaseFreeze=useCallback(()=>transact(value=>{
    const next=reconcileFreezes(value),tokens=next.freezeTokens??1
    const bought=buyFreeze(next.economy!,tokens,localStudyDay(),`freeze:${crypto.randomUUID()}`)
    return {...next,economy:bought.economy,freezeTokens:bought.tokens}
  }),[transact])
  const retrySave=useCallback(()=>transact(value=>({...value})),[transact])
  return {activity,recordStudy,purchaseCourse,purchaseFreeze,retrySave,busy,activityError:load.failed ? 'Не удалось прочитать историю занятий и монеты. Прежние данные сохранены.' : saveError}
}
