import type {ReactNode} from 'react'
import {Select} from '../components/Select'
export function Field({label,value,onChange,multiline=false,readOnly=false}:{label:string;value:string|number;onChange?:(value:string)=>void;multiline?:boolean;readOnly?:boolean}) {return <label className="author-field"><span>{label}</span>{multiline?<textarea value={value} onChange={event=>onChange?.(event.target.value)} readOnly={readOnly} rows={4}/>:<input value={value} onChange={event=>onChange?.(event.target.value)} readOnly={readOnly}/>}</label>}
export function Choice({label,value,options,onChange}:{label:string;value:string;options:readonly (readonly [string,string])[];onChange:(value:string)=>void}) {return <Select label={label} value={value} options={options.map(([value,label])=>({value,label}))} onChange={onChange}/>}
export function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}) {return <label className="author-toggle"><input type="checkbox" checked={checked} onChange={event=>onChange(event.target.checked)}/>{label}</label>}
export function Box({title,children}:{title:string;children:ReactNode}){return <fieldset className="author-box"><legend>{title}</legend>{children}</fieldset>}
export function Remove({label,onClick}:{label:string;onClick:()=>void}) {return <button type="button" className="secondary" onClick={onClick}>{label}</button>}
