import {DirectionGroup} from '../components/DirectionGroup'
import {CourseOverview} from './CourseOverview'
import type {StudyActivity,StudyEventInput} from '../lib/activity'
import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {learningCourses,learningDirections,courseCatalog,subscribeLearning,learningContentRevision} from '../lib/learningContent'
import {downloadCourse,removeCourse,readCourseProgress} from '../lib/courseUpdates'
import {freshLearningAttempt,restoreLearningAttempt} from '../lib/learning'
import {learningStorageKey,readStored,subscribeStorage,storageRevision} from '../lib/storage'
import {StudyStreak} from '../components/StudyStreak'
import {CoursePlayer} from './CoursePlayer'
import {Select} from '../components/Select'
import './learning.css'

const percentFormat=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})
const onCourseSaved=()=>{}
const plural=new Intl.PluralRules('ru')
const courseCount=(n:number)=>`${n} ${plural.select(n)==='one'?'курс':plural.select(n)==='few'?'курса':'курсов'}`
const size=(bytes:number)=>`${(bytes/1024/1024).toLocaleString('ru-RU',{maximumFractionDigits:1})} МБ`
export function LearningPage({initialCourseId,activity,activityError,onStudy,courseSyncStatus,onRefreshCourses,onResetCourse}:{initialCourseId?:string|null;activity:StudyActivity;activityError:string;onStudy:(event?:StudyEventInput)=>void;courseSyncStatus:string;onRefreshCourses:()=>Promise<void>;onResetCourse:(id:string)=>Promise<void>}){
  useSyncExternalStore(subscribeLearning,learningContentRevision,learningContentRevision)
  useSyncExternalStore(subscribeStorage,storageRevision,storageRevision)
  const [selected,setSelected]=useState<string|null>(null)
  const [preview,setPreview]=useState<string|null>(initialCourseId??null)
  const [mode,setMode]=useState<'learn'|'exam'|'result'>('learn')
  const [initialStep,setInitialStep]=useState<string>()
  const [query,setQuery]=useState(''),[directionId,setDirection]=useState('all')
  const [working,setWorking]=useState<Record<string,string>>({}),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [deleteId,setDeleteId]=useState<string|null>(null)
  const [clearConfirm,setClearConfirm]=useState<string|null>(null)
  const heading=useRef<HTMLHeadingElement>(null)
  const activeOperations=useRef(new Set<string>())
  useEffect(()=>{if(!selected){heading.current?.focus();window.scrollTo({top:0})}},[selected])
  async function manage(id:string,action:'download'|'remove'|'removeAll'){
    if(activeOperations.current.has(id))return
    activeOperations.current.add(id);setError('');setNotice('');setWorking(s=>({...s,[id]:action!=='download'?'Удаляем…':'Загружаем…'}))
    try{if(action!=='download'){try{await removeCourse(id,action==='removeAll')}finally{if(action==='removeAll')await onResetCourse(id)}setDeleteId(null);setClearConfirm(null);setNotice(action==='removeAll'?'Курс и его данные удалены. При повторном скачивании обучение начнётся заново.':'Материалы удалены. Ответы, результаты и прогресс сохранены.')}else{await downloadCourse(id);setNotice('Курс скачан и доступен без интернета.')}}
    catch(e){setError(e instanceof TypeError?'Не удалось загрузить курс. Проверьте подключение к интернету и повторите попытку.':e instanceof Error?e.message:'Не удалось изменить материалы курса.')}
    finally{activeOperations.current.delete(id);setWorking(s=>{const next={...s};delete next[id];return next})}
  }
  const open=(id:string,stepId?:string)=>{setInitialStep(stepId);setMode('learn');setPreview(null);setSelected(id)}
  const course=learningCourses.find(c=>c.id===selected)
  if(course)return <CoursePlayer key={`${course.id}-${mode}-${initialStep??''}`} initialStepId={initialStep} course={course} mode={mode} onSaved={onCourseSaved} onClose={()=>{setSelected(null);setInitialStep(undefined)}} onStudy={onStudy}/>
  const previewEntry=courseCatalog.find(e=>e.id===preview),previewCourse=previewEntry?.summary
  const feedback=<>{error&&<p className="learning-error" role="alert">{error}</p>}{notice&&<p className="course-download-notice" role="status">{notice}</p>}</>
  if(previewCourse){const installed=learningCourses.find(c=>c.id===preview);return <>{feedback}<CourseOverview course={previewCourse} downloaded={!!installed} busy={!!working[previewCourse.id]} downloadLabel={working[previewCourse.id]||`Скачать · ${size(previewEntry.bytes)}`} onClose={()=>setPreview(null)} onStart={step=>installed?open(previewCourse.id,step):void manage(previewCourse.id,'download')}/></>}
  const matches=courseCatalog.filter(e=>e.summary&&(directionId==='all'||e.summary.direction===directionId)&&`${e.summary.title} ${e.summary.description}`.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')))
  return <section className="learning-page course-catalog-page">
    <div className="learning-intro"><span className="eyebrow">ПОНЯТЬ, ПОПРОБОВАТЬ, ЗАКРЕПИТЬ</span><h1 ref={heading} tabIndex={-1}>Учиться <span className="serif">с пониманием.</span></h1><p>Выберите и скачайте курс. Загруженные материалы доступны без интернета.</p></div>
    <div className="learning-sync"><p role="status">{courseSyncStatus}</p><button className="secondary" disabled={courseSyncStatus.includes('Проверяем')} onClick={()=>void onRefreshCourses()}>Обновить каталог</button><small>Новые версии появляются в каталоге. Вы сами выбираете, что скачать или обновить.</small></div>
    {feedback}<div className="learning-activity"><StudyStreak activity={activity} error={activityError}/></div>
    <div className="course-discovery course-search-filters" role="search" aria-label="Поиск и фильтры курсов"><label className="course-search"><input type="search" placeholder="Найти курс" aria-label="Найти курс" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <Select label="Направление" hideLabel menuClassName="course-direction-menu" value={directionId} onChange={setDirection} options={[{value:'all',label:'Все направления'},...learningDirections.filter(d=>courseCatalog.some(e=>e.summary?.direction===d.id)).map(d=>({value:d.id,label:d.title}))]}/>
    </div>
    {!matches.length&&<p className="course-empty">Курсы не найдены.</p>}
    {learningDirections.filter(d=>matches.some(e=>e.summary!.direction===d.id)).map(d=><DirectionGroup key={d.id} title={d.title} description={d.description} count={courseCount(matches.filter(e=>e.summary!.direction===d.id).length)}><div className="learning-course-grid">{matches.filter(e=>e.summary!.direction===d.id).map(entry=>{
      const item=entry.summary!,installed=learningCourses.find(c=>c.id===item.id),update=installed&&installed.version<entry.version
      let progress,attempt=installed?freshLearningAttempt(installed):undefined,failed=false
      try{progress=readCourseProgress(item.id);if(installed)attempt=restoreLearningAttempt(readStored(learningStorageKey(item.id)),installed,installed.previous)}catch{failed=true}

      return <article className="learning-course-card" key={item.id} aria-labelledby={`course-title-${item.id}`}>
        <span className={`topic-symbol ${item.color}`}>{item.symbol}</span><span className="learning-badge">Теория + тест</span>
        <h3 id={`course-title-${item.id}`}><button className="course-preview-link" onClick={()=>setPreview(item.id)} aria-label={`Описание и структура курса: ${item.title}`}>{item.title}</button></h3><p>{item.description}</p><p className="content-provenance">Создано с помощью ИИ</p>
        <div className="learning-card-stats"><span>Модулей: {item.modules.length}</span><span>Уроков: {item.lessonCount}</span><span>Заданий: {item.questionCount}</span></div>
        {progress?.started&&<div className="learning-card-progress"><div><span>{progress.completed?'Курс пройден':'Прогресс прохождения'}</span><strong>{percentFormat.format(progress.percent)}%</strong></div><progress value={progress.percent} max={100} aria-label={`Прогресс курса ${item.title}`}/></div>}
        {progress?.started&&<p className="learning-module-count">Пройдено модулей: {progress.modulesCompleted}/{progress.modulesTotal}</p>}
        <p className="course-download-state">{installed?'✓ Доступен офлайн':'Не скачан'} · {size(entry.bytes)}{update?' · Есть обновление':''}</p>
        <div className="learning-course-actions">{installed?<><button className="primary" disabled={failed||!!working[item.id]} onClick={()=>{setMode(attempt?.finished?'result':'learn');setSelected(item.id)}}>{attempt?.finished?'Открыть результат':progress?.started?'Продолжить':'Начать курс'} ↗</button>{update&&<button className="secondary" disabled={!!working[item.id]} onClick={()=>void manage(item.id,'download')}>{working[item.id]||'Обновить'}</button>}<button className="secondary" disabled={failed||!!working[item.id]} onClick={()=>{setMode('exam');setSelected(item.id)}}>Сдать досрочно</button></>:<button className="primary" disabled={!!working[item.id]} onClick={()=>void manage(item.id,'download')}>{working[item.id]||'Скачать'}</button>}<button className="text-button" disabled={!!working[item.id]} onClick={()=>{setDeleteId(item.id);setClearConfirm(null)}}>{installed?'Удалить':'Удалить данные'}</button></div>
        {working[item.id]&&<p role="status">{working[item.id]}</p>}
        {deleteId===item.id&&<div className="course-delete-confirm" role="group" aria-label="Удаление курса">{clearConfirm===item.id?<><p>Удалить курс «{item.title}» и все его данные? Ответы, результаты тестов, интерактивные задания, работа над ошибками и прогресс будут удалены. Отметки прохождения этого курса в профессиях будут сброшены. Восстановить данные нельзя.</p><button className="secondary" disabled={!!working[item.id]} onClick={()=>void manage(item.id,'removeAll')}>Подтвердить полное удаление</button></>:<><p>Можно удалить только материалы, сохранив прогресс, или полностью удалить курс со всеми ответами и результатами.</p>{installed&&<button className="secondary" disabled={!!working[item.id]} onClick={()=>void manage(item.id,'remove')}>Удалить только материалы</button>}<button className="secondary" disabled={!!working[item.id]} onClick={()=>setClearConfirm(item.id)}>Удалить курс и все его данные</button></>}<button className="text-button" disabled={!!working[item.id]} onClick={()=>{setDeleteId(null);setClearConfirm(null)}}>Отмена</button></div>}
        {failed&&<p className="learning-error" role="alert">Не удалось прочитать прогресс. Прежние данные не перезаписаны.</p>}
      </article>
    })}</div></DirectionGroup>)}
  </section>
}
