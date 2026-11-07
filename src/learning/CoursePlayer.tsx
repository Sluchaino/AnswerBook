import {CodeExample} from '../components/CodeExample'
import {ExercisePlayer} from '../exercises/ExercisePlayer'
import {stepView,stepCaption,lessonTheoryForReview} from '../lib/courseStructure'
import type { StudyEventInput } from '../lib/activity'
import { QuestionCard } from './QuestionCard'
import { MistakeReview } from './MistakeReview'
import { Select } from '../components/Select'
import { Arrow } from '../components/Arrow'
import { useEffect, useRef, useState } from 'react'
import { initializeExerciseStep, learningModuleProgress, isBulkAssessment, submitLessonAssessment, retryLessonAssessment, freshLearningAttempt, openLearningAttempt, learningScore, finishLearningAttempt, nextLearningStep, previousLearningStep, hasLearningAnswer, isLearningCorrect, checkLearningAnswer, isAnswerChecked, restartLearningAttempt, resultItems, startMistakeReview } from '../lib/learning'
import type { LearningCourseDetails } from '../lib/learningContent'
import { learningStorageKey, readStorageSnapshot, writeStored, StorageWriteError } from '../lib/storage'
import type { LearningQuestion, Lesson } from '../lib/learning'
import './learning.css'

