import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { PtyManager } from './pty'
import { listAITools } from './tools'
import { listClaudeSessions, readClaudeSession, searchClaudeSessions } from './claude-sessions'
import { listClaudeAgents, userAgentsDir, createAgent } from './claude-agents'
import { loadWorkspace, saveWorkspace } from './store'
import { loadUserShellEnv } from './fix-path'
import { IPC, type PersistedWorkspace, type NewAgentInput } from '../shared/ipc'

loadUserShellEnv()

const isDev = !app.isPackaged
const pty = new PtyManager()
let mainWin: BrowserWindow | null = null

function createWindow(): void {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'ATERM',
    backgroundColor: '#0e1116',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devUrl) {
    mainWin.loadURL(devUrl)
  } else {
    mainWin.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.toolsList, () => listAITools())
  ipcMain.handle(IPC.toolsRescan, () => listAITools())

  ipcMain.handle(IPC.claudeSessionsList, () => listClaudeSessions())
  ipcMain.handle(IPC.claudeSessionRead, (_e, filePath: string) => readClaudeSession(filePath))
  ipcMain.handle(IPC.claudeSessionSearch, (_e, query: string) => searchClaudeSessions(query))

  ipcMain.handle(IPC.claudeAgentsList, (_e, projectCwd?: string) => listClaudeAgents(projectCwd))
  ipcMain.handle(IPC.claudeAgentOpen, async (_e, filePath: string) => {
    const err = await shell.openPath(filePath)
    return err.length === 0
  })
  ipcMain.handle(IPC.claudeAgentsDirOpen, async () => {
    const dir = userAgentsDir()
    try {
      await fs.mkdir(dir, { recursive: true })
    } catch {
      // ignore
    }
    await shell.openPath(dir)
  })
  ipcMain.handle(IPC.claudeAgentCreate, (_e, input: NewAgentInput) => createAgent(input))

  ipcMain.handle(
    IPC.ptySpawn,
    (
      _e,
      args: { sessionId: string; command: string; args: string[]; cwd: string; cols: number; rows: number },
    ) => {
      if (!mainWin) return
      pty.spawn(args, mainWin)
    },
  )
  ipcMain.on(IPC.ptyWrite, (_e, args: { sessionId: string; data: string }) => {
    pty.write(args.sessionId, args.data)
  })
  ipcMain.on(IPC.ptyResize, (_e, args: { sessionId: string; cols: number; rows: number }) => {
    pty.resize(args.sessionId, args.cols, args.rows)
  })
  ipcMain.handle(IPC.ptyKill, (_e, sessionId: string) => pty.kill(sessionId))
  ipcMain.handle(IPC.ptySerialize, (_e, sessionId: string) => pty.serialize(sessionId))

  ipcMain.handle(IPC.workspaceLoad, () => loadWorkspace())
  ipcMain.handle(IPC.workspaceSave, (_e, data: PersistedWorkspace) => saveWorkspace(data))

  ipcMain.handle(IPC.dialogOpenDir, async () => {
    if (!mainWin) return null
    const res = await dialog.showOpenDialog(mainWin, { properties: ['openDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  ipcMain.handle(IPC.shellHome, () => os.homedir())
  ipcMain.handle(IPC.shellEnv, () => ({ home: os.homedir(), platform: process.platform, shell: process.env.SHELL ?? null }))
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  pty.killAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  pty.killAll()
})
