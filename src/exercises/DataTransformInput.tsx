import {useRef,useState} from 'react'
import {Select} from '../components/Select'
import {dataFieldType,dataResult,describeDataStep,operationName,runData,validateDataSteps} from '../lib/dataTransforms'
import type {DataAnswer,DataFrame,DataItem,DataOperation,DataResult,DataStep} from '../lib/dataTransforms'
import type {DataTransformExercise} from '../lib/exercises'

const show=(value:unknown)=>JSON.stringify(value)
export function DataView({result}:{result:DataResult}) {
  if(result.kind==='count')return <p className="data-count">Количество: <strong>{result.value}</strong></p>
  if(result.kind==='groups')return <div className="data-groups">{!result.groups.length&&<p>Групп нет</p>}{result.groups.map((g,i)=><details key={i} open><summary>Группа {show(g.key)} · {g.items.length} элементов</summary><DataView result={{kind:'list',items:g.items}}/></details>)}</div>
  if(!result.items.length)return <p>Пустая коллекция · 0 элементов</p>
  const objects=result.items.every(x=>typeof x==='object')
  const fields=objects?[...new Set(result.items.flatMap(x=>Object.keys(x as object)))]:[]
  return <><p className="data-size">Элементов: {result.items.length}</p>{objects?<div className="data-table-scroll"><table><thead><tr>{fields.map(f=><th key={f} scope="col">{f}</th>)}</tr></thead><tbody>{result.items.map((row,i)=><tr key={i}>{fields.map(f=><td key={f}>{Object.hasOwn(row as object,f)?show((row as Record<string,DataItem>)[f]):'—'}</td>)}</tr>)}</tbody></table></div>:<pre className="exercise-code"><code>{show(result.items)}</code></pre>}</>
}
function initialStep(op:DataOperation,frame?:DataFrame):DataStep {
  const base={operationId:op.id}
  if(op.type==='filter'){
    const field=op.fields[0]
    let type:string|undefined;try{if(frame)type=dataFieldType(frame,field)}catch{/* The context error is shown by the pipeline. */}
    return {...base,type:op.type,field,operator:op.operators.find(o=>!type||type==='number'||o==='=='||o==='!=')??op.operators[0],value:op.values.find(v=>typeof v===type)??op.values[0]}
  }
  if(op.type==='select')return {...base,type:op.type,fields:[op.fields[0]],mode:op.modes[0]}
  if(op.type==='order-by'||op.type==='then-by')return {...base,type:op.type,field:op.fields[0],direction:op.directions[0]}
  if(op.type==='group-by')return {...base,type:op.type,field:op.fields[0]}
  if(op.type==='count')return {...base,type:'count',mode:op.modes[0]}
  throw new Error('Неизвестная операция')
}
const label=(f:string)=>f==='$value'?'Само значение':f
function Parameters({op,draft,setDraft,frame}:{op:DataOperation;draft:DataStep;setDraft:(s:DataStep)=>void;frame:DataFrame}) {
  let type:string|undefined
  if('field' in draft){try{type=dataFieldType(frame,draft.field)}catch{/* The pipeline explains unavailable fields. */}}
  return <div className="data-parameters">
    {'field' in draft&&'fields' in op&&<Select label="Поле" value={draft.field} options={op.fields.map(f=>({value:f,label:label(f)}))} onChange={field=>{
      if(draft.type==='filter'&&op.type==='filter'){
        let nextType:string|undefined;try{nextType=dataFieldType(frame,field)}catch{/* Invalid contexts remain editable. */}
        const value=op.values.find(v=>typeof v===nextType)??op.values[0]
        const operator=nextType!=='number'&& !['==','!='].includes(draft.operator)?op.operators.find(o=>o==='=='||o==='!=')??op.operators[0]:draft.operator
        setDraft({...draft,field,value,operator})
      } else setDraft({...draft,field})
    }}/>}
    {draft.type==='filter'&&op.type==='filter'&&<>
      <Select label="Условие" value={draft.operator} options={op.operators.filter(o=>type===undefined||type==='number'||o==='=='||o==='!=').map(o=>({value:o,label:o}))} onChange={operator=>setDraft({...draft,operator:operator as typeof draft.operator})}/>
      <Select label="Значение фильтра" value={String(op.values.findIndex(v=>v===draft.value))} options={op.values.map((v,i)=>({v,i})).filter(({v})=>!type||typeof v===type).map(({v,i})=>({value:String(i),label:show(v)}))} onChange={value=>setDraft({...draft,value:op.values[Number(value)]})}/>
    </>}
    {(draft.type==='order-by'||draft.type==='then-by')&&(op.type==='order-by'||op.type==='then-by')&&<Select label="Порядок" value={draft.direction} options={op.directions.map(d=>({value:d,label:d==='asc'?'По возрастанию':'По убыванию'}))} onChange={direction=>setDraft({...draft,direction:direction as 'asc'|'desc'})}/>}
    {draft.type==='count'&&op.type==='count'&&<Select label="Режим подсчёта" value={draft.mode} options={op.modes.map(m=>({value:m,label:m==='all'?'Вся коллекция':'В каждой группе'}))} onChange={mode=>setDraft({...draft,mode:mode as 'all'|'groups'})}/>}
    {draft.type==='select'&&op.type==='select'&&<>
      <Select label="Результат проекции" value={draft.mode} options={op.modes.map(m=>({value:m,label:m==='scalar'?'Значения одного поля':'Объекты с выбранными полями'}))} onChange={mode=>setDraft({...draft,mode:mode as 'object'|'scalar',fields:mode==='scalar'?draft.fields.slice(0,1):draft.fields})}/>
      {draft.mode==='scalar'?<Select label="Поле проекции" value={draft.fields[0]??''} options={op.fields.map(f=>({value:f,label:f}))} onChange={field=>setDraft({...draft,fields:[field]})}/>:<fieldset><legend>Поля проекции</legend>{op.fields.map(f=><label className="data-field-choice" key={f}><input type="checkbox" checked={draft.fields.includes(f)} onChange={event=>setDraft({...draft,fields:event.target.checked?[...draft.fields,f]:draft.fields.filter(x=>x!==f)})}/>{f}</label>)}</fieldset>}
    </>}
  </div>
}

