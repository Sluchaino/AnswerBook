import test from 'node:test'
import assert from 'node:assert/strict'
import {advertisingChoice, advertisingRecord,advertisingMode,advertisingTextEntry} from '../src/lib/advertising.ts'

test('selecting answers never hides the banner; only editable text fields do',()=>{
 for(const type of ['radio','checkbox','button','submit','reset','range','file','color','hidden'])assert.equal(advertisingTextEntry({tagName:'INPUT',type}),false,type)
 for(const type of ['text','search','email','url','tel','password','number'])assert.equal(advertisingTextEntry({tagName:'INPUT',type}),true,type)
 assert.equal(advertisingTextEntry({tagName:'TEXTAREA'}),true)
 assert.equal(advertisingTextEntry({tagName:'DIV',isContentEditable:true}),true)
 assert.equal(advertisingTextEntry({tagName:'INPUT',type:'text',readOnly:true}),false)
 assert.equal(advertisingTextEntry({tagName:'TEXTAREA',disabled:true}),false)
 assert.equal(advertisingTextEntry({tagName:'BUTTON'}),false)
 assert.equal(advertisingTextEntry(null),false)
})

test('advertising requires a current explicit choice, independent of privacy acknowledgement', () => {
  for (const raw of [null, 'bad', '{}', 'null', JSON.stringify({acknowledged:true}), JSON.stringify({...advertisingRecord(true), version:'old'}), JSON.stringify({...advertisingRecord(true), changedAt:'bad'}), JSON.stringify({...advertisingRecord(true), enabled:'true'})]) {
    assert.equal(advertisingChoice(raw), null)
  }
})
test('advertising consent and refusal persist distinctly', () => {
  assert.equal(advertisingChoice(JSON.stringify(advertisingRecord(true))), true)
  assert.equal(advertisingChoice(JSON.stringify(advertisingRecord(false))), false)
})
test('banners start without a consent dialog and never enable personalized processing',()=>{
 assert.deepEqual(advertisingMode(),{enabled:true,personalized:false})
 for(const oldChoice of [true,false,null]) assert.deepEqual(advertisingMode(oldChoice,true),{enabled:true,personalized:false})
})
test('old advertising choices are requested again when their meaning changes',()=>{
 assert.equal(advertisingChoice(JSON.stringify({...advertisingRecord(false),version:'2026-11-05.1'})),null)
})
