import { useState } from 'react'
import { useStore } from '../store'
import type { AITool, ClaudeAgent } from '../types'

export function Sidebar() {
  const tools = useStore((s) => s.tools)
  const newSession = useStore((s) => s.newSession)
  const toggleSessionBrowser = useStore((s) => s.toggleSessionBrowser)
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)
  const toggleSharedContext = useStore((s) => s.toggleSharedContext)
  const refreshTools = useStore((s) => s.refreshTools)

  const agents = useStore((s) => s.agents)
  const agentsRaw = useStore((s) => s.agentsRaw)
  const agentsError = useStore((s) => s.agentsError)
  const agentsLoading = useStore((s) => s.agentsLoading)
  const loadAgents = useStore((s) => s.loadAgents)
  const attachAgent = useStore((s) => s.attachAgent)

  const [showRaw, setShowRaw] = useState(false)

  const installed = tools.filter((t) => t.installed)
  const missing = tools.filter((t) => !t.installed)
  const claude = tools.find((t) => t.id === 'claude')

  const launch = (tool: AITool) => {
    if (!tool.installed) return
    newSession({ tool })
  }

  const openAgentsInPane = () => {
    if (!claude) return
    newSession({ tool: { ...claude, args: ['agents'] } })
  }

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__brand-mark">▟</div>
        <div className="sidebar__brand-text">
          <div className="sidebar__brand-name">ATERM</div>
          <div className="sidebar__brand-sub">multi-AI terminal</div>
        </div>
      </div>

      <button className="sidebar__cta" onClick={() => toggleCommandPalette(true)}>
        <span>Launch tool</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="sidebar__section">
        <div className="sidebar__section-title">
          <span>Installed</span>
          <button className="sidebar__rescan" onClick={() => void refreshTools()} title="Rescan PATH">↻</button>
        </div>
        {installed.length === 0 && <div className="sidebar__empty">Scanning…</div>}
        {installed.map((t) => (
          <button key={t.id} className="sidebar__tool" onClick={() => launch(t)} title={t.description}>
            <span className="sidebar__tool-icon">{t.icon}</span>
            <span className="sidebar__tool-name">{t.name}</span>
            <span className="sidebar__tool-go">↵</span>
          </button>
        ))}
      </div>

      <div className="sidebar__section sidebar__section--agents">
        <div className="sidebar__section-title">
          <span>claude agents{agents.length > 0 ? ` · ${agents.length}` : ''}</span>
          <div className="sidebar__title-actions">
            {agentsRaw.length > 0 && (
              <button
                className="sidebar__rescan"
                onClick={() => setShowRaw((v) => !v)}
                title={showRaw ? 'Hide raw output' : 'Show raw command output'}
              >{showRaw ? '–' : '⌥'}</button>
            )}
            <button
              className="sidebar__rescan"
              onClick={() => void loadAgents()}
              title="Re-run `claude agents`"
            >↻</button>
            <button
              className="sidebar__rescan"
              onClick={openAgentsInPane}
              disabled={!claude?.installed}
              title="Open `claude agents` interactively in a new pane"
            >⤢</button>
          </div>
        </div>

        {agentsLoading && agents.length === 0 && (
          <div className="sidebar__empty">Running <code>claude agents</code>…</div>
        )}

        {!agentsLoading && agentsError && (
          <div className="sidebar__error">
            <div className="sidebar__error-text">{agentsError}</div>
            {!claude?.installed && (
              <div className="sidebar__empty-hint"><code>claude</code> not on PATH</div>
            )}
          </div>
        )}

        {!agentsLoading && !agentsError && agents.length === 0 && (
          <div className="sidebar__empty sidebar__empty--hint">
            No agents reported.
            <button className="sidebar__link" onClick={openAgentsInPane} disabled={!claude?.installed}>
              Run `claude agents` in a pane →
            </button>
          </div>
        )}

        {agents.map((a) => (
          <AgentRow
            key={a.id + a.display}
            agent={a}
            onClick={() => attachAgent(a)}
            disabled={!claude?.installed}
          />
        ))}

        {showRaw && agentsRaw && (
          <pre className="sidebar__raw">{agentsRaw}</pre>
        )}
      </div>

      {missing.length > 0 && (
        <div className="sidebar__section">
          <div className="sidebar__section-title"><span>Not installed</span></div>
          {missing.map((t) => (
            <div key={t.id} className="sidebar__tool is-missing" title={`${t.command} not found on PATH`}>
              <span className="sidebar__tool-icon">{t.icon}</span>
              <span className="sidebar__tool-name">{t.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sidebar__spacer" />

      <div className="sidebar__section">
        <button className="sidebar__row" onClick={() => toggleSessionBrowser(true)}>
          <span>◆ Claude sessions</span>
          <kbd>⌘P</kbd>
        </button>
        <button className="sidebar__row" onClick={() => toggleSharedContext()}>
          <span>≡ Shared context</span>
          <kbd>⌘J</kbd>
        </button>
      </div>
    </nav>
  )
}

function AgentRow({
  agent,
  onClick,
  disabled,
}: {
  agent: ClaudeAgent
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      className={`sidebar__agent ${disabled ? 'is-disabled' : ''}`}
      onClick={() => !disabled && onClick()}
      title={disabled ? '`claude` not installed' : `Attach: claude agents ${agent.id}`}
    >
      <div className="sidebar__agent-row1">
        <span className="sidebar__agent-name">{agent.id}</span>
      </div>
      {agent.detail && (
        <div className="sidebar__agent-desc">{agent.detail}</div>
      )}
    </button>
  )
}
