import {useEffect,useState} from 'react'
import type {StudyActivity} from '../lib/activity'
import {localStudyDay,studyStreak} from '../lib/activity'
import {coursePrice,pendingPurchases,dailyRewards,freezePrice} from '../lib/economy'
import './coin-wallet.css'

export type WalletActions={retrySave:()=>Promise<void>;purchaseFreeze:()=>Promise<void>;busy:boolean}
export function CoinWallet({activity,error,purchaseFreeze,retrySave,busy}:{activity:StudyActivity;error:string}&WalletActions) {
  const [message,setMessage]=useState('')
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{const tick=()=>setNow(new Date());const timer=window.setInterval(tick,60000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick)}},[])
  const e=activity.economy,streak=studyStreak(activity,now),today=localStudyDay(now)
  if(!e)return <p className="learning-error" role="alert">{error || 'Монеты недоступны. Перезапустите приложение.'}</p>
  const rewarded=e.rewardedDays.includes(today),step=Math.max(1,streak.current+(streak.today ? 0 : 1))
  const reward=dailyRewards[(step-1)%7],tokens=activity.freezeTokens??1
  return <section className="coin-wallet" aria-label="Монеты и награды">
    <div className="coin-wallet-heading"><div><h2>Ваши монеты</h2><p>{rewarded ? 'Награда за занятие сегодня получена' : `Первое занятие сегодня: +${reward} монет`}</p></div><strong aria-label={`Баланс: ${e.balance} монет`}><span aria-hidden="true">◈</span> {e.balance}</strong></div>
    <details><summary>Награды и покупки</summary>
      <p>100 стартовых монет — на первый курс. За первое завершение каждого курса — ещё 100. Повторное прохождение и ручная отметка курса наград не дают.</p>
      <div className="coin-reward-days" aria-label="Цикл наград за серию занятий">{dailyRewards.map((amount,i)=><span key={i} className={(step-1)%7===i ? 'current' : ''}><small>{i+1} день</small><strong>+{amount}</strong></span>)}</div>
      <p>Награда выдаётся за учебное действие один раз за дату устройства. Каждые 7 дней серии цикл повторяется. Замороженный день сохраняет шаг, но не приносит монет.</p>
      <p>Следующий курс: <strong>{coursePrice(e)} монет</strong>. Куплено и не завершено: {pendingPurchases(e)}. Цена растёт на 25 за каждый такой курс, максимум до 200. После завершения цена снижается, минимум до 100.</p>
      <div className="coin-offer"><div><h3>❄ Заморозка серии</h3><p>Запас: {tokens} из 2. Бесплатная заморозка также начисляется за каждые 7 дней занятий.</p></div><button className="secondary" disabled={busy||!!error||tokens>=2||e.balance<freezePrice} onClick={()=>{setMessage('');void purchaseFreeze().then(()=>setMessage('Заморозка куплена.'),error=>setMessage(error instanceof Error ? error.message : 'Покупка не сохранена.'))}}>{tokens>=2 ? 'Запас полон' : `Купить · ${freezePrice} монет`}</button>{tokens<2 && e.balance<freezePrice && <p>Не хватает {freezePrice-e.balance} монет.</p>}</div>
      <div className="coin-offer"><h3>Монеты за видео</h3><p>Рекламные видео пока не подключены. После подключения полный просмотр будет приносить 10 монет, до 3 раз в день.</p><button className="secondary" disabled>Видео пока недоступно</button></div>
      {message && <p role="status">{message}</p>}
      <details className="coin-history"><summary>История монет</summary><ul>{e.history.map(item=><li key={item.id}><span>{item.label}<small>{new Date(item.day+'T12:00:00').toLocaleDateString('ru-RU')}</small></span><strong>{item.amount>0 ? '+' : ''}{item.amount}</strong></li>)}</ul></details>
    </details>
    {error && <div className="learning-error" role="alert"><p>{error}</p><button className="secondary" disabled={busy} onClick={()=>{void retrySave().catch(()=>{})}}>Повторить сохранение</button></div>}
  </section>
}
