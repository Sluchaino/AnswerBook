import {PrivacyPolicy} from '../privacy/PrivacyPolicy'
import policy from '../data/privacy-policy.json'
import faq from '../data/faq.json'
import { useEffect, useRef, useState } from 'react'
import './profile-info.css'

export const supportEmail=policy.email
const supportHref=`mailto:${supportEmail}?subject=${encodeURIComponent('КодШаг — обращение в поддержку')}`

function InfoDialog({page,onClose}:{page:'privacy'|'support';onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null)
  const [message,setMessage]=useState('')
  useEffect(()=>{dialog.current?.showModal()},[])
  const privacy=page==='privacy'
  async function copyEmail() {
    try {await navigator.clipboard.writeText(supportEmail);setMessage('Адрес скопирован.')}
    catch {setMessage('Не удалось скопировать. Выделите адрес и скопируйте вручную.')}
  }
  return <dialog className="profile-info-dialog knowledge-dialog" ref={dialog} aria-labelledby="profile-info-title" onCancel={onClose} onClose={onClose}>
    <div className="knowledge-dialog-heading"><h2 id="profile-info-title">{privacy ? 'Политика конфиденциальности' : 'Написать в поддержку'}</h2><button className="icon-button" aria-label="Закрыть информацию" onClick={onClose}>×</button></div>
    {privacy ? <PrivacyPolicy/> : <div className="support-content">
      <p>Опишите, что произошло и как повторить проблему. При необходимости добавьте модель телефона, версию Android и приложения или скриншот.</p>
      <a className="support-address" href={supportHref}>{supportEmail}</a>
      <a className="primary support-compose" href={supportHref}>Открыть письмо</a>
      <button className="secondary" onClick={()=>void copyEmail()}>Скопировать адрес</button>
      <p className="streak-hint">Письмо откроется в почтовом приложении, отправляете его вы. Если почта не настроена, скопируйте адрес. Учебные данные не прикрепляются.</p>
      {message && <p role="status">{message}</p>}
    </div>}
    <button className="secondary profile-info-close" onClick={onClose}>Закрыть</button>
  </dialog>
}

export function ProfileInfo() {
  const [page,setPage]=useState<'privacy'|'support'|null>(null)
  return <section className="profile-info" aria-labelledby="profile-help-title"><h2 id="profile-help-title">Помощь и информация</h2><div className="profile-info-links"><button onClick={()=>setPage('privacy')}><span>Политика конфиденциальности</span><span aria-hidden="true">↗</span></button><button onClick={()=>setPage('support')}><span>Написать в поддержку</span><span aria-hidden="true">↗</span></button><details className="profile-faq"><summary><span>Часто задаваемые вопросы</span><span className="profile-faq-chevron" aria-hidden="true">⌄</span></summary><div className="profile-faq-list">{faq.map(item=><details className="profile-faq-item" key={item.id}><summary><span>{item.question}</span><span className="profile-faq-chevron" aria-hidden="true">⌄</span></summary><p>{item.answer}</p></details>)}</div></details></div>{page && <InfoDialog key={page} page={page} onClose={()=>setPage(null)}/>}{import.meta.env.DEV&&<a href="#/authoring">Управление контентом → Интерактивные упражнения</a>}</section>
}
