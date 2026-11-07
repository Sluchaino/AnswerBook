import {retiredCourseSet} from './retiredCourses.ts'
export type CourseFact={id:string;title?:string;started:boolean;completed:boolean;rewardEligible?:boolean}
export type CoinTransaction={id:string;day:string;label:string;amount:number}
export type Economy={version:1;balance:number;unlockedIds:string[];purchasedIds:string[];completedIds:string[];rewardedDays:string[];history:CoinTransaction[]}
export const dailyRewards=[5,6,7,8,9,10,25] as const
export const freezePrice=30
export const completionReward=100
export const courseRewardPercent=80
export function parseEconomy(input:unknown):Economy {
  const e=input as Economy
  if(!e || e.version!==1 || !Number.isSafeInteger(e.balance) || e.balance<0)throw new Error('Неверное сохранение монет')
  for(const key of ['unlockedIds','purchasedIds','completedIds','rewardedDays'] as const) {
    if(!Array.isArray(e[key]) || e[key].length>36600 || e[key].some(id=>typeof id!=='string'||!id||id.length>200) || new Set(e[key]).size!==e[key].length)throw new Error('Неверная история покупок или наград')
  }
  if(e.purchasedIds.some(id=>!e.unlockedIds.includes(id)) || e.completedIds.some(id=>!e.unlockedIds.includes(id)))throw new Error('Неверный доступ к курсам')
  if(e.rewardedDays.some(day=>!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day))throw new Error('Неверные даты наград')
  if(!Array.isArray(e.history)||e.history.length>100 || e.history.some(t=>!t||typeof t.id!=='string'||typeof t.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.day)||typeof t.label!=='string'||!Number.isSafeInteger(t.amount)))throw new Error('Неверная история монет')
  return {...e,unlockedIds:e.unlockedIds.filter(id=>!retiredCourseSet.has(id)),purchasedIds:e.purchasedIds.filter(id=>!retiredCourseSet.has(id)),completedIds:e.completedIds.filter(id=>!retiredCourseSet.has(id))}
}
export function freshEconomy(facts:CourseFact[],day:string):Economy {
  return {version:1,balance:100,unlockedIds:facts.filter(f=>f.started||f.completed).map(f=>f.id),purchasedIds:[],completedIds:facts.filter(f=>f.completed).map(f=>f.id),rewardedDays:[],history:[{id:'welcome',day,label:'Стартовый подарок',amount:100}]}
}
export function coinChange(e:Economy,id:string,day:string,label:string,amount:number):Economy {
  if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(e.balance+amount)||e.balance+amount<0)throw new Error('Недостаточно монет')
  return {...e,balance:e.balance+amount,history:[{id,day,label,amount},...e.history].slice(0,100)}
}
export function pendingPurchases(e:Economy) {return e.purchasedIds.filter(id=>!e.completedIds.includes(id)).length}
export function coursePrice(e:Economy) {return Math.min(200,100+25*pendingPurchases(e))}
export function buyCourse(e:Economy,id:string,day:string,quotedPrice=coursePrice(e),title?:string):Economy {
  if(e.unlockedIds.includes(id))return e
  if(quotedPrice!==coursePrice(e))throw new Error('Цена изменилась. Проверьте стоимость и повторите покупку.')
  const next=coinChange(e,`buy:${id}`,day,title ? `Покупка: ${title}` : 'Покупка курса',-coursePrice(e))
  return {...next,unlockedIds:[...e.unlockedIds,id],purchasedIds:[...e.purchasedIds,id]}
}
export function rewardStudy(e:Economy,day:string,streak:number):Economy {
  if(e.rewardedDays.includes(day))return e
  if(e.rewardedDays.some(previous=>previous>day))return e
  if(!Number.isInteger(streak)||streak<1)throw new Error('Неверная серия занятий')
  const amount=dailyRewards[(streak-1)%7]
  return {...coinChange(e,`study:${day}`,day,`Занятие · день серии ${streak}`,amount),rewardedDays:[...e.rewardedDays,day]}
}
export function rewardCompletions(e:Economy,facts:CourseFact[],day:string):Economy {
  let next=e
  for(const fact of facts) {
    if(fact.completed && fact.rewardEligible===true && next.unlockedIds.includes(fact.id) && !next.completedIds.includes(fact.id)) {
      next={...coinChange(next,`complete:${fact.id}`,day,fact.title ? `Курс пройден: ${fact.title}` : 'Первое завершение курса',completionReward),completedIds:[...next.completedIds,fact.id]}
    }
  }
  return next
}
export function buyFreeze(e:Economy,tokens:number,day:string,transactionId:string) {
  if(!Number.isInteger(tokens)||tokens<0||tokens>=2)throw new Error('Запас заморозок уже полон.')
  return {economy:coinChange(e,transactionId,day,'Покупка заморозки',-freezePrice),tokens:tokens+1}
}
