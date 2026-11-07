import type { LearningQuestion } from '../lib/learning'
import { hasLearningAnswer,isLearningCorrect } from '../lib/learning'
import {CodeExample,QuestionText} from '../components/CodeExample'

export function QuestionCard({question:q,value,order,feedback,disabled,onAnswer,onCheck,onRepeat}:{question:LearningQuestion;value?:string;order?:number[];feedback:boolean;disabled:boolean;onAnswer:(value:string)=>void;onCheck?:()=>void;onRepeat?:()=>void}) {
  const correct=isLearningCorrect(q,value)
  const selected=(i:number)=>q.kind==='multi' ? (value??'').split(',').includes(String(i)) : value===String(i)
  const expected=(i:number)=>q.kind==='multi' ? q.correct.includes(i) : q.kind==='choice' && i===q.correct
  const choose=(i:number)=>{if(q.kind!=='multi'){onAnswer(String(i));return}const set=new Set((value??'').split(',').filter(Boolean));if(set.has(String(i)))set.delete(String(i));else set.add(String(i));onAnswer([...set].sort().join(','))}
  return <article className={`learning-question ${feedback ? correct ? 'is-correct' : 'is-incorrect' : ''}`}>
    <span className="learning-question-type">{q.kind==='multi' ? 'Выберите все правильные варианты' : q.kind==='choice' ? 'Один правильный вариант' : 'Краткий ответ · разбор примера'}</span><h3 id={`learning-${q.id}`}><QuestionText text={q.prompt}/></h3>{q.code && <CodeExample code={q.code}/>}
    {q.kind!=='output' ? <fieldset disabled={disabled} aria-labelledby={`learning-${q.id}`} className="learning-options">{(order??[0,1,2,3]).map(index=><label key={index} className={`${selected(index) ? 'is-selected' : ''} ${feedback && expected(index) ? 'is-answer' : ''} ${feedback && !correct && selected(index) && !expected(index) ? 'is-wrong-answer' : ''}`}><input type={q.kind==='multi' ? 'checkbox' : 'radio'} name={q.id} checked={selected(index)} onChange={()=>choose(index)}/><span><QuestionText text={q.options[index]}/></span>{feedback && expected(index) && <span aria-label="Правильный ответ">✓</span>}</label>)}</fieldset> : <label className="learning-output">Ваш ответ<textarea rows={2} value={value??''} disabled={disabled} aria-labelledby={`learning-${q.id}`} placeholder="Напишите ответ или результат примера…" onChange={e=>onAnswer(e.target.value)}/><small>Переносы строк и пробелы между значениями равнозначны. Регистр текста важен.</small></label>}
    {!disabled && onCheck && <button className="secondary learning-check-answer" disabled={!hasLearningAnswer(q,value)} onClick={onCheck}>Проверить ответ</button>}
    {feedback && <div className="learning-explanation" role={disabled && !onCheck ? undefined : 'status'}><strong>{correct ? 'Верно' : 'Неверный ответ'}{q.kind==='output' ? ` · Ожидаемый вывод: ${q.answers[0]}` : ''}</strong>{q.kind!=='output' && !correct && <p>Правильный ответ: {q.options.filter((_,i)=>expected(i)).join('; ')}</p>}<p><QuestionText text={q.explanation}/></p>{onRepeat && <button className="text-button" onClick={onRepeat}>Повторить теорию урока</button>}</div>}
  </article>
}
