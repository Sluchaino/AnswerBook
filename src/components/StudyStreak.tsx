import { useEffect, useState } from 'react'
import type { StudyActivity } from '../lib/activity'
import { studyStreak, weeklySummary } from '../lib/activity'
import './study-streak.css'
import { WeeklySummary } from './WeeklySummary'

export function StudyStreak({activity,error}:{activity:StudyActivity;error?:string}) {
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{const refresh=()=>setNow(new Date());const timer=window.setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)}},[])
  const streak=studyStreak(activity,now)
  const week=weeklySummary(activity,now)
  return <><section className="study-streak" aria-label="Серия занятий">
    <div className="streak-main"><span aria-hidden="true" className="streak-symbol">✦</span><div><h2>Серия занятий · {streak.current}</h2><p>{streak.today ? 'Сегодня вы уже занимались' : streak.current ? 'Продолжите серию сегодня' : 'Начните серию сегодня'}</p></div><strong title="Самая длинная серия">Рекорд: {streak.best}</strong></div>
    <div className="streak-week" aria-label="Последние семь дней">{streak.week.map(day=><span key={day.day} className={`${day.active ? 'is-active' : ''} ${day.frozen ? 'is-frozen' : ''} ${day.today ? 'is-today' : ''}`} aria-label={`${new Date(day.day+'T12:00:00').toLocaleDateString('ru-RU')}: ${day.active ? 'занимались' : day.frozen ? 'серия сохранена заморозкой' : 'нет занятия'}`}><time dateTime={day.day}>{new Date(day.day+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'short'})}</time><span aria-hidden="true">{day.active ? '✓' : day.frozen ? '❄' : '·'}</span></span>)}</div>
    <p className="streak-hint">День засчитывается за изучение теории или работу с ответами. Серия считается по местным датам устройства.</p>
    <details className="streak-freezes"><summary>❄ Заморозка серии · в запасе {activity.freezeTokens??1} из 2</summary><p>Автоматически сохраняет серию за пропущенный день. Одна доступна сразу, ещё одна начисляется за каждые 7 дней занятий. Запас — до двух. Заморозка не прибавляет дни учёбы. Если на весь перерыв запаса не хватает, заморозки не тратятся.</p>{week.frozen>0 && <p>За последние 7 дней использовано: {week.frozen}.</p>}</details>

    {error && <p className="learning-error" role="alert">{error}</p>}
  </section><WeeklySummary activity={activity} now={now} error={error}/></>
}
