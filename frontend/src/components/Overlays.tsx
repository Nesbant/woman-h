import { useEffect } from 'react'
import type { ReactNode } from 'react'

function useEscape(onClose: () => void) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
}

export function Drawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return <>
    <div className="scrim" onClick={onClose} />
    <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>{children}</aside>
  </>
}

export function Modal({ labelledBy, onClose, children, size = 'md' }: { labelledBy: string; onClose: () => void; children: ReactNode; size?: 'sm' | 'md' }) {
  useEscape(onClose)
  return <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
    <div className={`modal${size === 'sm' ? ' modal-sm' : ''}`}>{children}</div>
  </div>
}

/** A yes/no decision. The confirm button says exactly what will happen. */
export function ConfirmDialog({ title, children, confirmLabel, danger, busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return <Modal labelledBy="confirm-title" onClose={onCancel} size="sm">
    <div className="modal-head plain"><div><strong id="confirm-title">{title}</strong></div>
      <button className="close" aria-label="Cerrar" onClick={onCancel}>✕</button></div>
    <div className="modal-body dialog-body">{children}</div>
    <div className="modal-foot"><div className="dialog-actions">
      <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>Cancelar</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</button>
    </div></div>
  </Modal>
}
