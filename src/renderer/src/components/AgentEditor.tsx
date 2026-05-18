import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'

type Template = {
  id: string
  label: string
  description: string
  tools: string
  prompt: string
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: '',
    tools: '',
    prompt: '',
  },
  {
    id: 'reviewer',
    label: 'Code reviewer',
    description: 'Reviews code changes for bugs, style, and clarity.',
    tools: 'Read, Grep, Bash',
    prompt:
`You are a meticulous code reviewer.

When given a diff, file, or snippet:
1. Find bugs, edge cases, and correctness issues first.
2. Note style or readability problems second.
3. Suggest concrete fixes with line references.
4. Briefly acknowledge anything done well — but don't pad.

Be direct. Avoid hedging language.`,
  },
  {
    id: 'debugger',
    label: 'Debugger',
    description: 'Traces errors to root cause and proposes a fix.',
    tools: 'Read, Grep, Bash, Edit',
    prompt:
`You investigate failures and find root causes.

When given an error or failing test:
1. Read the error and stack trace carefully.
2. Locate the failing code; trace callers.
3. Form a hypothesis about *why*, not just where.
4. Verify by reading related code or running diagnostics.
5. Propose a minimal fix.

Prefer understanding to patching symptoms.`,
  },
  {
    id: 'docs',
    label: 'Docs writer',
    description: 'Writes clear, concise technical documentation.',
    tools: 'Read, Write, Edit',
    prompt:
`You write technical documentation that respects the reader's time.

Rules:
- State what the thing does in one line before anything else.
- Show a minimal example before exhaustive options.
- Call out non-obvious behavior or constraints.
- No marketing language. No filler.
- Cross-reference related docs/code by path.`,
  },
  {
    id: 'planner',
    label: 'Planner',
    description: 'Breaks features into small, ordered implementation steps.',
    tools: 'Read, Grep',
    prompt:
`You convert a feature request into a tight implementation plan.

For each plan:
1. Restate the goal in one sentence.
2. Identify files and modules involved.
3. List ordered steps. Each step is small and independently verifiable.
4. Flag risky steps and propose how to mitigate.
5. Stop. Do not write code.`,
  },
]

