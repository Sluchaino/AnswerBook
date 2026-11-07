import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises,retryArchitecture,exerciseFingerprint} from '../src/lib/exercises.ts'
import {validateGraph,validateGraphAnswer,gradeGraph,graphEdgeKey,graphAssessmentKey,addGraphNode,moveGraphNode,removeGraphNode,addGraphEdge,removeGraphEdge,changeGraphEdge,undoGraph,replaceGraph,emptyGraph,freshGraphAnswer,graphNodeLabel} from '../src/lib/architectureGraphs.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,initializeExerciseStep,restoreLearningAttempt,learningScore,scoredLearningQuestions} from '../src/lib/learning.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'
const placements=JSON.parse(readFileSync(new URL('../server/exercise-source/csharp-foundations-v2.json',import.meta.url)))
const demos=placements.filter(p=>p.block.exercise.type==='architecture-builder'&&p.block.exercise.id.startsWith('csharp-graph-'))
const [oop,events,channel]=demos.map(p=>validateExercise(p.block.exercise))
const raw=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url)))
function solution(e,variant=0) {
 const v=e.validation.variants[variant],ids=new Map(v.nodes.map((n,i)=>[n.id,`instance-${i}`]))
 return {nodes:v.nodes.map((n,i)=>({...n,id:ids.get(n.id),x:(i%3)/2,y:Math.floor(i/3)/7})),edges:v.edges.map((edge,i)=>({...edge,id:`connection-${i}`,source:ids.get(edge.source),target:ids.get(edge.target)}))}
}
function answer(e,graph=solution(e)){return {...freshGraphAnswer(),graph}}
const edgeCondition=r=>r.conditions.filter(c=>c.id.startsWith('edge-'))

