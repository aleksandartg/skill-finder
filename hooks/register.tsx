import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const PANE = 'skill-finder'
const CATALOG = 'D:/Z6III/SKILLS.md'
const PROJECTS = ['All', 'Site', 'Frames', 'Influencers', 'Biz', 'Photo']
const MAX_SHOWN = 60

const query = atom({ plugin: 'skill-finder', key: 'query' } as const, '', { shape: 'query-1' })
const project = atom({ plugin: 'skill-finder', key: 'project' } as const, 'All', { shape: 'project-1' })

type Skill = {
  name: string // what you type after the slash
  category: string
  desc: string
  useful: string
  where: string
  projects: string[]
  loaded: boolean
}

type Catalog = { rows: Omit<Skill, 'loaded'>[]; picks: Map<string, Set<string>> }

let cache: { at: number; skills: Skill[]; error?: string } | undefined

const cells = (line: string) => line.split('|').slice(1, -1).map(c => c.trim())
const ticks = (text: string) => [...text.matchAll(/`([^`]+)`/g)].map(m => (m[1] ?? '').replace(/^\//, ''))
const strip = (text: string) => text.replace(/`/g, '').replace(/\*\*/g, '').trim()
const short = (name: string) => name.split(':').pop() ?? name

function parseCatalog(md: string): Catalog {
  const rows: Catalog['rows'] = []
  const picks = new Map<string, Set<string>>()
  let category = ''
  let header: string[] = []
  const lines = md.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const h = line.match(/^##\s+(?:\d+\.\s*)?(.+)$/)
    if (h) { category = (h[1] ?? '').trim(); header = []; continue }
    if (!line.startsWith('|')) { header = []; continue }
    if (/^\|\s*-/.test(line)) continue
    if (header.length === 0 && /^\|\s*-/.test(lines[i + 1] ?? '')) { header = cells(line); continue }
    const row = cells(line)
    const col = (title: string) => {
      const at = header.findIndex(x => x.toLowerCase() === title.toLowerCase())
      return at >= 0 ? row[at] ?? '' : ''
    }
    if (header[0] === 'Project') {
      const proj = strip(row[0] ?? '')
      for (const n of ticks(row[1] ?? '')) {
        if (!picks.has(n)) picks.set(n, new Set())
        picks.get(n)!.add(proj)
      }
      continue
    }
    const names = ticks(row[0] ?? '')
    if (names.length === 0) continue
    const base = (names[0] ?? '').split('-')[0] ?? ''
    for (const raw of names) {
      const name = raw.startsWith('-') ? base + raw : raw
      rows.push({
        name,
        category,
        desc: strip(col('What it does')),
        useful: strip(col('Useful in')),
        where: strip(col('Where')),
        projects: [],
      })
    }
  }
  return { rows, picks }
}

async function loadSkills($: EngineInterface): Promise<NonNullable<typeof cache>> {
  if (cache && Date.now() - cache.at < 60_000) return cache
  let catalog: Catalog = { rows: [], picks: new Map() }
  let error: string | undefined
  try {
    catalog = parseCatalog(await $.fs.read(CATALOG))
  } catch {
    error = `Could not read ${CATALOG}; showing installed skills only.`
  }
  const commands = await $.command.list()
  const live = new Map<string, string>()
  for (const c of commands) {
    live.set(c.name, c.name)
    if (!live.has(short(c.name))) live.set(short(c.name), c.name)
  }
  const seen = new Set<string>()
  const skills: Skill[] = catalog.rows.map(r => {
    const invoke = live.get(r.name)
    if (invoke) seen.add(invoke)
    const projects = PROJECTS.filter(
      p => p !== 'All' && (catalog.picks.get(r.name)?.has(p) || new RegExp(`\\b${p}\\b`, 'i').test(r.useful)),
    )
    return { ...r, name: invoke ?? r.name, projects, loaded: Boolean(invoke) }
  })
  for (const c of commands) {
    if (seen.has(c.name) || (c.source !== 'user' && c.source !== 'plugin')) continue
    if (c.name.startsWith('skill-finder')) continue
    skills.push({
      name: c.name, category: 'Not in the catalog yet', desc: c.description, useful: '', where: c.source,
      projects: [], loaded: true,
    })
  }
  cache = { at: Date.now(), skills, error }
  return cache
}

function matches(s: Skill, q: string, proj: string) {
  if (proj !== 'All' && !s.projects.includes(proj)) return false
  const hay = `${s.name} ${s.desc} ${s.useful} ${s.category}`.toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

export const register: Register = on => {
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
    const proj = await read($, project)
    const { skills, error } = await loadSkills($)
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
            placeholder="Search skills: video, captions, website, pdf..."
            value={q}
            submitLabel="search"
            autoFocus
            onInput={(value: string) => void update($, query, () => value)}
            onSubmit={(value: string) => void update($, query, () => value)}
          />
        ) : (
          <Text dimColor size="footnote">Search needs the desktop app or terminal; use the project filters here.</Text>
        )}
        <Box flexDirection="row" flexWrap="wrap" gap="xs">
          {PROJECTS.map(p => (
            <Button
              key={`p:${p}`}
              label={p}
              variant={p === proj ? 'primary' : undefined}
              dimColor={p !== proj}
              onPress={() => update($, project, () => p)}
            />
          ))}
          {(q || proj !== 'All') && (
            <Button
              key="clear"
              label="Clear"
              dimColor
              onPress={async () => {
                await update($, query, () => '')
                await update($, project, () => 'All')
              }}
            />
          )}
        </Box>
        <Text dimColor size="footnote">
          {hits.length} of {skills.length} skills{hits.length > MAX_SHOWN ? `, first ${MAX_SHOWN} shown` : ''}. Click one to put it in your prompt.
        </Text>
        {error && <Text color="warning" size="footnote">{error}</Text>}
        {hits.length === 0 && <Text dimColor>No skill matches. Try a shorter word or pick All.</Text>}
        {[...groups].map(([cat, list]) => (
          <Box key={`g:${cat}`} flexDirection="column" gap="xs">
            <Text bold color="claude">{cat}</Text>
            {list.map(s => (
              <Box key={`s:${s.name}`} flexDirection="column" paddingLeft={1}>
                <Button key={`b:${s.name}`} label={`/${s.name}`} plain onPress={choose(s)} />
                {s.desc && <Text size="footnote">{s.desc}</Text>}
                {s.useful && <Text dimColor size="footnote">Use in: {s.useful}</Text>}
                {!s.loaded && <Text color="warning" size="footnote">Not available in this session</Text>}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
