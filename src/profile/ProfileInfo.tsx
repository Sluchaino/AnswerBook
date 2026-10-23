import { useEffect, useRef, useState } from 'react'
import './profile-info.css'

export const supportEmail='maks.denisov.dev@outlook.com'
const supportHref=`mailto:${supportEmail}?subject=${encodeURIComponent('AnswerBook — обращение в поддержку')}`

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
    {privacy ? <div className="privacy-content">
      <p className="privacy-date">AnswerBook · редакция от 24 октября 2026 года</p>
      <p>Эта политика описывает работу текущей версии сайта и Android-приложения AnswerBook.</p>
      <h3>Какие данные сохраняются</h3><p>На устройстве сохраняются ответы и черновики опросов, свои темы и вопросы, отметки знакомых вопросов, профессии, прогресс и результаты курсов, история занятий, серия, заморозки, баланс монет, история наград и покупок курсов и настройки оформления. В прежних версиях в локальном профиле также могло сохраняться введённое имя.</p>
      <h3>Для чего нужны данные</h3><p>Данные используются для продолжения обучения, показа прогресса и итогов недели, работы над ошибками и сохранения конспектов. Регистрация и общий аккаунт между устройствами в текущей версии отсутствуют.</p>
      <h3>Хранение и передача</h3><p>Учебные данные хранятся локально: в хранилище браузера на сайте и в хранилище приложения на Android. Приложение не отправляет ответы, свои темы и учебный прогресс разработчику или сервисам ИИ автоматически. Отметка «Создано с помощью ИИ» относится к подготовке готовых материалов; проверка ответов через онлайн-ИИ сейчас не подключена.</p>
      <h3>Подключение к интернету</h3><p>При наличии сети AnswerBook проверяет обновления готового каталога вопросов. По умолчанию каталог загружается с GitHub. При открытии сайта и загрузке обновлений сетевые сервисы получают технические данные запроса, в том числе IP-адрес. Их обработка определяется правилами соответствующего хостинга. Свои темы и ответы не включаются в запрос обновления.</p>
      <h3>Экспорт и поддержка</h3><p>При сохранении, печати или отправке конспекта вы сами выбираете файл, приложение и получателя. Созданные вне AnswerBook копии хранятся отдельно. При обращении в поддержку получатель получает ваш адрес отправителя, текст письма и вложения, которые вы добавите. Ответы и прогресс не прикрепляются автоматически. Обращение используется для ответа и решения описанной проблемы; письмо обрабатывается также вашим почтовым сервисом и почтовым сервисом поддержки.</p>
      <h3>Аналитика, реклама и покупки</h3><p>Внутриигровые монеты начисляются за занятия и завершение курсов и используются для открытия курсов и покупки заморозок. Баланс и покупки сохраняются на устройстве. Реальные деньги не списываются. Рекламные видео пока представлены недоступной заглушкой: рекламные SDK и системы аналитики не подключены, монеты за видео не выдаются. Перед подключением рекламы или реальных платежей политика должна быть обновлена.</p>
      <h3>Как удалить данные</h3><p>На Android очистите хранилище приложения в системных настройках или удалите приложение. На сайте удалите данные сайта в настройках браузера. Очистка только кеша может не удалить учебные данные. Это действие удаляет локальные сохранения; скачанные конспекты и отправленные письма нужно удалять отдельно. Данные обучения хранятся до очистки, удаления или изменения пользователем.</p>
      <h3>Обновления политики и связь</h3><p>Актуальная редакция доступна в личном кабинете, в разделе «Помощь и информация». По вопросам данных и работы AnswerBook напишите: <a href={supportHref}>{supportEmail}</a>.</p>
    </div> : <div className="support-content">
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
  return <section className="profile-info" aria-labelledby="profile-help-title"><h2 id="profile-help-title">Помощь и информация</h2><div className="profile-info-links"><button onClick={()=>setPage('privacy')}><span>Политика конфиденциальности</span><span aria-hidden="true">↗</span></button><button onClick={()=>setPage('support')}><span>Написать в поддержку</span><span aria-hidden="true">↗</span></button></div>{page && <InfoDialog key={page} page={page} onClose={()=>setPage(null)}/>}</section>
}
