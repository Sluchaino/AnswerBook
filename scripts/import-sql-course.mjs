import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {withContentLock} from './lib/content-lock.mjs'
import {validateDownloadedCourse} from '../src/lib/learningDownloads.ts'

const read=file=>fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')
export function sqlPlain(text){
  const codes=[]
  return text.replace(/`([^`\n]+)`/g,(_,code)=>`\uE000${codes.push(code)-1}\uE001`)
    .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/\*\*([^*\n]+)\*\*/g,'$1')
    .replace(/\uE000(\d+)\uE001/g,(_,i)=>codes[Number(i)]).trim()
}
export function sqlContent(markdown){
  // Authoring placement references are replaced by real exercise blocks.
  markdown=markdown.replace(/^## Интерактив[^\n]*\n[\s\S]*?(?=^## |$(?![\s\S]))/gm,'')
    .replace(/^## Промежуточная проверка [12][^\n]*$/gm,'')
  const result=[],lines=markdown.split('\n');let paragraph=[]
  const flush=()=>{if(paragraph.length){const text=sqlPlain(paragraph.join('\n'));if(text)result.push({kind:'paragraph',text});paragraph=[]}}
  for(let i=0;i<lines.length;i++){
    const line=lines[i]
    if(/^```/.test(line)){
      flush();const code=[]
      while(++i<lines.length&&!/^```/.test(lines[i]))code.push(lines[i])
      if(i===lines.length)throw Error('Незакрытый блок кода')
      if(code.join('\n').trim())result.push({kind:'code',text:code.join('\n')})
      continue
    }
    if(/^# |^(?:lessonId|moduleId):|^---\s*$/.test(line)){flush();continue}
    if(/^#{2,6} /.test(line)){flush();result.push({kind:'heading',text:sqlPlain(line.replace(/^#+ /,''))});continue}
    if(/^\|/.test(line)){flush();const table=[line];while(/^\|/.test(lines[i+1]??''))table.push(lines[++i]);result.push({kind:'table',text:sqlPlain(table.join('\n'))});continue}
    if(!line.trim()){flush();continue}
    paragraph.push(line.replace(/^> ?/,'').replace(/^- /,'• '))
  }
  flush();return result
}
export function sqlQuestion(row){
  const code=[...row.question.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m=>m[1].trimEnd()).join('\n\n')
  const prompt=sqlPlain(row.question.replace(/```[^\n]*\n[\s\S]*?```/g,'').replace(/^\*\*Вопрос(?: \d+)?:\*\*\s*/,'').replace(/^Вопрос(?: \d+)?:\s*/,''))
  const rationale=row.rationale||row.choices[row.answer]
  const raw=Object.values(row.choices),options=raw.map(sqlPlain)
  // A backtick can itself be the syntax under test, not Markdown decoration.
  // Keep literal notation when stripping it would merge distinct alternatives.
  const duplicate=new Set(options.filter((value,i)=>options.indexOf(value)!==i))
  for(let i=0;i<options.length;i++)if(duplicate.has(options[i]))options[i]=raw[i].trim()
  const details=Object.entries(row.wrongs).sort().map(([letter,text])=>`${options['ABCD'.indexOf(letter)]} — ${sqlPlain(text)}`)
  return {id:row.id,kind:'choice',prompt,options,correct:'ABCD'.indexOf(row.answer),
    explanation:[sqlPlain(rationale),...details].join('\n\n'),...(code?{code}:{})}
}
export function importSqlCourse(root,previous){
  const manifest=JSON.parse(read(path.join(root,'course_manifest.json')))
  const bank=JSON.parse(read(path.join(root,'question-bank.json')))
  const placements=JSON.parse(read(path.join(root,'interactive_contracts.json')))
  const rows=new Map(bank.map(q=>[q.id,q])),used=new Set(),modules=[]
  const get=id=>{if(used.has(id)||!rows.has(id))throw Error('Повторный или неизвестный вопрос '+id);used.add(id);return sqlQuestion(rows.get(id))}
  for(const [mi,mod]of manifest.modules.entries()){
    const id=`m${String(mi+1).padStart(2,'0')}`,lessons=[]
    for(const lesson of mod.lessons){
      const lid=lesson.lessonId.replace('sql-foundations-',''),text=read(path.join(root,lesson.file))
      const finalIndex=text.indexOf('## Итоговый тест')
      if(finalIndex<0)throw Error('Нет итогового теста '+lid)
      const inline=[...text.slice(0,finalIndex).matchAll(/^questionId:\s*(sql-foundations-[a-z0-9-]+)\s*$/gm)]
      if(inline.length!==2||inline.some(m=>!/-c0[12][a-z]?$/.test(m[1])))throw Error('Ожидаются две проверки '+lid)
      const blocks=[];let cursor=0,theories=0
      const theory=markdown=>{const content=sqlContent(markdown);if(content.length)blocks.push({id:`theory-${++theories}`,kind:'theory',title:theories===1?'Теория и примеры':'Продолжение и применение',content})}
      for(const [i,q]of inline.entries()){
        theory(text.slice(cursor,q.index))
        blocks.push({id:`check-${i+1}`,kind:'test',title:`Проверка ${i+1}`,questions:[get(q[1])]})
        const end=text.slice(q.index+q[0].length,finalIndex).match(/^D[.)]\s+[^\n]*/m)
        if(!end)throw Error('Нет четырёх вариантов '+q[1])
        cursor=q.index+q[0].length+end.index+end[0].length
      }
      theory(text.slice(cursor,finalIndex))
      const own=placements.filter(p=>p.lessonId===lesson.lessonId)
      if(own.length>1)throw Error('Больше одного интерактива '+lid)
      for(const p of own)blocks.push({id:'interactive',kind:'exercise',exercise:p.exercise})
      const final=[...text.slice(finalIndex).matchAll(/^questionId:\s*(sql-foundations-[a-z0-9-]+)\s*$/gm)].map(m=>get(m[1]))
      if(final.length!==5)throw Error('Нужно пять итоговых вопросов '+lid)
      lessons.push({id:lid,title:lesson.title,blocks,finalTest:{id:'final',title:'Итоговый тест урока',questions:final}})
    }
    // Include supplementary authored examples without inventing additional lessons.
    const examples=path.join(root,mod.directory,'examples')
    if(fs.existsSync(examples)){
      const content=[]
      for(const name of fs.readdirSync(examples).filter(n=>/\.(sql|md)$/.test(n)).sort()){
        content.push({kind:'heading',text:name})
        if(name.endsWith('.sql'))content.push({kind:'code',text:read(path.join(examples,name)).trimEnd()})
        else content.push(...sqlContent(read(path.join(examples,name))))
      }
      if(content.length){
        const last=lessons.at(-1),index=last.blocks.findIndex(b=>b.kind==='exercise')
        last.blocks.splice(index<0?last.blocks.length:index,0,{id:'project-examples',kind:'theory',title:'Практика и примеры модуля',content})
      }
    }
    const exam=[...read(path.join(root,mod.examFile)).matchAll(/^questionId:\s*(sql-foundations-[a-z0-9-]+)\s*$/gm)].map(m=>get(m[1]))
    if(exam.length<20)throw Error('Неполный экзамен '+id)
    modules.push({id,title:mod.title,description:`${mod.title}. Уроков: ${lessons.length}.`,lessons,exam:{id:'exam',title:'Контрольный тест модуля',passPercent:80,questions:exam}})
  }
  if(used.size!==1041||used.size!==rows.size||placements.length!==97||modules.length!==16||modules.reduce((n,m)=>n+m.lessons.length,0)!==98)throw Error('Не все материалы перенесены')
  for(const m of modules)if(m.lessons.reduce((n,l)=>n+l.blocks.filter(b=>b.kind==='exercise').length,0)<5)throw Error('Менее пяти интерактивов '+m.id)
  const course={formatVersion:2,id:'sql-foundations-v1',version:previous?.version??1,title:'SQL',
    description:'SQL и PostgreSQL 18: от реляционной модели и первых запросов до транзакций, аналитики, оптимизации, безопасности и итогового проекта ShopDB. 16 модулей, 98 уроков и 97 интерактивов.',
    direction:'storage',scope:'universal',symbol:'SQL',color:'teal',topicIds:['sql'],assessment:{practiceUngraded:true,bulkSubmission:true},
    plan:{prerequisites:['Курс начинается с основ SQL; знание языка программирования не требуется.'],modules:modules.map(m=>({id:m.id,title:m.title,description:m.description,lessons:m.lessons.map(l=>({id:l.id,title:l.title}))}))},modules}
  const withoutVersion=({version:_v,...c})=>JSON.stringify(c)
  if(previous&&withoutVersion(previous)!==withoutVersion(course))course.version++
  validateDownloadedCourse(course)
  return course
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))withContentLock(()=>{
  const source='artifacts/sql-course-semantic-reviewed-2026-11-04/sql-course',target='server/theory-source/sql-foundations-v1'
  if(!fs.existsSync(source))throw Error('Нет проверенного комплекта SQL')
  fs.mkdirSync(target,{recursive:true})
  for(const name of ['course_manifest.json','interactive_contracts.json','project_contract.md','curriculum.md','README.md'])fs.copyFileSync(path.join(source,name),path.join(target,name))
  fs.cpSync(path.join(source,'modules'),path.join(target,'modules'),{recursive:true})
  fs.copyFileSync(path.join(source,'verification/semantic-question-bank.json'),path.join(target,'question-bank.json'))
  const output='server/course-source/sql-foundations-v1.json',old=fs.existsSync(output)?JSON.parse(read(output)):undefined
  const course=importSqlCourse(target,old)
  fs.writeFileSync(output,JSON.stringify(course,null,2)+'\n')
  console.log(JSON.stringify({id:course.id,version:course.version,modules:course.modules.length,lessons:course.modules.reduce((n,m)=>n+m.lessons.length,0),questions:1041,exercises:97,output}))
})
