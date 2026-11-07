import fs from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {validateLearningManifest,validateDownloadedCourse} from '../src/lib/learningDownloads.ts'

// Prepare a local snapshot only. Cloud credentials and cloud writes are not used.
const source=resolve('server/AnswerBook.ContentApi/content'),catalog=fs.readFileSync(join(source,'catalog.json'))
const manifest=validateLearningManifest(JSON.parse(catalog.toString('utf8')))
const target=resolve('artifacts/s3-upload',`revision-${manifest.revision}`),payloads=[]
for(const entry of manifest.courses){
 const bytes=fs.readFileSync(join(source,'courses',entry.file))
 if(bytes.length!==entry.bytes||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Неверный размер или SHA-256: '+entry.id)
 const course=validateDownloadedCourse(JSON.parse(bytes.toString('utf8')))
 if(course.id!==entry.id||course.version!==entry.version)throw Error('Версия курса не совпадает с каталогом: '+entry.id)
 payloads.push({file:entry.file,bytes})
}
const expected=new Map([['catalog.json',catalog],...payloads.map(p=>['courses/'+p.file,p.bytes])])
if(fs.existsSync(target))for(const file of fs.readdirSync(target,{recursive:true,withFileTypes:true}).filter(e=>e.isFile())){
 const relative=join(file.parentPath,file.name).slice(target.length+1).replaceAll('\\','/')
 if(!expected.has(relative))throw Error('В папке подготовки есть посторонний файл: '+relative)
}
fs.mkdirSync(join(target,'courses'),{recursive:true})
for(const [relative,bytes]of expected){const path=join(target,relative);if(fs.existsSync(path)&&!fs.readFileSync(path).equals(bytes))throw Error('Существующий снимок отличается: '+relative)}
for(const p of payloads)fs.writeFileSync(join(target,'courses',p.file),p.bytes)
// Upload these payloads before catalog.json when publishing this snapshot.
fs.writeFileSync(join(target,'catalog.json'),catalog)
console.log(JSON.stringify({directory:target,revision:manifest.revision,courses:payloads.length,files:expected.size,bytes:[...expected.values()].reduce((n,b)=>n+b.length,0),cloudUploaded:false},null,2))
