# Task Relay

**Pull tasks through your notes. Keep the context.**

Task Relay is a custom [Obsidian Bases](https://help.obsidian.md/bases) view for
task triage. It turns the notes selected by a Base into a workbench of draggable
task cards, so you can pull work from your project, area and list notes into your
daily or weekly note — without leaving Markdown behind.

There is **no separate task database**. Your Markdown files stay the single
source of truth.

## The idea

- **Bases decides _what_ you see** — filtering, sorting and which properties are
  visible are all configured on the Base, using your own properties. Task Relay
  has no opinion about your schema.
- **Task Relay decides _how_ you work with it** — it extracts the open Markdown
  checkbox tasks from those notes, renders them as cards, and lets you move them
  between notes.

```text
Notes       = context
Markdown    = task storage
Links       = relationships and provenance
Properties  = metadata
Templates   = recurring work
Bases       = queries, filtering, sorting and views
Task Relay  = task interaction
```

## Pull with provenance

The core interaction is drag-and-drop between notes. The default is **not** a
destructive move — it is a *pull that preserves context*.

Drag `Call supplier` from `Project X` onto today's daily note and Task Relay
rewrites the Markdown for you:

**Project X**

```md
- [x] Call supplier — moved to [[2026-09-03]]
```

**2026-09-03**

```md
- [ ] Call supplier — pulled from [[Project X]]
```

You get a readable trail through your vault — `Project → Weekly → Daily → done` —
using only Markdown and links. No task IDs, no hidden metadata, no sync engine.
Anyone reading the notes years later understands what happened, even without the
plugin.

Hold **Shift** while dropping for a raw move (no provenance). You can flip the
default per Base in the view options.

## Features

- Custom Bases view type — pick **Task Relay** as the layout of any `.base`.
- Collapsible section per note, with **Expand all / Collapse all**.
- Open tasks rendered as compact, draggable cards.
- Interactive checkboxes — completing a card updates the real Markdown task.
- Drag tasks between notes with provenance (or Shift for a raw move).
- Base-visible properties shown inline in each note header; boolean and date
  properties are editable in place without opening the note.
- Notes with zero open tasks stay visible as drop targets when the Base includes
  them (e.g. today's daily note).
- Stays in sync when you edit notes directly.

## Usage

1. Enable the plugin in **Settings → Community plugins**.
2. Create or open a `.base` file.
3. Configure its filters, sort and visible properties as usual. A typical filter
   selects notes that have open tasks, plus your planning notes, while excluding
   templates and archives.
4. Change the view layout to **Task Relay**.

## Recurring tasks

Task Relay intentionally has **no recurrence engine**. Put repeating tasks in
your daily / weekly / monthly templates — when a new note is created from a
template, its tasks appear in the workbench automatically. Exclude the templates
folder with a normal Base filter.

## Development

```bash
npm install
npm run dev      # watch build
npm run check    # typecheck + lint + test + build + bundle safety check
```

Always develop against a **separate, empty vault** — never your real one. The
mutation logic is covered by unit tests (`npm test`), but drag/drop moves real
Markdown files.

## Safety

Task movement modifies real files, so writes are conservative: the destination
is written **first** so a failure can never lose a task from both notes (the
worst case is a harmless duplicate). Edits verify the task still exists — and
re-locate it if the note shifted — before writing, using Obsidian's atomic
`Vault.process` API.

## License

[MIT](LICENSE) © senseiBas
