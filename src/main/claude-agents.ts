import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { ClaudeAgent, NewAgentInput, CreateAgentResult } from '../shared/ipc'

function parseFrontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith('---')) return {}
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return {}
  const block = raw.slice(3, end).trim()
  const fm: Record<string, string> = {}
  let key: string | null = null
  let value = ''
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/)
    if (m) {
      if (key) fm[key] = value.trim()
      key = m[1]
      value = m[2]
    } else if (key) {
      value += ' ' + line.trim()
    }
  }
  if (key) fm[key] = value.trim()
  return fm
}

function parseTools(raw: string | undefined): string[] | null {
  if (!raw) return null
  const v = raw.trim()
  if (v === '*' || v === '') return null
  const inner = v.replace(/^\[|\]$/g, '')
  const items = inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
  return items.length > 0 ? items : null
}

async function readAgentDir(
  dir: string,
  source: ClaudeAgent['source'],
  projectPath?: string,
): Promise<ClaudeAgent[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  const out: ClaudeAgent[] = []
  for (const f of entries) {
    if (!f.endsWith('.md')) continue
    const filePath = path.join(dir, f)
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      continue
    }
    const fm = parseFrontmatter(raw)
    const name = (fm.name || path.basename(f, '.md')).trim()
    const description = (fm.description || '').trim()
    const tools = parseTools(fm.tools)
    const model = (fm.model || '').trim() || undefined
    out.push({
      id: filePath,
      name,
      description,
      tools,
      model,
      source,
      projectPath,
      filePath,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function listClaudeAgents(projectCwd?: string): Promise<ClaudeAgent[]> {
  const userDir = path.join(os.homedir(), '.claude', 'agents')
  const userAgents = await readAgentDir(userDir, 'user')
  if (!projectCwd) return userAgents
  const projectDir = path.join(projectCwd, '.claude', 'agents')
  if (path.resolve(projectDir) === path.resolve(userDir)) return userAgents
  const projectAgents = await readAgentDir(projectDir, 'project', projectCwd)
  return [...projectAgents, ...userAgents]
}

export function userAgentsDir(): string {
  return path.join(os.homedir(), '.claude', 'agents')
}

function normalizeAgentName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function yamlScalar(s: string): string {
  if (s.length === 0) return '""'
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(s)) return s
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export async function createAgent(input: NewAgentInput): Promise<CreateAgentResult> {
  const name = normalizeAgentName(input.name)
  if (!name) return { ok: false, error: 'Name is required (letters, numbers, hyphens).' }
  const description = input.description.trim()
  if (!description) return { ok: false, error: 'Description is required.' }
  const prompt = input.prompt.trim()
  if (!prompt) return { ok: false, error: 'System prompt is required.' }

  let dir: string
  if (input.scope === 'project') {
    if (!input.projectPath) return { ok: false, error: 'No active project to scope to.' }
    dir = path.join(input.projectPath, '.claude', 'agents')
  } else {
    dir = path.join(os.homedir(), '.claude', 'agents')
  }

  const filePath = path.join(dir, `${name}.md`)
  try {
    await fs.access(filePath)
    return { ok: false, error: `An agent named "${name}" already exists at ${filePath}.` }
  } catch {
    // file does not exist — good
  }

  await fs.mkdir(dir, { recursive: true })

  const fmLines: string[] = []
  fmLines.push(`name: ${name}`)
  fmLines.push(`description: ${yamlScalar(description)}`)
  if (input.tools && input.tools.length > 0) {
    fmLines.push(`tools: [${input.tools.map((t) => yamlScalar(t.trim())).filter(Boolean).join(', ')}]`)
  }
  if (input.model && input.model.trim()) {
    fmLines.push(`model: ${yamlScalar(input.model.trim())}`)
  }

  const content = `---\n${fmLines.join('\n')}\n---\n\n${prompt}\n`
  await fs.writeFile(filePath, content, 'utf8')
  return { ok: true, filePath, name }
}
