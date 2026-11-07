import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {validateCatalog} from '../src/lib/catalog.ts'
import {organizeSurveyTopics} from '../src/lib/topicMerges.ts'
import {groupTopics} from '../src/lib/topicFilters.ts'

const destination=process.argv[2]
if(!destination)throw Error('Укажите папку для экспорта вопросов')
const folder=resolve(destination)
const catalog=validateCatalog(JSON.parse(await readFile(new URL('../src/data/questions.json',import.meta.url),'utf8')))
const manifest=JSON.parse(await readFile(new URL('../src/data/download-catalog.json',import.meta.url),'utf8'))
const topics=organizeSurveyTopics(catalog.topics)
const groups=groupTopics(topics,[...manifest.directions,{id:'other',title:'Другие темы'}])
if(groups.reduce((n,g)=>n+g.topics.length,0)!==topics.length)throw Error('Не все темы распределены по направлениям')
await mkdir(folder,{recursive:true})
const report=[]
for(const [index,group] of groups.entries()){
  const count=group.topics.reduce((n,t)=>n+t.questions.length,0)
  const filename=`${String(index+1).padStart(2,'0')}. ${group.direction.title.replace(/[<>:"/\\|?*]/g,'-')}.md`
  const lines=[`# ${group.direction.title}`,'',`Тем: ${group.topics.length}. Открытых вопросов: ${count}.`,'']
  for(const topic of group.topics){
    lines.push(`## ${topic.title}`,'')
    topic.questions.forEach((question,i)=>lines.push(`${i+1}. ${question.text.trim().replace(/\n/g,'\n   ')}`,''))
  }
  const content=lines.join('\n')
  await writeFile(join(folder,filename),content,'utf8')
  if(await readFile(join(folder,filename),'utf8')!==content)throw Error('Не удалось проверить файл '+filename)
  report.push({filename,topics:group.topics.length,questions:count})
}
console.log(JSON.stringify({folder,files:report,topics:topics.length,questions:report.reduce((n,f)=>n+f.questions,0)},null,2))
