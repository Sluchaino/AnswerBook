import test from 'node:test'
import assert from 'node:assert/strict'
import {parseActivity,recordStudyEvent,recordStudyDay,reconcileFreezes,studyStreak,weeklySummary} from '../src/lib/activity.ts'

test('one missed day is protected once, persists, and never counts as actual study',()=>{
  const now=new Date(2026,9,24,12)
  const old=parseActivity(JSON.stringify({version:1,days:['2026-10-21','2026-10-22']}))
  const frozen=reconcileFreezes(old,now)
  assert.deepEqual(frozen.frozenDays,['2026-10-23']);assert.equal(frozen.freezeTokens,0)
  assert.equal(reconcileFreezes(frozen,now),frozen)
  assert.deepEqual(parseActivity(JSON.stringify(frozen)),frozen)
  assert.equal(studyStreak(frozen,now).current,2)
  const studied=recordStudyEvent(frozen,{kind:'answer',id:'q'},now)
  assert.equal(studyStreak(studied,now).current,3)
  assert.equal(studyStreak(studied,now).best,3)
  assert.equal(weeklySummary(studied,now).days,3)
  assert.equal(weeklySummary(studied,now).frozen,1)
})
test('long gaps consume nothing, empty histories and zero tokens cannot restore a streak',()=>{
  const now=new Date(2026,9,24)
  for(const a of [{version:1,days:[]},{version:1,days:['2026-10-20'],freezeTokens:2},{version:1,days:['2026-10-22'],freezeTokens:0}])assert.equal(reconcileFreezes(a,now),a)
  const a=reconcileFreezes({version:1,days:['2026-10-21'],freezeTokens:2},now)
  assert.deepEqual(a.frozenDays,['2026-10-22','2026-10-23']);assert.equal(a.freezeTokens,0)
})
test('seven actual study days grant one token with a two-token cap; repeated activity grants none',()=>{
  let a={version:1,days:[],freezeTokens:0}
  for(let day=1;day<=7;day++)a=recordStudyDay(a,new Date(2026,9,day))
  assert.equal(a.freezeTokens,1)
  assert.equal(recordStudyDay(a,new Date(2026,9,7)),a)
  for(let day=8;day<=21;day++)a=recordStudyDay(a,new Date(2026,9,day))
  assert.equal(a.freezeTokens,2)
})
test('weekly events deduplicate per day and kind, compare the previous seven days and exclude future entries',()=>{
  const now=new Date(2026,9,24,23,59)
  let a={version:1,days:['2026-10-12','2026-10-17','2026-10-18','2026-10-25']}
  for(const kind of ['answer','block','review','course']) {
    a=recordStudyEvent(a,{kind,id:'same'},now)
    const again=recordStudyEvent(a,{kind,id:'same'},now)
    assert.equal(again,a)
  }
  const w=weeklySummary(a,now)
  assert.equal(w.start,'2026-10-18');assert.equal(w.days,2);assert.equal(w.previousDays,2);assert.equal(w.change,0)
  for(const key of ['answers','blocks','reviews','courses'])assert.equal(w[key],1)
  assert.deepEqual(parseActivity(JSON.stringify(a)),a)
})
test('freeze dates handle leap days and year boundaries; invalid saved data fails validation',()=>{
  for(const [last,now,missing] of [['2024-02-28',new Date(2024,2,1),'2024-02-29'],['2025-12-30',new Date(2026,0,1),'2025-12-31']]) {
    assert.deepEqual(reconcileFreezes({version:1,days:[last]},now).frozenDays,[missing])
  }
  for(const fields of [{freezeTokens:3},{freezeTokens:-1},{frozenDays:['2026-02-30']},{events:[{day:'2026-10-24',kind:'purchase',id:'x'}]}])assert.throws(()=>parseActivity(JSON.stringify({version:1,days:[],...fields})))
})
