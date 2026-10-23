export type StudyEventInput = {kind:'block'|'answer'|'review'|'course';id:string}
import {parseEconomy} from './economy.ts'
import type {Economy} from './economy'
export type StudyActivity = { version:1; days:string[]; frozenDays?:string[]; freezeTokens?:number; events?: (StudyEventInput & {day:string})[];economy?:Economy }
export const emptyActivity = ():StudyActivity => ({version:1,days:[]})
export function localStudyDay(now=new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
function ordinal(day:string) {
  const [year,month,date]=day.split('-').map(Number)
  return Date.UTC(year,month-1,date)/86400000
}
function validDay(day:unknown):day is string {
  if (typeof day!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  return new Date(ordinal(day)*86400000).toISOString().slice(0,10)===day
}
export function parseActivity(raw:string|null):StudyActivity {
  if (raw===null) return emptyActivity()
  const value=JSON.parse(raw) as StudyActivity
  if (!value || value.version!==1 || !Array.isArray(value.days) || value.days.length>36600 || !value.days.every(validDay)) throw new Error('Неверная история занятий')
  if(value.frozenDays!==undefined && (!Array.isArray(value.frozenDays) || value.frozenDays.length>36600 || !value.frozenDays.every(validDay)))throw new Error('Неверная история заморозок')
  if(value.freezeTokens!==undefined && (!Number.isInteger(value.freezeTokens) || value.freezeTokens<0 || value.freezeTokens>2))throw new Error('Неверный запас заморозок')
  if(value.events!==undefined && (!Array.isArray(value.events) || value.events.length>100000 || value.events.some(e=>!e || !validDay(e.day) || !['block','answer','review','course'].includes(e.kind) || typeof e.id!=='string' || !e.id || e.id.length>500)))throw new Error('Неверная статистика занятий')
  return {version:1,days:[...new Set(value.days)].sort(),...(value.frozenDays!==undefined ? {frozenDays:[...new Set(value.frozenDays)].filter(day=>!value.days.includes(day)).sort()} : {}),...(value.freezeTokens!==undefined ? {freezeTokens:value.freezeTokens} : {}),...(value.events!==undefined ? {events:value.events} : {}),...(value.economy!==undefined ? {economy:parseEconomy(value.economy)} : {})}
}
export function recordStudyDay(activity:StudyActivity,now=new Date()):StudyActivity {
  const day=localStudyDay(now)
  return activity.days.includes(day) ? activity : {...activity,days:[...activity.days,day].sort(),...((activity.days.length+1)%7===0 ? {freezeTokens:Math.min(2,(activity.freezeTokens??1)+1)} : {})}
}
export function studyStreak(activity:StudyActivity,now=new Date()) {
  const today=localStudyDay(now),todayNumber=ordinal(today)
  const days=[...new Set(activity.days)].filter(day=>ordinal(day)<=todayNumber).sort()
  const set=new Set(days.map(ordinal))
  const frozen=new Set((activity.frozenDays??[]).filter(day=>ordinal(day)<todayNumber && !set.has(ordinal(day))).map(ordinal))
  const protectedDays=[...new Set([...set,...frozen])].sort((a,b)=>a-b)
  let current=0,best=0,run=0,last=-Infinity
  for (const n of protectedDays) {run=n===last+1 ? run : 0;if(set.has(n))run++;best=Math.max(best,run);last=n}
  let cursor=set.has(todayNumber) ? todayNumber : todayNumber-1
  while(set.has(cursor)||frozen.has(cursor)) {if(set.has(cursor))current++;cursor--}
  const week=Array.from({length:7},(_,i)=>{const n=todayNumber-6+i;const day=new Date(n*86400000).toISOString().slice(0,10);return {day,active:set.has(n),frozen:frozen.has(n),today:n===todayNumber}})
  return {current,best,total:days.length,today:set.has(todayNumber),week}
}

// Only past gaps that can be fully covered consume tokens; a long absence wastes none.
export function reconcileFreezes(activity:StudyActivity,now=new Date()):StudyActivity {
  const today=ordinal(localStudyDay(now))
  const past=[...activity.days,...(activity.frozenDays??[])].map(ordinal).filter(n=>n<today)
  if(!past.length)return activity
  const last=Math.max(...past),gap=today-last-1,tokens=activity.freezeTokens??1
  if(gap<=0 || gap>tokens)return activity
  const added=Array.from({length:gap},(_,i)=>new Date((last+i+1)*86400000).toISOString().slice(0,10))
  return {...activity,freezeTokens:tokens-gap,frozenDays:[...(activity.frozenDays??[]),...added].sort()}
}
export function recordStudyEvent(activity:StudyActivity,event:StudyEventInput|undefined,now=new Date()):StudyActivity {
  const next=recordStudyDay(reconcileFreezes(activity,now),now),day=localStudyDay(now)
  if(!event || next.events?.some(e=>e.day===day && e.kind===event.kind && e.id===event.id))return next
  return {...next,events:[...(next.events??[]),{...event,day}].slice(-100000)}
}
export function weeklySummary(activity:StudyActivity,now=new Date()) {
  const end=ordinal(localStudyDay(now)),start=end-6
  const within=(day:string)=>ordinal(day)>=start && ordinal(day)<=end
  const active=activity.days.filter(within).length
  const previous=activity.days.filter(day=>ordinal(day)>=start-7 && ordinal(day)<start).length
  const events=(activity.events??[]).filter(e=>within(e.day))
  const total=(kind:StudyEventInput['kind'])=>events.filter(e=>e.kind===kind).length
  return {start:new Date(start*86400000).toISOString().slice(0,10),end:localStudyDay(now),days:active,previousDays:previous,change:active-previous,blocks:total('block'),answers:total('answer'),reviews:total('review'),courses:total('course'),frozen:(activity.frozenDays??[]).filter(within).length}
}
