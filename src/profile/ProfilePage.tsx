import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Topic } from '../lib/catalog'
import { courseProgress, toggleCompleted } from '../lib/profile'
import type { Course, Profession, Profile } from '../lib/profile'
import { courseCatalog, learningDirections } from '../lib/learningContent'
import {readCourseProgress} from '../lib/courseUpdates'
import { subscribeStorage, storageRevision } from '../lib/storage'
import { StudyStreak } from '../components/StudyStreak'
import type { StudyActivity } from '../lib/activity'
import './profile.css'
import { ProfileInfo } from './ProfileInfo'

type Props = {
  activity:StudyActivity
  activityError:string
  profile: Profile
  topics: Topic[]
  onChange: (profile: Profile) => void
  onOpenCourse: (topicId: string) => void
  onOpenLearning: (courseId: string) => void
  saveState: 'saved' | 'saving' | 'error'
  loadFailed: boolean
}

const percentFormat = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ProfilePage({ profile, topics, onChange, onOpenCourse, onOpenLearning, saveState, loadFailed,activity,activityError }: Props) {
  useSyncExternalStore(subscribeStorage,storageRevision,storageRevision)
  const learningCourses=courseCatalog.flatMap(e=>e.summary?[e.summary]:[])
  const learningLoads=learningCourses.map(course=>{
    try {return {id:course.id,status:readCourseProgress(course.id)??{started:false,completed:false,percent:0}}}
    catch {return {id:course.id,status:null}}
  })
  const learningFailed=learningLoads.some(item=>item.status===null)
  const learning=Object.fromEntries(learningLoads.flatMap(item=>item.status ? [[item.id,item.status]] : []))
  const [editing, setEditing] = useState<Profession | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<Course[]>([])
  const [error, setError] = useState('')
  const [removed, setRemoved] = useState<Profession | null>(null)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const progress = courseProgress(profile.professions.flatMap(p => p.courses), profile.completedCourseIds,learning)
  const professionForm = new Intl.PluralRules('ru').select(profile.professions.length)
  const professionLabel = professionForm === 'one' ? 'профессия' : professionForm === 'few' ? 'профессии' : 'профессий'
  useEffect(() => { heading.current?.focus(); window.scrollTo({ top: 0 }) }, [])
  useEffect(() => {
    if (showEditor) {
      dialog.current?.showModal()
      dialog.current?.querySelector<HTMLInputElement>('#profession-title')?.focus()
    }
    else dialog.current?.close()
  }, [showEditor])

  function openEditor(profession: Profession | null) {
    setEditing(profession)
    setTitle(profession?.title ?? '')
    setSelected(profession?.courses.filter(course => course.learningCourseId).map(course => ({ ...course })) ?? [])
    setError('')
    setShowEditor(true)
  }
  function toggleCourse(course: Course) {
    setSelected(current => current.some(item => item.id === course.id) ? current.filter(item => item.id !== course.id) : current.length < 300 ? [...current, course] : current)
  }
  function saveProfession(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) { setError('Введите название профессии.'); return }
    if (!selected.length) { setError('Добавьте хотя бы один курс.'); return }
    if (!editing && profile.professions.length >= 100) { setError('Можно создать не более 100 профессий.'); return }
    const profession: Profession = { id: editing?.id ?? crypto.randomUUID(), title: title.trim(), courses: selected }
    onChange({ ...profile, professions: editing ? profile.professions.map(p => p.id === editing.id ? profession : p) : [...profile.professions, profession] })
    setExpandedIds(current => current.includes(profession.id) ? current : [...current, profession.id])
    setShowEditor(false)
  }
  const catalogCourses: Course[] = learningCourses.map(course => ({ id: `learning:${course.id}`, title: course.title, learningCourseId: course.id }))

  return <section className="profile-page" aria-labelledby="profile-title">
    <div className="profile-intro"><span className="eyebrow">ВАШ ПУТЬ В ОБУЧЕНИИ</span><h1 ref={heading} tabIndex={-1} id="profile-title">Личный <span className="serif">кабинет.</span></h1><p>Соберите курсы под свою цель и отмечайте каждый пройденный шаг.</p></div>
    <StudyStreak activity={activity} error={activityError} />
    {learningFailed && <p className="profile-error" role="alert">Не удалось прочитать часть сохранений курсов. Прогресс может отображаться не полностью; перезапустите приложение.</p>}
    <div className="profile-overview">
      <section className="profile-totals" aria-label="Общий прогресс"><div><strong>{profile.professions.length}</strong><span>{professionLabel}</span></div><div><strong>{progress.done}<small> / {progress.total}</small></strong><span>курсов пройдено</span></div><div><strong>{percentFormat.format(progress.percent)}%</strong><span>вашего плана</span></div></section>
    </div>
    <p className={`profile-storage ${saveState === 'error' || loadFailed ? 'profile-error' : ''}`} role="status">{loadFailed ? 'Не удалось прочитать профиль. Изменения заблокированы, чтобы сохранить прежние данные. Перезапустите приложение.' : saveState === 'error' ? 'Не удалось сохранить изменения. Данные пока только на экране; повторите сохранение.' : saveState === 'saving' ? 'Сохраняем изменения…' : 'Сохранено на этом устройстве. На другом устройстве будет отдельный профиль.'}{saveState === 'error' && !loadFailed && <button className="text-button" onClick={() => onChange({ ...profile })}>Повторить сохранение</button>}</p>
    <div className="profession-heading"><div><h2>Мои профессии</h2><p>Вы решаете, какие курсы нужны для каждой цели.</p></div><button className="primary" onClick={() => openEditor(null)} disabled={loadFailed || profile.professions.length >= 100}>+ Создать профессию</button></div>
    {removed && <div className="profile-undo" role="status"><span>Профессия «{removed.title}» удалена.</span><button className="text-button" disabled={profile.professions.length >= 100 || loadFailed} onClick={() => { onChange({ ...profile, professions: [...profile.professions, removed] }); setRemoved(null) }}>Восстановить</button></div>}
    {!profile.professions.length ? <div className="profile-empty"><span aria-hidden="true">↗</span><h3>Начните со своей цели</h3><p>Например, «C# backend-разработчик». Добавьте нужные курсы и отмечайте, что уже прошли.</p><button className="secondary" disabled={loadFailed} onClick={() => openEditor(null)}>Создать первую профессию</button></div> : <div className="profession-grid">{profile.professions.map(profession => {
      const current = courseProgress(profession.courses, profile.completedCourseIds,learning)
      const expanded = expandedIds.includes(profession.id)
      return <article className="profession-card" key={profession.id}>
        <div className="profession-card-heading"><h3><button className="profession-toggle" aria-expanded={expanded} aria-controls={`profession-courses-${profession.id}`} onClick={() => setExpandedIds(ids => ids.includes(profession.id) ? ids.filter(id => id !== profession.id) : [...ids, profession.id])}><span>{profession.title}</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button></h3><button className="text-button" disabled={loadFailed} onClick={() => openEditor(profession)} aria-label={`Изменить профессию ${profession.title}`}>Изменить</button></div>
        <div className="profession-progress-label"><span>Пройдено {current.done} из {current.total} курсов</span><strong>{percentFormat.format(current.percent)}%</strong></div><progress max={100} value={current.percent} aria-label={`Прогресс профессии ${profession.title}`} />
        <div id={`profession-courses-${profession.id}`} hidden={!expanded}>
        <ul className="profession-courses">{profession.courses.filter(course => course.learningCourseId).map(course => {
          const topic = topics.find(item => item.id === course.topicId)
          const manualCompleted = profile.completedCourseIds.includes(course.id)
          const savedProgress=course.learningCourseId ? learning[course.learningCourseId] : undefined
          const completed=manualCompleted || savedProgress?.completed
          const isLegacyTopic = !!course.topicId && !course.learningCourseId
          const linkedCourse = learningCourses.find(item => item.id === course.learningCourseId)
          const coursePercent = courseProgress([course], profile.completedCourseIds,learning).percent
          return <li key={course.id} className={completed && !isLegacyTopic ? 'course-completed' : ''}><label>{!isLegacyTopic && <input type="checkbox" checked={manualCompleted} aria-label={`Отметить вручную: ${linkedCourse?.title ?? course.title}`} disabled={loadFailed} onChange={() => onChange(toggleCompleted(profile, course.id))} />}<span><strong>{linkedCourse?.title ?? topic?.title ?? course.title}</strong><small>{isLegacyTopic ? 'Ранее добавленная тема · не учитывается в прогрессе' : completed ? 'Пройден' : 'Ещё не пройден'}{linkedCourse ? ` · учебный курс${manualCompleted || savedProgress?.started ? ` · ${percentFormat.format(coursePercent)}%` : ''}` : isLegacyTopic ? '' : ' · свой курс'}</small></span></label>{topic && <button className="course-open" onClick={() => onOpenCourse(topic.id)} aria-label={`Открыть вопросы курса ${topic.title}`}>Вопросы <span aria-hidden="true">↗</span></button>}{linkedCourse && <button className="course-open" onClick={() => onOpenLearning(linkedCourse.id)} aria-label={`Открыть курс ${linkedCourse.title}`}>К обучению ↗</button>}</li>
        })}</ul><button className="text-button profession-delete" disabled={loadFailed} onClick={() => { setRemoved(profession); onChange({ ...profile, professions: profile.professions.filter(p => p.id !== profession.id) }) }}>Удалить профессию</button>
        </div>
      </article>
    })}</div>}
    <ProfileInfo />
    <dialog ref={dialog} className="profession-editor" aria-labelledby="profession-editor-title" onCancel={() => setShowEditor(false)} onClose={() => setShowEditor(false)}>
      <div className="profession-editor-heading"><h2 id="profession-editor-title">{editing ? 'Изменить профессию' : 'Новая профессия'}</h2><button className="icon-button" aria-label="Закрыть редактор профессии" onClick={() => setShowEditor(false)}>×</button></div>
      <form onSubmit={saveProfession}><label className="profile-field" htmlFor="profession-title">Название профессии<input id="profession-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={100} placeholder="Например, C# backend-разработчик" autoFocus required /></label>
        <p className="editor-hint">Добавьте учебные курсы с теорией и заданиями, которые нужны для этой профессии.</p>
        {learningDirections.filter(direction => learningCourses.some(course => course.direction === direction.id)).map(direction => <fieldset key={direction.id}><legend>{direction.title}</legend>{learningCourses.filter(course => course.direction === direction.id).map(item => {
          const course = catalogCourses.find(course => course.learningCourseId === item.id)!
          return <label className="editor-course" key={course.id}><input type="checkbox" checked={selected.some(item => item.id === course.id)} onChange={() => toggleCourse(course)} /><span>{course.title}</span></label>
        })}</fieldset>)}
        {error && <p className="profile-error" role="alert">{error}</p>}<div className="profession-editor-actions"><button type="button" className="secondary" onClick={() => setShowEditor(false)}>Отмена</button><button type="submit" className="primary">{editing ? 'Сохранить изменения' : 'Создать профессию'}</button></div>
      </form>
    </dialog>
  </section>
}
