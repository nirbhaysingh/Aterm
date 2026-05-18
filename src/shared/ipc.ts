export type AITool = {
  id: string
  name: string
  command: string
  args: string[]
  binPath?: string
  installed: boolean
  icon?: string
  description?: string
}

export type ClaudeAgent = {
  id: string
  name: string
  description: string
  tools: string[] | null
  model?: string
  source: 'user' | 'project'
  projectPath?: string
  filePath: string
}

export type NewAgentInput = {
  name: string
  description: string
  tools?: string[]
  model?: string
  prompt: string
  scope: 'user' | 'project'
  projectPath?: string
}

export type CreateAgentResult = {
  ok: boolean
  filePath?: string
  name?: string
  error?: string
}

export type ClaudeSessionMeta = {
  id: string
  projectPath: string
  projectName: string
  filePath: string
  firstMessage: string
  lastMessage: string
  messageCount: number
  modifiedAt: number
  createdAt: number
}

export type PaneNode =
  | { id: string; type: 'leaf'; sessionId: string }
  | { id: string; type: 'split'; direction: 'horizontal' | 'vertical'; sizes: number[]; children: PaneNode[] }

export type SessionMeta = {
  id: string
  title: string
  toolId: string | null
  cwd: string
  command: string
  args: string[]
  createdAt: number
}

export type WorkspaceTab = {
  id: string
  title: string
  root: PaneNode
  activeSessionId: string | null
}

export type PersistedWorkspace = {
  tabs: WorkspaceTab[]
  activeTabId: string | null
  sessions: SessionMeta[]
  sharedContext: string
  sidebarCollapsed?: boolean
}

export type IpcEvents = {
  'pty:data': { sessionId: string; data: string }
  'pty:exit': { sessionId: string; exitCode: number }
}

export const IPC = {
  toolsList: 'tools:list',
  toolsRescan: 'tools:rescan',
  claudeSessionsList: 'claude:sessions:list',
  claudeSessionRead: 'claude:session:read',
  claudeSessionSearch: 'claude:session:search',
  claudeAgentsList: 'claude:agents:list',
  claudeAgentOpen: 'claude:agent:open',
  claudeAgentsDirOpen: 'claude:agents:dir:open',
  claudeAgentCreate: 'claude:agent:create',
  ptySpawn: 'pty:spawn',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptySerialize: 'pty:serialize',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  dialogOpenDir: 'dialog:openDir',
  shellHome: 'shell:home',
  shellEnv: 'shell:env',
} as const
