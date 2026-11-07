import {debugCodeLines,debugFixOptions,previewDebugCode} from '../lib/exercises'
import type {CodeDebugExercise,DebugAnswer,ExerciseResult} from '../lib/exercises'

export function CodeDebugInput({exercise:e,answer:a,order,result,onChange}:{exercise:CodeDebugExercise;answer:DebugAnswer;order:string[];result?:ExerciseResult;onChange:(answer:DebugAnswer)=>void}) {
  const fixes=a.selection?debugFixOptions(e,a.selection.line):[]
  const displayed=a.selection?.line===e.content.errors[0].location.line?order.map(id=>fixes.find(f=>f.id===id)!):[...fixes].sort((a,b)=>{
    const rank=(id:string)=>{const index=Number(id.match(/fix-(\d+)$/)?.[1]??0);return order.indexOf(e.content.fixOptions[index%e.content.fixOptions.length].id)}
    return rank(a.id)-rank(b.id)
  })
  return <>
    <p className="exercise-language">Язык: {e.content.language} · Код не запускается</p>
    <h3 className="debug-step">1. Найдите ошибочную строку</h3>
    <div className="debug-source" role="group" aria-label="Исходный код: выберите ошибочную строку">
      {debugCodeLines(e.content.code).map((line,index)=>{
        const selected=a.selection?.line===index+1
        const checked=selected&&result
        return <button type="button" key={index} className={`debug-line ${selected?'is-selected':''} ${checked?(result.debugStatus==='wrong-line'?'is-wrong':'is-found'):''}`} aria-pressed={selected} aria-label={`Выбрать строку ${index+1}: ${line.trim()||'пустая строка'}`} onClick={()=>onChange(a.selection?.line===index+1?a:{type:'code-debug',selection:{kind:'line',line:index+1}})}><span aria-hidden="true">{index+1}</span><code>{line||' '}</code></button>
      })}
    </div>
    {a.selection?<><h3 className="debug-step">2. Выберите исправление для строки {a.selection.line}</h3>
      <fieldset className={`debug-fixes ${result?.debugStatus==='wrong-fix'?'is-wrong':''}`}><legend>Варианты исправления</legend>
        {displayed.map(option=>{const id=option.id
          return <label key={id} className={a.fixId===id?'is-selected':''}><input type="radio" name={`debug-fix-${e.id}`} value={id} checked={a.fixId===id} aria-label={option.code.trim()?undefined:'Пустой вариант кода'} onChange={()=>onChange({...a,fixId:id})}/><span className="debug-fix-content"><code className="exercise-code debug-fix-code">{option.code||' '}</code></span></label>
        })}
      </fieldset>
    </>:<p>Нажмите на строку кода, чтобы открыть варианты исправления.</p>}
    {a.selection&&a.fixId&&<section className="exercise-preview" aria-label="Предпросмотр исправленного кода"><h3>Код с вашим исправлением</h3><p>Подставлен выбранный вариант. Это предпросмотр, а не подтверждение правильности.</p><pre className="exercise-code"><code>{previewDebugCode(e,a)}</code></pre></section>}
  </>
}
