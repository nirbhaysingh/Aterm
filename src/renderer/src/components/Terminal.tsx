import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { aterm } from '../api'
import { useStore } from '../store'
import type { SessionMeta } from '../types'

type Props = {
  session: SessionMeta
  paneId: string
  isActive: boolean
  onFocus: () => void
}

const THEME = {
  background: '#0e1116',
  foreground: '#e6e6e6',
  cursor: '#64ffda',
  cursorAccent: '#0e1116',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#ff5c57',
  green: '#5af78e',
  yellow: '#f3f99d',
  blue: '#57c7ff',
  magenta: '#ff6ac1',
  cyan: '#9aedfe',
  white: '#f1f1f0',
  brightBlack: '#686868',
  brightRed: '#ff5c57',
  brightGreen: '#5af78e',
  brightYellow: '#f3f99d',
  brightBlue: '#57c7ff',
  brightMagenta: '#ff6ac1',
  brightCyan: '#9aedfe',
  brightWhite: '#f1f1f0',
}

export function TerminalPane({ session, paneId, isActive, onFocus }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const spawnedRef = useRef(false)
  const appendShared = useStore((s) => s.appendSharedContext)
  const zoomedPaneId = useStore((s) => s.zoomedPaneId)
  const toggleZoom = useStore((s) => s.toggleZoom)
  const closeSession = useStore((s) => s.closeSession)
  const isZoomed = zoomedPaneId === paneId
  const isHidden = zoomedPaneId !== null && !isZoomed

  useEffect(() => {
    if (!hostRef.current || termRef.current) return

    const term = new XTerm({
      fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      theme: THEME,
      scrollback: 10000,
    })
    const fit = new FitAddon()
    const links = new WebLinksAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(links)
    term.loadAddon(search)
    term.open(hostRef.current)

    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const onData = term.onData((data) => {
      aterm.pty.write(session.id, data)
    })

    const offData = aterm.pty.onData(({ sessionId, data }) => {
      if (sessionId === session.id) term.write(data)
    })

    const offExit = aterm.pty.onExit(({ sessionId, exitCode }) => {
      if (sessionId === session.id) {
        term.write(`\r\n\x1b[2m[process exited with code ${exitCode}]\x1b[0m\r\n`)
      }
    })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        const { cols, rows } = term
        aterm.pty.resize(session.id, cols, rows)
      } catch {
        // not yet attached
      }
    })
    ro.observe(hostRef.current)

    if (!spawnedRef.current) {
      spawnedRef.current = true
      const { cols, rows } = term
      void aterm.pty.serialize(session.id).then((existing) => {
        if (existing && termRef.current) {
          termRef.current.write(existing)
        }
      })
      void aterm.pty.spawn({
        sessionId: session.id,
        command: session.command,
        args: session.args,
        cwd: session.cwd,
        cols,
        rows,
      })
    }

    return () => {
      onData.dispose()
      offData()
      offExit()
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // session id is stable for the life of this component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  useEffect(() => {
    if (isActive) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit()
          termRef.current?.focus()
        } catch {
          // ignore
        }
      })
    }
  }, [isActive])

  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
        const t = termRef.current
        if (t) aterm.pty.resize(session.id, t.cols, t.rows)
        if (isZoomed) t?.focus()
      } catch {
        // ignore
      }
    })
  }, [isZoomed, isHidden, session.id])

  const handleSendToShared = async () => {
    const text = await aterm.pty.serialize(session.id)
    if (text.trim()) {
      const stripped = text.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      appendShared(`# ${session.title} — ${new Date().toLocaleString()}\n\n${stripped.slice(-2000)}`)
      useStore.getState().toggleSharedContext(true)
    }
  }

  return (
    <div
      className={[
        'term-pane',
        isActive ? 'is-active' : '',
        isZoomed ? 'is-zoomed' : '',
        isHidden ? 'is-hidden' : '',
      ].filter(Boolean).join(' ')}
      onMouseDown={onFocus}
    >
      <div className="term-pane__header">
        <span className="term-pane__title">{session.title}</span>
        <span className="term-pane__cwd" title={session.cwd}>
          {session.cwd.replace(/^\/Users\/[^/]+/, '~')}
        </span>
        <div className="term-pane__actions">
          <button
            type="button"
            className="term-pane__btn"
            title="Send last output to Shared Context"
            onClick={handleSendToShared}
          >
            ↗
          </button>
          <button
            type="button"
            className="term-pane__btn"
            title={isZoomed ? 'Exit full screen (⌘⇧Enter)' : 'Full screen this pane (⌘⇧Enter)'}
            onClick={() => toggleZoom(paneId)}
          >
            {isZoomed ? '⤡' : '⤢'}
          </button>
          <button
            type="button"
            className="term-pane__btn term-pane__btn--close"
            title="Close pane (⌘W)"
            onClick={(e) => {
              e.stopPropagation()
              closeSession(session.id)
            }}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="term-pane__host" ref={hostRef} />
    </div>
  )
}