export function DataTransformInput({exercise:e,answer:a,onChange}:{exercise:DataTransformExercise;answer:DataAnswer;onChange:(answer:DataAnswer)=>void}) {
  const [draft,setDraft]=useState<DataStep>(()=>initialStep(e.content.operations[0],runData(e,[]).frame))
  const [editing,setEditing]=useState<number|null>(null)
  const [error,setError]=useState('')
  const editor=useRef<HTMLHeadingElement>(null)
  const op=e.content.operations.find(o=>o.id===draft.operationId)!
  const run=runData(e,a.steps)
  const frameBefore=runData(e,editing===null?a.steps:a.steps.slice(0,editing)).frame
  function change(steps:DataStep[]){onChange({type:'data-transform',steps});setError('')}
  function save(){
    const steps=editing===null?[...a.steps,draft]:a.steps.map((s,i)=>i===editing?draft:s)
    try{validateDataSteps(e,steps);change(steps);setEditing(null)}catch(error){setError(error instanceof Error?error.message:'Неверные параметры')}
  }
  function move(index:number,delta:number){const steps=[...a.steps];[steps[index],steps[index+delta]]=[steps[index+delta],steps[index]];change(steps);setEditing(null)}
  return <div className="data-transform">
    <section><h3>Исходные данные</h3><DataView result={{kind:'list',items:e.content.source}}/></section>
    <section><h3>Целевой результат</h3><DataView result={e.content.target}/></section>
    <p className="data-rules">Условия: не больше {e.validation.maxSteps} операций.{e.validation.requiredOperations.length>0&&` Обязательно: ${e.validation.requiredOperations.map(k=>operationName(k,e.content.presentation)).join(', ')}.`}{e.validation.forbiddenOperations.length>0&&` Запрещено: ${e.validation.forbiddenOperations.map(k=>operationName(k,e.content.presentation)).join(', ')}.`} Строки сравниваются по кодам UTF-16, с учётом регистра.</p>
    <section className="data-builder" aria-label="Добавление и изменение операции"><h3 ref={editor} tabIndex={-1}>{editing===null?'Добавьте операцию':`Измените операцию ${editing+1}`}</h3>
      <Select label="Операция" value={op.id} options={e.content.operations.map(o=>({value:o.id,label:o.title}))} onChange={id=>{setDraft(initialStep(e.content.operations.find(o=>o.id===id)!,frameBefore));setError('')}}/>
      <Parameters op={op} draft={draft} setDraft={setDraft} frame={frameBefore}/>
      <div className="exercise-actions"><button className="secondary" type="button" disabled={editing===null&&a.steps.length>=12} onClick={save}>{editing===null?'Добавить операцию':'Сохранить операцию'}</button>{editing!==null&&<button type="button" className="text-button" onClick={()=>setEditing(null)}>Отменить редактирование</button>}</div>
      {error&&<p className="learning-error" role="alert">{error}</p>}
    </section>
    <section><h3>Цепочка преобразований · {a.steps.length}</h3>{!a.steps.length&&<p>Добавьте первую операцию.</p>}
      <ol className="data-chain">{a.steps.map((s,index)=>{
        const result=run.steps[index],definition=e.content.operations.find(o=>o.id===s.operationId)!
        return <li key={index}><p><strong>{index+1}. {describeDataStep(s,e.content.presentation)}</strong></p>
          <div className="data-step-actions"><button type="button" className="secondary" onClick={()=>{setDraft(structuredClone(s));setEditing(index);setError('');editor.current?.focus();editor.current?.scrollIntoView({block:'start'})}}>Изменить {index+1}</button><button type="button" className="secondary" onClick={()=>{change(a.steps.filter((_,i)=>i!==index));setEditing(null)}}>Удалить {index+1}</button><button type="button" className="secondary" aria-label={`Операция ${index+1} вверх`} disabled={index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" className="secondary" aria-label={`Операция ${index+1} вниз`} disabled={index===a.steps.length-1} onClick={()=>move(index,1)}>↓</button></div>
          {result?.frame?<details><summary>Результат шага {index+1} · {result.frame.kind==='count'?`Количество: ${result.frame.value}`:result.frame.kind==='groups'?`Групп: ${result.frame.groups.length}`:`Элементов: ${result.frame.items.length}`}</summary><DataView result={dataResult(result.frame)}/>{definition.explanation&&<p>{definition.explanation}</p>}</details>:<p className="learning-error">{result?.error??'Не выполнено из-за ошибки выше.'}</p>}
        </li>
      })}</ol>
      <button type="button" className="secondary" disabled={!a.steps.length} onClick={()=>{change(a.steps.slice(0,-1));setEditing(null)}}>Отменить последний шаг</button>
    </section>
    <section aria-label="Текущий результат преобразований"><h3>Текущий результат</h3>{run.error?<p className="learning-error" role="alert">{run.error} Исправьте или удалите операцию. Ниже показано последнее корректное состояние.</p>:null}<DataView result={dataResult(run.frame)}/></section>
  </div>
}
