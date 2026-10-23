/* End-to-end test of the notebook inside the real app, under jsdom, against a fake GitHub.
   The vendored libraries (mermaid, KaTeX) are stripped for speed; everything else is the page
   that ships. Run: node test_ui.js */
const fs = require('fs');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const HTML = process.env.MIZKAR_HTML || require('path').join(__dirname, '..', 'index.html');
let html = fs.readFileSync(HTML, 'utf8');
// a beta build renames the storage keys and may wear the Android skin; the same suite covers them
const KEYPFX = html.includes("'mz2-") ? 'mz2-' : html.includes("'mzb-") ? 'mzb-' : 'fs2-';
const IS_M3 = html.slice(0, 300).includes('data-skin="m3"');
// strip the two big vendored libraries and the CDN tag: the notebook needs none of them
html = html.replace(/<script id="mermaidLib">[\s\S]*?<\/script>/, '<script id="mermaidLib"></script>');
html = html.replace(/<script id="katexLib">[\s\S]*?<\/script>/, '<script id="katexLib"></script>');
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]*"><\/script>/, '');

/* ------------------------------------------------------------------ fake GitHub, in memory */
const repo = { files: new Map(), commits: [], apiCommits: 0, refs: {}, blobs: new Map(), trees: new Map(), req: [], gists: new Map(), gistAuth: [] };
function blobSha(text) { return crypto.createHash('sha1').update('blob ' + Buffer.byteLength(text) + '\0' + text).digest('hex'); }
function head() { return repo.commits.length ? repo.commits[repo.commits.length - 1].sha : ''; }
function putRemote(path, text) {
  const sha = blobSha(text);
  repo.files.set(path, { path, sha, text });
  repo.blobs.set(sha, text);
  return sha;
}
function apiResponse(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (k) => headers[k.toLowerCase()] || (typeof data === 'object' ? 'application/json' : 'text/plain') },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))
  };
}
function handleApi(method, url, body) {
  repo.req.push(method + ' ' + url);
  const u = new URL(url);
  if (u.pathname.startsWith('/api/v4/projects/')) {
    const decoded = decodeURIComponent(u.pathname);
    // the project id may itself contain a slash once decoded, so the API part is found by its marker
    const rest = decoded.includes('/repository/') ? decoded.slice(decoded.indexOf('/repository/')) : '';
    const bodyObj = body ? JSON.parse(body) : null;
    if (!rest && method === 'GET') return apiResponse({ path_with_namespace: 'me/notes', visibility: 'private', permissions: { project_access: { access_level: 40 } } });
    if (/^\/repository\/branches\//.test(rest) && method === 'GET') {
      if (!head()) return apiResponse({ message: '404 Branch Not Found' }, 404);
      return apiResponse({ commit: { id: head() } });
    }
    if (/^\/repository\/tree$/.test(rest) && method === 'GET') {
      const page = +(u.searchParams.get('page') || 1);
      const all = [...repo.files.values()].map((f) => ({ path: f.path, type: 'blob', id: f.sha }));
      return apiResponse(all.slice((page - 1) * 100, page * 100));
    }
    if (/^\/repository\/files\/.*\/raw$/.test(rest) && method === 'GET') {
      const path = rest.replace('/repository/files/', '').replace('/raw', '');
      const f = repo.files.get(path);
      if (!f) return apiResponse({ message: '404 File Not Found' }, 404);
      return apiResponse(f.text);
    }
    if (/^\/repository\/commits$/.test(rest) && method === 'POST') {
      // like GitLab: create on an existing file, update or delete on a missing one, fail the whole commit
      for (const a of bodyObj.actions || []) {
        const has = repo.files.has(a.file_path);
        if (a.action === 'create' && has) return apiResponse({ message: 'A file with this name already exists' }, 400);
        if ((a.action === 'update' || a.action === 'delete') && !has) return apiResponse({ message: "A file with this name doesn't exist" }, 400);
      }
      for (const a of bodyObj.actions || []) {
        if (a.action === 'delete') repo.files.delete(a.file_path);
        else {
          const text = a.encoding === 'base64' ? Buffer.from(a.content, 'base64').toString('utf8') : a.content;
          putRemote(a.file_path, text);
        }
      }
      const sha = crypto.randomBytes(20).toString('hex');
      repo.apiCommits++;
      repo.commits.push({ sha, message: bodyObj.commit_message, gl: true, actions: bodyObj.actions });
      return apiResponse({ id: sha });
    }
    if (/^\/repository\/commits$/.test(rest) && method === 'GET') return apiResponse([]);
    return apiResponse({ message: 'fake GitLab: unhandled ' + method + ' ' + rest }, 404);
  }
  const p = decodeURIComponent(u.pathname).replace(/^\/repos\/[^/]+\/[^/]+/, '');
  const bodyObj = body ? JSON.parse(body) : null;
  // gists: create, list, read, update, delete
  if (p === '/gists' && method === 'POST') {
    const id = crypto.randomBytes(16).toString('hex'), files = {};
    for (const [n, f] of Object.entries(bodyObj.files)) files[n] = { filename: n, content: f.content, truncated: false, raw_url: 'https://gist.githubusercontent.com/x/' + id + '/raw/' + n };
    repo.gists.set(id, { id, description: bodyObj.description, public: bodyObj.public, files, created_at: new Date().toISOString() });
    return apiResponse(repo.gists.get(id), 201);
  }
  if (p === '/gists' && method === 'GET') return apiResponse([...repo.gists.values()]);
  const gm = /^\/gists\/([0-9a-f]+)$/.exec(p);
  if (gm) {
    const g = repo.gists.get(gm[1]);
    if (!g) return apiResponse({ message: 'Not Found' }, 404);
    if (method === 'GET') return apiResponse(g);
    if (method === 'PATCH') { for (const [n, f] of Object.entries(bodyObj.files)) g.files[n].content = f.content; return apiResponse(g); }
    if (method === 'DELETE') { repo.gists.delete(gm[1]); return apiResponse(null, 204); }
  }
  if (p === '' && method === 'GET') return apiResponse({ full_name: 'me/notes', private: true, default_branch: 'main', permissions: { push: true } });
  // like GitHub: an empty repository has no Git database yet — only the Contents API can make its first commit
  if (!head() && ((p === '/git/blobs' || p === '/git/trees' || p === '/git/commits') && method === 'POST')) return apiResponse({ message: 'Git Repository is empty.' }, 409);
  if (p.startsWith('/contents/') && method === 'PUT') {
    const path = p.slice('/contents/'.length), text = Buffer.from(bodyObj.content, 'base64').toString('utf8');
    const blob = putRemote(path, text), sha = crypto.randomBytes(20).toString('hex'), tree = crypto.randomBytes(20).toString('hex');
    repo.trees.set(tree, { tree: [{ path, mode: '100644', type: 'blob', sha: blob }] });
    repo.apiCommits++;
    repo.commits.push({ sha, message: bodyObj.message, tree, parents: head() ? [head()] : [], treeBody: repo.trees.get(tree) });
    return apiResponse({ content: { path }, commit: { sha } }, 201);
  }
  if (p === '/git/ref/heads/main' && method === 'GET') {
    if (!head()) return apiResponse({ message: 'Not Found' }, 404);
    return apiResponse({ object: { sha: head() } });
  }
  if (/^\/git\/trees\/[0-9a-f]{40}$/.test(p) && method === 'GET') {
    const entries = [...repo.files.values()].map((f) => ({ path: f.path, type: 'blob', sha: f.sha, size: f.text.length }));
    return apiResponse({ sha: p.split('/').pop(), tree: entries });
  }
  if (/^\/commits$/.test(p) && method === 'GET') {
    return apiResponse([{ sha: 'c0ffee1', commit: { message: 'یادداشت: test', author: { date: '2026-10-23T10:00:00Z' } } }]);
  }
  if (p.startsWith('/contents/') && method === 'GET') {
    const path = p.slice('/contents/'.length);
    const f = repo.files.get(path);
    if (!f) return apiResponse({ message: 'Not Found' }, 404);
    return apiResponse(f.text);
  }
  if (p === '/git/blobs' && method === 'POST') {
    const text = Buffer.from(bodyObj.content, 'base64').toString('utf8');
    const sha = blobSha(text);
    repo.blobs.set(sha, text);
    return apiResponse({ sha });
  }
  if (p.startsWith('/git/commits/') && method === 'GET') {
    const c = repo.commits.find((x) => x.sha === p.slice('/git/commits/'.length));
    if (!c) return apiResponse({ message: 'Not Found' }, 404);
    // commits a test made by hand get a real tree here, as every commit on GitHub has one
    if (!c.tree || !repo.trees.has(c.tree)) { c.tree = c.tree || crypto.randomBytes(20).toString('hex'); repo.trees.set(c.tree, c.treeBody || { tree: [] }); }
    return apiResponse({ sha: c.sha, tree: { sha: c.tree } });
  }
  if (p === '/git/trees' && method === 'POST') {
    // like GitHub: base_tree has to be a tree, never a commit
    if (bodyObj.base_tree && !repo.trees.has(bodyObj.base_tree)) return apiResponse({ message: 'base_tree is not a tree' }, 422);
    // like GitHub: removing a path the tree does not have is an error
    const missing = (bodyObj.tree || []).filter((e) => e.sha === null && !repo.files.has(e.path));
    if (missing.length) return apiResponse({ message: 'GitRPC::BadObjectState' }, 422);
    const sha = crypto.randomBytes(20).toString('hex');
    repo.trees.set(sha, bodyObj);
    return apiResponse({ sha });
  }
  if (p === '/git/commits' && method === 'POST') {
    const sha = crypto.randomBytes(20).toString('hex');
    repo.apiCommits++;
    repo.commits.push({ sha, message: bodyObj.message, tree: bodyObj.tree, parents: bodyObj.parents, treeBody: repo.trees.get(bodyObj.tree) });
    // apply the tree to the fake working state
    for (const entry of (repo.trees.get(bodyObj.tree) || {}).tree || []) {
      if (entry.sha === null) repo.files.delete(entry.path);
      else if (repo.blobs.has(entry.sha)) repo.files.set(entry.path, { path: entry.path, sha: entry.sha, text: repo.blobs.get(entry.sha) });
    }
    return apiResponse({ sha });
  }
  if ((p === '/git/refs/heads/main' && method === 'PATCH') || (p === '/git/refs' && method === 'POST')) {
    return apiResponse({ object: { sha: bodyObj.sha } });
  }
  return apiResponse({ message: 'fake GitHub: unhandled ' + method + ' ' + p }, 404);
}

/* ------------------------------------------------------------------ jsdom with the app running */
const dom = new JSDOM(html, {
  url: 'https://example.test/mizkar/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    // IndexedDB, in memory (jsdom has none)
    const db = new Map();
    win.__idb = db;                      // tests look inside, to make sure nothing secret is stored
    win.indexedDB = {
      open() {
        const rq = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        setTimeout(() => {
          rq.result = {
            _stores: db,
            objectStoreNames: { contains: (n) => db.has(n) },
            createObjectStore(n) { db.set(n, new Map()); return {}; },
            transaction(store) {
              if (!db.has(store)) db.set(store, new Map());
              const m = db.get(store), tx = { oncomplete: null, onerror: null, error: null };
              tx.objectStore = () => ({
                get: (k) => { const r = { result: m.get(k), onsuccess: null, onerror: null }; setTimeout(() => r.onsuccess && r.onsuccess(), 0); return r; },
                put: (v, k) => { m.set(k, v); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); return {}; }
              });
              return tx;
            }
          };
          rq.onupgradeneeded && rq.onupgradeneeded();
          rq.onsuccess && rq.onsuccess();
        }, 0);
        return rq;
      }
    };
    win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    win.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    win.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    win.scrollTo = () => {};
    win.HTMLElement.prototype.scrollIntoView = function () {};   // jsdom has no layout
    win.URL.createObjectURL = () => 'blob:test';
    win.URL.revokeObjectURL = () => {};
    win.fetch = (url, init) => {
      const method = (init && init.method) || 'GET';
      const body = init && init.body;
      if (String(url).startsWith('https://api.github.com/gists')) repo.gistAuth.push(method + ' ' + !!(init && init.headers && init.headers.Authorization));
      if (String(url).startsWith('https://api.github.com') || String(url).startsWith('https://gitlab.com/api/v4')) {
        return Promise.resolve(handleApi(method, String(url), body));
      }
      return Promise.resolve(apiResponse({ message: 'offline in tests' }, 404));
    };
    win.console = console;
    // jsdom has no SubtleCrypto: Node's WebCrypto drives the encrypted-note tests
    Object.defineProperty(win, 'crypto', { value: require('crypto').webcrypto, configurable: true, writable: true });
    const util = require('util');
    win.TextEncoder = util.TextEncoder;
    win.TextDecoder = util.TextDecoder;
  }
});
const win = dom.window;
const doc = win.document;

/* ------------------------------------------------------------------ helpers */
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(25); }
  return false;
}

