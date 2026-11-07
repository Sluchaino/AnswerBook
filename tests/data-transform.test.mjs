import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runData,dataResult,gradeData,sameData,validateDataSteps,describeDataStep} from '../src/lib/dataTransforms.ts'
import {validateExercise,checkExercise,freshExercise,editExercise,submitExercise,resetExercise,restoreExercises} from '../src/lib/exercises.ts'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'
import {freshLearningAttempt,initializeExerciseStep,restoreLearningAttempt,learningScore,scoredLearningQuestions} from '../src/lib/learning.ts'
import {learningCourseOrder} from '../src/lib/courseStructure.ts'
import {attachExercises} from '../scripts/lib/attach-exercises.mjs'
const placements=JSON.parse(readFileSync(new URL('../server/exercise-source/csharp-foundations-v2.json',import.meta.url)))
const demos=placements.filter(p=>p.block.exercise.type==='data-transform'&&p.block.exercise.id.startsWith('csharp-data-'))
const [numbers,people,orders]=demos.map(p=>validateExercise(p.block.exercise))
const answer=steps=>({type:'data-transform',steps})
const run=(e,steps)=>dataResult(runData(e,steps).frame)
const filter=(field,operator,value)=>({type:'filter',operationId:'where',field,operator,value})
const sort=(field='$value',direction='asc')=>({type:'order-by',operationId:'sort',field,direction})
const count=mode=>({type:'count',operationId:'count',mode})
const group=field=>({type:'group-by',operationId:'group',field})
function fixture(source,schema,operations,target,solution,requiredOperations=[]) {
 return validateExercise({...structuredClone(numbers),content:{source,schema,operations,target,presentation:'generic'},validation:{order:'ordered',groupOrder:'ordered',maxSteps:12,requiredOperations,forbiddenOperations:[],solution}})
}

test('numeric filtering implements every comparison without mutating source or earlier frames',()=>{
 const before=structuredClone(numbers)
 const expected={'==':[5],'!=':[3,8,1,12,10],'>':[8,12,10],'>=':[8,12,5,10],'<':[3,1],'<=':[3,1,5]}
 for(const [operator,items] of Object.entries(expected))assert.deepEqual(run(numbers,[filter('$value',operator,5)]),{kind:'list',items})
 const first=runData(numbers,[filter('$value','>',5)])
 assert.deepEqual(run(numbers,numbers.validation.solution).items,[8,10,12])
 assert.deepEqual(first.steps[0].frame.items,[8,12,10]);assert.deepEqual(numbers,before)
 const result=runData(numbers,[]);result.frame.items[0]=999;assert.deepEqual(numbers,before)
})

test('string and boolean filters are strict; incompatible comparisons produce recoverable errors',()=>{
 const e=structuredClone(people)
 e.content.operations[0]={...e.content.operations[0],fields:['age','city','active'],values:[25,'25','Москва',true,false]}
 e.content.source=e.content.source.map((x,i)=>({...x,active:i%2===0}));e.content.schema.fields.active='boolean'
 validateExercise(e)
 assert.deepEqual(run(e,[filter('city','==','Москва')]).items.map(x=>x.name),['Анна','Виктор'])
 assert.deepEqual(run(e,[filter('active','!=',true)]).items.map(x=>x.name),['Борис','Дарья'])
 assert.match(runData(e,[filter('age','>','25')]).error,/Тип значения/)
 assert.match(runData(e,[filter('city','>','Москва')]).error,/только == и !=/)
 assert.match(runData(e,[filter('active','>',true)]).error,/только == и !=/)
})

