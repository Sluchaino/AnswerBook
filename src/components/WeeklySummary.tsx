import { useId } from 'react'
import { weeklySummary } from '../lib/activity'
import type { StudyActivity } from '../lib/activity'
import './study-streak.css'

export function WeeklySummary({activity,now,error}:{activity:StudyActivity;now:Date;error?:string}) {
  const id=useId(),week=weeklySummary(activity,now)
  const date=(day:string)=>new Date(day+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'})
  return <section className="weekly-summary-card" aria-labelledby={id}>
    <details className="weekly-summary"><summary><h2 id={id}>Итоги недели</h2><span>{week.days} из 7 дней занятий</span></summary>
      <p className="streak-hint">{date(week.start)} — {date(week.end)} · последние семь дней</p>
      <div className="weekly-stats"><span><strong>{week.days}</strong>дней занятий</span><span><strong>{week.blocks}</strong>блоков изучено</span><span><strong>{week.answers}</strong>вопросов обработано</span><span><strong>{week.reviews}</strong>ошибок разобрано</span><span><strong>{week.courses}</strong>курсов завершено</span></div>
      <p className="streak-hint">{week.change>0 ? `На ${week.change} дн. больше, чем за предыдущие семь дней.` : week.change<0 ? `На ${-week.change} дн. меньше, чем за предыдущие семь дней.` : 'Столько же дней занятий, сколько за предыдущие семь дней.'}</p>
      <p className="streak-hint">Подробная статистика собирается с версии 1.30. Один вопрос или блок учитывается один раз в день; верность открытых ответов не оценивается.</p>
    </details>
    {error && <p className="learning-error" role="alert">{error}</p>}
  </section>
}
