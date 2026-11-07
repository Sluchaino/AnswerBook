// Source numbering is local to each lesson. Give it a stable course-wide identity
// before passing it to the shared parser; never change the original Markdown.
export function normalizeLocalQuestionIds(markdown,{number,lesson,kind}) {
  const prefix=`M${String(number).padStart(2,'0')}`
  const lessonId=n=>`${prefix}-L${String(n).padStart(2,'0')}`
  if(kind==='key') {
    let currentLesson,exam=false;const entries=[]
    for(const line of markdown.split('\n')) {
      const header=line.match(/^## Урок (\d+)\./)
      if(header){currentLesson=Number(header[1]);exam=false}
      if(/^## Контрольный тест модуля/.test(line)){exam=true;currentLesson=undefined}
      const match=line.match(/^- \*\*([МM][12]-\d+|\d+): ([A-D](?:,\s*[A-D])*)\.\*\* (.+)$/)
      if(!match)continue
      const [,local,letters,explanation]=match
      const mini=local.match(/^[МM]([12])-(\d+)$/)
      if(!exam && !currentLesson || mini && (exam || Number(mini[2])!==1))throw new Error('Неизвестная область локального ключа: '+local)
      const id=exam ? `${prefix}-EX-${String(local).padStart(2,'0')}` : `${lessonId(currentLesson)}-${mini ? 'P'+mini[1] : 'F'+local}`
      entries.push(`### ${id} · ключ\n\n**Ответ:** ${letters}.\n\n**Обоснование:** ${explanation}\n`)
    }
    return entries.join('\n')
  }
  let text=markdown.replace(/^# Урок (\d+)\./m,`# Модуль ${number}. Урок $1.`)
  text=text.replace(/^### Мини-тест ([12]) \(без оценки\)/gm,'### Мини-тест $1 — закрепление во время урока')
  text=text.replace(/^\*\*([МM]([12])-(\d+)|\d+)\. (.+)\*\*$/gm,(_,local,mini,sourceLesson,prompt)=>{
    if(mini && Number(sourceLesson)!==1)throw new Error('Неизвестный номер мини-вопроса: '+local)
    const id=kind==='exam' ? `${prefix}-EX-${String(local).padStart(2,'0')}` : `${lessonId(lesson)}-${mini ? 'P'+mini : 'F'+local}`
    return `**${id}.** ${prompt}`
  })
  return text
}
