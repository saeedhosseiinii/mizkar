/* End-to-end test of the notebook inside the real app, under jsdom, against a fake GitHub.
   The vendored libraries (mermaid, KaTeX) are stripped for speed; everything else is the page
   that ships. Run: node test_ui.js */
const fs = require('fs');
const crypto = require('crypto');
const { JSDOM } = require('jsdom');

const HTML = process.env.MIZKAR_HTML || require('path').join(__dirname, '..', 'index.html');
let html = fs.readFileSync(HTML, 'utf8');
// strip the two big vendored libraries and the CDN tag: the notebook needs none of them
html = html.replace(/<script id="mermaidLib">[\s\S]*?<\/script>/, '<script id="mermaidLib"></script>');
html = html.replace(/<script id="katexLib">[\s\S]*?<\/script>/, '<script id="katexLib"></script>');
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]*"><\/script>/, '');

/* ------------------------------------------------------------------ fake GitHub, in memory */
const repo = { files: new Map(), commits: [], apiCommits: 0, refs: {}, blobs: new Map(), trees: new Map(), req: [] };
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
  if (p === '' && method === 'GET') return apiResponse({ full_name: 'me/notes', private: true, permissions: { push: true } });
  if (p === '/git/ref/heads/main' && method === 'GET') {
    if (!head()) return apiResponse({ message: 'Not Found' }, 404);
    return apiResponse({ object: { sha: head() } });
  }
  if (/^\/git\/trees\/[0-9a-f]{40}$/.test(p) && method === 'GET') {
    const entries = [...repo.files.values()].map((f) => ({ path: f.path, type: 'blob', sha: f.sha, size: f.text.length }));
    return apiResponse({ sha: p.split('/').pop(), tree: entries });
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
    win.URL.createObjectURL = () => 'blob:test';
    win.URL.revokeObjectURL = () => {};
    win.fetch = (url, init) => {
      const method = (init && init.method) || 'GET';
      const body = init && init.body;
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
  const newNoteBtn = doc.querySelector('[data-nb-act="new"]');
  newNoteBtn.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
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
  const savedTabs = JSON.parse(win.localStorage.getItem('fs2-state') || '{}').tabs || [];
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

  console.log('\n— Claude Sessions opens read-only —');
  nb.ui.write('Claude Sessions/2026-10-23 گفتگو.md', '# گفتگو\nهرچه کلود گفت\n');
  nb.ui.open('Claude Sessions/2026-10-23 گفتگو.md');
  ok('the editor is read-only for that folder', doc.getElementById('input').readOnly === true);
  ok('the page says so', doc.body.classList.contains('nb-ro'));
  nb.ui.open('ایده ها/جستجو.md');
  ok('a normal note is editable again', doc.getElementById('input').readOnly === false);

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

  console.log(`\n${fail === 0 ? 'ALL GOOD' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
