export const advertisingKey = 'answerbook.advertising.v1'
export const advertisingVersion = '2026-11-06.2'

export function advertisingMode(){
  return {enabled:true,personalized:false}
}

export function advertisingTextEntry(element:{tagName:string;type?:string;disabled?:boolean;readOnly?:boolean;isContentEditable?:boolean}|null){
  if(!element||element.disabled||element.readOnly)return false
  return element.isContentEditable===true||element.tagName==='TEXTAREA'||
    (element.tagName==='INPUT'&&['text','search','email','url','tel','password','number'].includes(element.type??'text'))
}

export function advertisingChoice(raw: string | null): boolean | null {
  try {
    const record = JSON.parse(raw ?? 'null')
    return record?.version === advertisingVersion && typeof record.enabled === 'boolean'
      && typeof record.changedAt === 'string' && Number.isFinite(Date.parse(record.changedAt))
      ? record.enabled : null
  } catch { return null }
}

export function advertisingRecord(enabled: boolean) {
  return {version: advertisingVersion, enabled, changedAt: new Date().toISOString()}
}
