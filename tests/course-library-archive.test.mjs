import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {syncCourseLibrary} from '../scripts/sync-course-library.mjs'

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'answerbook-library-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root}
function write(root,name,text='source'){const p=path.join(root,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text)}
function sources(root){for(const name of ['theory-source','course-source','exercise-source'])write(root,`server/${name}/sample.json`)}
test('missing sources fail before modifying the archive, even with empty artifacts',t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'artifacts'));write(root,'course-library/keep.txt','backup')
 assert.throws(()=>syncCourseLibrary(root),/Нет исходных материалов/)
 assert.equal(fs.readFileSync(path.join(root,'course-library/keep.txt'),'utf8'),'backup')
 assert.equal(fs.existsSync(path.join(root,'course-library/README.md')),false)
})
test('source archive succeeds without artifacts and reports no upload package',t=>{
 const root=fixture(t);sources(root);const result=syncCourseLibrary(root)
 assert.equal(result.files,3);assert.equal(result.latestRevision,null)
 assert.match(fs.readFileSync(path.join(root,'course-library/upload/README.md'),'utf8'),/Готовых комплектов пока нет/)
})
test('upload instructions use numeric latest revision and do not copy stale advice',t=>{
 const root=fixture(t);sources(root)
 write(root,'artifacts/s3-upload/README.md','Use only revision-263/catalog.json')
 for(const n of [9,271])write(root,`artifacts/s3-upload/revision-${n}/catalog.json`,'{}')
 assert.equal(syncCourseLibrary(root).latestRevision,'revision-271')
 const readme=fs.readFileSync(path.join(root,'course-library/upload/README.md'),'utf8')
 assert.match(readme,/revision-271/);assert.doesNotMatch(readme,/263/);assert.match(readme,/Сначала загрузите файлы courses/)
})
