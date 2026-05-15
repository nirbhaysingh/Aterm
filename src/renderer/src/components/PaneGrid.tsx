import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { TerminalPane } from './Terminal'
import { useStore } from '../store'
import type { PaneNode, SessionMeta } from '../types'

type Props = { root: PaneNode }

export function PaneGrid({ root }: Props) {
  const zoomedPaneId = useStore((s) => s.zoomedPaneId)
  return (
    <div className={`pane-root ${zoomedPaneId ? 'is-zoomed' : ''}`}>
      <Node node={root} />
    </div>
  )
}

function Node({ node }: { node: PaneNode }) {
  const sessions = useStore((s) => s.sessions)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const selectSession = useStore((s) => s.selectSession)
  const updatePaneSizes = useStore((s) => s.updatePaneSizes)

  if (node.type === 'leaf') {
    if (!node.sessionId) {
      return <EmptyPane />
    }
    const session = sessions[node.sessionId] as SessionMeta | undefined
    if (!session) return <EmptyPane />
    return (
      <TerminalPane
        session={session}
        paneId={node.id}
        isActive={activeSessionId === node.sessionId}
        onFocus={() => selectSession(node.sessionId)}
      />
    )
  }

  const dir = node.direction === 'horizontal' ? 'horizontal' : 'vertical'
  return (
    <PanelGroup
      direction={dir}
      onLayout={(sizes) => updatePaneSizes(node.id, sizes)}
      id={node.id}
    >
      {node.children.map((child, idx) => (
        <Container key={child.id} idx={idx} count={node.children.length} initial={node.sizes[idx] ?? 100 / node.children.length}>
          <Node node={child} />
        </Container>
      ))}
    </PanelGroup>
  )
}

function Container({ children, idx, count, initial }: { children: React.ReactNode; idx: number; count: number; initial: number }) {
  return (
    <>
      <Panel defaultSize={initial} minSize={10}>
        {children}
      </Panel>
      {idx < count - 1 && <PanelResizeHandle className="pane-resize" />}
    </>
  )
}

function EmptyPane() {
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette)
  return (
    <div className="empty-pane">
      <div className="empty-pane__inner">
        <div className="empty-pane__brand">ATERM</div>
        <div className="empty-pane__sub">A terminal for AI tools.</div>
        <button type="button" className="empty-pane__cta" onClick={() => toggleCommandPalette(true)}>
          Launch a tool <kbd>⌘K</kbd>
        </button>
        <div className="empty-pane__hint">
          <span>⌘\</span> split right · <span>⌘⇧\</span> split down · <span>⌘P</span> sessions · <span>⌘J</span> shared context
        </div>
      </div>
    </div>
  )
}
