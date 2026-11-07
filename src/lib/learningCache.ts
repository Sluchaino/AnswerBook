import {Capacitor} from '@capacitor/core'
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem'
import {Preferences} from '@capacitor/preferences'

const pointerKey='answerbook.learning-cache-pointer.v1'
function database():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('answerbook-learning',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('snapshots')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>reject(request.error)
    request.onblocked=()=>reject(new Error('Хранилище курсов занято другой вкладкой'))
  })
}
export async function readLearningCache():Promise<string|null> {
  if(Capacitor.isNativePlatform()) {
    const {value}=await Preferences.get({key:pointerKey})
    if(!value)return null
    if(!/^learning-cache-[a-f0-9-]+\.json$/.test(value))throw new Error('Повреждён указатель кеша')
    const file=await Filesystem.readFile({path:value,directory:Directory.Data,encoding:Encoding.UTF8})
    if(typeof file.data!=='string')throw new Error('Неверный кеш курсов')
    return file.data
  }
  const db=await database()
  try {return await new Promise((resolve,reject)=>{
    const tx=db.transaction('snapshots','readonly'),request=tx.objectStore('snapshots').get('current')
    tx.oncomplete=()=>resolve(typeof request.result==='string' ? request.result : null)
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  })}finally{db.close()}
}
export async function writeLearningCache(text:string,expected?:string|null):Promise<void> {
  if(Capacitor.isNativePlatform()) {
    const {value:old}=await Preferences.get({key:pointerKey})
    const path=`learning-cache-${crypto.randomUUID()}.json`
    // A crash while writing leaves the previously committed file and pointer intact.
    await Filesystem.writeFile({path,directory:Directory.Data,encoding:Encoding.UTF8,data:text})
    await Preferences.set({key:pointerKey,value:path})
    if(old && /^learning-cache-[a-f0-9-]+\.json$/.test(old))void Filesystem.deleteFile({path:old,directory:Directory.Data}).catch(()=>{})
    return
  }
  const db=await database()
  try {await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('snapshots','readwrite')
    const store=tx.objectStore('snapshots'),read=store.get('current')
    read.onsuccess=()=>{
      const current=typeof read.result==='string'?read.result:null
      if(expected!==undefined&&current!==expected){tx.abort();reject(new Error('Библиотека изменена другой вкладкой. Повторите действие.'));return}
      store.put(text,'current')
    }
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)
  })}finally{db.close()}
}
