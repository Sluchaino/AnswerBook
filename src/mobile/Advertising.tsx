import {useEffect, useRef} from 'react'
import {registerPlugin} from '@capacitor/core'
import type {PluginListenerHandle} from '@capacitor/core'
import {App as NativeApp} from '@capacitor/app'
import {isAndroid} from '../lib/mobile'
import {advertisingMode,advertisingTextEntry} from '../lib/advertising'

const Ads = registerPlugin<{
  addListener(eventName: 'size', listener: (event: {height: number}) => void): Promise<PluginListenerHandle>
  configure(options: {enabled: boolean;personalized?:boolean}): Promise<{enabled:boolean}>
  frame(options: {x: number; y: number; width: number; viewportWidth: number; visible: boolean}): Promise<{height: number}>
}>('YandexBanner')

export function Advertising() {
  const slot = useRef<HTMLDivElement>(null)
  const mode=advertisingMode()

  useEffect(() => {
    if (!isAndroid) return
    let cancelled = false
    let pending = false
    let lastFrame = ''
    document.documentElement.style.setProperty('--mobile-banner-height', mode.enabled ? '56px' : '0px')
    const sizeListener = Ads.addListener('size', ({height}) => {
      if (!cancelled && mode.enabled && height > 0) document.documentElement.style.setProperty('--mobile-banner-height', `${height}px`)
    })
    const update = () => {
      if (pending || cancelled) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        if (cancelled || !slot.current) return
        const rect = slot.current.getBoundingClientRect()
        const active=document.activeElement
        const editable = advertisingTextEntry(active instanceof HTMLElement ? {
          tagName:active.tagName,isContentEditable:active.isContentEditable,
          ...(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement ? {type:active.type,disabled:active.disabled,readOnly:active.readOnly}:{}),
        }:null)
        const visible = mode.enabled && !document.hidden && !editable
          && !document.querySelector('dialog[open], [role="listbox"]') && rect.width > 0
        const frame = {x: rect.x, y: rect.y, width: rect.width, viewportWidth: window.innerWidth, visible}
        const key = JSON.stringify(frame)
        if (key === lastFrame) return
        lastFrame = key
        void Ads.frame(frame).then(({height}) => {
          if (!cancelled && visible && height > 0) document.documentElement.style.setProperty('--mobile-banner-height', `${height}px`)
        }).catch(() => { /* Advertising failures never block learning. */ })
      })
    }
    void Ads.configure(mode).then(status => {
      if(cancelled)return
      if(status.enabled===false)document.documentElement.style.setProperty('--mobile-banner-height','0px')
      lastFrame = ''; update()
    }).catch(() => {})
    const observer = new ResizeObserver(update)
    if (slot.current) observer.observe(slot.current)
    const mutations = new MutationObserver(update)
    mutations.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'class', 'style']})
    const events = ['resize', 'scroll', 'focusin', 'focusout', 'visibilitychange']
    for (const event of events) window.addEventListener(event, update, true)
    window.visualViewport?.addEventListener('resize', update)
    const active = NativeApp.addListener('appStateChange', () => { lastFrame = ''; update() })
    update()
    return () => {
      cancelled = true
      observer.disconnect(); mutations.disconnect()
      for (const event of events) window.removeEventListener(event, update, true)
      window.visualViewport?.removeEventListener('resize', update)
      void active.then(handle => handle.remove())
      void sizeListener.then(handle => handle.remove()).catch(() => {})
      void Ads.configure({enabled: false}).catch(() => {})
      document.documentElement.style.removeProperty('--mobile-banner-height')
    }
  }, [])
  if (!isAndroid) return <div className="mobile-banner-slot mobile-only no-print" aria-hidden="true" />
  return <div ref={slot} className="mobile-banner-slot mobile-only no-print" aria-hidden="true" />
}
