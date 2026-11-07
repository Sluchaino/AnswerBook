export type TraceValue={kind:'scalar';value:string|number|boolean|null}|{kind:'reference';objectId:string|null}|{kind:'record';fields:Record<string,TraceValue>}|{kind:'array';items:TraceValue[]}
export type TraceVariable={id:string;name:string;declaredType?:string;scope?:string;value:TraceValue}
export type TraceObject={id:string;type:string;fields:Record<string,TraceValue>}
export type TraceSnapshot={id:string;phase:'initial'|'after';lines:number[];title:string;variables:TraceVariable[];objects:TraceObject[];output?:string[];explanation:string}
type PredictionBase={id:string;atStepId:string;prompt:string;correctOptionId:string;explanation:string}
export type TracePrediction=PredictionBase&(
  {kind:'variable';variableId:string;options:{id:string;value:TraceValue}[]}|
  {kind:'output';options:{id:string;output:string[]}[]}|
  {kind:'reference';variableId:string;options:{id:string;objectId:string|null}[]}|
  {kind:'state';options:{id:string;description:string}[]})
export type TraceSpec={content:{language:string;code:string;initial:TraceSnapshot;steps:TraceSnapshot[];predictions:TracePrediction[];defaultMode:'demo'|'practice'};validation:{completion:'practice'|'either'}}
export type TraceResponse={choiceId?:string;checkedChoiceId?:string;firstChoiceId?:string;attempts:number}
export type TraceAnswer={type:'code-trace';mode:'demo'|'practice';stepId:string;furthestStepId:string;responses:Record<string,TraceResponse>}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-z0-9][a-z0-9-]{0,119}$/.test(v)&&!['constructor','prototype'].includes(v)
const text=(v:unknown,max=2000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max
const field=(v:string)=>/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v)
function keys(v:unknown,required:string[],optional:string[]=[]) {
  if(!record(v)||required.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))throw new Error('Неверные поля сценария трассировки')
}
function output(v:unknown):asserts v is string[] {if(!Array.isArray(v)||v.length>100||v.some(s=>typeof s!=='string'||s.length>500))throw new Error('Неверный вывод программы')}
function value(v:unknown,objects:Set<string>,budget:{left:number},depth=0):asserts v is TraceValue {
  if(--budget.left<0||depth>3||!record(v))throw new Error('Слишком сложное значение трассировки')
  if(v.kind==='scalar'){keys(v,['kind','value']);if(v.value!==null&&typeof v.value!=='boolean'&&!(typeof v.value==='number'&&Number.isFinite(v.value))&&!(typeof v.value==='string'&&v.value.length<=500))throw new Error('Неверное значение переменной')}
  else if(v.kind==='reference'){keys(v,['kind','objectId']);if(v.objectId!==null&&(typeof v.objectId!=='string'||!objects.has(v.objectId)))throw new Error('Ссылка на отсутствующий объект')}
  else if(v.kind==='array'){keys(v,['kind','items']);if(!Array.isArray(v.items)||v.items.length>20)throw new Error('Неверный массив');for(const item of v.items)value(item,objects,budget,depth+1)}
  else if(v.kind==='record'){keys(v,['kind','fields']);fields(v.fields,objects,budget,depth+1)}
  else throw new Error('Неизвестный вид значения')
}
function fields(v:unknown,objects:Set<string>,budget:{left:number},depth=0) {
  if(!record(v)||Object.keys(v).length>20||Object.keys(v).some(k=>!field(k)))throw new Error('Неверные поля объекта')
  for(const item of Object.values(v))value(item,objects,budget,depth)
}
export const traceSnapshots=(spec:TraceSpec)=>[spec.content.initial,...spec.content.steps]
export function traceValueKey(v:TraceValue):string {
  if(v.kind==='record')return JSON.stringify({kind:v.kind,fields:Object.keys(v.fields).sort().map(k=>[k,traceValueKey(v.fields[k])])})
  if(v.kind==='array')return JSON.stringify({kind:v.kind,items:v.items.map(traceValueKey)})
  return JSON.stringify(v)
}
export function validateTraceSpec(spec:TraceSpec) {
  const c=spec.content
  keys(c,['language','code','initial','steps','predictions','defaultMode']);keys(spec.validation,['completion'])
  if(typeof c.language!=='string'||!/^[a-z0-9][a-z0-9+#.-]{0,39}$/i.test(c.language)||!text(c.code,10000)||c.code.split(/\r?\n/).length>50)throw new Error('Неверный код трассировки')
  if(!Array.isArray(c.steps)||!c.steps.length||c.steps.length>100||!['demo','practice'].includes(c.defaultMode)||!['practice','either'].includes(spec.validation.completion))throw new Error('Неверные настройки трассировки')
  const snapshots=traceSnapshots(spec),ids=new Set<string>(),globalObjects=new Map<string,string>(),variables=new Map<string,string>()
  for(const [index,s] of snapshots.entries()) {
    keys(s,['id','phase','lines','title','variables','objects','explanation'],['output'])
    if(!id(s.id)||ids.has(s.id)||s.phase!==(index===0?'initial':'after')||!text(s.title,200)||!text(s.explanation))throw new Error('Неверный или повторный шаг')
    ids.add(s.id)
    if(!Array.isArray(s.lines)||s.lines.length>5||new Set(s.lines).size!==s.lines.length||s.lines.some(n=>!Number.isInteger(n)||n<1||n>c.code.split(/\r?\n/).length)||index===0&&s.lines.length!==0||index>0&&!s.lines.length)throw new Error('Неверные строки шага')
    if(!Array.isArray(s.variables)||s.variables.length>30||new Set(s.variables.map(v=>v?.id)).size!==s.variables.length||!Array.isArray(s.objects)||s.objects.length>30||new Set(s.objects.map(o=>o?.id)).size!==s.objects.length)throw new Error('Неверные переменные или объекты')
    const objects=new Set(s.objects.map(o=>o.id)),budget={left:300}
    for(const o of s.objects){keys(o,['id','type','fields']);if(!id(o.id)||!text(o.type,120)||globalObjects.has(o.id)&&globalObjects.get(o.id)!==o.type)throw new Error('Неверный объект или изменившийся тип');globalObjects.set(o.id,o.type);fields(o.fields,objects,budget)}
    for(const v of s.variables){
      keys(v,['id','name','value'],['declaredType','scope'])
      if(!id(v.id)||!text(v.name,120)||v.declaredType!==undefined&&!text(v.declaredType,120)||v.scope!==undefined&&!text(v.scope,120))throw new Error('Неверная переменная')
      const metadata=JSON.stringify([v.name,v.declaredType,v.scope])
      if(variables.has(v.id)&&variables.get(v.id)!==metadata)throw new Error('ID переменной должен сохранять имя, тип и область')
      variables.set(v.id,metadata);value(v.value,objects,budget)
    }
    if(s.output!==undefined)output(s.output)
  }
  if(!Array.isArray(c.predictions)||c.predictions.length>20||new Set(c.predictions.map(p=>p?.id)).size!==c.predictions.length||new Set(c.predictions.map(p=>p?.atStepId)).size!==c.predictions.length)throw new Error('Неверные вопросы предсказания')
  for(const p of c.predictions){
    const base=['id','atStepId','kind','prompt','correctOptionId','explanation','options']
    keys(p,p.kind==='variable'||p.kind==='reference'?[...base,'variableId']:base)
    const index=snapshots.findIndex(s=>s.id===p.atStepId),next=snapshots[index+1]
    if(!id(p.id)||index<0||!next||!text(p.prompt)||!text(p.explanation)||!Array.isArray(p.options)||p.options.length<2||p.options.length>6||new Set(p.options.map(o=>o?.id)).size!==p.options.length)throw new Error('Неверное предсказание или шаг')
    for(const o of p.options){
      if(!id(o.id))throw new Error('Неверный ID варианта')
      if(p.kind==='variable'){keys(o,['id','value']);value((o as {value:TraceValue}).value,new Set(globalObjects.keys()),{left:100})}
      else if(p.kind==='reference'){keys(o,['id','objectId']);const ref=(o as {objectId:string|null}).objectId;if(ref!==null&&!globalObjects.has(ref))throw new Error('Неизвестный объект в варианте')}
      else if(p.kind==='output'){keys(o,['id','output']);output((o as {output:string[]}).output)}
      else if(p.kind==='state'){keys(o,['id','description']);if(!text((o as {description:string}).description,500))throw new Error('Неверное описание состояния')}
      else throw new Error('Неизвестный вид предсказания')
    }
    if(!p.options.some(o=>o.id===p.correctOptionId))throw new Error('Отсутствует правильный вариант')
    if(p.kind==='variable'){
      const target=next.variables.find(v=>v.id===p.variableId),correct=p.options.find(o=>o.id===p.correctOptionId)!
      if(!target||traceValueKey(target.value)!==traceValueKey(correct.value))throw new Error('Предсказание не совпадает со следующим состоянием переменной')
    } else if(p.kind==='reference'){
      const target=next.variables.find(v=>v.id===p.variableId)?.value,correct=p.options.find(o=>o.id===p.correctOptionId)!
      if(target?.kind!=='reference'||target.objectId!==correct.objectId)throw new Error('Предсказание ссылки не совпадает со сценарием')
    } else if(p.kind==='output'&&JSON.stringify(next.output)!==JSON.stringify(p.options.find(o=>o.id===p.correctOptionId)!.output))throw new Error('Предсказание вывода не совпадает со сценарием')
  }
  if(JSON.stringify(c).length>1_000_000)throw new Error('Сценарий превышает 1 МБ')
}

export const freshTrace=(spec:TraceSpec):TraceAnswer=>({type:'code-trace',mode:spec.content.defaultMode,stepId:spec.content.initial.id,furthestStepId:spec.content.initial.id,responses:{}})
export function traceAccessibleIndex(spec:TraceSpec,a:TraceAnswer):number {
  const snapshots=traceSnapshots(spec)
  if(a.mode==='demo')return snapshots.length-1
  const index=snapshots.findIndex(s=>spec.content.predictions.some(p=>p.atStepId===s.id&&!a.responses[p.id]?.firstChoiceId))
  return index<0?snapshots.length-1:index
}
export function validateTraceAnswer(spec:TraceSpec,input:unknown):asserts input is TraceAnswer {
  keys(input,['type','mode','stepId','furthestStepId','responses'])
  const a=input as TraceAnswer,snapshots=traceSnapshots(spec),index=snapshots.findIndex(s=>s.id===a.stepId),furthest=snapshots.findIndex(s=>s.id===a.furthestStepId)
  if(a.type!=='code-trace'||!['practice','demo'].includes(a.mode)||index<0||furthest<index||!record(a.responses)||Object.keys(a.responses).length>20)throw new Error('Неверное сохранение трассировки')
  for(const [id,r] of Object.entries(a.responses)){
    const p=spec.content.predictions.find(p=>p.id===id)
    if(!p)throw new Error('Сохранён ответ на отсутствующий вопрос')
    keys(r,['attempts'],['choiceId','checkedChoiceId','firstChoiceId'])
    if(!Number.isSafeInteger(r.attempts)||r.attempts<0||[r.choiceId,r.checkedChoiceId,r.firstChoiceId].some(v=>v!==undefined&&!p.options.some(o=>o.id===v))||!!r.firstChoiceId!==(r.attempts>0)||r.checkedChoiceId!==undefined&&(r.choiceId!==r.checkedChoiceId||!r.firstChoiceId))throw new Error('Неверная попытка предсказания')
  }
  if(furthest>traceAccessibleIndex(spec,a))throw new Error('Сохранение обходит вопрос предсказания')
}
export function moveTrace(spec:TraceSpec,a:TraceAnswer,stepId:string):TraceAnswer {
  const snapshots=traceSnapshots(spec),index=snapshots.findIndex(s=>s.id===stepId)
  if(index<0||index>traceAccessibleIndex(spec,a))throw new Error('Этот шаг пока недоступен')
  return {...a,stepId,furthestStepId:index>snapshots.findIndex(s=>s.id===a.furthestStepId)?stepId:a.furthestStepId}
}
export const changeTraceMode=(spec:TraceSpec,a:TraceAnswer,mode:TraceAnswer['mode']):TraceAnswer=>({...a,mode,stepId:spec.content.initial.id,furthestStepId:spec.content.initial.id})
export function chooseTraceOption(spec:TraceSpec,a:TraceAnswer,predictionId:string,choiceId:string):TraceAnswer {
  const p=spec.content.predictions.find(p=>p.id===predictionId)
  if(a.mode!=='practice'||!p||p.atStepId!==a.stepId||!p.options.some(o=>o.id===choiceId))throw new Error('Недоступное предсказание')
  const old=a.responses[p.id]??{attempts:0}
  if(old.checkedChoiceId)return a
  return {...a,responses:{...a.responses,[p.id]:{...old,choiceId}}}
}
export function submitTraceOption(spec:TraceSpec,a:TraceAnswer,predictionId:string):TraceAnswer {
  const p=spec.content.predictions.find(p=>p.id===predictionId),r=a.responses[predictionId]
  if(!p||a.mode!=='practice'||p.atStepId!==a.stepId||!r?.choiceId)throw new Error('Выберите ответ на предсказание')
  if(r.checkedChoiceId)return a
  return {...a,responses:{...a.responses,[p.id]:{...r,attempts:r.attempts+1,checkedChoiceId:r.choiceId,firstChoiceId:r.firstChoiceId??r.choiceId}}}
}
export function retryTraceOption(spec:TraceSpec,a:TraceAnswer,predictionId:string):TraceAnswer {
  const p=spec.content.predictions.find(p=>p.id===predictionId),old=a.responses[predictionId]
  if(!p||p.atStepId!==a.stepId||!old?.checkedChoiceId)return a
  return {...a,responses:{...a.responses,[p.id]:{attempts:old.attempts,firstChoiceId:old.firstChoiceId}}}
}
export function traceReady(spec:TraceSpec,a:TraceAnswer) {
  return a.furthestStepId===spec.content.steps.at(-1)!.id&&(spec.validation.completion==='either'||a.mode==='practice')&&(a.mode==='demo'||spec.content.predictions.every(p=>a.responses[p.id]?.checkedChoiceId))
}
export function gradeTrace(spec:TraceSpec,a:TraceAnswer) {
  const conditions=[{id:'end',label:'Трассировка просмотрена до конца',passed:a.furthestStepId===spec.content.steps.at(-1)!.id},{id:'mode',label:spec.validation.completion==='practice'?'Пройден режим практики':'Режим упражнения подходит',passed:spec.validation.completion==='either'||a.mode==='practice'}]
  if(a.mode==='practice')for(const p of spec.content.predictions)conditions.push({id:p.id,label:p.prompt,passed:a.responses[p.id]?.checkedChoiceId===p.correctOptionId})
  return {correct:conditions.every(c=>c.passed),conditions}
}
// A different viewed step is not a new assessed attempt.
export const traceAssessmentKey=(a:TraceAnswer)=>JSON.stringify({mode:a.mode,furthestStepId:a.furthestStepId,responses:a.responses})