test('three architecture exercises integrate at existing theory anchors without changing questions or trace examples',()=>{
 const course=validateDownloadedCourse(raw)
 const modules=structuredClone(raw.modules);for(const m of modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise')
 attachExercises(modules,demos);assert.throws(()=>attachExercises(modules,[demos[0]]))
 assert.deepEqual(demos.map(d=>[d.moduleId,d.lessonId,d.afterBlockId]),[['m08','m08-l07','theory-2'],['m12','m12-l06','theory-2'],['m17','m17-l10','theory-2']])
 for(const p of demos){assert.equal(course.lessons.filter(l=>l.exercise?.id===p.block.exercise.id).length,1);assert.ok(checkExercise(p.block.exercise,answer(p.block.exercise)).correct)}
 assert.equal(course.lessons.filter(l=>l.exercise).length,96);assert.equal(scoredLearningQuestions(course).length,1265)
 assert.equal(course.lessons.filter(l=>l.exercise?.type==='code-trace'&&l.exercise.id.startsWith('csharp-trace-')).length,3)
})
test('missing required components and relations are reported together, including an empty submission',()=>{
 const r=gradeGraph(channel,emptyGraph());assert.equal(r.correct,false)
 assert.equal(r.conditions.filter(c=>!c.passed&&c.id.startsWith('node-')).length,3)
 assert.equal(edgeCondition(r).filter(c=>!c.passed).length,2)
 const graph=solution(channel);graph.nodes.pop();graph.edges.pop();assert.equal(gradeGraph(channel,graph).correct,false)
})
test('extra forbidden components, extra connections, wrong direction and wrong relation fail with precise IDs',()=>{
 let g=solution(channel);g.nodes.push({id:'db',componentId:'database',x:0,y:1});let r=gradeGraph(channel,g);assert.ok(r.incorrectIds.includes('db'))
 g=solution(channel);g.edges[0]={...g.edges[0],source:g.edges[0].target,target:g.edges[0].source};r=gradeGraph(channel,g);assert.ok(r.incorrectIds.includes('connection-0'));assert.equal(edgeCondition(r)[0].passed,false)
 g=solution(channel);g.edges[0].relationId='reads-from';assert.equal(gradeGraph(channel,g).correct,false)
 g=solution(channel);g.edges.push({id:'extra',source:g.nodes[0].id,target:g.nodes[2].id,relationId:'writes-to',directed:true});assert.ok(gradeGraph(channel,g).incorrectIds.includes('extra'))
})
test('coordinates, node/edge order and user instance IDs never determine correctness',()=>{
 const g=solution(oop),before=structuredClone(g);const changed={nodes:g.nodes.map((n,i)=>({...n,x:1-n.x,y:(i%2)})).reverse(),edges:[...g.edges].reverse()}
 assert.equal(gradeGraph(oop,g).correct,true);assert.equal(gradeGraph(oop,changed).correct,true);assert.deepEqual(g,before);assert.equal(graphAssessmentKey(answer(oop,g)),graphAssessmentKey(answer(oop,changed)))
})
test('several accepted variants are checked independently rather than merged',()=>{
 const e=structuredClone(channel),other=structuredClone(e.validation.variants[0]);other.id='alternative';other.edges[1].relationId='writes-to';e.validation.variants.push(other);validateExercise(e)
 assert.ok(gradeGraph(e,solution(e,0)).correct);assert.ok(gradeGraph(e,solution(e,1)).correct)
 const g=solution(e,1);g.edges[0].relationId='reads-from';assert.equal(gradeGraph(e,g).correct,false)
})
test('same component type supports interchangeable subscriber instances with different IDs',()=>{
 const g=solution(events),sub=g.nodes.filter(n=>n.componentId==='subscriber').map(n=>n.id)
 assert.equal(sub.length,2);assert.ok(gradeGraph(events,g).correct)
 g.edges=g.edges.map(e=>({...e,source:e.source===sub[0]?sub[1]:e.source===sub[1]?sub[0]:e.source,target:e.target===sub[0]?sub[1]:e.target===sub[1]?sub[0]:e.target}))
 assert.ok(gradeGraph(events,g).correct)
 const partial=solution(events);partial.edges.pop();assert.equal(gradeGraph(events,partial).correct,false)
})
test('explicit roles distinguish otherwise identical instances',()=>{
 const e=structuredClone(events),c=e.content.components.find(c=>c.id==='subscriber');c.roles=[{id:'audit',label:'Аудит'},{id:'ui',label:'Экран'}]
 const nodes=e.validation.variants[0].nodes.filter(n=>n.componentId==='subscriber');nodes[0].role='audit';nodes[1].role='ui'
 // Only the audit subscriber is notified in this exercise; both still subscribe.
 e.validation.variants[0].edges=e.validation.variants[0].edges.filter(edge=>edge.id!=='notify-b');validateExercise(e)
 const g=solution(e);assert.ok(gradeGraph(e,g).correct)
 const audit=g.nodes.find(n=>n.role==='audit'),ui=g.nodes.find(n=>n.role==='ui');[audit.role,ui.role]=[ui.role,audit.role]
 assert.equal(gradeGraph(e,g).correct,false)
 assert.throws(()=>validateGraph(e,{...g,nodes:g.nodes.map(n=>n.id===audit.id?{...n,role:ui.role}:n)}))
})
test('allowed extra components and connections are explicit, forbidden patterns still win',()=>{
 const e=structuredClone(channel);e.validation.forbiddenComponents=[];const v=e.validation.variants[0]
 v.extraComponents=['logger'];v.extraEdges=[{sourceComponentId:'consumer',targetComponentId:'logger',relationId:'writes-to',directed:true}];validateExercise(e)
 const g=solution(e);g.nodes.push({id:'log',componentId:'logger',x:.5,y:1});g.edges.push({id:'log-edge',source:g.nodes[2].id,target:'log',relationId:'writes-to',directed:true});assert.ok(gradeGraph(e,g).correct)
 e.validation.forbiddenEdges=[{sourceComponentId:'consumer',targetComponentId:'producer',relationId:'writes-to',directed:true}];validateExercise(e)
 g.edges.push({id:'forbidden',source:g.nodes[2].id,target:g.nodes[0].id,relationId:'writes-to',directed:true});assert.ok(gradeGraph(e,g).incorrectIds.includes('forbidden'))
})
test('undirected untyped connections commute, typed parallel connections remain distinct',()=>{
 const e=structuredClone(channel);e.content.untyped={label:'Связь',directed:false};e.content.components.forEach(c=>c.allowedRelations.push('untyped'))
 delete e.validation.variants[0].edges[0].relationId;e.validation.variants[0].edges[0].directed=false;validateExercise(e)
 const g=solution(e);const first=g.edges[0],key=graphEdgeKey(first);[first.source,first.target]=[first.target,first.source];assert.equal(graphEdgeKey(first),key);assert.ok(gradeGraph(e,g).correct)
 g.edges.push({...first,id:'duplicate'});assert.throws(()=>validateGraph(e,g))
 const eventGraph=solution(events);assert.equal(eventGraph.edges.filter(edge=>edge.source==='instance-0'&&edge.target==='instance-1').length,2);assert.ok(gradeGraph(events,eventGraph).correct)
})
test('graph editor operations add, move, delete cascading edges, undo and change relationship',()=>{
 let a=freshGraphAnswer();a=addGraphNode(channel,a,'producer');a=addGraphNode(channel,a,'channel');a=addGraphEdge(channel,a,{source:'node-1',target:'node-2',relationId:'writes-to',directed:true})
 const before=structuredClone(a);a=moveGraphNode(channel,a,'node-1',9,-2);assert.deepEqual([a.graph.nodes[0].x,a.graph.nodes[0].y],[1,0]);assert.deepEqual(before.graph.nodes[0].x,0)
 a=changeGraphEdge(channel,a,'edge-1','reads-from');assert.equal(a.graph.edges[0].relationId,'reads-from')
 a=undoGraph(channel,a);assert.equal(a.graph.edges[0].relationId,'writes-to')
 const original=structuredClone(a.graph);a=removeGraphNode(channel,a,'node-2');assert.equal(a.graph.edges.length,0);assert.equal(a.graph.nodes.length,1)
 a=undoGraph(channel,a);assert.deepEqual(a.graph,original)
 a=removeGraphEdge(channel,a,'edge-1');assert.equal(a.graph.nodes.length,2);assert.equal(a.graph.edges.length,0)
 a=undoGraph(channel,a);a=replaceGraph(channel,a,emptyGraph());assert.deepEqual(a.graph,emptyGraph());a=undoGraph(channel,a);assert.deepEqual(a.graph,original)
})
test('history is bounded, saved and undone after reload; reset retains attempts and previous success',()=>{
 let a=answer(channel);for(let i=0;i<25;i++)a=moveGraphNode(channel,a,a.graph.nodes[0].id,(i%2)*.5,.4)
 assert.equal(a.undo.length,10);validateGraphAnswer(channel,JSON.parse(JSON.stringify(a)))
 let s=submitExercise(channel,editExercise(channel,freshExercise(channel),a));assert.equal(s.attempts,1);assert.ok(s.solvedAnswer)
 const stored=restoreExercises(JSON.parse(JSON.stringify({[channel.id]:s})),[channel])[channel.id];assert.deepEqual(stored,s)
 const reset=resetExercise(channel,s);assert.deepEqual(reset.answer.graph,emptyGraph());assert.deepEqual(reset.answer.undo,[]);assert.equal(reset.attempts,1);assert.ok(reset.solvedAnswer)
})
test('movement preserves last check and cannot farm successful checks; semantic edits clear current result',()=>{
 let s=submitExercise(channel,editExercise(channel,freshExercise(channel),answer(channel)));assert.equal(submitExercise(channel,s),s)
 s=editExercise(channel,s,moveGraphNode(channel,s.answer,'instance-0',.8,.8));assert.ok(s.checkedAnswer);assert.equal(s.attempts,1)
 assert.equal(submitExercise(channel,s),s);assert.deepEqual(restoreExercises({[channel.id]:s},[channel])[channel.id],s)
 s=editExercise(channel,s,removeGraphEdge(channel,s.answer,'connection-0'));assert.equal(s.checkedAnswer,undefined);assert.ok(s.solvedAnswer)
 s=submitExercise(channel,s);assert.equal(s.attempts,2);assert.equal(checkExercise(channel,s.checkedAnswer).correct,false)
})
test('assessment closure persists, retry reopens attempt, semantic edits hide the solution again',()=>{
 let s=submitExercise(events,editExercise(events,freshExercise(events),answer(events)))
 assert.equal(s.answer.closed,false);s=editExercise(events,s,{...s.answer,closed:true});assert.ok(s.checkedAnswer)
 assert.equal(restoreExercises({[events.id]:s},[events])[events.id].answer.closed,true)
 const changed=editExercise(events,s,removeGraphEdge(events,s.answer,'connection-0'));assert.equal(changed.answer.closed,false);assert.equal(changed.checkedAnswer,undefined)
 s=retryArchitecture(s);assert.equal(s.answer.closed,false);assert.equal(s.checkedAnswer,undefined);assert.equal(s.attempts,1)
 assert.throws(()=>restoreExercises({[events.id]:{...s,answer:{...s.answer,closed:true}}},[events]))
})
test('version and source changes invalidate only affected graph states',()=>{
 const s=submitExercise(channel,editExercise(channel,freshExercise(channel),answer(channel))),other=freshExercise(oop),e=structuredClone(channel)
 e.version++;assert.notEqual(exerciseFingerprint(channel),exerciseFingerprint(e));assert.deepEqual(restoreExercises({[channel.id]:s,[oop.id]:other},[e,oop]),{[oop.id]:other})
 assert.ok(exerciseFingerprint(channel).length<100);assert.equal(JSON.stringify(s).includes('forbiddenComponents'),false)
})
test('strict graph answers reject invalid endpoints, relation IDs, duplicates, coordinates, instance counts and unknown fields',()=>{
 for(const mutate of [g=>g.nodes[0].id='__proto__',g=>g.nodes[1].id=g.nodes[0].id,g=>g.nodes[0].componentId='missing',g=>g.nodes[0].x=NaN,g=>g.nodes[0].y=1.1,g=>g.edges[0].source='missing',g=>g.edges[0].relationId='missing',g=>g.edges[0].directed=false,g=>g.edges[0].id='constructor',g=>g.edges.push({...g.edges[0],id:'dup'}),g=>g.edges[1].id=g.edges[0].id,g=>g.nodes.push({...g.nodes[0],id:'dup'}),g=>g.nodes[0].html='<img>',g=>g.edges[0].source=g.edges[0].target]){const g=solution(channel);mutate(g);assert.throws(()=>validateGraph(channel,g))}
 const a=answer(channel);a.undo=Array(11).fill(emptyGraph());assert.throws(()=>validateGraphAnswer(channel,a))
 a.undo=[];a.closed='yes';assert.throws(()=>validateGraphAnswer(channel,a))
})
test('strict authored schema validates references, bounds, duplicate definitions and conflicting rules',()=>{
 const mutations=[e=>e.content.components[0].id='missing id',e=>e.content.components[1].id=e.content.components[0].id,e=>e.content.components[0].maxInstances=0,e=>e.content.components[0].maxInstances=21,e=>e.content.components[0].allowedRelations=['missing'],e=>e.content.components[0].label='x'.repeat(81),e=>e.content.relations[0].directed='yes',e=>e.content.relations[1].id=e.content.relations[0].id,e=>e.content.allowSelfEdges='yes',e=>e.validation.variants=[],e=>e.validation.variants=Array(11).fill(e.validation.variants[0]),e=>e.validation.variants[0].nodes[0].componentId='missing',e=>e.validation.variants[0].nodes[0].role='missing',e=>e.validation.variants[0].edges[0].target='missing',e=>e.validation.variants[0].edges[0].relationId='missing',e=>e.validation.forbiddenComponents.push('producer'),e=>e.validation.forbiddenEdges=[{sourceComponentId:'producer',targetComponentId:'channel',relationId:'writes-to',directed:true}],e=>e.validation.variants[0].extraComponents=['database'],e=>e.validation.variants[0].extraEdges=[{sourceComponentId:'producer',targetComponentId:'channel',relationId:'script',directed:true}],e=>e.validation.variants[0].extraEdges=[{sourceComponentId:'producer',targetComponentId:'database',relationId:'writes-to',directed:true}],e=>e.validation.feedbackMode='unknown',e=>e.content.execute='alert(1)']
 for(const mutate of mutations){const e=structuredClone(channel);mutate(e);assert.throws(()=>validateExercise(e))}
 const e=structuredClone(channel);e.validation.variants[0].extraEdges=[{sourceComponentId:'consumer',targetComponentId:'channel',relationId:'writes-to',directed:true}];e.validation.forbiddenEdges=structuredClone(e.validation.variants[0].extraEdges);assert.throws(()=>validateExercise(e))
})
test('maximum graph sizes and permutation work are rejected before expensive search',()=>{
 let e=structuredClone(events);e.content.components.find(c=>c.id==='subscriber').maxInstances=20
 e.validation.variants[0].nodes.push({id:'sub-c',componentId:'subscriber'},{id:'sub-d',componentId:'subscriber'});assert.throws(()=>validateExercise(e),/перестановок/)
 e=structuredClone(channel);e.content.components[0].maxInstances=20
 const g=solution(e);g.nodes=Array.from({length:21},(_,i)=>({id:`n-${i}`,componentId:'producer',x:0,y:0}));g.edges=[];assert.throws(()=>validateGraph(e,g))
 g.nodes=[];g.edges=Array(41).fill({});assert.throws(()=>validateGraph(e,g))
})
test('self connections require explicit opt-in; graph semantics are language independent',()=>{
 const e=structuredClone(channel);e.content.allowSelfEdges=true;e.validation.variants[0].edges.push({id:'self',source:'producer',target:'producer',relationId:'writes-to',directed:true});validateExercise(e);assert.ok(gradeGraph(e,solution(e)).correct)
 e.content.components[0].label='HTTP Client';e.content.components[1].label='API';e.content.components[2].label='Worker';validateExercise(e);assert.ok(gradeGraph(e,solution(e)).correct)
})
test('saved course graph reopens with positions, connections, check and unchanged graded score',()=>{
 const course=validateDownloadedCourse(raw),step=course.lessons.find(l=>l.exercise?.id===channel.id)
 let a=initializeExerciseStep(course,{...freshLearningAttempt(course),lessonId:step.id,view:'practice'}),score=learningScore(course,a)
 a.exercises[channel.id]=submitExercise(channel,editExercise(channel,a.exercises[channel.id],answer(channel)))
 const loaded=restoreLearningAttempt(JSON.stringify(a),course);assert.deepEqual(loaded.exercises,a.exercises);assert.equal(loaded.lessonId,step.id);assert.deepEqual(learningScore(course,loaded),score)
})
test('safe text and keyboard/touch alternatives use existing accessible components',()=>{
 const e=structuredClone(channel);e.content.components[0].label='<img src=x onerror=alert(1)>';validateExercise(e);assert.equal(graphNodeLabel(e,{id:'x',componentId:'producer'}),e.content.components[0].label)
 const ui=readFileSync(new URL('../src/exercises/ArchitectureInput.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(ui,/dangerouslySetInnerHTML|new Function|\beval\s*\(/);assert.match(ui,/label="Откуда"/);assert.match(ui,/label="Куда"/);assert.match(ui,/Создать связь/);assert.match(ui,/onKeyDown/);assert.match(ui,/onPointerMove/);assert.match(ui,/detailed\?/)
})
