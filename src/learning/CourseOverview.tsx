import {useEffect,useRef} from 'react'
import type {CourseSummary} from '../lib/courseCatalog'
import {coursePlanModules} from '../lib/coursePlan'

export function CourseOverview({course,downloaded,busy,downloadLabel,onClose,onStart}:{course:CourseSummary;downloaded:boolean;busy:boolean;downloadLabel:string;onClose:()=>void;onStart:(stepId?:string)=>void}){
  const heading=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{heading.current?.focus();window.scrollTo({top:0})},[course.id])
  const modules=coursePlanModules(course),available=modules.filter(m=>m.available).length
  return <section className="learning-page course-overview">
    <button className="text-button" onClick={onClose}>← К списку курсов</button>
    <header className="course-overview-intro"><span className={`topic-symbol ${course.color}`}>{course.symbol}</span><h1 className="learning-title" ref={heading} tabIndex={-1}>{course.title}</h1><p>{course.description}</p><p className="content-provenance">Создано с помощью ИИ</p>
      {!!course.plan?.prerequisites?.length&&<p><strong>Что нужно знать:</strong> {course.plan.prerequisites.join(', ')}.</p>}
      <button className="primary" disabled={busy} onClick={()=>onStart()}>{downloaded?'Продолжить обучение':downloadLabel} <span aria-hidden="true">↗</span></button>
    </header>
    <div className="course-plan-heading"><h2>Программа курса</h2><p>Доступно модулей: {available} из {modules.length}</p></div>
    <p className="learning-step-hint">{downloaded?'Загруженные уроки доступны офлайн.':'Скачайте курс, чтобы учиться без интернета.'} Остальные модули появятся после добавления материалов и обновления курса.</p>
    <div className="course-plan-list">{modules.map((m,index)=><details key={m.id} className="course-plan-module">
      <summary><span className="course-plan-number">{index+1}</span><span className="course-plan-name">{m.title}<small>Уроков: {m.lessons.length}</small></span><span className={`course-plan-status ${m.available?'available':''}`}>{m.available?'Доступен':'Скоро появится'}</span><span aria-hidden="true">⌄</span></summary>
      <div className="course-plan-content">{m.description&&<p>{m.description}</p>}<ol>{m.lessons.map(l=><li key={l.id}><span>{l.title}</span>{!l.available&&<small>Скоро появится</small>}</li>)}</ol>
        {m.available&&downloaded&&<button className="secondary" onClick={()=>onStart(course.modules.find(a=>a.id===m.id)?.firstStepId)}>Открыть модуль</button>}
      </div>
    </details>)}</div>
  </section>
}