test('sorting is numeric or ordinal UTF-16, case-sensitive and stable in both directions',()=>{
 assert.deepEqual(run(numbers,[sort()]).items,[1,3,5,8,10,12])
 assert.deepEqual(run(numbers,[sort('$value','desc')]).items,[12,10,8,5,3,1])
 const op=numbers.content.operations.find(o=>o.type==='order-by')
 const strings=['b','a','Б','A','Ё','Я']
 const e=fixture(strings,{kind:'scalar',valueType:'string'},[op],{kind:'list',items:['A','a','b','Ё','Б','Я']},[sort()])
 assert.deepEqual(run(e,[sort()]).items,['A','a','b','Ё','Б','Я'])
 assert.deepEqual(run(e,[sort('$value','desc')]).items,['Я','Б','Ё','b','a','A'])
})

test('ThenBy keeps primary keys and stable ties; rejects calls outside ordered context',()=>{
 const rows=[{team:'B',name:'a',id:1},{team:'A',name:'z',id:2},{team:'A',name:'a',id:3},{team:'A',name:'a',id:4}]
 const ops=[{id:'sort',title:'Order',type:'order-by',fields:['team'],directions:['asc','desc']},{id:'second',title:'Then',type:'then-by',fields:['name'],directions:['asc','desc']},{id:'where',title:'Filter',type:'filter',fields:['id'],operators:['>'],values:[0]}]
 const second={type:'then-by',operationId:'second',field:'name',direction:'asc'}
 const e=fixture(rows,{kind:'object',fields:{team:'string',name:'string',id:'number'}},ops,{kind:'list',items:[rows[2],rows[3],rows[1],rows[0]]},[sort('team'),second])
 assert.deepEqual(run(e,e.validation.solution).items.map(x=>x.id),[3,4,2,1])
 assert.match(runData(e,[second]).error,/непосредственно/)
 assert.match(runData(e,[sort('team'),filter('id','>',0),second]).error,/непосредственно/)
})

test('projection selects objects or scalar values and removed fields remain unavailable',()=>{
 const object={type:'select',operationId:'project',fields:['name','age'],mode:'object'}
 assert.deepEqual(run(people,[object]).items[0],{name:'Анна',age:22})
 const scalar={type:'select',operationId:'project',fields:['name'],mode:'scalar'}
 assert.deepEqual(run(people,[scalar]).items,['Анна','Борис','Виктор','Дарья'])
 assert.match(runData(people,[scalar,filter('age','>',25)]).error,/нет поля/)
 assert.match(runData(people,[{...object,fields:['name']},filter('age','>',25)]).error,/Поле отсутствует/)
 assert.throws(()=>validateDataSteps(people,[{...scalar,fields:['name','age']}]))
})

test('GroupBy keeps complete groups; Count counts a list, groups or entries within groups',()=>{
 const grouped=run(orders,[group('category')])
 assert.equal(grouped.kind,'groups');assert.deepEqual(grouped.groups.map(g=>[g.key,g.items.length]),[['Books',3],['Games',2]])
 assert.deepEqual(run(orders,[count('all')]),{kind:'count',value:5})
 assert.deepEqual(run(orders,[group('category'),count('all')]),{kind:'count',value:2})
 assert.deepEqual(run(orders,orders.validation.solution),orders.content.target)
 assert.match(runData(orders,[count('groups')]).error,/требует GroupBy/)
 assert.match(runData(orders,[count('all'),group('category')]).error,/ожидает список/)
})

test('empty collections retain their schema and missing fields fail even when no row is present',()=>{
 const e=fixture([],{kind:'object',fields:{category:'string'}},orders.content.operations,{kind:'list',items:[]},orders.validation.solution)
 assert.deepEqual(run(e,e.validation.solution),{kind:'list',items:[]})
 assert.deepEqual(run(e,[count('all')]),{kind:'count',value:0})
 assert.match(runData(e,[group('id')]).error,/Поле отсутствует/)
 const noRows=runData(numbers,[filter('$value','<',5),filter('$value','>',10)])
 assert.deepEqual(noRows.frame.items,[])
})

