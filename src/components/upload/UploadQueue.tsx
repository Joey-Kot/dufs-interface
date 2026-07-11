import { Check, LoaderCircle, Upload, X } from 'lucide-react'
import type { UploadTask } from '../../types'

export function UploadQueue({ tasks, pinned, onCancel }: { tasks: UploadTask[]; pinned: boolean; onCancel: (taskId: string) => void }) {
  return (
    <section className="upload-queue-popover" aria-label="Upload progress">
      <header className="upload-queue-heading"><strong>Uploads</strong><span>{pinned ? 'Pinned' : tasks.some((task) => task.status === 'uploading') ? 'In progress' : `${tasks.length} items`}</span></header>
      {tasks.length ? (
        <div className="upload-task-list">
          {tasks.slice(-8).reverse().map((task) => (
            <div className={`upload-task ${task.status}`} key={task.id} title={task.error}>
              <span className="upload-task-icon" aria-hidden="true">{task.status === 'complete' ? <Check size={14} strokeWidth={2.5} /> : task.status === 'error' ? <X size={14} strokeWidth={2.5} /> : task.status === 'uploading' ? <LoaderCircle size={14} className="spin" /> : <Upload size={14} />}</span>
              <div className="upload-task-details"><div><strong title={task.name}>{task.name}</strong><span>{task.status === 'complete' ? 'Complete' : task.status === 'error' ? 'Failed' : task.status === 'uploading' ? 'Uploading' : 'Queued'}</span></div><span className="upload-progress-track"><span style={{ width: `${task.progress}%` }} /></span></div>
              <button className="upload-task-cancel" type="button" title={`Cancel ${task.name}`} aria-label={`Cancel ${task.name}`} onClick={() => onCancel(task.id)}><X size={14} /></button>
            </div>
          ))}
        </div>
      ) : <p className="upload-queue-empty">No uploads yet</p>}
    </section>
  )
}
