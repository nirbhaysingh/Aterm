import { useState } from 'react'
import { useStore } from '../store'

export function TabBar() {
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const selectTab = useStore((s) => s.selectTab)
  const closeTab = useStore((s) => s.closeTab)
  const newTab = useStore((s) => s.newTab)
  const renameTab = useStore((s) => s.renameTab)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  return (
    <div className="tabbar">
      <div className="tabbar__tabs">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`tab ${t.id === activeTabId ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                closeTab(t.id)
                return
              }
              if (t.id !== activeTabId) selectTab(t.id)
            }}
            onDoubleClick={() => {
              setEditingId(t.id)
              setDraft(t.title)
            }}
          >
            {editingId === t.id ? (
              <input
                autoFocus
                className="tab__edit"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  renameTab(t.id, draft.trim() || t.title)
                  setEditingId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    renameTab(t.id, draft.trim() || t.title)
                    setEditingId(null)
                  } else if (e.key === 'Escape') {
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <span className="tab__title">{t.title}</span>
            )}
            <button
              className="tab__close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              ✕
            </button>
          </div>
        ))}
        <button className="tab__new" onClick={() => newTab()} title="New tab (⌘T)">+</button>
      </div>
    </div>
  )
}
