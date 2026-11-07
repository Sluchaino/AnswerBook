type Item={id:string;label:string}

// Buttons provide the same operation on touch screens and with a keyboard.
export function OrderList({items,order,incorrectIds,onChange,code=false,language}:{items:Item[];order:string[];incorrectIds:string[];onChange:(order:string[])=>void;code?:boolean;language?:string}) {
  function move(index:number,delta:number) {
    const next=[...order];[next[index],next[index+delta]]=[next[index+delta],next[index]];onChange(next)
  }
  return <ol className="exercise-order">{order.map((id,index)=><li key={id} className={incorrectIds.includes(id)?'exercise-item-error':''}>
    <span className="exercise-position" aria-label={`Позиция ${index+1}`}>{index+1}</span>
    {code?<pre className="exercise-code" aria-label={`Фрагмент ${index+1}, ${language}`}><code>{items.find(i=>i.id===id)!.label}</code></pre>:<p>{items.find(i=>i.id===id)!.label}</p>}
    <div className="exercise-move"><button type="button" className="secondary" disabled={index===0} aria-label={`Переместить вверх: ${code?`фрагмент ${index+1}`:items.find(i=>i.id===id)!.label}`} onClick={()=>move(index,-1)}>↑</button><button type="button" className="secondary" disabled={index===order.length-1} aria-label={`Переместить вниз: ${code?`фрагмент ${index+1}`:items.find(i=>i.id===id)!.label}`} onClick={()=>move(index,1)}>↓</button></div>
    {incorrectIds.includes(id)&&<small>Проверьте положение {code?'этого фрагмента':'этого этапа'}</small>}
  </li>)}</ol>
}
