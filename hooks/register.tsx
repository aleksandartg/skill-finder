import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PANE = 'skill-finder'
const DEFAULT_CATALOG = '~/.claude/SKILLS.md'
const MAX_SHOWN = 60

const query = atom({ plugin: 'skill-finder', key: 'query' } as const, '', { shape: 'query-1' })
const project = atom({ plugin: 'skill-finder', key: 'project' } as const, 'All', { shape: 'project-1' })

type Skill = {
  name: string // what you type after the slash
  category: string
  desc: string
  useful: string
  projects: string[]
  loaded: boolean
}

type Row = Omit<Skill, 'loaded' | 'projects'>
type Catalog = { rows: Row[]; picks: Map<string, Set<string>>; projects: string[] }
type Loaded = { at: number; skills: Skill[]; projects: string[]; catalogPath: string; hasCatalog: boolean }

let cache: Loaded | undefined

const cells = (line: string) => line.split('|').slice(1, -1).map(c => c.trim())
const ticks = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map(m => (m[1] ?? '').replace(/^\//, ''))
const strip = (text: string) => text.replace(/`/g, '').replace(/\*\*/g, '').trim()
const short = (name: string) => name.split(':').pop() ?? name
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Reads a skills catalog written as Markdown tables:
 * - `## <Category>` headings (an optional `1.` number is dropped);
 * - tables whose first column holds `skill-name` in backticks, with optional
 *   `What it does` and `Useful in` columns;
 * - one table headed `Project | ...` whose rows tag skills with a project.
 */
function parseCatalog(md: string): Catalog {
  const rows: Row[] = []
  const picks = new Map<string, Set<string>>()
  const projects: string[] = []
  let category = 'Skills'
  let header: string[] = []
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const h = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/)
    if (h) { category = (h[1] ?? '').trim(); header = []; continue }
    if (!line.startsWith('|')) { header = []; continue }
    if (/^\|\s*:?-/.test(line)) continue
    if (header.length === 0 && /^\|\s*:?-/.test(lines[i + 1] ?? '')) { header = cells(line); continue }
    const row = cells(line)
    const col = (title: string) => {
      const at = header.findIndex(x => x.toLowerCase() === title.toLowerCase())
      return at >= 0 ? row[at] ?? '' : ''
    }
    if ((header[0] ?? '').toLowerCase() === 'project') {
      const proj = strip(row[0] ?? '')
      if (!proj) continue
      if (!projects.includes(proj)) projects.push(proj)
      for (const n of ticks(row.slice(1).join(' '))) {
        if (!picks.has(n)) picks.set(n, new Set())
        picks.get(n)!.add(proj)
      }
      continue
    }
    const names = ticks(row[0] ?? '')
    if (names.length === 0) continue
    const base = (names[0] ?? '').split('-')[0] ?? ''
    for (const raw of names) {
      rows.push({
        name: raw.startsWith('-') ? base + raw : raw,
        category,
        desc: strip(col('What it does') || col('Description') || col('Purpose')),
        useful: strip(col('Useful in')),
      })
    }
  }
  return { rows, picks, projects }
}

async function catalogPath($: EngineInterface, setting: string): Promise<string> {
  const path = setting.trim() || DEFAULT_CATALOG
  if (!path.startsWith('~')) return path
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
  return home.replace(/[\\/]+$/, '') + path.slice(1)
}

async function loadSkills($: EngineInterface, setting: string): Promise<Loaded> {
  if (cache && Date.now() - cache.at < 60_000) return cache
  const path = await catalogPath($, setting)
  let catalog: Catalog = { rows: [], picks: new Map(), projects: [] }
  let hasCatalog = false
  try {
    catalog = parseCatalog(await $.fs.read(path))
    hasCatalog = catalog.rows.length > 0
  } catch {
    // No catalog: every installed skill is still listed, grouped by where it comes from.
  }

  const commands = await $.command.list()
  const live = new Map<string, string>()
  for (const c of commands) {
    live.set(c.name, c.name)
    if (!live.has(short(c.name))) live.set(short(c.name), c.name)
  }

  const tag = (name: string, useful: string) =>
    catalog.projects.filter(
      p => catalog.picks.get(name)?.has(p) || new RegExp(`(^|\\W)${escape(p)}(\\W|$)`, 'i').test(useful),
    )

  const seen = new Set<string>()
  const skills: Skill[] = catalog.rows.map(r => {
    const invoke = live.get(r.name)
    if (invoke) seen.add(invoke)
    return { ...r, name: invoke ?? r.name, projects: tag(r.name, r.useful), loaded: Boolean(invoke) }
  })
  for (const c of commands) {
    if (seen.has(c.name) || c.name.startsWith('skill-finder')) continue
    if (c.source !== 'user' && c.source !== 'plugin') continue
    skills.push({
      name: c.name,
      category: hasCatalog ? 'Not in your catalog yet' : c.source === 'user' ? 'Your skills' : 'Plugin skills',
      desc: c.description,
      useful: '',
      projects: tag(short(c.name), ''),
      loaded: true,
    })
  }
  cache = { at: Date.now(), skills, projects: catalog.projects, catalogPath: path, hasCatalog }
  return cache
}

function matches(s: Skill, q: string, proj: string) {
  if (proj !== 'All' && !s.projects.includes(proj)) return false
  const hay = `${s.name} ${s.desc} ${s.useful} ${s.category}`.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

export const register: Register = (on, options) => {
  const setting = typeof options.catalog === 'string' ? options.catalog : ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'skill-finder',
      description: 'Open the searchable skills panel (click a skill to put it in the prompt)',
    })
    return next(e)
  })

  on('command.run', { command: 'skill-finder' }, async $ => {
    cache = undefined
    await $.ui.open({ id: PANE, title: 'Skills' })
    return { text: 'Skills panel opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const q = await read($, query)
    const { skills, projects, catalogPath: path, hasCatalog } = await loadSkills($, setting)
    const storedProj = await read($, project)
    const proj = storedProj === 'All' || projects.includes(storedProj) ? storedProj : 'All'
    const hits = skills.filter(s => matches(s, q, proj))

    const groups = new Map<string, Skill[]>()
    for (const s of hits.slice(0, MAX_SHOWN)) {
      if (!groups.has(s.category)) groups.set(s.category, [])
      groups.get(s.category)!.push(s)
    }

    const choose = (s: Skill) => async () => {
      await $.prompt.fill({ text: `/${s.name} `, mode: 'replace' })
      $.ui.toast(`/${s.name} is in your prompt box: add details and press Enter`)
    }

    return (
      <Box flexDirection="column" gap="sm">
        {Input ? (
          <Input
            key="search"
            placeholder="Search skills by name, purpose or project..."
            value={q}
            submitLabel="search"
            autoFocus
            onInput={(value: string) => void update($, query, () => value)}
            onSubmit={(value: string) => void update($, query, () => value)}
          />
        ) : (
          <Text dimColor size="footnote">Search needs the desktop app or terminal.</Text>
        )}
        {projects.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" gap="xs">
            {['All', ...projects].map(p => (
              <Button
                key={`p:${p}`}
                label={p}
                variant={p === proj ? 'primary' : undefined}
                dimColor={p !== proj}
                onPress={() => update($, project, () => p)}
              />
            ))}
          </Box>
        )}
        {(q || proj !== 'All') && (
          <Button
            key="clear"
            label="Clear search"
            dimColor
            onPress={async () => {
              await update($, query, () => '')
              await update($, project, () => 'All')
            }}
          />
        )}
        <Text dimColor size="footnote">
          {hits.length} of {skills.length} skills{hits.length > MAX_SHOWN ? `, first ${MAX_SHOWN} shown` : ''}. Click one to put it in your prompt.
        </Text>
        {!hasCatalog && (
          <Text dimColor size="footnote">
            Optional: write a catalog at {path} to add categories, project filters and notes (format in the mod's README).
          </Text>
        )}
        {hits.length === 0 && <Text dimColor>No skill matches. Try a shorter word or pick All.</Text>}
        {[...groups].map(([cat, list]) => (
          <Box key={`g:${cat}`} flexDirection="column" gap="xs">
            <Text bold color="claude">{cat}</Text>
            {list.map(s => (
              <Box key={`s:${s.name}`} flexDirection="column" paddingLeft={1}>
                <Button key={`b:${s.name}`} label={`/${s.name}`} plain onPress={choose(s)} />
                {s.desc && <Text size="footnote">{s.desc}</Text>}
                {s.useful && <Text dimColor size="footnote">Use in: {s.useful}</Text>}
                {!s.loaded && <Text color="warning" size="footnote">Not installed or not loaded in this session</Text>}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
