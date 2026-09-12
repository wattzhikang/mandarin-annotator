# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Electron app that displays segmented Chinese text and shows a definition popover when the user mouses over a word (backed by CC-CEDICT plus user-editable overrides). Also supports adjusting word boundaries and editing definitions in place. See README.md for the user-facing feature description (dictionary layering, input file format, vocabulary editor).

## Commands

- `npm install` — installs deps and (via `postinstall`) runs `electron-rebuild -f -w better-sqlite3` to rebuild the native module against Electron's ABI.
- `npm start` — runs `electron .`.
- There is no lint, build, or test tooling in this project (the `test` script is an unconfigured placeholder). Don't assume any exists.

### Environment gotchas

- Node version is pinned via `.nvmrc` (currently 22.17.0). The system default Node here has historically been too old for Electron's installer (`@electron/get`/`electron/install.js` requires Node ≥22.12; older Node versions fail with `ERR_REQUIRE_ESM`). Run `nvm use` before installing/starting if things look broken.
- If `ELECTRON_RUN_AS_NODE=1` is set in the shell, `electron .` runs as plain Node instead of launching the app, and `require("electron")` silently returns a path string instead of the API — `main.js` will fail with `Cannot read properties of undefined (reading 'whenReady')`. Unset it if you see that error.
- `better-sqlite3` must stay on a version built on N-API (`node-addon-api`) — that's what lets it use prebuilt binaries instead of compiling from source, which is what was broken (old `node-gyp` bundled by `better-sqlite3@7` couldn't build against modern Python/Node) before this was fixed.
- The renderer's DevTools console is re-logged to the main process's stdout/stderr (see the `console-message` listener in `main.js`), so `npm start`'s terminal output includes renderer-side `console.log`/errors — no need to open DevTools manually to see them.

## Architecture

This is a pre-bundler Electron app: no webpack/vite, no TypeScript. `index.html` loads `index.js` as a plain `<script>` tag, and the renderer runs with `nodeIntegration: true`, `contextIsolation: false`, `sandbox: false` (set in `main.js`), so renderer code directly `require()`s Node built-ins and npm packages (`fs`, `better-sqlite3`, `jquery`) — there is no preload script or IPC boundary. Keep this in mind before assuming any code runs "in the main process" just because it touches the filesystem or the database — most of it runs in the renderer.

### The three-level dictionary

`databaseLevel.js` defines three layers (`CORE`=0, `CUSTOM`=1, `TEXT`=2). `dictionary.js` (class `Dictionary`) wraps a `better-sqlite3` connection to `data/dictionary.db` and implements layering in `applyLayerModel()`: for a given headword+pinyin, a higher-numbered layer's entry replaces a lower one's. CORE (CC-CEDICT import) is never written to at runtime; CUSTOM is the user's persistent dictionary; TEXT holds per-document overrides that are cleared when a text is closed (`clearTextDefs()`). This layering logic is central — any feature touching word definitions needs to go through `Dictionary`, not query the tables directly.

### Text loading and the word-span model

`index.js` reads a `.seg` input file: an optional leading JSON object (parsed by manual brace-matching, not `JSON.parse` on the whole file) supplying `TEXT`-level word overrides, followed by plain text — one paragraph per line, words space-separated, and lines starting with `#`/`##` becoming headings. For each Han-script word, a `<span>` is created and wrapped in a `SpanMachine` (`SpanMachine.js`).

`SpanMachine` is the core interactive unit: one instance per word span, holding view/edit state and rendering a Bootstrap popover (manual trigger, not hover-triggered by Bootstrap itself — `mouseenter`/`mouseleave` call `popup()`/`popdown()` directly). Edit mode (`toggleEditMode()`) is exclusive across the whole document via the module-level `anyEditMode` flag. Word-boundary adjustment (`breakLeft`/`breakRight`/`expandLeft`/`expandRight`) works by directly mutating sibling `<span>` elements' `innerHTML` and creating/removing new `SpanMachine`-wrapped spans — there's no underlying segmentation model, the DOM *is* the segmentation state.