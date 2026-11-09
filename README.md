# skill-finder

A Claude Code mod: `/skill-finder` opens a **Skills** panel next to the chat, listing the skills installed for **you**.

- A search box that filters as you type (name, description, notes).
- Click a skill and `/skill-name` lands in your prompt box. Add details and press Enter.
- Works with no setup: your own skills appear under **Your skills**, skills from plugins under **Plugin skills**.
- Optional catalog: add categories, your own notes and **project filter buttons** with one Markdown file.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install skill-finder --marketplace aleksandartg/skill-finder
```

From a shell:

```
claude plugin install skill-finder --marketplace aleksandartg/skill-finder
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `aleksandartg/skill-finder`, then Add plugin.

Answer `y` to add the marketplace, then pick the user scope. Then type `/skill-finder`.

This repository is private: it installs only for people who can read it on GitHub and whose computer already has a git login for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never asks for one.

## Optional: your own catalog

By default the panel looks for `~/.claude/SKILLS.md` (`~` is your home folder, e.g. `C:\Users\you` on Windows). To keep it somewhere else, set the plugin's **Skills catalog file** option (`/config`, or settings `pluginConfigs`). With no file, the panel simply lists everything installed.

The format is plain Markdown tables:

```markdown
# Skills catalog

## Quick pick by project

| Project | Reach for |
|---|---|
| **Blog** | `humanizer`, `web-design-guidelines` |
| **Client work** | `pdf`, `docx` |

## 1. Writing

| Skill | What it does | Useful in |
|---|---|---|
| `humanizer` | Removes AI-sounding phrasing. | Blog posts, client emails |

## 2. Documents

| Skill | What it does | Useful in |
|---|---|---|
| `pdf` | Creates and edits PDFs. | Client work |
```

- Each `## heading` becomes a group in the panel (a leading `1.` is dropped).
- The first column holds skill names in backticks. `What it does` (or `Description`) and `Useful in` columns are shown under each skill; other columns are ignored.
- The table whose first column is `Project` makes the filter buttons: each row is one button, tagging the skills named in backticks. A skill also counts for a project when its `Useful in` text mentions the project's name.
- Installed skills missing from your catalog still show, under **Not in your catalog yet**. Catalog entries that aren't installed are marked.
