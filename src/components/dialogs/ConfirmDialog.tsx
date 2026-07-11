import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import type { ConfirmDialog as ConfirmDialogState } from '../../types'

export function ConfirmDialog({ dialog, onClose }: { dialog: ConfirmDialogState; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  const confirm = async () => {
    setSubmitting(true)
    try {
      await dialog.onConfirm()
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) onClose() }}>
      <section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
        <div className="modal-heading">
          <div className="confirm-heading-content">
            <span className="confirm-icon"><AlertTriangle size={19} /></span>
            <div>
              <p className="eyebrow">Confirm deletion</p>
              <h2 id="confirm-dialog-title">{dialog.title}</h2>
            </div>
          </div>
          <button className="icon-button subtle" type="button" onClick={onClose} disabled={submitting} title="Close" aria-label="Close"><X size={17} /></button>
        </div>
        <p id="confirm-dialog-message" className="confirm-message">{dialog.message}</p>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button ref={confirmButtonRef} className="danger-button danger-button-solid" type="button" onClick={() => void confirm()} disabled={submitting}>
            {submitting && <LoaderCircle size={15} className="spin" />}{dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
