import {validateArchitectureSpec,validateGraphAnswer,freshGraphAnswer,gradeGraph,graphAssessmentKey} from './architectureGraphs.ts'
import type {ArchitectureSpec,GraphAnswer} from './architectureGraphs.ts'
import {validateTraceSpec,validateTraceAnswer,freshTrace,traceReady,gradeTrace,traceAssessmentKey,submitTraceOption} from './codeTraces.ts'
import type {TraceSpec,TraceAnswer} from './codeTraces.ts'
import {validateDataSpec,validateDataSteps,gradeData} from './dataTransforms.ts'
import type {DataSpec,DataAnswer,DataCondition} from './dataTransforms.ts'
import {shuffled} from './shuffle.ts'

type Item={id:string;label:string}
type Common={id:string;version:number;difficulty?:'beginner'|'intermediate'|'advanced';title:string;description:string;instructions:string;feedback:{success:string;failure:string;explanation:string};settings:{practice:true;shuffle:boolean}}
export type MatchingExercise=Common&{type:'matching';content:{left:Item[];right:Item[]};validation:{pairs:Record<string,string>}}
export type SequenceExercise=Common&{type:'sequence';content:{items:Item[]};validation:{acceptedOrders:string[][]}}
export type CodeOrderExercise=Common&{type:'code-order';content:{language:string;fragments:{id:string;code:string}[];context?:string;prefix?:string;suffix?:string};validation:{acceptedOrders:string[][]}}
export type OrderedExercise=SequenceExercise|CodeOrderExercise
export type DebugLocation={kind:'line';line:number}
export type CodeDebugExercise=Common&{type:'code-debug';content:{language:string;code:string;errors:{id:string;location:DebugLocation;explanation:string}[];fixOptions:{id:string;code:string}[]};validation:{acceptedFixes:Record<string,string[]>}}
export type DebugAnswer={type:'code-debug';selection?:DebugLocation;fixId?:string}
export type DataTransformExercise=Common&DataSpec&{type:'data-transform'}
export type CodeTraceExercise=Common&TraceSpec&{type:'code-trace'}
export type ArchitectureExercise=Common&ArchitectureSpec&{type:'architecture-builder'}
export type Exercise=ArchitectureExercise|CodeTraceExercise|MatchingExercise|OrderedExercise|CodeDebugExercise|DataTransformExercise
export type ExerciseAnswer={type:'matching';pairs:Record<string,string>}|{type:'sequence'|'code-order';order:string[]}|DebugAnswer|DataAnswer|TraceAnswer|GraphAnswer
export type ExerciseState={fingerprint:string;answer:ExerciseAnswer;attempts:number;rightOrder?:string[];checkedAnswer?:ExerciseAnswer;solvedAnswer?:ExerciseAnswer}
export type ExerciseResult={correct:boolean;incorrectIds:string[];conditions?:DataCondition[];debugStatus?:'incomplete'|'wrong-line'|'wrong-fix'|'correct'}

