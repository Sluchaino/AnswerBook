import {useId,useState} from 'react'
import type {ReactNode} from 'react'
import './direction-group.css'

export function DirectionGroup({title,description,count,children}:{title:string;description?:string;count:string;children:ReactNode}) {
  const id=useId()
  const [open,setOpen]=useState(true)
  return <section className="direction-group" aria-labelledby={id}><details open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="direction-group-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}<span className="direction-group-count">{count}</span></div><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
    <div className="direction-group-content">{children}</div>
  </details></section>
}
