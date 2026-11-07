import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'

// VM modules let the tests execute the production storage/update code against
// isolated host adapters, without a browser, Android device or user data.
// Keep the VM flag local to these tests; the normal npm test command is unchanged.
if(!process.argv.includes('--storage-generation-child')) {
  for(const [scenario,name] of [
    ['browser-fence','browser generation fence rejects stale/null-deleted saves and accepts its own queued writes'],
    ['native-fence','native generation fence persists deletion epochs across reloads'],
    ['stale-player-profile','a stale player and profession editor cannot resurrect a fully purged course'],
    ['browser-recovery','browser recovery preserves a corrupt profile without blocking other courses or losing deferred cleanup'],
    ['native-recovery','native recovery preserves a corrupt profile without blocking other courses or losing deferred cleanup'],
    ['browser-failed-write','browser payload failures allow retry while stale retry tokens still reject an external writer'],
    ['native-failed-write','native payload failures allow retry while stale retry tokens still reject an external writer'],
  ])test(name,()=>{
    const child=spawnSync(process.execPath,['--experimental-strip-types','--experimental-vm-modules',fileURLToPath(import.meta.url),'--storage-generation-child',scenario],{cwd:process.cwd(),encoding:'utf8',timeout:15000})
    assert.ifError(child.error)
    assert.equal(child.status,0,child.stderr+'\n'+child.stdout)
    assert.match(child.stdout,/PASS:/)
  })
} else {
  const {readFileSync}=await import('node:fs')
  const vm=await import('node:vm')
  const {stripTypeScriptTypes}=await import('node:module')
  const {createHash}=await import('node:crypto')
  const libraryApi=await import('../src/lib/courseLibrary.ts')
  const {CourseLibrary,emptyLibrary}=libraryApi
  const {validateDownloadedCourse}=await import('../src/lib/learningDownloads.ts')
  const {summarizeCourse}=await import('../src/lib/courseCatalog.ts')
  const learning=await import('../src/lib/learning.ts')
  const {freshLearningAttempt,finishLearningAttempt,restartLearningAttempt,restoreLearningAttempt,learningStorageKey}=learning
  const profile=await import('../src/lib/profile.ts')
  const {downloadCourse}=await import('./fixtures/synthetic-course.mjs')
  const url='https://content.example.test/catalog.json'
  const c1=validateDownloadedCourse(structuredClone(downloadCourse)),c2=validateDownloadedCourse({...structuredClone(downloadCourse),id:'second-course'})
  const files=new Map()
  const manifest={schemaVersion:1,revision:1,directions:[{id:'fundamentals',title:'Основы',description:'Описание'}],courses:[c1,c2].map(c=>{
    const raw=JSON.stringify(c),sha256=createHash('sha256').update(raw).digest('hex'),file=`${c.id}-v${c.version}-${sha256}.json`
    files.set(file,raw)
    return {id:c.id,version:c.version,file,sha256,bytes:Buffer.byteLength(raw),summary:summarizeCourse(c)}
  })}
  const fetcher=async u=>String(u)===url?new Response(JSON.stringify(manifest)):new Response(files.get(String(u).split('/').at(-1)))
  const completed=finishLearningAttempt(c1,{...freshLearningAttempt(c1),answers:{'test-output-1':'8'}})
  const key=learningStorageKey(c1.id),otherKey=learningStorageKey(c2.id),profileKey='answerbook.profile.v1'
  const rawProfile={...profile.emptyProfile(),professions:[{id:'p',title:'P',courses:[c1,c2].map(c=>({id:'learning:'+c.id,title:c.title,learningCourseId:c.id}))}],completedCourseIds:['learning:'+c1.id,'learning:'+c2.id]}
  const synthetic=(context,values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context})
  function world(native=false){
    const local=new Map(),preferences=new Map(),persistent={raw:JSON.stringify(emptyLibrary(manifest)),fail:false}
    const faults=new Map()
    function beforeSet(key){
      const fault=faults.get(key)
      if(!fault)return
      if(fault.skip>0){fault.skip--;return}
      if(fault.count>0){fault.count--;throw Error('injected write failure: '+key)}
    }
    const queues=new Map()
    const locks={request:(name,fn)=>{const next=(queues.get(name)??Promise.resolve()).catch(()=>{}).then(fn);queues.set(name,next);return next}}
    const host={local,preferences,persistent,native,put:(k,v)=>(native?preferences:local).set(k,v),get:k=>(native?preferences:local).get(k)??null,failSet:(key,skip=0,count=1)=>faults.set(key,{skip,count})}
    host.app=async()=>{
      const context=vm.createContext({console,URL,AbortSignal,TextDecoder,crypto,navigator:{locks},location:{href:url},window:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:k=>local.get(k)??null,setItem:(k,v)=>{beforeSet(k);local.set(k,v)},removeItem:k=>local.delete(k)}})
      const storageDeps={
        '@capacitor/core':{Capacitor:{isNativePlatform:()=>native,getPlatform:()=>native?'android':'web'}},
        '@capacitor/preferences':{Preferences:{get:async({key})=>({value:preferences.get(key)??null}),set:async({key,value})=>{beforeSet(key);preferences.set(key,value)},remove:async({key})=>preferences.delete(key)}},
        './privacy':{privacyKey:'privacy'},'./advertising':{advertisingKey:'advertising'},'./learning':learning,'./profile':profile,
      }
      const storageModule=new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../src/lib/storage.ts',import.meta.url),'utf8')),{context})
      await storageModule.link(spec=>synthetic(context,storageDeps[spec]));await storageModule.evaluate()
      let published,learningDep
      class HostLibrary extends CourseLibrary {constructor(state,address,persist,publish){super(state,address,persist,publish,fetcher)}}
      const deps={
        './profile':profile,'@capacitor/core':storageDeps['@capacitor/core'],
        '../data/content-host.json':{default:{catalogUrl:url}},
        './learningContent':{shippedCatalog:manifest,installLibrary:s=>{published=s;learningDep.setExport('learningCourses',s.installed.courses);learningDep.setExport('savedProgress',s.progress)},learningCourses:[],savedProgress:{}},
        './courseLibrary':{...libraryApi,CourseLibrary:HostLibrary},
        './learningCache':{readLearningCache:async()=>persistent.raw,writeLearningCache:async(text,expected)=>{if(persistent.fail)throw Error('disk full');if(!native)assert.equal(persistent.raw,expected);persistent.raw=text}},
        './courseNotifications':{initializeCourseNotifications:async()=>{},observeCourseManifest:async()=>{}},
      }
      const updatesModule=new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(new URL('../src/lib/courseUpdates.ts',import.meta.url),'utf8')),{context,initializeImportMeta:meta=>{meta.env={DEV:false}}})
      await updatesModule.link(spec=>{
        if(spec==='./storage')return storageModule
        const dep=synthetic(context,deps[spec]);if(spec==='./learningContent')learningDep=dep;return dep
      });await updatesModule.evaluate()
      await updatesModule.namespace.initializeLearningContent()
      // main.tsx loads per-course native Preferences after catalog startup.
      await storageModule.namespace.initializeStorage(manifest.courses.map(c=>c.id))
      return {storage:storageModule.namespace,updates:updatesModule.namespace,state:()=>published}
    }
    return host
  }
  async function fence(native){
    const w=world(native),a=await w.app(),s=a.storage
    assert.equal(typeof s.readStorageSnapshot,'function')
    assert.equal(typeof s.readStorageToken,'function')
    const absent=s.readStorageSnapshot(key)
    assert.equal(absent.value,null);assert.equal(typeof absent.token,'string')
    await s.removeStored(key)
    assert.notEqual(s.readStorageToken(key),absent.token,'deletion of an absent value must still invalidate the old writer')
    await assert.rejects(s.writeStored(key,'stale',absent.token))
    assert.equal(s.readStored(key),null)
    let token=s.readStorageToken(key)
    const first=s.writeStored(key,'first',()=>token).then(t=>{token=t})
    const second=s.writeStored(key,'second',()=>token).then(t=>{token=t})
    await Promise.all([first,second])
    assert.equal(s.readStored(key),'second')
    assert.equal(token,s.readStorageToken(key))
    const old=s.readStorageSnapshot(key)
    await s.writeStored(key,'external')
    await assert.rejects(s.writeStored(key,'overwritten',()=>old.token))
    assert.equal(s.readStored(key),'external')
    await s.writeStored(otherKey,'other course')
    const stale=s.readStorageSnapshot(key)
    await s.removeStored(key)
    const restarted=await w.app()
    assert.equal(restarted.storage.readStored(key),null)
    assert.equal(restarted.storage.readStored(otherKey),'other course')
    await assert.rejects(restarted.storage.writeStored(key,'resurrection',stale.token))
    const fresh=restarted.storage.readStorageSnapshot(key)
    const savedToken=await restarted.storage.writeStored(key,'fresh attempt',fresh.token)
    assert.equal(savedToken,restarted.storage.readStorageToken(key))
    assert.equal(restarted.storage.readStored(key),'fresh attempt')
  }
  async function stalePlayerProfile(){
    const w=world(),a=await w.app(),b=await w.app()
    await a.updates.downloadCourse(c1.id)
    const active={...restartLearningAttempt(c1,completed),answers:{'test-output-1':'8'}}
    await a.storage.writeStored(key,JSON.stringify(active))
    await a.storage.writeStored(otherKey,'unrelated course answers')
    await a.storage.writeStored(profileKey,JSON.stringify(rawProfile))
    const staleAttempt=a.storage.readStorageSnapshot(key),staleProfile=a.storage.readStorageSnapshot(profileKey)
    await b.updates.removeCourse(c1.id,true)
    assert.equal(w.get(key),null)
    assert.deepEqual(JSON.parse(w.persistent.raw).pendingPurges,[])
    const edited={...JSON.parse(staleAttempt.value),answers:{'test-output-1':'9'}}
    await assert.rejects(a.storage.writeStored(key,JSON.stringify(edited),staleAttempt.token))
    const editedProfile={...JSON.parse(staleProfile.value),professions:[...rawProfile.professions,{id:'new',title:'New',courses:rawProfile.professions[0].courses.slice(1)}]}
    await assert.rejects(a.storage.writeStored(profileKey,JSON.stringify(editedProfile),staleProfile.token))
    assert.deepEqual(JSON.parse(w.get(profileKey)).completedCourseIds,['learning:'+c2.id])
    assert.equal(w.get(otherKey),'unrelated course answers')
    const restarted=await w.app();await restarted.updates.downloadCourse(c1.id)
    assert.equal(restoreLearningAttempt(restarted.storage.readStored(key),c1).lastResult,undefined)
    const fresh=restarted.storage.readStorageSnapshot(key)
    await restarted.storage.writeStored(key,JSON.stringify(freshLearningAttempt(c1)),fresh.token)
    assert.equal(restoreLearningAttempt(restarted.storage.readStored(key),c1).finished,false)
  }
  async function recovery(native){
    const w=world(native),a=await w.app()
    await a.updates.downloadCourse(c1.id);await a.updates.downloadCourse(c2.id)
    await a.storage.writeStored(key,JSON.stringify(completed))
    await a.storage.writeStored(otherKey,'unrelated course answers')
    await a.storage.writeStored(profileKey,'{broken')
    // Deleting a course with an unreadable profile must not strand the entire
    // application in a startup recovery loop or destroy the damaged evidence.
    await a.updates.removeCourse(c1.id,true)
    const restarted=await w.app()
    assert.equal(restarted.storage.readStored(key),null)
    assert.equal(restarted.storage.readStored(profileKey),'{broken')
    assert.equal(restarted.storage.readStored(otherKey),'unrelated course answers')
    assert.deepEqual(JSON.parse(w.persistent.raw).pendingPurges,[])
    assert.deepEqual(JSON.parse(w.persistent.raw).installed.courses.map(c=>c.id),[c2.id])
    // Once a valid profile is recovered, the deferred reset still applies only
    // to the deleted course and preserves every other manual completion.
    await restarted.storage.writeStored(profileKey,JSON.stringify(rawProfile))
    const repaired=await w.app()
    assert.deepEqual(JSON.parse(repaired.storage.readStored(profileKey)).completedCourseIds,['learning:'+c2.id])
    assert.equal(repaired.storage.readStored(otherKey),'unrelated course answers')
    await repaired.updates.downloadCourse(c1.id)
    assert.equal(restoreLearningAttempt(repaired.storage.readStored(key),c1).lastResult,undefined)
  }
  async function failedWrite(native){
    const w=world(native),a=await w.app(),s=a.storage
    let token=await s.writeStored(key,'original')
    await s.writeStored(otherKey,'untouched')
    w.failSet(key)
    await assert.rejects(s.writeStored(key,'lost payload',token))
    assert.equal(s.readStored(key),'original')
    assert.equal(s.readStorageToken(key),token,'successful rollback restores the token captured by the UI')
    token=await s.writeStored(key,'retry succeeds',token)
    assert.equal(s.readStored(key),'retry succeeds')
    // The stamp write succeeds, the payload write fails, then restoring the old
    // stamp also fails. The caller needs its own failure's authoritative token.
    w.failSet(key)
    w.failSet('answerbook.revision:'+key,1)
    let failure
    try{await s.writeStored(key,'failed again',token)}catch(error){failure=error}
    assert.ok(failure)
    assert.equal(typeof failure.retryToken,'string')
    assert.equal(failure.retryToken,s.readStorageToken(key))
    assert.equal(s.readStored(key),'retry succeeds')
    const retryToken=failure.retryToken
    token=await s.writeStored(key,'after rollback failure',retryToken)
    assert.equal(s.readStored(key),'after rollback failure')
    // A retry token is not an override: another writer can invalidate it.
    w.failSet(key)
    w.failSet('answerbook.revision:'+key,1)
    let laterFailure
    try{await s.writeStored(key,'own failed state',token)}catch(error){laterFailure=error}
    assert.equal(typeof laterFailure?.retryToken,'string')
    await s.writeStored(key,'external state')
    await assert.rejects(s.writeStored(key,'stale retry',laterFailure.retryToken))
    assert.equal(s.readStored(key),'external state')
    // Match the UI callbacks: a failed queued write updates only its own retry
    // reference before the following queued write resolves expected().
    let queuedToken=s.readStorageToken(key)
    w.failSet(key)
    w.failSet('answerbook.revision:'+key,1)
    let failed=false
    const rejected=s.writeStored(key,'first queued value',()=>queuedToken).then(t=>{queuedToken=t},error=>{failed=true;queuedToken=error.retryToken})
    const following=s.writeStored(key,'next queued value',()=>queuedToken).then(t=>{queuedToken=t})
    await Promise.all([rejected,following])
    assert.equal(failed,true)
    assert.equal(s.readStored(key),'next queued value')
    assert.equal(s.readStorageToken(key),queuedToken)
    assert.equal(s.readStored(otherKey),'untouched')
  }
  const scenario=process.argv.at(-1)
  if(scenario==='browser-fence')await fence(false)
  else if(scenario==='native-fence')await fence(true)
  else if(scenario==='stale-player-profile')await stalePlayerProfile()
  else if(scenario==='browser-recovery')await recovery(false)
  else if(scenario==='native-recovery')await recovery(true)
  else if(scenario==='browser-failed-write')await failedWrite(false)
  else if(scenario==='native-failed-write')await failedWrite(true)
  else throw Error('Unknown storage scenario')
  console.log('PASS: '+scenario)
}
