import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { aterm } from '../api'
import type { AITool } from '../types'

type Mode = 'launch' | 'split-right' | 'split-down'

type Action = {
  id: string
  label: string
  hint?: string
  icon?: string
  disabled?: boolean
  group: string
  run: () => void | Promise<void>
}

export function CommandPalette() {
  const open = useStore((s) => s.commandPaletteOpen)
  const close = () => useStore.getState().toggleCommandPalette(false)
  const tools = useStore((s) => s.tools)
  const refreshTools = useStore((s) => s.refreshTools)
  const newSession = useStore((s) => s.newSession)
  const newTab = useStore((s) => s.newTab)
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const selectTab = useStore((s) => s.selectTab)
  const closeTab = useStore((s) => s.closeTab)
  const toggleSessionBrowser = useStore((s) => s.toggleSessionBrowser)
  const toggleSharedContext = useStore((s) => s.toggleSharedContext)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [mode, setMode] = useState<Mode>('launch')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      setMode('launch')
      void refreshTools()
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, refreshTools])

  const actions: Action[] = useMemo(() => {
    const list: Action[] = []
    const installedTools = tools.filter((t) => t.installed)
    const missingTools = tools.filter((t) => !t.installed)

    const runLaunch = (tool: AITool) => async () => {
      if (mode === 'launch') {
        newSession({ tool })
      } else {
        const { tabs: tt, activeTabId: at } = useStore.getState()
        const tab = tt.find((t) => t.id === at)
        if (!tab) return
        const leafId = findFirstLeafId(tab.root)
        if (leafId) {
          useStore.getState().splitPane(leafId, mode === 'split-right' ? 'horizontal' : 'vertical', tool)
        }
      }
      close()
    }

    for (const t of installedTools) {
      list.push({
        id: `launch:${t.id}`,
        label: t.name,
        hint: t.description,
        icon: t.icon ?? '▷',
        group: mode === 'launch' ? 'Launch AI tool' : mode === 'split-right' ? 'Split right with' : 'Split down with',
        run: runLaunch(t),
      })
    }
    for (const t of missingTools) {
      list.push({
        id: `missing:${t.id}`,
        label: `${t.name}  (not installed)`,
        hint: `Install ${t.command} to launch`,
        icon: t.icon ?? '·',
        group: 'Not installed',
        disabled: true,
        run: () => {},
      })
    }

    if (mode === 'launch') {
      list.push({
        id: 'cmd:newtab',
        label: 'New tab',
        hint: '⌘T',
        icon: '+',
        group: 'Workspace',
        run: () => {
          newTab()
          close()
        },
      })
      list.push({
        id: 'cmd:sessions',
        label: 'Browse Claude Code sessions…',
        hint: '⌘P',
        icon: '◆',
        group: 'Workspace',
        run: () => {
          toggleSessionBrowser(true)
          close()
        },
      })
      list.push({
        id: 'cmd:shared',
        label: 'Toggle Shared Context',
        hint: '⌘J',
        icon: '≡',
        group: 'Workspace',
        run: () => {
          toggleSharedContext()
          close()
        },
      })
      list.push({
        id: 'cmd:split-right',
        label: 'Split active pane right with…',
        hint: '⌘\\',
        icon: '⇢',
        group: 'Layout',
        run: () => {
          setMode('split-right')
          setQuery('')
          setCursor(0)
        },
      })
      list.push({
        id: 'cmd:split-down',
        label: 'Split active pane down with…',
        hint: '⌘⇧\\',
        icon: '⇣',
        group: 'Layout',
        run: () => {
          setMode('split-down')
          setQuery('')
          setCursor(0)
        },
      })
      for (const tab of tabs) {
        list.push({
          id: `tab:${tab.id}`,
          label: `Go to tab — ${tab.title}`,
          hint: tab.id === activeTabId ? 'current' : undefined,
          icon: '▤',
          group: 'Tabs',
          run: () => {
            selectTab(tab.id)
            close()
          },
        })
      }
      if (activeTabId && tabs.length > 1) {
        list.push({
          id: 'cmd:close-tab',
          label: 'Close current tab',
          icon: '✕',
          group: 'Tabs',
          run: () => {
            closeTab(activeTabId)
            close()
          },
        })
      }
    }

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tools, mode, tabs, activeTabId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter((a) =>
      `${a.label} ${a.hint ?? ''} ${a.group}`.toLowerCase().includes(q),
    )
  }, [actions, query])

  useEffect(() => {
    if (cursor >= filtered.length) setCursor(Math.max(0, filtered.length - 1))
  }, [filtered.length, cursor])

  if (!open) return null

  const grouped = groupBy(filtered, (a) => a.group)

  return (
    <div className="palette-overlay" onMouseDown={close}>
      <div className="palette" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette__mode">
          {mode !== 'launch' && (
            <button
              type="button"
              className="palette__back"
              onClick={() => setMode('launch')}
              title="Back"
            >
              ←
            </button>
          )}
          <span className="palette__mode-label">
            {mode === 'launch' ? 'Command palette' : mode === 'split-right' ? 'Split right with…' : 'Split down with…'}
          </span>
        </div>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Type to filter — AI tools, tabs, commands…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(c + 1, filtered.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const a = filtered[cursor]
              if (a && !a.disabled) void a.run()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
        />
        <div className="palette__list">
          {filtered.length === 0 && <div className="palette__empty">No matches</div>}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="palette__group">
              <div className="palette__group-title">{group}</div>
              {items.map((a) => {
                const globalIdx = filtered.indexOf(a)
                const selected = globalIdx === cursor
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`palette__item ${selected ? 'is-selected' : ''} ${a.disabled ? 'is-disabled' : ''}`}
                    onMouseEnter={() => setCursor(globalIdx)}
                    onClick={() => !a.disabled && void a.run()}
                  >
                    <span className="palette__icon">{a.icon}</span>
                    <span className="palette__label">{a.label}</span>
                    {a.hint && <span className="palette__hint">{a.hint}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className="palette__footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
          <span className="palette__footer-spacer" />
          <button
            type="button"
            className="palette__refresh"
            title="Rescan installed tools"
            onClick={() => void refreshTools()}
          >
            ↻ rescan
          </button>
        </div>
      </div>
    </div>
  )
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    if (!out[k]) out[k] = []
    out[k].push(item)
  }
  return out
}

function findFirstLeafId(node: import('../types').PaneNode): string | null {
  if (node.type === 'leaf') return node.id
  for (const c of node.children) {
    const id = findFirstLeafId(c)
    if (id) return id
  }
  return null
}
