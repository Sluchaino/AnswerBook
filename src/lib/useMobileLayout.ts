import { useEffect, useState } from 'react'
import { isAndroid } from './mobile'

export function useMobileLayout() {
  const query = '(max-width: 760px), (max-height: 500px) and (pointer: coarse)'
  const [mobile, setMobile] = useState(() => isAndroid || window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMobile(isAndroid || media.matches)
    media.addEventListener('change', update)
    const viewport = window.visualViewport
    const resize = () => {
      const editable = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement
      const difference = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0
      const inset = editable && difference > 100 ? difference : 0
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
    }
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    document.addEventListener('focusin', resize)
    document.addEventListener('focusout', resize)
    resize()
    return () => {
      media.removeEventListener('change', update)
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
      document.removeEventListener('focusin', resize)
      document.removeEventListener('focusout', resize)
      document.documentElement.style.removeProperty('--keyboard-inset')
    }
  }, [])
  return mobile
}
