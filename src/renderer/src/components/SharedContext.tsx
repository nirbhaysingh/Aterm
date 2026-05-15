import { useStore } from '../store'
import { aterm } from '../api'

export function SharedContext() {
  const open = useStore((s) => s.sharedContextOpen)
  const text = useStore((s) => s.sharedContext)
  const setText = useStore((s) => s.setSharedContext)
  const close = () => useStore.getState().toggleSharedContext(false)
  const activeSessionId = useStore((s) => s.activeSessionId)

  if (!open) return null

  const sendToActive = () => {
    if (!activeSessionId) return
    aterm.pty.write(activeSessionId, text)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(text)
  }

  return (
    <aside className="shared">
      <div className="shared__header">
        <span className="shared__title">Shared Context</span>
        <div className="shared__actions">
          <button onClick={copy} title="Copy to clipboard">Copy</button>
          <button onClick={sendToActive} disabled={!activeSessionId} title="Paste into the active session">
            ↳ Send to active
          </button>
          <button onClick={() => setText('')} title="Clear">Clear</button>
          <button onClick={close} title="Close">✕</button>
        </div>
      </div>
      <textarea
        className="shared__editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          'Scratchpad shared across all sessions.\n\nPaste in errors, plans, or snippets and pipe them into any AI tool with one click.\n\nUse the ↗ button on a terminal to grab its last output.'
        }
        spellCheck={false}
      />
      <div className="shared__footer">
        Persists across restarts · {text.length} chars
      </div>
    </aside>
  )
}
