export function referenceAnswer(e){
 if(e.type==='matching')return {type:e.type,pairs:structuredClone(e.validation.pairs)}
 if(e.type==='sequence'||e.type==='code-order')return {type:e.type,order:[...e.validation.acceptedOrders[0]]}
 if(e.type==='code-debug')return {type:e.type,selection:e.content.errors[0].location,fixId:e.validation.acceptedFixes[e.content.errors[0].id][0]}
 if(e.type==='data-transform')return {type:e.type,steps:structuredClone(e.validation.solution)}
 if(e.type==='architecture-builder'){const v=e.validation.variants[0];return {type:e.type,closed:true,undo:[],graph:{nodes:v.nodes.map((n,i)=>({...n,x:(i%3)/3,y:Math.floor(i/3)/3})),edges:structuredClone(v.edges)}}}
 if(e.type==='code-trace'){const end=e.content.steps.at(-1).id;return {type:e.type,mode:'practice',stepId:end,furthestStepId:end,responses:Object.fromEntries(e.content.predictions.map(p=>[p.id,{choiceId:p.correctOptionId,checkedChoiceId:p.correctOptionId,firstChoiceId:p.correctOptionId,attempts:1}]))}}
 throw Error('Unsupported exercise '+e.type)
}
export function wrongAnswer(e){
 const a=referenceAnswer(e)
 if(a.type==='matching'){const [x,y]=Object.keys(a.pairs);[a.pairs[x],a.pairs[y]]=[a.pairs[y],a.pairs[x]]}
 else if(a.type==='sequence'||a.type==='code-order')a.order.reverse()
 else if(a.type==='code-debug')a.fixId=e.content.fixOptions.find(f=>!e.validation.acceptedFixes[e.content.errors[0].id].includes(f.id)).id
 else if(a.type==='data-transform')a.steps=[]
 else if(a.type==='architecture-builder'){a.graph.edges=[]}
 else if(a.type==='code-trace'){a.responses={};a.furthestStepId=e.content.initial.id;a.stepId=e.content.initial.id}
 return a
}
