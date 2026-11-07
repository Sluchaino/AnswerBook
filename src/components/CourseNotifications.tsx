import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import {App as NativeApp} from '@capacitor/app'
import {courseCatalog} from '../lib/learningContent'
import {courseNoticesRevision,courseNoticesState,subscribeCourseNotices,refreshCourseNotices,readCourseNotice,setSystemCourseNotices,openCourseNoticeSettings} from '../lib/courseNotifications'
import './course-notifications.css'

export function CourseNotifications({onCourse}:{onCourse:(id:string)=>void}){
 useSyncExternalStore(subscribeCourseNotices,courseNoticesRevision,courseNoticesRevision)
 const state=courseNoticesState(),unread=state.items.filter(n=>!n.read).length
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(state.openRequest)setOpen(true)},[state.openRequest])
 useEffect(()=>{if(open)dialog.current?.showModal();else dialog.current?.close()},[open])
 useEffect(()=>{
  const resume=()=>{if(document.visibilityState==='visible')void refreshCourseNotices()}
  document.addEventListener('visibilitychange',resume)
  const timer=state.native?window.setInterval(resume,60000):null
  const listener=state.native?NativeApp.addListener('appStateChange',({isActive})=>{if(isActive)void refreshCourseNotices()}):null
  return()=>{document.removeEventListener('visibilitychange',resume);if(timer)window.clearInterval(timer);if(listener)void listener.then(h=>h.remove())}
 },[state.native])
 async function toggle(){setBusy(true);try{await setSystemCourseNotices(!state.enabled)}finally{setBusy(false)}}
 return <><button className="course-notice-bell no-print" aria-label={`Уведомления${unread?`: непрочитанных ${unread}`:''}`} onClick={()=>{setOpen(true);void refreshCourseNotices()}}>
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{unread>0&&<span>{unread>99?'99+':unread}</span>}
 </button><dialog className="course-notice-dialog" ref={dialog} aria-labelledby="course-notice-title" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
  <div className="course-notice-heading"><h2 id="course-notice-title">Уведомления</h2><button className="icon-button" aria-label="Закрыть уведомления" onClick={()=>setOpen(false)}>×</button></div>
  <p className="course-notice-help">Новые курсы, модули и уроки. Материалы скачиваются и обновляются по вашему выбору.</p>
  {state.native?<section className="course-notice-settings"><strong>Системные уведомления</strong><p>{state.enabled&&state.permitted?'Включены. Каталог проверяется примерно раз в час при наличии интернета. Android может откладывать проверку.':state.enabled?'Android запретил показ уведомлений. Разрешение можно изменить в настройках приложения.':'Получайте сообщения об обновлениях, даже когда приложение закрыто.'}</p><button className="secondary" disabled={busy} onClick={()=>void toggle()}>{busy?'Подождите…':state.enabled?'Выключить':'Включить уведомления'}</button>{!state.permitted&&<button className="text-button" onClick={()=>void openCourseNoticeSettings()}>Настройки Android</button>}</section>:<p className="course-notice-help">В браузере изменения проверяются при открытии приложения и возвращении в него.</p>}
  {state.error&&<p role="alert" className="learning-error">{state.error}</p>}
  <div className="course-notice-toolbar"><span aria-live="polite">Непрочитанных: {unread}</span><button className="text-button" disabled={!unread} onClick={()=>void readCourseNotice()}>Прочитать всё</button></div>
  {!state.items.length&&<div className="course-notice-empty">Пока нет новых уведомлений.<small>Здесь появятся изменения после следующего обновления материалов.</small></div>}
  <div className="course-notice-list">{state.items.map(item=><article className={`course-notice-item ${item.read?'':'unread'}`} key={item.id}>
   <div className="course-notice-item-heading"><strong>{item.title}</strong>{!item.read&&<span>Новое</span>}</div><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('ru-RU')} · версия {item.version}</time>
   <ul>{item.changes.map((text,i)=><li key={i}>{text}</li>)}</ul>
   <div className="course-notice-actions"><button className="secondary" disabled={!courseCatalog.some(c=>c.id===item.courseId)} onClick={()=>{void readCourseNotice(item.id);setOpen(false);onCourse(item.courseId)}}>Открыть курс</button>{!item.read&&<button className="text-button" onClick={()=>void readCourseNotice(item.id)}>Прочитано</button>}</div>{!courseCatalog.some(c=>c.id===item.courseId)&&<p className="course-notice-help">Курса нет в текущем каталоге. Подключитесь к интернету и обновите каталог курсов.</p>}
  </article>)}</div>
 </dialog></>
}
