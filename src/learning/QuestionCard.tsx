import type { LearningQuestion } from '../lib/learning'
import { hasLearningAnswer,isLearningCorrect } from '../lib/learning'

export function QuestionCard({question:q,value,order,feedback,disabled,onAnswer,onCheck,onRepeat}:{question:LearningQuestion;value?:string;order?:number[];feedback:boolean;disabled:boolean;onAnswer:(value:string)=>void;onCheck?:()=>void;onRepeat?:()=>void}) {
  const correct=isLearningCorrect(q,value)
  return <article className={`learning-question ${feedback ? correct ? 'is-correct' : 'is-incorrect' : ''}`}>
    <span className="learning-question-type">{q.kind==='choice' ? 'Один правильный вариант' : 'Краткий ответ · разбор примера'}</span><h3 id={`learning-${q.id}`}>{q.prompt}</h3>{q.code && <pre><code>{q.code}</code></pre>}
    {q.kind==='choice' ? <fieldset disabled={disabled} aria-labelledby={`learning-${q.id}`} className="learning-options">{(order??[0,1,2,3]).map(index=><label key={index} className={`${value===String(index) ? 'is-selected' : ''} ${feedback && index===q.correct ? 'is-answer' : ''} ${feedback && !correct && value===String(index) ? 'is-wrong-answer' : ''}`}><input type="radio" name={q.id} checked={value===String(index)} onChange={()=>onAnswer(String(index))}/><span>{q.options[index]}</span>{feedback && index===q.correct && <span aria-label="Правильный ответ">✓</span>}</label>)}</fieldset> : <label className="learning-output">Ваш ответ<textarea rows={2} value={value??''} disabled={disabled} aria-labelledby={`learning-${q.id}`} placeholder="Напишите ответ или результат примера…" onChange={e=>onAnswer(e.target.value)}/><small>Переносы строк и пробелы между значениями равнозначны. Регистр текста важен.</small></label>}
    {!disabled && onCheck && <button className="secondary learning-check-answer" disabled={!hasLearningAnswer(q,value)} onClick={onCheck}>Проверить ответ</button>}
    {feedback && <div className="learning-explanation" role={disabled && !onCheck ? undefined : 'status'}><strong>{correct ? 'Верно' : 'Неверный ответ'}{q.kind==='output' ? ` · Ожидаемый вывод: ${q.answers[0]}` : ''}</strong>{q.kind==='choice' && !correct && <p>Правильный ответ: {q.options[q.correct]}</p>}<p>{q.explanation}</p>{onRepeat && <button className="text-button" onClick={onRepeat}>Повторить теорию блока</button>}</div>}
  </article>
}
