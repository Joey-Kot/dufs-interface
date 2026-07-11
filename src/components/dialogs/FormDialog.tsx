import { useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import type { FormDialog as FormDialogState } from '../../types'

export function FormDialog({ dialog, onClose }: { dialog: FormDialogState; onClose: () => void }) {
  const [value, setValue] = useState(dialog.initialValue)
  const [submitting, setSubmitting] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
    if (!trimmed || trimmed.includes('..')) return
    setSubmitting(true)
    await dialog.onSubmit(trimmed)
    setSubmitting(false)
    onClose()
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <form className="form-modal" onSubmit={(event) => void submit(event)}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">File operation</p>
            <h2>{dialog.title}</h2>
          </div>
          <button className="icon-button subtle" type="button" onClick={onClose} title="Close"><X size={17} /></button>
        </div>
        <label>{dialog.label}<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <div className="modal-actions">
          <button className="action-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={!value.trim() || submitting} type="submit">{submitting && <LoaderCircle size={15} className="spin" />}{dialog.submitLabel}</button>
        </div>
      </form>
    </div>
  )
}