const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const text=(v:unknown,max=4000):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(v)&&!['constructor','prototype'].includes(v)
function keys(v:unknown,required:string[],optional:string[]=[]) {
  if(!record(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))throw new Error('Неверные поля интерактивного упражнения')
}
function items(v:unknown,max:number):asserts v is Item[] {
  if(!Array.isArray(v)||v.length<2||v.length>max||new Set(v.map(i=>i?.id)).size!==v.length)throw new Error('Неверные элементы упражнения')
  for(const item of v){keys(item,['id','label']);if(!id(item.id)||!text(item.label,2000))throw new Error('Неверный элемент упражнения')}
}
const permutation=(v:unknown,ids:string[]):v is string[]=>Array.isArray(v)&&v.length===ids.length&&new Set(v).size===ids.length&&v.every(x=>ids.includes(x))
const language=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9+#.-]{0,39}$/i.test(v)
export const debugCodeLines=(code:string)=>code.split(/\r?\n/)
// Older packages contain fixes for the erroneous line only. Other selections
// get local edits, never snippets copied from a different source line.
function legacyLocalDebugFixOptions(e:CodeDebugExercise,line:number):{id:string;code:string;label?:string}[]{
  const source=debugCodeLines(e.content.code)[line-1]
  if(source===undefined)throw Error('Неверная позиция строки кода')
  const indent=source.match(/^\s*/)?.[0]??''
  const comment=/python|py/i.test(e.content.language)?'#':/sql/i.test(e.content.language)?'--':'//'
  const changed=source.replace(/===|!==|==|!=|<=|>=|\btrue\b|\bfalse\b|\b\d+\b/,token=>({ '===':'!==','!==':'===','==':'!=','!=':'==','<=':'<','>=':'>','true':'false','false':'true'}[token]??String(Number(token)+1)))
  const variants=[{code:source,label:'Оставить строку без изменения'},
    ...(changed!==source?[{code:changed}]:[]),
    {code:indent+comment+' '+source.trimStart(),label:'Закомментировать строку'},
    {code:'',label:'Удалить строку'},
    ...(changed===source?[{code:source+'\n'+source,label:'Повторить строку'}]:[])]
  return variants.map((option,i)=>({...option,id:`local-line-${line}-fix-${i}`}))
}
export function debugFixOptions(e:CodeDebugExercise,line:number):{id:string;code:string;label?:string}[]{
  if(line===e.content.errors[0].location.line)return e.content.fixOptions
  const seen=new Set<string>()
  return legacyLocalDebugFixOptions(e,line).filter(option=>{
    const key=option.code.trimEnd()
    if(seen.has(key))return false
    seen.add(key);return true
  })
}
function debugLocation(value:unknown,code:string) {
  keys(value,['kind','line'])
  const location=value as DebugLocation
  if(location.kind!=='line'||!Number.isSafeInteger(location.line)||location.line<1||location.line>debugCodeLines(code).length)throw new Error('Неверная позиция строки кода')
}

export function validateExercise(input:unknown):Exercise {
  keys(input,['id','type','title','description','instructions','content','validation','feedback','settings','version'],['difficulty'])
  const e=input as Exercise
  if(!id(e.id)||!Number.isSafeInteger(e.version)||e.version<1||!text(e.title,200)||!text(e.description)||!text(e.instructions))throw new Error('Неверное описание упражнения')
  if(e.difficulty!==undefined&&!['beginner','intermediate','advanced'].includes(e.difficulty))throw new Error('Неизвестная сложность упражнения')
  keys(e.feedback,['success','failure','explanation']);keys(e.settings,['practice','shuffle'])
  if(!Object.values(e.feedback).every(v=>text(v))||e.settings.practice!==true||typeof e.settings.shuffle!=='boolean')throw new Error('Неверные настройки упражнения')
  if(e.type==='matching') {
    keys(e.content,['left','right']);keys(e.validation,['pairs'])
    items(e.content.left,12);items(e.content.right,12)
    const pairs=e.validation.pairs
    if(!record(pairs)||e.content.left.length!==e.content.right.length||Object.keys(pairs).length!==e.content.left.length||!e.content.left.every(i=>Object.hasOwn(pairs,i.id))||!permutation(Object.values(pairs),e.content.right.map(i=>i.id)))throw new Error('Неверный ключ сопоставления')
  } else if(e.type==='sequence'||e.type==='code-order') {
    if(e.type==='sequence'){keys(e.content,['items']);items(e.content.items,20)}
    else {
      keys(e.content,['language','fragments'],['context','prefix','suffix'])
      if(!language(e.content.language))throw new Error('Неверный язык фрагментов')
      const fragments=e.content.fragments
      if(!Array.isArray(fragments)||fragments.length<2||fragments.length>20||new Set(fragments.map(f=>f?.id)).size!==fragments.length)throw new Error('Неверные фрагменты кода')
      for(const fragment of fragments){keys(fragment,['id','code']);if(!id(fragment.id)||!text(fragment.code,8000))throw new Error('Неверный фрагмент кода')}
      for(const field of ['context','prefix','suffix'] as const)if(e.content[field]!==undefined&&!text(e.content[field],8000))throw new Error('Неверный контекст кода')
    }
    keys(e.validation,['acceptedOrders'])
    const orders=e.validation.acceptedOrders
    if(!Array.isArray(orders)||!orders.length||orders.length>20||orders.some(o=>!permutation(o,exerciseOrderItems(e).map(i=>i.id))))throw new Error('Неверные допустимые последовательности')
  } else if(e.type==='code-debug') {
    keys(e.content,['language','code','errors','fixOptions']);keys(e.validation,['acceptedFixes'])
    if(!language(e.content.language)||!text(e.content.code,20000)||debugCodeLines(e.content.code).length>300)throw new Error('Неверный исходный код')
    // Keep errors as an identified collection for a future multi-error UI.
    if(!Array.isArray(e.content.errors)||e.content.errors.length!==1)throw new Error('Пока поддерживается одно ошибочное место на упражнение')
    const error=e.content.errors[0]
    keys(error,['id','location','explanation']);debugLocation(error.location,e.content.code)
    if(!id(error.id)||!text(error.explanation)||!debugCodeLines(e.content.code)[error.location.line-1].trim())throw new Error('Неверное описание ошибки')
    const fixes=e.content.fixOptions
    if(!Array.isArray(fixes)||fixes.length<2||fixes.length>12||new Set(fixes.map(f=>f?.id)).size!==fixes.length)throw new Error('Неверные варианты исправления')
    for(const fix of fixes){keys(fix,['id','code']);if(!id(fix.id)||!text(fix.code,8000))throw new Error('Неверный вариант исправления')}
    const accepted=e.validation.acceptedFixes
    if(!record(accepted)||Object.keys(accepted).length!==1||!Object.hasOwn(accepted,error.id)||!Array.isArray(accepted[error.id])||!accepted[error.id].length||new Set(accepted[error.id]).size!==accepted[error.id].length||accepted[error.id].some(f=>!fixes.some(option=>option.id===f)))throw new Error('Неверный ключ исправления')
  } else if(e.type==='architecture-builder')validateArchitectureSpec(e)
  else if(e.type==='code-trace')validateTraceSpec(e)
  else if(e.type==='data-transform')validateDataSpec(e)
  else throw new Error('Неизвестный тип интерактивного упражнения')
  return e
}

