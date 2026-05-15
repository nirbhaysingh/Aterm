import { spawn } from 'child_process'
import type { ClaudeAgent, ClaudeAgentsResult } from '../shared/ipc'

const CMD_TIMEOUT_MS = 4000

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').replace(/\r/g, '')
}

function looksLikeHeader(line: string): boolean {
  const t = line.trim()
  if (!t) return true
  if (/^[-=_\s]+$/.test(t)) return true
  return /^\s*(ID|NAME|STATUS|TYPE|CREATED|UPDATED|AGENT|SESSION|PID)\b/.test(t)
}

function parseAgents(raw: string): ClaudeAgent[] {
  const clean = stripAnsi(raw)
  const lines = clean
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .filter((l) => l.length > 0)
  const out: ClaudeAgent[] = []
  for (const line of lines) {
    if (looksLikeHeader(line)) continue
    const stripped = line.replace(/^[\s│|*▶➜•◆◇▷·\-]+/, '').trimEnd()
    if (!stripped) continue
    const tokens = stripped.split(/\s{2,}|\t+|\s+/)
    const id = (tokens[0] || stripped).trim()
    const rest = stripped.slice(id.length).trim()
    out.push({
      id,
      display: stripped,
      detail: rest || undefined,
    })
  }
  return out
}

export async function listClaudeAgents(): Promise<ClaudeAgentsResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const proc = spawn('claude', ['agents'], {
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        TERM: 'dumb',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const finish = (error?: string) => {
      if (settled) return
      settled = true
      const agents = parseAgents(stdout)
      resolve({ agents, raw: stripAnsi(stdout), error: error || stripAnsi(stderr).trim() || undefined })
    }

    const timer = setTimeout(() => {
      try {
        proc.kill()
      } catch {
        // ignore
      }
      finish('timeout — `claude agents` did not exit. Output captured may be partial.')
    }, CMD_TIMEOUT_MS)

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8')
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8')
    })
    proc.on('close', () => {
      clearTimeout(timer)
      finish()
    })
    proc.on('error', (e) => {
      clearTimeout(timer)
      finish(e.message)
    })
  })
}
