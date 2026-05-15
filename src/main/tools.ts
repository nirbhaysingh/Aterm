import { resolveBinary } from './pty'
import type { AITool } from '../shared/ipc'

type ToolDef = Omit<AITool, 'installed' | 'binPath'>

const KNOWN_TOOLS: ToolDef[] = [
  { id: 'claude', name: 'Claude Code', command: 'claude', args: [], icon: '◆', description: "Anthropic's coding agent" },
  { id: 'codex', name: 'Codex CLI', command: 'codex', args: [], icon: '▲', description: "OpenAI's coding agent" },
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: [], icon: '◇', description: "Google's Gemini CLI" },
  { id: 'aider', name: 'Aider', command: 'aider', args: [], icon: '●', description: 'AI pair programmer' },
  { id: 'cursor-agent', name: 'Cursor Agent', command: 'cursor-agent', args: [], icon: '▶', description: "Cursor's headless agent" },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: [], icon: '○', description: 'Open-source coding agent' },
  { id: 'ollama', name: 'Ollama', command: 'ollama', args: ['run', 'llama3'], icon: '◉', description: 'Local LLM runner' },
  { id: 'llm', name: 'llm', command: 'llm', args: ['chat'], icon: '◆', description: "Simon Willison's llm CLI" },
  { id: 'shell', name: 'Shell', command: '', args: [], icon: '$', description: 'Plain interactive shell' },
]

export function listAITools(): AITool[] {
  return KNOWN_TOOLS.map((t) => {
    if (t.id === 'shell') return { ...t, installed: true }
    const binPath = resolveBinary(t.command)
    return { ...t, installed: !!binPath, binPath: binPath ?? undefined }
  })
}
