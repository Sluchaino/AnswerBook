export function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={back ? { transform: 'rotate(180deg)' } : undefined}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
}
