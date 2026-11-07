import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent } from 'react'
import './select.css'

type Option = { value: string; label: string }
type Props = { label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean; hideLabel?: boolean; menuClassName?:string }

export function Select({ label, value, options, onChange, disabled = false, hideLabel = false, menuClassName = '' }: Props) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const selected = options.findIndex(option => option.value === value)
  const [active, setActive] = useState(Math.max(0, selected))
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 })
  const search = useRef({ text: '', at: 0 })

  function close() { setOpen(false) }
  function choose(index: number) {
    const option = options[index]
    if (!option) return
    close()
    onChange(option.value)
    trigger.current?.focus({ preventScroll: true })
  }
  function show() {
    if (disabled || !options.length) return
    setActive(Math.max(0, selected))
    setOpen(true)
  }
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const nav = document.querySelector('.mobile-bottom-nav')?.getBoundingClientRect()
      const viewportBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight
      const bottom = Math.min(viewportBottom, nav?.height ? nav.top : viewportBottom) - 8
      const below = Math.max(0, bottom - rect.bottom - 6)
      const above = Math.max(0, Math.min(rect.top, bottom) - 14)
      const upwards = below < 160 && above > below
      const maxHeight = Math.min(320, options.length * 56 + 12, upwards ? above : below)
      const width = Math.min(rect.width, window.innerWidth - 16)
      setPosition({ top: upwards ? Math.min(rect.top, bottom) - 6 - maxHeight : rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width, maxHeight })
    }
    place()
    const reposition = (event: Event) => { if (!menu.current?.contains(event.target as Node)) place() }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', reposition, true)
    window.visualViewport?.addEventListener('resize', place)
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', reposition, true)
      window.visualViewport?.removeEventListener('resize', place)
      document.removeEventListener('pointerdown', outside)
    }
  }, [open, options.length])
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, id, open])
  useEffect(() => { if (disabled) close() }, [disabled])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') { close(); return }
    if (event.key === 'Escape') { if (open) { event.preventDefault(); close() }; return }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      if (!open) { show(); return }
      if (event.key === 'Enter' || event.key === ' ') choose(active)
      else if (event.key === 'Home') setActive(0)
      else if (event.key === 'End') setActive(options.length - 1)
      else setActive(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const text = (Date.now() - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase('ru')
      search.current = { text, at: Date.now() }
      const index = options.findIndex(option => option.label.toLocaleLowerCase('ru').startsWith(text))
      if (index >= 0) { if (!open) show(); setActive(index) }
    }
  }
  return <div className="custom-select">
    <span id={`${id}-label`} className={`custom-select-label${hideLabel ? ' is-hidden' : ''}`}>{label}</span>
    <button ref={trigger} type="button" className="custom-select-trigger" role="combobox" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined} disabled={disabled || !options.length} onClick={() => open ? close() : show()} onKeyDown={onKeyDown} onBlur={close}>
      <span id={`${id}-value`}>{options[selected]?.label ?? 'Выберите'}</span><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && createPortal(<div ref={menu} id={`${id}-list`} className={`custom-select-menu ${menuClassName}`} role="listbox" aria-labelledby={`${id}-label`} style={position} onMouseDown={event => event.preventDefault()}>
      {options.map((option, index) => <div key={option.value} id={`${id}-${index}`} role="option" title={option.label} aria-selected={option.value === value} className={`custom-select-option ${active === index ? 'is-active' : ''}`} onClick={() => choose(index)}><span>{option.label}</span>{option.value === value && <span aria-hidden="true">✓</span>}</div>)}
    </div>, document.body)}
  </div>
}
