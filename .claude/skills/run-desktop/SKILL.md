---
name: run-desktop
description: Build, run, and drive the mandarin-annotator Electron app. Use when asked to start the app, take a screenshot of it, or interact with its UI (loading a .seg text, hovering/clicking word spans, the vocabulary editor).
---

mandarin-annotator is a pre-bundler Electron app (no build step - `index.js`
is loaded as a plain `<script>` tag, `nodeIntegration: true`). For
agent/automated use, drive it via the Playwright REPL at
`.claude/skills/run-desktop/driver.mjs`. This machine has a real X/Wayland
display (`DISPLAY=:0`), so no xvfb is needed - the app window actually
appears on screen while the driver controls it.

All paths are relative to the repo root.

## Prerequisites

```bash
npm install   # playwright-core is already a devDependency
```

## Run (agent path)

```bash
nvm use   # per CLAUDE.md - system default Node is too old for Electron's installer
node .claude/skills/run-desktop/driver.mjs
```

Wrap in tmux for interactive use:

```bash
tmux new-session -d -s app -x 200 -y 50
tmux send-keys -t app 'cd /path/to/mandarin-annotator && nvm use && node .claude/skills/run-desktop/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t app -p | grep -q "driver>"; do sleep 0.2; done'
tmux send-keys -t app 'launch' Enter
timeout 30 bash -c 'until tmux capture-pane -t app -p | grep -q "launched\."; do sleep 0.2; done'
tmux send-keys -t app 'load /path/to/mandarin-annotator/test.seg' Enter
tmux send-keys -t app 'hover #chineseText span.simplified:nth-of-type(1)' Enter
tmux send-keys -t app 'ss hovered' Enter
tmux capture-pane -t app -p
```

Screenshots land in `/tmp/shots/` (override: `SCREENSHOT_DIR`).

### Commands

| command | what it does |
|---|---|
| `launch` | launch the app, wait for the window |
| `ss [name]` | screenshot -> `/tmp/shots/<name>.png` |
| `click <css-sel>` | click element (via DOM, not coords) |
| `click-text <text>` | click button/link containing text |
| `hover <css-sel>` | real mouse hover (fires mouseenter/mouseleave - what `SpanMachine.popup()`/`popdown()` listen for) |
| `unhover` | move mouse to a neutral spot so the last hover's `popdown()` fires |
| `type <text>` / `press <key>` | keyboard input |
| `wait <css-sel>` | wait for element, 10s timeout |
| `eval <js>` | evaluate in the page, print JSON |
| `text [css-sel]` | print innerText |
| `load <absolute .seg path>` | set `#fileChooser`'s file (bypasses the native OS picker, which Playwright can't drive) and click `#loadDict` |
| `windows` | list window URLs |
| `quit` | close app, exit |

## Run (human path)

```bash
npm start   # opens a real window
```

## Gotchas

- **`ELECTRON_RUN_AS_NODE=1` in the shell breaks `electron .`** — per
  CLAUDE.md, it makes Electron run as plain Node, so `main.js` crashes on
  `app.whenReady()` being undefined. The driver's `launch` command strips
  this env var automatically before spawning; if running `npm start`
  directly instead, `unset ELECTRON_RUN_AS_NODE` first if you see that error.
- **The native `<input type=file>` dialog can't be driven by Playwright.**
  Use the `load` command, which calls `page.setInputFiles('#fileChooser',
  absPath)` — this gives the renderer a real `File` object (with a real
  underlying path `webUtils.getPathForFile()` can resolve), then clicks
  `#loadDict`.
- **Popovers only exist while hovered/edited.** `SpanMachine` uses a
  dispose-then-reconstruct pattern (see CLAUDE.md), not
  show/hide — so `hover` (real mouse events), not `click` + `eval`
  dispatching synthetic events, is what actually triggers `popup()`.

## Troubleshooting

- **Launch timeout (30s):** check `node_modules/electron/dist/electron`
  exists (`npm install` didn't fully complete) and that no stray Electron
  process is already holding the window.
- **"Missing X server" / blank screenshot:** this repo's dev machine has a
  real display (`echo $DISPLAY`); if driving this on a headless box instead,
  wrap the driver command in `xvfb-run -a`.
