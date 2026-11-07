import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {privacyAcknowledged,privacyAcknowledgement} from '../src/lib/privacy.ts'
const version=JSON.parse(readFileSync(new URL('../src/data/privacy-policy.json',import.meta.url))).version
test('reading, malformed records and prior versions never count as acknowledgement',()=>{
 for(const raw of [null,'bad','{}','null','[]',JSON.stringify({policyVersion:version,acknowledged:true}),JSON.stringify({...privacyAcknowledgement(version),acknowledged:false}),JSON.stringify(privacyAcknowledgement('previous')),JSON.stringify({...privacyAcknowledgement(version),disclaimerVersion:'previous'}),JSON.stringify({...privacyAcknowledgement(version),acceptedAt:'invalid'})])assert.equal(privacyAcknowledged(raw,version),false)
})
test('explicit acknowledgement persists the exact document version and time',()=>{
 const record=privacyAcknowledgement(version,'2026-11-05T19:00:00.000Z')
 assert.equal(record.acceptedAt,'2026-11-05T19:00:00.000Z')
 assert.equal(privacyAcknowledged(JSON.stringify(record),version),true)
 assert.equal(privacyAcknowledged(JSON.stringify(record),'new-version'),false)
 assert.throws(()=>privacyAcknowledgement(version,'invalid'))
})
