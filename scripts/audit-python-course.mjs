import fs from 'node:fs'
import {join,resolve} from 'node:path'
const root=resolve('C:/Users/vhnkg/Downloads/Python_3_14_rebuilt_modules_01_35_complete/Python_3_14_rebuilt')
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')
const modules=[],issues=[],titles=[],exampleFiles=[]
for(let n=1;n<=35;n++){
 const dir=join(root,`Module_${String(n).padStart(2,'0')}`),files=fs.readdirSync(dir),names=files.filter(f=>/^\d\d_/.test(f)&&!f.startsWith('00_')&&f.endsWith('.md')).sort(),overview=read(join(dir,'00_module_overview.md')),lessons=[]
 for(const file of names){
  const text=read(join(dir,file)),quiz=text,qs=[...quiz.matchAll(/^(?:#{2,4} |\*\*)([МИMI])(\d+)(?:\. |\*\*|$)([^\n]*)/gm)]
  const unique=new Map(qs.map(q=>[q[1].replace('M','М').replace('I','И')+q[2],q]));qs.splice(0,qs.length,...[...unique.values()].sort((a,b)=>a.index-b.index));
  const blocks=[...text.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)],wordCount=text.split(/\s+/).length
  const code=blocks.filter(b=>b[1].trim()==='python').length,outputs=blocks.filter(b=>b[1].trim()==='text').length
  const positions=[...text.matchAll(/^#{2,4} (?:М[12])\./gm)].map(m=>Math.round(m.index/text.length*100))
  if(qs.length!==7)issues.push({n,file,issue:'question-count',actual:qs.length})
  for(const [i,q]of qs.entries()){const body=quiz.slice(q.index+q[0].length,qs[i+1]?.index??quiz.length),options=[...body.matchAll(/^([A-D])\. (.*)/gm)];if(options.length!==4||options.map(o=>o[1]).join('')!=='ABCD')issues.push({n,file,q:q[0],issue:'options',actual:options.length})}
  const title=text.split('\n')[0];titles.push({n,file,title,summary:(text.match(/## Цель урока\s+([^#]+)/)?.[1]??'').trim()})
  lessons.push({file,words:wordCount,code,outputs,questions:qs.length,positions,examples:(text.match(/Самостоятельный пример|Пример \d|### Пример/g)??[]).length})
 }
 const key=read(join(dir,`answer_key_module${String(n).padStart(2,'0')}.md`)),exam=read(join(dir,`module${String(n).padStart(2,'0')}_exam.md`)),spec=read(join(dir,'interactive_specifications.md'))
 const examQs=[...exam.matchAll(/^#{2,4} (?:К|K|Вопрос )\d+(?:\.|$)/gm)].length,answers=[...key.matchAll(/\*\*(?:Ответ:\s*[A-D]|Правильный ответ:)/g)].length+[...key.matchAll(/(?:^- \*\*[МИMIКK]\d+\.[^\n]*? — \*\*[A-D]|^\d+\. \*\*[A-D]\*\*)/gm)].length
 const headings=spec.split('\n').filter(l=>/^## (?:Интерактив|Упражнение|Задание|ИА\d|ИНТ-|И\d|\d)/.test(l))
 const extra=files.includes('examples')?fs.readdirSync(join(dir,'examples'),{recursive:true}).filter(f=>fs.statSync(join(dir,'examples',f)).isFile()):[]
 exampleFiles.push(...extra.map(f=>({n,file:f})))
 if(examQs!==20)issues.push({n,issue:'exam-count',actual:examQs})
 if(answers!==names.length*7+20)issues.push({n,issue:'key-count',actual:answers,expected:names.length*7+20})
 modules.push({n,title:overview.split('\n')[0],lessons,examQs,answers,interactiveHeadings:headings,studentBrief:files.includes('interactive_student_briefs.md'),examples:extra.length})
}
const report={modules,issues,titles,exampleFiles}
fs.writeFileSync('artifacts/python-course-audit.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({modules:modules.length,lessons:titles.length,lessonQuestions:modules.flatMap(m=>m.lessons).reduce((s,l)=>s+l.questions,0),examQuestions:modules.reduce((s,m)=>s+m.examQs,0),keyAnswers:modules.reduce((s,m)=>s+m.answers,0),exampleFiles:exampleFiles.length,missingBriefs:modules.filter(m=>!m.studentBrief).map(m=>m.n),issues},null,2))
for(const m of modules)console.log(JSON.stringify({n:m.n,title:m.title,lessons:m.lessons.length,words:Math.round(m.lessons.reduce((s,l)=>s+l.words,0)/m.lessons.length),code:m.lessons.reduce((s,l)=>s+l.code,0),interactive:m.interactiveHeadings}))
