import { create } from 'zustand'
import type {
  AITool,
  ClaudeAgent,
  CreateAgentResult,
  NewAgentInput,
  PaneNode,
  SessionMeta,
  WorkspaceTab,
} from './types'
import { aterm } from './api'

function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function findPane(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return node
  if (node.type === 'split') {
    for (const child of node.children) {
      const found = findPane(child, id)
      if (found) return found
    }
  }
  return null
}

function mapPane(node: PaneNode, fn: (n: PaneNode) => PaneNode): PaneNode {
  const next = fn(node)
  if (next.type === 'split') {
    return { ...next, children: next.children.map((c) => mapPane(c, fn)) }
  }
  return next
}

function removePane(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return null
  if (node.type === 'split') {
    const kept = node.children
      .map((c) => removePane(c, id))
      .filter((c): c is PaneNode => c !== null)
    if (kept.length === 0) return null
    if (kept.length === 1) return kept[0]
    const sizes = kept.map(() => 100 / kept.length)
    return { ...node, children: kept, sizes }
  }
  return node
}

function splitPaneInTree(
  root: PaneNode,
  targetId: string,
  newPane: PaneNode,
  direction: 'horizontal' | 'vertical',
): PaneNode {
  if (root.type === 'leaf') {
    if (root.id !== targetId) return root
    return {
      id: uid('split'),
      type: 'split',
      direction,
      sizes: [50, 50],
      children: [root, newPane],
    }
  }
  // split node
  const replaced: PaneNode = {
    ...root,
    children: root.children.map((c) => splitPaneInTree(c, targetId, newPane, direction)),
  }
  return replaced
}

function collectLeaves(node: PaneNode, acc: string[] = []): string[] {
  if (node.type === 'leaf') {
    acc.push(node.sessionId)
    return acc
  }
  for (const c of node.children) collectLeaves(c, acc)
  return acc
}

type Store = {
  tools: AITool[]
  sessions: Record<string, SessionMeta>
  tabs: WorkspaceTab[]
  activeTabId: string | null
  activeSessionId: string | null
  sharedContext: string
  commandPaletteOpen: boolean
  sessionBrowserOpen: boolean
  sharedContextOpen: boolean
  zoomedPaneId: string | null
  cwdDefault: string
  hydrated: boolean
  agents: ClaudeAgent[]
  agentsLoading: boolean
  agentsCwd: string | null
  agentEditorOpen: boolean
  sidebarCollapsed: boolean

  hydrate: () => Promise<void>
  persist: () => Promise<void>

  refreshTools: () => Promise<void>

  newTab: (title?: string) => string
  closeTab: (tabId: string) => void
  selectTab: (tabId: string) => void
  renameTab: (tabId: string, title: string) => void

  newSession: (opts: { tool: AITool; cwd?: string; tabId?: string }) => string
  selectSession: (sessionId: string) => void
  closeSession: (sessionId: string) => void

  splitPane: (paneId: string, direction: 'horizontal' | 'vertical', tool: AITool) => void
  updatePaneSizes: (paneId: string, sizes: number[]) => void

  setSharedContext: (text: string) => void
  appendSharedContext: (text: string) => void

  toggleCommandPalette: (open?: boolean) => void
  toggleSessionBrowser: (open?: boolean) => void
  toggleSharedContext: (open?: boolean) => void
  toggleZoom: (paneId?: string | null) => void

  loadAgents: (cwd?: string | null) => Promise<void>
  attachAgent: (agent: ClaudeAgent) => void
  toggleAgentEditor: (open?: boolean) => void
  createAgent: (input: NewAgentInput) => Promise<CreateAgentResult>
  toggleSidebar: (open?: boolean) => void
}

