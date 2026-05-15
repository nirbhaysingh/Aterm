import { spawnSync } from 'child_process'
import os from 'os'

export function loadUserShellEnv(): void {
  if (os.platform() === 'win32') return
  const shell = process.env.SHELL || '/bin/zsh'
  try {
    const res = spawnSync(shell, ['-ilc', 'echo "__ATERM_ENV__$PATH"'], {
      encoding: 'utf8',
      timeout: 2000,
    })
    const out = res.stdout ?? ''
    const m = out.match(/__ATERM_ENV__(.*)/)
    if (m && m[1]) {
      const userPath = m[1].trim()
      if (userPath.length > 0) {
        process.env.PATH = userPath
      }
    }
  } catch {
    // fall back to whatever PATH Electron inherited
  }
}
