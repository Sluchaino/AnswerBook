import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'

export function syncCourseLibrary(root){
const required=['server/theory-source','server/course-source','server/exercise-source']
for(const name of required){
 const source=path.join(root,name)
 if(!fs.existsSync(source)||!fs.statSync(source).isDirectory()||!fs.readdirSync(source,{recursive:true,withFileTypes:true}).some(e=>e.isFile()))throw Error('Нет исходных материалов: '+name+'. Архив не создан; восстановите исходники из резервной копии.')
}
const library=path.join(root,'course-library')
fs.mkdirSync(library,{recursive:true})
let files=0
function copy(source,target){
 if(!fs.existsSync(source))return
 const stat=fs.lstatSync(source)
 if(stat.isSymbolicLink())throw Error('Unexpected symlink: '+source)
 if(stat.isDirectory()){
  fs.mkdirSync(target,{recursive:true})
  for(const name of fs.readdirSync(source))copy(path.join(source,name),path.join(target,name))
 }else{
  fs.mkdirSync(path.dirname(target),{recursive:true})
  fs.copyFileSync(source,target)
  const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex')
  if(hash(source)!==hash(target))throw Error('Copy verification failed: '+source)
  files++
 }
}
for(const [source,target] of [
 ['server/theory-source','sources/theory'],
 ['server/course-source','sources/course-json'],
 ['server/exercise-source','sources/exercises'],
])copy(path.join(root,source),path.join(library,target))
const uploads=path.join(root,'artifacts/s3-upload')
if(fs.existsSync(uploads))for(const entry of fs.readdirSync(uploads,{withFileTypes:true})){
 if(entry.isDirectory()&&/^revision-\d+$/.test(entry.name))copy(path.join(uploads,entry.name),path.join(library,'upload',entry.name))
}
for(const name of fs.existsSync(path.join(root,'artifacts'))?fs.readdirSync(path.join(root,'artifacts')):[]){
 if(/^AnswerBook-Yandex-Cloud-revision-\d+\.zip$/.test(name))copy(path.join(root,'artifacts',name),path.join(library,'upload',name))
}
fs.mkdirSync(path.join(library,'upload'),{recursive:true})
const revisions=fs.readdirSync(path.join(library,'upload')).filter(n=>/^revision-\d+$/.test(n)).sort((a,b)=>Number(b.slice(9))-Number(a.slice(9)))
const uploadInstructions=`# Загрузка курсов в Яндекс Клауд

${revisions.length?'Последний подготовленный комплект: '+revisions[0]+'.':'Готовых комплектов пока нет. Выполните публикацию контента и npm run content:prepare:s3, затем npm run courses:archive.'}

Используйте содержимое комплекта revision-N, сохраняя имена файлов.
1. Сначала загрузите файлы courses/ в папку courses/ бакета answerbook-content-2026.
2. Последним замените catalog.json в корне бакета.
Не загружайте эту инструкцию и исходники. Не используйте каталог из старой ревизии.
`
fs.writeFileSync(path.join(library,'upload/README.md'),uploadInstructions,'utf8')
// Keep the staging index current too, so subsequent copies cannot restore stale advice.
if(fs.existsSync(uploads))fs.writeFileSync(path.join(uploads,'README.md'),uploadInstructions,'utf8')
fs.writeFileSync(path.join(library,'README.md'),`# Локальная библиотека курсов AnswerBook

Эта папка целиком исключена из Git через корневой .gitignore.

- sources/theory — исходная теория и материалы по модулям.
- sources/course-json — редактируемые JSON курсов.
- sources/exercises — исходные интерактивные задания.
- upload/revision-N — готовый комплект для Object Storage: catalog.json и courses/.
- upload/AnswerBook-Yandex-Cloud-revision-N.zip — архив для загрузки.

Для Яндекс Клауд используйте комплект с наибольшей ревизией.
Сначала загрузите courses/, последним — catalog.json в корень бакета.
Папку sources загружать в бакет не нужно.

Рабочие файлы server/*-source сохранены для совместимости импортёров и также исключены из Git.
Обновить копии после изменения курсов: npm run courses:archive
Синхронизация копирует существующие файлы с проверкой SHA-256, не удаляя архивные материалы.
Храните резервную копию отдельно: GitHub эту библиотеку не сохраняет.
`, 'utf8')
return {library,files,sha256Verified:true,latestRevision:revisions[0]??null}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(syncCourseLibrary(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),null,2))