export function AgentEditor() {
  const open = useStore((s) => s.agentEditorOpen)
  const close = () => useStore.getState().toggleAgentEditor(false)
  const createAgent = useStore((s) => s.createAgent)
  const claude = useStore((s) => s.tools.find((t) => t.id === 'claude'))
  const attachAgent = useStore((s) => s.attachAgent)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessions = useStore((s) => s.sessions)
  const projectCwd = activeSessionId ? sessions[activeSessionId]?.cwd ?? null : null

  const [templateId, setTemplateId] = useState('blank')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tools, setTools] = useState('')
  const [model, setModel] = useState('')
  const [scope, setScope] = useState<'user' | 'project'>('user')
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ name: string; filePath: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setTemplateId('blank')
    setName('')
    setDescription('')
    setTools('')
    setModel('')
    setPrompt('')
    setScope('user')
    setError(null)
    setSuccess(null)
  }, [open])

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const t = TEMPLATES.find((x) => x.id === id)
    if (!t) return
    if (!description) setDescription(t.description)
    if (!tools) setTools(t.tools)
    if (!prompt || prompt.length < 5) setPrompt(t.prompt)
  }

  const previewName = useMemo(
    () =>
      name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]+/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, ''),
    [name],
  )

  const previewPath = useMemo(() => {
    if (!previewName) return ''
    if (scope === 'project' && projectCwd) {
      return `${projectCwd.replace(/^\/Users\/[^/]+/, '~')}/.claude/agents/${previewName}.md`
    }
    return `~/.claude/agents/${previewName}.md`
  }, [scope, projectCwd, previewName])

  const submit = async (launchAfter: boolean) => {
    setError(null)
    setSubmitting(true)
    const parsedTools = tools
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const result = await createAgent({
      name,
      description,
      tools: parsedTools.length > 0 ? parsedTools : undefined,
      model: model || undefined,
      prompt,
      scope,
      projectPath: scope === 'project' ? projectCwd ?? undefined : undefined,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'Failed to create agent.')
      return
    }
    setSuccess({ name: result.name ?? previewName, filePath: result.filePath ?? '' })
    if (launchAfter && claude?.installed) {
      const agentName = result.name ?? previewName
      const cwd = scope === 'project' && projectCwd ? projectCwd : useStore.getState().cwdDefault
      attachAgent({
        id: result.filePath ?? agentName,
        name: agentName,
        description,
        tools: parsedTools.length > 0 ? parsedTools : null,
        model: model || undefined,
        source: scope,
        projectPath: scope === 'project' ? projectCwd ?? undefined : undefined,
        filePath: result.filePath ?? '',
      })
      close()
    }
  }

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit(true)
    }
  }

  return (
    <div className="palette-overlay" onMouseDown={close}>
      <div
        className="agent-editor"
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="agent-editor__header">
          <span className="agent-editor__title">New Claude Agent</span>
          <button className="agent-editor__close" onClick={close} title="Close (Esc)">✕</button>
        </div>

        {success ? (
          <div className="agent-editor__body">
            <div className="agent-editor__success">
              <div className="agent-editor__success-title">✓ Created <code>{success.name}</code></div>
              <div className="agent-editor__success-path">{success.filePath}</div>
              <div className="agent-editor__success-actions">
                <button className="agent-editor__primary" onClick={close}>Done</button>
                <button
                  className="agent-editor__secondary"
                  disabled={!claude?.installed}
                  onClick={() => {
                    const parsedTools = tools.split(',').map((t) => t.trim()).filter(Boolean)
                    attachAgent({
                      id: success.filePath,
                      name: success.name,
                      description,
                      tools: parsedTools.length > 0 ? parsedTools : null,
                      model: model || undefined,
                      source: scope,
                      projectPath: scope === 'project' ? projectCwd ?? undefined : undefined,
                      filePath: success.filePath,
                    })
                    close()
                  }}
                >Launch claude --agent {success.name}</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="agent-editor__body">
            <div className="agent-editor__row">
              <label className="agent-editor__label">Template</label>
              <div className="agent-editor__templates">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    className={`agent-editor__chip ${templateId === t.id ? 'is-active' : ''}`}
                    onClick={() => applyTemplate(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="agent-editor__row agent-editor__row--two">
              <div>
                <label className="agent-editor__label">Name</label>
                <input
                  className="agent-editor__input"
                  placeholder="code-reviewer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                {previewName && previewName !== name && (
                  <div className="agent-editor__hint">Will be saved as <code>{previewName}</code></div>
                )}
              </div>
              <div>
                <label className="agent-editor__label">Scope</label>
                <div className="agent-editor__scope">
                  <button
                    className={`agent-editor__chip ${scope === 'user' ? 'is-active' : ''}`}
                    onClick={() => setScope('user')}
                  >User (~/.claude)</button>
                  <button
                    className={`agent-editor__chip ${scope === 'project' ? 'is-active' : ''} ${!projectCwd ? 'is-disabled' : ''}`}
                    onClick={() => projectCwd && setScope('project')}
                    title={projectCwd ?? 'Open a session in a project to enable'}
                    disabled={!projectCwd}
                  >Project</button>
                </div>
              </div>
            </div>

            <div className="agent-editor__row">
              <label className="agent-editor__label">Description</label>
              <input
                className="agent-editor__input"
                placeholder="One-line summary shown in the agent picker"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="agent-editor__row agent-editor__row--two">
              <div>
                <label className="agent-editor__label">Tools <span className="agent-editor__optional">(optional)</span></label>
                <input
                  className="agent-editor__input"
                  placeholder="Read, Edit, Bash"
                  value={tools}
                  onChange={(e) => setTools(e.target.value)}
                />
                <div className="agent-editor__hint">Comma-separated. Empty = all tools.</div>
              </div>
              <div>
                <label className="agent-editor__label">Model <span className="agent-editor__optional">(optional)</span></label>
                <select
                  className="agent-editor__input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">(inherit)</option>
                  <option value="sonnet">sonnet</option>
                  <option value="opus">opus</option>
                  <option value="haiku">haiku</option>
                </select>
              </div>
            </div>

            <div className="agent-editor__row">
              <label className="agent-editor__label">System prompt</label>
              <textarea
                className="agent-editor__textarea"
                placeholder="You are a specialized assistant for…"
                rows={12}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className="agent-editor__hint">
                Defines the agent's behavior. ⌘↵ to create.
              </div>
            </div>

            {previewPath && (
              <div className="agent-editor__path">
                <span>→</span>
                <code>{previewPath}</code>
              </div>
            )}

            {error && <div className="agent-editor__error">{error}</div>}

            <div className="agent-editor__footer">
              <button className="agent-editor__cancel" onClick={close} disabled={submitting}>Cancel</button>
              <button
                className="agent-editor__secondary"
                onClick={() => void submit(false)}
                disabled={submitting}
              >
                Create
              </button>
              <button
                className="agent-editor__primary"
                onClick={() => void submit(true)}
                disabled={submitting || !claude?.installed}
                title={!claude?.installed ? '`claude` not installed' : 'Create and launch'}
              >
                Create & Launch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
