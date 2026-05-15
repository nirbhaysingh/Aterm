import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { ClaudeSessionMeta } from '../shared/ipc'

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')

function decodeProjectDir(name: string): string {
  // Claude Code encodes project paths by replacing path separators with hyphens.
  return name.startsWith('-') ? name.replace(/-/g, '/').replace(/^\//, '/') : name
}

function projectDisplayName(decodedPath: string): string {
  return path.basename(decodedPath) || decodedPath
}

async function listSessionFiles(): Promise<{ projectDir: string; file: string }[]> {
  let entries: string[] = []
  try {
    entries = await fs.readdir(CLAUDE_PROJECTS_DIR)
  } catch {
    return []
  }
  const out: { projectDir: string; file: string }[] = []
  for (const e of entries) {
    const projectDir = path.join(CLAUDE_PROJECTS_DIR, e)
    let stat: import('fs').Stats
    try {
      stat = await fs.stat(projectDir)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue
    let files: string[]
    try {
      files = await fs.readdir(projectDir)
    } catch {
      continue
    }
    for (const f of files) {
      if (f.endsWith('.jsonl')) out.push({ projectDir, file: path.join(projectDir, f) })
    }
  }
  return out
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && 'text' in (c as Record<string, unknown>)) {
          return String((c as { text: unknown }).text)
        }
        return ''
      })
      .join(' ')
  }
  if (content && typeof content === 'object' && 'text' in (content as Record<string, unknown>)) {
    return String((content as { text: unknown }).text)
  }
  return ''
}

async function summarizeSessionFile(filePath: string): Promise<ClaudeSessionMeta | null> {
  let raw: string
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    return null
  }
  const lines = raw.split('\n').filter(Boolean)
  if (lines.length === 0) return null

  let firstUserMessage = ''
  let lastMessage = ''
  let messageCount = 0
  let sessionId = path.basename(filePath, '.jsonl')
  let projectPath = ''
  let createdAt = 0

  for (const line of lines) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (obj.sessionId && typeof obj.sessionId === 'string') sessionId = obj.sessionId
    if (obj.cwd && typeof obj.cwd === 'string' && !projectPath) projectPath = obj.cwd
    const ts = obj.timestamp
    if (typeof ts === 'string') {
      const t = Date.parse(ts)
      if (!Number.isNaN(t) && (createdAt === 0 || t < createdAt)) createdAt = t
    }

    if (obj.type === 'user' || obj.type === 'assistant') {
      const message = obj.message as Record<string, unknown> | undefined
      const text = extractText(message?.content).trim()
      if (text) {
        if (!firstUserMessage && obj.type === 'user') firstUserMessage = text
        lastMessage = text
        messageCount++
      }
    }
  }

  const stat = await fs.stat(filePath)
  if (!projectPath) {
    projectPath = decodeProjectDir(path.basename(path.dirname(filePath)))
  }

  return {
    id: sessionId,
    projectPath,
    projectName: projectDisplayName(projectPath),
    filePath,
    firstMessage: firstUserMessage.slice(0, 240),
    lastMessage: lastMessage.slice(0, 240),
    messageCount,
    modifiedAt: stat.mtimeMs,
    createdAt: createdAt || stat.birthtimeMs,
  }
}

export async function listClaudeSessions(): Promise<ClaudeSessionMeta[]> {
  const files = await listSessionFiles()
  const results = await Promise.all(files.map((f) => summarizeSessionFile(f.file)))
  return results
    .filter((s): s is ClaudeSessionMeta => s !== null)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export async function readClaudeSession(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

export type ClaudeSearchHit = {
  session: ClaudeSessionMeta
  excerpt: string
  matchedAt: number
}

export async function searchClaudeSessions(query: string, limit = 50): Promise<ClaudeSearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const sessions = await listClaudeSessions()
  const hits: ClaudeSearchHit[] = []

  for (const session of sessions) {
    if (hits.length >= limit) break
    let raw: string
    try {
      raw = await fs.readFile(session.filePath, 'utf8')
    } catch {
      continue
    }
    const lines = raw.split('\n')
    for (const line of lines) {
      if (!line) continue
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(line) as Record<string, unknown>
      } catch {
        continue
      }
      const message = obj.message as Record<string, unknown> | undefined
      const text = extractText(message?.content)
      const lower = text.toLowerCase()
      const idx = lower.indexOf(q)
      if (idx >= 0) {
        const start = Math.max(0, idx - 60)
        const end = Math.min(text.length, idx + q.length + 60)
        const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : session.modifiedAt
        hits.push({
          session,
          excerpt: (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''),
          matchedAt: Number.isNaN(ts) ? session.modifiedAt : ts,
        })
        break
      }
    }
  }

  return hits
}
