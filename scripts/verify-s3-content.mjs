import fs from 'node:fs'
import assert from 'node:assert/strict'
import {fetchLearningBundle} from '../src/lib/learningDownloads.ts'

const {catalogUrl}=JSON.parse(fs.readFileSync(new URL('../src/data/content-host.json',import.meta.url),'utf8'))
// Read-only live check, using the same integrity/format validation as the app.
// The bundle stays in memory: no local progress, cache or cloud objects are written.
for(const origin of ['https://localhost','http://127.0.0.1:5193']) {
  let requests=0,saved
  const fetcher=async(url,options)=>{
    requests++
    const headers=new Headers(options?.headers)
    headers.set('Origin',origin)
    const response=await fetch(url,{...options,headers})
    assert.equal(response.status,200,`HTTP error: ${url}`)
    assert.ok(['*',origin].includes(response.headers.get('access-control-allow-origin')),`CORS blocked: ${url}`)
    return response
  }
  const empty={schemaVersion:1,revision:0,directions:[],courses:[],fingerprints:{}}
  const bundle=await fetchLearningBundle(catalogUrl,empty,async next=>{saved=next},fetcher)
  assert.equal(saved,bundle)
  assert.ok(bundle.courses.length>0,'Uploaded catalog contains no courses')
  console.log(JSON.stringify({origin,revision:bundle.revision,requests,courses:bundle.courses.map(c=>({id:c.id,version:c.version})),integrity:'SHA-256, size, schema: OK',cors:'OK'}))
}
