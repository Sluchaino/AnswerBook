import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {normalizeLocalQuestionIds} from './local-question-ids.mjs'
import {normalizeNumberedSingleModule} from './numbered-single-module.mjs'
import {normalizeCyrillicSingleModule} from './cyrillic-single-module.mjs'

export function importMarkdownModule({source,number,names,keyFile,examFile,title,description,layout,transform,preserveLiteralStars=false}) {
const read=name=>{
  const raw=readFileSync(join(source,name),'utf8').replace(/\r\n/g,'\n')
  if(transform)return transform(raw,{number,lesson:names.indexOf(name)+1,kind:name===keyFile?'key':name===examFile?'exam':'lesson'})
  if(layout==='cyrillic-single')return normalizeCyrillicSingleModule(raw,{number,lesson:names.indexOf(name)+1,kind:name===keyFile ? 'key' : name===examFile ? 'exam' : 'lesson'})
  if(layout==='numbered-single')return normalizeNumberedSingleModule(raw,{number,lesson:names.indexOf(name)+1,kind:name===keyFile ? 'key' : name===examFile ? 'exam' : 'lesson'})
  return layout==='local-ids' ? normalizeLocalQuestionIds(raw,{number,lesson:names.indexOf(name)+1,kind:name===keyFile ? 'key' : name===examFile ? 'exam' : 'lesson'}) : raw
}
const plain=s=>{
  if(!preserveLiteralStars)return s.trim()==='**'?'**':s.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*|`/g,'').trim()
  const code=[]
  // Protect inline code and unmatched literal stars such as {**path}.
  return s.replace(/`([^`\n]+)`/g,(_,text)=>`\uE000${code.push(text)-1}\uE001`)
    .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*([^*\n]+)\*\*/g,'$1')
    .replace(/\uE000(\d+)\uE001/g,(_,i)=>code[Number(i)]).trim()
}
const key=new Map()
function addKey(id,letters,explanation,multi=letters.includes(',')) {
  if(!id.startsWith(`M${String(number).padStart(2,'0')}-`))throw new Error('Ключ принадлежит другому модулю: '+id)
  if(key.has(id))throw new Error('Повторный ключ: '+id)
  key.set(id,{multi,correct:letters.split(/,\s*/).map(c=>'ABCD'.indexOf(c.trim())),explanation:plain(explanation)})
}
for(const line of read(keyFile).split('\n')) {
  const m=line.match(/^\| `(M\d{2}-[^`]+)` \| (один|несколько) \| \*\*([A-D, ]+)\*\* \| (.+) \|$/)
  if(!m)continue
  addKey(m[1],m[3],m[4],m[2]==='несколько')
}
const keyText=read(keyFile),keyHeadings=[...keyText.matchAll(/^### (M\d{2}-(?:L\d{2}-[PF]\d|EX-\d{2})) · [^\n]+$/gm)]
for(const [i,heading] of keyHeadings.entries()) {
  const section=keyText.slice(heading.index+heading[0].length,keyHeadings[i+1]?.index??keyText.length)
  const answer=section.match(/\*\*(?:Ответ|Правильный ответ):\*\* ([A-D](?:,\s*[A-D])*)(?=\.| \()/)?.[1]
  const explanation=section.match(/\*\*(?:Обоснование|Почему|Объяснение):\*\* ([\s\S]*?)(?=\n\n\*\*(?:Неверные варианты|Неверные альтернативы):|$)/)?.[1]
  if(!answer||!explanation)throw new Error('Не удалось прочитать ключ: '+heading[1])
  addKey(heading[1],answer,explanation.trim())
}
const used=new Set()
function questions(markdown) {
  const starts=[...markdown.matchAll(/^\*\*(M\d{2}-(?:L\d{2}-(?:[IT]\d{2}|[PF]\d)|K\d{2}|EX-\d{2}))(?: · ([^\n]+)\*\*|\.\*\* ([^\n]*))\s*$/gm)]
  return starts.map((m,i)=>{
    const body=markdown.slice(m.index+m[0].length,starts[i+1]?.index??markdown.length)
    const options=[...body.matchAll(/^- \*\*([A-D])\.\*\* (.+)$/gm)]
    const answer=key.get(m[1])
    if(!answer||used.has(m[1])||options.length!==4||options.map(o=>o[1]).join('')!=='ABCD')throw new Error('Не удалось разобрать вопрос: '+m[1])
    const selection=m[2]??body.match(/^\*Выберите ([^\n]+)\*\s*$/m)?.[1]
    if(!selection || answer.multi!==(/несколько|все (?:правильные|верные)/.test(selection)))throw new Error('Тип ответа не совпадает с ключом: '+m[1])
    used.add(m[1])
    const intro=[m[3]??'',body.slice(0,options[0].index)].join('\n').replace(/^\*Выберите [^\n]+\*\s*$/gm,'').trim(),codes=[...intro.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(c=>c[1].trimEnd())
    const prompt=plain(intro.replace(/```[^\n]*\n[\s\S]*?```/g,''))
    return {id:m[1],kind:answer.multi?'multi':'choice',prompt,options:options.map(o=>plain(o[2])),correct:answer.multi?answer.correct:answer.correct[0],explanation:answer.explanation,...(codes.length?{code:codes.join('\n\n')}:{} )}
  })
}
function content(markdown) {
  const result=[],lines=markdown.split('\n');let paragraph=[]
  const flush=()=>{if(paragraph.length){result.push({kind:'paragraph',text:plain(paragraph.join('\n'))});paragraph=[]}}
  for(let i=0;i<lines.length;i++) {
    const line=lines[i]
    if(line.startsWith('```')){flush();const code=[];while(++i<lines.length&&!lines[i].startsWith('```'))code.push(lines[i]);result.push({kind:'code',text:code.join('\n')});continue}
    if(line.startsWith('>')||line.startsWith('# ')||line.startsWith('**Далее:**')||line.startsWith('**Курс:**')||line.startsWith('**До урока:**')||line==='---'){flush();continue}
    if(/^#{2,4} /.test(line)){flush();result.push({kind:'heading',text:plain(line.replace(/^#+ /,''))});continue}
    if(line.startsWith('|')){flush();const table=[line];while(lines[i+1]?.startsWith('|'))table.push(lines[++i]);result.push({kind:'table',text:plain(table.join('\n'))});continue}
    if(!line.trim()){flush();continue}
    paragraph.push(line.replace(/^- /,'• '))
  }
  flush();return result
}
const lessons=names.map((name,index)=>{
  const text=read(name),title=text.match(new RegExp(`^# Модуль ${number}(?: ·|\\.) Урок \\d+\\. (.+)$`,'m'))?.[1]
  const minis=[...text.matchAll(/^### (?:Мини-тест во время урока|Закрепление во время урока · мини-тест|Мини-тест \d+ — закрепление во время урока)[^\n]*/gm)]
  const end=text.indexOf('## Итоговый тест урока')
  if(!title||minis.length!==2||end<0)throw new Error('Неверная структура урока: '+name)
  const blocks=[];let cursor=0
  for(const [i,mini] of minis.entries()) {
    blocks.push({id:`theory-${i+1}`,kind:'theory',title:i===0?'Основные понятия':'Разбор и примеры',content:content(text.slice(cursor,mini.index))})
    const next=text.indexOf('\n## ',mini.index+mini[0].length)
    if(next<0)throw new Error('Нет продолжения теории: '+name)
    const quiz=questions(text.slice(mini.index,next));if(quiz.length!==1)throw new Error('Неверный мини-тест: '+name)
    blocks.push({id:`check-${i+1}`,kind:'test',title:`Мини-проверка ${i+1}`,questions:quiz});cursor=next
  }
  blocks.push({id:'application',kind:'theory',title:'Применение и важные нюансы',content:content(text.slice(cursor,end))})
  const final=questions(text.slice(end));if(final.length!==5)throw new Error('Нужно 5 итоговых вопросов: '+name)
  return {id:`m${String(number).padStart(2,'0')}-l${String(index+1).padStart(2,'0')}`,title,blocks,finalTest:{id:'final',title:'Итоговый тест урока',questions:final}}
})
const exam=questions(read(examFile))
if(exam.length!==20||used.size!==names.length*7+20||used.size!==key.size)throw new Error('Не все вопросы и ответы импортированы')

return {id:`m${String(number).padStart(2,'0')}`,title,description,lessons,exam:{id:'exam',title:'Контрольный тест модуля',passPercent:80,questions:exam}}
}
