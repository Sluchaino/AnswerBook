import test from 'node:test'
import assert from 'node:assert/strict'
import {installDialogDismiss} from '../src/lib/dialogDismiss.ts'

function fixture(){
 const listeners=new Map()
 const doc={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
 const uninstall=installDialogDismiss(doc)
 class Dialog extends EventTarget{
  nodeName='DIALOG';open=true;closed=0
  getBoundingClientRect(){return {left:20,right:220,top:30,bottom:230}}
  close(){this.open=false;this.closed++}
 }
 const dialog=new Dialog()
 const send=(name,target,x=5,y=5,extra={})=>{
  const event={target,clientX:x,clientY:y,isPrimary:true,button:0,preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true},...extra}
  listeners.get(name)?.(event);return event
 }
 return {dialog,send,uninstall,listeners}
}
test('backdrop taps cancel a dialog and consume the click rather than triggering the page',()=>{
 const f=fixture();let cancelled=0;f.dialog.addEventListener('cancel',()=>cancelled++)
 f.send('pointerdown',f.dialog);const click=f.send('click',f.dialog)
 assert.equal(cancelled,1);assert.equal(f.dialog.closed,1)
 assert.equal(click.prevented,true);assert.equal(click.stopped,true)
})
test('content, padding and drags from inside never dismiss a dialog',()=>{
 const f=fixture()
 f.send('pointerdown',f.dialog,50,50);f.send('click',f.dialog,5,5)
 f.send('pointerdown',{nodeName:'BUTTON'},50,50);f.send('click',f.dialog,5,5)
 f.send('pointerdown',f.dialog,5,5);f.send('click',f.dialog,50,50)
 assert.equal(f.dialog.closed,0)
})
test('busy editors can cancel dismissal; pointer cancellation and secondary buttons do not dismiss',()=>{
 const f=fixture();f.dialog.addEventListener('cancel',e=>e.preventDefault())
 f.send('pointerdown',f.dialog);f.send('click',f.dialog)
 assert.equal(f.dialog.open,true)
 const g=fixture()
 g.send('pointerdown',g.dialog);g.send('pointercancel',g.dialog);g.send('click',g.dialog)
 g.send('pointerdown',g.dialog,5,5,{button:2});g.send('click',g.dialog)
 assert.equal(g.dialog.closed,0)
})
test('nested dialogs only cancel the tapped backdrop; cleanup removes listeners',()=>{
 const f=fixture();const other={...f.dialog,nodeName:'DIALOG',open:true}
 f.send('pointerdown',f.dialog);f.send('click',other)
 assert.equal(f.dialog.closed,0)
 f.uninstall();assert.equal(f.listeners.size,0)
})
