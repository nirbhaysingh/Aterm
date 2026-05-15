import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AITool,
  ClaudeAgentsResult,
  ClaudeSessionMeta,
  PersistedWorkspace,
} from '../shared/ipc'

type PtyDataListener = (payload: { sessionId: string; data: string }) => void
type PtyExitListener = (payload: { sessionId: string; exitCode: number }) => void

const api = {
  tools: {
    list: (): Promise<AITool[]> => ipcRenderer.invoke(IPC.toolsList),
    rescan: (): Promise<AITool[]> => ipcRenderer.invoke(IPC.toolsRescan),
  },
  claude: {
    listSessions: (): Promise<ClaudeSessionMeta[]> => ipcRenderer.invoke(IPC.claudeSessionsList),
    readSession: (filePath: string): Promise<string> => ipcRenderer.invoke(IPC.claudeSessionRead, filePath),
    search: (query: string) => ipcRenderer.invoke(IPC.claudeSessionSearch, query),
    listAgents: (): Promise<ClaudeAgentsResult> => ipcRenderer.invoke(IPC.claudeAgentsList),
  },
  pty: {
    spawn: (args: { sessionId: string; command: string; args: string[]; cwd: string; cols: number; rows: number }) =>
      ipcRenderer.invoke(IPC.ptySpawn, args),
    write: (sessionId: string, data: string) => ipcRenderer.send(IPC.ptyWrite, { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.ptyResize, { sessionId, cols, rows }),
    kill: (sessionId: string): Promise<void> => ipcRenderer.invoke(IPC.ptyKill, sessionId),
    serialize: (sessionId: string): Promise<string> => ipcRenderer.invoke(IPC.ptySerialize, sessionId),
    onData: (cb: PtyDataListener) => {
      const handler = (_e: unknown, payload: { sessionId: string; data: string }) => cb(payload)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
    onExit: (cb: PtyExitListener) => {
      const handler = (_e: unknown, payload: { sessionId: string; exitCode: number }) => cb(payload)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    },
  },
  workspace: {
    load: (): Promise<PersistedWorkspace> => ipcRenderer.invoke(IPC.workspaceLoad),
    save: (data: PersistedWorkspace): Promise<void> => ipcRenderer.invoke(IPC.workspaceSave, data),
  },
  dialog: {
    openDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogOpenDir),
  },
  shell: {
    home: (): Promise<string> => ipcRenderer.invoke(IPC.shellHome),
    env: (): Promise<{ home: string; platform: string; shell: string | null }> => ipcRenderer.invoke(IPC.shellEnv),
  },
}

contextBridge.exposeInMainWorld('aterm', api)

export type AtermAPI = typeof api
