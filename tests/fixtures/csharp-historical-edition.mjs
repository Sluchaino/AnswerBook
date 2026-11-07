// Reconstruct a prior published edition from its complete placement snapshot.
// Current-content tests separately compare every previous exercise byte-for-byte.
import {readFileSync} from 'node:fs'
import {attachExercises} from '../../scripts/lib/attach-exercises.mjs'
export function historicalCourse(beforeBatch,placements){
 const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'))
 const raw=read('../../server/course-source/csharp-foundations-v2.json')
 raw.version=read(`csharp-content-before-batch${beforeBatch}.json`).version
 raw.modules=raw.modules.map(m=>({...m,lessons:m.lessons.map(l=>({...l,blocks:l.blocks.filter(b=>b.kind!=='exercise')}))}))
 attachExercises(raw.modules,placements)
 return raw
}
