import {withContentLock} from './lib/content-lock.mjs'
import {fileURLToPath} from 'node:url'
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {courseDocument} from '../src/lib/courseStructure.ts'
import {retiredCourseIds,retiredCourseSet} from '../src/lib/retiredCourses.ts'
import {validateDownloadedCourse,validateLearningManifest} from '../src/lib/learningDownloads.ts'
import {summarizeCourse} from '../src/lib/courseCatalog.ts'

const arg=name=>process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : undefined
export function publishLearning(options={}) {
const root=resolve(options.output??'server/AnswerBook.ContentApi/content')
const source=resolve(options.input??'server/course-source')
const read=file=>JSON.parse(readFileSync(file,'utf8'))
const courses=new Map()
const directions=new Map(read('src/data/learning-directions.json').map(d=>[d.id,d]))
if(existsSync(source))for(const file of readdirSync(source).filter(f=>f.endsWith('.json'))) {
  const data=read(join(source,file))
  if(file==='directions.json'){for(const d of data)directions.set(d.id,d);continue}
  const course=validateDownloadedCourse(data)
  if(course.formatVersion!==2 || !course.modules)throw new Error('Новые курсы должны использовать formatVersion: 2 и modules')
  if(retiredCourseSet.has(course.id))throw new Error('Курс удалён: используйте новый ID')
  courses.set(course.id,course)
}
const oldManifest=existsSync(join(root,'catalog.json')) ? validateLearningManifest(read(join(root,'catalog.json'))) : undefined
const revision=Number(options.revision??(oldManifest?.revision??0)+1)
if(!Number.isSafeInteger(revision)||revision<1||oldManifest && revision<=oldManifest.revision)throw new Error('Увеличьте revision каталога')
const files=[]
for(const course of courses.values()) {
  validateDownloadedCourse(course)
  if(!directions.has(course.direction))throw new Error('Нет направления: '+course.direction)
  const json=JSON.stringify(courseDocument(course)),sha256=createHash('sha256').update(json).digest('hex')
  const previous=oldManifest?.courses.find(c=>c.id===course.id)
  if(previous && (course.version<previous.version || course.version===previous.version && sha256!==previous.sha256))throw new Error('Повысите version изменённого курса: '+course.id)
  files.push({id:course.id,version:course.version,file:`${course.id}-v${course.version}-${sha256}.json`,sha256,bytes:Buffer.byteLength(json),summary:summarizeCourse(course,value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')),json})
}
const manifest=validateLearningManifest({schemaVersion:1,revision,removedIds:[...retiredCourseIds],directions:[...directions.values()],courses:files.map(({json:_json,...entry})=>entry)})
mkdirSync(join(root,'courses'),{recursive:true})
// Publish immutable payloads first. The last rename exposes a complete catalog.
for(const file of files)if(!existsSync(join(root,'courses',file.file)))writeFileSync(join(root,'courses',file.file),file.json)
const temporary=join(root,`catalog-${process.pid}.tmp`)
writeFileSync(temporary,JSON.stringify(manifest,null,2))
renameSync(temporary,join(root,'catalog.json'))
if(!options.output && !options.input)writeFileSync('src/data/download-catalog.json',JSON.stringify(manifest,null,2))
return manifest
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))withContentLock(()=>{const m=publishLearning({output:arg('--output'),input:arg('--input'),revision:arg('--revision')});console.log(`Опубликован каталог ${m.revision}: ${m.courses.length} курсов.`)})