export const exerciseFingerprint=(e:Exercise)=>{
  const json=JSON.stringify(e)
  if(e.type!=='code-trace'&&e.type!=='architecture-builder')return json
  // Compact deterministic content identity: progress never duplicates snapshots.
  let a=2166136261,b=5381
  for(let i=0;i<json.length;i++){a=Math.imul(a^json.charCodeAt(i),16777619);b=Math.imul(b,33)^json.charCodeAt(i)}
  return `${e.type==='code-trace'?'trace':'graph'}:${e.version}:${json.length}:${a>>>0}:${b>>>0}`
}
export const exerciseOrderItems=(e:OrderedExercise):Item[]=>e.type==='sequence'?e.content.items:e.content.fragments.map(f=>({id:f.id,label:f.code}))
export function assembleExerciseCode(e:CodeOrderExercise,order:string[]):string {
  validateExerciseAnswer(e,{type:'code-order',order})
  return [e.content.prefix,...order.map(id=>e.content.fragments.find(f=>f.id===id)!.code),e.content.suffix].filter((part):part is string=>part!==undefined).join('\n')
}
export function validateExerciseAnswer(e:Exercise,input:unknown,allowIncomplete=false):ExerciseAnswer {
  if(e.type==='architecture-builder'){validateGraphAnswer(e,input);return input}
  if(e.type==='code-trace'){validateTraceAnswer(e,input);return input}
  if(e.type==='data-transform'){keys(input,['type','steps']);const a=input as DataAnswer;if(a.type!==e.type)throw new Error('Неверный тип ответа');validateDataSteps(e,a.steps);return a}
  if(e.type==='code-debug') {
    keys(input,['type'],['selection','fixId'])
    const a=input as DebugAnswer
    if(a.type!==e.type)throw new Error('Ответ относится к другому типу упражнения')
    if(a.selection!==undefined)debugLocation(a.selection,e.content.code)
    if(a.fixId!==undefined&&(typeof a.fixId!=='string'||![...e.content.fixOptions,...(a.selection?debugFixOptions(e,a.selection.line):[])].some(f=>f.id===a.fixId)))throw new Error('Неизвестное исправление')
    if(a.fixId!==undefined&&!a.selection)throw new Error('Сначала выберите строку')
    return a
  }
  keys(input,['type',e.type==='matching'?'pairs':'order'])
  const a=input as ExerciseAnswer
  if(a.type!==e.type)throw new Error('Ответ относится к другому типу упражнения')
  if((e.type==='sequence'||e.type==='code-order')&&(a.type==='sequence'||a.type==='code-order')) {
    const ids=exerciseOrderItems(e).map(i=>i.id)
    const partial=e.type==='code-order'&&allowIncomplete&&Array.isArray(a.order)&&a.order.length<=ids.length&&new Set(a.order).size===a.order.length&&a.order.every(id=>ids.includes(id))
    if(!partial&&!permutation(a.order,ids))throw new Error('Повреждён порядок элементов: требуются все фрагменты без повторов')
  } else if(e.type==='matching'&&a.type==='matching') {
    if(!record(a.pairs)||Object.entries(a.pairs).some(([left,right])=>!e.content.left.some(i=>i.id===left)||!e.content.right.some(i=>i.id===right))||new Set(Object.values(a.pairs)).size!==Object.keys(a.pairs).length)throw new Error('Повреждены соответствия')
  }
  return a
}
export function exerciseAnswerComplete(e:Exercise,a:ExerciseAnswer) {
  validateExerciseAnswer(e,a,true)
  if(e.type==='architecture-builder'&&a.type==='architecture-builder')return true
  if(e.type==='code-trace'&&a.type==='code-trace')return traceReady(e,a)
  if(e.type==='data-transform'&&a.type==='data-transform')return a.steps.length>0
  if(e.type==='code-debug'&&a.type==='code-debug')return !!a.selection&&a.fixId!==undefined
  return a.type==='sequence'||a.type==='code-order' ? (e.type==='sequence'||e.type==='code-order')&&a.order.length===exerciseOrderItems(e).length : e.type==='matching'&&a.type==='matching'&&Object.keys(a.pairs).length===e.content.left.length
}
export function checkExercise(e:Exercise,a:ExerciseAnswer):ExerciseResult {
  validateExerciseAnswer(e,a,true)
  if(e.type==='architecture-builder'&&a.type==='architecture-builder')return gradeGraph(e,a.graph)
  if(e.type==='code-trace'&&a.type==='code-trace'){const grade=gradeTrace(e,a);return {...grade,incorrectIds:grade.conditions.filter(c=>!c.passed).map(c=>c.id)}}
  if(e.type==='data-transform'&&a.type==='data-transform'){const grade=gradeData(e,a.steps);return {...grade,incorrectIds:grade.conditions.filter(c=>!c.passed).map(c=>c.id)}}
  if(e.type==='code-debug'&&a.type==='code-debug') {
    const error=e.content.errors[0]
    const debugStatus=!a.selection||!a.fixId?'incomplete':a.selection.line!==error.location.line?'wrong-line':!e.validation.acceptedFixes[error.id].includes(a.fixId)?'wrong-fix':'correct'
    return {correct:debugStatus==='correct',incorrectIds:debugStatus==='correct'?[]:[error.id],debugStatus}
  }
  if(e.type==='matching'&&a.type==='matching') {
    const incorrectIds=e.content.left.filter(i=>a.pairs[i.id]!==e.validation.pairs[i.id]).map(i=>i.id)
    return {correct:incorrectIds.length===0,incorrectIds}
  }
  if((e.type==='sequence'||e.type==='code-order')&&(a.type==='sequence'||a.type==='code-order')) {
    const errors=e.validation.acceptedOrders.map(order=>[...a.order.filter((v,i)=>order[i]!==v),...order.filter(v=>!a.order.includes(v))]).sort((a,b)=>a.length-b.length)
    return {correct:errors[0].length===0,incorrectIds:errors[0]}
  }
  throw new Error('Неверный ответ упражнения')
}
export function freshExercise(e:Exercise,random:()=>number=Math.random):ExerciseState {
  if(e.type==='architecture-builder')return {fingerprint:exerciseFingerprint(e),attempts:0,answer:freshGraphAnswer()}
  if(e.type==='code-trace')return {fingerprint:exerciseFingerprint(e),attempts:0,answer:freshTrace(e)}
  if(e.type==='data-transform')return {fingerprint:exerciseFingerprint(e),attempts:0,answer:{type:'data-transform',steps:[]}}
  if(e.type==='code-debug')return {fingerprint:exerciseFingerprint(e),attempts:0,answer:{type:'code-debug'},rightOrder:e.settings.shuffle?shuffled(e.content.fixOptions.map(f=>f.id),random):e.content.fixOptions.map(f=>f.id)}
  if(e.type==='matching')return {fingerprint:exerciseFingerprint(e),attempts:0,answer:{type:'matching',pairs:{}},rightOrder:e.settings.shuffle?shuffled(e.content.right.map(i=>i.id),random):e.content.right.map(i=>i.id)}
  let order=exerciseOrderItems(e).map(i=>i.id)
  if(e.settings.shuffle){order=shuffled(order,random);if(checkExercise(e,{type:e.type,order}).correct)order.push(order.shift()!)}
  if(e.type==='code-order'&&e.settings.shuffle&&checkExercise(e,{type:e.type,order}).correct) {
    // At most 20 accepted orders: 21 distinct permutations suffice to find a
    // non-solution if one exists. No unbounded random retries.
    const candidate=[...order].sort()
    for(let n=0;n<=e.validation.acceptedOrders.length;n++) {
      if(!checkExercise(e,{type:e.type,order:candidate}).correct){order=[...candidate];break}
      let pivot=candidate.length-2
      while(pivot>=0&&candidate[pivot]>=candidate[pivot+1])pivot--
      if(pivot<0)break
      let last=candidate.length-1
      while(candidate[last]<=candidate[pivot])last--
      ;[candidate[pivot],candidate[last]]=[candidate[last],candidate[pivot]]
      candidate.splice(pivot+1,candidate.length,...candidate.slice(pivot+1).reverse())
    }
  }
  return {fingerprint:exerciseFingerprint(e),attempts:0,answer:{type:e.type,order}}
}
export function editExercise(e:Exercise,s:ExerciseState,answer:ExerciseAnswer):ExerciseState {
  validateExerciseAnswer(e,answer)
  if((answer.type==='code-trace'||answer.type==='architecture-builder')&&sameExerciseAssessment(answer,s.answer))return {...s,answer:structuredClone(answer)}
  const {checkedAnswer:_checked,...rest}=s
  return {...rest,answer:structuredClone(answer)}
}
export function submitExercise(e:Exercise,s:ExerciseState):ExerciseState {
  if(!exerciseAnswerComplete(e,s.answer))throw new Error(e.type==='matching'?'Заполните все соответствия':e.type==='code-debug'?'Выберите строку и исправление':e.type==='data-transform'?'Добавьте операцию':'Расставьте все фрагменты')
  if(s.checkedAnswer&&sameExerciseAssessment(s.checkedAnswer,s.answer))return s
  const checkedAnswer=structuredClone(s.answer)
  return {...s,attempts:s.attempts+(e.type==='code-trace'?0:1),checkedAnswer,...(checkExercise(e,s.answer).correct?{solvedAnswer:checkedAnswer}:{})}
}
export function resetExercise(e:Exercise,s:ExerciseState,random:()=>number=Math.random):ExerciseState {
  return {...freshExercise(e,random),attempts:s.attempts,...(s.solvedAnswer?{solvedAnswer:s.solvedAnswer}:{})}
}
export function restoreExercises(input:unknown,exercises:Exercise[]):Record<string,ExerciseState> {
  if(input===undefined)return {}
  if(!record(input)||Object.keys(input).length>10000)throw new Error('Неверные сохранения упражнений')
  const restored:Record<string,ExerciseState>={}
  for(const e of exercises) {
    if(!Object.hasOwn(input,e.id))continue
    const raw=input[e.id]
    keys(raw,['fingerprint','answer','attempts'],['rightOrder','checkedAnswer','solvedAnswer'])
    let s=raw as ExerciseState
    if(typeof s.fingerprint!=='string'||!Number.isSafeInteger(s.attempts)||s.attempts<0)throw new Error('Неверное состояние упражнения')
    if(s.fingerprint!==exerciseFingerprint(e))continue
    // Normalize legitimate older fix IDs before strict validation. Version 1.54
    // also saved duplicate local edits that are now hidden for blank lines.
    if(e.type==='code-debug'&&s.answer?.type==='code-debug'&&s.answer.selection&&typeof s.answer.fixId==='string'){
      debugLocation(s.answer.selection,e.content.code)
      const line=s.answer.selection.line,savedFixId=s.answer.fixId
      const wasKnown=e.content.fixOptions.some(f=>f.id===savedFixId)||
        line!==e.content.errors[0].location.line&&legacyLocalDebugFixOptions(e,line).some(f=>f.id===savedFixId)
      if(wasKnown&&!debugFixOptions(e,line).some(f=>f.id===savedFixId)){
        const {checkedAnswer:_checked,...rest}=s
        const {fixId:_fix,...selectionOnly}=s.answer
        s={...rest,answer:selectionOnly}
      }
    }
    validateExerciseAnswer(e,s.answer)
    if(e.type==='matching'&&!permutation(s.rightOrder,e.content.right.map(i=>i.id)))throw new Error('Неверный порядок вариантов упражнения')
    if(e.type==='code-debug'&&!permutation(s.rightOrder,e.content.fixOptions.map(i=>i.id)))throw new Error('Неверный порядок исправлений')
    if(s.checkedAnswer){validateExerciseAnswer(e,s.checkedAnswer);if((e.type!=='code-trace'&&!s.attempts)||!sameExerciseAssessment(s.checkedAnswer,s.answer)||!exerciseAnswerComplete(e,s.checkedAnswer))throw new Error('Неверная проверенная попытка')}
    if(s.solvedAnswer){if((e.type!=='code-trace'&&!s.attempts)||!checkExercise(e,s.solvedAnswer).correct)throw new Error('Неверный результат упражнения')}
    if(s.answer.type==='code-trace'&&Object.values(s.answer.responses).reduce((n,r)=>n+r.attempts,0)>s.attempts)throw new Error('Повреждён счётчик предсказаний')
    if(s.answer.type==='architecture-builder'&&s.answer.closed&&!s.checkedAnswer)throw new Error('Закрытая попытка схемы должна быть проверена')
    restored[e.id]=s
  }
  return restored
}

