// Normalize author labels such as 2.M1 and E01 without touching code fences.
export function normalizeNumberedSingleModule(markdown,{number,lesson,kind}) {
  const prefix=`M${String(number).padStart(2,'0')}`
  function id(local) {
    const exam=local.match(/^E(\d{2})$/)
    if(exam)return `${prefix}-EX-${exam[1]}`
    const question=local.match(/^(\d+)\.([MF])([1-5])$/)
    if(!question || kind!=='key' && Number(question[1])!==lesson || question[2]==='M' && Number(question[3])>2)throw new Error('Неверный локальный ID вопроса: '+local)
    return `${prefix}-L${question[1].padStart(2,'0')}-${question[2]==='M'?'P':'F'}${question[3]}`
  }
  if(kind==='key') {
    const entries=[]
    for(const line of markdown.split('\n')) {
      const match=line.match(/^- \*\*(\d+\.[MF][1-5]|E\d{2})\*\*: ([A-D])\. (.+)$/)
      if(match)entries.push(`### ${id(match[1])} · ключ\n\n**Ответ:** ${match[2]}.\n\n**Обоснование:** ${match[3]}\n`)
    }
    return entries.join('\n')
  }
  // The lesson schema ends with the final test. Retain the source's closing
  // caveats as the last part of theory instead of dropping them after the test.
  let text=markdown
  if(kind==='lesson') {
    const notes=text.indexOf('\n## На что обратить внимание'),final=text.indexOf('\n## Итоговый тест урока')
    if(notes>final && final>=0) {
      const closing=text.slice(notes).split('\n---')[0].trimEnd()
      text=text.slice(0,final)+'\n'+closing+'\n\n'+text.slice(final,notes)
    }
  }
  let inCode=false
  return text.split('\n').map(line=>{
    if(line.startsWith('```')){inCode=!inCode;return line}
    if(inCode)return line
    const mini=line.match(/^> \*\*Мини-тест ([12]) /)
    if(mini)return `### Мини-тест ${mini[1]} — закрепление во время урока`
    const marker=line.match(/^\*\*(\d+\.[MF][1-5]|E\d{2})\. (Выберите один вариант\.)\*\*$/)
    if(marker)return `**${id(marker[1])} · ${marker[2]}**`
    return line.replace(/^- ([A-D])\. /,'- **$1.** ').replace(/^### ([123])\. /,'## $1. ')
  }).join('\n')
}
