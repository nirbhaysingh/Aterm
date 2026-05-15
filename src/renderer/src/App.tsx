import { useEffect } from 'react'
import { useStore } from './store'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { PaneGrid } from './components/PaneGrid'
import { CommandPalette } from './components/CommandPalette'
import { SessionBrowser } from './components/SessionBrowser'
import { SharedContext } from './components/SharedContext'
import { StatusBar } from './components/StatusBar'
import type { PaneNode } from './types'
import './styles.css'

function findPaneIdForActiveSession(node: PaneNode, sessionId: string | null): string | null {
  if (node.type === 'leaf') {
    if (sessionId && node.sessionId === sessionId) return node.id
    return node.sessionId ? node.id : null
  }
  for (const c of node.children) {
    const id = findPaneIdForActiveSession(c, sessionId)
    if (id) return id
  }
  return null
}

export function App() {
  const hydrated = useStore((s) => s.hydrated)
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const sharedContextOpen = useStore((s) => s.sharedContextOpen)

  useEffect(() => {
    void useStore.getState().hydrate()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const { zoomedPaneId, commandPaletteOpen, sessionBrowserOpen } = useStore.getState()
        if (zoomedPaneId && !commandPaletteOpen && !sessionBrowserOpen) {
          e.preventDefault()
          useStore.getState().toggleZoom(null)
          return
        }
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        const { tabs, activeTabId, zoomedPaneId } = useStore.getState()
        if (zoomedPaneId) {
          useStore.getState().toggleZoom(null)
        } else {
          const tab = tabs.find((t) => t.id === activeTabId)
          if (!tab) return
          const paneId = findPaneIdForActiveSession(tab.root, tab.activeSessionId)
          if (paneId) useStore.getState().toggleZoom(paneId)
        }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'k') {
        e.preventDefault()
        useStore.getState().toggleCommandPalette()
      } else if (k === 'p') {
        e.preventDefault()
        useStore.getState().toggleSessionBrowser()
      } else if (k === 'j') {
        e.preventDefault()
        useStore.getState().toggleSharedContext()
      } else if (k === 't') {
        e.preventDefault()
        useStore.getState().newTab()
      } else if (k === 'w') {
        e.preventDefault()
        const { activeTabId, tabs } = useStore.getState()
        if (activeTabId && tabs.length > 1) useStore.getState().closeTab(activeTabId)
      } else if (k === '\\') {
        e.preventDefault()
        useStore.getState().toggleCommandPalette(true)
      } else if (/^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1
        const tab = useStore.getState().tabs[idx]
        if (tab) {
          e.preventDefault()
          useStore.getState().selectTab(tab.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!hydrated) {
    return <div className="boot">ATERM…</div>
  }

  return (
    <div className="app">
      <div className="app__titlebar">
        <span className="app__titlebar-text">ATERM</span>
      </div>
      <div className="app__body">
        <Sidebar />
        <main className="workspace">
          <TabBar />
          <div className="workspace__grid">
            {tabs.length === 0 && <div className="empty-pane">No tab</div>}
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab-content ${tab.id === activeTabId ? 'is-active' : ''}`}
                aria-hidden={tab.id !== activeTabId}
              >
                <PaneGrid root={tab.root} />
              </div>
            ))}
          </div>
        </main>
        {sharedContextOpen && <SharedContext />}
      </div>
      <StatusBar />
      <CommandPalette />
      <SessionBrowser />
    </div>
  )
}
