// Serialize changes and expose only committed state. A failed write cannot spend coins.
export function createTransactionQueue<T>(initial:T,persist:(value:T)=>Promise<void>,onCommit:(value:T)=>void) {
  let current=initial,tail:Promise<void>=Promise.resolve()
  return {
    get current(){return current},
    run(transform:(value:T)=>T) {
      const task=tail.catch(()=>{}).then(async()=>{
        const next=transform(current)
        if(next===current)return
        await persist(next)
        current=next;onCommit(next)
      })
      tail=task.catch(()=>{})
      return task
    },
  }
}
