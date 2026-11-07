import {openSync,writeFileSync,readFileSync,closeSync,unlinkSync,mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
export function withContentLock(action,root=process.cwd()) {
 const folder=resolve(root,'.tools');mkdirSync(folder,{recursive:true});const path=resolve(folder,'content.lock');const end=Date.now()+10000
 for(;;){try{const fd=openSync(path,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);break}catch(error){if(error.code!=='EEXIST')throw error
  try{const old=readFileSync(path,'utf8'),pid=Number(old);if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0)}catch(error){if(error.code==='ESRCH'&&readFileSync(path,'utf8')===old){unlinkSync(path);continue}}}}catch{/* Another process released the lock. */}
  if(Date.now()>end)throw new Error('Контент занят другим сохранением. Повторите позже.');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,40)
 }}
 try{return action()}finally{unlinkSync(path)}
}
