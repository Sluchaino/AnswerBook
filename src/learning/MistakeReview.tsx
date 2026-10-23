import type { StudyEventInput } from '../lib/activity'
import type { MistakeReview as Review } from '../lib/learning'
import { answerMistake,checkMistake,finishMistakeReview,startMistakeReview,resultItems,hasLearningAnswer,isLearningCorrect } from '../lib/learning'
import type { LearningResult } from '../lib/learning'
import { QuestionCard } from './QuestionCard'

const percent=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})
export function MistakeReview({review,source,onChange,onStudy,onBack}:{review:Review;source:LearningResult;onChange:(review:Review)=>void;onStudy:(event?:StudyEventInput)=>void;onBack:()=>void}) {
  const checked=review.items.filter(i=>hasLearningAnswer(i.question,review.answers[i.question.id]) && review.checkedAnswers[i.question.id]===review.answers[i.question.id]).length
  const result=review.finished ? review.lastResult : undefined
  const remaining=result?.items.filter(i=>!isLearningCorrect(i.question,i.answer)).length??0
  return <section aria-label="Работа над ошибками">
    <div className="learning-test-bar"><div><strong>{result ? `Верно: ${result.correct} из ${result.total} · ${percent.format(result.percent)}%` : `Проверено: ${checked} из ${review.items.length}`}</strong><span>Отдельное повторение. Исходная оценка курса сохраняется.</span>{!result && <progress value={checked} max={review.items.length} aria-label="Прогресс работы над ошибками"/>}</div>{!result && <button className="primary" disabled={checked!==review.items.length} onClick={()=>{onStudy();onChange(finishMistakeReview(review))}}>Завершить повторение</button>}</div>
    <div className="learning-result-actions"><button className="secondary" onClick={onBack}>← К результату курса</button>{result && remaining>0 && <button className="primary" onClick={()=>{const next=startMistakeReview(source,review);if(next)onChange(next)}}>Повторить оставшиеся ошибки · {remaining}</button>}</div>
    {result && !remaining && <p className="learning-review-success" role="status">Все ошибки в этом повторении разобраны.</p>}
    {!!review.results.length && <details className="learning-history"><summary>История повторений · {review.results.length}</summary><ul>{[...review.results].reverse().map(r=><li key={r.id}>{r.finishedAt ? new Date(r.finishedAt).toLocaleString('ru-RU') : 'Ранее'} · {r.correct}/{r.total} · {percent.format(r.percent)}%</li>)}</ul></details>}
    <div className="learning-questions">{(result ? resultItems(result) : review.items).map(item=>{const q=item.question,feedback=!!result || review.checkedAnswers[q.id]!==undefined;return <section key={q.id}><p className="learning-result-context">{item.lessonTitle}</p><QuestionCard question={q} value={result ? item.answer : review.answers[q.id]} order={review.optionOrders[q.id]} feedback={feedback} disabled={feedback} onAnswer={value=>onChange(answerMistake(review,q.id,value))} onCheck={result ? undefined : ()=>{onStudy({kind:'review',id:q.id});onChange(checkMistake(review,q.id))}}/></section>})}</div>
  </section>
}