export const useStore = create<Store>((set, get) => ({
  tools: [],
  sessions: {},
  tabs: [],
  activeTabId: null,
  activeSessionId: null,
  sharedContext: '',
  commandPaletteOpen: false,
  sessionBrowserOpen: false,
  sharedContextOpen: false,
  zoomedPaneId: null,
  cwdDefault: '~',
  hydrated: false,
  agents: [],
  agentsLoading: false,
  agentsCwd: null,
  agentEditorOpen: false,
  sidebarCollapsed: false,

  hydrate: async () => {
    const [tools, persisted, env] = await Promise.all([
      aterm.tools.list(),
      aterm.workspace.load(),
      aterm.shell.env(),
    ])
    const sessions: Record<string, SessionMeta> = {}
    for (const s of persisted.sessions) sessions[s.id] = s
    set({
      tools,
      sessions,
      tabs: persisted.tabs,
      activeTabId: persisted.activeTabId,
      sharedContext: persisted.sharedContext,
      sidebarCollapsed: persisted.sidebarCollapsed ?? false,
      cwdDefault: env.home,
      hydrated: true,
    })
    if (persisted.tabs.length === 0) {
      get().newTab('Workspace')
    }
    void get().loadAgents(currentCwd(get()))
  },

  persist: async () => {
    const s = get()
    if (!s.hydrated) return
    await aterm.workspace.save({
      tabs: s.tabs,
      activeTabId: s.activeTabId,
      sessions: Object.values(s.sessions),
      sharedContext: s.sharedContext,
      sidebarCollapsed: s.sidebarCollapsed,
    })
  },

  refreshTools: async () => {
    const tools = await aterm.tools.rescan()
    set({ tools })
  },

  newTab: (title) => {
    const id = uid('tab')
    const tab: WorkspaceTab = {
      id,
      title: title ?? `Tab ${get().tabs.length + 1}`,
      root: { id: uid('pane'), type: 'leaf', sessionId: '' },
      activeSessionId: null,
    }
    set((st) => ({ tabs: [...st.tabs, tab], activeTabId: id, activeSessionId: null }))
    void get().persist()
    return id
  },

  closeTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab) return
    const sessionIds = collectLeaves(tab.root).filter(Boolean)
    sessionIds.forEach((sid) => void aterm.pty.kill(sid))
    const remaining = get().tabs.filter((t) => t.id !== tabId)
    const nextSessions = { ...get().sessions }
    for (const sid of sessionIds) delete nextSessions[sid]
    const activeTabId = remaining.length > 0 ? (get().activeTabId === tabId ? remaining[0].id : get().activeTabId) : null
    set({ tabs: remaining, activeTabId, sessions: nextSessions })
    void get().persist()
  },

  selectTab: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    set({ activeTabId: tabId, activeSessionId: tab?.activeSessionId ?? null, zoomedPaneId: null })
    void get().persist()
    void get().loadAgents(currentCwd(get()))
  },

  renameTab: (tabId, title) => {
    set((st) => ({ tabs: st.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)) }))
    void get().persist()
  },

  newSession: ({ tool, cwd, tabId }) => {
    const sessionId = uid('sess')
    const useCwd = cwd && cwd.length > 0 ? cwd : get().cwdDefault
    const session: SessionMeta = {
      id: sessionId,
      title: tool.name,
      toolId: tool.id === 'shell' ? null : tool.id,
      cwd: useCwd,
      command: tool.id === 'shell' ? '' : tool.command,
      args: tool.args,
      createdAt: Date.now(),
    }

    let targetTabId = tabId ?? get().activeTabId
    if (!targetTabId) {
      targetTabId = get().newTab(tool.name)
    }

    set((st) => {
      const tabs = st.tabs.map((t) => {
        if (t.id !== targetTabId) return t
        // If the tab's root is an empty leaf, fill it.
        if (t.root.type === 'leaf' && !t.root.sessionId) {
          return {
            ...t,
            root: { ...t.root, sessionId } as PaneNode,
            activeSessionId: sessionId,
            title: t.title === 'Workspace' || t.title.startsWith('Tab ') ? tool.name : t.title,
          }
        }
        // Otherwise, add a new horizontal split off the root.
        const newLeaf: PaneNode = { id: uid('pane'), type: 'leaf', sessionId }
        if (t.root.type === 'split' && t.root.direction === 'horizontal') {
          const children = [...t.root.children, newLeaf]
          const sizes = children.map(() => 100 / children.length)
          return {
            ...t,
            root: { ...t.root, children, sizes } as PaneNode,
            activeSessionId: sessionId,
          }
        }
        return {
          ...t,
          root: {
            id: uid('split'),
            type: 'split',
            direction: 'horizontal',
            sizes: [50, 50],
            children: [t.root, newLeaf],
          },
          activeSessionId: sessionId,
        }
      })
      return {
        tabs,
        sessions: { ...st.sessions, [sessionId]: session },
        activeTabId: targetTabId,
        activeSessionId: sessionId,
      }
    })
    void get().persist()
    void get().loadAgents(currentCwd(get()))
    return sessionId
  },

  selectSession: (sessionId) => {
    const { tabs, activeTabId } = get()
    if (!activeTabId) return
    set({
      activeSessionId: sessionId,
      tabs: tabs.map((t) => (t.id === activeTabId ? { ...t, activeSessionId: sessionId } : t)),
    })
    void get().persist()
    void get().loadAgents(currentCwd(get()))
  },

  closeSession: (sessionId) => {
    void aterm.pty.kill(sessionId)
    set((st) => {
      let removedPaneId: string | null = null
      const tabs = st.tabs.map((t) => {
        const paneId = getPaneIdForSession(t.root, sessionId)
        if (paneId) removedPaneId = paneId
        const stripped = removePane(t.root, paneId ?? '')
        const root: PaneNode =
          stripped ??
          ({ id: uid('pane'), type: 'leaf', sessionId: '' } as PaneNode)
        const activeSessionId = t.activeSessionId === sessionId ? firstLeafSession(root) : t.activeSessionId
        return { ...t, root, activeSessionId }
      })
      const sessions = { ...st.sessions }
      delete sessions[sessionId]
      const activeTab = tabs.find((t) => t.id === st.activeTabId)
      const zoomedPaneId = st.zoomedPaneId === removedPaneId ? null : st.zoomedPaneId
      return {
        tabs,
        sessions,
        activeSessionId: activeTab?.activeSessionId ?? null,
        zoomedPaneId,
      }
    })
    void get().persist()
  },

  splitPane: (paneId, direction, tool) => {
    const sessionId = uid('sess')
    const session: SessionMeta = {
      id: sessionId,
      title: tool.name,
      toolId: tool.id === 'shell' ? null : tool.id,
      cwd: get().cwdDefault,
      command: tool.id === 'shell' ? '' : tool.command,
      args: tool.args,
      createdAt: Date.now(),
    }
    const newLeaf: PaneNode = { id: uid('pane'), type: 'leaf', sessionId }
    set((st) => {
      const tabs = st.tabs.map((t) => {
        if (!findPane(t.root, paneId)) return t
        const root = splitPaneInTree(t.root, paneId, newLeaf, direction)
        return { ...t, root, activeSessionId: sessionId }
      })
      return {
        tabs,
        sessions: { ...st.sessions, [sessionId]: session },
        activeSessionId: sessionId,
      }
    })
    void get().persist()
  },

  updatePaneSizes: (paneId, sizes) => {
    set((st) => ({
      tabs: st.tabs.map((t) => ({
        ...t,
        root: mapPane(t.root, (n) => (n.id === paneId && n.type === 'split' ? { ...n, sizes } : n)),
      })),
    }))
    // No persist on every drag — too chatty. Persist on close/blur.
  },

  setSharedContext: (text) => {
    set({ sharedContext: text })
    void get().persist()
  },

  appendSharedContext: (text) => {
    set((st) => ({ sharedContext: st.sharedContext ? `${st.sharedContext}\n\n${text}` : text }))
    void get().persist()
  },

  toggleCommandPalette: (open) =>
    set((st) => ({ commandPaletteOpen: open ?? !st.commandPaletteOpen })),
  toggleSessionBrowser: (open) =>
    set((st) => ({ sessionBrowserOpen: open ?? !st.sessionBrowserOpen })),
  toggleSharedContext: (open) =>
    set((st) => ({ sharedContextOpen: open ?? !st.sharedContextOpen })),
  toggleZoom: (paneId) =>
    set((st) => {
      if (paneId === null) return { zoomedPaneId: null }
      if (paneId === undefined) return { zoomedPaneId: st.zoomedPaneId ? null : null }
      return { zoomedPaneId: st.zoomedPaneId === paneId ? null : paneId }
    }),

  loadAgents: async (cwd) => {
    const normalized = cwd && cwd.length > 0 ? cwd : null
    set({ agentsLoading: true, agentsCwd: normalized })
    try {
      const agents = await aterm.claude.listAgents(normalized ?? undefined)
      set({ agents, agentsLoading: false })
    } catch {
      set({ agentsLoading: false })
    }
  },

  attachAgent: (agent) => {
    const state = get()
    const claude = state.tools.find((t) => t.id === 'claude')
    if (!claude) return
    const cwd = agent.source === 'project' && agent.projectPath ? agent.projectPath : state.cwdDefault
    state.newSession({
      tool: { ...claude, args: ['--agent', agent.name] },
      cwd,
    })
  },

  toggleAgentEditor: (open) =>
    set((st) => ({ agentEditorOpen: open ?? !st.agentEditorOpen })),

  toggleSidebar: (open) => {
    set((st) => ({ sidebarCollapsed: open !== undefined ? !open : !st.sidebarCollapsed }))
    void get().persist()
  },

  createAgent: async (input) => {
    const result = await aterm.claude.createAgent(input)
    if (result.ok) {
      await get().loadAgents(get().agentsCwd)
    }
    return result
  },
}))

function getPaneIdForSession(node: PaneNode, sessionId: string): string | null {
  if (node.type === 'leaf') return node.sessionId === sessionId ? node.id : null
  for (const c of node.children) {
    const id = getPaneIdForSession(c, sessionId)
    if (id) return id
  }
  return null
}

function firstLeafSession(node: PaneNode): string | null {
  if (node.type === 'leaf') return node.sessionId || null
  for (const c of node.children) {
    const id = firstLeafSession(c)
    if (id) return id
  }
  return null
}

function currentCwd(state: { sessions: Record<string, SessionMeta>; activeSessionId: string | null }): string | null {
  if (!state.activeSessionId) return null
  return state.sessions[state.activeSessionId]?.cwd ?? null
}

