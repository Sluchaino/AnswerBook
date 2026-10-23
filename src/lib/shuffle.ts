// Keep canonical IDs/answer indices; randomize presentation, never meaning.
export function shuffled<T>(values:readonly T[],random:()=>number=Math.random,previous?:readonly T[]):T[] {
  const result=[...values]
  for(let i=result.length-1;i>0;i--){const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));[result[i],result[j]]=[result[j],result[i]]}
  if(result.length>1 && previous?.length===result.length && result.every((v,i)=>v===previous[i]))result.push(result.shift()!)
  return result
}
export function isOptionOrder(value:unknown):value is number[] {
  return Array.isArray(value) && value.length===4 && new Set(value).size===4 && value.every(i=>Number.isInteger(i) && i>=0 && i<4)
}
