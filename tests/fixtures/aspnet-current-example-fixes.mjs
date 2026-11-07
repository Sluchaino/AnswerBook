// Historical snapshots retain their original text. Only these audited code edits
// are allowed when comparing current theory with earlier exercise-only revisions.
export function withCurrentExampleFixes(snapshot){
 const result=structuredClone(snapshot)
 for(const module of result.modules)for(const lesson of module.lessons){
  for(const block of lesson.blocks.filter(b=>b.kind==='theory'))for(const part of block.content){
   if(part.kind!=='code')continue
   if(lesson.id==='m18-l07'&&part.text.includes('AddFixedWindowLimiter')&&!part.text.includes('using Microsoft.AspNetCore.RateLimiting;'))part.text='using Microsoft.AspNetCore.RateLimiting;\n'+part.text
   if(lesson.id==='m20-l07'&&part.text.includes('OrderMetrics.Created.Add'))part.text=part.text.replace('OrderMetrics.Created.Add(1, new("channel", "web"));','var channelTag = new KeyValuePair<string, object?>("channel", "web");\n        OrderMetrics.Created.Add(1, channelTag);').replace('            new("channel", "web"));','            channelTag);')
   if(lesson.id==='m21-l08'&&part.text.includes('IOutputCacheStore')&&!part.text.includes('using Microsoft.AspNetCore.OutputCaching;'))part.text='using Microsoft.AspNetCore.OutputCaching;\n\n'+part.text
  }
 }
 return result
}
