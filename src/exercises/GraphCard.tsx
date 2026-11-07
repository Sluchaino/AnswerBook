import type {ReactNode} from 'react'

// Shared presentation only: trace snapshots and editable graphs keep separate logic.
export function GraphCard({title,badge,children,className=''}:{title:ReactNode;badge?:string;children:ReactNode;className?:string}) {
  return <article className={`graph-card ${className}`}><strong>{title}</strong>{badge&&<small>{badge}</small>}{children}</article>
}
