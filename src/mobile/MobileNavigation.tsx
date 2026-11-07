import './navigation.css'
import {Advertising} from './Advertising'
export type AppView = 'catalog' | 'learning' | 'profile'
const items: { id: AppView; title: string; path: string }[] = [
  { id: 'catalog', title: 'Каталог', path: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z' },
  { id: 'learning', title: 'Курсы', path: 'M12 6v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z' },
  { id: 'profile', title: 'Личный кабинет', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2' },
]
export function MobileNavigation({ active, onNavigate }: { active: AppView; onNavigate: (view: AppView) => void }) {
  return <>
    <Advertising />
    <nav className="mobile-bottom-nav mobile-only no-print" aria-label="Основное меню">{items.map(item => <button key={item.id} aria-current={active === item.id ? 'page' : undefined} onClick={() => onNavigate(item.id)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d={item.path} /></svg><span>{item.title}</span></button>)}</nav>
  </>
}
