import { Pencil } from 'lucide-react'
import type { PathItem } from '../../types'

export function EditorDialog({ editor, onChange, onClose, onSave }: { editor: { item: PathItem; content: string }; onChange: (content: string) => void; onClose: () => void; onSave: () => void }) {
  return (
    <div className="modal-backdrop editor-backdrop" role="presentation">
      <section className="editor-modal">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Text editor</p>
            <h2>{editor.item.name}</h2>
          </div>
          <div className="editor-actions">
            <button className="action-button" type="button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="button" onClick={onSave}><Pencil size={15} /> Save changes</button>
          </div>
        </div>
        <textarea value={editor.content} onChange={(event) => onChange(event.target.value)} spellCheck="false" />
      </section>
    </div>
  )
}
