import test from 'node:test'
import assert from 'node:assert/strict'
import {freshEconomy,parseEconomy,buyCourse,coursePrice,pendingPurchases,rewardStudy,rewardCompletions,coinChange,buyFreeze} from '../src/lib/economy.ts'
import {parseActivity,recordStudyEvent,reconcileFreezes,studyStreak} from '../src/lib/activity.ts'
import {createTransactionQueue} from '../src/lib/transactionQueue.ts'
const day='2026-10-24'

test('migration preserves started/finished courses, grants 100 once and never rewards old completions',()=>{
  const e=freshEconomy([{id:'started',started:true,completed:false},{id:'done',started:true,completed:true,rewardEligible:true},{id:'new',started:false,completed:false}],day)
  assert.equal(e.balance,100);assert.deepEqual(e.unlockedIds,['started','done']);assert.deepEqual(e.completedIds,['done'])
  assert.equal(rewardCompletions(e,[{id:'done',completed:true,rewardEligible:true}],day),e)
  assert.equal(coursePrice(e),100)
  assert.deepEqual(parseEconomy(e),e)
  const restored=parseActivity(JSON.stringify({version:1,days:[],economy:e}))
  // The retired economy is ignored when migrating current activity records.
  assert.equal(restored.economy,undefined)
})
test('buying is permanent, duplicate purchase is free, insufficient funds and stale quotes change nothing',()=>{
  const e=freshEconomy([],day),bought=buyCourse(e,'a',day,100)
  assert.equal(bought.balance,0);assert.equal(coursePrice(bought),125);assert.equal(buyCourse(bought,'a',day),bought)
  assert.throws(()=>buyCourse(bought,'b',day),/Недостаточно/)
  assert.throws(()=>buyCourse(e,'a',day,125),/Цена изменилась/)
  assert.equal(e.balance,100);assert.deepEqual(e.unlockedIds,[])
})
test('price counts only unfinished paid courses, caps at 200, and first completion pays 100 once',()=>{
  let e=coinChange(freshEconomy([],day),'seed',day,'test',2000)
  for(const id of ['a','b','c','d','e'])e=buyCourse(e,id,day)
  assert.equal(pendingPurchases(e),5);assert.equal(coursePrice(e),200)
  const before=e.balance
  e=rewardCompletions(e,[{id:'a',completed:true,rewardEligible:true},{id:'b',completed:true,rewardEligible:true}],day)
  assert.equal(e.balance,before+200);assert.equal(coursePrice(e),175)
  assert.equal(rewardCompletions(e,[{id:'a',completed:true,rewardEligible:true}],day),e)
  assert.equal(rewardCompletions(e,[{id:'locked',completed:true,rewardEligible:true}],day),e)
  for(let i=0;i<110;i++)e=coinChange(e,`test${i}`,day,'test',1)
  assert.equal(e.history.length,100)
  assert.equal(rewardCompletions(e,[{id:'a',completed:true,rewardEligible:true}],day),e)
  e=rewardCompletions(e,['c','d','e'].map(id=>({id,completed:true,rewardEligible:true})),day)
  assert.equal(coursePrice(e),100);assert.equal(e.unlockedIds.length,5)
})
test('study cycle grants 70 per seven actual streak days, never pays twice or on clock rollback',()=>{
  let e=freshEconomy([],day)
  for(let n=1;n<=14;n++) {
    const date=`2026-10-${String(n).padStart(2,'0')}`
    e=rewardStudy(e,date,n)
    assert.equal(rewardStudy(e,date,n),e)
  }
  assert.equal(e.balance,240)
  assert.equal(rewardStudy(e,'2026-09-30',1),e)
  assert.equal(rewardStudy(e,'2026-10-15',1).balance,245)
})
test('frozen dates bridge reward steps but do not themselves receive daily coins',()=>{
  let activity={version:1,days:['2026-10-17','2026-10-18','2026-10-19','2026-10-20','2026-10-21','2026-10-22'],freezeTokens:1,economy:freshEconomy([],day)}
  const now=new Date(2026,9,24,12)
  activity=reconcileFreezes(activity,now)
  assert.equal(activity.economy.balance,100)
  activity=recordStudyEvent(activity,{kind:'answer',id:'q'},now)
  activity.economy=rewardStudy(activity.economy,day,studyStreak(activity,now).current)
  assert.equal(activity.economy.balance,125)
  assert.equal(activity.economy.rewardedDays.length,1)
})
test('freeze purchases cost 30, stop at two and cannot spend an insufficient balance',()=>{
  const e=freshEconomy([],day),first=buyFreeze(e,1,day,'freeze1')
  assert.equal(first.tokens,2);assert.equal(first.economy.balance,70)
  assert.throws(()=>buyFreeze(first.economy,2,day,'freeze2'),/полон/)
  assert.throws(()=>buyFreeze({...e,balance:29},0,day,'freeze3'),/Недостаточно/)
  assert.equal(e.balance,100)
})
test('serialized purchases commit once; failed writes roll back balance and freeze stock and allow retry',async()=>{
  let fail=false,writes=0
  const initial={version:1,days:[],freezeTokens:1,economy:freshEconomy([],day)}
  const commits=[]
  const store=createTransactionQueue(initial,async()=>{writes++;if(fail)throw new Error('disk full')},next=>commits.push(next))
  const purchase=value=>({...value,economy:buyCourse(value.economy,'a',day)})
  await Promise.all([store.run(purchase),store.run(purchase)])
  assert.equal(store.current.economy.balance,0);assert.deepEqual(store.current.economy.purchasedIds,['a'])
  const other=createTransactionQueue(initial,async()=>{if(fail)throw new Error('disk full')},()=>{})
  const freeze=value=>{const next=buyFreeze(value.economy,value.freezeTokens,day,'freeze');return {...value,economy:next.economy,freezeTokens:next.tokens}}
  fail=true;await assert.rejects(other.run(freeze),/disk full/)
  assert.equal(other.current,initial)
  fail=false;await other.run(freeze)
  assert.equal(other.current.freezeTokens,2);assert.equal(other.current.economy.balance,70)
  assert.ok(writes>=1);assert.ok(commits.length>=1)
})
test('damaged balances, entitlement lists, dates and history are rejected instead of reset',()=>{
  const e=freshEconomy([],day)
  for(const invalid of [{balance:-1},{balance:1.5},{balance:Infinity},{purchasedIds:['a']},{completedIds:['a']},{rewardedDays:['2026-02-30']},{history:[{id:'x',day,label:'x',amount:0.5}]}])assert.throws(()=>parseEconomy({...e,...invalid}))
})
