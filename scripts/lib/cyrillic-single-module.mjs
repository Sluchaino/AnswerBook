// Scope М/И labels by lesson; К labels identify the module exam.
export function normalizeCyrillicSingleModule(markdown,{number,lesson,kind}) {
  const prefix=`M${String(number).padStart(2,'0')}`
  const id=(type,index,n)=>type==='К' ? `${prefix}-EX-${String(index).padStart(2,'0')}` : `${prefix}-L${String(n).padStart(2,'0')}-${type==='М'?'P':'F'}${index}`
  if(kind==='key') {
    const json=markdown.match(/```json\s*\n([\s\S]*?)```/),machine=json ? JSON.parse(json[1]) : undefined
    let currentLesson;const entries=[]
    for(const line of markdown.split('\n')) {
      const header=line.match(/^## Урок (\d+)\./)
      if(header)currentLesson=Number(header[1])
      if(/^## Контрольный тест модуля/.test(line))currentLesson=undefined
      const match=line.match(/^- \*\*([МИК])(\d+): ([A-D])\*\* — (.+)$/)
      if(!match)continue
      const [,type,index,letter,explanation]=match
      if(type!=='К'&&!currentLesson)throw new Error('Нет урока для ключа '+type+index)
      if(machine) {
        const arrayEntry=Array.isArray(machine) ? machine.find(entry=>entry.id===(type==='К' ? `${prefix}-EX-K${String(index).padStart(2,'0')}` : `${prefix}-L${String(currentLesson).padStart(2,'0')}-${type}${index}`)) : undefined
        const section=type==='К' ? (machine.module_exam??machine.exam) : (machine.lessons?.[String(currentLesson).padStart(2,'0')]?.[type==='М'?'mini':'final']??machine[`lesson_${String(currentLesson).padStart(2,'0')}`]??machine.lessons?.[String(currentLesson).padStart(2,'0')]??machine.lessons?.[String(currentLesson)])
        const label=type==='К'?'K':type==='М'?'M':'I'
        const value=Array.isArray(machine) ? arrayEntry?.answer : Array.isArray(section) ? section[Number(index)-1] : (section?.[label+index]??section?.[type+index])
        const expected=typeof value==='object' ? (value?.correct??value?.answer) : value
        if(expected!==letter)throw new Error('Текстовый и машиночитаемый ключи не совпадают: '+id(type,index,currentLesson))
      }
      entries.push(`### ${id(type,index,currentLesson)} · ключ\n\n**Ответ:** ${letter}.\n\n**Обоснование:** ${explanation}\n`)
    }
    if(Array.isArray(machine)&&machine.length!==entries.length)throw new Error('Число текстовых и машиночитаемых ключей не совпадает')
    return entries.join('\n')
  }
  let text=markdown.replace(/^# Урок (\d+)\./m,`# Модуль ${number}. Урок $1.`)
  if(kind==='lesson') {
    text=text.replace(/\n## (?:Источник для редактора|Источники для проверки(?: материалов)?)[^\n]*\n[\s\S]*?(?=\n## |$)/g,'')
    const notes=text.search(/\n## (?:Что повторить при ошибках|Ключевые мысли|Что проверить перед следующим уроком|Перед следующим уроком|После урока)/),final=text.indexOf('\n## Итоговый тест урока')
    if(notes>final && final>=0)text=text.slice(0,final)+'\n'+text.slice(notes).trimEnd()+'\n\n'+text.slice(final,notes)
  }
  let inCode=false
  return text.split('\n').map(line=>{
    if(line.startsWith('```')){inCode=!inCode;return line}
    if(inCode)return line
    const mini=line.match(/^#### Мини-тест ([12]) /)
    if(mini)return `### Мини-тест ${mini[1]} — закрепление во время урока`
    const question=line.match(/^\*\*([МИК]) ?(\d+)\.\*\* (.+)$/)
    if(question){const [,type,index,prompt]=question;return `**${id(type,index,lesson)} · Выберите один вариант.**\n\n${prompt}`}
    return line.replace(/^### ([123])\. /,'## $1. ')
  }).join('\n')
}