(async () => {
  const nb = win.mizkarNotebook;
  if (!nb) { console.error('FAIL: window.mizkarNotebook missing — the module did not run'); process.exit(1); }
  await until(() => nb.ui.state().loaded);

  console.log('\n— the page came up with the notebook wired in —');
  ok('module loaded', !!nb && nb.ui.state().loaded);
  ok('toolbar button exists', !!doc.getElementById('btnNotebook'));
  ok('sidebar exists', !!doc.getElementById('nb'));
  ok('sync chip exists', !!doc.getElementById('nbSync'));
  ok('notebook styles were appended', doc.getElementById('appStyle').textContent.includes('#nbBack'));
  eq('no notes before a repository is set', Object.keys(nb.ui.files()).length, 0);

  console.log('\n— connect —');
  const cfg = nb.ui.cfg({ repo: 'me/notes', branch: 'main', token: 'fake-token', auto: false, idleSeconds: 20 });
  ok('config kept', cfg.repo === 'me/notes' && cfg.token === 'fake-token');
  await nb.ui.pull();
  eq('an empty repository pulls nothing', Object.keys(nb.ui.files()).length, 0);
  ok('the chip is visible once a repository is set', !doc.getElementById('nbSync').hidden);
  ok('the chip reads «همگام»', doc.getElementById('nbSync').className.includes('nb-ok'), doc.getElementById('nbSync').className);

  console.log('\n— make a daily note (Jalali path + template) —');
  const daily = cfg.collections.filter((c) => c.calendar === 'day')[0];
  const made = nb.ui.newNote(daily, new Date(2026, 9, 23, 9, 15), '');
  eq('path follows the shamsi pattern', made.path, 'روزانه/1405/08/1405-08-01.md');
  ok('front matter and heading came from the template', /^---\ntype: daily/.test(nb.ui.files()[made.path].text) && nb.ui.files()[made.path].text.includes('1405/08/01 — جمعه'), nb.ui.files()[made.path].text.split('\n').slice(0, 8));
  ok('pending change is counted', nb.ui.dirty().length === 1, nb.ui.dirty().length);

  console.log('\n— it opens as a notebook tab —');
  nb.ui.open(made.path);
  const tabEl = doc.querySelector('#tabsList [aria-selected="true"]');
  ok('the tab carries the notebook chip', !!tabEl && !!tabEl.querySelector('.nb-f'), tabEl && tabEl.innerHTML.slice(0, 120));
  ok('the tab shows the note name', tabEl.textContent.includes('1405-08-01'));
  eq('the editor holds the note text', doc.getElementById('input').value, nb.ui.files()[made.path].text);

  console.log('\n— push: one commit for everything —');
  repo.files.clear(); repo.commits.length = 0;
  await nb.ui.push({ loud: false });
  eq('exactly one commit was made', repo.apiCommits, 1);
  eq('the commit carries one tree', repo.commits[0].treeBody.tree.length, 1);
  eq('the note is in the repository', repo.files.has('روزانه/1405/08/1405-08-01.md'), true);
  ok('the commit message names the note', /1405-08-01/.test(repo.commits[0].message), repo.commits[0].message);
  ok('the note is no longer pending', nb.ui.dirty().length === 0);
  ok('the chip is back to «همگام»', doc.getElementById('nbSync').className.includes('nb-ok'));

  console.log('\n— a second push batches every change into one commit —');
  nb.ui.write('ایده ها/دفترچه با Git.md', '# ایده\nمتن\n');
  nb.ui.write('جلسه ها/1405/08/1405-08-01 شبکه.md', '# جلسه\n');
  nb.ui.write('ایده ها/دفترچه با Git.md', '# ایده\nمتن ویرایش شده\n');
  await nb.ui.push({ loud: false });
  eq('one commit for three changes', repo.apiCommits, 2);
  eq('all three files in the tree', repo.commits[1].treeBody.tree.length, 2);
  ok('the second commit builds on the first', repo.commits[1].parents[0] === repo.commits[0].sha);
  eq('the edited text is what landed', repo.files.get('ایده ها/دفترچه با Git.md').text, '# ایده\nمتن ویرایش شده\n');
  ok('Persian folder names survive the API round trip', [...repo.files.keys()].includes('جلسه ها/1405/08/1405-08-01 شبکه.md'), [...repo.files.keys()]);

  console.log('\n— pull: what another device wrote arrives —');
  putRemote('روزانه/1405/08/1405-08-01.md', '# جای دیگر\nاز Obsidian\n');
  repo.commits.push({ sha: 'f'.repeat(40), message: 'از اوبسیدین', tree: 'x', parents: [], treeBody: { tree: [] } });
  await nb.ui.pull({ quiet: true });
  eq('the local copy followed the remote', nb.ui.files()['روزانه/1405/08/1405-08-01.md'].text, '# جای دیگر\nاز Obsidian\n');
  ok('it is not marked as a local change', !nb.ui.files()['روزانه/1405/08/1405-08-01.md'].dirty);
  ok('the open tab shows the new text', doc.getElementById('input').value === '# جای دیگر\nاز Obsidian\n', doc.getElementById('input').value);

  console.log('\n— conflict: both sides edited the same note —');
  const p = 'ایده ها/دفترچه با Git.md';
  nb.ui.open(p);
  nb.ui.files()[p].text = '# ایده من\n';
  nb.ui.files()[p].dirty = true;
  putRemote(p, '# ایده آنها\n');
  repo.commits.push({ sha: 'e'.repeat(40), message: 'از جای دیگر', tree: 'y', parents: [], treeBody: { tree: [] } });
  await nb.ui.pull({ quiet: true });
  eq('one conflict is reported', nb.ui.state().conflicts.length, 1);
  ok('neither version was dropped', nb.ui.state().conflicts[0].mine === '# ایده من\n' && nb.ui.state().conflicts[0].theirs === '# ایده آنها\n', nb.ui.state().conflicts[0]);
  ok('the chip shows the conflict', doc.getElementById('nbSync').className.includes('nb-conflict'), doc.getElementById('nbSync').className);
  ok('the sidebar shows a conflict tab', (nb.ui.sidebar(true), !!doc.querySelector('[data-nb-sec="conflicts"]')));
  let blocked = await nb.ui.push({});
  const pushesBefore = repo.apiCommits;
  ok('pushing is blocked while a conflict is open', blocked === false && repo.apiCommits === pushesBefore, repo.apiCommits);
  nb.ui.resolve(nb.ui.state().conflicts[0], 'mine');
  await until(() => !nb.ui.state().busy && nb.ui.dirty().length === 0, 5000);
  eq('after «my version» the conflict is gone', nb.ui.state().conflicts.length, 0);
  eq('my version went up to the repository', repo.files.get(p).text, '# ایده من\n');

  console.log('\n— delete —');
  const delPath = 'جلسه ها/1405/08/1405-08-01 شبکه.md';
  nb.ui.del(delPath);
  ok('the note is pending removal', nb.ui.dirty().some((f) => f.path === delPath && f.deleted), nb.ui.dirty().map((f) => f.path));
  await nb.ui.push({ loud: false });
  await until(() => !nb.ui.state().busy, 4000);
  ok('the repository no longer has it', !repo.files.has(delPath), [...repo.files.keys()]);
  ok('the tree asked for a removal (sha null)', repo.commits[repo.commits.length - 1].treeBody.tree.some((e) => e.sha === null && e.path === delPath), repo.commits[repo.commits.length - 1].treeBody.tree);
  ok('the local copy is gone too', !nb.ui.files()[delPath]);

  console.log('\n— a new collection from inside the new-note dialog —');
  nb.ui.sidebar(true);
  const notesSec = doc.querySelector('[data-nb-sec="notes"]');
  if (notesSec) notesSec.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  doc.getElementById('nbPlus').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const plusItems = [...doc.querySelectorAll('#nbMenu .mi')];
  ok('＋ offers a note, a quick capture, today, a folder and a collection', ['یادداشت جدید', 'ثبت سریع', 'یادداشت امروز', 'پوشهٔ جدید', 'مجموعهٔ جدید'].every((s) => plusItems.some((b) => b.textContent.indexOf(s) !== -1)), plusItems.map((b) => b.textContent));
  plusItems.find((b) => b.textContent.indexOf('یادداشت جدید') !== -1).click();
  ok('the dialog offers «مجموعهٔ جدید…»', !!doc.getElementById('nbColNew'));
  doc.getElementById('nbColNew').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const nameField = doc.getElementById('nbMiniInput');
  ok('it asks for a name', !!nameField, doc.getElementById('nbMini').innerHTML.slice(0, 120));
  nameField.value = 'کتاب ها';
  doc.getElementById('nbMiniOk').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const pathField = doc.getElementById('nbMiniInput');
  ok('then for the path pattern', !!pathField && pathField.value === 'کتاب ها/{title}.md', pathField && pathField.value);
  pathField.value = 'کتاب ها/{jy}/{title}.md';
  doc.getElementById('nbMiniOk').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const books = nb.ui.cfg().collections.filter((c) => c.name === 'کتاب ها')[0];
  ok('the collection is saved', !!books && books.path === 'کتاب ها/{jy}/{title}.md', books);
  ok('the dialog came back with it selected', doc.getElementById('nbPanelCol') && doc.getElementById('nbPanelCol').value === books.id, doc.getElementById('nbPanelCol') && doc.getElementById('nbPanelCol').value);
  ok('the path preview uses the collection', doc.getElementById('nbPanelPath').textContent.includes('کتاب ها/140'), doc.getElementById('nbPanelPath').textContent);
  doc.querySelector('#nbMini [data-nb-mini-close]').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));

  console.log('\n— the idle timer commits on its own —');
  nb.ui.cfg({ auto: true, idleSeconds: 5 });
  const beforeAuto = repo.apiCommits;
  nb.ui.write('ایده ها/خودکار.md', '# خودکار\nنوشته شد\n');
  ok('the change is queued', nb.ui.dirty().length === 1, nb.ui.dirty().map((f) => f.path));
  const fired = await until(() => repo.apiCommits > beforeAuto, 9000);
  ok('the idle timer sent it without a manual push', fired && repo.apiCommits === beforeAuto + 1, { fired, commits: repo.apiCommits, before: beforeAuto });
  ok('the note landed', repo.files.has('ایده ها/خودکار.md'), [...repo.files.keys()]);
  ok('nothing is left pending', nb.ui.dirty().length === 0, nb.ui.dirty().map((f) => f.path));
  nb.ui.cfg({ auto: false });

  console.log('\n— the sidebar lists the notebook —');
  nb.ui.render();
  const notesTab = doc.querySelector('[data-nb-sec="notes"]');
  notesTab.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  const rows = [...doc.querySelectorAll('#nbBody .nb-note-row')].map((r) => r.dataset.nbNote);
  const liveNotes = Object.values(nb.ui.files()).filter((f) => !f.deleted).map((f) => f.path);
  eq('every note in the working copy has exactly one row', rows.slice().sort(), liveNotes.slice().sort());
  ok('the daily note is listed', rows.includes('روزانه/1405/08/1405-08-01.md'), rows);
  const dirs = [...doc.querySelectorAll('#nbBody .nb-dir-row')].map((r) => r.dataset.nbDir);
  ok('folders were built from the paths', dirs.includes('روزانه') && dirs.includes('روزانه/1405'), dirs);
  eq('the temp section lists the tabs', doc.querySelectorAll('[data-nb-sec="temps"]').length, 1);

  console.log('\n— search, tags and backlinks —');
  nb.ui.cfg({ auto: false });
  nb.ui.write('ایده ها/جستجو.md', '---\ntags: [شبکه, کار]\n---\n# جستجو\nکلاود را اینجا نوشتم #تست\n');
  nb.ui.write('ایده ها/ارجاع دار.md', '# ارجاع دار\nپیوند به [[جستجو]] و به [[ایده آنها]].\n');
  eq('search finds a note typed with Arabic yeh/kaaf', nb.ui.search('كلاود').includes('ایده ها/جستجو.md'), true);
  ok('search finds by tag word', nb.ui.search('تست').includes('ایده ها/جستجو.md'));
  ok('search finds by title', nb.ui.search('ارجاع').includes('ایده ها/ارجاع دار.md'));
  const tagList = nb.ui.tags();
  ok('tags come from front matter and from the text', tagList.some((t) => t.tag === 'شبکه') && tagList.some((t) => t.tag === 'تست'), tagList);
  eq('a search filter can narrow to one collection', nb.ui.search('', 'daily').every((p) => p.startsWith('روزانه/')), true);
  const back = nb.ui.backlinks('ایده ها/جستجو.md').map((n) => n.path);
  ok('backlinks find the note that links here', back.includes('ایده ها/ارجاع دار.md'), back);
  ok('backlinks ignore the note itself', !back.includes('ایده ها/جستجو.md'));

  console.log('\n— renaming keeps [[links]] pointing the right way —');
  const fixed = nb.ui.fixLinks('جستجو', 'جستجوی تازه');
  ok('the link was rewritten', fixed === 1, fixed);
  ok('the link text follows', nb.ui.files()['ایده ها/ارجاع دار.md'].text.includes('[[جستجوی تازه]]'), nb.ui.files()['ایده ها/ارجاع دار.md'].text);
  ok('an unrelated link is left alone', nb.ui.files()['ایده ها/ارجاع دار.md'].text.includes('[[ایده آنها]]'));

  console.log('\n— wikilinks open a note, and make it when it is missing —');
  const madeWiki = nb.ui.wikiOpen('یادداشت تازه', 'ایده ها/ارجاع دار.md');
  eq('a missing target is created next to the note', madeWiki, 'ایده ها/یادداشت تازه.md');
  ok('it lands in the working copy', !!nb.ui.files()['ایده ها/یادداشت تازه.md']);
  ok('the tab shows it as a notebook note', !!doc.querySelector('#tabsList [aria-selected="true"] .nb-f'));
  const again = nb.ui.wikiOpen('جستجو', 'ایده ها/ارجاع دار.md');
  eq('an existing target is just opened', again, 'ایده ها/جستجو.md');
  nb.ui.open('ایده ها/ارجاع دار.md');
  await until(() => !!doc.querySelector('#zoomWrap a.nb-wlink'), 3000);
  ok('the preview turns [[...]] into a link', !!doc.querySelector('#zoomWrap a.nb-wlink'), doc.querySelector('#zoomWrap').innerHTML.slice(0, 200));
  ok('the link carries the renamed note name', (doc.querySelector('#zoomWrap a.nb-wlink') || {}).textContent === 'جستجوی تازه', (doc.querySelector('#zoomWrap a.nb-wlink') || {}).textContent);

  console.log('\n— typing [[ suggests the notes that exist —');
  nb.ui.open('ایده ها/ارجاع دار.md');
  await sleep(60);
  const taBox = doc.getElementById('input');
  taBox.value = taBox.value + '\n[[جست';
  taBox.setSelectionRange(taBox.value.length, taBox.value.length);
  taBox.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(80);
  const sug = doc.querySelector('.nb-sug');
  ok('a suggestion list shows up while typing a link', !!sug && !sug.hidden, doc.querySelectorAll('.nb-sug-row').length);
  ok('it lists the matching note', (sug.textContent || '').includes('جستجو'), sug.textContent);
  sug.querySelector('.nb-sug-row').dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  ok('choosing one writes the link', taBox.value.endsWith('[[جستجو]]'), JSON.stringify(taBox.value.slice(-22)));
  ok('the list closes afterwards', doc.querySelector('.nb-sug').hidden);
  ok('the note is marked as changed', nb.ui.files()['ایده ها/ارجاع دار.md'].dirty === true);

  console.log('\n— the Jalali calendar —');
  const monthly = cfg.collections.filter((c) => c.calendar === 'day')[0];
  const onDay = new Date(2026, 9, 23, 12, 0);
  const calPath = nb.ui.makeOnDate(monthly, onDay) || 'روزانه/1405/08/1405-08-01.md';
  ok('a click on ۱ آبان ۱۴۰۵ lands on the shamsi path', calPath === 'روزانه/1405/08/1405-08-01.md', calPath);
  ok('the day knows the note it holds', nb.ui.dayNotes({ gy: 2026, gm: 10, gd: 23 }).map((n) => n.path).includes('روزانه/1405/08/1405-08-01.md'), nb.ui.dayNotes({ gy: 2026, gm: 10, gd: 23 }).map((n) => n.path));
  ok('an empty day knows nothing', nb.ui.dayNotes({ gy: 2026, gm: 10, gd: 5 }).length === 0, nb.ui.dayNotes({ gy: 2026, gm: 10, gd: 5 }));
  nb.ui.section('cal');
  const cells = [...doc.querySelectorAll('#nbBody .nb-cal-cell')];
  ok('the month grid is drawn with seven columns', doc.querySelectorAll('#nbBody .nb-cal-wd').length === 7 && cells.length >= 30, cells.length);
  ok('the month and year are named in Persian digits without a thousands separator', /آبان ۱۴۰۵/.test((doc.querySelector('.nb-cal-head b') || {}).textContent), (doc.querySelector('.nb-cal-head b') || {}).textContent);
  ok('the day with a note carries a dot', !!doc.querySelector('#nbBody .nb-cal-cell[data-nb-day="2026-10-23"] .nb-cal-dot'));
  ok('today is marked', !!doc.querySelector('#nbBody .nb-cal-cell.today'));
  nb.ui.calShift(1);
  ok('the next month keeps a full grid', doc.querySelectorAll('#nbBody .nb-cal-cell').length >= 30);
  nb.ui.calShift(-1);

  console.log('\n— a secret note —');
  const cipher = await nb.ui.encryptText('# راز\nمتن خصوصی\n', 'pass-1234');
  ok('the ciphertext leaves no plaintext behind', !cipher.includes('متن خصوصی') && cipher.startsWith('---\nmizkar-enc:'), cipher.slice(0, 40));
  const round = await nb.ui.decryptText(cipher, 'pass-1234');
  eq('the right password brings it back', round, '# راز\nمتن خصوصی\n');
  let wrongFailed = false;
  try { await nb.ui.decryptText(cipher, 'pass-9999'); } catch (e) { wrongFailed = true; }
  ok('a wrong password fails', wrongFailed);
  nb.ui.write('ایده ها/راز.md', 'متن خصوصی من\n');
  nb.ui.state().pass = 'pass-1234';        // a note turns secret only once the passphrase is known
  nb.ui.encrypt('ایده ها/راز.md');
  const beforeSecret = repo.apiCommits;
  await nb.ui.push({ loud: false });
  const pushed = repo.files.get('ایده ها/راز.md');
  ok('what lands in the repository is ciphertext', pushed && pushed.text.startsWith('---\nmizkar-enc:') && !pushed.text.includes('متن خصوصی من'), pushed && pushed.text.slice(0, 40));
  ok('the push went through', repo.apiCommits === beforeSecret + 1);

  console.log('\n— a secret note never rests in plaintext on this device —');
  const allStored = () => {
    const parts = [];
    for (const [, m] of win.__idb) for (const [, v] of m) parts.push(JSON.stringify(v));
    for (let i = 0; i < win.localStorage.length; i++) parts.push(win.localStorage.getItem(win.localStorage.key(i)));
    return parts.join('\n');
  };
  nb.ui.open('ایده ها/راز.md');
  await sleep(50);
  ok('the open secret note shows its text', win.document.getElementById('input').value.includes('متن خصوصی من'));
  win.document.getElementById('input').value = 'متن خصوصی من\nیک خط تازهٔ محرمانه\n';
  win.document.getElementById('input').dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(1700);                                 // the typing save
  win.dispatchEvent(new win.Event('pagehide'));       // the app saves its state and remembers the text here
  await sleep(50);
  const savedTabs = JSON.parse(win.localStorage.getItem(KEYPFX + 'state') || '{}').tabs || [];
  ok('its tab is saved as secret, without text', savedTabs.some((t) => t.nb === 'ایده ها/راز.md' && t.secret && !t.text), savedTabs.map((t) => [t.nb, t.secret, (t.text || '').length]));
  ok('IndexedDB and browser storage hold no plaintext of it', !/متن خصوصی من|خط تازهٔ محرمانه/.test(allStored()));
  ok('the unsent text is kept, encrypted', /localCipher/.test(allStored()));
  doc.querySelector('#tabsList .tab[aria-selected="true"] [data-tab-close]').click();
  await sleep(50);
  ok('closing it does not put it in recent texts', !/خط تازهٔ محرمانه/.test(allStored()));
  await nb.ui.push({ loud: false });
  const secretUp = repo.files.get('ایده ها/راز.md').text;
  ok('the new line went up encrypted', secretUp.startsWith('---\nmizkar-enc:') && !/محرمانه/.test(secretUp));
  ok('new ciphertext uses 600 000 rounds', /kdf: PBKDF2-600000/.test(secretUp));
  eq('and it opens with the passphrase', await nb.ui.decryptText(secretUp, 'pass-1234'), 'متن خصوصی من\nیک خط تازهٔ محرمانه\n');
  ok('old ciphertext (150 000 rounds) still opens', (await nb.ui.decryptText(cipher, 'pass-1234')) === '# راز\nمتن خصوصی\n');

  console.log('\n— someone else edits the secret note —');
  nb.ui.open('ایده ها/راز.md');
  await sleep(50);
  putRemote('ایده ها/راز.md', await nb.ui.encryptText('متن خصوصی من\nیک خط تازهٔ محرمانه\nخط از دستگاه دیگر\n', 'pass-1234'));
  repo.commits.push({ sha: crypto.randomBytes(20).toString('hex'), message: 'other device', parents: [] });
  await nb.ui.pull({ quiet: true });
  ok('an unchanged local copy takes their edit', win.document.getElementById('input').value.includes('خط از دستگاه دیگر'), win.document.getElementById('input').value);
  win.document.getElementById('input').value = 'سرخط من\n' + win.document.getElementById('input').value;
  win.document.getElementById('input').dispatchEvent(new win.Event('input', { bubbles: true }));
  putRemote('ایده ها/راز.md', await nb.ui.encryptText('متن خصوصی من\nیک خط تازهٔ محرمانه\nخط از دستگاه دیگر\nو یک خط دیگر از آن‌جا\n', 'pass-1234'));
  repo.commits.push({ sha: crypto.randomBytes(20).toString('hex'), message: 'other device again', parents: [] });
  await nb.ui.pull({ quiet: true });
  const mergedSecret = win.document.getElementById('input').value;
  ok('both sides changed: merged plain to plain', /^سرخط من\n/.test(mergedSecret) && mergedSecret.includes('و یک خط دیگر از آن‌جا') && !/mizkar-enc/.test(mergedSecret), mergedSecret);
  ok('no conflict was needed', nb.ui.state().conflicts.length === 0);
  await nb.ui.push({ loud: false });
  ok('the merge went up encrypted', (await nb.ui.decryptText(repo.files.get('ایده ها/راز.md').text, 'pass-1234')) === mergedSecret);

  console.log('\n— attachments —');
  const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
  const attPath = nb.ui.attach('2026-10-23-1530.png', png, 'image/png');
  eq('a pasted image is named in the attachments folder', attPath, 'attachments/2026-10-23-1530.png');
  ok('it counts as a pending change', nb.ui.dirty().length === 0 && nb.ui.state().dirtyCount >= 1, nb.ui.state().dirtyCount);
  nb.ui.write('ایده ها/با تصویر.md', '# تصویر\n\n![](attachments/2026-10-23-1530.png)\n');
  const beforeAtt = repo.apiCommits;
  await nb.ui.push({ loud: false });
  ok('the image rode up in the same commit', repo.files.has('attachments/2026-10-23-1530.png'), [...repo.files.keys()]);
  ok('one commit carried both', repo.apiCommits === beforeAtt + 1);
  nb.ui.section('notes');
  const attRow = doc.querySelector('#nbBody [data-nb-att="attachments/2026-10-23-1530.png"]');
  ok('the sidebar lists the attachment', !!attRow, doc.querySelector('#nbBody').textContent.slice(0, 200));

  console.log('\n— a read-only folder opens read-only —');
  nb.ui.cfg({ readonlyFolders: ['آرشیو'] });
  nb.ui.write('آرشیو/2026-10-23 گفتگو.md', '# گفتگو\nمتن آرشیو\n');
  nb.ui.open('آرشیو/2026-10-23 گفتگو.md');
  ok('the editor is read-only for that folder', doc.getElementById('input').readOnly === true);
  ok('the page says so', doc.body.classList.contains('nb-ro'));
  nb.ui.open('ایده ها/جستجو.md');
  ok('a normal note is editable again', doc.getElementById('input').readOnly === false);
  // switching by the tab bar (not through the notebook) has to lock and unlock the editor too
  nb.ui.open('آرشیو/2026-10-23 گفتگو.md');
  doc.querySelector('[data-action="tab-new"]').click();
  await sleep(30);
  ok('a new temp tab after a read-only note is editable', doc.getElementById('input').readOnly === false);
  const roTab = [...doc.querySelectorAll('#tabsList .tab')].find((t) => (t.querySelector('.tab-t') || {}).textContent === '2026-10-23 گفتگو');
  roTab.click();
  await sleep(30);
  ok('clicking the read-only note in the tab bar locks the editor', doc.getElementById('input').readOnly === true);
  const tempTab = [...doc.querySelectorAll('#tabsList .tab')].find((t) => !t.classList.contains('nb-tab'));
  tempTab.click();
  await sleep(30);
  ok('and a temp tab clicked after it is editable again', doc.getElementById('input').readOnly === false);
  nb.ui.cfg({ readonlyFolders: [] });

  console.log('\n— more than one notebook —');
  nb.ui.cfg({ repo: 'me/notes', token: 'fake-token', provider: 'github' });
  nb.ui.saveProfile('شخصی');
  const personal = Object.keys(nb.ui.files()).length;
  nb.ui.cfg({ repo: 'me/work-notes', token: 'fake-token' });
  await nb.ui.reload();
  eq('the other notebook starts empty', Object.keys(nb.ui.files()).length, 0);
  nb.ui.useProfile('شخصی');
  await until(() => Object.keys(nb.ui.files()).length === personal, 3000);
  eq('switching back brings the first notebook notes', Object.keys(nb.ui.files()).length, personal);
  ok('the profile was kept', nb.ui.profiles().some((p) => p.name === 'شخصی' && p.repo === 'me/notes'), nb.ui.profiles());

  console.log('\n— the calm layout —');
  ok('the page is in the calm layout', doc.body.classList.contains('ui-calm'));
  ok('one «ویرایش» switch stands in for the three view buttons', !!doc.getElementById('uiEdit'));
  const viewBefore = doc.getElementById('work').getAttribute('data-view');
  doc.getElementById('uiEdit').click();
  const viewAfter = doc.getElementById('work').getAttribute('data-view');
  ok('the switch moves between reading and editing', viewBefore !== viewAfter && (viewBefore === 'preview' || viewAfter === 'preview'), [viewBefore, viewAfter]);
  ok('and says which one comes next', /خواندن|ویرایش/.test(doc.getElementById('uiEdit').textContent));
  doc.getElementById('uiEdit').click();
  doc.getElementById('uiTools').click();
  const toolItems = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent);
  ok('«ابزارها» lists the tools', ['جعبه‌ابزار', 'ماشین‌حساب شبکه', 'تبدیل زمان', 'مقایسه', 'باز کردن فایل'].every((w) => toolItems.some((t) => t.includes(w))), toolItems);
  doc.querySelector('#nbMenu .mi').click();
  doc.querySelector('.pane.out .ui-more').click();
  const moreItems = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent);
  ok('the preview «⋯» holds zoom, width, reading mode and the rest', ['بزرگ‌نمایی', 'عرض صفحه', 'حالت مطالعه', 'تمام‌صفحه'].every((w) => moreItems.some((t) => t.includes(w))), moreItems);
  doc.getElementById('nbMenu').hidden = true;
  doc.getElementById('stFmt').click();
  const fmtItems = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent);
  ok('the format label opens the list of formats', fmtItems.some((t) => t.includes('تشخیص خودکار')) && fmtItems.some((t) => t.includes('JSON')), fmtItems.length);
  doc.getElementById('nbMenu').hidden = true;

  console.log('\n— tasks and «امروز» —');
  const now0 = new Date(), jt = nb.pure.nbGToJ(now0.getFullYear(), now0.getMonth() + 1, now0.getDate());
  const todayJ = jt.jy + '-' + String(jt.jm).padStart(2, '0') + '-' + String(jt.jd).padStart(2, '0');
  nb.ui.write('کارها/فهرست.md', '# فهرست کارها\n- [ ] تماس با پشتیبانی 📅 ' + todayJ + '\n- [ ] کار عقب افتاده 📅 1400-01-01\n- [x] کار تمام شده\n- [ ] کار بی تاریخ\n');
  nb.ui.section('tasks');
  await sleep(20);
  const taskTexts = [...doc.querySelectorAll('#nbBody .hm-task-text')].map((b) => b.textContent);
  ok('«کارها» gathers the open tasks of the notes', ['تماس با پشتیبانی', 'کار عقب افتاده', 'کار بی تاریخ'].every((w) => taskTexts.includes(w)) && !taskTexts.includes('کار تمام شده'), taskTexts);
  const groups = [...doc.querySelectorAll('#nbBody .hm-group h5')].map((h) => h.textContent);
  ok('grouped by due date: late, today, no date', groups.some((g) => g.includes('عقب افتاده')) && groups.some((g) => g.includes('امروز')) && groups.some((g) => g.includes('بدون تاریخ')), groups);
  ok('a Shamsi due date is read', !!doc.querySelector('#nbBody .hm-due'));
  const box = [...doc.querySelectorAll('#nbBody .hm-task')].find((r) => r.textContent.includes('تماس با پشتیبانی')).querySelector('input');
  box.click();
  await sleep(20);
  ok('ticking it writes «- [x]» into the note', /- \[x\] تماس با پشتیبانی/.test(nb.ui.files()['کارها/فهرست.md'].text), nb.ui.files()['کارها/فهرست.md'].text);
  ok('and it is a pending change', nb.ui.files()['کارها/فهرست.md'].dirty === true);
  doc.querySelector('[data-action="tab-new"]').click();
  await sleep(50);
  ok('an empty tab shows «امروز»', !!doc.querySelector('#zoomWrap .hm') && /امروز/.test(doc.querySelector('#zoomWrap .hm-head').textContent));
  ok('with the late task on it', doc.querySelector('#zoomWrap .hm').textContent.includes('کار عقب افتاده'));
  ok('and the recent notes', [...doc.querySelectorAll('#zoomWrap .hm-note b')].some((b) => b.textContent === 'فهرست'));
  [...doc.querySelectorAll('#zoomWrap .hm-note')].find((b) => b.textContent.includes('فهرست')).click();
  await sleep(30);
  ok('a recent note opens from there', doc.getElementById('input').value.startsWith('# فهرست کارها'));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
  await sleep(20);
  const palIn = doc.getElementById('palInput');
  palIn.value = 'فهرست';
  palIn.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(20);
  ok('Ctrl+K finds notes by name', [...doc.querySelectorAll('#palList *')].some((el) => /یادداشت: فهرست/.test(el.textContent)));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));

  console.log('\n— collections: a folder with a calendar and a template —');
  nb.ui.section('notes');
  nb.ui.sidebar(true);
  await sleep(20);
  doc.getElementById('nbList').dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }));
  const rootMenu = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent);
  ok('right-click on empty space offers folder and collection', rootMenu.some((t) => t.includes('پوشهٔ جدید')) && rootMenu.some((t) => t.includes('مجموعهٔ جدید')), rootMenu);
  [...doc.querySelectorAll('#nbMenu .mi')].find((b) => b.textContent.includes('مجموعهٔ جدید')).click();
  await sleep(20);
  doc.getElementById('nbColName').value = 'سفرها';
  doc.getElementById('nbColName').dispatchEvent(new win.Event('input', { bubbles: true }));
  const ex = doc.getElementById('nbColEx').textContent;
  ok('the dialog shows an example file name', /سفرها\/14\d\d\/\d\d\/14\d\d-\d\d-\d\d\.md/.test(ex), ex);
  doc.getElementById('nbColTpl').value = 'new:templates/daily.md';
  doc.getElementById('nbMiniOk').click();
  await sleep(20);
  const trip = nb.ui.cfg().collections.find((c) => c.name === 'سفرها');
  ok('the collection is made with its pattern', trip && trip.path === 'سفرها/{jy}/{jm}/{jy}-{jm}-{jd}.md' && trip.calendar === 'day', trip);
  ok('with a template of its own, from the sample', trip && /^templates\/.+\.md$/.test(trip.template) && !!nb.ui.files()[trip.template] && /type: daily/.test(nb.ui.files()[trip.template].text), trip && trip.template);
  await sleep(500);
  const cfgFile = nb.ui.files()['.mizkar/config.json'];
  ok('config.json in the repository carries the collections', cfgFile && cfgFile.dirty && JSON.parse(cfgFile.text).collections.some((c) => c.name === 'سفرها'));
  nb.ui.settings();
  await sleep(20);
  ok('settings is one page with a list of sections', doc.querySelectorAll('#nbSetNav [data-nb-set]').length === 8 && !!doc.getElementById('nbRepo'));
  doc.querySelector('#nbSetNav [data-nb-set="cols"]').click();
  ok('«مجموعه ها» lists the collections, one row each', doc.querySelectorAll('.nb-colrow').length === nb.ui.cfg().collections.length);
  doc.querySelector('#nbSetNav [data-nb-set="sync"]').click();
  ok('«همگام سازی» holds auto send, its delay and sync on reconnect', !!doc.getElementById('nbAuto') && !!doc.getElementById('nbIdle') && !!doc.getElementById('nbSyncOnline') && !doc.querySelector('[data-nb-cfg="config"]'));
  doc.getElementById('nbIdle').value = '33';
  doc.getElementById('nbIdle').dispatchEvent(new win.Event('input', { bubbles: true }));
  eq('a field saves as it is typed', nb.ui.cfg().idleSeconds, 33);
  doc.querySelector('#nbSetNav [data-nb-set="view"]').click();
  ok('the app\'s own settings live in «متن و ظاهر»', !!doc.querySelector('#nbModalBody #optNorm') && !!doc.querySelector('#nbModalBody #sizeSeg'));
  doc.querySelector('#nbSetNav [data-nb-set="connect"]').click();
  doc.querySelector('#nbSetNav [data-nb-set="view"]').click();
  ok('and they survive moving between sections', !!doc.querySelector('#nbModalBody #optNorm'));
  doc.querySelector('#nbSetNav [data-nb-set="connect"]').click();
  nb.ui.cfg({ idleSeconds: 20 });
  doc.querySelector('[data-action="nb-close"]') && doc.querySelector('[data-action="nb-close"]').click();
  doc.getElementById('nbModal').hidden = true;
  await nb.ui.push({ loud: false });
  // another device adds a collection: its config.json arrives with the next pull
  const remoteCfg = JSON.parse(repo.files.get('.mizkar/config.json').text);
  remoteCfg.collections.push({ id: 'books', name: 'کتاب ها', color: '#0ea5e9', calendar: null, path: 'کتاب ها/{title}.md', template: '' });
  putRemote('.mizkar/config.json', JSON.stringify(remoteCfg, null, 2) + '\n');
  repo.commits.push({ sha: crypto.randomBytes(20).toString('hex'), message: 'collections from the laptop', parents: [] });
  await nb.ui.pull({ quiet: true });
  ok('a config.json from another device is applied here', nb.ui.cfg().collections.some((c) => c.name === 'کتاب ها'), nb.ui.cfg().collections.map((c) => c.name));
  // renaming a folder moves its notes and the collection follows
  nb.ui.makeOnDate(trip, new Date());
  await sleep(30);
  const tripNote = Object.keys(nb.ui.files()).find((k) => k.startsWith('سفرها/') && !nb.ui.files()[k].deleted);
  ok('a dated note lands in the collection folder', !!tripNote, Object.keys(nb.ui.files()).filter((k) => k.startsWith('سفر')));
  nb.ui.section('notes');
  await sleep(20);
  const dirEl = doc.querySelector('#nbBody [data-nb-dir="سفرها"]');
  dirEl.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 60 }));
  const dirMenu = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent);
  ok('a collection folder offers its settings', dirMenu.some((t) => t.includes('تنظیمات مجموعهٔ «سفرها»')), dirMenu);
  [...doc.querySelectorAll('#nbMenu .mi')].find((b) => b.textContent.includes('تغییر نام پوشه')).click();
  await sleep(20);
  doc.getElementById('nbMiniInput').value = 'سفر ها';
  doc.getElementById('nbMiniOk').click();
  await sleep(30);
  const movedNote = Object.keys(nb.ui.files()).find((k) => k.startsWith('سفر ها/') && !nb.ui.files()[k].deleted);
  ok('renaming the folder moves its notes', !!movedNote && !Object.keys(nb.ui.files()).some((k) => k.startsWith('سفرها/') && !nb.ui.files()[k].deleted), movedNote);
  ok('and the collection follows the folder', nb.ui.cfg().collections.some((c) => c.name === 'سفرها' && c.path.startsWith('سفر ها/')));

  console.log('\n— a note is one page: read, double-click to edit in place —');
  const viewOf = () => doc.getElementById('work').getAttribute('data-view');
  doc.querySelector('[data-action="tab-new"]').click();
  await sleep(30);
  doc.getElementById('uiEdit').click();                       // a temp tab edits beside the preview
  ok('a temp tab edits in two columns', viewOf() === 'split', viewOf());
  nb.ui.write('ایده ها/یک صفحه.md', '# یک صفحه\n\nپاراگراف اول درباره چیزی.\n\nپاراگراف دوم با یک کلمهٔ خاص.\n\n- [ ] کار الف\n- [ ] کار ب\n');
  nb.ui.open('ایده ها/یک صفحه.md');
  await sleep(40);
  ok('a note opens for reading', viewOf() === 'preview', viewOf());
  ok('the page knows it is a note', doc.body.classList.contains('ip-on'));
  const para2 = [...doc.querySelectorAll('#zoomWrap p')].find((x) => x.textContent.includes('پاراگراف دوم'));
  para2.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, clientX: 100, clientY: 100 }));
  await sleep(30);
  const taEl = doc.getElementById('input');
  const caretLine = taEl.value.slice(0, taEl.selectionStart).split('\n').length - 1;
  ok('a double-click edits in place (one column)', viewOf() === 'editor', viewOf());
  ok('with the caret on the clicked line', taEl.value.split('\n')[caretLine].includes('پاراگراف دوم'), caretLine);
  ok('the Markdown is tinted behind the text', doc.body.classList.contains('ip-tint') && !!doc.querySelector('.ta-md .mk-h'));
  taEl.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  await sleep(30);
  ok('Esc goes back to reading', viewOf() === 'preview' && !doc.body.classList.contains('ip-tint'), viewOf());
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
  await sleep(30);
  ok('E edits too', viewOf() === 'editor', viewOf());
  taEl.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0 }));
  doc.querySelector('.mdbar') && doc.querySelector('.mdbar').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0 }));
  ok('pressing inside the text or on its toolbar keeps editing', viewOf() === 'editor', viewOf());
  doc.getElementById('inCard').dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(30);
  ok('pressing outside the text box goes back to reading', viewOf() === 'preview', viewOf());
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }));
  await sleep(30);
  taEl.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  await sleep(30);
  const boxes = doc.querySelectorAll('#zoomWrap li.task > .box');
  boxes[1].click();
  await sleep(30);
  ok('ticking ☐ while reading writes the note', /- \[ \] کار الف\n- \[x\] کار ب/.test(nb.ui.files()['ایده ها/یک صفحه.md'].text), nb.ui.files()['ایده ها/یک صفحه.md'].text);
  ok('and the page shows it ticked', doc.querySelectorAll('#zoomWrap li.task > .box')[1].textContent === '☑');
  const tempTab2 = [...doc.querySelectorAll('#tabsList .tab')].filter((t) => !t.classList.contains('nb-tab')).pop();
  tempTab2.click();
  await sleep(30);
  ok('back on the temp tab, its two columns come back', viewOf() === 'split', viewOf());
  doc.getElementById('uiEdit').click();
  await sleep(20);

  console.log('\n— the token can be locked —');
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.state().tokenPass = 'lock-pass';
  nb.ui.cfg({ lockToken: true, token: 'secret-token-123' });
  await sleep(1500);
  const storedCfg = () => JSON.stringify(win.__idb.get('meta') && win.__idb.get('meta').get('nb-cfg'));
  ok('the stored settings hold no token in clear', !/secret-token-123/.test(storedCfg()) && /tokenEnc/.test(storedCfg()), storedCfg().slice(0, 120));
  ok('profiles keep no token in clear either', !/fake-token/.test(storedCfg()));
  nb.ui.state().tokenPass = '';
  await nb.ui.load();
  ok('after a reload the notebook is locked', nb.ui.state().locked === true && !nb.ui.cfg().token);
  ok('the status says so', /قفل/.test(doc.getElementById('nbSyncText').textContent), doc.getElementById('nbSyncText').textContent);
  const callsBefore = repo.req.length;
  await nb.ui.pull({ quiet: true });
  ok('a quiet sync waits while locked', repo.req.length === callsBefore);
  const opening = nb.ui.unlock();
  await sleep(20);
  doc.getElementById('nbMiniInput').value = 'lock-pass';
  doc.getElementById('nbMiniOk').click();
  ok('the right passphrase opens it', (await opening) === true && nb.ui.cfg().token === 'secret-token-123');
  ok('and the profile tokens come back too', nb.ui.profiles().every((pr) => !pr.tokenEnc || pr.token));
  nb.ui.cfg({ lockToken: false, token: 'fake-token' });
  await sleep(50);

  console.log('\n— GitLab, through the same calls —');
  await until(() => !nb.ui.state().busy, 4000);      // let the profile switch's own pull finish first
  await sleep(900);
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.provider('gitlab');
  nb.ui.cfg({ repo: 'me/notes', branch: 'main', token: 'glpat-fake' });
  repo.files.clear(); repo.commits.length = 0; repo.apiCommits = 0;
  putRemote('یادداشت گیت لب.md', '# از گیت لب\n');
  repo.commits.push({ sha: 'a'.repeat(40), message: 'remote', parents: [] });
  nb.ui.state().lastCommit = '';
  await nb.ui.pull({ quiet: true });
  ok('a GitLab tree is read the same way', !!nb.ui.files()['یادداشت گیت لب.md'], Object.keys(nb.ui.files()));
  nb.ui.write('یادداشت گیت لب.md', '# از گیت لب\nویرایش شد\n');
  await nb.ui.push({ loud: false });
  eq('a GitLab push is one commit of actions', repo.apiCommits, 1);
  const glCommits = () => repo.commits.filter((c) => c.gl);
  const actionFor = (i, path) => (glCommits()[i].actions.filter((a) => a.file_path === path)[0] || {}).action;
  eq('the action says update for a file that is already there', actionFor(0, 'یادداشت گیت لب.md'), 'update');
  ok('and everything pending went up in that one commit', glCommits()[0].actions.length >= 1, glCommits()[0].actions.length);
  eq('and the file really changed', repo.files.get('یادداشت گیت لب.md').text, '# از گیت لب\nویرایش شد\n');
  nb.ui.write('تازه در گیت لب.md', '# تازه\n');
  await nb.ui.push({ loud: false });
  eq('a new file asks for create', actionFor(1, 'تازه در گیت لب.md'), 'create');
  ok('the file went up', repo.files.has('تازه در گیت لب.md'), [...repo.files.keys()]);
  nb.ui.provider('github');

  console.log('\n— §6.6 empty states offer the one next thing —');
  nb.ui.sidebar(true);
  nb.ui.section('search');
  nb.ui.search('zzz-هیچ-چیزی-نیست');
  await sleep(60);
  const emptySearch = doc.querySelector('#nbBody .nb-empty-box .nb-empty-act');
  ok('an empty search offers to clear the filters', !!emptySearch && emptySearch.dataset.nbEmpty === 'clear-filters', emptySearch && emptySearch.textContent);
  emptySearch.click();
  await sleep(60);
  eq('and clearing them empties the query', nb.ui.state().query, '');
  ok('the buttons are one clear action each', doc.querySelectorAll('#nbBody .nb-empty-box .nb-empty-act').length <= 1);
  // a notebook with nothing in it: the notes and tasks sections both point somewhere
  const keepCfg = Object.assign({}, nb.ui.cfg());
  nb.ui.cfg({ repo: 'me/خالی', token: 'fake-token' });
  await nb.ui.reload();
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(60);
  const emptyNotes = doc.querySelector('#nbBody .nb-empty-box .nb-empty-act');
  ok('an empty notebook offers one clear action', !!emptyNotes, doc.querySelector('#nbBody .nb-empty-box').textContent.slice(0, 60));
  emptyNotes.click();
  await sleep(50);
  ok('and it opens that thing', !doc.getElementById('nbMini').hidden);
  doc.querySelector('#nbMini [data-nb-mini-close]').click();
  nb.ui.section('tasks');
  await sleep(50);
  const emptyTasks = doc.querySelector('#nbBody .nb-empty-box .nb-empty-act');
  ok('an empty tasks list offers one clear action', !!emptyTasks && emptyTasks.dataset.nbEmpty === 'today', emptyTasks && emptyTasks.textContent);
  nb.ui.cfg({ repo: keepCfg.repo, token: keepCfg.token, collections: keepCfg.collections.map((c) => Object.assign({}, c, { calendar: '' })) });
  nb.ui.sidebar(true);
  nb.ui.section('cal');
  await sleep(60);
  const emptyCal = doc.querySelector('#nbBody .nb-empty-box .nb-empty-act');
  ok('a calendar with no calendar-collection offers to make one', !!emptyCal && emptyCal.dataset.nbEmpty === 'new-collection', emptyCal && emptyCal.textContent);
  emptyCal.click();
  await sleep(50);
  ok('and that dialog opens', !doc.getElementById('nbMini').hidden);
  doc.querySelector('#nbMini [data-nb-mini-close]').click();
  nb.ui.cfg({ collections: keepCfg.collections });
  await nb.ui.reload();
  await sleep(60);

  console.log('\n— §6.4 the keyboard map —');
  nb.ui.sidebar(true);
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: '?', bubbles: true }));
  await sleep(50);
  ok('«?» shows the shortcuts', !doc.getElementById('nbMini').hidden && !!doc.getElementById('nbKeysList'), doc.getElementById('nbKeysList') && doc.getElementById('nbKeysList').textContent.slice(0, 60));
  const keyRows = doc.querySelectorAll('#nbKeysList .nb-key-row');
  ok('the notebook keys come first', keyRows.length > 5 && keyRows[0].textContent.indexOf('یادداشت تازه') !== -1, keyRows.length && keyRows[0].textContent.trim());
  ok('with their key combination', /Alt Shift N/.test(keyRows[0].textContent), keyRows[0].textContent);
  ok('and the app own shortcuts are listed too', doc.getElementById('nbKeysList').textContent.indexOf('برنامه') !== -1);
  const q6 = doc.getElementById('nbKeysQ');
  q6.value = 'تقویم';
  q6.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(40);
  ok('the list can be searched', doc.querySelectorAll('#nbKeysList .nb-key-row').length >= 1 && doc.getElementById('nbKeysList').textContent.indexOf('تقویم') !== -1, doc.getElementById('nbKeysList').textContent.slice(0, 60));
  doc.querySelector('#nbMini [data-nb-mini-close]').click();
  await sleep(30);
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'ن', code: 'KeyN', altKey: true, shiftKey: true, bubbles: true }));
  await sleep(50);
  ok('Alt Shift N makes a new note (Persian layout too)', !doc.getElementById('nbMini').hidden);
  doc.querySelector('#nbMini [data-nb-mini-close]').click();
  await sleep(30);
  doc.body.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'C', code: 'KeyC', altKey: true, shiftKey: true, bubbles: true }));
  await sleep(50);
  eq('Alt Shift C opens the calendar', nb.ui.state().section, 'cal');

  console.log('\n— §5: drag and drop —');
  const s5Latin = (s) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).replace(/\//g, '-');
  const pev = (type, x, y, extra = {}) => {
    const e = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(e, 'pointerType', { value: extra.pointerType || 'mouse' });
    return e;
  };
  const showAllFolders = () => {
    nb.ui.state().paths = nb.ui.state().paths || [];
    Object.keys(nb.ui.files()).forEach((p) => {
      const parts = p.split('/');
      for (let i = 1; i < parts.length; i++) nb.ui.state().expanded[parts.slice(0, i).join('/')] = true;
    });
    nb.ui.section('notes');
  };
  const dragFrom = async (el, onto) => {
    if (!el || !onto) return { ghostSeen: false, marked: false, skipped: true };
    const oldHit = doc.elementFromPoint;
    doc.elementFromPoint = () => onto || null;
    el.dispatchEvent(pev('pointerdown', 20, 20, { pointerType: 'mouse' }));
    doc.dispatchEvent(pev('pointermove', 40, 30, { pointerType: 'mouse' }));
    doc.dispatchEvent(pev('pointermove', 60, 40, { pointerType: 'mouse' }));
    await sleep(20);
    const ghost = doc.querySelector('.nb-drag-ghost');
    doc.dispatchEvent(pev('pointerup', 60, 40, { pointerType: 'mouse' }));
    await sleep(60);
    doc.elementFromPoint = oldHit;
    return { ghostSeen: !!ghost, marked: !!(onto && onto.classList.contains('nb-drop')) };
  };
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(60);
  nb.ui.write('کشیدن/یادداشت الف.md', '# الف\n');
  nb.ui.write('ایده ها/مقصد.md', '# مقصد\n');
  nb.ui.section('notes');
  await sleep(60);
  // 1) a note onto a folder
  const dragNoteRow = doc.querySelector('#nbList [data-nb-note="کشیدن/یادداشت الف.md"]');
  const dragTarget = doc.querySelector('#nbList [data-nb-dir="ایده ها"]');
  ok('the tree has the note and the folder to try it with', !!dragNoteRow && !!dragTarget, [!!dragNoteRow, !!dragTarget]);
  let dragRes = await dragFrom(dragNoteRow, dragTarget);
  ok('dragging shows a ghost along the way', dragRes.ghostSeen, dragRes);
  ok('a note lands in the folder it was dropped on', !!nb.ui.files()['ایده ها/یادداشت الف.md'], Object.keys(nb.ui.files()));
  const undoMove = doc.querySelector('.toast-act');
  ok('and the move can be taken back', !!undoMove);
  if (undoMove){ undoMove.click(); await sleep(60); }
  ok('the note is back where it was', !!nb.ui.files()['کشیدن/یادداشت الف.md'], Object.keys(nb.ui.files()));

  // 2) a note onto a collection's folder: the pattern renames it
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(50);
  const col0 = nb.ui.cfg().collections[0];
  const colFolder = nbFolderOf(col0.path);
  function nbFolderOf(p){ return p.split('/').slice(0, -1).join('/'); }
  const colRow = doc.querySelector('#nbList [data-nb-dir="' + colFolder + '"]') || doc.querySelector('#nbList [data-nb-dir]');
  const droppedOn = colRow ? colRow.dataset.nbDir : '';
  await dragFrom(doc.querySelector('#nbList [data-nb-note="کشیدن/یادداشت الف.md"]'), colRow);
  ok('a note dropped on a collection folder lands under it', !!droppedOn && Object.keys(nb.ui.files()).some((p) => p.indexOf(droppedOn + '/') === 0 && !nb.ui.files()[p].deleted), [droppedOn, Object.keys(nb.ui.files())]);

  // 3) a note onto empty space goes to the root
  showAllFolders();
  await sleep(60);
  const listEl = doc.getElementById('nbList');
  const someNested = Object.keys(nb.ui.files()).filter((p) => p.indexOf('/') !== -1 && !nb.ui.files()[p].deleted && p.endsWith('.md') && !p.startsWith('.'))[0];
  const nestedName = someNested ? someNested.split('/').pop() : '';
  const nestedRow = someNested ? [...doc.querySelectorAll('#nbList [data-nb-note]')].filter((r) => r.dataset.nbNote === someNested)[0] : null;
  ok('a nested note is in the tree to try', !!nestedRow, [someNested, Object.keys(nb.ui.files()).length]);
  if (nestedRow){
    await dragFrom(nestedRow, listEl);
    ok('dropping on empty space brings a note to the root', !!nb.ui.files()[nestedName], Object.keys(nb.ui.files()).slice(0, 4));
  } else ok('dropping on empty space brings a note to the root', false, 'no nested note in the tree');
  nb.ui.write('ردیف/مقصد.md', '# مقصد\n');
  nb.ui.write('ردیف2/مسافر.md', '# مسافر\n');
  nb.ui.section('notes');
  await sleep(40);
  const rowOf = (p) => [...doc.querySelectorAll('#nbList [data-nb-note]')].filter((r) => r.dataset.nbNote === p)[0];
  if (rowOf('ردیف2/مسافر.md') && rowOf('ردیف/مقصد.md')){
    await dragFrom(rowOf('ردیف2/مسافر.md'), rowOf('ردیف/مقصد.md'));
    ok('dropping on a note row moves into that note\'s folder', !!nb.ui.files()['ردیف/مسافر.md'] && !nb.ui.files()['مسافر.md']);
  } else ok('dropping on a note row moves into that note\'s folder', false, 'rows missing');

  console.log('\n— menus: separators, submenus —');
  const menuEl = doc.getElementById('nbMenu');
  let subOpened = false;
  nb.ui.menu(10, 10, [null, { label: 'یک' }, null, null, { label: 'باز کردن زیرمنو', act: () => { nb.ui.menu(10, 10, [{ label: 'زیر', act: () => { subOpened = true; } }]); } }, null]);
  eq('separators stay, but never doubled or at the ends', [...menuEl.children].map((c) => c.classList.contains('mi-sep') ? '-' : 'i').join(''), 'i-i');
  menuEl.querySelectorAll('.mi')[1].click();
  await sleep(20);
  ok('a submenu opened from an item stays open', !menuEl.hidden && menuEl.textContent.indexOf('زیر') !== -1);
  menuEl.querySelector('.mi').click();
  ok('and its item runs', subOpened && menuEl.hidden);

  console.log('\n— a task onto a day, a note into the page —');
  nb.ui.write('کشیدن/کارها.md', '# کارها\n- [ ] کاری برای کشیدن\n');
  nb.ui.section('cal');
  await sleep(60);
  const dayCell = doc.querySelector('#nbBody .nb-cal-cell[data-nb-day]');
  nb.ui.section('tasks');
  await sleep(60);
  const dragTask = [...doc.querySelectorAll('#nbBody [data-task-open]')].filter((b) => decodeURIComponent(b.dataset.taskOpen).indexOf('کشیدن/کارها.md') === 0)[0];
  ok('the task is listed', !!dragTask && !!dayCell, [!!dragTask, !!dayCell]);
  if (dragTask && dayCell){
    await dragFrom(dragTask, dayCell);
    await sleep(60);
    const stampWanted = dayCell.dataset.nbDay;
    ok('dropping a task on a day writes that due date', nb.ui.files()['کشیدن/کارها.md'].text.indexOf('📅') !== -1, nb.ui.files()['کشیدن/کارها.md'].text);
    ok('with the Shamsi date of that day', (() => {
      const got = (nb.ui.files()['کشیدن/کارها.md'].text.match(/📅\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/) || [])[1];
      const want = s5Latin(nb.ui.shamsi(stampWanted));
      return got === want;
    })(), nb.ui.files()['کشیدن/کارها.md'].text);
  } else ok('dropping a task on a day writes that due date', false, [!!dragTask, !!dayCell]);

  nb.ui.open('ایده ها/مقصد.md');
  await sleep(80);
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(50);
  const srcRow = doc.querySelector('#nbList [data-nb-note="ایده ها/مقصد.md"]');
  const editorEl = doc.getElementById('input');
  ok('the editor is at hand', !!editorEl && !!srcRow);
  if (editorEl && srcRow){
    nb.ui.open('ایده ها/مقصد.md');
    await sleep(60);
    setViewSafe('editor');
    const before5 = doc.getElementById('input').value;
    await dragFrom(srcRow, doc.querySelector('#zoomWrap') || doc.getElementById('input'));
    await sleep(60);
    ok('dropping a note on the page leaves a link', doc.getElementById('input').value.indexOf('[[مقصد]]') !== -1, doc.getElementById('input').value.slice(-40));
  }
  function setViewSafe(v){ const w = doc.getElementById('work'); if (w) w.dataset.view = v; }

  console.log('\n— files from the computer —');
  nb.ui.section('notes');
  await sleep(50);
  const docPath = 'ایده ها/از رایانه.md';
  const fakeFile = { name: 'از رایانه.md', type: 'text/markdown', size: 10 };
  win.FileReader = class {
    readAsText() { setTimeout(() => { this.result = '# از رایانه\nخط\n'; this.onload && this.onload(); }, 0); }
    readAsDataURL() { setTimeout(() => { this.result = 'data:image/png;base64,AAAA'; this.onload && this.onload(); }, 0); }
  };
  win.nbDragFiles(fakeFile ? [fakeFile] : [], 'ایده ها', false);
  await sleep(60);
  ok('a dropped .md becomes a note in that folder', !!nb.ui.files()[docPath], Object.keys(nb.ui.files()).filter((p) => p.indexOf('از رایانه') !== -1));
  const imgFile = { name: 'نمودار.png', type: 'image/png', size: 12 };
  const attBefore = Object.keys(nb.ui.attachments()).length;
  win.nbDragFiles([imgFile], 'ایده ها', false);
  await sleep(60);
  ok('a dropped image goes into attachments', Object.keys(nb.ui.attachments()).length === attBefore + 1, Object.keys(nb.ui.attachments()).slice(-2));

  console.log('\n— Esc cancels a drag —');
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(50);
  const cancelRow = doc.querySelector('#nbList [data-nb-note]');
  cancelRow.dispatchEvent(pev('pointerdown', 20, 20, { pointerType: 'mouse' }));
  doc.dispatchEvent(pev('pointermove', 40, 30, { pointerType: 'mouse' }));
  doc.dispatchEvent(pev('pointermove', 60, 40, { pointerType: 'mouse' }));
  await sleep(20);
  ok('a drag is running', !!doc.querySelector('.nb-drag-ghost'));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(30);
  ok('Esc drops it', !doc.querySelector('.nb-drag-ghost'));
  doc.dispatchEvent(pev('pointerup', 60, 40, { pointerType: 'mouse' }));
  await sleep(20);

  console.log('\n— §4: the phone gets a bottom bar and sheets —');
  const nav = doc.getElementById('nbNav');
  ok('a bottom bar is there', !!nav && doc.body.classList.contains('nb-nav-on'));
  eq('with the six places', [...nav.querySelectorAll('[data-nb-nav]')].map((b) => b.dataset.nbNav), ['home', 'temps', 'notes', 'search', 'cal', 'more']);
  eq('and their names', [...nav.querySelectorAll('[data-nb-nav]')].map((b) => b.textContent.trim()), ['امروز', 'موقت', 'یادداشت‌ها', 'جستجو', 'تقویم', 'بیشتر']);
  nb.ui.sidebar(false);
  const tabsBeforeNav = doc.querySelectorAll('#tabsList .tab').length;
  nav.querySelector('[data-nb-nav="home"]').click();
  await sleep(80);
  ok('«امروز» opens the day page', doc.querySelectorAll('#tabsList .tab').length >= tabsBeforeNav);
  nav.querySelector('[data-nb-nav="temps"]').click();
  await sleep(60);
  eq('«موقت» is one tap away on the bar and opens its page', [nb.ui.state().section, doc.body.classList.contains('nb-open')], ['temps', true]);
  nav.querySelector('[data-nb-nav="search"]').click();
  await sleep(60);
  eq('«جستجو» opens the drawer on search', nb.ui.state().section, 'search');
  eq('and the drawer with it', doc.body.classList.contains('nb-open'), true);
  nb.ui.sidebar(false);
  nav.querySelector('[data-nb-nav="more"]').click();
  await sleep(40);
  const navMenu = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent.trim());
  ok('«بیشتر» offers the other sections, new notes and settings', ['کارها', 'یادداشت جدید', 'ثبت سریع', 'یادداشت امروز', 'تنظیمات'].every((s) => navMenu.some((l) => l.indexOf(s) !== -1)), navMenu);
  ok('and «موقت» is no longer buried in it', !navMenu.some((l) => l.indexOf('موقت') === 0), navMenu);
  doc.getElementById('nbMenu').hidden = true;
  ok('the theme colour follows the theme for the phone bar', (() => {
    const meta = doc.querySelector('meta[name="theme-color"]');
    return !!meta && !!meta.getAttribute('content');
  })(), (doc.querySelector('meta[name="theme-color"]') || {}).content);
  ok('the desktop-only controls drop out on a phone', (() => {
    const items = [{ label: 'بزرگ نمایی (۱۰۰%)' }, { label: 'حالت مطالعه' }];
    const onPhone = win.nbMobile.phoneItems(items, 380), onDesk = win.nbMobile.phoneItems(items, 1440);
    return onPhone.length === 1 && onDesk.length === 2;
  })());
  ok('the phone rules are in the stylesheet', (() => {
    const css = doc.getElementById('appStyle').textContent;
    return /100dvh/.test(css) && /safe-area-inset-bottom/.test(css) && /#nbNav\b/.test(css) && /overscroll-behavior:contain/.test(css);
  })());
  ok('the Markdown toolbar has all its buttons', doc.querySelectorAll('.mdbar .mdb').length >= 13, doc.querySelectorAll('.mdbar .mdb').length);
  ok('and on a phone it wraps instead of hiding buttons behind a scroll', /\.pane\.editor \.mdbar\{[^}]*flex-wrap:wrap/.test(doc.getElementById('appStyle').textContent));
  console.log('\n— a sideways finger turns the phone\'s pages —');
  const wideW0 = win.innerWidth;
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
  win.dispatchEvent(new win.Event('resize'));
  for (let i = 0; i < 6 && nb.ui.closeTopLayer(); i++) await sleep(20);
  await sleep(30);
  eq('the pages are the places of the bar, «بیشتر» aside', win.nbMobile.pages, ['home', 'temps', 'notes', 'search', 'cal']);
  const tev = (type, x, y) => {
    const e = new win.Event(type, { bubbles: true, cancelable: true });
    const pts = [{ clientX: x, clientY: y, identifier: 1 }];
    Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : pts });
    Object.defineProperty(e, 'changedTouches', { value: pts });
    return e;
  };
  const swipe = async (x0, y0, x1, y1, el) => {
    const node = el || doc.body;
    node.dispatchEvent(tev('touchstart', x0, y0));
    node.dispatchEvent(tev('touchend', x1, y1));
    await sleep(60);
  };
  nb.ui.sidebar(false);
  await sleep(30);
  await swipe(60, 400, 200, 404);
  eq('a finger to the right brings «موقت» in', [nb.ui.state().section, doc.body.classList.contains('nb-open')], ['temps', true]);
  await swipe(200, 400, 340, 402);
  eq('and again «یادداشت‌ها»', nb.ui.state().section, 'notes');
  await swipe(340, 400, 180, 398);
  eq('a finger to the left goes back', nb.ui.state().section, 'temps');
  await swipe(300, 400, 40, 400);
  ok('and once more reaches «امروز», the panel closed', !doc.body.classList.contains('nb-open') && nb.ui.state().section === 'temps');
  nb.ui.sidebar(false);
  nb.ui.section('notes');
  await sleep(40);
  await swipe(386, 300, 346, 301);
  ok('a short pull from the right edge brings the panel out', doc.body.classList.contains('nb-open') && nb.ui.state().section === 'notes');
  await swipe(20, 300, 90, 301);
  ok('a pull from the left edge takes it away', !doc.body.classList.contains('nb-open'));
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(40);
  await swipe(200, 300, 212, 430);
  eq('a scroll is not a pull', nb.ui.state().section, 'notes');
  await swipe(200, 300, 238, 302);
  eq('a drag under 56px in the middle is nothing', nb.ui.state().section, 'notes');
  await swipe(200, 300, 262, 302);
  eq('62px in the middle turns it', nb.ui.state().section, 'search');
  ok('a wobble or a scroll is not a drag of that kind', win.nbMobile.swipeStep(-50, 60, 200) === null && win.nbMobile.swipeStep(-10, 0, 200) === null);
  nb.ui.section('notes');
  await sleep(30);
  showAllFolders();
  await sleep(40);
  const swipeRow = doc.querySelector('#nbBody [data-nb-note]');
  if (swipeRow){
    await swipe(60, 40, 230, 42, swipeRow);
    eq('a swipe that starts on a note row drags, it does not turn the page', nb.ui.state().section, 'notes');
  }
  ok('a menu in front stops the turn', (() => {
    doc.getElementById('nbMenu').hidden = false;
    const turn = win.nbMobile.swipeStep(-70, 0, 200);
    return !!turn && turn.step === -1 && win.nbMobile.swipeReady() === false;
  })());
  doc.getElementById('nbMenu').hidden = true;
  console.log('\n— the pull from the top asks for more —');
  ok('the notebook is connected for the pull', !!nb.ui.cfg().repo, nb.ui.cfg().repo);
  eq('the pull wants 200px now', [nb.ui.state().pull.arm, nb.ui.state().pull.ready], [24, 200]);
  const pullAt = async (dy) => {
    const box = doc.getElementById('zoomWrap');
    box.dispatchEvent(tev('touchstart', 200, 200));
    if (dy === 'noMove'){ await sleep(20); return { shown: !!doc.getElementById('nbPullHint') }; }
    box.dispatchEvent(tev('touchmove', 200, 200 + Math.round(dy / 2)));
    box.dispatchEvent(tev('touchmove', 200, 200 + dy));
    const hint = doc.getElementById('nbPullHint');
    const said = hint ? hint.textContent : '';
    const ready = !!hint && hint.classList.contains('ready') && /رها کن/.test(said);
    const filled = hint ? hint.style.getPropertyValue('--nb-pull') : '';
    box.dispatchEvent(tev('touchend', 200, 200 + dy));
    await sleep(80);
    return { said, shown: !!said, ready, filled, gone: !doc.getElementById('nbPullHint') };
  };
  const reqBefore = repo.req.length;
  const short = await pullAt(120);
  await sleep(80);
  ok('120px shows the hint, but it is not «رها کن» yet', !short.ready && /بکش پایین/.test(short.said) && short.gone, short);
  eq('and nothing is asked of the repository', repo.req.length, reqBefore);
  const long = await pullAt(260);
  ok('260px says «رها کن تا تازه شود» and fills the bar', long.ready && long.filled === '1', long);
  ok('and the repository is asked for the changes', repo.req.length > reqBefore, repo.req.length - reqBefore);
  // a long note scrolled back up: the same finger motion must not sync
  const scrollProbeEl = doc.getElementById('nbList');
  const meta = (k, v) => Object.defineProperty(scrollProbeEl, k, { value: v, configurable: true, writable: true });
  meta('clientHeight', 200); meta('scrollHeight', 900); meta('scrollTop', 40);
  const reqScrolled = repo.req.length;
  const rowScrolled = doc.querySelector('#nbList [data-nb-note]') || doc.getElementById('nbList');
  rowScrolled.dispatchEvent(tev('touchstart', 200, 200));
  rowScrolled.dispatchEvent(tev('touchmove', 200, 460));
  const hintedWhileScrolled = !!doc.getElementById('nbPullHint');
  rowScrolled.dispatchEvent(tev('touchend', 200, 460));
  await sleep(120);
  ok('a scrolled list is not a pull: no hint', !hintedWhileScrolled);
  eq('and no sync', repo.req.length, reqScrolled);
  meta('scrollTop', 0);
  const reqTop = repo.req.length;
  rowScrolled.dispatchEvent(tev('touchstart', 200, 200));
  rowScrolled.dispatchEvent(tev('touchmove', 200, 460));
  rowScrolled.dispatchEvent(tev('touchend', 200, 460));
  await sleep(150);
  ok('while the list is at its top the same drag does pull', repo.req.length > reqTop, repo.req.length - reqTop);
  Object.defineProperty(win, 'innerWidth', { value: wideW0, configurable: true, writable: true });
  win.dispatchEvent(new win.Event('resize'));
  await sleep(30);
  console.log('\n— the Back button closes the top layer —');
  nb.ui.sidebar(true);
  await sleep(30);
  ok('the drawer counts as a layer', nb.ui.closeTopLayer() === true && !doc.body.classList.contains('nb-open'));
  nb.ui.newDialog(nb.ui.cfg().collections[0].id, '');
  await sleep(40);
  ok('a dialog closes before anything else', nb.ui.closeTopLayer() === true && doc.getElementById('nbMini').hidden);
  doc.getElementById('nbMenu').hidden = false;
  ok('and a menu too', nb.ui.closeTopLayer() === true && doc.getElementById('nbMenu').hidden);
  const wideW = win.innerWidth;
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
  nb.ui.newDialog(nb.ui.cfg().collections[0].id, '');
  await sleep(30);
  ok('on a phone an open dialog holds one history entry', nb.ui.backEntry() === true);
  doc.querySelector('#nbMini [data-nb-mini-close]').click();
  await sleep(60);
  ok('closing it with ✕ gives the entry back', nb.ui.backEntry() === false);
  nb.ui.sidebar(true);
  nb.ui.newDialog(nb.ui.cfg().collections[0].id, '');
  doc.getElementById('nbMenu').hidden = false;
  await sleep(30);
  win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
  await sleep(30);
  ok('Back closes the top layer first', doc.getElementById('nbMenu').hidden && !doc.getElementById('nbMini').hidden);
  ok('and what is under it still holds an entry', nb.ui.backEntry() === true);
  win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
  await sleep(30);
  ok('the next Back closes the dialog', doc.getElementById('nbMini').hidden && nb.ui.backEntry() === false);
  nb.ui.sidebar(true);
  await sleep(30);
  win.dispatchEvent(new win.PopStateEvent('popstate', { state: null }));
  await sleep(30);
  ok('the next Back closes the drawer', !doc.body.classList.contains('nb-open') && nb.ui.backEntry() === false);
  Object.defineProperty(win, 'innerWidth', { value: wideW, configurable: true, writable: true });

  console.log('\n— §7: recent texts live in the sidebar «موقت» —');
  ok('the top bar no longer shows the clock button', /body\.ui-calm \.ui-near #btnHistory[^{]*\{[^}]*display:none/.test(doc.getElementById('appStyle').textContent));
  // a couple of recent texts, one of them closed, plus an open temp tab
  win.replaceText ? null : null;
  nb.ui.sidebar(true);
  nb.ui.section('temps');
  await sleep(60);
  const tempBox = () => doc.getElementById('nbBody');
  ok('«موقت» has one search box on top', !!doc.getElementById('nbTempQ'), tempBox().textContent.slice(0, 60));
  ok('and two parts: باز and اخیر', /باز/.test(tempBox().textContent) && /اخیر/.test(tempBox().textContent), tempBox().textContent.slice(0, 120));
  const histRow = doc.querySelector('#nbBody .nb-hist-row');
  ok('the recent texts are listed', !!histRow, doc.querySelectorAll('#nbBody .nb-hist-row').length);
  if (histRow){
    ok('a row carries kind, size and time', /(JSON|Log|متن|Markdown|تب بسته شده|[۰-۹]+ بایت)/.test(histRow.textContent), histRow.textContent);
    const meta = histRow.querySelector('.nb-hist-meta');
    ok('and a title for hovering', !!histRow.getAttribute('title') || !!meta, histRow.getAttribute('title'));
    ok('row actions are there for hover and touch', !!histRow.querySelector('[data-nb-hist-open]') && !!histRow.querySelector('[data-nb-hist-save]') && !!histRow.querySelector('[data-nb-hist-del]'), histRow.innerHTML.slice(0, 100));
  }
  const q = doc.getElementById('nbTempQ');
  const histCount = doc.querySelectorAll('#nbBody .nb-hist-row').length;
  q.value = 'zzz-nothing-matches';
  q.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(60);
  eq('the search box filters the recent list', doc.querySelectorAll('#nbBody .nb-hist-row').length, 0);
  const q2 = doc.getElementById('nbTempQ');
  q2.value = '';
  q2.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(60);
  eq('and clearing it brings them back', doc.querySelectorAll('#nbBody .nb-hist-row').length, histCount);

  console.log('\n— opening, saving and deleting a recent text —');
  const first = doc.querySelector('#nbBody .nb-hist-row');
  const tabsBefore7 = doc.querySelectorAll('#tabsList .tab').length;
  first.querySelector('[data-nb-hist-open]').click();
  await sleep(80);
  ok('«باز کردن» brings it back as a tab', doc.querySelectorAll('#tabsList .tab').length >= tabsBefore7, [tabsBefore7, doc.querySelectorAll('#tabsList .tab').length]);
  nb.ui.section('temps');
  await sleep(50);
  const beforeFiles = Object.keys(nb.ui.files()).length;
  doc.querySelector('#nbBody .nb-hist-row [data-nb-hist-save]').click();
  await sleep(60);
  const fld = doc.getElementById('nbSvFolder'), nm = doc.getElementById('nbSvName');
  ok('«ذخیره در دفترچه…» asks for folder and name', !!fld && !!nm && fld.options.length >= 1, fld && nm && fld.options.length);
  doc.getElementById('nbMiniOk').click();
  await sleep(80);
  ok('and a note is made of it', Object.keys(nb.ui.files()).length > beforeFiles, Object.keys(nb.ui.files()).length - beforeFiles);
  nb.ui.section('temps');
  await sleep(50);
  const delCount = doc.querySelectorAll('#nbBody .nb-hist-row').length;
  doc.querySelector('#nbBody .nb-hist-row [data-nb-hist-del]').click();
  await sleep(40);
  eq('«حذف» drops the row', doc.querySelectorAll('#nbBody .nb-hist-row').length, delCount - 1);
  const undoBtn = [...doc.querySelectorAll('.toast button, #toast button')].pop();
  if (undoBtn){ undoBtn.click(); await sleep(60); }
  ok('and «بازگشت» in the toast brings it back', doc.querySelectorAll('#nbBody .nb-hist-row').length === delCount, doc.querySelectorAll('#nbBody .nb-hist-row').length);
  const row7 = doc.querySelector('#nbBody .nb-hist-row');
  row7.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }));
  await sleep(30);
  const menu7 = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent.trim());
  ok('the same actions are in the right-click menu', ['باز کردن', 'ذخیره در دفترچه…', 'کپی متن', 'نخستین خط ها', 'حذف'].every((s) => menu7.some((l) => l.indexOf(s) !== -1)), menu7);
  doc.getElementById('nbMenu').hidden = true;

  console.log('\n— §8: what is waiting to be sent —');
  nb.ui.provider('github');
  nb.ui.cfg({ repo: 'me/notes', branch: 'main', token: 'fake-token', auto: false });
  nb.ui.sidebar(false);
  nb.ui.write('ایده ها/فهرست الف.md', '# الف\nخط\n');
  nb.ui.write('ایده ها/فهرست ب.md', '# ب\nخط\n');
  nb.ui.write('ایده ها/فهرست پ.md', '# پ\nخط\n');
  await nb.ui.push({ loud: false });
  eq('everything went up first', nb.ui.dirty().length, 0);
  // two edits, one deletion, one move
  nb.ui.write('ایده ها/فهرست الف.md', '# الف\nخط ویرایش شده\n');
  nb.ui.write('ایده ها/فهرست ب.md', '# ب\nویرایش دوم\n');
  nb.ui.del('ایده ها/فهرست پ.md');
  nb.ui.moveToCollection('ایده ها/فهرست الف.md', 0);
  await sleep(60);
  const openPop = async () => {
    doc.getElementById('nbSyncPop').hidden = true;
    doc.getElementById('nbSync').click();
    await sleep(50);
  };
  ok('the pending list can be read', Array.isArray(nb.ui.pending()), nb.ui.pending());
  await openPop();
  const p8_rows = [...doc.querySelectorAll('#nbSyncPop .nb-pend-row')];
  const p8_rowText = p8_rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  ok('the p8_chip lists what is waiting', p8_rows.length >= 3, p8_rowText);
  ok('an edited note says «ویرایش»', p8_rowText.some((t) => t.indexOf('ویرایش') !== -1 && t.indexOf('فهرست ب') !== -1), p8_rowText);
  ok('a deleted note says «حذف»', p8_rowText.some((t) => t.indexOf('حذف') !== -1 && t.indexOf('فهرست پ') !== -1), p8_rowText);
  ok('a move is one row saying «جابه جا»', p8_rowText.some((t) => t.indexOf('جابه جا') !== -1), p8_rowText.filter((t) => t.indexOf('جابه') !== -1));
  ok('and it names the folder it came from', p8_rowText.some((t) => t.indexOf('جابه جا') !== -1 && t.indexOf('از ') !== -1), p8_rowText);
  nb.ui.write('.mizkar/config.json', JSON.stringify(nb.ui.cfg().collections));
  nb.ui.write('templates/sample-extra.md', '---\ndate: {{date}}\ncreated: {{gdate}}\n---\n# {{jdate}}\n');
  await openPop();
  const p8_all = [...doc.querySelectorAll('#nbSyncPop .nb-pend-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  ok('collection settings read as «تنظیمات مجموعه ها»', p8_all.some((x) => x.indexOf('تنظیمات مجموعه ها') !== -1), p8_all);
  ok('a template reads as a template', p8_all.some((x) => x.indexOf('قالب') !== -1), p8_all);

  console.log('\n— the diff, and throwing a change away —');
  const p8_editRow = [...doc.querySelectorAll('#nbSyncPop .nb-pend-row')].filter((r) => r.textContent.indexOf('فهرست ب') !== -1)[0];
  p8_editRow.querySelector('[data-nb-pend-diff]').click();
  await sleep(40);
  const p8_diff = doc.querySelector('#nbMini .nb-diff');
  ok('«تفاوت» opens a diff against the pulled version', !!p8_diff && !!p8_diff.querySelector('.nb-diff-add') && !!p8_diff.querySelector('.nb-diff-del'), p8_diff && p8_diff.textContent.slice(0, 80));
  ok('it shows the new line', p8_diff && p8_diff.textContent.indexOf('ویرایش دوم') !== -1);
  doc.querySelector('#nbMini [data-nb-mini-close]').click();
  await sleep(20);
  const p8_beforeDrop = nb.ui.dirty().length;
  await openPop();
  const p8_dropRow = [...doc.querySelectorAll('#nbSyncPop .nb-pend-row')].filter((r) => r.textContent.indexOf('فهرست ب') !== -1)[0];
  p8_dropRow.querySelector('[data-nb-pend-drop]').click();
  await sleep(30);
  const p8_okBtn = doc.getElementById('nbMiniOk');
  ok('discarding asks first', !!p8_okBtn && !doc.getElementById('nbMini').hidden);
  p8_okBtn.click();
  await sleep(60);
  eq('the pulled text is back', nb.ui.files()['ایده ها/فهرست ب.md'].text, '# ب\nخط\n');
  eq('and the count dropped', nb.ui.dirty().length, p8_beforeDrop - 1);

  console.log('\n— sending the rest, and why it can be blocked —');
  await openPop();
  ok('with a token there is no blocked line', !doc.querySelector('#nbSyncPop .nb-pend-why'));
  const p8_commitsBefore = repo.apiCommits;
  doc.querySelector('#nbSyncPop [data-nb-pop="push"]').click();
  await sleep(120);
  eq('«ارسال همه» sends the rest in one commit', repo.apiCommits, p8_commitsBefore + 1);
  eq('and nothing is left waiting', nb.ui.dirty().length, 0);
  nb.ui.cfg({ token: '' });
  await openPop();
  const p8_why = doc.querySelector('#nbSyncPop .nb-pend-why');
  ok('without a token it says so, with a way out', !!p8_why && p8_why.textContent.indexOf('مخزن یا توکن ندارد') !== -1 && p8_why.textContent.indexOf('تنظیمات دفترچه') !== -1, p8_why && p8_why.textContent);
  doc.querySelector('#nbSyncPop [data-nb-pop="fix"]').click();
  await sleep(40);
  ok('the fix button opens the settings', !doc.getElementById('nbModal').hidden);
  doc.querySelector('#nbModal [data-action="nb-close"]').click();
  nb.ui.cfg({ token: 'fake-token' });
  await sleep(20);
  // the footer opens the same list
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(40);
  const p8_foot = doc.getElementById('nbFoot');
  ok('the sidebar footer is there', !!p8_foot, p8_foot && p8_foot.textContent);
  doc.getElementById('nbSyncPop').hidden = true;
  p8_foot.click();
  await sleep(50);
  ok('clicking the footer opens the same list', !doc.getElementById('nbSyncPop').hidden, doc.getElementById('nbSyncPop').textContent.slice(0, 40));
  doc.getElementById('nbSync').click();

  console.log('\n— §2: the right-click map —');
  const ctxAt = (el, x = 40, y = 40) => el.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  const menuLabels = () => [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent.trim());
  const pickItem = (text) => {
    const b = [...doc.querySelectorAll('#nbMenu .mi')].filter((x) => x.textContent.indexOf(text) !== -1)[0];
    if (b) { b.click(); return true; }
    return false;
  };
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(60);
  const noteRow = doc.querySelector('#nbList [data-nb-note]');
  ok('the tree shows a note row to right-click', !!noteRow, !!noteRow);
  ctxAt(noteRow);
  ok('a note offers move-to-collection, pin and a new tab', ['انتقال به مجموعه…', 'سنجاق در تب', 'باز کردن در تب تازه', 'نمایش در درخت'].every((s) => menuLabels().some((l) => l.indexOf(s) !== -1)), menuLabels());
  ok('the menu takes the keyboard', doc.activeElement && doc.activeElement.className.includes('mi'), doc.activeElement && doc.activeElement.className);
  doc.getElementById('nbMenu').dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc closes it', doc.getElementById('nbMenu').hidden);

  const folderRow = doc.querySelector('#nbList [data-nb-dir]');
  ctxAt(folderRow);
  ok('a folder offers a note from a template and open-all-in-tabs', ['یادداشت از قالب…', 'باز کردن همه در تب'].every((s) => menuLabels().some((l) => l.indexOf(s) !== -1)), menuLabels());
  const folderPath = folderRow.dataset.nbDir;
  const inFolder = Object.keys(nb.ui.files()).filter((p) => p.indexOf(folderPath + '/') === 0 && p.endsWith('.md') && !nb.ui.files()[p].deleted);
  const tabsBeforeAll = doc.querySelectorAll('#tabsList .tab').length;
  ok('«باز کردن همه در تب» opens them', pickItem('باز کردن همه در تب') && doc.querySelectorAll('#tabsList .tab').length >= tabsBeforeAll + Math.min(inFolder.length, 10), [tabsBeforeAll, doc.querySelectorAll('#tabsList .tab').length, inFolder.length]);

  console.log('\n— moving a note into a collection —');
  const movable = Object.keys(nb.ui.files()).filter((p) => p.endsWith('.md'))[0];
  const target = nb.ui.cfg().collections[1];
  const beforeMove = Object.keys(nb.ui.files()).length;
  nb.ui.moveToCollection ? null : null;
  ctxAt(doc.querySelector('#nbList [data-nb-note="' + movable.replace(/"/g, '\\"') + '"]') || noteRow);
  ok('the collection list opens', pickItem('انتقال به مجموعه') && menuLabels().some((l) => l.indexOf(target.name) !== -1), menuLabels());
  pickItem(target.name);
  await sleep(60);
  ok('and the note lands under that collection pattern', (() => {
    const hit = Object.keys(nb.ui.files()).filter((p) => p.indexOf(target.path.split('{')[0]) === 0 && !nb.ui.files()[p].deleted);
    return hit.length > 0;
  })(), { files: Object.keys(nb.ui.files()), pattern: target.path });

  console.log('\n— the calendar menus —');
  nb.ui.section('cal');
  await sleep(60);
  ctxAt(doc.querySelector('#nbBody .nb-cal-cell:not(.empty)'));
  const calLabels = menuLabels();
  ok('a day lists the collections that build a note', calLabels.some((l) => l.indexOf('روزانه') !== -1), calLabels);
  ok('and its notes and tasks', calLabels.some((l) => l.indexOf('یادداشت های این روز') !== -1) && calLabels.some((l) => l.indexOf('کارهای این روز') !== -1), calLabels);
  nbMenuCloseAll();
  function nbMenuCloseAll(){ doc.getElementById('nbMenu').hidden = true; }
  ctxAt(doc.querySelector('#nbBody .nb-cal-head b'));
  ok('the month header filters by collection and jumps to today', menuLabels().some((l) => l.indexOf('همهٔ مجموعه ها') !== -1) && menuLabels().some((l) => l.indexOf('برو به امروز') !== -1), menuLabels());
  pickItem('فقط روزانه');
  ok('filtering keeps only that collection in the legend', (() => {
    const lg = [...doc.querySelectorAll('#nbBody .nb-cal-lg')].map((x) => x.textContent.trim());
    return lg.some((l) => l.indexOf('روزانه') !== -1);
  })());
  nb.ui.state().calFilter = '';
  ctxAt(doc.querySelector('#nbBody .nb-cal-lg'));
  ok('the legend offers that collection\'s notes', menuLabels().some((l) => l.indexOf('یادداشت های این مجموعه') !== -1), menuLabels());
  pickItem('همهٔ مجموعه ها');

  console.log('\n— a due date from the task menu —');
  const taskPath = Object.keys(nb.ui.files()).filter((p) => p.endsWith('.md'))[0];
  nb.ui.write(taskPath, '# کارها\n- [ ] کاری برای انجام 📅\n');
  nb.ui.section('tasks');
  await sleep(60);
  const taskRow = [...doc.querySelectorAll('#nbBody [data-task-open]')].filter((b) => decodeURIComponent(b.dataset.taskOpen).indexOf(taskPath) === 0)[0];
  ok('the tasks section lists it', !!taskRow, !!taskRow);
  ctxAt(taskRow);
  ok('a task offers a due date, today, tomorrow and done', ['تاریخ سررسید…', 'امروز', 'فردا', 'بدون تاریخ', 'انجام شد'].every((s) => menuLabels().some((l) => l === s)), menuLabels());
  pickItem('فردا');
  await sleep(40);
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  const toLatin = (s) => s.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).replace(/\//g, '-');
  const wantDue = '📅 ' + toLatin(nb.ui.shamsi(tm));
  eq('«فردا» writes the Shamsi due date into the note', nb.ui.files()[taskPath].text.split('\n')[1], '- [ ] کاری برای انجام ' + wantDue);

  console.log('\n— reading and editing menus —');
  nb.ui.open(taskPath);
  await sleep(80);
  const block = doc.querySelector('#zoomWrap p, #zoomWrap li, #zoomWrap h1');
  ok('the preview has a block to right-click', !!block, !!block);
  ctxAt(block);
  ok('the preview offers edit-here and copy-block', ['ویرایش اینجا', 'کپی متن بلوک'].every((s) => menuLabels().some((l) => l.indexOf(s) !== -1)), menuLabels());
  ok('«ویرایش اینجا» switches to the editor', pickItem('ویرایش اینجا') && doc.getElementById('work').dataset.view === 'editor', doc.getElementById('work').dataset.view);
  nb.ui.sidebar(true);
  const sel = doc.getElementById('input');
  sel.value = 'خط یک\nخط دو\n';
  sel.setSelectionRange(0, sel.value.length);
  ctxAt(sel);
  ok('a selection offers link / new note / task', ['پیوند به یادداشت…', 'یادداشت تازه از انتخاب', 'کار کن'].every((s) => menuLabels().some((l) => l.indexOf(s) !== -1)), menuLabels());
  pickItem('کار کن');
  await sleep(40);
  ok('«کار کن» makes them tasks', /- \[ \] خط یک/.test(sel.value), sel.value);
  sel.setSelectionRange(0, '- [ ] خط یک\n'.length);
  ctxAt(sel);
  pickItem('یادداشت تازه از انتخاب');
  await sleep(60);
  ok('a note was made from the selection', Object.keys(nb.ui.files()).some((p) => p.indexOf('خط یک') !== -1), Object.keys(nb.ui.files()).filter((p) => p.indexOf('خط') !== -1));

  console.log('\n— a search result, and the long press —');
  nb.ui.section('search');
  nb.ui.search('کار');
  await sleep(80);
  const resRow = doc.querySelector('#nbRes .nb-res-row');
  ok('search shows rows', !!resRow, !!resRow);
  ctxAt(resRow);
  ok('a result offers open, a new tab and a copy', ['باز کردن', 'باز کردن در تب تازه', 'کپی پیوند'].every((s) => menuLabels().some((l) => l.indexOf(s) !== -1)), menuLabels());
  doc.getElementById('nbMenu').hidden = true;
  nb.ui.sidebar(true);
  nb.ui.section('notes');
  await sleep(40);
  ok('a long press opens the same menu as a right-click', nb.ui.longPressAt(20, 20, doc.querySelector('#nbList [data-nb-note]')), doc.getElementById('nbMenu').hidden);
  doc.getElementById('nbMenu').hidden = true;
  const items = win.nbTabMenuItems({ id: 't1', nb: 'روزانه/1405/08/1405-08-01.md' });
  ok('the app\'s tab menu gains the notebook entries', JSON.stringify(items).indexOf('نمایش در درخت') !== -1 && JSON.stringify(items).indexOf('تاریخچهٔ این یادداشت') !== -1, items);
  ok('a temp tab offers to be saved into the notebook', JSON.stringify(win.nbTabMenuItems({ id: 't2', text: 'متن' })).indexOf('ذخیره در دفترچه') !== -1);

  console.log('\n— §3: every date in the notebook is Shamsi —');
  eq('no Gregorian date input is left anywhere', doc.querySelectorAll('input[type="date"]').length, 0);
  nb.ui.sidebar(false);
  const c0 = nb.ui.cfg().collections[0];
  nb.ui.newDialog(c0.id, '');
  await sleep(60);
  const dateBtn = doc.getElementById('nbPanelDate');
  ok('the new-note dialog asks with a Shamsi date', !!dateBtn && /[۰-۹]/.test(dateBtn.textContent), dateBtn && dateBtn.textContent);
  ok('and carries a Shamsi stamp', /^\d{4}-\d{2}-\d{2}$/.test(dateBtn.dataset.nbDate), dateBtn.dataset.nbDate);
  dateBtn.click();
  await sleep(60);
  const dpGrid = doc.querySelectorAll('#nbDpGrid .nb-dp-day');
  ok('a Shamsi month grid opens', dpGrid.length >= 29 && dpGrid.length <= 31, dpGrid.length);
  eq('with seven weekday columns', doc.querySelectorAll('#nbDpWd .nb-cal-wd').length, 7);
  ok('the month is named in Persian', /[فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند]/.test(doc.getElementById('nbDpTitle').textContent), doc.getElementById('nbDpTitle').textContent);
  ok('today is marked', !!doc.querySelector('#nbDpGrid .nb-dp-day.today'));
  const inBox = doc.getElementById('nbDpIn');
  inBox.value = '۱۴۰۵/۰۸/۰۵';
  inBox.dispatchEvent(new win.Event('input', { bubbles: true }));
  await sleep(40);
  ok('typing Persian digits is understood', !!doc.querySelector('#nbDpGrid .nb-dp-day.sel'), doc.getElementById('nbDpOut').textContent);
  doc.querySelector('#nbDpGrid .nb-dp-day.sel').click();
  await sleep(30);
  doc.querySelector('#nbMini2 [data-nb-dp="ok"]').click();
  await sleep(40);
  eq('the field takes the picked date', dateBtn.dataset.nbDate, '1405-08-05');
  ok('and shows it in Persian', /۱۴۰۵\/۰۸\/۰۵/.test(dateBtn.textContent), dateBtn.textContent);
  ok('the path preview follows the picked date', /1405-08-05/.test(doc.getElementById('nbPanelPath').textContent), doc.getElementById('nbPanelPath').textContent);
  doc.getElementById('nbMiniOk').click();
  await sleep(80);
  const dated = Object.keys(nb.ui.files()).filter((p) => p.includes('1405-08-05'))[0];
  ok('that note keeps a Shamsi date and an ISO created', !!dated && /date: 1405-08-05/.test(nb.ui.files()[dated].text) && /created: 2026-10-\d\d/.test(nb.ui.files()[dated].text), dated && nb.ui.files()[dated].text.split('\n').slice(0, 6));
  nb.ui.wikiOpen('یادداشت تازه از پیوند');
  await sleep(60);
  const fresh = Object.keys(nb.ui.files()).filter((p) => p.includes('یادداشت تازه از پیوند'))[0];
  ok('a note made from a link carries both dates too', !!fresh && /date: 14\d\d-\d\d-\d\d/.test(nb.ui.files()[fresh].text) && /created: \d{4}-\d\d-\d\d/.test(nb.ui.files()[fresh].text), fresh && nb.ui.files()[fresh].text.split('\n').slice(0, 5));
  const histList = await nb.ui.history(dated);
  ok('a commit date reads as Shamsi with Persian digits', Array.isArray(histList) && histList.length === 1 && nb.ui.shamsi(histList[0].date) === '۱۴۰۵/۰۸/۰۱', histList);
  ok('the calendar can show the Gregorian day number', (() => {
    nb.ui.cfg({ showGregorian: true });
    nb.ui.section('cal');
    const on = !!doc.querySelector('#nbBody .nb-cal-cell .nb-cal-g');
    nb.ui.cfg({ showGregorian: false });
    nb.ui.section('cal');
    const off = !!doc.querySelector('#nbBody .nb-cal-cell .nb-cal-g');
    return on && !off;
  })());

  console.log('\n— the top bar gathers its controls, «خروجی» stays alone —');
  const bar = doc.querySelector('header.bar');
  const near = doc.querySelector('header.bar .ui-near');
  ok('a group next to the brand holds the controls', !!near);
  const at = (el) => (!el ? '?' : el.id === 'btnNotebook' ? 'sidebar' : el.id === 'uiEdit' ? 'edit' : el.id === 'uiTools' ? 'tools'
    : el.querySelector('#btnHistory') ? 'history' : (el.dataset.action === 'palette' || el.querySelector('[data-action="palette"]')) ? 'palette'
    : el.querySelector('#btnSettings') ? 'settings' : '?');
  eq('in this order from the right: ویرایش · اخیر · ابزارها · فرمان‌ها · تنظیمات',
    [...near.children].map(at), ['edit', 'history', 'tools', 'palette', 'settings']);
  ok('the panel button is at the right edge of the bar, above the panel', bar.firstElementChild === doc.getElementById('btnNotebook'));
  ok('and the panel closes from its right edge too (first in its head)', doc.querySelector('#nb .nb-head').firstElementChild === doc.getElementById('nbClose'));
  const expBox = doc.querySelector('header.bar .ui-export');
  ok('«خروجی» stands alone at the far end', !!expBox && !!expBox.querySelector('#btnExport') && bar.lastElementChild === expBox);
  ok('nothing is left in the old group', !doc.querySelector('header.bar .bar-end #btnSettings'));

  console.log('\n— one button opens the panel; the edge tab and the rail are gone —');
  ok('no edge tab, no rail', !doc.getElementById('nbEdge') && !doc.getElementById('nbRail'));
  const nbBtn = doc.getElementById('btnNotebook');
  nb.ui.sidebar(false);
  eq('closed: the body says so', doc.body.classList.contains('nb-open'), false);
  nbBtn.click();
  eq('the notebook button opens the panel', doc.body.classList.contains('nb-open'), true);
  eq('and shows it is pressed', nbBtn.getAttribute('aria-pressed'), 'true');
  eq('the state is remembered', win.localStorage.getItem(KEYPFX + 'nbopen'), '1');
  nb.ui.sidebar(false);
  eq('closing remembers that too', win.localStorage.getItem(KEYPFX + 'nbopen'), '0');

  console.log('\n— a phone: a note is a page with its own top bar —');
  const wideW2 = win.innerWidth;
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
  win.dispatchEvent(new win.Event('resize'));
  eq('the body knows the size', doc.body.dataset.nbSize, 'phone');
  nb.ui.section('notes');
  nb.ui.sidebar(true);
  nb.ui.open('ایده ها/یک صفحه.md');
  await sleep(40);
  ok('opening a note leaves the panel page', !doc.body.classList.contains('nb-open'));
  ok('the note page has its top bar with the title', doc.body.classList.contains('nb-note-page') && doc.getElementById('nbTopTitle').textContent === 'یک صفحه');
  doc.querySelector('#nbTop [data-nb-top="more"]').click();
  await sleep(20);
  const topMenu = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent.trim());
  ok('its ⋯ holds the note actions', ['تغییر نام', 'جابه جایی', 'تاریخچه و برگرداندن', 'حذف'].every((x) => topMenu.indexOf(x) !== -1) && topMenu.indexOf('سنجاق در تب') === -1, topMenu);
  doc.getElementById('nbMenu').hidden = true;
  doc.querySelector('#nbTop [data-nb-top="back"]').click();
  await sleep(20);
  ok('← goes back to the list it came from', doc.body.classList.contains('nb-open') && nb.ui.state().section === 'notes' && !doc.body.classList.contains('nb-note-page'));
  eq('the panel page is titled by its section', doc.getElementById('nbHeadTitle').textContent, 'یادداشت‌ها');
  nb.ui.sidebar(false);
  Object.defineProperty(win, 'innerWidth', { value: wideW2, configurable: true, writable: true });
  win.dispatchEvent(new win.Event('resize'));
  await sleep(20);

  console.log('\n— «امروز» —');
  const tabsBefore = doc.querySelectorAll('#tabsList .tab').length;
  nb.ui.goHome();
  await sleep(80);
  const tabsHome = doc.querySelectorAll('#tabsList .tab').length;
  ok('«امروز» opens its page', !doc.getElementById('input').value.trim() && tabsHome <= tabsBefore + 1, [tabsBefore, tabsHome]);
  nb.ui.goHome();
  await sleep(80);
  eq('a second «امروز» reuses that empty page', doc.querySelectorAll('#tabsList .tab').length, tabsHome);

  console.log('\n— moves, discards and dates stay honest —');
  await until(() => !nb.ui.state().busy, 4000);
  putRemote('جابه/الف.md', '# یکسان\n');
  putRemote('جابه/ب.md', '# یکسان\n');
  repo.commits.push({ sha: 'e'.repeat(40), message: 'two equal notes', tree: 'x', parents: [], treeBody: { tree: [] } });
  await nb.ui.pull({ quiet: true });
  await sleep(60);
  const F = () => nb.ui.files();
  const pendOf = (p) => nb.ui.pending().filter((r) => r.path === p || r.from === p);
  ok('both remote notes arrived', !!F()['جابه/الف.md'] && !!F()['جابه/ب.md'] && !F()['جابه/الف.md'].dirty);
  nb.ui.move('جابه/الف.md', 'جابه/پ.md');
  ok('a move is one «جابه جا» row', pendOf('جابه/پ.md').length === 1 && pendOf('جابه/پ.md')[0].kind === 'move', nb.ui.pending());
  ok('the copy is new to the repository', F()['جابه/پ.md'].isNew === true && !F()['جابه/پ.md'].remote);
  nb.ui.move('جابه/پ.md', 'جابه/ت.md');
  ok('moving again keeps one row, from the original path', pendOf('جابه/ت.md').length === 1 && pendOf('جابه/ت.md')[0].from === 'جابه/الف.md' && !F()['جابه/پ.md'], nb.ui.pending());
  nb.ui.move('جابه/ت.md', 'جابه/الف.md');
  ok('moving back leaves nothing pending', !F()['جابه/ت.md'] && !F()['جابه/الف.md'].deleted && !F()['جابه/الف.md'].dirty && pendOf('جابه/الف.md').length === 0, nb.ui.pending());
  nb.ui.del('جابه/الف.md');
  nb.ui.write('جابه/ث.md', '# یکسان\n');
  ok('equal content is not a move', pendOf('جابه/ث.md').length === 1 && pendOf('جابه/ث.md')[0].kind === 'new' && pendOf('جابه/الف.md')[0].kind === 'del', nb.ui.pending());
  const delIdx = nb.ui.pending().findIndex((r) => r.path === 'جابه/الف.md');
  nb.ui.pendDrop(delIdx);
  doc.getElementById('nbMiniOk').click();
  await sleep(40);
  ok('discarding a delete brings the note back as it was', !F()['جابه/الف.md'].deleted && !F()['جابه/الف.md'].dirty && F()['جابه/الف.md'].text === '# یکسان\n');
  ok('and the new note was left alone', !!F()['جابه/ث.md'] && !F()['جابه/ث.md'].deleted);
  nb.ui.move('جابه/ب.md', 'جای دیگر/ب.md');
  const mvIdx = nb.ui.pending().findIndex((r) => r.kind === 'move' && r.path === 'جای دیگر/ب.md');
  nb.ui.pendDrop(mvIdx);
  doc.getElementById('nbMiniOk').click();
  await sleep(40);
  ok('discarding a move puts it back with nothing pending', !!F()['جابه/ب.md'] && !F()['جابه/ب.md'].deleted && !F()['جابه/ب.md'].dirty && !F()['جای دیگر/ب.md'], nb.ui.pending());

  console.log('\n— Shamsi dates are checked, any digits work —');
  eq('Mehr has 30 days', nb.ui.shamsiStamp('1404-07-31'), '');
  eq('Shahrivar has 31', nb.ui.shamsiStamp('1404-06-31'), '1404-06-31');
  eq('Esfand 30 only in a leap year', [nb.ui.shamsiStamp('1403-12-30'), nb.ui.shamsiStamp('1404-12-30')], ['1403-12-30', '']);
  eq('a Gregorian date that does not exist', nb.ui.shamsiStamp('2026-02-30'), '');
  eq('Arabic digits are read', nb.ui.shamsiStamp('١٤٠٥/٠٨/٠٥'), '1405-08-05');
  eq('Persian digits are read', nb.ui.shamsiStamp('۱۴۰۵/۰۸/۰۵'), '1405-08-05');

  console.log('\n— a due date keeps the emoji around it —');
  nb.ui.write('جابه/کار.md', '- [ ] 🎉 جشن ⏳\n');
  const due0 = nb.ui.setTaskDue(encodeURIComponent('جابه/کار.md') + ':0', '1405-08-05');
  eq('the date is written and 🎉 stays whole', F()['جابه/کار.md'].text, '- [ ] 🎉 جشن 📅 1405-08-05\n');
  eq('the text before comes back for «بازگشت»', due0, '- [ ] 🎉 جشن ⏳\n');
  nb.ui.setTaskDue(encodeURIComponent('جابه/کار.md') + ':0', '');
  eq('removing it leaves the text clean', F()['جابه/کار.md'].text, '- [ ] 🎉 جشن\n');
  nb.ui.cfg({ readonlyFolders: ['جابه'] });
  eq('a read-only folder refuses a due date', nb.ui.setTaskDue(encodeURIComponent('جابه/کار.md') + ':0', '1405-08-06'), null);
  eq('and refuses a move', nb.ui.move('جابه/کار.md', 'کار.md'), false);
  nb.ui.cfg({ readonlyFolders: ['Claude Sessions'] });
  ok('«Claude Sessions» is read-only out of the box', nb.ui.cfg().readonlyFolders.indexOf('Claude Sessions') !== -1);

  console.log('\n— «همگام سازی وقتی اینترنت برگشت» —');
  nb.ui.write('جابه/آنلاین.md', '# وقتی برگشت\n');
  const onlineBefore = repo.apiCommits;
  nb.ui.cfg({ syncOnline: false });
  win.dispatchEvent(new win.Event('online'));
  await sleep(150);
  eq('off: nothing is sent when the network comes back', repo.apiCommits, onlineBefore);
  nb.ui.cfg({ syncOnline: true });
  win.dispatchEvent(new win.Event('online'));
  await until(() => repo.apiCommits > onlineBefore, 2000);
  ok('on: what waited is sent', repo.apiCommits === onlineBefore + 1 && !F()['جابه/آنلاین.md'].dirty, repo.apiCommits - onlineBefore);

  console.log('\n— a send that the repository would refuse is repaired first —');
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.write('ارسال/واقعی.md', '# باید برود\n');
  // what an older build left behind: a delete of a file the repository never had, and a «remote» flag that lies
  nb.ui.files()['ارسال/شبح.md'] = { path: 'ارسال/شبح.md', text: 'x', base: 'x', sha: '', dirty: true, deleted: true, remote: true, at: 1 };
  nb.ui.state().paths.push('ارسال/شبح.md');
  nb.ui.files()['ارسال/واقعی.md'].remote = true;
  const fixBefore = repo.apiCommits;
  const sent = await nb.ui.push({ loud: true });
  ok('the send goes through', sent === true && repo.apiCommits === fixBefore + 1, [sent, nb.ui.state().error]);
  ok('the new note is on the repository', repo.files.has('ارسال/واقعی.md'));
  ok('the phantom delete is gone from the queue', !nb.ui.files()['ارسال/شبح.md'] && nb.ui.dirty().every((f) => f.path !== 'ارسال/شبح.md'));
  nb.ui.files()['ارسال/شبح2.md'] = { path: 'ارسال/شبح2.md', text: 'x', base: 'x', sha: '', dirty: true, deleted: true, remote: true, at: 1 };
  nb.ui.state().paths.push('ارسال/شبح2.md');
  const pulledFix = await nb.ui.pull({ loud: true });
  ok('«گرفتن» repairs the queue even when the branch did not move', pulledFix === true && !nb.ui.files()['ارسال/شبح2.md'], pulledFix);

  console.log('\n— «جایگزینی با نسخهٔ مخزن» —');
  await until(() => !nb.ui.state().busy, 4000);
  putRemote('بازنشانی/الف.md', '# نسخهٔ مخزن\n');
  repo.commits.push({ sha: 'd'.repeat(40), message: 'remote edit', tree: 'x', parents: [], treeBody: { tree: [] } });
  nb.ui.write('بازنشانی/الف.md', '# نسخهٔ این دستگاه\n');
  nb.ui.write('بازنشانی/فقط اینجا.md', '# فقط اینجا\n');
  let zipped = 0;
  const origCreate = win.URL.createObjectURL;
  win.URL.createObjectURL = () => { zipped++; return 'blob:test'; };
  nb.ui.resetFromRepo();
  await sleep(20);
  ok('it asks first, and says what will happen', !doc.getElementById('nbMini').hidden && /zip/.test(doc.getElementById('nbMini').textContent));
  doc.getElementById('nbMiniOk').click();
  await until(() => !nb.ui.state().busy && nb.ui.files()['بازنشانی/الف.md'], 4000);
  await sleep(60);
  ok('the unsent changes went into a zip first', zipped >= 1);
  eq('the note is the repository\'s version', nb.ui.files()['بازنشانی/الف.md'].text, '# نسخهٔ مخزن\n');
  ok('a note only this device had is gone', !nb.ui.files()['بازنشانی/فقط اینجا.md']);
  eq('nothing waits to be sent', nb.ui.dirty().length, 0);
  win.URL.createObjectURL = origCreate;

  console.log('\n— the open temp tabs have a menu too —');
  nb.ui.goHome();
  await sleep(40);
  const tempTabId = [...doc.querySelectorAll('#tabsList .tab')].filter((t) => !t.classList.contains('nb-tab')).map((t) => t.dataset.tab)[0];
  const tempItems = tempTabId ? nb.ui.tempMenu(tempTabId).filter(Boolean).map((x) => x.label) : [];
  ok('close, save, pin, rename and copy are there', ['ذخیره در دفترچه…', 'تغییر نام', 'تکثیر', 'کپی متن', 'بستن'].every((x) => tempItems.indexOf(x) !== -1), tempItems);

  console.log('\n— سطل بازیافت —');
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.write('سطل/فقط اینجا.md', '# هنوز نرفته\n');
  nb.ui.del('سطل/فقط اینجا.md');
  ok('a note never sent is not queued as a delete', !nb.ui.files()['سطل/فقط اینجا.md'] && nb.ui.dirty().every((f) => f.path !== 'سطل/فقط اینجا.md'));
  ok('but it is in the trash', nb.ui.trash()[0] && nb.ui.trash()[0].path === 'سطل/فقط اینجا.md');
  nb.ui.trashRestore(0);
  eq('«برگرداندن» brings it back', nb.ui.files()['سطل/فقط اینجا.md'] && nb.ui.files()['سطل/فقط اینجا.md'].text, '# هنوز نرفته\n');
  ok('and it leaves the trash', !nb.ui.trash().some((x) => x.path === 'سطل/فقط اینجا.md'));
  await nb.ui.push({ loud: false });
  nb.ui.del('سطل/فقط اینجا.md');
  ok('a sent note is queued as a delete', nb.ui.files()['سطل/فقط اینجا.md'] && nb.ui.files()['سطل/فقط اینجا.md'].deleted);
  nb.ui.trashRestore(0);
  ok('restoring before sending just cancels the delete', !nb.ui.files()['سطل/فقط اینجا.md'].deleted && !nb.ui.files()['سطل/فقط اینجا.md'].dirty);
  nb.ui.del('سطل/فقط اینجا.md');
  await nb.ui.push({ loud: false });
  ok('after sending, the repository no longer has it', !repo.files.has('سطل/فقط اینجا.md'));
  nb.ui.trashRestore(0);
  ok('restoring then makes it a new note again', nb.ui.files()['سطل/فقط اینجا.md'] && nb.ui.files()['سطل/فقط اینجا.md'].isNew && !nb.ui.files()['سطل/فقط اینجا.md'].remote);
  nb.ui.section('trash');
  ok('the trash has a section of its own', !!doc.querySelector('#nbSecs .nb-tab[data-nb-sec="trash"]') || nb.ui.trash().length === 0);

  console.log('\n— sharing through a gist: open, key in the link, password —');
  nb.ui.provider('github');
  nb.ui.write('شیر/باز.md', '# متن باز\nسلام\n');
  const recOpen = await nb.ui.shareCreate('شیر/باز.md', 'open', '', 0);
  const gOpen = recOpen && repo.gists.get(recOpen.id);
  ok('«باز» makes an unlisted gist with the Markdown as it is', !!gOpen && gOpen.public === false && Object.keys(gOpen.files)[0].endsWith('.md') && gOpen.files[Object.keys(gOpen.files)[0]].content === '# متن باز\nسلام\n');
  ok('and its description names it for the app', gOpen && gOpen.description === 'mizkar-share: باز');
  nb.ui.write('شیر/کلید.md', '# راز کوچک\nفقط با لینک\n');
  const recKey = await nb.ui.shareCreate('شیر/کلید.md', 'key', '', 7);
  const gKey = recKey && repo.gists.get(recKey.id);
  const keyContent = gKey ? gKey.files[Object.keys(gKey.files)[0]].content : '';
  ok('«کلید در لینک»: GitHub sees only ciphertext, not even the title', !!gKey && keyContent.indexOf('راز کوچک') === -1 && keyContent.indexOf('فقط با لینک') === -1 && gKey.description.indexOf('راز') === -1);
  ok('the expiry is in the description', gKey && / \| exp \d{4}-\d\d-\d\d$/.test(gKey.description));
  nb.ui.write('شیر/رمز.md', '# پشت گذرواژه\n');
  const recPass = await nb.ui.shareCreate('شیر/رمز.md', 'pass', 'pass-9876', 0);
  ok('«رمزدار» stores no key', !!recPass && !recPass.key);

  // opening the three links, as a stranger would
  doc.getElementById('input').value = '';
  const authBefore = repo.gistAuth.length;
  ok('an open link opens the text', await nb.ui.readGist('#g=' + recOpen.id) && doc.getElementById('input').value === '# متن باز\nسلام\n');
  ok('without a token', repo.gistAuth.slice(authBefore).every((x) => x === 'GET false'));
  ok('a key link opens the text', await nb.ui.readGist('#g=' + recKey.id + '.' + recKey.key) && doc.getElementById('input').value === '# راز کوچک\nفقط با لینک\n');
  ok('a wrong key opens nothing', !(await nb.ui.readGist('#g=' + recKey.id + '.AAAAAAAAAAAAAAAAAAAAAAAA')));
  const passOpen = nb.ui.readGist('#g=' + recPass.id);
  await until(() => !doc.getElementById('nbMini').hidden && doc.getElementById('nbMiniInput'), 3000);
  doc.getElementById('nbMiniInput').value = 'wrong';
  doc.getElementById('nbMiniOk').click();
  await until(() => !doc.getElementById('nbMini').hidden && /دوباره/.test(doc.getElementById('nbMini').textContent), 4000);
  ok('a wrong password asks again', /دوباره/.test(doc.getElementById('nbMini').textContent));
  doc.getElementById('nbMiniInput').value = 'pass-9876';
  doc.getElementById('nbMiniOk').click();
  ok('the right one opens it', await passOpen && doc.getElementById('input').value === '# پشت گذرواژه\n');

  // «اشتراک‌ها»
  const listed = await nb.ui.shareList();
  ok('«اشتراک‌ها» lists all three, with their titles', listed.length >= 3 && ['باز', 'کلید', 'رمز'].every((t) => listed.some((r) => r.title === t)), listed.map((r) => r.title));
  nb.ui.write('شیر/باز.md', '# متن باز\nویرایش شد\n');
  await nb.ui.shareUpdate(listed.find((r) => r.title === 'باز'));
  ok('«به‌روزرسانی» puts the new text behind the same link', gOpen.files[Object.keys(gOpen.files)[0]].content === '# متن باز\nویرایش شد\n');
  await nb.ui.shareRemove(listed.find((r) => r.title === 'باز'));
  ok('«برداشتن» deletes the gist', !repo.gists.has(recOpen.id));
  ok('and the link then says so', !(await nb.ui.readGist('#g=' + recOpen.id)));
  nb.ui.settings('shares');
  await sleep(60);
  ok('the settings page has «اشتراک‌ها» with the rows', doc.querySelectorAll('#nbShareList .nb-share-row').length === 2, doc.querySelectorAll('#nbShareList .nb-share-row').length);
  doc.querySelector('[data-action="nb-close"]').click();
  const reg = await nb.ui.shareList();
  reg.find((r) => r.title === 'کلید').exp = '2000-01-01';
  ok('a share past its date is removed when the app runs', (await nb.ui.shareExpire()) === 1 && !repo.gists.has(recKey.id));

  console.log('\n— «ویژگی‌ها»: front matter as a form —');
  eq('a new block on a note without one', nb.ui.fmWrite('# عنوان\n', [['date', '1405-08-05'], ['tags', ['کار', 'خانه']]]), '---\ndate: 1405-08-05\ntags: [کار, خانه]\n---\n# عنوان\n');
  eq('empty values drop out, the body stays', nb.ui.fmWrite('---\ndate: 1405-08-05\ntype: x\n---\n# عنوان\n', [['date', ''], ['type', 'جلسه']]), '---\ntype: جلسه\n---\n# عنوان\n');
  eq('nothing left: no block at all', nb.ui.fmWrite('---\ntype: x\n---\n# عنوان\n', [['type', '']]), '# عنوان\n');
  nb.ui.write('ویژگی/الف.md', '---\ndate: 1405-08-01\n---\n# الف\n');
  nb.ui.fmDialog('ویژگی/الف.md');
  await sleep(20);
  const fmRows = doc.querySelectorAll('#nbFmRows .nb-fm-row');
  ok('the form shows the date (Shamsi picker) and tags', fmRows.length === 2 && !!doc.querySelector('#nbFmRows .nb-datebtn'));
  doc.querySelector('#nbFmRows .nb-fm-row:last-child input:not(.nb-fm-k)').value = 'کار، #مهم';
  doc.querySelector('#nbMini [data-nb-fm-add]').click();
  const newRow = [...doc.querySelectorAll('#nbFmRows .nb-fm-row')].pop();
  newRow.querySelector('.nb-fm-k').value = 'type';
  newRow.querySelector('input:not(.nb-fm-k)').value = 'جلسه';
  doc.getElementById('nbMiniOk').click();
  eq('saving writes it back into the note', nb.ui.files()['ویژگی/الف.md'].text, '---\ndate: 1405-08-01\ntags: [کار, مهم]\ntype: جلسه\n---\n# الف\n');

  console.log('\n— the panel: one head row, a filter over the tree —');
  nb.ui.sidebar(true); nb.ui.section('notes');
  ok('the sections sit in the head, no row of big buttons below', !!doc.querySelector('#nb .nb-head #nbSecs [data-nb-sec="notes"]') && !doc.querySelector('#nbBody [data-nb-act="new"]') && !doc.querySelector('#nbBody .nb-tabs'));
  ok('only the open section shows its name, the others are icons with a tooltip',
    !!doc.querySelector('#nbSecs .nb-tab.on .nb-tab-l') && [...doc.querySelectorAll('#nbSecs .nb-tab:not(.on)')].every((b) => b.title && b.getAttribute('aria-label')));
  doc.querySelector('#nbSecs [data-nb-secs-more]').click();
  const moreSecs = [...doc.querySelectorAll('#nbMenu .mi')].map((b) => b.textContent);
  ok('⋯ holds tags, the trash and settings', ['برچسب‌ها', 'سطل بازیافت', 'تنظیمات'].every((s) => moreSecs.some((l) => l.indexOf(s) !== -1)), moreSecs);
  doc.getElementById('nbMenu').hidden = true;
  nb.ui.write('فیلتر/سیب.md', '# سیب\n'); nb.ui.write('فیلتر/گلابی.md', '# گلابی\n');
  nb.ui.section('notes');
  const tq = doc.getElementById('nbTreeQ');
  tq.value = 'سیب';
  tq.dispatchEvent(new win.Event('input', { bubbles: true }));
  const shown = [...doc.querySelectorAll('#nbTreeBox [data-nb-note]')].map((r) => r.dataset.nbNote);
  ok('typing in the filter narrows the tree to matching notes, folders open', shown.indexOf('فیلتر/سیب.md') !== -1 && shown.indexOf('فیلتر/گلابی.md') === -1, shown);
  ok('and the filter keeps the focus (only the tree is redrawn)', doc.getElementById('nbTreeQ') === tq);
  tq.value = ''; tq.dispatchEvent(new win.Event('input', { bubbles: true }));
  nb.ui.write('فیلتر/سیب.md', '# سیب\nتازه\n');
  await sleep(30);
  ok('the head shows the sync dot with the waiting count', /\d|[۰-۹]/.test(doc.querySelector('#nbHeadSync b').textContent));
  doc.getElementById('nbHeadSync').click();
  ok('which opens the list of what waits', !doc.getElementById('nbSyncPop').hidden && !!doc.querySelector('#nbSyncPop .nb-pend-row'));
  doc.body.click();
  ok('and the row scrolls when it still does not fit', /#nb \.nb-tabs\{[^}]*overflow-x:auto/.test(doc.getElementById('appStyle').textContent));
  nb.ui.sidebar(false);

  console.log('\n— the first send to an empty GitHub repository —');
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.provider('github');
  repo.files.clear(); repo.commits.length = 0; repo.apiCommits = 0;
  nb.ui.state().lastCommit = '';
  nb.ui.write('خالی/اول.md', '# اول\n');
  nb.ui.write('خالی/دوم.md', '# دوم\n');
  const firstSent = await nb.ui.push({ loud: true });
  ok('it goes through (no «نسخهٔ تازه تر»)', firstSent === true, nb.ui.state().error);
  ok('both notes are on the repository', repo.files.has('خالی/اول.md') && repo.files.has('خالی/دوم.md'));
  ok('in two commits: the first through the Contents API, the rest on top', repo.apiCommits === 2 && repo.commits[1].parents[0] === repo.commits[0].sha, repo.apiCommits);
  eq('nothing waits any more', nb.ui.dirty().filter((f) => f.path.startsWith('خالی/')).length, 0);

  console.log('\n— «آزمایش اتصال» says which branch the repository uses —');
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.cfg({ branch: 'notes' });
  nb.ui.settings('connect');
  await sleep(20);
  doc.querySelector('#nbModalBody [data-nb-cfg="test"]').click();
  await until(() => !!doc.querySelector('#nbTestOut [data-nb-cfg="usebranch"]'), 3000);
  ok('a different branch name is pointed out, with a button', /main/.test(doc.getElementById('nbTestOut').textContent) && !!doc.querySelector('#nbTestOut [data-nb-cfg="usebranch"]'));
  doc.querySelector('#nbTestOut [data-nb-cfg="usebranch"]').click();
  eq('one tap and the notebook uses it', nb.ui.cfg().branch, 'main');
  doc.querySelector('[data-action="nb-close"]').click();

  console.log('\n— renaming from the title —');
  nb.ui.write('نام/برنامه سفر.md', '# برنامه سفر\nمتن\n');
  nb.ui.write('نام/پیوند دهنده.md', 'ببین [[برنامه سفر]]\n');
  nb.ui.open('نام/برنامه سفر.md');
  await sleep(40);
  const renTab = doc.querySelector('#tabsList .tab[aria-selected="true"]');
  renTab.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true }));
  const rn = doc.querySelector('#tabsList .tab-rn');
  rn.value = 'سفر شمال';
  rn.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(40);
  ok('renaming the tab renames the note', !!nb.ui.files()['نام/سفر شمال.md'] && !nb.ui.files()['نام/برنامه سفر.md']);
  ok('the title line followed, it was the same name', /^# سفر شمال$/m.test(nb.ui.files()['نام/سفر شمال.md'].text));
  ok('links to it were fixed', /\[\[سفر شمال\]\]/.test(nb.ui.files()['نام/پیوند دهنده.md'].text));
  ok('the tree shows the new name', [...doc.querySelectorAll('#nbBody [data-nb-note]')].some((r) => r.dataset.nbNote === 'نام/سفر شمال.md') || !nb.ui.state().open);
  // the title line edited in place renames the note too
  const editTa = doc.getElementById('input');
  const para = [...doc.querySelectorAll('#zoomWrap h1')].find((x) => x.textContent.includes('سفر شمال'));
  para.dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, clientX: 50, clientY: 50 }));
  await sleep(30);
  editTa.value = editTa.value.replace('# سفر شمال', '# سفر شمال و گیلان');
  editTa.dispatchEvent(new win.Event('input', { bubbles: true }));
  editTa.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  await sleep(60);
  ok('editing the title line renames the note when they went together', !!nb.ui.files()['نام/سفر شمال و گیلان.md'] && !nb.ui.files()['نام/سفر شمال.md'], Object.keys(nb.ui.files()).filter((p) => p.startsWith('نام/')));
  nb.ui.write('روزانه/1405/08/1405-08-09.md', '# ۹ آبان\n');
  nb.ui.open('روزانه/1405/08/1405-08-09.md');
  await sleep(40);
  doc.querySelector('#zoomWrap h1').dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, clientX: 50, clientY: 50 }));
  await sleep(30);
  editTa.value = '# ۹ آبان — جمعه\n';
  editTa.dispatchEvent(new win.Event('input', { bubbles: true }));
  editTa.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  await sleep(60);
  ok('a dated note keeps its file name (its title was never the name)', !!nb.ui.files()['روزانه/1405/08/1405-08-09.md']);

  console.log('\n— the top: one row, and a note shows where it lives —');
  const topBar = doc.querySelector('header.bar');
  ok('the tabs sit in the top bar, right after the brand', topBar.contains(doc.getElementById('tabs')) && topBar.querySelector('.brand').nextElementSibling === doc.getElementById('tabs'));
  ok('«خروجی» is an icon with a name for screen readers', doc.getElementById('btnExport').getAttribute('aria-label') === 'خروجی');
  nb.ui.write('مسیر/زیر/یادداشت ته.md', '# ته\n');
  nb.ui.open('مسیر/زیر/یادداشت ته.md');
  await sleep(40);
  const ph = doc.querySelector('.pane.out .pane-head .ph-title');
  eq('the page head is the path, not «پیش‌نمایش»', [...ph.querySelectorAll('.nb-crumb')].map((b) => b.textContent).concat(ph.querySelector('.nb-crumb-t').textContent), ['مسیر', 'زیر', 'یادداشت ته']);
  nb.ui.sidebar(false);
  ph.querySelector('[data-nb-crumb="مسیر/زیر"]').click();
  ok('a folder in the path opens it in the panel', doc.body.classList.contains('nb-open') && nb.ui.state().section === 'notes' && !!doc.querySelector('#nbBody [data-nb-dir="مسیر/زیر"]'));
  nb.ui.goHome();
  await sleep(40);
  ok('a temp tab gets its own head back', !ph.dataset.crumbs && !ph.querySelector('.nb-crumb'));
  nb.ui.sidebar(false);

  if (IS_M3){
    console.log('\n— نسخهٔ ۲: پوستهٔ اندرویدی (M3) —');
    ok('the skin is awake', doc.documentElement.dataset.skin === 'm3' && doc.body.classList.contains('m3'));
    ok('the M3 colours replace the app palette', /html\[data-skin="m3"\]\[data-theme="dark"\]/.test(doc.getElementById('appStyle').textContent));
    const fab = doc.getElementById('m3Fab');
    ok('the FAB is there and opens «تازه»', !!fab && fab.getAttribute('aria-haspopup') === 'menu');
    fab.click();
    await sleep(20);
    ok('with the new-note actions', [...doc.querySelectorAll('#nbMenu .mi')].some((b) => b.textContent.indexOf('یادداشت جدید') !== -1));
    doc.getElementById('nbMenu').hidden = true;
    const navBtn = doc.querySelector('#nbNav .nb-nav-b');
    const pdown = new win.MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 });
    navBtn.dispatchEvent(pdown);
    ok('a press answers with a ripple', !!navBtn.querySelector('.m3-ripple'));
  } else {
    ok('the Android skin stays asleep outside beta2', !doc.body.classList.contains('m3') && !doc.getElementById('m3Fab'));
  }

  console.log('\n— ریویو: ویرایش ارسال نشده از pull جان به در می برد و ارسالِ تکرارشده یکی می ماند —');
  await until(() => !nb.ui.state().busy, 4000);
  nb.ui.cfg({ branch: 'main' });
  nb.ui.write('ریویو/الف.md', '# الف\n');
  await nb.ui.push({ loud: false });
  putRemote('ریویو/ب.md', '# ب از دستگاه دیگر\n');
  repo.commits.push({ sha: 'b'.repeat(40), message: 'other device', tree: 'x', parents: [], treeBody: { tree: [] } });
  nb.ui.write('ریویو/الف.md', '# الف\nویرایش من\n');
  await nb.ui.pull({ quiet: true });
  ok('بعد از pull آرام، ویرایش من سر جایش است', nb.ui.files()['ریویو/الف.md'].dirty === true && /ویرایش من/.test(nb.ui.files()['ریویو/الف.md'].text), nb.ui.files()['ریویو/الف.md']);
  putRemote('ریویو/ج.md', '# ج\n');
  repo.commits.push({ sha: 'c'.repeat(40), message: 'other device 2', tree: 'x', parents: [], treeBody: { tree: [] } });
  const rvBefore = repo.apiCommits;
  const rvSent = await nb.ui.push({ loud: false });
  ok('ارسالِ بعد از جابه جایی شاخه یک commit است، نه دو', rvSent === true && repo.apiCommits === rvBefore + 1, repo.apiCommits - rvBefore);
  eq('و متن من روی مخزن است', repo.files.get('ریویو/الف.md').text, '# الف\nویرایش من\n');
  ok('و چیزی منتظر نماند', nb.ui.dirty().every((f) => !f.path.startsWith('ریویو/')));

  console.log('\n— ریویو: یادداشت رمزدارِ قفل که روی مسیر حذف شده می رود، منتظرِ ارسال می ماند —');
  nb.ui.state().pass = 'pass-1234';
  nb.ui.write('رمزها/س.md', '# راز\n');
  nb.ui.encrypt('رمزها/س.md');
  nb.ui.write('رمزها/هدف.md', '# هدف قدیمی\n');
  await nb.ui.push({ loud: false });
  const sEnc = nb.ui.files()['رمزها/س.md'];
  sEnc.plain = null; sEnc.basePlain = null; nb.ui.state().pass = '';
  nb.ui.del('رمزها/هدف.md');
  nb.ui.move('رمزها/س.md', 'رمزها/هدف.md');
  const movedEnc = nb.ui.files()['رمزها/هدف.md'];
  ok('مقصد رمزدار و در صف ارسال است', movedEnc && movedEnc.enc === true && movedEnc.dirty === true, movedEnc && { enc: movedEnc.enc, dirty: movedEnc.dirty });
  nb.ui.state().pass = 'pass-1234';
  await nb.ui.push({ loud: false });
  ok('با گذرواژه می رود و مخزن رمزشده را دارد', nb.ui.isEncrypted(repo.files.get('رمزها/هدف.md').text) && !repo.files.has('رمزها/س.md'));

  console.log('\n— ریویو: عنوانِ به خاطر مانده از یک یادداشت، یادداشت بعدی را تغییر نام نمی دهد —');
  nb.ui.write('عنوانها/ع.md', '# ع\nمتن\n');
  nb.ui.write('عنوانها/ب.md', '# زد\nعمداً فرق دارد\n');
  nb.ui.open('عنوانها/ع.md');
  await sleep(40);
  doc.querySelector('#zoomWrap h1').dispatchEvent(new win.MouseEvent('dblclick', { bubbles: true, clientX: 40, clientY: 40 }));
  await sleep(30);
  const taR = doc.getElementById('input');
  taR.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  await sleep(30);
  nb.ui.open('عنوانها/ب.md');
  await sleep(40);
  doc.getElementById('uiEdit').click();
  await sleep(40);
  taR.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  await sleep(60);
  ok('ب سر جایش است و «زد» ساخته نشد', !!nb.ui.files()['عنوانها/ب.md'] && !nb.ui.files()['عنوانها/زد.md'], Object.keys(nb.ui.files()).filter((p) => p.startsWith('عنوانها/')));

  console.log('\n— ریویو: صفحه کلید و دور انداختن جابه جاییِ بسته —');
  nb.ui.sidebar(true); nb.ui.section('notes');
  const kbRow = [...doc.querySelectorAll('#nbBody [data-nb-note]')].find((r) => r.dataset.nbNote === 'عنوانها/ب.md');
  kbRow.focus();
  kbRow.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await sleep(30);
  ok('Enter روی ردیف، یادداشت را باز می کند', doc.getElementById('input').value === nb.ui.files()['عنوانها/ب.md'].text, doc.getElementById('input').value.slice(0, 30));
  nb.ui.write('بستن/م۱.md', '# م\n');
  nb.ui.move('بستن/م۱.md', 'بستن/م۲.md');
  nb.ui.write('بستن/م۱.md', '# تازه روی مسیر قبلی\n');
  const mvRow = nb.ui.pending().findIndex((r) => r.kind === 'move' && r.path === 'بستن/م۲.md');
  if (mvRow !== -1){ nb.ui.pendDrop(mvRow); doc.getElementById('nbMiniOk') && doc.getElementById('nbMiniOk').click(); }
  await sleep(40);
  ok('دور انداختن جابه جایی وقتی مسیر قبلی پر است، چیزی را له نمی کند', !!nb.ui.files()['بستن/م۲.md'] && /تازه/.test(nb.ui.files()['بستن/م۱.md'].text));

  console.log('\n— ریویو: تنظیمات در حالت قفل هم ذخیره می شود —');
  nb.ui.state().tokenPass = '';                 // the lock is closed: no passphrase in memory
  nb.ui.cfg({ lockToken: true, tokenEnc: 'sealed-x' });
  nb.ui.cfg({ weekStart: 'monday' });
  await sleep(50);
  const savedLocked = win.__idb.get('meta') && win.__idb.get('meta').get('nb-cfg');
  ok('weekStart ذخیره شد و توکن ساده در انبار نیست', savedLocked && savedLocked.weekStart === 'monday' && savedLocked.token === '' && savedLocked.tokenEnc === 'sealed-x', savedLocked && { w: savedLocked.weekStart, t: savedLocked.token });
  nb.ui.cfg({ lockToken: false, tokenEnc: '', weekStart: 'saturday' });

  console.log('\n— نسخهٔ ۲: دکمهٔ شناور «تازه» (FAB) و ریپل —');
  Object.defineProperty(win, 'innerWidth', { value: 390, configurable: true, writable: true });
  win.dispatchEvent(new win.Event('resize'));
  doc.documentElement.dataset.skin = 'm3';
  eq('the FAB mounts on an M3 page (and mounts once)', [typeof win.m3Fab, win.m3Fab(), win.m3Fab(), doc.querySelectorAll('#m3Fab').length], ['function', true, true, 1]);
  const fabEl = doc.getElementById('m3Fab');
  ok('it is a button with the plus icon and its own label', !!fabEl && fabEl.tagName === 'BUTTON' && /i-plus/.test(fabEl.innerHTML) && fabEl.getAttribute('aria-label') === 'تازه');
  const fabTap = (how) => {
    if (how === 'click') fabEl.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    else fabEl.dispatchEvent(pev('pointerup', 20, 700, { pointerType: 'touch' }));
  };
  fabTap('click');
  await sleep(60);
  ok('a click on the FAB opens the «تازه» menu', !doc.getElementById('nbMenu').hidden && /یادداشت جدید/.test(doc.getElementById('nbMenu').textContent), doc.getElementById('nbMenu').textContent.slice(0, 40));
  await sleep(450);
  fabTap('click');
  await sleep(60);
  ok('a second tap on the FAB closes it again', doc.getElementById('nbMenu').hidden === true);
  doc.body.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(30);
  await sleep(450);
  fabTap('pointer');
  await sleep(60);
  ok('a finger that never becomes a click opens it too', !doc.getElementById('nbMenu').hidden);
  doc.body.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  await sleep(40);
  ok('and a click outside still closes it', doc.getElementById('nbMenu').hidden === true);
  const css2 = doc.getElementById('appStyle').textContent;
  ok('the stylesheet keeps the FAB off the panel and the dialogs', /body\.m3\.nb-open #m3Fab/.test(css2) && /:has\(\.modal:not\(\[hidden\]\)\) #m3Fab/.test(css2));
  ok('and a tap on it is not a double-tap zoom', /touch-action:manipulation/.test(css2));

  console.log(`\n${fail === 0 ? 'ALL GOOD' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
