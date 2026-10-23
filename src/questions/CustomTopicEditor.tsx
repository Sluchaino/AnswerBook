import { useEffect, useRef, useState } from 'react'
import type { Topic } from '../lib/catalog'
import { makeCustomTopic } from '../lib/customTopics'
import './questions.css'

export function CustomTopicEditor({topic,onSave,onClose}:{topic:Topic|null;onSave:(topic:Topic)=>Promise<void>;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [title,setTitle]=useState(topic?.title ?? '')
  const [description,setDescription]=useState(topic?.description ?? '')
  const [questions,setQuestions]=useState(topic?.questions ?? [{id:crypto.randomUUID(),text:''}])
  const [error,setError]=useState('')
  const [saving,setSaving]=useState(false)
  useEffect(()=>{dialog.current?.showModal()},[])
  async function save() {
    setError('');setSaving(true)
    try {await onSave(makeCustomTopic(title,description,questions,topic ?? undefined));onClose()}
    catch(error) {setError(error instanceof Error ? error.message : 'Не удалось сохранить тему. Попробуйте ещё раз.')}
    finally {setSaving(false)}
  }
  return <dialog ref={dialog} className="knowledge-dialog custom-topic-editor" aria-labelledby="custom-topic-title" onClose={()=>{if(!saving)onClose()}} onCancel={event=>{if(saving)event.preventDefault();else onClose()}}>
    <div className="knowledge-dialog-heading"><h2 id="custom-topic-title">{topic ? 'Изменить свою тему' : 'Новая тема'}</h2><button className="icon-button" aria-label="Закрыть редактор темы" disabled={saving} onClick={onClose}>×</button></div>
    <p className="knowledge-hint">Своя тема · хранится на этом устройстве и доступна офлайн. Вопросы вводите самостоятельно.</p>
    <fieldset disabled={saving} className="custom-topic-fields">
      <label>Название темы<input autoFocus maxLength={160} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Например, подготовка к собеседованию" /></label>
      <label>Описание (необязательно)<textarea maxLength={500} value={description} onChange={event=>setDescription(event.target.value)} rows={2}/></label>
      <h3>Вопросы · {questions.length} из 100</h3>
      {questions.map((question,index)=><div className="custom-question-field" key={question.id}><label>Вопрос {index+1}<textarea maxLength={20000} rows={3} value={question.text} onChange={event=>setQuestions(current=>current.map(item=>item.id===question.id ? {...item,text:event.target.value} : item))}/></label><button className="text-button" disabled={questions.length===1} aria-label={`Убрать вопрос ${index+1}`} onClick={()=>setQuestions(current=>current.filter(item=>item.id!==question.id))}>Убрать</button></div>)}
      <button className="secondary" disabled={questions.length>=100} onClick={()=>setQuestions(current=>[...current,{id:crypto.randomUUID(),text:''}])}>+ Добавить вопрос</button>
    </fieldset>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    <div className="custom-topic-actions"><button className="secondary" disabled={saving} onClick={onClose}>Отмена</button><button className="primary" disabled={saving} onClick={()=>void save()}>{saving ? 'Сохраняем…' : 'Сохранить тему'}</button></div>
  </dialog>
}
