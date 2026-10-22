import { useEffect, useRef } from 'react'

export function useBillingDialogFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement as HTMLElement | null
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')]
    ;(focusable()[0] ?? dialog).focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => { dialog.removeEventListener('keydown', onKeyDown); previous?.focus() }
  }, [])
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.contains(document.activeElement)) dialog.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus()
  })
  return dialogRef
}
