export type Theme='light'|'dark'
export const parseTheme=(value:string|null):Theme=>value==='dark' ? 'dark' : 'light'
export const nextTheme=(theme:Theme):Theme=>theme==='dark' ? 'light' : 'dark'
export function applyTheme(theme:Theme) {
  document.documentElement.dataset.theme=theme
  document.documentElement.style.colorScheme=theme==='light' ? 'only light' : 'dark'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark' ? '#101625' : '#f3f5fa')
}
