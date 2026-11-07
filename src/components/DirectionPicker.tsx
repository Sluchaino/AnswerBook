import './direction-group.css'

type DirectionOption = {id:string; title:string; description?:string; count:string}

export function DirectionPicker({value,onChange,options,total}:{value:string;onChange:(id:string)=>void;options:DirectionOption[];total:string}) {
  return <nav className="direction-picker" aria-label="Выбор направления">
    <div className="direction-picker-label"><strong>Что хотите изучать?</strong><span>Выберите направление или смотрите всё</span></div>
    <div className="direction-picker-options">
      <button type="button" className="direction-option direction-option-all" aria-pressed={value==='all'} onClick={()=>onChange('all')}><strong>Все направления</strong><span>{total}</span></button>
      {options.map(option=><button type="button" className="direction-option" key={option.id} aria-pressed={value===option.id} onClick={()=>onChange(option.id)}><strong>{option.title}</strong>{option.description&&<small>{option.description}</small>}<span>{option.count}</span></button>)}
    </div>
  </nav>
}
