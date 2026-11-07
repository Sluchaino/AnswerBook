import {GraphCard} from './GraphCard'
import {Select} from '../components/Select'
import {checkTracePrediction,editExercise} from '../lib/exercises'
import type {CodeTraceExercise,ExerciseState} from '../lib/exercises'
import {traceSnapshots,traceAccessibleIndex,moveTrace,changeTraceMode,chooseTraceOption,retryTraceOption,traceValueKey} from '../lib/codeTraces'
import type {TraceAnswer,TraceValue,TraceObject,TracePrediction} from '../lib/codeTraces'

export function TraceValueView({value:v,objects=[]}:{value:TraceValue;objects?:TraceObject[]}) {
  if(v.kind==='scalar')return <code>{JSON.stringify(v.value)}</code>
  if(v.kind==='reference')return <code>{v.objectId===null?'null (ссылка)':`→ ${objects.find(o=>o.id===v.objectId)?.type??'Объект'} #${v.objectId}`}</code>
  if(v.kind==='array')return <span>[{v.items.map((item,i)=><span key={i}>{i?', ':''}<TraceValueView value={item} objects={objects}/></span>)}]</span>
  return <span>{'{ '}{Object.entries(v.fields).map(([key,item],i)=><span key={key}>{i?', ':''}{key}: <TraceValueView value={item} objects={objects}/></span>)}{' }'}</span>
}
function PredictionOption({prediction:p,id,objects}:{prediction:TracePrediction;id:string;objects:TraceObject[]}) {
  if(p.kind==='variable')return <TraceValueView value={p.options.find(o=>o.id===id)!.value} objects={objects}/>
  if(p.kind==='reference')return <TraceValueView value={{kind:'reference',objectId:p.options.find(o=>o.id===id)!.objectId}} objects={objects}/>
  if(p.kind==='state')return <span>{p.options.find(o=>o.id===id)!.description}</span>
  const lines=p.options.find(o=>o.id===id)!.output
  return lines.length?<pre>{lines.map((line,i)=><span key={i}>{line||'⏎ (пустая строка)'}{'\n'}</span>)}</pre>:<span>Вывода пока нет</span>
}
export function CodeTraceInput({exercise:e,state:s,answer:a,onChange,onSubmit}:{exercise:CodeTraceExercise;state:ExerciseState;answer:TraceAnswer;onChange:(s:ExerciseState)=>void;onSubmit:()=>void}) {
  const snapshots=traceSnapshots(e),index=snapshots.findIndex(s=>s.id===a.stepId),current=snapshots[index],previous=snapshots[index-1],accessible=traceAccessibleIndex(e,a)
  const p=a.mode==='practice'?e.content.predictions.find(p=>p.atStepId===a.stepId):undefined,r=p?a.responses[p.id]:undefined
  const edit=(answer:TraceAnswer)=>onChange(editExercise(e,s,answer))
  return <div className="code-trace">
    <p className="exercise-language">{e.content.language} · Готовый сценарий, код не запускается</p>
    <div className="trace-controls"><Select label="Режим трассировки" value={a.mode} options={[{value:'practice',label:'Практика с предсказаниями'},{value:'demo',label:'Демонстрация'}]} onChange={mode=>edit(changeTraceMode(e,a,mode as TraceAnswer['mode']))}/><Select label="Доступный шаг" value={a.stepId} options={snapshots.slice(0,accessible+1).map((step,i)=>({value:step.id,label:i===0?'Начальное состояние':`Шаг ${i}`}))} onChange={id=>edit(moveTrace(e,a,id))}/></div>
    <progress value={index} max={snapshots.length-1} aria-label="Шаги трассировки"/><p>Шаг {index} из {snapshots.length-1} · {current.phase==='initial'?'До выполнения программы':'После указанной операции'}</p>
    <h3>{current.title}</h3>
    <div className="trace-columns"><section className="trace-code"><h4>Исходный код</h4><div className="debug-source" role="region" aria-label="Код трассировки" tabIndex={0}>{e.content.code.split(/\r?\n/).map((line,i)=><div key={i} className={`debug-line trace-line ${current.lines.includes(i+1)?'is-selected':''}`} aria-current={current.lines.includes(i+1)?'step':undefined}><span>{i+1}</span><code>{line||' '}</code></div>)}</div></section>
      <section className="trace-state"><h4>Переменные</h4>{current.variables.length?<div className="trace-table-scroll"><table><thead><tr><th>Имя / область</th><th>Тип</th><th>Значение</th></tr></thead><tbody>{current.variables.map(v=>{const old=previous?.variables.find(o=>o.id===v.id);const changed=!old||traceValueKey(old.value)!==traceValueKey(v.value);return <tr key={v.id} className={changed?'trace-changed':''}><th scope="row">{v.name}{v.scope&&<small>{v.scope}</small>}</th><td>{v.declaredType??'—'}</td><td><TraceValueView value={v.value} objects={current.objects}/>{changed&&<small>{old?'изменено':'новая'}</small>}</td></tr>})}</tbody></table></div>:<p>Переменные ещё не объявлены.</p>}
      <h4>Объекты</h4>{current.objects.length?current.objects.map(o=>{const old=previous?.objects.find(v=>v.id===o.id);return <GraphCard title={<>{o.type} #{o.id}</>} badge={!old?'Новый объект':undefined} className={`trace-object ${!old||traceValueKey({kind:'record',fields:old.fields})!==traceValueKey({kind:'record',fields:o.fields})?'trace-changed':''}`} key={o.id}><dl>{Object.entries(o.fields).map(([field,v])=><div key={field}><dt>{field}</dt><dd><TraceValueView value={v} objects={current.objects}/></dd></div>)}</dl></GraphCard>}):<p>Объектов нет.</p>}</section></div>
    {current.output!==undefined&&<section className="exercise-preview"><h4>Console Output</h4>{current.output.length?<pre className="exercise-code">{current.output.map((line,i)=><span key={i}>{line||'⏎ (пустая строка)'}{'\n'}</span>)}</pre>:<p>Вывода пока нет.</p>}</section>}
    <p className="trace-explanation" role="status">{current.explanation}</p>
    <div className="exercise-actions"><button type="button" className="secondary" disabled={index===0} onClick={()=>edit(moveTrace(e,a,snapshots[index-1].id))}>← Предыдущий шаг</button><button type="button" className="primary" disabled={index>=accessible} onClick={()=>edit(moveTrace(e,a,snapshots[index+1].id))}>Следующий шаг →</button><button type="button" className="secondary" onClick={()=>edit(moveTrace(e,a,snapshots[0].id))}>К началу трассировки</button></div>
    {p&&<section className="trace-prediction"><fieldset className="debug-fixes"><legend>{p.prompt}</legend>{p.options.map(option=><label key={option.id} className={r?.choiceId===option.id?'is-selected':''}><input type="radio" name={`trace-${e.id}-${p.id}`} checked={r?.choiceId===option.id} disabled={!!r?.checkedChoiceId} onChange={()=>edit(chooseTraceOption(e,a,p.id,option.id))}/><PredictionOption prediction={p} id={option.id} objects={current.objects}/></label>)}</fieldset><button type="button" className="primary" disabled={!r?.choiceId||!!r.checkedChoiceId} onClick={()=>{onChange(checkTracePrediction(e,s,p.id));onSubmit()}}>Проверить предсказание</button>{r?.checkedChoiceId&&<div className={`exercise-feedback ${r.checkedChoiceId===p.correctOptionId?'is-correct':'is-incorrect'}`} role="status"><strong>{r.checkedChoiceId===p.correctOptionId?'Верно':'Пока неверно'}</strong><div>Правильный ответ: <PredictionOption prediction={p} id={p.correctOptionId} objects={current.objects}/></div><p>{p.explanation}</p><p>Теперь доступен следующий шаг. Проверок этого вопроса: {r.attempts}.</p><button type="button" className="secondary" onClick={()=>edit(retryTraceOption(e,a,p.id))}>Повторить предсказание</button></div>}</section>}
  </div>
}
