import styles from '../mobile.css?inline'

// Android always uses the phone layout, including landscape and large font settings.
// Browsers select this layout by viewport size; print keeps the full document.
export function MobileLayoutStyles({ enabled }: { enabled: boolean }) {
  return <style data-answerbook-layout="mobile" media={enabled ? 'all' : 'print'}>{styles}</style>
}
