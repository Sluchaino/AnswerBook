import {ArchitectureInput,ArchitectureFeedback} from './ArchitectureInput'
import {CodeTraceInput} from './CodeTraceInput'
import {useState} from 'react'
import {DataTransformInput} from './DataTransformInput'
import {describeDataStep} from '../lib/dataTransforms'
import {Select} from '../components/Select'
import {assembleExerciseCode,exerciseOrderItems,checkExercise,editExercise,exerciseAnswerComplete,resetExercise,submitExercise,retryArchitecture} from '../lib/exercises'
import type {Exercise,ExerciseState} from '../lib/exercises'
import {OrderList} from './OrderList'
import {CodeDebugInput} from './CodeDebugInput'
import './exercises.css'

export function ExercisePlayer({exercise:e,state:s,onChange,onSubmit}:{exercise:Exercise;state:ExerciseState;onChange:(state:ExerciseState)=>void;onSubmit:()=>void}) {
  const [resetCount,setResetCount]=useState(0)
  const result=s.checkedAnswer?checkExercise(e,s.checkedAnswer):undefined
  const errors=result?.incorrectIds??[]
  const solution=e.type==='matching' ? e.content.left.map(item=>`${item.label} → ${e.content.right.find(r=>r.id===e.validation.pairs[item.id])!.label}`) : (e.type==='code-debug'||e.type==='data-transform'||e.type==='code-trace'||e.type==='architecture-builder')?[]:e.validation.acceptedOrders[0].map(id=>exerciseOrderItems(e).find(i=>i.id===id)!.label)
  const debugMessage=result?.debugStatus==='wrong-line'?'Ошибка находится в другой строке.':result?.debugStatus==='wrong-fix'?'Строка найдена верно, но исправление не подходит.':result?.debugStatus==='correct'?'Верно выбраны строка и исправление.':undefined
  return <section className="exercise-player" aria-labelledby={`exercise-${e.id}`}>
    <p className="exercise-badge">Тренировка · не влияет на оценку</p>
    <h2 id={`exercise-${e.id}`}>{e.title}</h2><p>{e.description}</p><p className="exercise-instructions">{e.instructions}</p>
    <p className="exercise-stats">Проверок: {s.attempts}{s.solvedAnswer?' · Успешно выполнено ✓':''}</p>
    {e.type==='code-order'&&<><p className="exercise-language">Язык: {e.content.language} · Код не запускается</p>{e.content.context&&<section className="exercise-context"><h3>Контекст задачи</h3><pre className="exercise-code"><code>{e.content.context}</code></pre></section>}</>}
    {(e.type==='sequence'||e.type==='code-order')&&(s.answer.type==='sequence'||s.answer.type==='code-order')&&<OrderList items={exerciseOrderItems(e)} order={s.answer.order} incorrectIds={errors} code={e.type==='code-order'} language={e.type==='code-order'?e.content.language:undefined} onChange={order=>onChange(editExercise(e,s,{type:e.type,order}))}/>}
    {e.type==='code-debug'&&s.answer.type==='code-debug'&&<CodeDebugInput exercise={e} answer={s.answer} order={s.rightOrder??e.content.fixOptions.map(f=>f.id)} result={result} onChange={answer=>onChange(editExercise(e,s,answer))}/>}
    {e.type==='code-order'&&s.answer.type==='code-order'&&<section className="exercise-preview" aria-label="Предварительный просмотр программы"><h3>Собранная программа</h3><p>Предпросмотр вашего порядка, без выполнения. Фиксированные части включены.</p><pre className="exercise-code"><code>{assembleExerciseCode(e,s.answer.order)}</code></pre></section>}
    {e.type==='data-transform'&&s.answer.type==='data-transform'&&<DataTransformInput key={resetCount} exercise={e} answer={s.answer} onChange={answer=>onChange(editExercise(e,s,answer))}/>}
    {e.type==='code-trace'&&s.answer.type==='code-trace'&&<CodeTraceInput exercise={e} state={s} answer={s.answer} onChange={onChange} onSubmit={onSubmit}/>}
    {e.type==='architecture-builder'&&s.answer.type==='architecture-builder'&&<ArchitectureInput key={resetCount} exercise={e} answer={s.answer} result={result} onChange={answer=>onChange(editExercise(e,s,answer))}/>}
    {e.type==='matching'&&s.answer.type==='matching'&&<div className="exercise-matching">{e.content.left.map(item=>{
      const pairs=s.answer.type==='matching'?s.answer.pairs:{}
      const options=(s.rightOrder??e.content.right.map(i=>i.id)).filter(id=>id===pairs[item.id]||!Object.values(pairs).includes(id)).map(id=>({value:id,label:e.content.right.find(i=>i.id===id)!.label}))
      return <div key={item.id} className={errors.includes(item.id)?'exercise-item-error':''}>
        <Select label={item.label} value={pairs[item.id]??''} options={[{value:'',label:'Не выбрано'},...options]} onChange={value=>{const next={...pairs};if(value)next[item.id]=value;else delete next[item.id];onChange(editExercise(e,s,{type:'matching',pairs:next}))}}/>
        {errors.includes(item.id)&&<small>Проверьте это соответствие</small>}
      </div>
    })}</div>}
    <div className="exercise-actions"><button type="button" className="primary" disabled={!exerciseAnswerComplete(e,s.answer)||!!s.checkedAnswer} onClick={()=>{onChange(submitExercise(e,s));onSubmit()}}>{e.type==='code-trace'?'Завершить трассировку':'Проверить упражнение'}</button>{(e.type==='code-order'||e.type==='code-debug'||e.type==='data-transform'||e.type==='architecture-builder')&&result&&<button type="button" className="secondary" onClick={()=>onChange(e.type==='architecture-builder'?retryArchitecture(s):editExercise(e,s,s.answer))}>Повторить попытку</button>}<button type="button" className="secondary" onClick={()=>{onChange(resetExercise(e,s));setResetCount(n=>n+1)}}>Начать заново</button></div>
    {result&&e.type==='architecture-builder'&&<ArchitectureFeedback exercise={e} state={s} result={result} onChange={onChange}/>}
    {result&&e.type!=='architecture-builder'&&<div className={`exercise-feedback ${result.correct?'is-correct':'is-incorrect'}`} role="status"><strong>{result.correct?'Верно':'Нужно исправить'}</strong>{debugMessage&&<p>{debugMessage}</p>}{result.conditions&&<ul>{result.conditions.map(c=><li key={c.id}>{c.passed?'✓':'✗'} {c.label}</li>)}</ul>}<p>{result.correct?e.feedback.success:e.feedback.failure}</p><p>{e.feedback.explanation}</p>{e.type==='code-debug'?e.content.errors.map(error=><details key={error.id}><summary>Разбор ошибки · строка {error.location.line}</summary><p>{error.explanation}</p>{e.validation.acceptedFixes[error.id].map(id=><pre className="exercise-code" key={id}><code>{e.content.fixOptions.find(f=>f.id===id)!.code}</code></pre>)}</details>):e.type==='data-transform'?<details><summary>Пример правильной цепочки</summary><ol>{e.validation.solution.map((step,i)=><li key={i}>{describeDataStep(step,e.content.presentation)}</li>)}</ol></details>:e.type==='code-trace'?null:<details><summary>{e.type==='matching'?'Правильные соответствия':'Один из допустимых порядков'}</summary>{e.type==='code-order'?<pre className="exercise-code"><code>{assembleExerciseCode(e,e.validation.acceptedOrders[0])}</code></pre>:<ol>{solution.map((line,i)=><li key={i}>{line}</li>)}</ol>}</details>}<p>Измените решение и проверьте ещё раз или начните заново. Точность курса не меняется.</p></div>}
  </section>
}
