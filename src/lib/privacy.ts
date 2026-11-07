export const privacyKey='answerbook.privacy-acknowledgement.v1'
export const disclaimerVersion='1'
export function privacyAcknowledged(raw:string|null,version:string):boolean {
  try{const value=JSON.parse(raw??'null');return value?.policyVersion===version&&value?.disclaimerVersion===disclaimerVersion&&value?.acknowledged===true&&typeof value?.acceptedAt==='string'&&Number.isFinite(Date.parse(value.acceptedAt))}catch{return false}
}
export function privacyAcknowledgement(version:string,acceptedAt=new Date().toISOString()) {
  if(!version||!Number.isFinite(Date.parse(acceptedAt)))throw Error('Неверное подтверждение ознакомления')
  return {policyVersion:version,disclaimerVersion,acceptedAt,acknowledged:true}
}
