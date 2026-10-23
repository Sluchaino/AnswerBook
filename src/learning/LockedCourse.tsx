import {useEffect,useRef,useState} from 'react'
import type {LearningCourseDetails} from '../lib/learningContent'
import type {StudyActivity} from '../lib/activity'
import {coursePrice,pendingPurchases} from '../lib/economy'
import {CoinWallet} from '../components/CoinWallet'
import type {WalletActions} from '../components/CoinWallet'

export function LockedCourse({course,activity,error,onClose,purchaseCourse,...wallet}:{course:LearningCourseDetails;activity:StudyActivity;error:string;onClose:()=>void;purchaseCourse:(id:string,price:number)=>Promise<void>}&WalletActions) {
  const [message,setMessage]=useState('')
  const heading=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{heading.current?.focus();window.scrollTo({top:0})},[course.id])
  const e=activity.economy,price=e ? coursePrice(e) : 100
  return <section className="learning-page"><button className="text-button" onClick={onClose}>← К списку курсов</button><h1 className="learning-title" ref={heading} tabIndex={-1}>{course.title}</h1><p className="learning-step-hint">{course.description}</p>
    <CoinWallet activity={activity} error={error} {...wallet}/>
    <section className="course-purchase" aria-label="Покупка курса"><h2>Открыть курс</h2><p>Стоимость: <strong>{price} монет</strong>. Баланс: {e?.balance??0}.</p><p>После покупки курс доступен постоянно и офлайн, включая повторение и работу над ошибками. Реальные деньги не списываются.</p><p>Куплено и не завершено: {e ? pendingPurchases(e) : 0}. Первое завершение курса приносит 100 монет и убирает его из расчёта повышения цены.</p>
      <button className="primary" disabled={!e||wallet.busy||!!error||e.balance<price} onClick={()=>{setMessage('');void purchaseCourse(course.id,price).catch(error=>setMessage(error instanceof Error ? error.message : 'Не удалось купить курс.'))}}>Купить за {price} монет</button>
      {e && e.balance<price && <p role="status">Не хватает {price-e.balance} монет. Занимайтесь в открытых курсах или в каталоге открытых вопросов, чтобы получить ежедневную награду.</p>}
      {message && <p className="learning-error" role="alert">{message}</p>}
    </section>
  </section>
}