test('different valid pipelines pass; result equality alone does not bypass required operations',()=>{
 assert.equal(gradeData(numbers,numbers.validation.solution).correct,true)
 assert.equal(gradeData(numbers,[sort(),filter('$value','>',5)]).correct,true)
 const alternate=[filter('age','>',25),{type:'select',operationId:'project',fields:['name'],mode:'scalar'},sort()]
 assert.equal(gradeData(people,alternate).correct,true)
 const e=structuredClone(numbers);e.content.source=[8,10,12];validateExercise(e)
 const graded=gradeData(e,[])
 assert.equal(graded.correct,false);assert.equal(graded.conditions.find(c=>c.id==='result').passed,true)
 assert.equal(graded.conditions.find(c=>c.id==='required-filter').passed,false)
 e.validation.requiredOperations=[]
 assert.equal(gradeData(e,[]).correct,false)
})

test('operation limits and forbidden actions are checked independently of a matching result',()=>{
 const e=structuredClone(numbers);e.content.source=[8,10,12]
 e.validation.requiredOperations=['order-by'];e.validation.forbiddenOperations=['filter'];e.validation.maxSteps=1;e.validation.solution=[sort()]
 validateExercise(e)
 const bad=gradeData(e,[filter('$value','>',5),sort()])
 assert.equal(bad.conditions.find(c=>c.id==='result').passed,true)
 assert.equal(bad.conditions.find(c=>c.id==='limit').passed,false)
 assert.equal(bad.conditions.find(c=>c.id==='forbidden-filter').passed,false)
 assert.equal(bad.correct,false)
})

test('canonical comparison ignores object property order and optionally row/group order, preserving types and multiplicity',()=>{
 const a={kind:'list',items:[{name:'a',age:1},{name:'b',age:2}]},b={kind:'list',items:[{age:2,name:'b'},{age:1,name:'a'}]}
 assert.equal(sameData(a,b,'ordered','ordered'),false);assert.equal(sameData(a,b,'unordered','ordered'),true)
 assert.equal(sameData({kind:'list',items:[1,1]},{kind:'list',items:[1]},'unordered','ordered'),false)
 assert.equal(sameData({kind:'list',items:[1]},{kind:'list',items:['1']},'unordered','ordered'),false)
 const groups={kind:'groups',groups:[{key:'A',items:[1,2]},{key:'B',items:[3]}]}
 const reversed={kind:'groups',groups:[{key:'B',items:[3]},{key:'A',items:[2,1]}]}
 assert.equal(sameData(groups,reversed,'unordered','unordered'),true)
 assert.equal(sameData(groups,reversed,'ordered','unordered'),false)
 assert.equal(sameData(groups,reversed,'unordered','ordered'),false)
})

test('unknown operations, invalid parameters, executable fields and dangerous property names are rejected',()=>{
 for(const s of [{...sort(),operationId:'eval'},{...sort(),direction:'sideways'},{...filter('$value','>',5),value:'5'},{...sort(),field:'constructor'},{...sort(),function:'return 1'}])assert.throws(()=>validateDataSteps(numbers,[s]))
 for(const mutate of [e=>{e.content.source=Array(101).fill(1)},e=>{e.content.source[0]=null},e=>{e.content.source[0]=NaN},e=>{e.content.operations[0].predicate='x => x > 5'},e=>{e.content.operations[0].type='eval'},e=>{e.validation.solution=[]},e=>{e.validation.maxSteps=13},e=>{e.validation.forbiddenOperations=['filter']},e=>{e.content.operations[0].fields=['__proto__']}]){const e=structuredClone(numbers);mutate(e);assert.throws(()=>validateExercise(e))}
 const e=structuredClone(people);e.content.source[0]=JSON.parse('{"__proto__":1,"name":"a","age":22,"city":"x"}');assert.throws(()=>validateExercise(e))
 assert.throws(()=>validateDataSteps(numbers,Array(13).fill(sort())))
 const safe=fixture([{category:'__proto__'},{category:'constructor'}],{kind:'object',fields:{category:'string'}},orders.content.operations,{kind:'list',items:[{key:'__proto__',count:1},{key:'constructor',count:1}]},orders.validation.solution)
 assert.equal(gradeData(safe,safe.validation.solution).correct,true)
})