// Replace the selected physical line, never search by matching source text.
export function previewDebugCode(e:CodeDebugExercise,a:DebugAnswer):string {
  validateExerciseAnswer(e,a)
  if(!a.selection||!a.fixId)return e.content.code
  const fix=debugFixOptions(e,a.selection.line).find(f=>f.id===a.fixId)??e.content.fixOptions.find(f=>f.id===a.fixId)!
  const chunks=e.content.code.match(/[^\n]*\n|[^\n]+$/g)??[]
  const index=a.selection.line-1
  const original=chunks[index]??''
  const ending=original.endsWith('\r\n')?'\r\n':original.endsWith('\n')?'\n':''
  chunks[index]=fix.code+ending
  return chunks.join('')
}

export function checkTracePrediction(e:CodeTraceExercise,s:ExerciseState,predictionId:string):ExerciseState {
  if(s.answer.type!=='code-trace')throw new Error('Неверный тип трассировки')
  const answer=submitTraceOption(e,s.answer,predictionId)
  if(answer===s.answer)return s
  return {...editExercise(e,s,answer),attempts:s.attempts+1}
}

export function sameExerciseAssessment(a:ExerciseAnswer,b:ExerciseAnswer):boolean {
  if(a.type==='code-trace'&&b.type==='code-trace')return traceAssessmentKey(a)===traceAssessmentKey(b)
  if(a.type==='architecture-builder'&&b.type==='architecture-builder')return graphAssessmentKey(a)===graphAssessmentKey(b)
  return JSON.stringify(a)===JSON.stringify(b)
}
export function retryArchitecture(s:ExerciseState):ExerciseState {
  if(s.answer.type!=='architecture-builder')throw new Error('Неверный тип схемы')
  const {checkedAnswer:_checked,...rest}=s
  return {...rest,answer:{...s.answer,closed:false}}
}
