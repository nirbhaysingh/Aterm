import { useStore } from '../store'

export function StatusBar() {
  const sessions = useStore((s) => s.sessions)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const tabs = useStore((s) => s.tabs)
  const tools = useStore((s) => s.tools)
  const toggleSharedContext = useStore((s) => s.toggleSharedContext)
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed)

  const active = activeSessionId ? sessions[activeSessionId] : null
  const tool = active?.toolId ? tools.find((t) => t.id === active.toolId) : null
  const sessionCount = Object.keys(sessions).length

  return (
    <footer className="statusbar">
      <span className="statusbar__chunk">
        {sessionCount} session{sessionCount === 1 ? '' : 's'} · {tabs.length} tab{tabs.length === 1 ? '' : 's'}
      </span>
      {active && (
        <>
          <span className="statusbar__chunk">
            {tool ? `${tool.icon} ${tool.name}` : '$ shell'}
          </span>
          <span className="statusbar__chunk statusbar__chunk--dim" title={active.cwd}>
            {active.cwd.replace(/^\/Users\/[^/]+/, '~')}
          </span>
        </>
      )}
      <span className="statusbar__spacer" />
      <button
        className="statusbar__btn"
        onClick={() => toggleSidebar()}
        title={sidebarCollapsed ? 'Show sidebar (⌘B)' : 'Hide sidebar (⌘B)'}
      >
        {sidebarCollapsed ? '◧' : '◨'} ⌘B
      </button>
      <button className="statusbar__btn" onClick={() => toggleCommandPalette(true)}>⌘K</button>
      <button className="statusbar__btn" onClick={() => toggleSharedContext()}>⌘J context</button>
    </footer>
  )
}
