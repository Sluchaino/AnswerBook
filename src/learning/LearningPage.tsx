import {DirectionGroup} from '../components/DirectionGroup'
import {CoinWallet} from '../components/CoinWallet'
import {LockedCourse} from './LockedCourse'
import {coursePrice} from '../lib/economy'
import type { StudyEventInput } from '../lib/activity'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { learningCourses, learningDirections } from '../lib/learningContent'
import { freshLearningAttempt, restoreLearningAttempt, learningScore, learningProgress } from '../lib/learning'
import { learningStorageKey, readStored, subscribeStorage, storageRevision } from '../lib/storage'
import { StudyStreak } from '../components/StudyStreak'
import type { StudyActivity } from '../lib/activity'
import { CoursePlayer } from './CoursePlayer'
import { Select } from '../components/Select'
import './learning.css'

const plural = new Intl.PluralRules('ru')
function count(n: number, one: string, few: string, many: string) {
  const form = plural.select(n)
  return `${n} ${form === 'one' ? one : form === 'few' ? few : many}`
}

const percentFormat=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})
export function LearningPage({ initialCourseId,activity,activityError,onStudy,purchaseCourse,purchaseFreeze,retrySave,busy }: { retrySave:()=>Promise<void>;purchaseCourse:(id:string,price:number)=>Promise<void>;purchaseFreeze:()=>Promise<void>;busy:boolean;initialCourseId?: string | null;activity:StudyActivity;activityError:string;onStudy:(event?:StudyEventInput)=>void }) {
  const [selected, setSelected] = useState(initialCourseId ?? null)
  const [mode, setMode] = useState<'learn' | 'exam' | 'result'>('learn')
  useSyncExternalStore(subscribeStorage,storageRevision,storageRevision)
  const [directionId, setDirectionId] = useState('all')
  const [query, setQuery] = useState('')
  const matches = (item: typeof learningCourses[number]) => `${item.title} ${item.description}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))
  const [, setRevision] = useState(0)
  const onSaved = useCallback(() => setRevision(n => n + 1), [])
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (!selected) { heading.current?.focus(); window.scrollTo({ top:0 }) } }, [selected])
  const course = learningCourses.find(item => item.id === selected)
  if (course && !activity.economy?.unlockedIds.includes(course.id)) return <LockedCourse course={course} activity={activity} error={activityError} purchaseCourse={purchaseCourse} retrySave={retrySave} purchaseFreeze={purchaseFreeze} busy={busy} onClose={()=>setSelected(null)}/>
  if (course) return <CoursePlayer key={`${course.id}-${mode}`} course={course} mode={mode} onSaved={onSaved} onClose={() => setSelected(null)} onStudy={onStudy} />
  return <section className="learning-page">
    <div className="learning-intro"><span className="eyebrow">ПОНЯТЬ, ПОПРОБОВАТЬ, ЗАКРЕПИТЬ</span><h1 ref={heading} tabIndex={-1}>Учиться <span className="serif">с пониманием.</span></h1><p>{count(learningCourses.length, 'курс', 'курса', 'курсов')} · {count(learningDirections.length, 'направление', 'направления', 'направлений')}. Теория и проверка знаний — в своём темпе и без интернета.</p></div>
    <CoinWallet activity={activity} error={activityError} retrySave={retrySave} purchaseFreeze={purchaseFreeze} busy={busy}/>
    <StudyStreak activity={activity} error={activityError} />
    <div className="course-discovery"><label className="course-search"><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" placeholder="Найти курс" aria-label="Найти курс" value={query} onChange={event => setQuery(event.target.value)} /></label><Select label="Направление" value={directionId} onChange={setDirectionId} options={[{value:'all',label:'Все направления'}, ...learningDirections.map(direction => ({value:direction.id,label:direction.title}))]} /></div>
    {!learningCourses.some(item => matches(item) && (directionId === 'all' || item.direction === directionId)) && <p className="course-empty" role="status">Курсы не найдены. Измените запрос или направление.</p>}
    {learningDirections.filter(direction => (directionId === 'all' || direction.id === directionId) && learningCourses.some(item => item.direction === direction.id && matches(item))).map(direction => <DirectionGroup key={`${direction.id}:${query.trim()}:${directionId}`} title={direction.title} description={direction.description} count={count(learningCourses.filter(item => item.direction === direction.id && matches(item)).length, 'курс', 'курса', 'курсов')}>
    <div className="learning-course-grid">{learningCourses.filter(item => item.direction === direction.id && matches(item)).map(item => {
      let attempt = freshLearningAttempt(item), failed = false
      try { attempt = restoreLearningAttempt(readStored(learningStorageKey(item.id)), item,item.previous) }
      catch { failed = true }
      const unlocked=activity.economy?.unlockedIds.includes(item.id)??false
      const price=activity.economy ? coursePrice(activity.economy) : 100
      const score = learningScore(item, attempt)
      const progress = learningProgress(item,attempt)
      const outputs = item.lessons.flatMap(lesson => lesson.questions).filter(q => q.kind === 'output').length
      return <article className="learning-course-card" key={item.id} aria-labelledby={`course-title-${item.id}`}>
        <span className={`topic-symbol ${item.color}`}>{item.symbol}</span><span className="learning-badge">Теория + тест</span>
        <h3 id={`course-title-${item.id}`}>{item.title}</h3><p>{item.description}</p>
        <p className="content-provenance">Создано с помощью ИИ</p><p className="learning-scope">{item.scope === 'universal' ? 'Универсальный курс' : 'Для C# / .NET'}</p>
        <div className="learning-card-stats"><span>{count(item.lessons.length, 'блок', 'блока', 'блоков')}</span><span>{count(score.total, 'задание', 'задания', 'заданий')}</span>{outputs > 0 && <span>{count(outputs, 'задача', 'задачи', 'задач')} на результат</span>}</div>
        {!failed && progress.started && <div className="learning-card-progress"><div><span>{attempt.finished ? 'Курс пройден' : 'Прогресс прохождения'}</span><strong>{percentFormat.format(progress.percent)}%</strong></div><progress value={progress.percent} max={100} aria-label={`Прогресс курса ${item.title}`} /></div>}
        {attempt.lastResult && <p className="learning-last-score">Последний результат: {attempt.lastResult.correct}/{attempt.lastResult.total} · точность {percentFormat.format(attempt.lastResult.percent)}%</p>}
        <p className="course-access">{unlocked ? 'Курс открыт' : `Доступ за ${price} монет`}</p>
        <div className="learning-course-actions">{unlocked ? <><button className="primary" disabled={failed} aria-label={attempt.finished ? `Открыть результат: ${item.title}` : `${score.answered ? 'Продолжить' : 'Открыть'} курс: ${item.title}`} onClick={() => { setMode(attempt.finished ? 'result' : 'learn'); setSelected(item.id) }}>{attempt.finished ? 'Открыть результат' : score.answered ? `Продолжить · ${score.answered} из ${score.total}` : 'Открыть курс'} <span aria-hidden="true">↗</span></button>{attempt.lastResult && !attempt.finished && <button className="secondary" onClick={()=>{setMode('result');setSelected(item.id)}}>Последний результат</button>}<button className="secondary" disabled={failed} aria-label={`Сдать досрочно: ${item.title}`} onClick={() => { setMode('exam'); setSelected(item.id) }}>Сдать досрочно</button></> : <button className="primary" disabled={failed||!activity.economy} aria-label={`Купить курс: ${item.title}`} onClick={()=>{setMode('learn');setSelected(item.id)}}>Открыть за {price} монет <span aria-hidden="true">↗</span></button>}</div>
        {failed && <p className="learning-error" role="alert">Не удалось прочитать сохранение этого курса. Перезапустите приложение; прежние данные не перезаписаны.</p>}
      </article>
    })}</div></DirectionGroup>)}
  </section>
}
