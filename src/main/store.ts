import { app } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import type { PersistedWorkspace } from '../shared/ipc'

const FILE = () => path.join(app.getPath('userData'), 'workspace.json')

const EMPTY: PersistedWorkspace = {
  tabs: [],
  activeTabId: null,
  sessions: [],
  sharedContext: '',
  sidebarCollapsed: false,
}

export async function loadWorkspace(): Promise<PersistedWorkspace> {
  try {
    const raw = await fs.readFile(FILE(), 'utf8')
    const parsed = JSON.parse(raw) as PersistedWorkspace
    return { ...EMPTY, ...parsed }
  } catch {
    return EMPTY
  }
}

export async function saveWorkspace(data: PersistedWorkspace): Promise<void> {
  const file = FILE()
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8')
}
