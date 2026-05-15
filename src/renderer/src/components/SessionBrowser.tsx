import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { aterm } from '../api'
import type { ClaudeSessionMeta } from '../types'

type SearchHit = {
  session: ClaudeSessionMeta
  excerpt: string
  matchedAt: number
}

export function SessionBrowser() {
  const open = useStore((s) => s.sessionBrowserOpen)
  const close = () => useStore.getState().toggleSessionBrowser(false)
  const tools = useStore((s) => s.tools)
  const newSession = useStore((s) => s.newSession)

  const [sessions, setSessions] = useState<ClaudeSessionMeta[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    aterm.claude.listSessions().then((s) => {
      setSessions(s)
      setLoading(false)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 2) {
      setHits(null)
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      const h = await aterm.claude.search(q)
      setHits(h)
      setSearching(false)
    }, 220)
    return () => clearTimeout(handle)
  }, [query, open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) =>
      `${s.projectName} ${s.projectPath} ${s.firstMessage} ${s.lastMessage}`.toLowerCase().includes(q),
    )
  }, [sessions, query])

  if (!open) return null

  const claude = tools.find((t) => t.id === 'claude')

  const launchInProject = (s: ClaudeSessionMeta) => {
    if (!claude) return
    newSession({ tool: claude, cwd: s.projectPath })
    close()
  }

  const resumeSession = (s: ClaudeSessionMeta) => {
    if (!claude) return
    newSession({
      tool: { ...claude, args: ['--resume', s.id] },
      cwd: s.projectPath,
    })
    close()
  }

  return (
    <div className="palette-overlay" onMouseDown={close}>
      <div className="browser" role="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="browser__header">
          <span className="browser__title">Claude Code sessions</span>
          <input
            className="browser__search"
            placeholder="Filter projects or search transcripts (2+ chars searches content)…"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="browser__close" onClick={close}>✕</button>
        </div>
        <div className="browser__body">
          {loading && <div className="browser__empty">Loading sessions…</div>}
          {!loading && sessions.length === 0 && (
            <div className="browser__empty">
              No Claude Code sessions found in <code>~/.claude/projects</code>.
            </div>
          )}
          {!loading && hits && (
            <div className="browser__section">
              <div className="browser__section-title">
                Transcript matches {searching && '· searching…'}
              </div>
              {hits.length === 0 && !searching && <div className="browser__empty-small">No matches.</div>}
              {hits.map((h, i) => (
                <button
                  key={`${h.session.id}-${i}`}
                  className="browser__item"
                  onClick={() => resumeSession(h.session)}
                  title="Click to resume this session"
                >
                  <div className="browser__row1">
                    <span className="browser__proj">{h.session.projectName}</span>
                    <span className="browser__meta">{formatDate(h.session.modifiedAt)} · {h.session.messageCount} msgs</span>
                  </div>
                  <div className="browser__row2">{h.excerpt}</div>
                </button>
              ))}
            </div>
          )}
          {!loading && !hits && (
            <div className="browser__section">
              <div className="browser__section-title">Recent sessions ({filtered.length})</div>
              {filtered.map((s) => (
                <div key={s.id} className="browser__item browser__item--session">
                  <div className="browser__row1">
                    <span className="browser__proj">{s.projectName}</span>
                    <span className="browser__meta">{formatDate(s.modifiedAt)} · {s.messageCount} msgs</span>
                  </div>
                  <div className="browser__row2" title={s.firstMessage}>{s.firstMessage || s.lastMessage || '(empty session)'}</div>
                  <div className="browser__row3">
                    <span className="browser__path" title={s.projectPath}>{s.projectPath}</span>
                    <div className="browser__actions">
                      <button className="browser__action" onClick={() => resumeSession(s)} disabled={!claude || !claude.installed}>
                        Resume
                      </button>
                      <button className="browser__action" onClick={() => launchInProject(s)} disabled={!claude || !claude.installed}>
                        New in project
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="browser__footer">
          <kbd>esc</kbd> close
          {!claude?.installed && <span className="browser__warn">⚠ <code>claude</code> CLI not found on PATH</span>}
        </div>
      </div>
    </div>
  )
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
