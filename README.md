# skill-finder

A Claude Code mod: `/skill-finder` opens a **Skills** panel next to the chat.

- Search box that filters as you type (name, description, where it is useful).
- Project filter buttons (All, Site, Frames, Influencers, Biz, Photo).
- Click a skill and `/skill-name` is placed in your prompt box; add details and press Enter.

It reads a skills catalog from `D:/Z6III/SKILLS.md` (Markdown tables: `## N. Category` headings, columns `What it does` / `Useful in`, and a `Project | Reach for` quick-pick table) and merges it with the skills actually loaded in the session. Without that file it still lists every installed skill. To use your own catalog or projects, change `CATALOG` and `PROJECTS` at the top of `hooks/register.tsx`.

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

Answer `y` to add the marketplace, then pick the user scope.

This repository is private: it installs only for people who can read it on GitHub and whose computer already has a git login for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`). The install never asks for one.
