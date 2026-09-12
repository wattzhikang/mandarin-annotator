// REPL driver for mandarin-annotator (Electron, nodeIntegration app, no build step).
// Wrap in tmux; send-keys commands, capture-pane output. See SKILL.md.
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let app = null;
let page = null;

const electronBin = process.platform === 'darwin'
  ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(APP_DIR, 'node_modules/electron/dist/electron');

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    // ELECTRON_RUN_AS_NODE=1 in the shell makes `electron .` run as plain
    // Node instead of launching the app (main.js then crashes on
    // app.whenReady()) - strip it so the real app launches.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({
      executablePath: electronBin,
      args: ['--no-sandbox', APP_DIR],
      env,
      timeout: 30_000,
    });
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    console.log('launched.', app.windows().length, 'window(s):', page.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '->', r);
  },

  async 'click-text'(text) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(t => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')];
      const el = els.find(e => e.textContent?.trim() === t)
              ?? els.find(e => e.textContent?.includes(t));
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName;
    }, text);
    console.log('click-text', JSON.stringify(text), '->', r);
  },

  // Real mouse hover (dispatches actual mouseenter/mouseleave), which is
  // what SpanMachine's popup()/popdown() listen for - unlike a DOM
  // .dispatchEvent(), this exercises the real interaction path.
  async hover(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.hover(sel, { timeout: 5000 }); console.log('hovered:', sel); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  // Move the mouse off any span so popdown() fires (hovering a new
  // selector fires the old one's mouseleave too, but this is useful
  // standalone).
  async unhover() {
    if (!page) return console.log('ERROR: launch first');
    await page.mouse.move(5, 5);
    console.log('moved mouse to 5,5');
  },

  async type(text)  { if (page) await page.keyboard.type(text, { delay: 30 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: launch first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  // App-specific: set the #fileChooser <input type=file> to an absolute
  // path (bypasses the native OS picker dialog, which Playwright can't
  // drive) and click #loadDict. Pass an absolute path, e.g.
  // `load /home/x/software-projects/mandarin-annotator/test.seg`.
  async load(absPath) {
    if (!page) return console.log('ERROR: launch first');
    if (!absPath) return console.log('ERROR: usage: load <absolute .seg path>');
    await page.setInputFiles('#fileChooser', absPath);
    await page.evaluate(() => document.querySelector('#loadDict').click());
    console.log('loaded:', absPath);
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async quit() { if (app) await app.close().catch(()=>{}); app = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async line => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, ' - try: help'); return rl.prompt(); }
  try { await fn(rest.join(' ')); } catch (e) { console.log('ERROR:', e.message); }
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('mandarin-annotator driver - "help" for commands, "launch" to start');
rl.prompt();