const percent = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:2,maximumFractionDigits:2})
function resultDate(value:string|null) { return value ? new Date(value).toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'}) : 'Завершён ранее' }
function Theory({lesson}:{lesson:Lesson}) {
  return <article className="learning-theory"><h2>{lesson.title}</h2>{!!lesson.theory.length && <h3>Ключевая идея</h3>}{lesson.theory.map((text,i)=><p key={i}>{text}</p>)}
    {lesson.reading?.map((section,i)=><section className="learning-reading" key={i}>{section.title!==lesson.title && <h3>{section.title}</h3>}{section.content.map((part,j)=>part.kind==='heading' ? part.text===lesson.title ? null : <h4 key={j}>{part.text}</h4> : part.kind==='code' ? <CodeExample key={j} code={part.text}/> : part.kind==='table' ? <pre key={j} className={part.kind==='table' ? 'reading-table' : ''}><code>{part.text}</code></pre> : <p key={j}>{part.text}</p>)}</section>)}
  </article>
}
function TestTheory({course,block}:{course:LearningCourseDetails;block:Lesson}) {
  const [open,setOpen]=useState(false)
  const theory=lessonTheoryForReview(course,block.id)
  if(!theory?.reading?.length&&!theory?.theory.length)return null
  return <details className="learning-test-theory" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Посмотреть теорию и примеры к тесту</summary>
    {open&&<Theory lesson={theory!}/>}
  </details>
}
export function CoursePlayer({ course, mode, onClose, onSaved, onStudy, initialStepId }: { course:LearningCourseDetails; initialStepId?:string; mode:'learn' | 'exam' | 'result'; onClose:() => void; onSaved:() => void; onStudy:(event?:StudyEventInput)=>void }) {
  const storageKey=learningStorageKey(course.id)
  const [load]=useState(()=>{try {
    const snapshot=readStorageSnapshot(storageKey)
    const saved=openLearningAttempt(snapshot.value,course,mode,course.previous)
    if(initialStepId&&mode==='learn'&&!saved.finished){const target=course.lessons.find(l=>l.id===initialStepId&&l.step?.kind==='theory');if(target){saved.lessonId=target.id;saved.view='theory'}}
    return {attempt:mode==='result' || saved.finished ? saved : {...saved,startedAt:saved.startedAt ?? new Date().toISOString()},failed:false,token:snapshot.token}
  } catch {return {attempt:freshLearningAttempt(course),failed:true,token:''}}})
  const saveToken=useRef(load.token)
  const [saveError,setSaveError]=useState('')
  const [attempt,setAttempt]=useState(load.attempt)
  const [showSavedResult,setShowSavedResult]=useState(mode==='result')
  const [showMistakes,setShowMistakes]=useState(false)
  const [reviewLessonId,setReviewLessonId]=useState<string|null>(null)
  const [saveState,setSaveState]=useState<'saving'|'saved'|'error'>('saved')
  const heading=useRef<HTMLHeadingElement>(null)
  const score=learningScore(course,attempt),result=attempt.lastResult
  const showingResult=!!result && (attempt.finished || showSavedResult)
  const takingExam=attempt.view==='all' && !attempt.finished
  const lessonIndex=course.lessons.findIndex(l=>l.id===attempt.lessonId),lesson=course.lessons[lessonIndex]
  const bulk=!takingExam && isBulkAssessment(course,lesson)
  const testRecord=attempt.assessments?.[lesson.id]
  const passPercent=lesson.step?.kind==='module-test' ? course.modules?.find(m=>m.id===lesson.step?.moduleId)?.exam?.passPercent : undefined
  const blockChecked=lesson.questions.every(q=>isAnswerChecked(attempt,q))
  const reviewLesson=reviewLessonId ? lessonTheoryForReview(course,reviewLessonId) : undefined
  const activeModule=course.modules?.find(m=>m.id===lesson.step?.moduleId)
  const moduleIndex=course.modules?.findIndex(m=>m.id===activeModule?.id) ?? -1
  const moduleProgress=learningModuleProgress(course,attempt)
  const currentProgress=moduleProgress.modules.find(m=>m.id===activeModule?.id)
  const unitIndex=activeModule?.lessons.findIndex(l=>l.id===lesson.step?.unitLessonId) ?? -1
  function selectStep(id:string) {const target=course.lessons.find(l=>l.id===id);if(target)setAttempt(current=>initializeExerciseStep(course,{...current,lessonId:id,view:stepView(target)}))}
  const nextLabel=course.modules ? lessonIndex<course.lessons.length-1 ? `Далее: ${stepCaption(course.lessons[lessonIndex+1])}` : score.canFinish ? 'Завершить курс' : 'К оставшимся вопросам' : attempt.view==='theory' ? 'К тесту по теме' : lessonIndex<course.lessons.length-1 ? 'К следующей теории' : score.canFinish ? 'Завершить курс' : 'К итоговому тесту'
  useEffect(()=>{
    if(load.failed)return
    let active=true
    setSaveState('saving')
    void writeStored(storageKey,JSON.stringify(attempt),()=>saveToken.current).then(token=>{saveToken.current=token;if(active){setSaveState('saved');setSaveError('')}onSaved()},error=>{if(error instanceof StorageWriteError)saveToken.current=error.retryToken;if(active){setSaveState('error');setSaveError(error instanceof Error?error.message:'Не удалось сохранить данные')}})
    return ()=>{active=false}
  },[attempt,load.failed,onSaved,storageKey])
  useEffect(()=>{heading.current?.focus();window.scrollTo({top:0})},[attempt.finished,attempt.lessonId,attempt.view,showSavedResult,reviewLessonId,showMistakes])
  function answer(q:LearningQuestion,value:string) {
    if(attempt.finished || !takingExam && isAnswerChecked(attempt,q))return
    if(takingExam && hasLearningAnswer(q,value))onStudy({kind:'answer',id:q.id})
    setAttempt(current=>{const checkedAnswers={...current.checkedAnswers};delete checkedAnswers[q.id];return {...current,answers:{...current.answers,[q.id]:value},checkedAnswers}})
  }
  function check(q:LearningQuestion) {onStudy({kind:'answer',id:q.id});setAttempt(current=>checkLearningAnswer(course,current,q.id))}
  function questionCard(q:LearningQuestion,value:string|undefined,revealed:boolean,locked:boolean,blockId:string) {
    return <QuestionCard key={q.id} question={q} value={value} order={attempt.optionOrders?.[q.id]} feedback={revealed} disabled={locked} onAnswer={value=>answer(q,value)} onCheck={takingExam || showingResult || bulk ? undefined : ()=>check(q)} onRepeat={showingResult && course.lessons.some(l=>l.id===blockId) ? ()=>setReviewLessonId(blockId) : undefined}/>
  }

  if(load.failed)return <section className="learning-page"><button className="text-button" onClick={onClose}>← К списку курсов</button><p className="content-provenance">Материалы курса созданы с помощью ИИ</p><h1 className="learning-title">{course.title}</h1><p className="learning-error" role="alert">Не удалось прочитать сохранение этого курса. Перезапустите приложение; прежние данные не перезаписаны.</p></section>
  return <section className="learning-page">
    <div className="learning-topline"><button className="text-button" onClick={onClose}>← К списку курсов</button><span>Прогресс сохраняется на устройстве</span></div>
    <p className="content-provenance">Материалы курса созданы с помощью ИИ</p><h1 className="learning-title" ref={heading} tabIndex={-1}>{showMistakes ? 'Работа над ошибками' : reviewLesson ? 'Повторение теории' : showingResult ? 'Результат курса' : takingExam ? 'Досрочная сдача курса' : course.title}</h1>
    <p className={`learning-save ${saveState==='error' ? 'learning-error' : ''}`} role="status">{saveState==='error' ? saveError||'Не удалось сохранить прогресс.' : saveState==='saving' ? 'Сохраняем…' : 'Сохранено на устройстве'}{saveState==='error' && <button className="text-button" onClick={()=>setAttempt({...attempt})}>Повторить</button>}</p>
    {showMistakes && attempt.review && result ? <MistakeReview review={attempt.review} source={result} onChange={review=>setAttempt(current=>({...current,review}))} onStudy={onStudy} onBack={()=>setShowMistakes(false)}/> : reviewLesson ? <><button className="secondary" onClick={()=>setReviewLessonId(null)}>← К результату</button><Theory lesson={reviewLesson}/></> : showingResult && result ? <>
      <div className="learning-result"><span className="result-check" aria-hidden="true">✓</span><h2>{result.correct} из {result.total} правильно · {percent.format(result.percent)}%</h2><p>{result.title} · {resultDate(result.finishedAt)}</p><p>Сначала показаны ошибки, затем правильные ответы. Результат сохранён на этом устройстве.</p>{result.courseVersion!==course.version && <p>Это результат предыдущей редакции. Вопросы и оценка сохранены в исходном виде.</p>}<div className="learning-result-actions">{result.correct<result.total && <button className="primary" onClick={()=>{const review=attempt.review?.sourceResultId===result.id ? attempt.review : startMistakeReview(result,attempt.review);if(review){setAttempt(current=>({...current,review}));setShowMistakes(true)}}}>{attempt.review?.sourceResultId===result.id ? 'Работа над ошибками' : 'Повторить ошибки'}</button>}<button className="primary" onClick={onClose}>К списку курсов</button><button className="secondary" onClick={()=>{setAttempt(current=>restartLearningAttempt(course,current));setShowSavedResult(false)}}>Пройти заново</button>{!attempt.finished && <button className="secondary" onClick={()=>setShowSavedResult(false)}>Продолжить текущее прохождение</button>}</div></div>
      {!!attempt.results?.length && <details className="learning-history"><summary>История результатов · {attempt.results.length}</summary><ul>{[...attempt.results].reverse().map(item=><li key={item.id}>{resultDate(item.finishedAt)} · {item.correct}/{item.total} · {percent.format(item.percent)}% · редакция {item.courseVersion}</li>)}</ul></details>}
      <div className="learning-questions">{resultItems(result).map((item,i,items)=>{const correct=isLearningCorrect(item.question,item.answer);return <section key={item.question.id}>{(i===0 || correct!==isLearningCorrect(items[i-1].question,items[i-1].answer)) && <h2 className="learning-block-title">{correct ? 'Правильные ответы' : 'Ошибки — повторите эти вопросы'}</h2>}<p className="learning-result-context">{item.lessonTitle}</p>{questionCard(item.question,item.answer,true,true,item.lessonId)}</section>})}</div>
    </> : <>
      {attempt.previousEdition && <p className="learning-step-hint">Курс обновлён. Ответы на изменённые задания нужно дать заново. Прежний результат доступен отдельно.</p>}
      {result && <button className="text-button" onClick={()=>setShowSavedResult(true)}>Результат последнего прохождения · {percent.format(result.percent)}%</button>}
      <div className="learning-workspace" data-assessment={takingExam?'exam':'lesson'}>
      {takingExam ? <section className="learning-exam-controls" aria-label="Досрочная сдача"><p className="learning-exam-caption">Полный тест курса. Проверка и объяснения — после сдачи всех ответов.</p><div className="learning-test-bar"><div><strong>Ответы: {score.answered} из {score.total}</strong><span>{score.canFinish ? 'Все ответы заполнены — можно завершить тест.' : 'Для завершения ответьте на все задания курса.'}</span><progress value={score.answered} max={score.total} aria-label="Ответы учебного курса"/></div><button className="primary" disabled={!score.canFinish} onClick={()=>{onStudy({kind:'course',id:course.id});setAttempt(current=>finishLearningAttempt(course,current))}}>Завершить тест</button></div></section> : <>
        <div className="course-layout-controls">
        {currentProgress&&<section className="learning-module-progress" aria-label="Прогресс модуля">
          <div><strong>Пройдено модулей: {moduleProgress.completed}/{moduleProgress.total}</strong><span>{percent.format(currentProgress.percent)}%</span></div>
          <progress value={currentProgress.completed} max={currentProgress.total} aria-label={`Прогресс модуля ${activeModule!.title}`}/>
          <small>Проверено заданий модуля: {currentProgress.completed}/{currentProgress.total}. Мини-проверки не учитываются.</small>
        </section>}
        <div className="learning-lesson-controls" aria-label="Текущий урок и переходы">
          {activeModule ? <div className="learning-hierarchy-selects"><Select label="Модуль" value={activeModule.id} onChange={id=>{const target=course.lessons.find(l=>l.step?.moduleId===id);if(target)selectStep(target.id)}} options={course.modules!.map((m,i)=>({value:m.id,label:`${i+1}. ${m.title}`}))}/><Select label="Урок" value={lesson.step!.unitLessonId} onChange={id=>{const target=course.lessons.find(l=>l.step?.moduleId===activeModule.id && l.step.unitLessonId===id);if(target)selectStep(target.id)}} options={[...activeModule.lessons.map((l,i)=>({value:l.id,label:`${i+1}. ${l.title}`})),...(activeModule.exam ? [{value:'module-exam',label:'Контрольный тест модуля'}] : [])]}/></div> : <Select hideLabel label="Урок курса" value={attempt.lessonId} onChange={selectStep} options={course.lessons.map((item,i)=>({value:item.id,label:`${i+1}. ${item.title}`}))}/>}
        </div>
        <div className="learning-step-row"><p className="learning-step-caption">{course.modules ? `Модуль ${moduleIndex+1} · ${unitIndex<0 ? '' : `Урок ${unitIndex+1} · `}${stepCaption(lesson)}` : `${attempt.view==='theory' ? 'Теория' : 'Тест по теме'} · Урок ${lessonIndex+1} из ${course.lessons.length}`}</p><nav className="learning-block-actions" aria-label="Прохождение курса"><button className="secondary" aria-label="Предыдущий шаг курса" disabled={lessonIndex===0 && (course.modules!==undefined || attempt.view==='theory')} onClick={()=>setAttempt(current=>previousLearningStep(course,current))}><Arrow back/></button><button className="primary" aria-label={nextLabel} title={nextLabel} disabled={attempt.view==='practice' && !blockChecked} onClick={()=>{const next=nextLearningStep(course,attempt);onStudy({kind:next.finished ? 'course' : 'block',id:next.finished ? course.id : `${course.id}:${lesson.id}`});setAttempt(next)}}><Arrow/></button></nav></div>
        </div>
        {attempt.view==='practice' && !blockChecked && <p className="learning-step-hint">{bulk ? 'Ответьте на все вопросы и отправьте тест целиком. Разбор появится после отправки.' : 'Ответьте на задания проверки и нажмите «Проверить ответ» у каждого, чтобы перейти дальше.'}</p>}
        {attempt.view==='theory' && <Theory lesson={lesson}/>}
      </>}
      {!takingExam && !lesson.exercise && attempt.view==='practice' && <section className="learning-assessment-controls" aria-label="Проверка урока">
        {lesson.step?.kind==='inline-test' && course.assessment?.practiceUngraded && <p>Обучающая проверка: на точность курса не влияет. Можно попробовать снова.</p>}
        {bulk && !blockChecked && <button className="primary" disabled={!lesson.questions.every(q=>hasLearningAnswer(q,attempt.answers[q.id]))} onClick={()=>{for(const q of lesson.questions)onStudy({kind:'answer',id:q.id});setAttempt(current=>submitLessonAssessment(course,current))}}>Отправить тест · {lesson.questions.filter(q=>hasLearningAnswer(q,attempt.answers[q.id])).length}/{lesson.questions.length}</button>}
        {bulk && blockChecked && testRecord && <p role="status">Результат: {testRecord.last.correct}/{testRecord.last.total} · {percent.format(testRecord.last.percent)}%. Первая попытка: {percent.format(testRecord.first.percent)}%. Лучший результат: {percent.format(testRecord.best.percent)}%.{passPercent!==undefined && ` Порог ${passPercent}%: ${testRecord.last.percent>=passPercent ? 'достигнут' : 'пока не достигнут'}.`}</p>}
        {blockChecked && course.assessment && <button className="secondary" onClick={()=>setAttempt(current=>retryLessonAssessment(course,current))}>{bulk ? 'Пересдать этот тест' : 'Попробовать снова'}</button>}
      </section>}
      {!takingExam&&lesson.exercise&&attempt.exercises?.[lesson.exercise.id]&&<ExercisePlayer key={lesson.exercise.id} exercise={lesson.exercise} state={attempt.exercises[lesson.exercise.id]} onChange={state=>setAttempt(current=>({...current,exercises:{...current.exercises,[lesson.exercise!.id]:state}}))} onSubmit={()=>onStudy({kind:'block',id:`${course.id}:${lesson.id}`})}/>}
      {attempt.view!=='theory' && (takingExam||!lesson.exercise) && <div className="learning-questions">{(takingExam ? course.lessons.filter(l=>l.questions.length && (!course.assessment?.practiceUngraded || l.step?.kind!=='inline-test')) : [lesson]).map(block=><section key={block.id}><h2 className="learning-block-title">{takingExam && block.step ? `${block.step.moduleTitle} · ${block.step.unitLessonTitle} · ${block.title}` : block.title}</h2><TestTheory key={block.id} course={course} block={block}/>{block.questions.map(q=>{const checked=!takingExam && isAnswerChecked(attempt,q);return questionCard(q,attempt.answers[q.id],checked,checked,block.id)})}</section>)}</div>}
      </div>
    </>}
  </section>
}
