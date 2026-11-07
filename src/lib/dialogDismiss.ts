/** Tap the backdrop to use the same cancellation path as Escape / Android back. */
export function installDialogDismiss(document: Document) {
 let started: HTMLDialogElement | null = null
 const outside = (dialog: HTMLDialogElement, event: MouseEvent) => {
  const rect=dialog.getBoundingClientRect()
  return event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom
 }
 const dialogTarget = (event: Event): HTMLDialogElement | null => {
  const element=event.target as HTMLDialogElement | null
  return element?.nodeName==='DIALOG' && element.open ? element : null
 }
 const down = (event: PointerEvent) => {
  const dialog=dialogTarget(event)
  started=event.isPrimary && event.button===0 && dialog && outside(dialog,event) ? dialog : null
 }
 const cancel = () => {started=null}
 const click = (event: MouseEvent) => {
  const dialog=started
  started=null
  if(!dialog || dialogTarget(event)!==dialog || !outside(dialog,event))return
  // Do not activate the page underneath when closing removes the backdrop.
  event.preventDefault()
  event.stopPropagation()
  // Editors can prevent cancellation while a save is in progress.
  if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})) && dialog.open)dialog.close()
 }
 document.addEventListener('pointerdown',down,true)
 document.addEventListener('pointercancel',cancel,true)
 document.addEventListener('click',click,true)
 return () => {
  document.removeEventListener('pointerdown',down,true)
  document.removeEventListener('pointercancel',cancel,true)
  document.removeEventListener('click',click,true)
 }
}
