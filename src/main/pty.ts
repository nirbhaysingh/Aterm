import { spawn, IPty } from 'node-pty'
import { BrowserWindow } from 'electron'
import os from 'os'
import path from 'path'

type SpawnOptions = {
  sessionId: string
  command: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  env?: Record<string, string>
}

function quoteForShell(s: string): string {
  if (s.length === 0) return "''"
  if (/^[A-Za-z0-9_\-./@:=+,%]+$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

type Session = {
  pty: IPty
  buffer: string[]
  bufferBytes: number
}

const MAX_BUFFER_BYTES = 1_000_000

export class PtyManager {
  private sessions = new Map<string, Session>()

  spawn(opts: SpawnOptions, win: BrowserWindow): void {
    if (this.sessions.has(opts.sessionId)) return

    const platform = os.platform()
    const userShell = process.env.SHELL || (platform === 'win32' ? 'powershell.exe' : '/bin/zsh')

    let shellCmd: string
    let shellArgs: string[]

    if (!opts.command || opts.command.length === 0) {
      shellCmd = userShell
      shellArgs = platform === 'win32' ? [] : ['-il']
    } else if (platform === 'win32') {
      shellCmd = opts.command
      shellArgs = opts.args
    } else {
      // Wrap AI tools in the user's login+interactive shell so they inherit
      // the same PATH, env vars, and credential paths as Terminal.app.
      // `exec` replaces the shell so the AI tool becomes the foreground process.
      const cmdLine = [opts.command, ...opts.args].map(quoteForShell).join(' ')
      shellCmd = userShell
      shellArgs = ['-ilc', `exec ${cmdLine}`]
    }

    const env: Record<string, string> = {
      ...process.env,
      ...(opts.env ?? {}),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: process.env.LANG || 'en_US.UTF-8',
    } as Record<string, string>

    const cwd = opts.cwd && opts.cwd.length > 0 ? opts.cwd : os.homedir()

    const pty = spawn(shellCmd, shellArgs, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd,
      env,
    })

    const session: Session = { pty, buffer: [], bufferBytes: 0 }
    this.sessions.set(opts.sessionId, session)

    pty.onData((data) => {
      session.buffer.push(data)
      session.bufferBytes += data.length
      while (session.bufferBytes > MAX_BUFFER_BYTES && session.buffer.length > 1) {
        const dropped = session.buffer.shift()!
        session.bufferBytes -= dropped.length
      }
      if (!win.isDestroyed()) {
        win.webContents.send('pty:data', { sessionId: opts.sessionId, data })
      }
    })

    pty.onExit(({ exitCode }) => {
      if (!win.isDestroyed()) {
        win.webContents.send('pty:exit', { sessionId: opts.sessionId, exitCode })
      }
      this.sessions.delete(opts.sessionId)
    })
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.pty.resize(cols, rows)
    } catch {
      // ignore — pty may have already exited
    }
  }

  kill(sessionId: string): void {
    const s = this.sessions.get(sessionId)
    if (!s) return
    try {
      s.pty.kill()
    } catch {
      // pty already dead
    }
    this.sessions.delete(sessionId)
  }

  serialize(sessionId: string): string {
    return this.sessions.get(sessionId)?.buffer.join('') ?? ''
  }

  killAll(): void {
    for (const id of Array.from(this.sessions.keys())) this.kill(id)
  }
}

export function defaultShell(): { command: string; args: string[] } {
  if (os.platform() === 'win32') {
    return { command: 'powershell.exe', args: [] }
  }
  const shell = process.env.SHELL || '/bin/zsh'
  return { command: shell, args: ['-l'] }
}

export function resolveBinary(name: string): string | null {
  const paths = (process.env.PATH || '').split(path.delimiter)
  const exts = os.platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : ['']
  const fs = require('fs') as typeof import('fs')
  for (const dir of paths) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext)
      try {
        if (fs.existsSync(candidate)) return candidate
      } catch {
        // continue
      }
    }
  }
  return null
}