test('persisted pipelines restore parameters and order, derive checks, support undo/edit/reorder/reset, and isolate version changes',()=>{
 let s=freshExercise(numbers);s=editExercise(numbers,s,answer(numbers.validation.solution))
 s=submitExercise(numbers,s);assert.equal(s.attempts,1);assert.ok(s.solvedAnswer)
 const restored=restoreExercises({[numbers.id]:s},[numbers])[numbers.id];assert.deepEqual(restored,s)
 const undone=editExercise(numbers,s,answer(s.answer.steps.slice(0,-1)))
 assert.equal(undone.checkedAnswer,undefined);assert.equal(checkExercise(numbers,undone.answer).correct,false)
 const reordered=editExercise(numbers,s,answer([...s.answer.steps].reverse()));assert.equal(checkExercise(numbers,reordered.answer).correct,true)
 const edited=editExercise(numbers,s,answer([filter('$value','>',10),sort()]));assert.equal(checkExercise(numbers,edited.answer).correct,false)
 const reset=resetExercise(numbers,s);assert.deepEqual(reset.answer,answer([]));assert.equal(reset.attempts,1);assert.ok(reset.solvedAnswer)
 for(const mutate of [e=>{e.version++},e=>{e.content.source[0]=4},e=>{e.content.operations[0].values.push(20)}]){
  const changed=structuredClone(numbers);mutate(changed);validateExercise(changed)
  const old=placements[0].block.exercise,oldState=freshExercise(old)
  const saved=restoreExercises({[numbers.id]:s,[old.id]:oldState},[changed,old])
  assert.equal(saved[numbers.id],undefined);assert.deepEqual(saved[old.id],oldState)
 }
 assert.deepEqual(Object.keys(s.answer).sort(),['steps','type'])
})

test('all three examples import into existing lessons; grades and previous activities remain unchanged',()=>{
 assert.deepEqual(demos.map(p=>[p.moduleId,p.lessonId]),[['m11','m11-l01'],['m13','m13-l02'],['m13','m13-l07']])
 const raw=JSON.parse(readFileSync(new URL('../server/course-source/csharp-foundations-v2.json',import.meta.url))),course=learningCourseOrder(validateDownloadedCourse(raw))
 const clean=structuredClone(raw.modules)
 for(const m of clean)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise')
 assert.deepEqual(attachExercises(clean,placements),raw.modules)
 const old=structuredClone(raw);old.version=22
 for(const m of old.modules)for(const l of m.lessons)l.blocks=l.blocks.filter(b=>b.kind!=='exercise'||b.exercise.type!=='data-transform')
 const before=learningCourseOrder(validateDownloadedCourse(old))
 assert.deepEqual(scoredLearningQuestions(course),scoredLearningQuestions(before))
 const step=course.lessons.find(l=>l.exercise?.id===numbers.id)
 let a=initializeExerciseStep(course,{...freshLearningAttempt(course),lessonId:step.id,view:'practice'})
 a={...a,exercises:{[numbers.id]:submitExercise(numbers,editExercise(numbers,a.exercises[numbers.id],answer(numbers.validation.solution)))}}
 const loaded=restoreLearningAttempt(JSON.stringify(a),course)
 assert.deepEqual(loaded.exercises,a.exercises);assert.deepEqual(learningScore(course,loaded),learningScore(course,a))
 for(const p of demos)assert.equal(checkExercise(p.block.exercise,answer(p.block.exercise.validation.solution)).correct,true)
 assert.match(describeDataStep(filter('age','>',25),'sql'),/^WHERE/)
 assert.match(describeDataStep(filter('age','>',25),'python'),/^filter/)
})
