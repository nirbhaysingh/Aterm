import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { aterm } from '../api'
import type { AITool, ClaudeAgent } from '../types'

export function Sidebar() {
  const tools = useStore((s) => s.tools)
  const newSession = useStore((s) => s.newSession)
  const toggleSessionBrowser = useStore((s) => s.toggleSessionBrowser)
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)
  const toggleSharedContext = useStore((s) => s.toggleSharedContext)
  const refreshTools = useStore((s) => s.refreshTools)

  const agents = useStore((s) => s.agents)
  const agentsLoading = useStore((s) => s.agentsLoading)
  const agentsCwd = useStore((s) => s.agentsCwd)
  const loadAgents = useStore((s) => s.loadAgents)
  const attachAgent = useStore((s) => s.attachAgent)
  const toggleAgentEditor = useStore((s) => s.toggleAgentEditor)

  const [agentFilter, setAgentFilter] = useState('')

  const installed = tools.filter((t) => t.installed)
  const missing = tools.filter((t) => !t.installed)
  const claude = tools.find((t) => t.id === 'claude')

  const filteredAgents = useMemo(() => {
    const q = agentFilter.trim().toLowerCase()
    if (!q) return agents
    return agents.filter((a) =>
      `${a.name} ${a.description} ${(a.tools ?? []).join(' ')}`.toLowerCase().includes(q),
    )
  }, [agents, agentFilter])

  const projectAgents = filteredAgents.filter((a) => a.source === 'project')
  const userAgents = filteredAgents.filter((a) => a.source === 'user')

  const launch = (tool: AITool) => {
    if (!tool.installed) return
    newSession({ tool })
  }

  const openInteractive = () => {
    if (!claude) return
    newSession({ tool: { ...claude, args: ['agents'] } })
  }

  const handleAgentClick = (agent: ClaudeAgent, e: React.MouseEvent) => {
    if (e.altKey) {
      void aterm.claude.openAgent(agent.filePath)
      return
    }
    attachAgent(agent)
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
          <span>Claude Agents{agents.length > 0 ? ` · ${agents.length}` : ''}</span>
          <div className="sidebar__title-actions">
            <button
              className="sidebar__rescan"
              onClick={() => void loadAgents(agentsCwd)}
              title="Reload agents from disk"
            >↻</button>
            <button
              className="sidebar__rescan"
              onClick={openInteractive}
              disabled={!claude?.installed}
              title="Open `claude agents` interactively in a new pane"
            >⤢</button>
            <button
              className="sidebar__rescan"
              onClick={() => void aterm.claude.openAgentsDir()}
              title="Reveal ~/.claude/agents in Finder"
            >▤</button>
            <button
              className="sidebar__rescan sidebar__rescan--cta"
              onClick={() => toggleAgentEditor(true)}
              title="Create a new agent"
            >+</button>
          </div>
        </div>

        {agents.length > 5 && (
          <input
            className="sidebar__filter"
            placeholder="Filter agents…"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          />
        )}

        {agentsLoading && agents.length === 0 && (
          <div className="sidebar__empty">Loading agents…</div>
        )}

        {!agentsLoading && agents.length === 0 && (
          <div className="sidebar__empty sidebar__empty--hint">
            No agents yet.
            <button className="sidebar__link" onClick={() => toggleAgentEditor(true)}>
              Create your first agent →
            </button>
          </div>
        )}

        {projectAgents.length > 0 && (
          <div className="sidebar__agent-group">
            <div className="sidebar__agent-group-title">Project</div>
            {projectAgents.map((a) => (
              <AgentRow key={a.id} agent={a} onClick={handleAgentClick} disabled={!claude?.installed} />
            ))}
          </div>
        )}
        {userAgents.length > 0 && (
          <div className="sidebar__agent-group">
            {projectAgents.length > 0 && <div className="sidebar__agent-group-title">User</div>}
            {userAgents.map((a) => (
              <AgentRow key={a.id} agent={a} onClick={handleAgentClick} disabled={!claude?.installed} />
            ))}
          </div>
        )}
        {agents.length > 0 && filteredAgents.length === 0 && (
          <div className="sidebar__empty">No matches.</div>
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
  onClick: (a: ClaudeAgent, e: React.MouseEvent) => void
  disabled: boolean
}) {
  return (
    <button
      className={`sidebar__agent ${disabled ? 'is-disabled' : ''}`}
      onClick={(e) => !disabled && onClick(agent, e)}
      title={
        `${agent.name}` +
        (agent.description ? `\n\n${agent.description}` : '') +
        `\n\nClick: launch claude --agent ${agent.name}` +
        '\nAlt+Click: open agent file'
      }
    >
      <div className="sidebar__agent-row1">
        <span className="sidebar__agent-name">{agent.name}</span>
        {agent.tools && (
          <span className="sidebar__agent-tools" title={`Tools: ${agent.tools.join(', ')}`}>
            {agent.tools.length}T
          </span>
        )}
      </div>
      {agent.description && (
        <div className="sidebar__agent-desc">{agent.description}</div>
      )}
    </button>
  )
}
