/* === NOTEBOOK (Git) — Mizkar ===
   A personal notebook that lives in a private Git repo: notes as plain `.md` files, a working
   copy in IndexedDB, batched commits through the Git Data API, and no server of its own.
   The pure half (paths, Jalali dates, templates, front matter, zip, diff, three-way merge) sits
   between the markers below, so the engine can be tested on its own with Node. */
/* NB:PURE:START */
var nbJdiv = function(a, b){ return ~~(a / b); };
var nbJmod = function(a, b){ return a - ~~(a / b) * b; };
/** Jalali calendar (jalaali algorithm by Behrang Noruzi Niya, MIT). */
function nbJalCal(jy){
  var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  var gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap = 0, n, i;
  for (i = 1; i < breaks.length; i++){
    jm = breaks[i]; jump = jm - jp;
    if (jy < jm) break;
    leapJ += nbJdiv(jump, 33) * 8 + nbJdiv(nbJmod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ += nbJdiv(n, 33) * 8 + nbJdiv(nbJmod(n, 33) + 3, 4);
  if (nbJmod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  var leapG = nbJdiv(gy, 4) - nbJdiv((nbJdiv(gy, 100) + 1) * 3, 4) - 150;
  if (jump - n < 6) n = n - jump + nbJdiv(jump + 4, 33) * 33;
  leap = nbJmod(nbJmod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap: leap, gy: gy, march: 20 + leapJ - leapG };
}
function nbG2d(gy, gm, gd){
  var d = nbJdiv((gy + nbJdiv(gm - 8, 6) + 100100) * 1461, 4) + nbJdiv(153 * nbJmod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - nbJdiv(nbJdiv(gy + 100100 + nbJdiv(gm - 8, 6), 100) * 3, 4) + 752;
}
function nbD2g(jdn){
  var j = 4 * jdn + 139361631;
  j = j + nbJdiv(nbJdiv(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  var i = nbJdiv(nbJmod(j, 1461), 4) * 5 + 308;
  var gd = nbJdiv(nbJmod(i, 153), 5) + 1, gm = nbJmod(nbJdiv(i, 153), 12) + 1;
  return { gy: nbJdiv(j, 1461) - 100100 + nbJdiv(8 - gm, 6), gm: gm, gd: gd };
}
function nbJ2d(jy, jm, jd){
  var r = nbJalCal(jy);
  return nbG2d(r.gy, 3, r.march) + (jm - 1) * 31 - nbJdiv(jm, 7) * (jm - 7) + jd - 1;
}
function nbD2j(jdn){
  var gy = nbD2g(jdn).gy, jy = gy - 621, r = nbJalCal(jy), jdn1f = nbG2d(gy, 3, r.march), jd, jm, k;
  k = jdn - jdn1f;
  if (k >= 0){
    if (k <= 185){
      jm = 1 + nbJdiv(k, 31);
      jd = nbJmod(k, 31) + 1;
      return { jy: jy, jm: jm, jd: jd };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + nbJdiv(k, 30);
  jd = nbJmod(k, 30) + 1;
  return { jy: jy, jm: jm, jd: jd };
}
function nbGToJ(gy, gm, gd){ return nbD2j(nbG2d(gy, gm, gd)); }
function nbJToG(jy, jm, jd){ return nbD2g(nbJ2d(jy, jm, jd)); }
function nbPad2(n){ return (n < 10 ? '0' : '') + n; }
/** Every placeholder a path pattern or a template may use. */
function nbCtx(date, title, weekStart){
  var d = date || new Date();
  var gy = d.getFullYear(), gm = d.getMonth() + 1, gd = d.getDate();
  var j = nbGToJ(gy, gm, gd);
  var doy = j.jm <= 6 ? (j.jm - 1) * 31 + j.jd : 186 + (j.jm - 7) * 30 + j.jd;
  var first = nbJToG(j.jy, 1, 1);
  var startIdx = { saturday: 0, sunday: 1, monday: 2 }[weekStart || 'saturday'] || 0;
  var firstDow = new Date(first.gy, first.gm - 1, first.gd).getDay();   // 0 = Sunday
  var offset = (((firstDow + 1) % 7) - startIdx + 7) % 7;              // days the year starts into week 1
  var week = Math.floor((doy - 1 + offset) / 7) + 1;
  var WD = ['یکشنبه', 'دوشنبه', 'سه شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
  return {
    gy: String(gy), gm: nbPad2(gm), gd: nbPad2(gd), gdate: gy + '-' + nbPad2(gm) + '-' + nbPad2(gd),
    jy: String(j.jy), jm: nbPad2(j.jm), jd: nbPad2(j.jd), jdate: j.jy + '/' + nbPad2(j.jm) + '/' + nbPad2(j.jd),
    jdateDash: j.jy + '-' + nbPad2(j.jm) + '-' + nbPad2(j.jd),
    jw: nbPad2(week), time: nbPad2(d.getHours()) + ':' + nbPad2(d.getMinutes()),
    weekday: WD[d.getDay()], title: title || ''
  };
}
/** Fills a file-path pattern: {jy} {jm} {jd} {gy} {gm} {gd} {jw} {title}. */
function nbFillPath(pattern, ctx){
  return String(pattern || '').replace(/\{(jy|jm|jd|gy|gm|gd|jw|title)\}/g, function(m, k){
    var v = ctx[k];
    if (v === undefined || v === '') v = k === 'title' ? 'بدون عنوان' : '';
    return String(v);
  }).replace(/\/{2,}/g, '/').replace(/^\/+/, '');
}
/** Fills a note template: {{date}} {{jdate}} {{gdate}} {{time}} {{weekday}} {{title}} {{prev}} {{next}} {{cursor}}. */
function nbFillTemplate(tpl, ctx, extra){
  var all = Object.assign({}, ctx, extra || {});
  var text = String(tpl || '').replace(/\{\{(date|jdate|gdate|time|weekday|title|prev|next)\}\}/g, function(m, k){
    if (k === 'date') return all.jdateDash || all.jdate || all.gdate || '';
    var v = all[k];
    return v === undefined || v === null ? '' : String(v);
  });
  var at = text.indexOf('{{cursor}}');
  if (at === -1) return { text: nbTidyTpl(text), cursor: nbTidyTpl(text).length };
  var before = nbTidyTpl(text.slice(0, at));
  return { text: before + nbTidyTpl(text.slice(at + 10)), cursor: before.length };
}
/** Drops what an unfilled placeholder leaves behind: `[[ ]]`, a dangling «←» and a stray «·». */
function nbTidyTpl(text){
  var out = [];
  String(text).split('\n').forEach(function(line){
    var cleaned = line.replace(/\[\[\s*\]\]/g, '').replace(/[ \t]*·[ \t]*$/, '').replace(/[ \t]+$/, '');
    if (/[←→]/.test(cleaned) && /^[\s·←→—–-]*$/.test(cleaned)) return;   // a link line that lost all its links
    out.push(cleaned);
  });
  var res = out.join('\n');
  return res.replace(/\n+$/, res.trim() ? '\n' : '');   // a template ends with one newline, not a blank block
}
/** Front matter — the simple `key: value` and `key: [a, b]` forms Obsidian writes. */
function nbParseFm(text){
  var out = { data: {}, body: String(text), raw: '' };
  var m = String(text).match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
  if (!m) return out;
  out.raw = m[1];
  out.body = String(text).slice(m[0].length);
  m[1].split(/\r?\n/).forEach(function(line){
    var kv = line.match(/^\s*([A-Za-z_\u0600-\u06FF][\w\u0600-\u06FF .-]*)\s*:\s*(.*)$/);
    if (!kv) return;
    var key = kv[1].trim(), val = kv[2].trim();
    if (/^\[.*\]$/.test(val)) out.data[key] = val.slice(1, -1).split(',').map(function(s){ return s.trim().replace(/^["']|["']$/g, ''); }).filter(Boolean);
    else out.data[key] = val.replace(/^["']|["']$/g, '');
  });
  return out;
}
/** Tags from front matter plus `#tag` in the text (Persian letters allowed). */
function nbTags(text){
  var fm = nbParseFm(text), tags = [], seen = {};
  function add(t){
    t = String(t).replace(/^#/, '').trim();
    if (!t || seen[t]) return;
    seen[t] = 1; tags.push(t);
  }
  var v = fm.data.tags || fm.data.tag;
  if (Array.isArray(v)) v.forEach(add); else if (v) String(v).split(/[,\s]+/).forEach(add);
  (fm.body.match(/(^|[\s(])#([A-Za-z\u0600-\u06FF][\w\u0600-\u06FF/-]{1,40})/g) || []).forEach(function(m){
    add(m.replace(/^[\s(]/, ''));
  });
  return tags;
}
/** A file-name-safe slug that keeps Persian letters. */
function nbSlug(title, max){
  var s = String(title || '').replace(/[\\/:*?"<>|#^[\]{}]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, max || 80).replace(/[ .]+$/, '') || 'بدون عنوان';
}
/** The normalisation search and name matching use: ی/ک, digits, no ZWNJ or diacritics. */
function nbNorm(s){
  return String(s == null ? '' : s)
    .replace(/[\u064A\u0649]/g, '\u06CC').replace(/\u0643/g, '\u06A9').replace(/\u0629/g, '\u0647')
    .replace(/[\u064B-\u0652\u0670\u200C\u200E\u200F]/g, '')
    .replace(/[\u06F0-\u06F9]/g, function(d){ return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); })
    .replace(/[\u0660-\u0669]/g, function(d){ return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); })
    .toLowerCase();
}
var nbCrcTable = null;
function nbCrc32(bytes){
  if (!nbCrcTable){
    nbCrcTable = [];
    for (var n = 0; n < 256; n++){ var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; nbCrcTable[n] = c >>> 0; }
  }
  var crc = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) crc = nbCrcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function nbUtf8(s){
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  var out = [];
  for (var i = 0; i < s.length; i++){
    var c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(out);
}
function nbUtf8Decode(bytes){
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
}
function nbBytesOf(any){ return any instanceof Uint8Array ? any : new Uint8Array(any); }
/** A zip of stored entries — enough for a portable, portable-everywhere bundle of notes. */
function nbZip(files){
  var parts = [], central = [], offset = 0, now = new Date();
  var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
  function w16(a, v, at){ a[at] = v & 255; a[at + 1] = (v >> 8) & 255; }
  function w32(a, v, at){ a[at] = v & 255; a[at + 1] = (v >>> 8) & 255; a[at + 2] = (v >>> 16) & 255; a[at + 3] = (v >>> 24) & 255; }
  files.forEach(function(f){
    var name = nbUtf8(f.path), data = nbBytesOf(typeof f.text === 'string' ? nbUtf8(f.text) : f.data);
    var crc = nbCrc32(data);
    var head = new Uint8Array(30 + name.length);
    w32(head, 0x04034b50, 0); w16(head, 20, 4); w16(head, 0x0800, 6); w16(head, 0, 8);
    w16(head, dosTime, 10); w16(head, dosDate, 12); w32(head, crc, 14);
    w32(head, data.length, 18); w32(head, data.length, 22); w16(head, name.length, 26); w16(head, 0, 28);
    head.set(name, 30);
    parts.push(head, data);
    var cen = new Uint8Array(46 + name.length);
    w32(cen, 0x02014b50, 0); w16(cen, 20, 4); w16(cen, 20, 6); w16(cen, 0x0800, 8); w16(cen, 0, 10);
    w16(cen, dosTime, 12); w16(cen, dosDate, 14); w32(cen, crc, 16);
    w32(cen, data.length, 20); w32(cen, data.length, 24); w16(cen, name.length, 28);
    w16(cen, 0, 42); w32(cen, offset, 42); cen.set(name, 46);
    central.push(cen);
    offset += head.length + data.length;
  });
  var cenSize = central.reduce(function(n, c){ return n + c.length; }, 0);
  var end = new Uint8Array(22);
  w32(end, 0x06054b50, 0); w16(end, files.length, 8); w16(end, files.length, 10);
  w32(end, cenSize, 12); w32(end, offset, 16);
  var all = parts.concat(central, [end]);
  var total = all.reduce(function(n, p){ return n + p.length; }, 0), out = new Uint8Array(total), at = 0;
  all.forEach(function(p){ out.set(p, at); at += p.length; });
  return out;
}
/** Reads back what nbZip wrote (or any non-zip64 zip); deflated entries need DecompressionStream. */
function nbUnzip(bytes){
  var d = nbBytesOf(bytes), dv = new DataView(d.buffer, d.byteOffset, d.byteLength), i;
  var eocd = -1;
  for (i = d.length - 22; i >= 0 && i >= d.length - 66000; i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) return Promise.reject(new Error('فایل zip نیست'));
  var count = dv.getUint16(eocd + 10, true), at = dv.getUint32(eocd + 16, true);
  var jobs = [];
  for (i = 0; i < count; i++){
    var method = dv.getUint16(at + 10, true), compSize = dv.getUint32(at + 20, true);
    var nameLen = dv.getUint16(at + 28, true), extraLen = dv.getUint16(at + 30, true), commentLen = dv.getUint16(at + 32, true);
    var local = dv.getUint32(at + 42, true);
    var name = nbUtf8Decode(d.subarray(at + 46, at + 46 + nameLen));
    var lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    var start = local + 30 + lNameLen + lExtraLen;
    jobs.push({ name: name, method: method, raw: d.subarray(start, start + compSize) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return Promise.all(jobs.map(function(j){
    if (j.method === 0) return Promise.resolve({ path: j.name, data: j.raw });
    if (j.method !== 8) return Promise.reject(new Error('روش فشرده سازی ' + j.method + ' پشتیبانی نمی شود'));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('این مرورگر zip فشرده را باز نمی کند'));
    var stream = new Blob([j.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function(buf){ return { path: j.name, data: new Uint8Array(buf) }; });
  }));
}
/** Line diff (longest common subsequence) — the base for conflict display and merging. */
function nbDiffLines(a, b){
  var A = String(a).split('\n'), B = String(b).split('\n');
  var n = A.length, m = B.length, i, j;
  if (n * m > 4000000) return [{ op: 'same', text: String(a) }]; // pathologically long: rather give up than hang
  var L = [];
  for (i = 0; i <= n; i++){ L.push(new Array(m + 1)); L[i][m] = 0; }
  for (j = 0; j <= m; j++) L[n][j] = 0;
  for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  var ops = [], ai = 0, bi = 0;
  // `same` lines are never merged: an empty last line would otherwise blur the line count
  function push(op, text){
    var last = ops[ops.length - 1];
    if (last && last.op === op && op !== 'same') last.text += '\n' + text;
    else ops.push({ op: op, text: text });
  }
  while (ai < n && bi < m){
    if (A[ai] === B[bi]){ push('same', A[ai]); ai++; bi++; }
    else if (L[ai + 1][bi] >= L[ai][bi + 1]){ push('del', A[ai]); ai++; }
    else { push('add', B[bi]); bi++; }
  }
  while (ai < n) push('del', A[ai++]);
  while (bi < m) push('add', B[bi++]);
  return ops;
}
/**
 * Three-way merge on lines: `{text, conflicts}`. Changes that touch different regions merge on
 * their own; overlapping ones come back as a conflict with both versions, so nothing is lost.
 */
function nbMerge3(base, mine, theirs){
  if (mine === theirs) return { text: mine, conflicts: [] };
  if (base === mine) return { text: theirs, conflicts: [] };
  if (base === theirs) return { text: mine, conflicts: [] };
  var A = String(base).split('\n');
  function changesOf(other){
    var ops = nbDiffLines(base, other), at = 0, hunks = [], cur = null;
    ops.forEach(function(o){
      var n = o.text.split('\n').length;
      if (o.op === 'same'){
        if (cur){ cur.end = at; hunks.push(cur); cur = null; }
        at += n;
        return;
      }
      if (!cur) cur = { start: at, end: at, range: [], lines: [] };
      if (o.op === 'del'){
        for (var k = 0; k < n; k++) cur.range.push(at + k);
        at += n;
        cur.end = at;
      } else {
        o.text.split('\n').forEach(function(l){ cur.lines.push(l); });
      }
    });
    if (cur){ cur.end = at; hunks.push(cur); }
    return hunks.filter(function(h){
      var same = h.lines.length === h.range.length && h.lines.every(function(l, k){ return l === A[h.range[k]]; });
      return !same;
    });
  }
  var mm = changesOf(mine), tt = changesOf(theirs);
  var overlap = mm.some(function(a){
    return tt.some(function(b){ return a.start < b.end && b.start < a.end; });
  });
  if (overlap) return { text: mine, conflicts: [{ mine: mine, theirs: theirs, base: base }] };
  var apply = function(hunks){
    var out = [], at = 0;
    hunks.sort(function(a, b){ return a.start - b.start; }).forEach(function(h){
      out = out.concat(A.slice(at, h.start), h.lines);
      at = h.range.length ? Math.max(h.start, h.end) : h.start;
    });
    return out.concat(A.slice(at)).join('\n');
  };
  return { text: apply(mm.concat(tt)), conflicts: [] };
}
/** The note title a path carries, and the Persian digits commit messages use. */
function nbPathTitle(p){ return String(p).split('/').pop().replace(/\.(md|markdown|txt)$/i, ''); }
function nbFaN(n){ return String(n).replace(/\d/g, function(d){ return String.fromCharCode(0x06F0 + +d); }); }
/** One commit message for a batch of changes: what was touched, and nothing else. */
function nbCommitMessage(list){
  var names = list.map(function(f){ return nbPathTitle(f.path); });
  var del = list.filter(function(f){ return f.deleted; }).length;
  var head = list.length === 1 ? (del ? 'حذف ' : 'ویرایش ') + names[0]
    : nbFaN(list.length) + ' یادداشت' + (del ? ' (' + nbFaN(del) + ' حذف)' : '');
  return 'دفترچه: ' + head + (list.length > 1 ? ' — ' + names.slice(0, 3).join('، ') + (list.length > 3 ? '…' : '') : '');
}
/* NB:PURE:END */

(function(){
  if (typeof document === 'undefined') return;
  var NB = {
    cfg: null, files: {}, paths: [], loaded: false, lastCommit: '', lastSync: 0,
    dirtyCount: 0, state: 'off', error: '', conflicts: [], busy: false, timer: 0,
    localSalt: crypto.getRandomValues(new Uint8Array(16)),
    lastPull: 0, open: false, section: 'notes', expanded: {}, pullTimer: 0,
    query: '', colFilter: '', tagFilter: '', calMonth: null, focusSearch: false,
    key: null, unlock: {}, attach: {}, pass: null, attachMeta: {}
  };
  var C = null;
  var NB_DEFAULTS = {
    repo: '', branch: 'main', token: '', auto: true, idleSeconds: 20, weekStart: 'saturday',
    calendar: 'jalali', attachments: 'attachments', readonlyFolders: [], configPath: '.mizkar/config.json',
    provider: 'github', profiles: [], active: '', lockToken: false,
    collections: [
      { id: 'daily', name: 'روزانه', color: '#6d5efc', calendar: 'day', path: 'روزانه/{jy}/{jm}/{jy}-{jm}-{jd}.md', template: 'templates/daily.md' },
      { id: 'meeting', name: 'جلسه ها', color: '#f59e0b', calendar: 'many', path: 'جلسه ها/{jy}/{jm}/{jy}-{jm}-{jd} {title}.md', template: 'templates/meeting.md' },
      { id: 'weekly', name: 'هفتگی', color: '#10b981', calendar: 'week', path: 'هفتگی/{jy}-W{jw}.md', template: 'templates/weekly.md' },
      { id: 'idea', name: 'ایده ها', color: '#ef4444', calendar: null, path: 'ایده ها/{title}.md', template: 'templates/idea.md' }
    ]
  };
  var NB_TEMPLATES = {
    'templates/daily.md': '---\ntype: daily\ndate: {{date}}\ncreated: {{gdate}}\ntags: [روزانه]\n---\n# {{jdate}} — {{weekday}}\n\n## کارها\n- [ ] \n\n## یادداشت ها\n{{cursor}}\n\n← [[{{prev}}]] · [[{{next}}]]\n',
    'templates/meeting.md': '---\ntype: meeting\ndate: {{date}}\ncreated: {{gdate}}\ntags: [جلسه]\n---\n# {{title}} — {{jdate}}\n\n**حاضران:** \n**موضوع:** {{cursor}}\n\n## تصمیم ها\n- \n\n## کارها\n- [ ] \n\n← [[{{prev}}]]\n',
    'templates/weekly.md': '---\ntype: weekly\ndate: {{date}}\ncreated: {{gdate}}\ntags: [هفتگی]\n---\n# هفته {{jw}} — {{jdate}}\n\n## این هفته\n- \n\n## بعد\n- \n\n{{cursor}}\n',
    'templates/idea.md': '---\ntype: idea\ndate: {{date}}\ncreated: {{gdate}}\ntags: [ایده]\n---\n# {{title}}\n\n**جرقه:** {{cursor}}\n\n## چرا\n\n\n## قدم بعدی\n- [ ] \n'
  };
  var IGNORE = ['.obsidian/', '.git/'];

  /* --- storage: the working copy lives in IndexedDB, next to the app's own stores --- */
  function nbCountDirty(){
    var n = 0;
    NB.paths.forEach(function(p){ var f = NB.files[p]; if (f && (f.dirty || f.deleted)) n++; });
    Object.keys(NB.attach || {}).forEach(function(k){ if (NB.attach[k].dirty) n++; });
    NB.dirtyCount = n;
    return n;
  }
  /**
   * With «قفل توکن», nothing that could reach the repository rests in clear: tokens (this one and every
   * profile's) are stored encrypted with the lock passphrase, and live in memory only after unlocking.
   */
  function nbSaveCfg(){
    if (!C.lockToken){
      delete C.tokenEnc;
      nbProfiles().forEach(function(pr){ delete pr.tokenEnc; });
      return idbSet('nb-cfg', C, 'meta');
    }
    if (!NB.tokenPass) return Promise.resolve(false);      // locked and not opened: what is stored stays as it is
    var copy = JSON.parse(JSON.stringify(C)), pass = NB.tokenPass;
    function seal(token, prev){ return token ? nbEncrypt(token, pass, NB.localSalt) : Promise.resolve(prev || ''); }
    copy.token = '';
    return Promise.all([seal(C.token, C.tokenEnc)].concat(nbProfiles().map(function(pr){ return seal(pr.token, pr.tokenEnc); })))
      .then(function(sealed){
        copy.tokenEnc = C.tokenEnc = sealed[0];
        (copy.profiles || []).forEach(function(pr, i){ pr.token = ''; pr.tokenEnc = sealed[i + 1]; nbProfiles()[i].tokenEnc = sealed[i + 1]; });
        return idbSet('nb-cfg', copy, 'meta');
      });
  }
  /** Opens a locked token: asks for the lock passphrase, then sync resumes. */
  function nbUnlock(){
    if (!NB.locked) return Promise.resolve(true);
    return new Promise(function(resolve){
      nbPrompt('گذرواژهٔ قفل توکن', '', function(pass){
        if (!pass) return resolve(false);
        nbDecrypt(C.tokenEnc, pass).then(function(token){
          NB.tokenPass = pass; NB.locked = false; C.token = token;
          return Promise.all(nbProfiles().map(function(pr){
            return pr.tokenEnc ? nbDecrypt(pr.tokenEnc, pass).then(function(t){ pr.token = t; }, function(){}) : null;
          }));
        }).then(function(){
          nbSay(); toast('توکن باز شد', 'check');
          if (C.repo) nbSchedulePull(300);
          resolve(true);
        }, function(){ toast('گذرواژهٔ قفل درست نیست', 'x'); resolve(false); });
      });
      var el = $('nbMiniInput');
      if (el) el.type = 'password';
    });
  }
  /** Every notebook keeps its own working copy, so switching repositories never mixes notes. */
  function nbStoreSuffix(){ return ':' + (C && C.repo ? C.repo.replace(/[^\w.-]/g, '_') : 'local'); }
  /**
   * What goes to IndexedDB for one note. A secret note is stored without anything decrypted: its unsent text
   * travels as `localCipher` (encrypted with the session passphrase), and plaintext fields are dropped.
   */
  function nbPersistable(f){
    if (!f.enc) return Promise.resolve(f);
    var copy = Object.assign({}, f);
    delete copy.plain; delete copy.basePlain; delete copy._ct;
    if (!nbIsEncrypted(copy.text || '')) copy.text = '';
    if (!nbIsEncrypted(copy.base || '')) copy.base = '';
    if (f.plain != null && f.dirty && NB.pass){
      return nbEncrypt(f.plain, NB.pass, NB.localSalt).then(function(ct){ f.localCipher = ct; copy.localCipher = ct; return copy; });
    }
    return Promise.resolve(copy);
  }
  function nbSaveFiles(){
    // the store is named now: encrypting is asynchronous, and the notebook may be switched meanwhile
    var list = NB.paths.map(function(p){ return NB.files[p]; }).filter(Boolean), key = 'all' + nbStoreSuffix();
    nbIdxInvalidate();
    return Promise.all(list.map(nbPersistable)).then(function(files){
      return idbSet(key, { at: Date.now(), files: files }, 'notes');
    });
  }
  function nbSaveAttach(){
    var list = Object.keys(NB.attach || {}).map(function(k){ return NB.attach[k]; });
    return idbSet('attach' + nbStoreSuffix(), { at: Date.now(), files: list }, 'queue');
  }
  function nbLoadFiles(){
    NB.files = {}; NB.paths = []; NB.attach = {}; NB.lastCommit = ''; NB.lastSync = 0;
    return Promise.all([idbGet('all' + nbStoreSuffix(), 'notes'), idbGet('nb-last' + nbStoreSuffix(), 'meta'), idbGet('attach' + nbStoreSuffix(), 'queue')]).then(function(r){
      if (r[0] && Array.isArray(r[0].files)) r[0].files.forEach(function(f){ if (f && f.path){ NB.files[f.path] = f; if (NB.paths.indexOf(f.path) === -1) NB.paths.push(f.path); } });
      if (r[1] && typeof r[1] === 'object'){ NB.lastCommit = r[1].commit || ''; NB.lastSync = r[1].at || 0; }
      if (r[2] && Array.isArray(r[2].files)) r[2].files.forEach(function(a){ if (a && a.path) NB.attach[a.path] = a; });
      nbIdxInvalidate();
      return true;
    });
  }
  function nbLoad(){
    return idbGet('nb-cfg', 'meta').then(function(saved){
      C = NB.cfg = Object.assign({}, NB_DEFAULTS, saved || {});
      NB.locked = !!(C.lockToken && C.tokenEnc && !C.token);
      if (!Array.isArray(C.collections) || !C.collections.length) C.collections = NB_DEFAULTS.collections.slice();
      if (!Array.isArray(C.profiles)) C.profiles = [];
      NB.section = 'notes';
      return nbLoadFiles().then(function(){
        NB.loaded = true;
        nbCountDirty(); nbRender(); nbSay(); nbCheckShare();
        if (C.repo && C.token) nbSchedulePull(1500);
        return true;
      });
    }).catch(function(){ NB.loaded = true; C = NB.cfg = Object.assign({}, NB_DEFAULTS); NB.files = {}; NB.paths = []; NB.attach = {}; nbSay(); return false; });
  }
  function nbSchedulePull(ms){
    clearTimeout(NB.pullTimer);
    NB.pullTimer = setTimeout(function(){ NB.lastPull = Date.now(); nbPull({ quiet: true }); }, ms || 1500);
  }

  /* --- GitHub transport (the Git Data API, so many files land in one commit) --- */
  function nbError(status, msg){ var e = new Error(msg); e.status = status; return e; }
  function nbIsGL(){ return (C && C.provider) === 'gitlab'; }
  function nbApi(method, path, body, raw){
    var url = /^https?:/.test(path) ? path : (nbIsGL() ? 'https://gitlab.com/api/v4' : 'https://api.github.com') + path;
    var headers = nbIsGL()
      ? { 'Accept': raw ? 'text/plain' : 'application/json' }
      : { 'Accept': raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (C && C.token) headers[nbIsGL() ? 'PRIVATE-TOKEN' : 'Authorization'] = nbIsGL() ? C.token : 'Bearer ' + C.token;
    var init = { method: method, headers: headers };
    if (body !== undefined && body !== null){ headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch(url, init).then(function(res){
      var ctype = res.headers.get('content-type') || '';
      if (raw && res.ok) return res.text();
      if (ctype.indexOf('json') === -1){
        if (!res.ok) throw nbError(res.status, 'پاسخ نامنتظر از گیت هاب (' + res.status + ')');
        return res.text();
      }
      return res.json().then(function(data){
        if (res.ok) return data;
        var left = res.headers.get('x-ratelimit-remaining');
        if ((res.status === 403 || res.status === 429) && left === '0') throw nbError(403, 'سهم درخواست های گیت هاب تمام شد — کمی بعد دوباره تلاش کن');
        var msg = (data && data.message) || ('خطای گیت هاب (' + res.status + ')');
        if (res.status === 401) msg = 'توکن پذیرفته نشد — توکن را دوباره بررسی کن';
        if (res.status === 404) msg = 'پیدا نشد — نام مخزن، شاخه یا مسیر را بررسی کن';
        if (res.status === 409 || res.status === 422) msg = 'نسخهٔ تازه تری روی مخزن هست';
        throw nbError(res.status, msg);
      });
    }, function(){
      throw nbError(0, 'اتصال به گیت هاب برقرار نشد' + (navigator.onLine === false ? ' — آفلاین هستی' : ''));
    });
  }
  function nbSplitRepo(){
    var m = String((C && C.repo) || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '').split('/');
    return m.length >= 2 && m[0] && m[1] ? { owner: m[0], name: m[1] } : null;
  }
  function nbB64(text){ return btoa(unescape(encodeURIComponent(text))); }
  function nbEncodePath(p){ return String(p).split('/').map(encodeURIComponent).join('/'); }
  function nbIsNote(p){
    for (var i = 0; i < IGNORE.length; i++){ if (p.indexOf(IGNORE[i]) === 0) return false; }
    return /\.(md|markdown|txt)$/i.test(p) || p === (C && C.configPath);
  }
  function nbLine(p, text, sha, extra){ return nbPutFile(p, text, sha, extra); }
  function nbPutFile(path, text, sha, extra){
    var f = NB.files[path] || { path: path, text: '', base: '', sha: '', dirty: false, at: 0 };
    f.text = text; f.sha = sha || ''; f.at = Date.now();
    if (extra) Object.keys(extra).forEach(function(k){ f[k] = extra[k]; });
    NB.files[path] = f;
    if (NB.paths.indexOf(path) === -1) NB.paths.push(path);
    return f;
  }
  function nbFoldersOf(path){
    var parts = String(path).split('/'), out = [], acc = '';
    for (var i = 0; i < parts.length - 1; i++){ acc = acc ? acc + '/' + parts[i] : parts[i]; out.push(acc); }
    return out;
  }
  function nbFolders(){ // every folder that exists because a note lives inside it
    var seen = {};
    NB.paths.forEach(function(p){
      var f = NB.files[p];
      if (p.slice(-1) === '/' || (f && !f.deleted)) nbFoldersOf(p.slice(-1) === '/' ? p.slice(0, -1) : p).forEach(function(d){ seen[d] = 1; });
    });
    NB.paths.forEach(function(p){ if (p.slice(-1) === '/') seen[p.slice(0, -1)] = 1; });
    return Object.keys(seen);
  }

  /* --- connection --- */
  /* --- provider layer: GitHub and GitLab behind the same four calls --- */
  function nbRepoInfo(){
    var sp = nbSplitRepo();
    if (!sp) return Promise.reject(nbError(0, 'نشانی مخزن را مثل «کاربر/مخزن» بنویس'));
    if (nbIsGL()){
      var g = nbGL();
      return nbApi('GET', '/projects/' + g.id).then(function(p){
        return { name: p.path_with_namespace, private: p.visibility !== 'public', writable: !!(p.permissions && p.permissions.project_access) };
      });
    }
    return nbApi('GET', '/repos/' + sp.owner + '/' + sp.name).then(function(info){
      return { name: info.full_name, private: info.private, writable: !!((info.permissions && info.permissions.push) || info.permissions === undefined) };
    });
  }
  function nbTest(){
    return nbRepoInfo().then(function(info){
      return nbRef().then(function(r){
        return { sha: r.sha, empty: !r.sha, writable: info.writable, name: info.name, private: info.private };
      }, function(e){
        if (e.status === 404 || e.status === 409) return { sha: '', empty: true, writable: info.writable, name: info.name, private: info.private };
        throw e;
      });
    }, function(e){
      if (e.status === 404 && !C.token) throw nbError(404, 'مخزن پیدا نشد — اگر خصوصی است، توکن هم بگذار');
      throw e;
    });
  }
  function nbRef(){
    if (nbIsGL()){
      var g = nbGL();
      return nbApi('GET', '/projects/' + g.id + '/repository/branches/' + encodeURIComponent(C.branch)).then(function(b){
        return { sha: b.commit.id };
      });
    }
    var sp = nbSplitRepo();
    return nbApi('GET', '/repos/' + sp.owner + '/' + sp.name + '/git/ref/heads/' + encodeURIComponent(C.branch)).then(function(ref){
      return { sha: ref.object.sha };
    });
  }
  function nbFileText(path, ref){
    if (nbIsGL()){
      var g = nbGL();
      return nbApi('GET', '/projects/' + g.id + '/repository/files/' + encodeURIComponent(path) + '/raw?ref=' + encodeURIComponent(ref || C.branch), null, true);
    }
    var sp = nbSplitRepo();
    return nbApi('GET', '/repos/' + sp.owner + '/' + sp.name + '/contents/' + nbEncodePath(path) + '?ref=' + encodeURIComponent(ref || C.branch), null, true);
  }
  function nbHistoryList(path){
    if (nbIsGL()){
      var g = nbGL();
      return nbApi('GET', '/projects/' + g.id + '/repository/commits?per_page=30&ref_name=' + encodeURIComponent(C.branch) + '&path=' + encodeURIComponent(path))
        .then(function(list){
          return (list || []).map(function(c){ return { sha: c.id, message: c.title || c.message, date: (c.committed_date || '').slice(0, 10) }; });
        });
    }
    var sp = nbSplitRepo();
    return nbApi('GET', '/repos/' + sp.owner + '/' + sp.name + '/commits?path=' + encodeURIComponent(path) + '&sha=' + encodeURIComponent(C.branch) + '&per_page=30')
      .then(function(list){
        return (list || []).map(function(c){ return { sha: c.sha, message: c.commit.message, date: String((c.commit.author && c.commit.author.date) || '').slice(0, 10) }; });
      });
  }
  /** One commit carrying every change, on either provider. */
  function nbCommitPush(changes, message, baseSha){
    if (nbIsGL()){
      var g = nbGL();
      var actions = changes.map(function(c){
        if (c.deleted) return { action: 'delete', file_path: c.path };
        var a = { action: c.exists ? 'update' : 'create', file_path: c.path };
        if (c.b64){ a.content = c.b64; a.encoding = 'base64'; } else a.content = c.text;
        return a;
      });
      return nbApi('POST', '/projects/' + g.id + '/repository/commits', { branch: C.branch, commit_message: message, actions: actions })
        .then(function(c){ return { sha: c.id }; });
    }
    var sp = nbSplitRepo(), base = '/repos/' + sp.owner + '/' + sp.name;
    // blobs go up four at a time; the tree keeps the order of the changes
    var tree = new Array(changes.length), next = 0;
    function worker(){
      if (next >= changes.length) return Promise.resolve(true);
      var i = next++, c = changes[i];
      if (c.deleted){ tree[i] = { path: c.path, mode: '100644', type: 'blob', sha: null }; return worker(); }
      return nbApi('POST', base + '/git/blobs', { content: c.b64 || nbB64(c.text), encoding: 'base64' }).then(function(blob){
        tree[i] = { path: c.path, mode: '100644', type: 'blob', sha: blob.sha };
        return worker();
      });
    }
    var workers = [];
    for (var w = 0; w < Math.min(4, changes.length); w++) workers.push(worker());
    // base_tree must name a tree: the base commit's own tree, so every untouched file stays
    var baseTree = baseSha ? nbApi('GET', base + '/git/commits/' + baseSha).then(function(c){
      if (!c || !c.tree || !c.tree.sha) throw nbError(0, 'درخت commit پایه خوانده نشد');
      return c.tree.sha;
    }) : Promise.resolve('');
    return Promise.all([baseTree].concat(workers))
      .then(function(r){
        var body = { tree: tree };
        if (r[0]) body.base_tree = r[0];
        return nbApi('POST', base + '/git/trees', body);
      })
      .then(function(treeRes){
        return nbApi('POST', base + '/git/commits', { message: message, tree: treeRes.sha, parents: baseSha ? [baseSha] : [] });
      })
      .then(function(commit){
        if (baseSha) return nbApi('PATCH', base + '/git/refs/heads/' + encodeURIComponent(C.branch), { sha: commit.sha }).then(function(){ return commit; });
        return nbApi('POST', base + '/git/refs', { ref: 'refs/heads/' + C.branch, sha: commit.sha }).then(function(){ return commit; });
      });
  }

  /* --- pull: one request for the whole tree, one per changed file --- */
  function nbTreeOnce(sha, page){
    if (nbIsGL()){
      var g = nbGL();
      return nbApi('GET', '/projects/' + g.id + '/repository/tree?recursive=true&per_page=100&ref=' + encodeURIComponent(sha || C.branch) + (page > 1 ? '&page=' + page : ''))
        .then(function(list){ return (list || []).map(function(e){ return { path: e.path, type: e.type === 'tree' ? 'tree' : 'blob', sha: e.id }; }); });
    }
    var sp = nbSplitRepo();
    return nbApi('GET', '/repos/' + sp.owner + '/' + sp.name + '/git/trees/' + sha + '?recursive=1')
      .then(function(tree){ return (tree.tree || []).map(function(e){ return { path: e.path, type: e.type, sha: e.sha }; }); });
  }
  function nbRemoteTree(){
    return nbRef().then(function(r){
      var sha = r.sha;
      if (sha === NB.lastCommit && sha) return { sha: sha, unchanged: true, entries: [] };
      var all = [];
      function page(n){
        return nbTreeOnce(sha, n).then(function(list){
          all = all.concat(list);
          var blobs = list.filter(function(e){ return e.type === 'blob'; });
          if (nbIsGL() && blobs.length >= 100 && n < 6) return page(n + 1);
          return all;
        });
      }
      return page(1).then(function(entries){
        return {
          sha: sha, unchanged: false,
          entries: entries.filter(function(e){ return e.type === 'blob' && nbIsNote(e.path); }),
          attach: entries.filter(function(e){ return e.type === 'blob' && nbIsAttachment(e.path) && !/\/$/.test(e.path); })
        };
      });
    }, function(e){
      if (e.status === 404 || e.status === 409) return { sha: '', unchanged: false, entries: [], empty: true };
      throw e;
    });
  }
  function nbPull(opts){
    opts = opts || {};
    if (NB.locked){
      if (!opts.loud){ nbSay(); return Promise.resolve(false); }
      return nbUnlock().then(function(ok){ return ok ? nbPull(opts) : false; });
    }
    if (NB.busy) return Promise.resolve(false);
    if (!C || !C.repo){ nbSay('off'); if (opts.loud) toast('اول مخزن را در تنظیمات دفترچه بگذار', 'x'); return Promise.resolve(false); }
    NB.busy = true; nbSay('sync');
    return nbRemoteTree().then(function(tree){
      if (tree.unchanged){ NB.busy = false; nbSay(); if (opts.loud) toast('چیز تازه ای نیست', 'check'); return false; }
      var remote = {};
      tree.entries.forEach(function(en){ remote[en.path] = en; });
      (tree.attach || []).forEach(function(en){
        var a = NB.attachMeta[en.path];
        if (!a || a.sha !== en.sha) NB.attachMeta[en.path] = { path: en.path, sha: en.sha, remote: true };
      });
      var jobs = tree.entries.filter(function(en){
        var local = NB.files[en.path];
        return !(local && local.sha === en.sha && !local.dirty);
      });
      var gone = NB.paths.filter(function(p){
        var f = NB.files[p];
        return f && !f.deleted && !f.isNew && p.slice(-1) !== '/' && !remote[p];
      });
      var chain = Promise.resolve(), pulled = 0, merged = 0;
      jobs.forEach(function(job){
        chain = chain.then(function(){
          var local = NB.files[job.path];
          return nbFileText(job.path).then(function(text){
            var enc = nbIsEncrypted(text);
            if (local && local.enc){
              if (!local.dirty){
                // nothing unsent here: take theirs, and keep it open if it was open
                var reopen = local.plain != null && NB.pass && enc;
                return (reopen ? nbDecrypt(text, NB.pass).catch(function(){ return null; }) : Promise.resolve(null)).then(function(plain){
                  nbPutFile(job.path, text, job.sha, { base: text, basePlain: plain, dirty: false, isNew: false, enc: enc, plain: enc ? plain : null, remote: true });
                  delete NB.files[job.path].localCipher;
                  nbRefreshOpenTab(job.path, true);
                  pulled++;
                  return true;
                });
              }
              // both sides changed a secret note: decrypt base, mine and theirs and compare plain to plain
              return (NB.pass ? Promise.resolve(NB.pass) : nbAskPass(true)).then(function(pass){
                if (!pass) throw nbError(0, 'locked');
                NB.pass = pass;
                return Promise.all([
                  local.plain != null ? local.plain : nbDecrypt(local.localCipher || local.text, pass),
                  local.basePlain != null ? local.basePlain : (nbIsEncrypted(local.base || '') ? nbDecrypt(local.base, pass) : ''),
                  enc ? nbDecrypt(text, pass) : text
                ]);
              }).then(function(r){
                var mine = r[0], base = r[1], theirs = r[2], mg = nbMerge3(base, mine, theirs);
                if (!mg.conflicts.length){
                  nbPutFile(job.path, text, job.sha, { base: text, basePlain: theirs, enc: true, plain: mg.text, dirty: mg.text !== theirs, remote: true });
                  nbRefreshOpenTab(job.path, true);
                  merged++;
                  return true;
                }
                NB.conflicts.push({ path: job.path, mine: mine, theirs: theirs, base: base, theirsSha: job.sha, theirsCipher: text, enc: true, merged: true });
                return false;
              }, function(){
                // cannot be opened here: it waits, unsent, until the passphrase is given
                NB.conflicts.push({ path: job.path, locked: true, theirsSha: job.sha, enc: true });
                return false;
              });
            }
            if (local && local.dirty && local.base !== text){
              // both sides moved: merge what can be merged, and only then ask the user
              var mg2 = nbMerge3(local.base || '', local.text, text);
              if (!mg2.conflicts.length){
                nbPutFile(job.path, mg2.text, job.sha, { base: text, dirty: true, remote: true });
                nbRefreshOpenTab(job.path, true);
                merged++;
                return true;
              }
              NB.conflicts.push({ path: job.path, mine: local.text, theirs: text, base: local.base, theirsSha: job.sha, merged: true });
              return false;
            }
            var keepPlain = enc && local ? local.plain : null;
            nbPutFile(job.path, enc ? text : text, job.sha, { base: text, dirty: false, isNew: false, enc: enc, plain: enc ? (keepPlain != null ? keepPlain : null) : null, remote: true });
            nbRefreshOpenTab(job.path);
            pulled++;
            return true;
          }).catch(function(e){
            if (e.status === 404 || e.status === 403) return false; // too big or gone: leave it as it is
            throw e;
          });
        });
      });
      gone.forEach(function(p){
        chain = chain.then(function(){
          var f = NB.files[p];
          if (f.dirty) return false;
          delete NB.files[p];
          NB.paths = NB.paths.filter(function(x){ return x !== p; });
          nbCloseTabFor(p, false);
          return true;
        });
      });
      return chain.then(function(){
        nbApplyRepoConfig();
        NB.lastCommit = tree.sha; NB.lastSync = Date.now(); NB.error = '';
        idbSet('nb-last' + nbStoreSuffix(), { commit: NB.lastCommit, at: NB.lastSync }, 'meta');
        return nbSaveFiles();
      }).then(function(){
        var n = pulled + gone.length;
        nbIdxInvalidate();
        nbCountDirty(); nbRender(); NB.busy = false;
        if (NB.conflicts.length){ nbSay('conflict'); nbShowConflicts(); }
        else {
          nbSay();
          if (merged && !opts.quiet) toast(faNum(merged) + ' یادداشت خودکار ادغام شد', 'swap');
          else if (!opts.quiet && n) toast('دفترچه به روز شد — ' + faNum(n) + ' یادداشت', 'check');
        }
        return true;
      });
    }).catch(function(e){
      NB.busy = false;
      NB.error = (e && e.message) || 'خطا';
      nbSay(navigator.onLine === false ? 'offline' : 'error');
      if (opts.loud) toast(NB.error, 'x');
      return false;
    });
  }
  function nbRefreshOpenTab(path, force){
    var t = nbTabFor(path), f = NB.files[path];
    if (!t || !f || (f.dirty && !force)) return;
    t.secret = !!f.enc;
    if (f.enc && f.plain == null){                // locked again (taken from the repository): it reopens on demand
      t.text = '';
      if (t.id === activeTab){ ta.value = ''; render(); nbAfterSwitch(); }
      return;
    }
    t.text = nbTextOf(f);
    if (t.id === activeTab){
      ta.value = nbTextOf(f);
      if (typeof render === 'function') render();
    } else {
      drawTabs();
    }
  }

  /* --- push: blobs -> tree -> commit -> ref, one commit for every pending change --- */
  function nbDirtyList(){
    return NB.paths.map(function(p){ return NB.files[p]; }).filter(function(f){ return f && (f.dirty || f.deleted); });
  }
  function nbPush(opts){
    opts = opts || {};
    if (NB.locked){
      if (!opts.loud){ nbSay(); return Promise.resolve(false); }
      return nbUnlock().then(function(ok){ return ok ? nbPush(opts) : false; });
    }
    if (NB.busy) return Promise.resolve(false);
    if (NB.conflicts.length && !opts.force){ nbShowConflicts(); toast('اول تعارض ها را حل کن', 'x'); return Promise.resolve(false); }
    nbSyncActiveNote();
    var list = nbDirtyList();
    var atts = Object.keys(NB.attach || {}).filter(function(k){ return NB.attach[k].dirty; });
    if (!list.length && !atts.length){ if (opts.loud) toast('تغییری برای ارسال نیست', 'check'); return Promise.resolve(false); }
    if (!C.repo || !C.token){ nbSay('off'); if (opts.loud) toast('اول مخزن و توکن را در تنظیمات دفترچه بگذار', 'x'); return Promise.resolve(false); }
    NB.busy = true; nbSay('sync');
    var baseSha = '';
    return nbRef().then(function(r){
      baseSha = r.sha;
      if (NB.lastCommit && baseSha && baseSha !== NB.lastCommit && !opts.retried){
        // the branch moved after our last pull: take their changes first, then send ours again
        NB.busy = false;
        return nbPull({ quiet: true }).then(function(){
          if (!nbDirtyList().length && !Object.keys(NB.attach).some(function(k){ return NB.attach[k].dirty; })){
            toast('دیگری جلوتر بود — چیزی برای ارسال نماند', 'check');
            return false;
          }
          return nbPush({ retried: true, force: opts.force, loud: opts.loud });
        });
      }
      return true;
    }, function(e){
      if (e.status === 404 || e.status === 409) return true; // brand new repository: no commits yet
      throw e;
    }).then(function(go){
      if (go !== true) return go;
      var changes = [], chain = Promise.resolve();
      list.forEach(function(fd){
        chain = chain.then(function(){
          if (fd.deleted){ changes.push({ path: fd.path, deleted: true }); return true; }
          if (fd.enc){
            return nbEnsurePlain(fd.path).then(function(ok){
              if (!ok || !NB.pass) throw nbError(0, 'یادداشت رمزدار «' + nbTitle(fd.path) + '» باز نشد — بدون گذرواژه ارسال نمی شود');
              return nbEncrypt(fd.plain, NB.pass);
            }).then(function(ct){
              fd._ct = ct;
              changes.push({ path: fd.path, text: ct, exists: !!fd.remote });
              return true;
            });
          }
          changes.push({ path: fd.path, text: fd.text, exists: !!fd.remote });
          return true;
        });
      });
      atts.forEach(function(k){
        chain = chain.then(function(){
          var a = NB.attach[k];
          if (a.deleted){ changes.push({ path: k, deleted: true }); return true; }
          changes.push({ path: k, b64: a.b64, exists: !!(NB.attachMeta[k] && NB.attachMeta[k].remote) });
          return true;
        });
      });
      var message = nbCommitMessage(list.length ? list : atts.map(function(k){ return { path: k }; }));
      return chain.then(function(){ return nbCommitPush(changes, message, baseSha); })
        .then(function(commit){
          list.forEach(function(fd){
            if (fd.deleted){ delete NB.files[fd.path]; NB.paths = NB.paths.filter(function(p){ return p !== fd.path; }); return; }
            if (fd.enc && fd._ct){                    // the working copy keeps the ciphertext that went up
              fd.text = fd.base = fd._ct; fd.basePlain = fd.plain;
              delete fd._ct; delete fd.localCipher;
            } else fd.base = fd.text;
            fd.dirty = false; fd.isNew = false; fd.sha = ''; fd.remote = true; fd.at = Date.now();
          });
          Object.keys(NB.attach).forEach(function(k){
            var a = NB.attach[k];
            if (a.deleted && a.dirty){ delete NB.attach[k]; return; }
            a.dirty = false;
            NB.attachMeta[k] = { path: k, sha: '', remote: true };
          });
          NB.lastCommit = commit.sha; NB.lastSync = Date.now(); NB.error = '';
          idbSet('nb-last' + nbStoreSuffix(), { commit: NB.lastCommit, at: NB.lastSync }, 'meta');
          return Promise.all([nbSaveFiles(), nbSaveAttach()]);
        })
        .then(function(){
          nbCountDirty(); nbRender(); NB.busy = false; nbSay();
          if (opts.loud) toast('ارسال شد — ' + message, 'cloud');
          return true;
        });
    }).catch(function(e){
      NB.busy = false;
      var conflict = !!(e && (e.status === 409 || e.status === 422));
      NB.error = conflict ? 'نسخهٔ تازه تری روی مخزن هست' : ((e && e.message) || 'خطا');
      nbSay(conflict ? 'conflict' : (navigator.onLine === false ? 'offline' : 'error'));
      toast(NB.error, 'x');
      return false;
    });
  }


  /* --- the notes themselves --- */
  function nbTitle(path){ return String(path).split('/').pop().replace(/\.(md|markdown|txt)$/i, ''); }
  function nbFolder(path){ var parts = String(path).split('/'); parts.pop(); return parts.join('/'); }
  function nbFind(path){ return NB.files[path]; }
  /** A secret note keeps its plaintext in `plain` (what you edit) and its ciphertext in `text` (what git gets). */
  function nbTextOf(f){ return (f && f.enc && f.plain != null) ? f.plain : (f ? f.text : ''); }
  function nbStoreText(f, text){
    if (!f) return;
    if (f.enc) f.plain = text; else f.text = text;
    f.dirty = true; f.at = Date.now();
    nbCountDirty();
  }
  /** Folders kept read-only (settings → «پوشه های فقط خواندنی»); empty by default. */
  function nbReadOnly(path){
    return (C.readonlyFolders || []).some(function(f){
      var pre = String(f || '').replace(/\/+$/, '');
      return !!pre && (path === pre || path.indexOf(pre + '/') === 0);
    });
  }
  function nbApplyReadOnly(){
    var t = currentTab();
    var ro = !!(t && t.nb && nbReadOnly(t.nb));
    ta.readOnly = ro;
    body.classList.toggle('nb-ro', ro);
    if (ro) toast('این پوشه فقط خواندنی است — برای ویرایش یک کپی بساز', 'lock');
  }
  function nbWrite(path, text, opts){
    opts = opts || {};
    var f = NB.files[path];
    if (!f){ f = nbPutFile(path, text, '', { base: '', dirty: true, isNew: true, deleted: false }); }
    else { f.text = text; f.dirty = true; f.deleted = false; f.at = Date.now(); }
    nbCountDirty(); nbStatus(); nbRender(); nbSaveFiles();
    if (C.auto) nbScheduleCommit();
    return f;
  }
  function nbDeleteOne(path){
    var f = NB.files[path];
    if (!f) return false;
    f.deleted = true; f.dirty = true; f.at = Date.now();
    nbCloseTabFor(path, false);
    return true;
  }
  function nbDeletePath(path){
    var n = 0;
    if (path.slice(-1) === '/' || !NB.files[path]){
      var prefix = path.replace(/\/$/, '') + '/';
      NB.paths.slice().forEach(function(p){
        if (p.slice(-1) === '/' ? p.indexOf(prefix) === 0 || p === prefix : p.indexOf(prefix) === 0){
          if (p.slice(-1) === '/'){ NB.paths = NB.paths.filter(function(x){ return x !== p; }); }
          else if (nbDeleteOne(p)) n++;
        }
      });
    } else if (nbDeleteOne(path)) n++;
    nbCountDirty(); nbRender(); nbStatus(); nbSaveFiles();
    if (C.auto) nbScheduleCommit();
    return n;
  }
  function nbMoveNote(oldPath, newPath){
    if (!oldPath || !newPath || oldPath === newPath) return false;
    if (NB.files[newPath] && !NB.files[newPath].deleted){ toast('یادداشتی با همین نام هست', 'x'); return false; }
    if (NB.files[newPath]) delete NB.files[newPath];     // the placeholder left behind by the move that brought it here
    var f = NB.files[oldPath];
    if (!f) return false;
    var wasNew = !!f.isNew;
    var copy = Object.assign({}, f, { path: newPath, dirty: true, isNew: wasNew, deleted: false, at: Date.now(), movedFrom: wasNew ? '' : oldPath });
    NB.files[newPath] = copy;
    if (NB.paths.indexOf(newPath) === -1) NB.paths.push(newPath);
    if (wasNew){ delete NB.files[oldPath]; NB.paths = NB.paths.filter(function(p){ return p !== oldPath; }); }
    else { f.deleted = true; f.dirty = true; }
    nbRetargetTab(oldPath, newPath);
    nbCountDirty(); nbRender(); nbStatus(); nbSaveFiles();
    if (C.auto) nbScheduleCommit();
    return true;
  }
  function nbNewNote(collection, date, title, opts){
    opts = opts || {};
    var col = typeof collection === 'string' ? C.collections.filter(function(c){ return c.id === collection; })[0] : collection;
    if (!col) col = C.collections[0];
    var ctx = nbCtx(date, nbSlug(title || ''), C.weekStart);
    var path = nbFillPath(col.path, ctx);
    if (opts.folder) path = String(opts.folder).replace(/\/+$/, '') + '/' + path.split('/').pop();
    if (NB.files[path] && !NB.files[path].deleted && !opts.overwrite) return { path: path, exists: true };
    var tpl = (col.template && NB.files[col.template]) ? NB.files[col.template].text : (NB_TEMPLATES[col.template] || '');
    var filled = nbFillTemplate(tpl, ctx, { prev: nbNeighbour(ctx, col, -1), next: nbNeighbour(ctx, col, 1) });
    nbWrite(path, filled.text);
    return { path: path, cursor: filled.cursor, exists: false };
  }
  function nbNeighbour(ctx, col, dir){
    if (!/day/.test(col.calendar || '')) return '';
    var p = (ctx && ctx.gdate ? ctx.gdate : '').split('-');
    var d = p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date();
    for (var step = 0; step < 400; step++){
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + dir);
      var p2 = nbFillPath(col.path, nbCtx(d, '', C.weekStart));
      if (NB.files[p2] && !NB.files[p2].deleted) return nbTitle(p2);
    }
    return '';
  }

  /* --- tabs: a notebook note is a tab that knows its path --- */
  function nbTabFor(path){ return tabs.filter(function(t){ return t.nb === path; })[0]; }
  function nbRetargetTab(oldPath, newPath){
    tabs.forEach(function(t){ if (t.nb === oldPath){ t.nb = newPath; t.name = nbTitle(newPath); } });
    drawTabs();
  }
  function nbCloseTabFor(path, silent){
    var t = nbTabFor(path);
    if (!t) return false;
    if (!silent) closeTab(t.id);
    return true;
  }
  function nbOpen(path, at){
    var f = NB.files[path];
    if (!f){ toast('این یادداشت پیدا نشد', 'x'); return; }
    if (f.deleted){ toast('این یادداشت حذف شده', 'x'); return; }
    if (f.enc && f.plain == null){
      nbEnsurePlain(path).then(function(ok){ if (ok) nbOpen(path, at); });
      return;
    }
    var t = nbTabFor(path);
    if (t){
      switchTab(t.id);
      nbApplyReadOnly();                       // switchTab may return early when it is already the current tab
      if (typeof at === 'number'){ ta.focus(); ta.setSelectionRange(at, at); }
      return;
    }
    syncActiveTab();
    var text = nbTextOf(f);
    var fresh = { id: tabId(), text: text, fmt: 'markdown', undo: [], redo: [], nb: path, name: nbTitle(path), secret: !!f.enc };
    var cur = currentTab(), at2 = cur ? tabs.indexOf(cur) : -1;
    tabs.splice(at2 + 1, 0, fresh);
    activeTab = fresh.id;
    ta.value = text;
    undoStack = fresh.undo; redoStack = fresh.redo;
    setFormat('markdown');
    nbApplyReadOnly();
    drawTabs(); saveState(); render();
    ipSync();
    if (typeof at === 'number'){ ta.focus(); ta.setSelectionRange(at, at); }
    nbRender();
  }
  /** Called after any tab switch (the app's switchTab is patched to call it): secret notes and read-only ones. */
  function nbAfterSwitch(){
    var t = currentTab();
    nbSuggestClose();
    if (!t || !t.nb){ ta.readOnly = false; body.classList.remove('nb-ro'); return; }
    var f = NB.files[t.nb];
    t.secret = !!(f && f.enc);
    if (f && f.enc && f.plain == null){
      nbEnsurePlain(t.nb).then(function(ok){
        if (!ok) return;
        t.text = nbTextOf(f);
        if (t.id === activeTab){ ta.value = t.text; render(); }
        nbApplyReadOnly();
      });
      return;
    }
    nbApplyReadOnly();
  }
  function nbSyncActiveNote(){
    var t = currentTab();
    if (!t || !t.nb) return false;
    var f = NB.files[t.nb];
    if (!f) return false;
    if (nbTextOf(f) !== ta.value){ nbStoreText(f, ta.value); nbCountDirty(); }
    return true;
  }
  /* typing in a notebook tab updates the working copy right away; the commit waits for a pause */
  document.addEventListener('input', function(e){
    if (e.target !== ta) return;
    var t = currentTab();
    if (!t || !t.nb) return;
    var f = NB.files[t.nb];
    if (!f) return;
    nbStoreText(f, ta.value);
    nbStatus();
    nbMaybeSuggest();
    if (NB.open) nbRenderKeep();
    clearTimeout(nbTypingSave);
    nbTypingSave = setTimeout(nbSaveFiles, 1500);
    if (C.auto) nbScheduleCommit();
  }, true);
  var nbTypingSave = 0;
  function nbScheduleCommit(){
    if (!C || !C.auto) return;
    clearTimeout(NB.timer);
    NB.timer = setTimeout(function(){ nbPush({}); }, Math.max(5, +C.idleSeconds || 20) * 1000);
  }

  /* --- sync state --- */
  var NB_STATES = {
    off: { t: 'دفترچه وصل نیست', c: 'nb-off' },
    sync: { t: 'در حال همگام سازی…', c: 'nb-busy' },
    ok: { t: 'همگام', c: 'nb-ok' },
    pending: { t: 'تغییر منتظر ارسال', c: 'nb-pending' },
    conflict: { t: 'تعارض', c: 'nb-conflict' },
    offline: { t: 'آفلاین — بعدا ارسال می شود', c: 'nb-off' },
    error: { t: 'خطای اتصال', c: 'nb-error' },
    locked: { t: 'توکن قفل است — برای باز کردن کلیک کن', c: 'nb-off' }
  };
  function nbSay(state){
    if (state) NB.state = state;
    else if (NB.locked) NB.state = 'locked';
    else if (NB.busy) NB.state = 'sync';
    else if (NB.conflicts.length) NB.state = 'conflict';
    else if (navigator.onLine === false) NB.state = 'offline';
    else if (nbCountDirty()) NB.state = 'pending';
    else if (C && C.repo) NB.state = 'ok';   // read-only is fine without a token on a public repository
    else NB.state = 'off';
    nbStatus();
  }
  /** On a phone the chip has no room for a sentence: a sign and a count are enough. */
  function nbShortLabel(state, n){
    if (state === 'ok') return 'همگام';
    if (state === 'sync') return '…';
    if (state === 'pending') return '↑' + faNum(n);
    if (state === 'conflict') return 'تعارض';
    if (state === 'offline') return 'آفلاین';
    if (state === 'error') return 'خطا';
    if (state === 'locked') return 'قفل';
    return 'دفترچه';
  }
  function nbStatus(){
    var el = $('nbSync');
    if (!el) return;
    var s = NB_STATES[NB.state] || NB_STATES.off, n = nbCountDirty();
    el.className = 'st-nb ' + s.c;
    el.setAttribute('aria-expanded', String(!$('nbSyncPop').hidden));
    el.title = (NB.state === 'error' && NB.error) ? NB.error : s.t;
    var full = s.t + ((n && (NB.state === 'pending' || NB.state === 'conflict' || NB.state === 'offline')) ? ' ' + faNum(n) : '');
    $('nbSyncText').textContent = innerWidth < 700 ? nbShortLabel(NB.state, n || 0) : full;
    // the chip shows up once the notebook is in use; until then the toolbar button is the way in
    el.hidden = !(C && (C.repo || NB.paths.length));
  }
  function nbAutoTick(){
    if (document.hidden) return;
    if (!C || !C.repo || !C.token) return;
    if (Date.now() - NB.lastPull > 5 * 60 * 1000){ NB.lastPull = Date.now(); nbPull({ quiet: true }); }
  }

  /* --- sidebar: a drawer from the right, opening right under the tab strip --- */
  /** The drawer and the rail share the slot between the tab strip and the status bar. */
  function nbSlot(){
    var tabsBar = $('tabs'), foot = document.querySelector('footer.status');
    var top = tabsBar ? Math.max(0, tabsBar.getBoundingClientRect().bottom) : 96;
    var bot = foot ? Math.max(0, innerHeight - foot.getBoundingClientRect().top) : 28;
    ['nb', 'nbRail'].forEach(function(id){
      var el = $(id);
      if (!el) return;
      el.style.setProperty('--nb-top', Math.round(top) + 'px');
      el.style.setProperty('--nb-bottom', Math.round(bot) + 'px');
    });
  }
  function nbSidebar(force, remember){
    var was = NB.open;
    NB.open = force === undefined ? !NB.open : !!force;
    if (innerWidth <= 760 && NB.open !== was && NB.open) nbLayerPushed();
    if (NB.open) nbSlot();
    body.classList.toggle('nb-open', NB.open);
    if ($('btnNotebook')) $('btnNotebook').setAttribute('aria-pressed', String(NB.open));
    if (remember !== false) storeSet('fs2-nbopen', NB.open ? '1' : '0');
    if (typeof nbShellSync === 'function') nbShellSync();
    if (NB.open) nbRender();
  }
  function nbRenderKeep(){
    if (NB.open) nbRender(); else nbStatus();
    var pop = $('nbSyncPop');
    if (pop && !pop.hidden && !pop.querySelector('.nb-diff')){ pop.innerHTML = nbSyncPopHtml(); nbSyncPopWire(); }
  }
  function nbTree(){
    var root = { name: '', folders: {}, notes: [] };
    function ensure(parts){
      var node = root;
      parts.forEach(function(seg){
        if (!node.folders[seg]) node.folders[seg] = { name: seg, folders: {}, notes: [] };
        node = node.folders[seg];
      });
      return node;
    }
    nbFolders().forEach(function(f){ ensure(f.split('/')); });
    NB.paths.forEach(function(p){
      var f = NB.files[p];
      if (p.slice(-1) === '/' || !f || f.deleted) return;
      var parts = p.split('/'), file = parts.pop();
      ensure(parts).notes.push({ path: p, file: f });
    });
    var atts = {};
    Object.keys(NB.attach || {}).forEach(function(k){ atts[k] = 1; });
    Object.keys(NB.attachMeta || {}).forEach(function(k){ atts[k] = 1; });
    Object.keys(atts).forEach(function(k){
      var a = NB.attach[k] || NB.attachMeta[k];
      if (a && a.deleted) return;
      var parts = k.split('/'), file = parts.pop();
      ensure(parts).notes.push({ path: k, file: null, att: true });
    });
    return root;
  }
  function nbCountUnder(node){
    var n = node.notes.length;
    Object.keys(node.folders).forEach(function(k){ n += nbCountUnder(node.folders[k]); });
    return n;
  }
  function nbTreeHtml(node, depth, prefix, activePath){
    var out = '';
    Object.keys(node.folders).sort(function(a, b){ return nbNorm(a).localeCompare(nbNorm(b)); }).forEach(function(k){
      var child = node.folders[k], full = prefix ? prefix + '/' + k : k;
      var open = NB.expanded[full] !== false, count = nbCountUnder(child);
      out += '<div class="nb-row nb-dir-row' + (open ? ' open' : '') + '" data-nb-dir="' + escapeHtml(full) + '" tabindex="0" role="button">'
        + '<span class="nb-caret">' + icon('chev') + '</span>' + icon('folder')
        + '<span class="nb-name" dir="auto">' + escapeHtml(child.name) + '</span>'
        + '<span class="nb-count">' + (count ? faNum(count) : '') + '</span></div>';
      if (open) out += '<div class="nb-kids">' + nbTreeHtml(child, depth + 1, full, activePath) + '</div>';
    });
    node.notes.sort(function(a, b){ return nbNorm(a.path).localeCompare(nbNorm(b.path)); }).forEach(function(n){
      if (n.att){
        out += '<div class="nb-row nb-note-row nb-att-row" data-nb-att="' + escapeHtml(n.path) + '" tabindex="0" title="' + escapeHtml(n.path) + '">'
          + icon('image') + '<span class="nb-name" dir="ltr">' + escapeHtml(n.path.split('/').pop()) + '</span>'
          + ((NB.attach[n.path] && NB.attach[n.path].dirty) ? '<i class="nb-mark"></i>' : '') + '</div>';
        return;
      }
      var f2 = n.file;
      out += '<div class="nb-row nb-note-row' + (activePath === n.path ? ' active' : '') + (f2.dirty ? ' dirty' : '') + '"'
        + ' data-nb-note="' + escapeHtml(n.path) + '" tabindex="0" title="' + escapeHtml(n.path) + '">'
        + icon(f2.enc ? 'lock' : 'file') + '<span class="nb-name" dir="auto">' + escapeHtml(nbTitle(n.path)) + '</span>'
        + (f2.dirty ? '<i class="nb-mark" title="تغییر ارسال نشده"></i>' : '') + '</div>';
    });
    return out;
  }
  function nbRender(){
    var box = $('nbBody');
    if (!box) return;
    var t = currentTab(), active = t && t.nb ? t.nb : '';
    var noteCount = NB.paths.filter(function(p){ return p.slice(-1) !== '/' && NB.files[p] && !NB.files[p].deleted; }).length;
    var html = '<div class="nb-tabs">'
      + nbTabBtn('notes', 'tree', 'دفترچه', noteCount)
      + nbTabBtn('temps', 'file', 'موقت', tabs.length)
      + nbTabBtn('search', 'search', 'جستجو', 0)
      + nbTabBtn('cal', 'clock', 'تقویم', 0)
      + nbTabBtn('tasks', 'check', 'کارها', typeof homeTasks === 'function' ? homeTasks().filter(function(x){ return !x.done; }).length : 0)
      + nbTabBtn('tags', 'hash', 'برچسب', 0)
      + (NB.conflicts.length ? nbTabBtn('conflicts', 'compare', 'تعارض', NB.conflicts.length, true) : '')
      + '</div><div class="nb-list" id="nbList">';
    if (NB.section === 'notes'){
      html += '<div class="nb-actions">'
        + '<button type="button" class="btn-soft sm" data-nb-act="new">' + icon('plus') + 'یادداشت جدید</button>'
        + '<button type="button" class="btn-soft sm" data-nb-act="pull" title="گرفتن تغییرهای تازه از مخزن">' + icon('redo') + 'گرفتن</button>'
        + '<button type="button" class="btn-soft sm" data-nb-act="push" title="ارسال تغییرها به مخزن">' + icon('cloud') + 'ارسال'
        + (nbCountDirty() ? '<b class="nb-badge">' + faNum(nbCountDirty()) + '</b>' : '') + '</button>'
        + '<button type="button" class="btn-soft sm" data-nb-act="quick" title="ثبت سریع (یک متن کوتاه، بی عنوان)">' + icon('pen') + 'ثبت سریع</button>'
        + '</div>';
      var tree = nbTree(), hasTree = Object.keys(tree.folders).length || tree.notes.length;
      html += hasTree ? nbTreeHtml(tree, 0, '', active)
        : '<div class="nb-empty">دفترچه خالی است.<br>«یادداشت جدید» را بزن یا از تنظیمات دفترچه، مخزن گیت هاب را وصل کن'
          + (C && C.repo ? ' و «گرفتن» را بزن تا یادداشت های مخزن بیایند.' : '.') + '</div>';
      if (active) html += nbBacklinksHtml(active);
    } else if (NB.section === 'temps'){
      html += nbTempsHtml();
    } else if (NB.section === 'search'){
      html += '<div class="nb-search">'
        + '<input class="nb-input" id="nbFind" type="search" dir="auto" placeholder="جستجو در همهٔ یادداشت ها…" value="' + escapeHtml(NB.query || '') + '">'
        + '<div class="nb-filters">'
        + '<select id="nbFindCol"><option value="">همهٔ مجموعه ها</option>'
        + C.collections.map(function(c){ return '<option value="' + escapeHtml(c.id) + '"' + (NB.colFilter === c.id ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'; }).join('')
        + '</select>'
        + (NB.tagFilter ? '<button type="button" class="nb-chip on" data-nb-tag="">#' + escapeHtml(NB.tagFilter) + ' ×</button>' : '')
        + '</div>'
        + '<div class="nb-res" id="nbRes">' + nbSearchHtml() + '</div></div>';
    } else if (NB.section === 'cal'){
      html += nbCalHtml();
    } else if (NB.section === 'tasks'){
      html += nbTasksHtml();
    } else if (NB.section === 'tags'){
      var tags = nbTagCounts();
      html += tags.length ? '<div class="nb-tags">' + tags.map(function(x){
        return '<button type="button" class="nb-chip' + (NB.tagFilter === x.tag ? ' on' : '') + '" data-nb-tag="' + escapeHtml(x.tag) + '">#' + escapeHtml(x.tag) + '<b>' + faNum(x.n) + '</b></button>';
      }).join('') + '</div>' : '<div class="nb-empty">برچسبی پیدا نشد.<br>برچسب ها از فرادادهٔ یادداشت و از #برچسب داخل متن خوانده می شوند.</div>';
    } else {
      html += NB.conflicts.map(function(c, i){
        if (c.locked) return '<div class="nb-conflict-row"><b dir="auto">' + escapeHtml(nbTitle(c.path)) + '</b><small dir="auto">' + escapeHtml(c.path) + '</small>'
          + '<small class="nb-warn">یادداشت رمزدار هم اینجا و هم روی مخزن عوض شده — برای مقایسه گذرواژه لازم است</small>'
          + '<div class="nb-cf-btns"><button type="button" class="btn-soft sm" data-nb-resolve="unlock" data-nb-ci="' + i + '">باز کردن و مقایسه</button></div></div>';
        return '<div class="nb-conflict-row"><b dir="auto">' + escapeHtml(nbTitle(c.path)) + '</b><small dir="auto">' + escapeHtml(c.path) + '</small>'
          + (c.merged ? '<small class="nb-warn">ادغام خودکار نشد — هر دو نسخه دست نخورده اند</small>' : '')
          + '<div class="nb-cf-btns">'
          + '<button type="button" class="btn-soft sm" data-nb-resolve="mine" data-nb-ci="' + i + '">نسخهٔ من</button>'
          + '<button type="button" class="btn-soft sm" data-nb-resolve="theirs" data-nb-ci="' + i + '">نسخهٔ مخزن</button>'
          + '<button type="button" class="btn-soft sm" data-nb-resolve="both" data-nb-ci="' + i + '">هر دو در دو تب</button>'
          + '<button type="button" class="btn-soft sm" data-nb-resolve="auto" data-nb-ci="' + i + '">ادغام خودکار</button>'
          + '</div></div>';
      }).join('') || '<div class="nb-empty">تعارضی نیست</div>';
    }
    html += '</div><div class="nb-foot" id="nbFoot">'
      + (nbCountDirty() ? faNum(nbCountDirty()) + ' تغییر منتظر ارسال'
        : (C && C.repo ? 'آخرین همگام سازی: ' + (NB.lastSync ? relTime((NB.lastSync - Date.now()) / 1000) : '—') : 'مخزن وصل نیست'))
      + '</div>';
    var scroll = $('nbList') ? $('nbList').scrollTop : 0;
    box.innerHTML = html;
    if ($('nbList')) $('nbList').scrollTop = scroll;
    if (NB.section === 'search' && NB.focusSearch){ NB.focusSearch = false; var q = $('nbFind'); if (q){ q.focus(); q.select(); } }
  }
  function nbTabBtn(sec, ic, label, count, warn){
    return '<button type="button" class="nb-tab' + (NB.section === sec ? ' on' : '') + (warn ? ' nb-tab-warn' : '') + '" data-nb-sec="' + sec + '">'
      + icon(ic) + label + (count ? '<b>' + faNum(count) + '</b>' : '') + '</button>';
  }

  /* --- sidebar events --- */
  /** Only the result list is redrawn while typing, so the search box keeps focus and caret. */
  function nbRefreshSearch(){
    var res = $('nbRes');
    if (res) res.innerHTML = nbSearchHtml(); else nbRender();
  }
  function nbTrap(){
    var box = $('nb');
    if (!box) return;
    box.addEventListener('input', function(e){
      if (e.target.id === 'nbFind'){ NB.query = e.target.value; nbRefreshSearch(); }
    });
    box.addEventListener('change', function(e){
      if (e.target.id === 'nbFindCol'){ NB.colFilter = e.target.value; nbRefreshSearch(); }
    });
    box.addEventListener('click', function(e){
      var sec = e.target.closest('[data-nb-sec]');
      if (sec){ NB.section = sec.dataset.nbSec; nbRender(); return; }
      var act = e.target.closest('[data-nb-act]');
      if (act){
        var a = act.dataset.nbAct;
        if (a === 'new') nbNewDialog();
        else if (a === 'quick') nbQuickInbox('');
        else if (a === 'pull') nbPull({ loud: true });
        else if (a === 'push') nbPush({ loud: true });
        return;
      }
      var att = e.target.closest('[data-nb-att]');
      if (att){ nbDownloadAttachment(att.dataset.nbAtt); return; }
      var cal = e.target.closest('[data-nb-cal]');
      if (cal){
        var what = cal.dataset.nbCal;
        if (what === 'today'){ var t0 = nbCtx(new Date(), '', C.weekStart); NB.calMonth = { jy: +t0.jy, jm: +t0.jm }; nbRender(); }
        else nbCalShift(+what);
        return;
      }
      var day = e.target.closest('[data-nb-day]');
      if (day){ nbDayClick(day.dataset.nbDay); return; }
      var tag = e.target.closest('[data-nb-tag]');
      if (tag){
        NB.tagFilter = tag.dataset.nbTag || '';
        NB.query = NB.query || '';
        if (NB.section !== 'search'){ NB.section = 'search'; NB.focusSearch = true; }
        nbRender();
        return;
      }
      var dir = e.target.closest('[data-nb-dir]');
      if (dir){ NB.expanded[dir.dataset.nbDir] = NB.expanded[dir.dataset.nbDir] === false; nbRender(); return; }
      var save = e.target.closest('[data-nb-save]');
      if (save){ e.stopPropagation(); nbSaveTabDialog(save.dataset.nbSave); return; }
      var res = e.target.closest('[data-nb-resolve]');
      if (res){ nbResolve(NB.conflicts[+res.dataset.nbCi], res.dataset.nbResolve); return; }
      var note = e.target.closest('[data-nb-note]');
      if (note){ nbOpen(note.dataset.nbNote); return; }
      var temp = e.target.closest('[data-nb-temp]');
      if (temp){ switchTab(temp.dataset.nbTemp); nbRender(); return; }
      var hs = e.target.closest('[data-nb-hist-save]');
      if (hs){ nbHistSaveToNotebook(+hs.dataset.nbHistSave); return; }
      var hd = e.target.closest('[data-nb-hist-del]');
      if (hd){ nbHistDelete(+hd.dataset.nbHistDel); return; }
      var hist = e.target.closest('[data-nb-hist-item]');
      if (hist){ nbHistOpen(+hist.dataset.nbHistItem); nbRender(); return; }
      var clr = e.target.closest('[data-nb-hist-clear]');
      if (clr){
        nbConfirm('پاک کردن متن های اخیر', 'همهٔ متن های اخیر پاک شوند؟ (تب های باز دست نمی خورند)', function(){
          var keep = historyLoad().slice();
          historySave([]);
          try { localStorage.removeItem('fs2-history'); } catch(err){}
          nbRender();
          toast('متن های اخیر پاک شد', 'undo', { label: 'بازگشت', icon: 'undo', run: function(){ historySave(keep); nbRender(); } });
        });
        return;
      }
    });
    box.addEventListener('input', function(e){
      if (e.target.id !== 'nbTempQ') return;
      var at = e.target.selectionStart;
      NB.tempQuery = e.target.value;
      nbRender();
      var q = $('nbTempQ');
      if (q){ q.focus(); try { q.setSelectionRange(at, at); } catch(err){} }
    });
    box.addEventListener('contextmenu', function(e){
      var hi = e.target.closest('.nb-hist-row');
      if (hi){ e.preventDefault(); nbHistMenu(+hi.dataset.nbHistItem, e.clientX, e.clientY); return; }
      var note = e.target.closest('[data-nb-note]'), dir = e.target.closest('[data-nb-dir]'), att = e.target.closest('[data-nb-att]');
      if (!note && !dir && !att){
        if (NB.section !== 'notes' || !e.target.closest('#nbList')) return;
        e.preventDefault();
        nbMenu(e.clientX, e.clientY, [
          { label: 'یادداشت جدید', act: function(){ nbNewDialog(null, ''); } },
          { label: 'پوشهٔ جدید', act: function(){ nbNewFolder(''); } },
          { label: 'مجموعهٔ جدید (پوشه + تقویم + قالب)…', act: function(){ nbCollectionDialog(-1, ''); } },
          { label: 'ثبت سریع', act: function(){ nbQuickInbox(); } },
          { label: 'گرفتن از مخزن', act: function(){ nbPull({ loud: true }); } },
          { label: 'ارسال به مخزن', act: function(){ nbPush({ loud: true }); } }
        ]);
        return;
      }
      e.preventDefault();
      if (note){
        var path = note.dataset.nbNote;
        nbMenu(e.clientX, e.clientY, [
          { label: 'باز کردن', act: function(){ nbOpen(path); } },
          { label: 'تغییر نام', act: function(){ nbPrompt('نام تازه', nbTitle(path), function(v){ if (v) nbRenameDialog(path, v); }); } },
          { label: 'جابه جایی', act: function(){ nbMoveDialog(path); } },
          { label: 'تکثیر', act: function(){ nbDuplicate(path); } },
          { label: 'باز کردن در تب تازه', act: function(){ nbOpenInNewTab(path); } },
          { label: 'سنجاق در تب', act: function(){ nbPinNoteTab(path); } },
          { label: 'نمایش در درخت', act: function(){ nbShowInTree(path); } },
          { label: 'انتقال به مجموعه…', act: function(){ nbMoveToCollection(path); } },
          null,
          { label: 'تاریخچه و برگرداندن', act: function(){ nbShowHistory(path); } },
          { label: 'رمزگذاری', act: function(){ nbToggleEncrypt(path); } },
          { label: 'کپی پیوند [[]]', act: function(){
            var link = '[[' + nbTitle(path) + ']]';
            copyToClipboard('پیوند', link).then(function(ok){ toast(ok ? 'کپی شد: ' + link : 'کپی نشد', ok ? 'link' : 'x'); });
          } },
          { label: 'دانلود md', act: function(){ nbDownload(path); } },
          { label: 'حذف', danger: true, act: function(){
            nbConfirm('حذف یادداشت', '«' + nbTitle(path) + '» حذف شود؟ با ارسال بعدی از مخزن هم برداشته می شود.', function(){
              nbDeletePath(path); toast('برای حذف صف شد', 'trash');
            });
          } }
        ]);
      } else if (att) {
        var ap = att.dataset.nbAtt;
        nbMenu(e.clientX, e.clientY, [
          { label: 'دانلود', act: function(){ nbDownloadAttachment(ap); } },
          { label: 'حذف از مخزن', danger: true, act: function(){ nbDropAttachment(ap); toast('برای حذف صف شد', 'trash'); } },
          { label: 'رونوشت مسیر', act: function(){ copyToClipboard('مسیر', ap).then(function(ok){ toast(ok ? 'کپی شد: ' + ap : 'کپی نشد', ok ? 'copy' : 'x'); }); } }
        ]);
      } else {
        var folder = dir.dataset.nbDir;
        nbMenu(e.clientX, e.clientY, [
          { label: 'یادداشت جدید در این پوشه', act: function(){ nbNewDialog(null, folder); } },
          { label: 'یادداشت از قالب…', act: function(){ nbMenu(e.clientX, e.clientY, nbTemplateMenu(folder)); } },
          { label: 'باز کردن همه در تب', act: function(){ nbOpenAllIn(folder); } },
          { label: 'پوشهٔ جدید داخل این پوشه', act: function(){ nbNewFolder(folder); } },
          (function(){
            var ci = -1;
            C.collections.forEach(function(c, i){ if (ci < 0 && nbFolderOfPattern(c.path) === folder) ci = i; });
            return ci >= 0 ? { label: 'تنظیمات مجموعهٔ «' + C.collections[ci].name + '»…', act: function(){ nbCollectionDialog(ci); } }
              : { label: 'مجموعه کردن این پوشه (تقویم و قالب)…', act: function(){ nbCollectionDialog(-1, folder); } };
          })(),
          { label: 'تغییر نام پوشه', act: function(){ nbRenameFolder(folder); } },
          { label: 'دانلود zip این پوشه', act: function(){ nbDownloadZip(folder); } },
          { label: 'حذف پوشه', danger: true, act: function(){
            nbConfirm('حذف پوشه', 'همهٔ یادداشت های «' + folder + '» حذف شوند؟', function(){ nbDeletePath(folder + '/'); toast('پوشه برای حذف صف شد', 'trash'); });
          } }
        ]);
      }
    });
  }

  /* --- small dialogs, in the app's own style --- */
  function nbModalBox(title, bodyHtml, footHtml, ico, target){
    if (innerWidth < 760){ nbSidebar(false); nbLayerPushed(); }   // on a phone the drawer would be in the way
    var m = $(target || 'nbMini');
    m.hidden = false;
    m.innerHTML = '<div class="modal-box nb-mini-box" role="dialog" aria-modal="true">'
      + '<div class="modal-head"><span class="ph-title">' + icon(ico || 'pen') + escapeHtml(title) + '</span>'
      + '<button class="ib sm" type="button" data-nb-mini-close aria-label="بستن" style="margin-inline-start:auto">' + icon('x') + '</button></div>'
      + '<div class="modal-body nb-mini-body">' + bodyHtml + '</div>'
      + '<div class="modal-foot">' + footHtml + '</div></div>';
    return m;
  }
  function nbCloseMini(target){ var m = $(target || 'nbMini'); if (m) m.hidden = true; }
  function nbPrompt(title, value, cb){
    nbModalBox(title, '<input class="nb-input" id="nbMiniInput" dir="auto" value="' + escapeHtml(value || '') + '">',
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">تایید</button>');
    var input = $('nbMiniInput');
    input.focus(); input.select();
    $('nbMiniOk').onclick = function(){ var v = input.value.trim(); nbCloseMini(); cb(v); };
    input.onkeydown = function(e){ if (e.key === 'Enter'){ e.preventDefault(); $('nbMiniOk').click(); } };
  }
  function nbConfirm(title, text, cb){
    nbModalBox(title, '<p class="nb-mini-text">' + escapeHtml(text) + '</p>',
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">تایید</button>', 'x');
    $('nbMiniOk').onclick = function(){ nbCloseMini(); cb(); };
  }
  document.addEventListener('click', function(e){
    if (e.target.closest('[data-nb-mini-close]')) nbCloseMini(e.target.closest('#nbMini2') ? 'nbMini2' : 'nbMini');
    else if ($('nbMini') && e.target === $('nbMini')){ nbCloseMini('nbMini2'); nbCloseMini(); }
    else if ($('nbMini2') && e.target === $('nbMini2')) nbCloseMini('nbMini2');
  });

  /* --- actions that change the notebook --- */
  function nbRenameDialog(path, name){
    var folder = nbFolder(path), ext = /\.(md|markdown|txt)$/i.exec(path);
    var target = (folder ? folder + '/' : '') + nbSlug(name) + (ext ? ext[0] : '.md');
    var oldTitle = nbTitle(path);
    if (nbMoveNote(path, target)){
      var fixed = nbFixLinks(oldTitle, nbTitle(target));
      toast('نام عوض شد: ' + nbTitle(target) + (fixed ? ' — ' + faNum(fixed) + ' پیوند هم درست شد' : ''), 'pen');
    }
  }
  function nbMoveDialog(path){
    nbPrompt('پوشهٔ تازه (خالی = ریشه)', nbFolder(path), function(folder){
      var target = (folder ? folder.replace(/^\/+|\/+$/g, '') + '/' : '') + path.split('/').pop();
      if (nbMoveNote(path, target)) toast('جابه جا شد — ' + target, 'folder');
    });
  }
  function nbDuplicate(path){
    var f = NB.files[path];
    if (!f) return;
    var ext = /\.(md|markdown|txt)$/i.exec(path) || ['.md'];
    var base = path.replace(/\.(md|markdown|txt)$/i, '');
    var target = base + ' کپی' + ext[0], n = 2;
    while (NB.files[target]){ target = base + ' کپی ' + n + ext[0]; n++; }
    nbWrite(target, f.text);
    toast('تکثیر شد: ' + nbTitle(target), 'copy');
  }
  /** Attachments live in the repository as blobs; a click downloads them. */
  function nbDownloadAttachment(path){
    var local = NB.attach[path];
    if (local && local.b64){
      downloadBlob(new Blob([nbBytesB64(local.b64)], { type: local.mime || guessMime(path) }), path.split('/').pop());
      return;
    }
    var sp = nbSplitRepo();
    if (!sp){ toast('مخزن وصل نیست', 'x'); return; }
    nbApi('GET', '/repos/' + sp.owner + '/' + sp.name + '/contents/' + nbEncodePath(path) + '?ref=' + encodeURIComponent(C.branch))
      .then(function(info){
        downloadBlob(new Blob([nbBytesB64(info.content.replace(/\s/g, ''))], { type: guessMime(path) }), path.split('/').pop());
      }).catch(function(e){ toast('پیوست گرفته نشد: ' + e.message, 'x'); });
  }
  function nbDownload(path){
    var f = NB.files[path];
    if (!f) return;
    downloadBlob(new Blob([f.text], { type: 'text/markdown;charset=utf-8' }), nbTitle(path) + '.md');
  }
  function nbDownloadZip(folder){
    var prefix = folder ? folder.replace(/\/$/, '') + '/' : '';
    var files = NB.paths.filter(function(p){
      return p.slice(-1) !== '/' && NB.files[p] && !NB.files[p].deleted && (!prefix || p.indexOf(prefix) === 0);
    }).map(function(p){ return { path: prefix ? p.slice(prefix.length) : p, text: NB.files[p].text }; });
    if (!files.length){ toast('چیزی برای خروجی نیست', 'x'); return; }
    downloadBlob(new Blob([nbZip(files)], { type: 'application/zip' }), (folder ? nbTitle(prefix) : 'دفترچه') + '.zip');
    toast(faNum(files.length) + ' یادداشت در zip', 'download');
  }
  /** «ذخیره در دفترچه» with the folder already decided (a drop on a folder). */
  function nbSaveTabInFolder(tabId, folder){
    var t = tabs.filter(function(x){ return x.id === tabId; })[0];
    if (!t) return;
    if (t.nb){ toast('این تب خودش یادداشت دفترچه است', 'check'); return; }
    var text = t.text || '';
    if (!text.trim()){ toast('تب خالی است', 'x'); return; }
    var title = (text.match(/^\s{0,3}#{1,3}\s+(.+)$/m) || [])[1] || textTitle(text) || 'یادداشت';
    var path = (folder ? folder.replace(/\/+$/, '') + '/' : '') + nbSlug(title) + '.md';
    if (NB.files[path] && !NB.files[path].deleted){ toast('در آن پوشه یادداشتی با همین نام هست', 'x'); return; }
    nbWrite(path, text);
    nbOpen(path);
    toast('در دفترچه ذخیره شد: ' + nbTitle(path), 'cloud');
  }
  function nbSaveTabDialog(tabId){
    var t = tabs.filter(function(x){ return x.id === tabId; })[0];
    if (!t) return;
    var body = '<p class="nb-mini-text">متن این تب در دفترچه ذخیره شود؟</p>'
      + '<div class="nb-field"><label>مجموعه</label><select id="nbSaveCol">'
      + C.collections.map(function(c){ return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="nb-field"><label>عنوان</label><input class="nb-input" id="nbSaveTitle" dir="auto" value="' + escapeHtml(t.name || textTitle(t.text)) + '"></div>';
    nbModalBox('ذخیره در دفترچه', body,
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">ذخیره</button>', 'cloud');
    $('nbMiniOk').onclick = function(){
      var made = nbNewNote($('nbSaveCol').value, new Date(), $('nbSaveTitle').value.trim() || 'بدون عنوان');
      nbCloseMini();
      if (made.exists){ toast('یادداشتی با همین نام بود', 'x'); nbOpen(made.path); }
      else {
        nbWrite(made.path, t.text);
        t.nb = made.path; t.name = nbTitle(made.path);
        NB.section = 'notes';
      }
      drawTabs(); saveState(); nbRender();
      if (!made.exists) toast('در دفترچه ذخیره شد: ' + made.path, 'check');
    };
  }
  function nbResolve(c, how){
    if (!c) return;
    if (c.locked){                                  // give the passphrase, then compare again
      nbAskPass(true).then(function(p){
        if (!p) return;
        NB.pass = p;
        NB.conflicts = NB.conflicts.filter(function(x){ return x !== c; });
        NB.lastCommit = '';
        nbPull({ loud: true });
      });
      return;
    }
    if (c.enc) return nbResolveSecret(c, how);
    var t = nbTabFor(c.path);
    if (how === 'theirs'){
      nbPutFile(c.path, c.theirs, c.theirsSha, { base: c.theirs, dirty: false, isNew: false });
      if (t){ t.text = c.theirs; if (t.id === activeTab){ ta.value = c.theirs; render(); } }
    } else if (how === 'auto'){
      var mg = nbMerge3(c.base || '', c.mine, c.theirs);
      nbPutFile(c.path, mg.text, c.theirsSha, { base: c.theirs, dirty: true });
      if (t){ t.text = mg.text; if (t.id === activeTab){ ta.value = mg.text; render(); } }
      toast(mg.conflicts.length ? 'ادغام کامل نشد — نسخهٔ من با علامت های تعارض نگه داشته شد' : 'ادغام شد', mg.conflicts.length ? 'x' : 'swap');
    } else if (how === 'mine'){
      var f = NB.files[c.path];
      if (f){
        f.dirty = true; f.at = Date.now(); f.sha = c.theirsSha; f.base = c.base;
        if (t){                                   // keep the open tab and the editor in step with the choice
          t.text = f.text;
          if (t.id === activeTab){ ta.value = f.text; render(); }
        }
      }
    } else {
      openTab(c.theirs, 'markdown', 'نسخهٔ مخزن در تب تازه — مقایسه کن و درست را نگه دار');
      var fresh = currentTab();
      if (fresh && !fresh.nb) fresh.name = nbTitle(c.path) + ' (مخزن)';
      drawTabs();
    }
    NB.conflicts = NB.conflicts.filter(function(x){ return x !== c; });
    nbCountDirty(); nbRender(); nbSaveFiles(); nbSay();
    if (!NB.conflicts.length){
      toast('تعارض حل شد', 'check');
      if (how !== 'both') nbPush({});
    }
  }
  /** The same choices for a secret note, kept plain in memory and ciphertext everywhere else. */
  function nbResolveSecret(c, how){
    var t = nbTabFor(c.path), f = NB.files[c.path], text;
    if (!f) return;
    if (how === 'both'){
      openTab(c.theirs, 'markdown', 'نسخهٔ مخزن در تب تازه — مقایسه کن و درست را نگه دار');
      var fresh = currentTab();
      if (fresh){ fresh.secret = true; fresh.name = nbTitle(c.path) + ' (مخزن)'; }
      drawTabs();
    } else {
      text = how === 'theirs' ? c.theirs : how === 'auto' ? nbMerge3(c.base || '', c.mine, c.theirs).text : c.mine;
      f.enc = true; f.plain = text; f.basePlain = c.theirs; f.sha = c.theirsSha;
      if (c.theirsCipher){ f.text = f.base = c.theirsCipher; }
      f.dirty = text !== c.theirs; f.at = Date.now();
      if (t){ t.secret = true; t.text = text; if (t.id === activeTab){ ta.value = text; render(); } }
    }
    NB.conflicts = NB.conflicts.filter(function(x){ return x !== c; });
    nbCountDirty(); nbRender(); nbSaveFiles(); nbSay();
    if (!NB.conflicts.length){ toast('تعارض حل شد', 'check'); if (how !== 'both') nbPush({}); }
  }
  function nbShowConflicts(){
    NB.section = 'conflicts';
    if (!NB.open) nbSidebar(true); else nbRender();
    toast('تعارض: ' + faNum(NB.conflicts.length) + ' یادداشت هم اینجا و هم روی مخزن عوض شده', 'x');
  }
  /* --- collections: a folder with a calendar and a template --- */
  var NB_CAL_KINDS = [['day', 'یک یادداشت در روز'], ['many', 'چند یادداشت در روز (با عنوان)'], ['week', 'یک یادداشت در هفته'], ['', 'بدون تقویم (فقط عنوان)']];
  var NB_PRESETS = [['templates/daily.md', 'روزانه'], ['templates/meeting.md', 'جلسه'], ['templates/weekly.md', 'هفتگی'], ['templates/idea.md', 'ایده'], ['', 'خالی']];
  /** The path pattern for a folder and a calendar kind; `byMonth` puts dated notes in year/month folders. */
  function nbPatternFor(folder, kind, byMonth){
    var f = String(folder || '').replace(/^\/+|\/+$/g, '').trim() || 'یادداشت ها';
    if (kind === 'day') return f + (byMonth ? '/{jy}/{jm}' : '') + '/{jy}-{jm}-{jd}.md';
    if (kind === 'many') return f + (byMonth ? '/{jy}/{jm}' : '') + '/{jy}-{jm}-{jd} {title}.md';
    if (kind === 'week') return f + (byMonth ? '/{jy}' : '') + '/{jy}-W{jw}.md';
    return f + '/{title}.md';
  }
  function nbFolderOfPattern(pattern){ return String(pattern || '').split('/{')[0].replace(/\/[^\/]*\{.*$/, '').replace(/\/+$/, ''); }
  function nbTemplateFiles(){
    return NB.paths.filter(function(x){ return /^templates\/.+\.md$/i.test(x) && NB.files[x] && !NB.files[x].deleted; });
  }
  /** Opens the dialog to add a collection (index = -1) or edit one; `folder` prefills a new one. */
  function nbCollectionDialog(index, folder){
    var c = index >= 0 ? C.collections[index] : null;
    var name = c ? c.name : (folder ? folder.split('/').pop() : '');
    var kind = c ? (c.calendar || '') : 'day';
    var dir = c ? nbFolderOfPattern(c.path) : (folder || '');
    var byMonth = c ? /\{jm\}\//.test(c.path) || /\{jy\}\/\{jy\}-W/.test(c.path) : true;
    var tpls = nbTemplateFiles();
    var body = '<div class="nb-field"><label>نام</label><input class="nb-input" id="nbColName" dir="auto" placeholder="مثلاً: جلسه ها" value="' + escapeHtml(name) + '"></div>'
      + '<div class="nb-field"><label>پوشه</label><input class="nb-input" id="nbColDir" dir="auto" placeholder="همان نام" value="' + escapeHtml(dir) + '"></div>'
      + '<div class="nb-field"><label>تقویم</label><select id="nbColKind">' + NB_CAL_KINDS.map(function(k){
          return '<option value="' + k[0] + '"' + (k[0] === kind ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select></div>'
      + '<label class="sw"><input type="checkbox" id="nbColMonth"' + (byMonth ? ' checked' : '') + '><span class="sw-ui"></span><span><b>پوشه برای هر سال و ماه</b><small>مثل روزانه/1405/08/…</small></span></label>'
      + '<div class="nb-field"><label>قالب</label><select id="nbColTpl"><option value="">بدون قالب</option>'
      + tpls.map(function(t){ return '<option value="' + escapeHtml(t) + '"' + (c && c.template === t ? ' selected' : '') + '>' + escapeHtml(nbTitle(t)) + '</option>'; }).join('')
      + NB_PRESETS.filter(function(pr){ return pr[0] && tpls.indexOf(pr[0]) === -1; }).map(function(pr){
          return '<option value="new:' + pr[0] + '"' + (c && c.template === pr[0] ? ' selected' : '') + '>قالب تازه از نمونهٔ «' + pr[1] + '»</option>'; }).join('')
      + '<option value="new:">قالب تازهٔ خالی</option></select></div>'
      + '<div class="nb-field"><label>رنگ</label><input type="color" id="nbColColor" value="' + escapeHtml((c && c.color) || '#6d5efc') + '"></div>'
      + '<p class="nb-hint" id="nbColEx"></p>'
      + '<details class="nb-adv"><summary>پیشرفته: الگوی مسیر</summary><input class="nb-input" id="nbColPath" dir="ltr" value="' + escapeHtml(c ? c.path : '') + '">'
      + '<p class="nb-hint">{jy} {jm} {jd} شمسی · {gy} {gm} {gd} میلادی · {jw} شمارهٔ هفته · {title} عنوان</p></details>';
    nbModalBox(c ? 'تنظیمات مجموعه' : 'مجموعهٔ جدید', body,
      (c ? '<button class="btn-soft" type="button" id="nbColDel">حذف مجموعه</button>' : '')
      + '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">' + (c ? 'ذخیره' : 'ساختن') + '</button>', 'folder');
    var custom = !!c && c.path !== nbPatternFor(dir, kind, byMonth);
    function pattern(){
      return custom ? $('nbColPath').value.trim() : nbPatternFor($('nbColDir').value.trim() || $('nbColName').value.trim(), $('nbColKind').value, $('nbColMonth').checked);
    }
    function preview(){
      if (!custom) $('nbColPath').value = pattern();
      $('nbColMonth').parentNode.hidden = !$('nbColKind').value;
      $('nbColEx').textContent = 'مثلاً: ' + nbFillPath(pattern(), nbCtx(new Date(), $('nbColKind').value === 'day' || $('nbColKind').value === 'week' ? '' : 'عنوان یادداشت', C.weekStart));
    }
    ['nbColName', 'nbColDir', 'nbColKind', 'nbColMonth'].forEach(function(id){ $(id).addEventListener('input', preview); $(id).addEventListener('change', preview); });
    $('nbColPath').addEventListener('input', function(){ custom = true; preview(); });
    preview();
    if ($('nbColDel')) $('nbColDel').onclick = function(){
      nbCloseMini();
      nbConfirm('حذف مجموعه', '«' + c.name + '» از فهرست مجموعه ها برداشته شود؟ یادداشت ها و قالبش سر جایشان می مانند.', function(){
        C.collections.splice(index, 1); nbCollectionsChanged(); toast('مجموعه برداشته شد', 'trash');
      });
    };
    $('nbMiniOk').onclick = function(){
      var nm = $('nbColName').value.trim();
      if (!nm){ toast('یک نام بده', 'x'); return; }
      var tpl = $('nbColTpl').value;
      if (tpl.indexOf('new:') === 0){
        var preset = tpl.slice(4), target = 'templates/' + nbSlug(nm) + '.md';
        if (NB.files[target] && !NB.files[target].deleted) target = 'templates/' + nbSlug(nm) + ' ' + Date.now().toString(36).slice(-3) + '.md';
        nbWrite(target, preset ? NB_TEMPLATES[preset] : '---\ndate: {{date}}\ncreated: {{gdate}}\n---\n# {{title}}\n\n{{cursor}}\n');
        tpl = target;
      }
      var col = { id: c ? c.id : 'c' + Date.now().toString(36), name: nm, color: $('nbColColor').value, calendar: $('nbColKind').value || null, path: pattern(), template: tpl };
      if (c) C.collections[index] = col; else C.collections.push(col);
      nbCloseMini();
      nbCollectionsChanged();
      toast((c ? 'ذخیره شد: ' : 'مجموعه ساخته شد: ') + nm + (tpl && tpl.indexOf('templates/') === 0 && !c ? ' — قالبش را در ' + tpl + ' ویرایش کن' : ''), 'check');
    };
    $('nbColName').focus();
  }
  /** Collections, week start and the attachments folder travel with the repository in .mizkar/config.json. */
  function nbConfigText(){
    return JSON.stringify({ version: 1, weekStart: C.weekStart, attachments: C.attachments, collections: C.collections }, null, 2) + '\n';
  }
  var nbCfgTimer = 0;
  function nbCollectionsChanged(fromSettings){
    nbSaveCfg(); nbRender();
    if (!fromSettings && $('nbModal') && !$('nbModal').hidden) nbDrawSettings();   // a field being typed in keeps its focus
    clearTimeout(nbCfgTimer);
    nbCfgTimer = setTimeout(function(){
      if (!C.repo) return;
      var f = NB.files[C.configPath], text = nbConfigText();
      if (!f || f.deleted || f.text !== text){ nbWrite(C.configPath, text); NB.cfgSeen = text; }
    }, 400);
  }
  /** A config.json that arrived from the repository (another device) is applied here. */
  function nbApplyRepoConfig(){
    var f = NB.files[C.configPath];
    if (!f || f.deleted || f.dirty || f.text === NB.cfgSeen) return;
    NB.cfgSeen = f.text;
    try {
      var cfg = JSON.parse(f.text);
      if (Array.isArray(cfg.collections) && cfg.collections.length) C.collections = cfg.collections;
      if (cfg.weekStart) C.weekStart = cfg.weekStart;
      if (cfg.attachments) C.attachments = cfg.attachments;
      nbSaveCfg(); nbRender();
    } catch(e){ toast('config.json مخزن خوانده نشد: ' + e.message, 'x'); }
  }
  function nbRenameFolder(folder){
    nbPrompt('نام تازهٔ پوشه', folder.split('/').pop(), function(v){
      if (!v) return;
      var parent = folder.split('/').slice(0, -1).join('/'), target = (parent ? parent + '/' : '') + nbSlug(v);
      if (target === folder) return;
      var moved = 0;
      NB.paths.slice().forEach(function(x){
        if (x.indexOf(folder + '/') !== 0) return;
        var to = target + x.slice(folder.length);
        if (x.slice(-1) === '/'){ NB.paths = NB.paths.map(function(y){ return y === x ? to : y; }); return; }
        var f = NB.files[x];
        if (f && !f.deleted && nbMoveNote(x, to)) moved++;
      });
      C.collections.forEach(function(c){ if (nbFolderOfPattern(c.path) === folder) c.path = target + c.path.slice(folder.length); });
      nbCollectionsChanged();
      toast('پوشه تغییر نام داد — ' + faNum(moved) + ' یادداشت', 'folder');
    });
  }
  function nbNewFolder(parent){
    nbPrompt('نام پوشه', '', function(v){
      if (!v) return;
      var p = (parent ? parent + '/' : '') + nbSlug(v) + '/';
      if (NB.paths.indexOf(p) === -1) NB.paths.push(p);
      nbRender(); nbSaveFiles();
      toast('پوشه ساخته شد — با اولین یادداشتش به مخزن می رود', 'folder');
    });
  }

  /* --- new note dialog --- */
  function nbNewDialog(colId, folder, date){
    var body = '<div class="nb-field"><label>مجموعه</label><div class="nb-inline-row"><select id="nbPanelCol">'
      + C.collections.map(function(c){ return '<option value="' + escapeHtml(c.id) + '"' + (c.id === (colId || (C.collections[0] || {}).id) ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'; }).join('')
      + '</select><button type="button" class="elbtn xs" id="nbColNew" title="مجموعهٔ تازه بساز">مجموعهٔ جدید…</button></div></div>'
      + '<div class="nb-field"><label>تاریخ</label>' + nbDateField('nbPanelDate', date || new Date()) + '</div>'
      + '<div class="nb-field"><label>عنوان</label><input class="nb-input" id="nbPanelTitle" dir="auto" placeholder="خالی بگذار تا از الگو پر شود"></div>'
      + (folder ? '<p class="nb-mini-text">پوشه: <b dir="auto">' + escapeHtml(folder) + '</b></p>' : '')
      + '<p class="nb-mini-text" id="nbPanelPath"></p>';
    nbModalBox('یادداشت جدید', body,
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">بساز</button>', 'plus');
    function col(){ return C.collections.filter(function(c){ return c.id === $('nbPanelCol').value; })[0] || C.collections[0]; }
    function preview(){
      var d = nbStampToDate($('nbPanelDate').dataset.nbDate || new Date());
      var p = nbFillPath(col().path, nbCtx(d, nbSlug($('nbPanelTitle').value || ''), C.weekStart));
      var full = folder ? folder.replace(/\/+$/, '') + '/' + p.split('/').pop() : p;
      $('nbPanelPath').innerHTML = 'مسیر: <b dir="auto">' + escapeHtml(full) + '</b>'
        + (NB.files[full] && !NB.files[full].deleted ? ' <span class="nb-warn">— از قبل هست</span>' : '');
      return { date: d, full: full };
    }
    ['nbPanelCol', 'nbPanelDate', 'nbPanelTitle'].forEach(function(id){
      $(id).addEventListener('input', preview);
      $(id).addEventListener('change', preview);
    });
    preview();
    $('nbColNew').onclick = function(){
      nbPrompt('نام مجموعهٔ تازه', '', function(name){
        if (!name) return;
        var id = 'c' + Date.now().toString(36);
        C.collections.push({ id: id, name: name, path: nbSlug(name) + '/{title}.md', template: '', calendar: '', color: '#6d5efc' });
        nbSaveCfg();
        nbPrompt('الگوی مسیر این مجموعه', nbSlug(name) + '/{title}.md', function(path){
          var c = C.collections.filter(function(x){ return x.id === id; })[0];
          if (c && path) c.path = path;
          nbSaveCfg();
          nbNewDialog(id, folder);
          toast('مجموعه ساخته شد: ' + name + ' — قالب و تقویمش را در تنظیمات دفترچه بگذار', 'plus');
        });
      });
    };
    $('nbMiniOk').onclick = function(){
      var pv = preview();
      var made = nbNewNote(col(), pv.date, $('nbPanelTitle').value.trim(), { folder: folder });
      nbCloseMini();
      if (made.exists){ toast('از قبل بود — بازش کردم', 'x'); nbOpen(made.path); return; }
      nbOpen(made.path, made.cursor);
      toast('ساخته شد: ' + made.path, 'plus');
    };
  }

  /* --- floating context menu --- */
  function nbMenu(x, y, items){
    var m = $('nbMenu');
    items = (items || []).filter(Boolean);
    if (!items.length) return;
    m.innerHTML = items.map(function(it, i){
      if (!it) return '<div class="mi-sep" role="separator"></div>';
      return '<button type="button" class="mi' + (it.danger ? ' danger' : '') + '" role="menuitem" data-nb-mi="' + i + '">'
        + '<span>' + escapeHtml(it.label) + '</span>' + (it.kbd ? '<kbd>' + escapeHtml(it.kbd) + '</kbd>' : '') + '</button>';
    }).join('');
    m.hidden = false;
    m.style.left = Math.max(6, Math.min(x, innerWidth - m.offsetWidth - 6)) + 'px';
    m.style.top = Math.max(6, Math.min(y, innerHeight - m.offsetHeight - 6)) + 'px';
    function rows(){ return Array.prototype.slice.call(m.querySelectorAll('.mi')); }
    var first = rows()[0];
    if (first) first.focus();
    m.onkeydown = function(e){
      var list = rows(), at = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown'){ e.preventDefault(); list[(at + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); list[(at - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); if (document.activeElement.closest && document.activeElement.closest('#nbMenu')) document.activeElement.click(); }
      else if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); m.hidden = true; }
    };
    m.onclick = function(e){
      var b = e.target.closest('[data-nb-mi]');
      if (!b) return;
      m.hidden = true;
      var it = items[+b.dataset.nbMi];
      if (it && it.act) it.act();
    };
  }
  function nbMenuClose(){ var m = $('nbMenu'); if (m) m.hidden = true; }
  document.addEventListener('mousedown', function(e){ if (e.target.closest && !e.target.closest('#nbMenu')) nbMenuClose(); }, true);
  document.addEventListener('scroll', nbMenuClose, true);

  document.addEventListener('click', function(e){
    var m = $('nbMenu');
    if (m && !m.hidden && !e.target.closest('#nbMenu')) m.hidden = true;
  });

  /* --- settings --- */
  function nbDrawSettings(){
    var m = $('nbModal');
    m.hidden = false;
    $('nbModalBody').innerHTML = '<div class="nb-sec"><h4>اتصال</h4>'
      + '<div class="nb-field"><label>مخزن</label><input class="nb-input" id="nbRepo" dir="ltr" placeholder="user/notes" value="' + escapeHtml(C.repo) + '"></div>'
      + '<div class="nb-field"><label>توکن</label><input class="nb-input" id="nbToken" dir="ltr" type="password" placeholder="' + (NB.locked ? 'قفل است' : 'github_pat_…') + '"' + (NB.locked ? ' disabled' : '') + ' value="' + escapeHtml(C.token) + '"></div>'
      + (NB.locked ? '<div class="nb-actions"><button class="btn-soft sm" type="button" data-nb-cfg="unlock">باز کردن قفل توکن</button></div>' : '')
      + '<label class="sw"><input type="checkbox" id="nbLock"' + (C.lockToken ? ' checked' : '') + (NB.locked ? ' disabled' : '') + '><span class="sw-ui"></span><span><b>قفل توکن با گذرواژه</b><small>توکن فقط رمزشده در مرورگر می ماند؛ هر بار باز شدن صفحه، با کلیک روی «قفل» باز می شود</small></span></label>'
      + '<p class="nb-hint">توکن fine-grained فقط برای همین مخزن، با دسترسی Contents (خواندن و نوشتن).</p>'
      + '<div class="nb-actions"><button class="btn-soft sm" type="button" data-nb-cfg="test">آزمایش اتصال</button></div>'
      + '<p class="nb-hint" id="nbTestOut"></p>'
      + '<label class="sw"><input type="checkbox" id="nbAuto"' + (C.auto ? ' checked' : '') + '><span class="sw-ui"></span><span><b>ارسال خودکار</b><small>چند ثانیه بعد از آخرین تغییر، همه با یک commit می روند</small></span></label></div>'
      + '<div class="nb-sec"><h4>مجموعه ها <small>پوشه + تقویم + قالب</small></h4><div class="nb-collist">'
      + C.collections.map(function(c, i){
        var kind = (NB_CAL_KINDS.filter(function(k){ return k[0] === (c.calendar || ''); })[0] || ['', ''])[1];
        return '<div class="nb-colrow"><i class="hm-dot" style="background:' + escapeHtml(c.color || 'var(--accent)') + '"></i>'
          + '<span><b dir="auto">' + escapeHtml(c.name) + '</b><small dir="auto">' + escapeHtml(nbFolderOfPattern(c.path) + ' · ' + kind + (c.template ? ' · قالب: ' + nbTitle(c.template) : '')) + '</small></span>'
          + '<button class="btn-soft sm" type="button" data-nb-colfix="' + i + '">ویرایش</button></div>';
      }).join('')
      + '</div><div class="nb-actions"><button class="btn-soft sm" type="button" data-nb-cfg="addcol">مجموعهٔ جدید…</button>'
      + (Object.keys(NB_TEMPLATES).some(function(p){ return !NB.files[p]; }) ? '<button class="btn-soft sm" type="button" data-nb-cfg="tpl">قالب های نمونه را بساز</button>' : '')
      + '</div></div>'
      + '<details class="nb-sec nb-adv"><summary>پیشرفته</summary>'
      + '<div class="nb-field"><label>سرویس</label><select id="nbProvider">'
      + [['github', 'گیت هاب'], ['gitlab', 'گیت لب']].map(function(o){ return '<option value="' + o[0] + '"' + ((C.provider || 'github') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="nb-field"><label>شاخه</label><input class="nb-input" id="nbBranch" dir="ltr" value="' + escapeHtml(C.branch) + '"></div>'
      + '<div class="nb-field"><label>ثانیه تا ارسال خودکار</label><input class="nb-input" id="nbIdle" dir="ltr" type="number" min="5" max="600" value="' + (+C.idleSeconds || 20) + '"></div>'
      + '<label class="sw"><input type="checkbox" id="nbGreg"' + (C.showGregorian ? ' checked' : '') + '><span class="sw-ui"></span><span><b>نمایش تاریخ میلادی کنار روزها</b><small>عدد کوچک گوشهٔ هر خانهٔ تقویم</small></span></label>'
      + '<div class="nb-field"><label>شروع هفته</label><select id="nbWeekStart">'
      + [['saturday', 'شنبه'], ['sunday', 'یکشنبه'], ['monday', 'دوشنبه']].map(function(o){ return '<option value="' + o[0] + '"' + (C.weekStart === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="nb-field"><label>پوشهٔ پیوست ها</label><input class="nb-input" id="nbAttachDir" dir="ltr" value="' + escapeHtml(C.attachments || 'attachments') + '"></div>'
      + '<div class="nb-field"><label>پوشه های فقط خواندنی</label><input class="nb-input" id="nbRoFolders" dir="auto" placeholder="مثلاً: آرشیو، خروجی ها" value="' + escapeHtml((C.readonlyFolders || []).join('، ')) + '"><small class="nb-mini-text">با کاما جدا کن؛ یادداشت های این پوشه ها فقط خوانده می شوند.</small></div>'
      + '<h5>چند دفترچه</h5>'
      + (nbProfiles().length ? '<div class="nb-field"><label>دفترچهٔ فعال</label><select id="nbProf"><option value="">—</option>'
        + nbProfiles().map(function(p){ return '<option value="' + escapeHtml(p.name) + '"' + (C.active === p.name ? ' selected' : '') + '>' + escapeHtml(p.name) + ' (' + escapeHtml(p.repo) + ')</option>'; }).join('')
        + '</select></div>' : '')
      + '<div class="nb-actions"><button class="btn-soft sm" type="button" data-nb-cfg="saveprof">ذخیرهٔ این اتصال به عنوان دفترچه…</button>'
      + (C.active ? '<button class="btn-soft sm" type="button" data-nb-cfg="delprof">حذف «' + escapeHtml(C.active) + '»</button>' : '')
      + '</div>'
      + '<h5>خروجی و ورودی</h5><div class="nb-actions">'
      + '<button class="btn-soft sm" type="button" data-nb-cfg="zip">دانلود همه به صورت zip</button>'
      + '<label class="btn-soft sm nb-file">وارد کردن zip<input type="file" id="nbZipIn" accept=".zip" hidden></label>'
      + '</div></details>';
    var nbSharedBefore = C.weekStart + '|' + C.attachments;
    function apply(){
      C.repo = $('nbRepo').value.trim();
      C.branch = $('nbBranch').value.trim() || 'main';
      if (!NB.locked) C.token = $('nbToken').value.trim();
      if ($('nbProvider')) C.provider = $('nbProvider').value;
      if ($('nbAttachDir')) C.attachments = $('nbAttachDir').value.trim() || 'attachments';
      if ($('nbRoFolders')) C.readonlyFolders = $('nbRoFolders').value.split(/[،,]/).map(function(s){ return s.trim(); }).filter(Boolean);
      C.auto = $('nbAuto').checked;
      C.idleSeconds = +$('nbIdle').value || 20;
      C.weekStart = $('nbWeekStart').value;
      C.showGregorian = $('nbGreg').checked;
      var shared = C.weekStart + '|' + C.attachments;
      nbSaveCfg(); nbSay();
      if (shared !== nbSharedBefore){ nbSharedBefore = shared; nbCollectionsChanged(true); }
      if (NB.open && NB.section === 'cal') nbRenderKeep();
    }
    m.addEventListener('input', apply);
    m.addEventListener('change', function(e){
      if (e.target.id === 'nbLock'){
        if (!e.target.checked){ C.lockToken = false; NB.tokenPass = ''; nbSaveCfg(); nbDrawSettings(); toast('قفل توکن برداشته شد', 'check'); return; }
        e.target.checked = false;
        nbPrompt('یک گذرواژه برای قفل توکن', '', function(pass){
          if (!pass) return;
          NB.tokenPass = pass; C.lockToken = true;
          nbSaveCfg().then(function(){ nbDrawSettings(); toast('توکن قفل شد — فقط رمزشده ذخیره می شود', 'check'); });
        });
        var el = $('nbMiniInput');
        if (el) el.type = 'password';
        return;
      }
      if (e.target.id === 'nbProf' && e.target.value){
        apply();
        nbUseProfile(e.target.value);
        nbCloseSettings();
        return;
      }
      apply();
    });
    m.addEventListener('click', function(e){
      var fix = e.target.closest('[data-nb-colfix]');
      if (fix){ nbCollectionDialog(+fix.dataset.nbColfix); return; }
      var btn = e.target.closest('[data-nb-cfg]');
      if (!btn) return;
      if (btn.dataset.nbCfg === 'unlock'){ nbUnlock().then(function(ok){ if (ok) nbDrawSettings(); }); return; }
      if (btn.dataset.nbCfg === 'addcol'){ nbCollectionDialog(-1, ''); return; }
      var what = btn.dataset.nbCfg;
      if (what === 'test'){
        apply();
        $('nbTestOut').textContent = 'در حال آزمایش…';
        nbTest().then(function(r){
          $('nbTestOut').innerHTML = 'اوکی — <b dir="ltr">' + escapeHtml(r.name) + '</b>' + (r.private ? ' (خصوصی)' : ' (عمومی)')
            + (r.empty ? ' · هنوز commit ندارد' : ' · ' + escapeHtml(r.sha.slice(0, 7)))
            + (r.writable ? '' : ' · <span class="nb-warn">توکن اجازهٔ نوشتن ندارد</span>');
          NB.error = ''; nbSay();
          if (!r.empty) nbPull({});
        }).catch(function(err){ $('nbTestOut').innerHTML = '<span class="nb-warn">' + escapeHtml(err.message) + '</span>'; nbSay('error'); });
      } else if (what === 'addcol'){
        apply();
        C.collections.push({ id: 'c' + Date.now().toString(36), name: 'مجموعه', path: 'پوشه/{title}.md', template: '', calendar: '', color: '#6d5efc' });
        nbSaveCfg(); nbDrawSettings();
      } else if (what === 'delcol'){
        if (C.collections.length <= 1) return;
        C.collections.pop(); nbSaveCfg(); nbDrawSettings();
      } else if (what === 'tpl'){
        apply();
        var n = 0;
        Object.keys(NB_TEMPLATES).forEach(function(p){ if (!NB.files[p]){ nbWrite(p, NB_TEMPLATES[p]); n++; } });
        toast(n ? faNum(n) + ' قالب ساخته شد — با «ارسال» به مخزن می رود' : 'قالب ها از قبل بودند', 'check');
      } else if (what === 'config'){
        apply();
        nbWrite(C.configPath, JSON.stringify({
          version: 1, calendar: C.calendar || 'jalali', weekStart: C.weekStart, collections: C.collections,
          commit: { auto: C.auto, idleSeconds: C.idleSeconds }, attachments: C.attachments
        }, null, 2) + '\n');
        toast('config.json ساخته شد — با «ارسال» به مخزن می رود', 'check');
      } else if (what === 'zip'){
        nbDownloadZip('');
      } else if (what === 'saveprof'){
        apply();
        nbPrompt('نام این دفترچه', C.active || '', function(name){
          if (!name) return;
          nbSaveProfile(name);
          toast('دفترچه ذخیره شد: ' + name, 'check');
          nbDrawSettings();
        });
      } else if (what === 'delprof'){
        var drop = C.active;
        C.profiles = nbProfiles().filter(function(p){ return p.name !== drop; });
        C.active = '';
        nbSaveCfg(); nbDrawSettings();
        toast('دفترچه حذف شد (یادداشت هایش روی مخزن دست نخورده اند)', 'trash');
      }
    });
    var zi = $('nbZipIn');
    if (zi) zi.addEventListener('change', function(){
      var file = zi.files[0];
      if (!file) return;
      file.arrayBuffer().then(function(buf){ return nbUnzip(new Uint8Array(buf)); }).then(function(entries){
        var n = 0;
        entries.forEach(function(en){
          if (/\/$/.test(en.path) || /^__MACOSX|\.DS_Store/i.test(en.path)) return;
          if (!/\.(md|markdown|txt|json)$/i.test(en.path)) return;
          nbWrite(en.path.replace(/^\.\//, ''), nbUtf8Decode(en.data));
          n++;
        });
        toast(faNum(n) + ' فایل از zip وارد شد — با «ارسال» به مخزن می رود', 'upload');
      }).catch(function(e){ toast('zip خوانده نشد: ' + e.message, 'x'); });
      zi.value = '';
    });
  }
  function nbOpenSettings(){
    if (innerWidth < 760) nbSidebar(false);
    nbDrawSettings();
  }
  function nbCloseSettings(){ $('nbModal').hidden = true; }

  /* --- wiring --- */
  function nbActivePath(){ var t = currentTab(); return t && t.nb ? t.nb : ''; }
  nbTrap();
  /* the toolbar button carries data-action="notebook", so the app's own dispatch opens the drawer —
     a second listener here would toggle it twice and it would never look open */
  $('nbClose').addEventListener('click', function(){ nbSidebar(false); });
  $('nbBack').addEventListener('click', function(){ nbSidebar(false); });
  addEventListener('resize', function(){ if (NB.open) nbSlot(); nbStatus(); });
  /* the drawer remembers its width */
  (function(){
    var grip = $('nbGrip'), w = parseInt(storeGet('fs2-nbw') || '', 10);
    if (w >= 240 && w <= 720) document.documentElement.style.setProperty('--nb-w', w + 'px');
    if (!grip) return;
    var dragging = false;
    grip.addEventListener('mousedown', function(e){
      dragging = true; e.preventDefault();
      document.body.style.userSelect = 'none';
      grip.style.cursor = 'col-resize';
    });
    addEventListener('mousemove', function(e){
      if (!dragging) return;
      var w2 = Math.max(240, Math.min(720, e.clientX - document.documentElement.getBoundingClientRect().left));
      document.documentElement.style.setProperty('--nb-w', Math.round(w2) + 'px');
    });
    addEventListener('mouseup', function(){
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = '';
      var cur = getComputedStyle(document.documentElement).getPropertyValue('--nb-w').trim();
      storeSet('fs2-nbw', String(parseInt(cur, 10) || 328));
    });
  })();
  $('nbSync').addEventListener('click', function(e){
    e.stopPropagation();
    if (NB.locked){ nbUnlock(); return; }
    var m = $('nbSyncPop');
    m.hidden = !m.hidden;
    if (m.hidden) return;
    m.innerHTML = nbSyncPopHtml();
    nbSyncPopWire();
  });
  document.addEventListener('click', function(e){
    if (!e.target.closest('#nbSyncPop') && !e.target.closest('#nbSync')){
      var m = $('nbSyncPop');
      if (m) m.hidden = true;
    }
  });
  addEventListener('online', function(){
    nbSay();
    nbPull({ quiet: true }).then(function(){ if (nbCountDirty()) nbPush({}); });
  });
  addEventListener('offline', function(){ nbSay('offline'); });
  setInterval(nbAutoTick, 60000);
  document.addEventListener('visibilitychange', nbAutoTick);
  addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      var mini = $('nbMini'), menu = $('nbMenu'), mod = $('nbModal');
      if (menu && !menu.hidden){ menu.hidden = true; return; }
      if (mini && !mini.hidden){ nbCloseMini(); return; }
      if (mod && !mod.hidden){ nbCloseSettings(); return; }
      if (NB.open && document.activeElement && document.activeElement.closest && document.activeElement.closest('#nb')){ nbSidebar(false); }
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    var k = (e.key || '').toLowerCase();
    if (k === 's' || (e.key === '\\' && !e.shiftKey)){
      if (k === 's' && !nbActivePath() && !e.shiftKey) return;   // plain Ctrl+S keeps exporting the page
      e.preventDefault(); e.stopPropagation();
      nbSyncActiveNote(); nbPush({ loud: true });
      return;
    }
    if (e.key === '\\'){ e.preventDefault(); e.stopPropagation(); nbSidebar(); }
  }, true);

  /* --- palette and toolbar actions --- */
  ACTIONS['notebook'] = { label: 'دفترچه (یادداشت ها روی گیت هاب)', icon: 'tree', kbd: 'Ctrl \\', kw: 'notebook notes git markdown nb', run: function(){ nbSidebar(); } };
  ACTIONS['nb-settings'] = { label: 'تنظیمات دفترچه (مخزن، توکن، مجموعه ها)', icon: 'cloud', kw: 'notebook settings repo token git', run: nbOpenSettings };
  ACTIONS['nb-close'] = { label: 'بستن', icon: 'x', hidden: true, run: nbCloseSettings };
  ACTIONS['nb-new'] = { label: 'یادداشت تازه در دفترچه', icon: 'plus', kw: 'notebook new note daily', run: function(){ if (!NB.open) nbSidebar(true); nbSectionNotes(); nbNewDialog(); } };
  ACTIONS['nb-today'] = { label: 'یادداشت امروز (روزانه)', icon: 'clock', kw: 'notebook today daily journal', run: function(){
    var col = C.collections.filter(function(c){ return c.calendar === 'day'; })[0] || C.collections[0];
    var made = nbNewNote(col, new Date(), '');
    nbOpen(made.path, made.cursor);
    if (made.exists) toast('یادداشت امروز از قبل بود', 'x');
  } };
  ACTIONS['nb-push'] = { label: 'ارسال تغییرهای دفترچه به گیت هاب', icon: 'cloud', kw: 'notebook commit push sync git', run: function(){ nbSyncActiveNote(); nbPush({ loud: true }); } };
  ACTIONS['nb-pull'] = { label: 'گرفتن تغییرهای تازه از گیت هاب', icon: 'redo', kw: 'notebook pull fetch sync git', run: function(){ nbPull({ loud: true }); } };
  ACTIONS['nb-save-tab'] = { label: 'ذخیرهٔ تب فعلی در دفترچه', icon: 'cloud', kw: 'notebook save tab temp', run: function(){ nbSaveTabDialog(activeTab); } };
  ACTIONS['nb-zip'] = { label: 'دانلود دفترچه به صورت zip', icon: 'download', kw: 'notebook zip export backup', run: function(){ nbDownloadZip(''); } };
  ACTIONS['nb-find'] = { label: 'جستجو در یادداشت های دفترچه', icon: 'search', kbd: 'Ctrl Shift F', kw: 'notebook search find grep', run: function(){
    NB.section = 'search'; NB.focusSearch = true;
    if (!NB.open) nbSidebar(true); else nbRender();
  } };
  ACTIONS['nb-cal'] = { label: 'تقویم دفترچه (شمسی)', icon: 'clock', kw: 'notebook calendar jalali month', run: function(){
    NB.section = 'cal';
    if (!NB.open) nbSidebar(true); else nbRender();
  } };
  ACTIONS['nb-tags'] = { label: 'برچسب های دفترچه', icon: 'hash', kw: 'notebook tags', run: function(){
    NB.section = 'tags';
    if (!NB.open) nbSidebar(true); else nbRender();
  } };
  ACTIONS['nb-link'] = { label: 'درج پیوند به یادداشت [[…]]', icon: 'link', kw: 'notebook link wikilink', run: function(){
    if (!nbActivePath()){ toast('اول یک یادداشت دفترچه را باز کن', 'x'); return; }
    ta.focus();
    document.execCommand && document.execCommand('insertText', false, '[[');
    NB.query = '';
    nbSuggestOpen(nbIndex().slice(0, 6), ta.selectionStart);
  } };
  function nbSectionNotes(){ NB.section = 'notes'; nbRender(); }

  /* ================= جستجو، برچسب و ارجاع ها ================= */
  var nbIdxCache = null, nbSearchCache = null, nbSearchKey = '';
  function nbIdxInvalidate(){ nbIdxCache = null; nbSearchCache = null; }
  /** Which collection a path was made by (so the calendar and the filters can colour it). */
  var nbColRe = {};
  function nbCollectionOf(path){
    for (var i = 0; i < C.collections.length; i++){
      var col = C.collections[i];
      if (!col.path) continue;
      if (!nbColRe[col.id]) nbColRe[col.id] = new RegExp('^' + String(col.path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[a-z]+\\\}/g, '[^/]+') + '$');
      if (nbColRe[col.id].test(path)) return col;
    }
    return null;
  }
  function nbIndex(){
    if (nbIdxCache) return nbIdxCache;
    var list = [];
    NB.paths.forEach(function(p){
      var f = NB.files[p];
      if (!f || f.deleted || p.slice(-1) === '/') return;
      var col = nbCollectionOf(p);
      var locked = !!(f.enc && f.plain == null);
      var text = locked ? '' : nbTextOf(f);
      list.push({ path: p, title: nbTitle(p), col: col ? col.id : '', text: text, dirty: !!f.dirty, locked: locked,
        tags: locked ? [] : nbTags(text), hay: nbNorm(nbTitle(p) + ' ' + p + ' ' + text + (locked ? ' رمزدار' : '')) });
    });
    nbIdxCache = list;
    return list;
  }
  function nbSnippet(text, query){
    if (!query) return '';
    var i = nbNorm(text).indexOf(nbNorm(query));
    var at = i < 0 ? 0 : Math.max(0, i - 30);
    var s = text.replace(/\s+/g, ' ').slice(at, at + 130);
    return (at > 0 ? '…' : '') + s + (at + 130 < text.length ? '…' : '');
  }
  function nbSearchResults(){
    var q = nbNorm(NB.query || ''), out = [];
    var key = q + '|' + (NB.colFilter || '') + '|' + (NB.tagFilter || '');
    if (nbSearchCache && nbSearchKey === key) return nbSearchCache;
    nbIndex().forEach(function(n){
      if (NB.colFilter && n.col !== NB.colFilter) return;
      if (NB.tagFilter && n.tags.indexOf(NB.tagFilter) === -1) return;
      if (q){
        var hit = n.hay.indexOf(q) !== -1;
        if (!hit) return;
        n.score = nbNorm(n.title).indexOf(q) === 0 ? 0 : nbNorm(n.title).indexOf(q) !== -1 ? 1 : 2;
      } else n.score = 3;
      out.push(n);
    });
    out.sort(function(a, b){ return a.score - b.score || nbNorm(a.title).localeCompare(nbNorm(b.title)); });
    nbSearchCache = out.slice(0, 200); nbSearchKey = key;
    return nbSearchCache;
  }
  function nbSearchHtml(){
    if (!NB.query && !NB.colFilter && !NB.tagFilter) return '<div class="nb-empty">چیزی بنویس تا در متن همهٔ یادداشت ها بگردم.<br>ی «ی» و ک «ک» و نیم فاصله هم در نظر گرفته می شوند.</div>';
    var res = nbSearchResults();
    if (!res.length) return '<div class="nb-empty">چیزی پیدا نشد</div>';
    return '<div class="nb-hint">' + faNum(res.length) + ' یادداشت</div>' + res.map(function(n){
      return '<div class="nb-row nb-note-row nb-res-row" data-nb-note="' + escapeHtml(n.path) + '" tabindex="0">'
        + icon('file') + '<span class="nb-res-main"><b dir="auto">' + escapeHtml(n.title) + '</b>'
        + '<small dir="auto">' + escapeHtml(nbSnippet(n.text, NB.query)) + '</small></span>'
        + (n.dirty ? '<i class="nb-mark"></i>' : '') + '</div>';
    }).join('');
  }
  function nbTagCounts(){
    var m = {}, out = [];
    nbIndex().forEach(function(n){ n.tags.forEach(function(t){ m[t] = (m[t] || 0) + 1; }); });
    Object.keys(m).forEach(function(t){ out.push({ tag: t, n: m[t] }); });
    out.sort(function(a, b){ return b.n - a.n || nbNorm(a.tag).localeCompare(nbNorm(b.tag)); });
    return out;
  }
  function nbByTitle(name){
    var want = nbNorm(String(name).replace(/\.(md|markdown|txt)$/i, '').replace(/^.*\//, ''));
    var hits = nbIndex().filter(function(n){ return nbNorm(n.title) === want || nbNorm(n.title) === nbNorm(name); });
    if (hits.length) return hits[0].path;
    var loose = nbIndex().filter(function(n){ return nbNorm(n.title).indexOf(want) !== -1 && want; });
    return loose.length ? loose[0].path : '';
  }
  function nbBacklinks(path){
    var title = nbNorm(nbTitle(path));
    return nbIndex().filter(function(n){
      if (n.path === path) return false;
      return n.text.split('\n').some(function(line){
        return (line.match(/\[\[([^\[\]|]{1,140})(?:\|[^\[\]]*)?\]\]/g) || []).some(function(link){
          var target = nbNorm(link.slice(2, -2).split('|')[0]);
          return target === title || target === nbNorm(n.path);
        });
      });
    });
  }
  function nbBacklinksHtml(path){
    var back = nbBacklinks(path);
    if (!back.length) return '';
    return '<div class="nb-back"><div class="nb-back-title">ارجاع ها به این یادداشت (' + faNum(back.length) + ')</div>'
      + back.map(function(n){
        return '<div class="nb-row nb-note-row" data-nb-note="' + escapeHtml(n.path) + '" tabindex="0">'
          + icon('link') + '<span class="nb-name" dir="auto">' + escapeHtml(n.title) + '</span></div>';
      }).join('') + '</div>';
  }

  /* ================= پیوند [[…]] ================= */
  /** Opens what a `[[link]]` points at; a note that does not exist yet is made next to the current one. */
  function nbWikiOpen(name, fromPath){
    var path = nbByTitle(name);
    if (path){ nbOpen(path); return path; }
    var folder = fromPath ? nbFolder(fromPath) : '';
    var target = (folder ? folder + '/' : '') + nbSlug(name) + '.md';
    var linkCtx = nbCtx(new Date(), '', C.weekStart);
    nbWrite(target, '---\ntype: note\ndate: ' + linkCtx.jdateDash + '\ncreated: ' + linkCtx.gdate + '\ntags: []\n---\n# ' + name + '\n\n');
    nbOpen(target);
    toast('یادداشت تازه ساخته شد: ' + name, 'plus');
    return target;
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('#zoomWrap a.nb-wlink, #zoomWrap a[data-nb-link]');
    if (!a) return;
    e.preventDefault();
    var raw = a.dataset.nbLink ? decodeURIComponent(a.dataset.nbLink) : a.textContent;
    var name = String(raw).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    nbWikiOpen(name, nbActivePath());
  });
  /** Typing `[[` suggests the notes that already exist. */
  var nbSugBox = null, nbSugState = { at: -1, items: [], idx: 0 };
  function nbSuggestClose(){ if (nbSugBox){ nbSugBox.hidden = true; nbSugBox.innerHTML = ''; } nbSugState.at = -1; }
  function nbSuggestOpen(items, at){
    if (!nbSugBox){
      nbSugBox = document.createElement('div');
      nbSugBox.className = 'nb-sug';
      nbSugBox.hidden = true;
      document.body.appendChild(nbSugBox);
    }
    nbSugState.items = items; nbSugState.at = at; nbSugState.idx = 0;
    var r = ta.getBoundingClientRect();
    nbSugBox.style.left = Math.round(r.left + 10) + 'px';
    nbSugBox.style.width = Math.round(Math.min(360, r.width - 20)) + 'px';
    nbSugBox.style.top = Math.round(Math.max(60, r.bottom - 42 - Math.min(6, items.length) * 30)) + 'px';
    nbSuggestDraw();
    nbSugBox.hidden = false;
  }
  function nbSuggestDraw(){
    nbSugBox.innerHTML = nbSugState.items.map(function(it, i){
      return '<button type="button" class="nb-sug-row' + (i === nbSugState.idx ? ' on' : '') + '" data-nb-sug="' + i + '">'
        + icon('file') + '<span dir="auto">' + escapeHtml(it.title) + '</span><small dir="auto">' + escapeHtml(nbFolder(it.path)) + '</small></button>';
    }).join('');
  }
  function nbSuggestAccept(i){
    var it = nbSugState.items[i === undefined ? nbSugState.idx : i];
    if (!it) return nbSuggestClose();
    var v = ta.value, caret = ta.selectionStart;
    var before = v.slice(0, caret), m = before.match(/\[\[([^\[\]|]*)$/);
    var start = m ? caret - m[1].length - 2 : caret;
    var insert = '[[' + it.title + ']]';
    ta.setSelectionRange(start, caret);
    var ok = false;
    try { ok = document.execCommand('insertText', false, insert); } catch(e){}
    if (!ok){ ta.setRangeText(insert, start, caret, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    nbSuggestClose();
    ta.focus();
  }
  document.addEventListener('click', function(e){
    if (nbSugBox && !nbSugBox.hidden){
      var row = e.target.closest('[data-nb-sug]');
      if (row){ e.preventDefault(); nbSuggestAccept(+row.dataset.nbSug); return; }
      if (!e.target.closest('.nb-sug')) nbSuggestClose();
    }
  });
  document.addEventListener('keydown', function(e){
    if (!nbSugBox || nbSugBox.hidden) return;
    if (e.key === 'ArrowDown'){ nbSugState.idx = (nbSugState.idx + 1) % nbSugState.items.length; nbSuggestDraw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp'){ nbSugState.idx = (nbSugState.idx - 1 + nbSugState.items.length) % nbSugState.items.length; nbSuggestDraw(); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === 'Tab'){ nbSuggestAccept(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape'){ nbSuggestClose(); e.stopPropagation(); }
  }, true);
  function nbMaybeSuggest(){
    var t = currentTab();
    if (!t || !t.nb) return nbSuggestClose();
    var before = ta.value.slice(0, ta.selectionStart);
    var m = before.match(/\[\[([^\[\]|]{0,60})$/);
    if (!m) return nbSuggestClose();
    var q = nbNorm(m[1]);
    var items = nbIndex().filter(function(n){ return !q || nbNorm(n.title).indexOf(q) !== -1; })
      .sort(function(a, b){ return nbNorm(a.title).indexOf(q) - nbNorm(b.title).indexOf(q); }).slice(0, 6);
    if (!items.length) return nbSuggestClose();
    nbSuggestOpen(items, ta.selectionStart - m[1].length);
  }
  /** Renaming a note rewrites `[[links]]` that point at it. */
  function nbFixLinks(oldTitle, newTitle){
    var from = nbNorm(oldTitle), to = nbNorm(newTitle), n = 0;
    NB.paths.forEach(function(p){
      var f = NB.files[p];
      if (!f || f.deleted || p.slice(-1) === '/') return;
      if (from === to) return;
      var text = f.text.replace(/\[\[([^\[\]|]{1,140})(\|[^\[\]]*)?\]\]/g, function(m, target, label){
        if (nbNorm(target) !== from) return m;
        n++;
        return '[[' + newTitle + (label || '') + ']]';
      });
      if (text !== f.text){ f.text = text; f.dirty = true; f.at = Date.now(); nbRefreshOpenTab(p); }
    });
    if (n){ nbCountDirty(); nbSaveFiles(); nbRender(); }
    return n;
  }

  /* ================= تقویم شمسی ================= */
  var NB_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var NB_WD = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
  function nbCalShift(delta){
    var m = NB.calMonth.jm + delta, y = NB.calMonth.jy;
    while (m > 12){ m -= 12; y++; }
    while (m < 1){ m += 12; y--; }
    NB.calMonth = { jy: y, jm: m };
    nbRender();
  }
  function nbCalCells(){
    var jy = NB.calMonth.jy, jm = NB.calMonth.jm;
    var len = nbJ2d(jy, jm + 1, 1) - nbJ2d(jy, jm, 1);
    var firstG = nbJToG(jy, jm, 1);
    var startIdx = { saturday: 0, sunday: 1, monday: 2 }[C.weekStart] || 0;
    var lead = (((new Date(firstG.gy, firstG.gm - 1, firstG.gd).getDay() + 1) % 7) - startIdx + 7) % 7;
    var cells = [], i;
    for (i = 0; i < lead; i++) cells.push(null);
    for (i = 1; i <= len; i++){
      var g = nbJToG(jy, jm, i);
      cells.push({ jy: jy, jm: jm, jd: i, gy: g.gy, gm: g.gm, gd: g.gd, today: nbIsToday(g) });
    }
    while (cells.length % 7) cells.push(null);
    return cells;
  }
  function nbIsToday(g){
    var n = new Date();
    return n.getFullYear() === g.gy && n.getMonth() + 1 === g.gm && n.getDate() === g.gd;
  }
  /** Notes that a day already has: one path per collection whose pattern lands on that date. */
  function nbDayNotes(d){
    var date = new Date(d.gy, d.gm - 1, d.gd, 12, 0);
    var out = [];
    nbCalFiltered().forEach(function(col){
      if (!col.path) return;
      var pattern = String(col.path);
      if (pattern.indexOf('{title}') !== -1) return;              // «many per day»: only a dot when a note matches
      var p = nbFillPath(pattern, nbCtx(date, '', C.weekStart));
      if (NB.files[p] && !NB.files[p].deleted) out.push({ path: p, col: col });
      else if (pattern.indexOf('{title}') !== -1) out.push(null);
    });
    if (!out.length){
      // a day may still hold notes whose title carries the date (جلسه ها/…)
      var stamp = nbCtx(date, '', C.weekStart).jdate.replace(/\//g, '/');
      NB.paths.forEach(function(p){
        var f = NB.files[p];
        if (!f || f.deleted || p.slice(-1) === '/') return;
        if (p.indexOf(String(d.gy) + '-') !== -1 && p.indexOf(nbPad2(d.gm) + '-' + nbPad2(d.gd)) !== -1) out.push({ path: p, col: nbCollectionOf(p) });
      });
    }
    return out.filter(Boolean);
  }
  function nbCalFiltered(){
    return C.collections.filter(function(c){ return c.calendar && (!NB.calFilter || NB.calFilter === c.id); });
  }
  function nbCalHtml(){
    if (!NB.calMonth){
      var t = nbCtx(new Date(), '', C.weekStart);
      NB.calMonth = { jy: +t.jy, jm: +t.jm };
    }
    var cells = nbCalCells();
    var html = '<div class="nb-cal-head">'
      + '<button type="button" class="ib sm" data-nb-cal="-1" aria-label="ماه قبل">' + icon('chev') + '</button>'
      + '<b>' + escapeHtml(NB_MONTHS[NB.calMonth.jm - 1]) + ' ' + nbFaN(NB.calMonth.jy) + '</b>'
      + '<button type="button" class="ib sm" data-nb-cal="1" aria-label="ماه بعد"><span style="display:inline-flex;transform:rotate(180deg)">' + icon('chev') + '</span></button>'
      + '<button type="button" class="elbtn xs" data-nb-cal="today">امروز</button>'
      + '</div>'
      + '<div class="nb-cal-grid">' + NB_WD.map(function(w){ return '<span class="nb-cal-wd">' + w + '</span>'; }).join('') + '</div>'
      + '<div class="nb-cal-grid nb-cal-days">';
    cells.forEach(function(c){
      if (!c){ html += '<span class="nb-cal-cell empty"></span>'; return; }
      var notes = nbDayNotes(c);
      var dots = notes.slice(0, 4).map(function(n){
        var col = n.col ? n.col.color : '#6d5efc';
        return '<i class="nb-cal-dot" style="background:' + escapeHtml(col || '#6d5efc') + '"></i>';
      }).join('');
      html += '<span class="nb-cal-cell' + (c.today ? ' today' : '') + (notes.length ? ' has' : '') + '" data-nb-day="' + c.gy + '-' + nbPad2(c.gm) + '-' + nbPad2(c.gd) + '" title="' + (notes.length ? notes.map(function(n){ return nbTitle(n.path); }).join(' · ') : 'خالی') + '">'
        + (C.showGregorian ? '<i class="nb-cal-g">' + faNum(c.gd) + '</i>' : '')
        + faNum(c.jd) + '<span class="nb-cal-dots">' + dots + '</span></span>';
    });
    html += '</div>'
      + '<div class="nb-cal-legend">' + C.collections.map(function(col){
        return '<span class="nb-cal-lg" data-nb-lg="' + escapeHtml(col.id) + '" role="button" tabindex="0"><i style="background:' + escapeHtml(col.color || '#6d5efc') + '"></i>' + escapeHtml(col.name) + '</span>';
      }).join('') + '</div>'
      + '<div class="nb-hint">روی هر روز بزن: یادداشت همان روز باز می شود، یا با انتخاب مجموعه ساخته می شود. نقطه ها رنگ مجموعه را دارند.</div>';
    return html;
  }
  function nbDayClick(stamp){
    var p = String(stamp).split('-');
    var date = new Date(+p[0], +p[1] - 1, +p[2], 12, 0);
    var day = { gy: +p[0], gm: +p[1], gd: +p[2], jy: 0 };
    var notes = nbDayNotes({ gy: +p[0], gm: +p[1], gd: +p[2] });
    if (notes.length === 1){ nbOpen(notes[0].path); return; }
    if (notes.length > 1){ nbMenu(innerWidth / 2 - 90, innerHeight / 2 - 60, notes.map(function(n){ return { label: nbTitle(n.path), act: function(){ nbOpen(n.path); } }; })); return; }
    var candidates = C.collections.filter(function(c){ return c.calendar && c.calendar !== 'week'; });
    if (!candidates.length){ toast('مجموعه ای با تقویم روزانه نداری — در تنظیمات دفترچه بساز', 'x'); return; }
    if (candidates.length === 1){ nbMakeOnDate(candidates[0], date); return; }
    nbMenu(innerWidth / 2 - 90, innerHeight / 2 - 60, candidates.map(function(c){
      return { label: 'یادداشت در «' + c.name + '»', act: function(){ nbMakeOnDate(c, date); } };
    }));
  }
  function nbMakeOnDate(col, date){
    if (col.calendar === 'many' || String(col.path).indexOf('{title}') !== -1){
      nbNewDialog(col.id, null, date);
      return;
    }
    var made = nbNewNote(col, date, '');
    if (made.exists){ toast('همان روز یادداشت دارد — بازش کردم', 'x'); nbOpen(made.path); return; }
    nbOpen(made.path, made.cursor);
    toast('ساخته شد: ' + made.path, 'plus');
  }

  /* ================= تاریخچه با مقایسه و بازگرداندن ================= */
  function nbShowHistory(path){
    var sp = nbSplitRepo();
    if (!sp){ toast('مخزن وصل نیست', 'x'); return; }
    nbModalBox('تاریخچهٔ ' + nbTitle(path), '<div class="nb-hist" id="nbHistList"><p class="nb-mini-text">در حال خواندن…</p></div>',
      '<button class="btn-soft" type="button" data-nb-mini-close>بستن</button>', 'clock');
    nbHistoryList(path)
      .then(function(list){
        var box = $('nbHistList');
        if (!box) return;
        if (!list.length){ box.innerHTML = '<p class="nb-mini-text">تاریخچه ای نیست — یادداشت هنوز ارسال نشده.</p>'; return; }
        box.innerHTML = list.map(function(cm){
          return '<div class="nb-hist-row"><b dir="auto">' + escapeHtml(String(cm.message || '').split('\n')[0]) + '</b>'
            + '<small dir="ltr">' + escapeHtml(cm.sha.slice(0, 7)) + '</small><small>' + escapeHtml(nbShamsiLabel(cm.date) || '—') + '</small>'
            + '<span class="nb-hist-btns"><button type="button" class="elbtn xs" data-nb-hist="' + escapeHtml(cm.sha) + '">دیدن</button>'
            + '<button type="button" class="elbtn xs" data-nb-hist-cmp="' + escapeHtml(cm.sha) + '">مقایسه</button>'
            + '<button type="button" class="elbtn xs" data-nb-hist-back="' + escapeHtml(cm.sha) + '">برگرداندن</button></span></div>';
        }).join('');
        box.onclick = function(e){
          var btn = e.target.closest('[data-nb-hist], [data-nb-hist-cmp], [data-nb-hist-back]');
          if (!btn) return;
          var sha = btn.dataset.nbHist || btn.dataset.nbHistCmp || btn.dataset.nbHistBack;
          nbFileText(path, sha).then(function(old){
            if (btn.dataset.nbHist){
              openTab(old, 'markdown', 'نسخهٔ قدیمی در تب تازه باز شد');
              var fresh = currentTab();
              if (fresh && !fresh.nb) fresh.name = nbTitle(path) + ' (' + sha.slice(0, 7) + ')';
              drawTabs(); nbCloseMini();
              return;
            }
            if (btn.dataset.nbHistCmp){
              var f = NB.files[path];
              var ops = nbDiffLines(old, (f ? f.text : '')).filter(function(o){ return o.op !== 'same'; });
              $('nbHistList').innerHTML = '<div class="nb-diff">' + ops.map(function(o){
                return o.text.split('\n').map(function(line){
                  return '<div class="nb-diff-line ' + o.op + '"><span>' + (o.op === 'add' ? '+' : '-') + '</span><code dir="auto">' + escapeHtml(line) + '</code></div>';
                }).join('');
              }).join('') + '</div>';
              return;
            }
            nbConfirm('برگرداندن این نسخه', 'متن یادداشت به نسخهٔ ' + sha.slice(0, 7) + ' برگردد؟ (به عنوان یک تغییر تازه ذخیره می شود و با «ارسال» به مخزن می رود)', function(){
              nbWrite(path, old);
              var t2 = nbTabFor(path);
              if (t2){ t2.text = old; if (t2.id === activeTab){ ta.value = old; render(); } }
              nbCloseMini();
              toast('نسخه برگردانده شد — با ارسال ثبت می شود', 'undo');
            });
          }).catch(function(err){ toast(err.message, 'x'); });
        };
      })
      .catch(function(e){ if ($('nbHistList')) $('nbHistList').innerHTML = '<p class="nb-mini-text nb-warn">' + escapeHtml(e.message) + '</p>'; });
  }

  /* ================= پیوست ها و تصویرهای مخزن خصوصی ================= */
  var nbImgUrls = {}, nbImgBusy = {};
  function nbAttachDir(){ return (C.attachments || 'attachments').replace(/\/$/, '') + '/'; }
  function nbIsAttachment(p){ return String(p).indexOf(nbAttachDir()) === 0; }
  function nbStamp(d){
    d = d || new Date();
    return d.getFullYear() + '-' + nbPad2(d.getMonth() + 1) + '-' + nbPad2(d.getDate()) + '-' + nbPad2(d.getHours()) + nbPad2(d.getMinutes()) + nbPad2(d.getSeconds());
  }
  /** Stores a pasted or dropped file next to the notes; it rides up with the next commit. */
  function nbAddAttachment(name, base64, mime){
    var path = nbAttachDir() + nbSlug(name || nbStamp() + '.png');
    if (NB.attach[path] && !NB.attach[path].dirty){
      var n = 2, ext = /(\.[a-z0-9]+)$/i.exec(path);
      while (NB.attach[path + '']) { path = nbAttachDir() + nbStamp() + '-' + n + (ext ? ext[1] : '.png'); n++; }
    }
    NB.attach[path] = { path: path, b64: base64, mime: mime || 'image/png', dirty: true, at: Date.now() };
    nbSaveAttach();
    nbCountDirty();
    return path;
  }
  function nbDropAttachment(path){
    if (!NB.attach[path]) return false;
    NB.attach[path].deleted = true; NB.attach[path].dirty = true;
    nbSaveAttach();
    nbCountDirty();
    return true;
  }
  function nbFileToBase64(file){
    return new Promise(function(resolve, reject){
      var fr = new FileReader();
      fr.onload = function(){ resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function(){ reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }
  /** A private repository's images need the token, so they are fetched once and shown as blob URLs. */
  function nbFixImages(){
    var imgs = zoomWrap ? zoomWrap.querySelectorAll('img') : [];
    Array.prototype.forEach.call(imgs, function(img){
      var src = img.getAttribute('src') || '';
      if (!src || /^(https?:|data:|blob:)/.test(src)) return;
      var path = src.replace(/^\.\//, '');
      if (nbImgUrls[path]){ img.src = nbImgUrls[path]; img.setAttribute('data-nb-img', '1'); return; }
      if (nbImgBusy[path]) return;
      nbImgBusy[path] = true;
      var local = NB.attach[path];
      if (local && local.b64){ img.src = 'data:' + (local.mime || 'image/png') + ';base64,' + local.b64; nbImgUrls[path] = img.src; return; }
      var sp = nbSplitRepo();
      if (!sp){ return; }
      nbApi('GET', '/repos/' + sp.owner + '/' + sp.name + '/contents/' + nbEncodePath(path) + '?ref=' + encodeURIComponent(C.branch))
        .then(function(info){
          if (!info || !info.content) throw new Error('no content');
          var data = 'data:' + (info.encoding === 'base64' ? (guessMime(path)) : 'image/png') + ';base64,' + info.content.replace(/\s/g, '');
          nbImgUrls[path] = data;
          img.src = data;
          img.setAttribute('data-nb-img', '1');
        })
        .catch(function(){ img.classList.add('nb-img-missing'); })
        .then(function(){ nbImgBusy[path] = false; });
    });
  }
  function guessMime(p){
    var e = (/\.[a-z0-9]+$/i.exec(p) || [''])[0].toLowerCase();
    return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' }[e] || 'application/octet-stream';
  }
  if (typeof MutationObserver !== 'undefined'){
    var nbImgTimer = 0;
    new MutationObserver(function(){
      clearTimeout(nbImgTimer);
      nbImgTimer = setTimeout(nbFixImages, 200);
    }).observe(zoomWrap, { childList: true, subtree: true });
  }
  /* pasting an image into a notebook note uploads it and writes the reference */
  ta.addEventListener('paste', function(e){
    var t = currentTab();
    if (!t || !t.nb) return;
    var items = (e.clipboardData && e.clipboardData.files) || [];
    var file = null;
    for (var i = 0; i < items.length; i++){ if (/^image\//.test(items[i].type)){ file = items[i]; break; } }
    if (!file) return;
    e.preventDefault();
    toast('تصویر در حال افزودن…', 'image');
    nbFileToBase64(file).then(function(b64){
      var path = nbAddAttachment(nbStamp() + (file.type === 'image/jpeg' ? '.jpg' : '.png'), b64, file.type);
      var insert = '![' + path.split('/').pop().replace(/\.[a-z0-9]+$/i, '') + '](' + path + ')';
      document.execCommand && document.execCommand('insertText', false, insert);
      if (ta.value.indexOf(path) === -1) ta.dispatchEvent(new Event('input', { bubbles: true }));
      nbSyncActiveNote();
      nbFixImages();
      toast('تصویر پیوست شد — با ارسال به مخزن می رود', 'image');
    }).catch(function(){ toast('تصویر خوانده نشد', 'x'); });
  }, true);

  /* ================= ثبت سریع و دریافت از «اشتراک گذاری» ================= */
  function nbQuickInbox(prefill){
    var body = '<div class="nb-field"><label>متن</label><textarea class="nb-input nb-ta" id="nbQuickText" dir="auto" rows="6" placeholder="هر چه هست را بریز اینجا…">' + escapeHtml(prefill || '') + '</textarea></div>'
      + '<div class="nb-field"><label>مجموعه</label><select id="nbQuickCol">'
      + C.collections.map(function(c, i){ return '<option value="' + escapeHtml(c.id) + '"' + (i === 0 ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="nb-field"><label>عنوان</label><input class="nb-input" id="nbQuickTitle" dir="auto" placeholder="خالی = از خط اول متن"></div>';
    nbModalBox('ثبت سریع', body,
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">ذخیره در دفترچه</button>', 'plus');
    $('nbMiniOk').onclick = function(){
      var text = $('nbQuickText').value.trim();
      if (!text){ toast('متنی نیست', 'x'); return; }
      var title = $('nbQuickTitle').value.trim() || textTitle(text);
      var col = C.collections.filter(function(c){ return c.id === $('nbQuickCol').value; })[0] || C.collections[0];
      var made = nbNewNote(col, new Date(), title);
      if (made.exists) nbWrite(made.path, text);
      else {
        var f = NB.files[made.path];
        var fm = nbParseFm(f.text);
        nbWrite(made.path, f.text.replace(fm.raw, fm.raw) + '\n' + text + '\n');
      }
      nbCloseMini();
      nbOpen(made.path, made.cursor);
      toast('ثبت شد: ' + made.path, 'check');
    };
    $('nbQuickText').focus();
    if (!prefill){ try { navigator.clipboard.readText().then(function(clip){ if (clip && clipboardLooksUseful(clip)) $('nbQuickText').value = clip; }, function(){}); } catch(e){} }
  }
  function clipboardLooksUseful(s){ return s && s.trim().length > 24 && s.length < 20000; }
  /** Android/iOS «share» lands here as a POST (see sw.js and manifest.webmanifest). */
  function nbCheckShare(){
    idbGet('inbox-share', 'meta').then(function(item){
      if (!item || Date.now() - item.at > 600000) return;
      idbSet('inbox-share', null, 'meta');
      NB.section = 'notes';
      nbQuickInbox([item.title, item.text].filter(Boolean).join('\n\n'));
    }).catch(function(){});
  }

  /* ================= چند دفترچه ================= */
  function nbProfiles(){
    if (!Array.isArray(C.profiles)) C.profiles = [];
    return C.profiles;
  }
  function nbUseProfile(name){
    var p = nbProfiles().filter(function(x){ return x.name === name; })[0];
    if (!p){ toast('این دفترچه پیدا نشد', 'x'); return; }
    nbSaveFiles().then(function(){                  // everything in flight goes to its own store first
      C.repo = p.repo; C.branch = p.branch || 'main'; C.token = p.token || '';
      if (!C.token && p.tokenEnc){ C.tokenEnc = p.tokenEnc; NB.locked = !!C.lockToken; }
      if (Array.isArray(p.collections) && p.collections.length) C.collections = p.collections;
      C.active = name;
      NB.files = {}; NB.paths = []; NB.conflicts = []; NB.lastCommit = ''; NB.lastSync = 0;
      nbSaveCfg();
      nbReloadFiles();
      toast('دفترچه: ' + name, 'folder');
    });
  }
  function nbReloadFiles(){
    nbIdxInvalidate();
    return nbLoadFiles().then(function(){
      nbCountDirty(); nbRender(); nbSay();
      if (C.repo) nbSchedulePull(600);
    });
  }
  function nbSaveProfile(name){
    var list = nbProfiles().filter(function(x){ return x.name !== name; });
    list.push({ name: name, repo: C.repo, branch: C.branch, token: C.token, collections: C.collections });
    C.profiles = list; C.active = name;
    nbSaveCfg();
  }
  function nbStoreSuffix(){ return ':' + (C.repo || 'local').replace(/[^\w.-]/g, '_'); }

  /* ================= یادداشت رمزدار ================= */
  var NB_ENC_HEAD = 'mizkar-enc';
  function nbIsEncrypted(text){ return String(text).indexOf('---\n' + NB_ENC_HEAD + ':') === 0 || String(text).indexOf(NB_ENC_HEAD + ':') === 0; }
  function nbB64Bytes(buf){
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  function nbBytesB64(b64){
    var s = atob(b64), out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function nbAskPass(first){
    return new Promise(function(resolve){
      nbPrompt(first ? 'گذرواژهٔ یادداشت های رمزدار' : 'گذرواژه', '', function(v){ resolve(v || null); });
      var el = $('nbMiniInput');
      if (el) el.type = 'password';
    });
  }
  var NB_KDF_ROUNDS = 600000, nbKeyCache = {};
  /** A key per (passphrase, salt, rounds), derived once per page: the slow part of PBKDF2 is paid once. */
  function nbKeyFromPass(pass, salt, rounds){
    rounds = rounds || NB_KDF_ROUNDS;
    var id = rounds + ':' + nbB64Bytes(salt) + ':' + pass;
    if (nbKeyCache[id]) return nbKeyCache[id];
    var enc = new TextEncoder();
    nbKeyCache[id] = crypto.subtle.importKey('raw', enc.encode(pass), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function(base){
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: rounds, hash: 'SHA-256' }, base,
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
    nbKeyCache[id].catch(function(){ delete nbKeyCache[id]; });
    return nbKeyCache[id];
  }
  /** `salt` is given only for the local copy (one salt per page, so the key is derived once); git gets a fresh one each time. */
  function nbEncrypt(text, pass, salt){
    salt = salt || crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return nbKeyFromPass(pass, salt, NB_KDF_ROUNDS).then(function(key){
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text));
    }).then(function(ct){
      return '---\n' + NB_ENC_HEAD + ': 1\nkdf: PBKDF2-' + NB_KDF_ROUNDS + '\nsalt: ' + nbB64Bytes(salt) + '\niv: ' + nbB64Bytes(iv) + '\n---\n'
        + nbB64Bytes(ct).replace(/(.{76})/g, '$1\n') + '\n';
    });
  }
  function nbDecrypt(text, pass){
    var salt = /salt: ([^\n]+)/.exec(text), iv = /iv: ([^\n]+)/.exec(text), kdf = /kdf: PBKDF2-(\d+)/.exec(text);
    if (!salt || !iv) return Promise.reject(new Error('قالب یادداشت رمزدار خوانده نشد'));
    var body = text.split(/\n---\n/).slice(1).join('\n---\n').replace(/\s+/g, '');
    return nbKeyFromPass(pass, nbBytesB64(salt[1]), kdf ? +kdf[1] : 150000).then(function(key){
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: nbBytesB64(iv[1]) }, key, nbBytesB64(body));
    }).then(function(plain){ return new TextDecoder().decode(plain); });
  }
  /** Turns a note into a secret one (or back): the working copy keeps plaintext, git gets ciphertext. */
  function nbToggleEncrypt(path){
    var f = NB.files[path];
    if (!f) return;
    if (f.enc){
      f.enc = false;
      if (f.plain != null){ f.text = f.plain; f.plain = null; }
      toast('رمزگذاری برداشته شد — با ارسال، متن ساده روی مخزن می رود', 'x');
      var t0 = nbTabFor(path);
      if (t0) t0.secret = false;
    } else {
      if (!NB.pass){
        nbAskPass(true).then(function(p){ if (p){ NB.pass = p; nbToggleEncrypt(path); } });
        return;
      }
      f.enc = true;
      f.plain = f.plain != null ? f.plain : f.text;
      var t1 = nbTabFor(path);
      if (t1) t1.secret = true;
      toast('رمزگذاری فعال شد — از «ارسال» به بعد رمزدار می رود', 'check');
    }
    f.dirty = true; f.at = Date.now();
    nbCountDirty(); nbRender(); nbSaveFiles(); saveState();
  }
  function nbEnsurePlain(path){
    var f = NB.files[path];
    if (!f || !f.enc) return Promise.resolve(true);
    if (f.plain != null) return Promise.resolve(true);
    return (NB.pass ? Promise.resolve(NB.pass) : nbAskPass(true)).then(function(pass){
      if (!pass) return false;
      NB.pass = pass;
      return nbDecrypt(f.localCipher || f.text, pass).then(function(plain){ f.plain = plain; if (f.basePlain == null && !f.dirty) f.basePlain = plain; return true; },
        function(e){ toast('رمزگشایی نشد — گذرواژه درست است؟ (' + e.message + ')', 'x'); return false; });
    });
  }

  /* ================= گیت لب ================= */
  function nbGL(){
    var sp = nbSplitRepo();
    return { id: sp ? encodeURIComponent(sp.owner + '/' + sp.name) : '', project: sp ? sp.owner + '/' + sp.name : '' };
  }
  function nbTools(){ return { api: nbApi, split: nbSplitRepo, gl: nbGL, merge: nbMerge3, index: nbIndex }; }

  /* The soft keyboard shrinks the visual viewport: the sheets step up so nothing hides under it. */
  if (window.visualViewport){
    var nbKb = function(){
      var vv = window.visualViewport;
      var kb = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
      document.documentElement.style.setProperty('--nb-kb', (kb > 60 ? kb : 0) + 'px');
    };
    visualViewport.addEventListener('resize', nbKb);
    visualViewport.addEventListener('scroll', nbKb);
    nbKb();
  }

  /* ================= تاریخ شمسی: انتخابگر و برچسب ها ================= */
  /** Persian/Latin digits to Latin digits. */
  function nbDg(s){ return String(s == null ? '' : s).replace(/[۰-۹]/g, function(c){ return String(c.charCodeAt(0) - 0x06F0); }); }
  /** Any date (Date, «1405-08-05», «۱۴۰۵/۰۸/۰۵», «2026-10-27») as a Shamsi «1405-08-05» stamp. */
  function nbShamsiStamp(v){
    if (Object.prototype.toString.call(v) === '[object Date]') return nbCtx(v, '', C.weekStart).jdateDash;
    var m = nbDg(v).trim().replace(/[/.]/g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    var y = +m[1], mo = +m[2], d = +m[3];
    if (!y || !mo || !d || mo > 12 || d > 31) return '';
    if (y < 1700) return m[1] + '-' + nbPad2(mo) + '-' + nbPad2(d);      // already Shamsi
    var j = nbGToJ(y, mo, d);
    return j.jy + '-' + nbPad2(j.jm) + '-' + nbPad2(j.jd);
  }
  /** «۱۴۰۵/۰۸/۰۵» for anything that carries a date. */
  function nbShamsiLabel(v){
    var s = nbShamsiStamp(v);
    return s ? nbFaN(s.replace(/-/g, '/')) : '';
  }
  /** A Shamsi stamp as a Date (noon, so no timezone slips a day). */
  function nbStampToDate(stamp){
    var p = nbShamsiStamp(stamp).split('-');
    if (p.length !== 3) return new Date();
    var g = nbJToG(+p[0], +p[1], +p[2]);
    return new Date(g.gy, g.gm - 1, g.gd, 12, 0);
  }
  /** The weekday labels, starting from the configured week start. */
  function nbWeekDays(){
    var start = { saturday: 0, sunday: 1, monday: 2 }[C.weekStart || 'saturday'] || 0;
    return NB_WD.slice(start).concat(NB_WD.slice(0, start));
  }
  /** The days of a Shamsi month laid out from the week start (null = padding). */
  function nbJMonthGrid(jy, jm){
    var len = jm <= 6 ? 31 : jm <= 11 ? 30 : (nbJalCal(jy).leap === 0 ? 30 : 29);
    var g = nbJToG(jy, jm, 1);
    var dow = new Date(g.gy, g.gm - 1, g.gd).getDay();                  // 0 = Sunday
    var start = { saturday: 0, sunday: 1, monday: 2 }[C.weekStart || 'saturday'] || 0;
    var pad = (((dow + 1 - start) % 7) + 7) % 7;
    var cells = [], i, d;
    for (i = 0; i < pad; i++) cells.push(null);
    for (d = 1; d <= len; d++){ var gg = nbJToG(jy, jm, d); cells.push({ jd: d, gy: gg.gy, gm: gg.gm, gd: gg.gd }); }
    return cells;
  }
  /** The Shamsi date picker: a Persian month grid, and typing «1405/08/05» or «۱۴۰۵/۰۸/۰۵» works. */
  function nbDateDialog(opts){
    opts = opts || {};
    var chosen = nbShamsiStamp(opts.value) || nbShamsiStamp(new Date());
    var view = { jy: +chosen.split('-')[0], jm: +chosen.split('-')[1] };
    nbModalBox(opts.title || 'تاریخ',
      '<div class="nb-dp">'
      + '<input class="nb-input nb-dp-in" id="nbDpIn" dir="ltr" inputmode="numeric" placeholder="1405/08/05" value="' + chosen.replace(/-/g, '/') + '">'
      + '<div class="nb-cal-head"><button type="button" class="ib sm" data-nb-dp="m-1" aria-label="ماه قبل">' + icon('chev') + '</button>'
      + '<b id="nbDpTitle"></b>'
      + '<button type="button" class="ib sm" data-nb-dp="m1" aria-label="ماه بعد"><span style="display:inline-flex;transform:rotate(180deg)">' + icon('chev') + '</span></button>'
      + '<button type="button" class="elbtn xs" data-nb-dp="today">امروز</button></div>'
      + '<div class="nb-cal-grid" id="nbDpWd"></div><div class="nb-cal-grid nb-cal-days" id="nbDpGrid"></div>'
      + '<p class="nb-mini-text" id="nbDpOut"></p></div>',
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button>'
      + (opts.allowEmpty ? '<button class="btn-soft" type="button" data-nb-dp="clear">بدون تاریخ</button>' : '')
      + '<button class="btn-primary" type="button" data-nb-dp="ok">تأیید</button>', 'clock', 'nbMini2');
    function draw(){
      $('nbDpTitle').textContent = NB_MONTHS[view.jm - 1] + ' ' + nbFaN(view.jy);
      $('nbDpWd').innerHTML = nbWeekDays().map(function(w){ return '<span class="nb-cal-wd">' + w + '</span>'; }).join('');
      $('nbDpGrid').innerHTML = nbJMonthGrid(view.jy, view.jm).map(function(c){
        if (!c) return '<span class="nb-cal-cell empty"></span>';
        var stamp = view.jy + '-' + nbPad2(view.jm) + '-' + nbPad2(c.jd);
        return '<span class="nb-cal-cell nb-dp-day' + (nbIsToday(c) ? ' today' : '') + (stamp === chosen ? ' sel' : '')
          + '" data-nb-dp="' + stamp + '">' + faNum(c.jd) + '</span>';
      }).join('');
      $('nbDpOut').textContent = nbShamsiLabel(chosen) + ' — ' + nbCtx(nbStampToDate(chosen), '', C.weekStart).weekday;
    }
    function pick(stamp){
      chosen = nbShamsiStamp(stamp) || chosen;
      view = { jy: +chosen.split('-')[0], jm: +chosen.split('-')[1] };
      $('nbDpIn').value = chosen.replace(/-/g, '/');
      draw();
    }
    draw();
    $('nbDpIn').addEventListener('input', function(){
      var s = nbShamsiStamp($('nbDpIn').value);
      if (s){ chosen = s; view = { jy: +s.split('-')[0], jm: +s.split('-')[1] }; draw(); }
    });
    $('nbMini2').addEventListener('click', function(e){
      var b = e.target.closest('[data-nb-dp]');
      if (!b) return;
      e.stopPropagation();
      var w = b.dataset.nbDp;
      if (w === 'm-1' || w === 'm1'){
        var m = view.jm + (w === 'm1' ? 1 : -1);
        if (m < 1){ view.jm = 12; view.jy -= 1; } else if (m > 12){ view.jm = 1; view.jy += 1; } else view.jm = m;
        draw();
        return;
      }
      if (w === 'today'){ pick(new Date()); return; }
      if (w === 'clear'){ if (opts.onOk) opts.onOk(''); nbCloseMini('nbMini2'); return; }
      if (w === 'ok'){ if (opts.onOk) opts.onOk(chosen); nbCloseMini('nbMini2'); return; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(w)) pick(w);
    });
  }
  /** A date field for a dialog: shows the Shamsi date and opens the picker (id carries the stamp). */
  function nbDateField(id, value, o){
    o = o || {};
    var stamp = nbShamsiStamp(value);
    return '<button type="button" class="nb-input nb-datebtn" id="' + id + '" data-nb-date="' + escapeHtml(stamp)
      + '"' + (o.empty ? ' data-nb-date-empty="1"' : '') + (o.title ? ' data-nb-date-title="' + escapeHtml(o.title) + '"' : '')
      + '>' + (stamp ? nbShamsiLabel(stamp) : 'انتخاب تاریخ') + '</button>';
  }
  // one handler for every date field, everywhere in the notebook
  document.addEventListener('click', function(e){
    var b = e.target.closest('[data-nb-date]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    nbDateDialog({
      value: b.dataset.nbDate, allowEmpty: b.dataset.nbDateEmpty === '1', title: b.dataset.nbDateTitle,
      onOk: function(stamp){
        b.dataset.nbDate = stamp || '';
        b.textContent = stamp ? nbShamsiLabel(stamp) : 'انتخاب تاریخ';
        b.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }, true);

  /* ================= نقشهٔ کلیک راست و فشار طولانی روی لمس ================= */
  /** A note made from one of the samples, in this folder. */
  function nbNewFromTemplate(folder, tpl){
    var preset = tpl || '';
    var guess = preset ? nbTitle(preset) : 'یادداشت تازه';
    nbPrompt('نام یادداشت', guess, function(v){
      if (v === undefined || v === null || v === '') return;
      var title = v.trim();
      var p = (folder ? folder.replace(/\/+$/, '') + '/' : '') + title + '.md';
      if (NB.files[p] && !NB.files[p].deleted){ toast('یادداشتی با همین نام هست', 'x'); return; }
      var tplText = preset ? (NB.files[preset] ? nbTextOf(NB.files[preset]) : NB_TEMPLATES[preset]) : '';
      var filled = nbFillTemplate(tplText || '---\ndate: {{date}}\ncreated: {{gdate}}\n---\n# {{title}}\n\n{{cursor}}\n', nbCtx(new Date(), title, C.weekStart));
      nbWrite(p, filled.text);
      nbOpen(p, filled.cursor);
      toast('یادداشت ساخته شد', 'plus');
    });
  }
  /** One note per template, plus the plain one. */
  function nbTemplateMenu(folder){
    var items = Object.keys(NB_TEMPLATES).map(function(p){
      return { label: nbTitle(p) + (NB.files[p] ? '' : ' (نمونه)'), act: function(){ nbNewFromTemplate(folder, p); } };
    });
    items.push(null, { label: 'یادداشت ساده', act: function(){ nbNewFromTemplate(folder, ''); } });
    return items;
  }
  /** Every note of that folder, one tab each. */
  function nbOpenAllIn(folder){
    var pre = folder.replace(/\/+$/, '') + '/';
    var list = NB.paths.filter(function(p){
      return p.indexOf(pre) === 0 && p.slice(-1) !== '/' && nbIsNote(p) && !(NB.files[p] && NB.files[p].deleted);
    });
    if (!list.length){ toast('در این پوشه یادداشتی نیست', 'x'); return; }
    var many = list.slice(0, 10);
    many.forEach(function(p){ nbOpen(p); });
    toast(faNum(many.length) + ' یادداشت در تب باز شد' + (list.length > many.length ? ' — ' + faNum(list.length - many.length) + ' تای دیگر باز نشد' : ''), 'file');
  }
  /** Into another collection: the pattern renames the note (the date comes from its front matter). */
  function nbMoveToCollection(path){
    var items = C.collections.map(function(c, i){
      return { label: c.name + ' — ' + nbFolderOfPattern(c.path), act: function(){ nbMoveNoteToCollection(path, i); } };
    });
    nbMenu(innerWidth / 2 - 110, 100, items);
  }
  function nbMoveNoteToCollection(path, ci){
    var col = C.collections[ci], f = NB.files[path];
    if (!col || !f) return;
    var fm = nbParseFm(nbTextOf(f)) || {};
    var date = nbStampToDate(nbShamsiStamp(fm.date || fm.created) || new Date());
    var to = nbFillPath(col.path, nbCtx(date, nbTitle(path), C.weekStart));
    if (to === path){ toast('همین حالا در این مجموعه است', 'check'); return; }
    if (NB.files[to] && !NB.files[to].deleted){ toast('در آن مجموعه یادداشتی با همین نام هست', 'x'); return; }
    var was = path;
    if (!nbMoveNote(path, to)) return '';
    var dir = nbFolder(to);                          // the folder may be new: show it in the tree
    if (dir && NB.paths.indexOf(dir + '/') === -1) NB.paths.push(dir + '/');
    toast('به «' + col.name + '» منتقل شد', 'folder', { label: 'بازگشت', icon: 'undo', run: function(){ nbMoveNote(to, was); } });
    return to;
  }
  /** The note in its own browser tab (side by side on a big screen). */
  function nbOpenInNewTab(path){
    var url = location.pathname + '?note=' + encodeURIComponent(path) + location.hash;
    var w = window.open(url, '_blank');
    if (!w) toast('مرورگر پنجرهٔ تازه را نبست — اجازه بده', 'x');
  }
  /** Pin the tab that holds this note. */
  function nbPinNoteTab(path){
    var t = nbTabFor(path);
    if (!t){ nbOpen(path); t = nbTabFor(path); }
    if (t){ switchTab(t.id); togglePin(t.id); }
  }
  /** The notes of one collection, in the tree view. */
  function nbShowCollection(id){
    var col = C.collections.filter(function(c){ return c.id === id; })[0];
    if (!col) return;
    var folder = nbFolderOfPattern(col.path);
    NB.colFilter = id;
    NB.section = 'search';
    NB.query = '';
    NB.tagFilter = '';
    nbSidebar(true);
    nbRender();
    toast('یادداشت های «' + col.name + '»' + (folder ? ' — پوشهٔ ' + folder : ''), 'tree');
  }
  /** A day in the calendar: the collections that build a note for it, its notes, its tasks. */
  function nbCalDayMenu(d){
    var date = new Date(d.gy, d.gm - 1, d.gd, 12, 0);
    var stamp = d.gy + '-' + nbPad2(d.gm) + '-' + nbPad2(d.gd);
    var notes = nbDayNotes(d);
    var items = [];
    nbCalFiltered().forEach(function(c){
      var p = nbFillPath(c.path, nbCtx(date, '', C.weekStart));
      var has = !!(NB.files[p] && !NB.files[p].deleted);
      items.push({ label: c.name + ' — ' + (has ? 'باز کردن' : 'ساختن'), act: function(){ nbMakeOnDate(c, date); } });
    });
    items.push(null);
    items.push({ label: notes.length ? 'یادداشت های این روز (' + faNum(notes.length) + ')' : 'یادداشت های این روز — خالی', act: function(){
      if (!notes.length){ toast('این روز یادداشتی ندارد', 'x'); return; }
      nbMenu(innerWidth / 2 - 110, 100, notes.map(function(n){ return { label: nbTitle(n.path), act: function(){ nbOpen(n.path); } }; }));
    } });
    var tasks = homeTasks().filter(function(t){ return t.due === stamp && !t.done; });
    items.push({ label: tasks.length ? 'کارهای این روز (' + faNum(tasks.length) + ')' : 'کارهای این روز — خالی', act: function(){
      if (!tasks.length){ toast('این روز کاری ندارد', 'x'); return; }
      nbMenu(innerWidth / 2 - 110, 100, tasks.map(function(t){ return { label: t.text, act: function(){ homeOpenTask(encodeURIComponent(t.path) + ':' + t.line); } }; }));
    } });
    return items;
  }
  /** The month header: filter the dots, or jump to today. */
  function nbCalMonthMenu(){
    var items = [{ label: (NB.calFilter ? '' : '✓ ') + 'همهٔ مجموعه ها', act: function(){ NB.calFilter = ''; nbRender(); } }];
    C.collections.forEach(function(c){
      items.push({ label: (NB.calFilter === c.id ? '✓ ' : '') + 'فقط ' + c.name, act: function(){ NB.calFilter = c.id; nbRender(); } });
    });
    items.push(null, { label: 'برو به امروز', act: function(){ var t = nbCtx(new Date(), '', C.weekStart); NB.calMonth = { jy: +t.jy, jm: +t.jm }; nbRender(); } });
    return items;
  }
  /** A due date on a task, written as «📅 1405-08-05». */
  function nbTaskDue(id, days){
    var at = homeTaskAt(id), f = NB.files[at.path];
    if (!f || f.deleted || nbReadOnly(at.path) || (f.enc && f.plain == null)){ toast('این یادداشت ویرایش نمی شود', 'x'); return; }
    var lines = nbTextOf(f).split('\n'), m = HOME_TASK_RE.exec(lines[at.line] || '');
    if (!m) return;
    var inner = m[3].replace(HOME_DUE_RE, '').replace(/[📅⏳]\s*(?![0-9۰-۹])/g, '').replace(/\s+$/, '');
    if (days !== null){
      var stamp = nbShamsiStamp(homeAddDays(homeToday(), days));
      inner = (inner ? inner + ' ' : '') + '📅 ' + stamp;
    }
    lines[at.line] = m[1] + '- [' + m[2] + '] ' + inner;
    var text = lines.join('\n');
    nbStoreText(f, text);
    var t = nbTabFor(at.path);
    if (t){ t.text = text; if (t.id === activeTab) ta.value = text; }
    nbCountDirty(); nbStatus(); nbSaveFiles();
    if (C.auto) nbScheduleCommit();
    render(); if (NB.open) nbRender();
    toast(days === null ? 'تاریخ سررسید برداشته شد' : 'سررسید: ' + nbShamsiLabel(stamp), 'clock');
  }
  function nbTaskDuePick(id){
    var at = homeTaskAt(id), f = NB.files[at.path];
    var cur = f ? (HOME_DUE_RE.exec((nbTextOf(f).split('\n')[at.line] || '')) || [])[0] : '';
    nbDateDialog({ title: 'تاریخ سررسید', allowEmpty: true, value: cur ? nbShamsiStamp(cur.replace(/^[^0-9۰-۹]*/, '')) : '',
      onOk: function(stamp){
        var at2 = homeTaskAt(id), f2 = NB.files[at2.path];
        if (!f2) return;
        var lines = nbTextOf(f2).split('\n'), m = HOME_TASK_RE.exec(lines[at2.line] || '');
        if (!m) return;
        var inner = m[3].replace(HOME_DUE_RE, '').replace(/[📅⏳]\s*(?![0-9۰-۹])/g, '').replace(/\s+$/, '');
        if (stamp) inner = (inner ? inner + ' ' : '') + '📅 ' + stamp;
        lines[at2.line] = m[1] + '- [' + m[2] + '] ' + inner;
        var text = lines.join('\n');
        nbStoreText(f2, text);
        var t = nbTabFor(at2.path);
        if (t){ t.text = text; if (t.id === activeTab) ta.value = text; }
        nbCountDirty(); nbStatus(); nbSaveFiles();
        render(); if (NB.open) nbRender();
        toast(stamp ? 'سررسید: ' + nbShamsiLabel(stamp) : 'تاریخ سررسید برداشته شد', 'clock');
      } });
  }
  function nbTaskMenu(id){
    var at = homeTaskAt(id), f = NB.files[at.path];
    var done = f ? /\[(x|X)\]/.test((nbTextOf(f).split('\n')[at.line] || '')) : false;
    return [
      { label: 'تاریخ سررسید…', act: function(){ nbTaskDuePick(id); } },
      { label: 'امروز', act: function(){ nbTaskDue(id, 0); } },
      { label: 'فردا', act: function(){ nbTaskDue(id, 1); } },
      { label: 'بدون تاریخ', act: function(){ nbTaskDue(id, null); } },
      null,
      { label: 'باز کردن یادداشت', act: function(){ homeOpenTask(id); } },
      { label: done ? 'برگرداندن به کارهای باز' : 'انجام شد', act: function(){ homeToggleTask(id, !done); } },
      { label: 'نمایش در درخت', act: function(){ nbShowInTree(at.path); } }
    ];
  }
  /** Show a note in the tree view (opens the drawer on «دفترچه» and reveals its folder). */
  function nbShowInTree(path){
    NB.section = 'notes';
    NB.query = '';
    NB.tagFilter = '';
    nbSidebar(true);
    var dir = nbFolder(path);
    while (dir){ NB.expanded[dir] = true; dir = nbFolder(dir); }
    nbRender();
  }
  /* ================= منو ها: تقویم، کارها، پیش نمایش، ویرایشگر، جستجو ================= */
  function nbCalCtx(e){
    var day = e.target.closest('[data-nb-day]');
    if (day){
      var p = day.dataset.nbDay.split('-');
      e.preventDefault();
      nbMenu(e.clientX, e.clientY, nbCalDayMenu({ gy: +p[0], gm: +p[1], gd: +p[2] }));
      return true;
    }
    var lg = e.target.closest('[data-nb-lg]');
    if (lg){
      e.preventDefault();
      var id = lg.dataset.nbLg;
      nbMenu(e.clientX, e.clientY, [
        { label: 'یادداشت های این مجموعه', act: function(){ nbShowCollection(id); } },
        { label: 'فقط این مجموعه را نشان بده', act: function(){ NB.calFilter = id; nbRender(); } },
        { label: 'همهٔ مجموعه ها', act: function(){ NB.calFilter = ''; nbRender(); } }
      ]);
      return true;
    }
    if (e.target.closest('.nb-cal-head')){
      e.preventDefault();
      nbMenu(e.clientX, e.clientY, nbCalMonthMenu());
      return true;
    }
    return false;
  }
  function nbTaskCtx(e){
    var t = e.target.closest('[data-task-open]');
    if (!t) return false;
    e.preventDefault();
    nbMenu(e.clientX, e.clientY, nbTaskMenu(t.dataset.taskOpen));
    return true;
  }
  function nbSearchCtx(e){
    var row = e.target.closest('#nbRes .nb-res-row[data-nb-note]');
    if (!row) return false;
    e.preventDefault();
    var path = row.dataset.nbNote;
    nbMenu(e.clientX, e.clientY, [
      { label: 'باز کردن', act: function(){ nbOpen(path); } },
      { label: 'باز کردن در تب تازه', act: function(){ nbOpenInNewTab(path); } },
      { label: 'کپی پیوند', act: function(){ nbCopyLink(path); } },
      { label: 'نمایش در درخت', act: function(){ nbShowInTree(path); } }
    ]);
    return true;
  }
  function nbCopyLink(path, heading){
    var link = '[[' + nbTitle(path) + (heading ? '#' + heading : '') + ']]';
    copyToClipboard('پیوند', link).then(function(ok){ toast(ok ? 'کپی شد: ' + link : 'کپی نشد', ok ? 'link' : 'x'); });
  }
  /** Reading a note: edit here, copy the block, copy a heading link. */
  function nbPreviewCtx(e){
    var t = currentTab();
    if (!t || !t.nb || body.dataset.view === 'editor') return false;
    if (e.target.closest('a, img')) return false;            // links keep the browser menu
    var block = e.target.closest(IP_BLOCKS) || e.target;
    var line = typeof ipLineOf === 'function' ? ipLineOf(block) : -1;
    if (line < 0) return false;
    e.preventDefault();
    var heading = /^h[1-6]$/i.test(block.tagName);
    var items = [
      { label: 'ویرایش اینجا', act: function(){ ipEdit(line, (e.target.textContent || '').trim().split(/\s+/)[0], e.clientY); } },
      { label: 'کپی متن بلوک', act: function(){
        var text = (block.textContent || '').trim();
        copyToClipboard('متن', text).then(function(ok){ toast(ok ? 'متن بلوک کپی شد' : 'کپی نشد', ok ? 'copy' : 'x'); });
      } }
    ];
    if (heading){
      var h = (block.textContent || '').trim();
      items.push({ label: 'کپی پیوند این سرتیتر', act: function(){ nbCopyLink(t.nb, h); } });
    }
    items.push(null, { label: 'باز کردن در تب تازه', act: function(){ nbOpenInNewTab(t.nb); } }, { label: 'تاریخچهٔ این یادداشت', act: function(){ nbShowHistory(t.nb); } });
    nbMenu(e.clientX, e.clientY, items);
    return true;
  }
  /** Editing in place with a selection: link it, make a note of it, make it a task. */
  function nbEditorCtx(e){
    var t = currentTab();
    if (!t || !t.nb) return false;
    var sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (!sel.trim()) return false;                            // nothing selected: the browser menu is fine
    e.preventDefault();
    nbMenu(e.clientX, e.clientY, [
      { label: 'پیوند به یادداشت…', act: function(){ nbWrapSelection(t, sel); } },
      { label: 'یادداشت تازه از انتخاب', act: function(){ nbNoteFromSelection(t, sel); } },
      { label: 'کار کن', act: function(){ nbMakeTasks(t, sel); } },
      null,
      { label: 'کپی', act: function(){ copyToClipboard('متن', sel).then(function(ok){ toast(ok ? 'کپی شد' : 'کپی نشد', 'copy'); }); } }
    ]);
    return true;
  }
  /** Writes the editor and lets the app sync the tab, the working copy and the preview. */
  function nbEditApply(text, from, to){
    ta.value = text;
    var a = from == null ? text.length : from, b = to == null ? a : to;
    ta.focus();
    ta.setSelectionRange(a, b);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function nbWrapSelection(t, sel){
    var from = ta.selectionStart, to = ta.selectionEnd, inner = sel.trim();
    var text = ta.value.slice(0, from) + '[[' + inner + ']]' + ta.value.slice(to);
    var at = from + 2 + inner.length;
    nbEditApply(text, at, at);
    nbMaybeSuggest();                                              // the same list that shows while typing
  }
  function nbNoteFromSelection(t, sel){
    var text = sel.trim();
    var title = text.split('\n')[0].replace(/^#+\s*/, '').replace(/\[\[|\]\]/g, '').trim().slice(0, 60) || 'یادداشت تازه';
    var safe = title.replace(/[\\/:*?"<>|]/g, '');
    var dir = nbFolder(t.nb);
    var path = (dir ? dir + '/' : '') + safe + '.md';
    if (NB.files[path] && !NB.files[path].deleted){ toast('یادداشتی با همین نام هست', 'x'); return; }
    var from = ta.selectionStart, to = ta.selectionEnd;
    var fm = nbCtx(new Date(), '', C.weekStart);
    var body = text.split('\n').slice(1).join('\n');
    nbWrite(path, '---\ndate: ' + fm.jdateDash + '\ncreated: ' + fm.gdate + '\n---\n# ' + title + '\n\n' + body + '\n');
    var text2 = ta.value.slice(0, from) + '[[' + title + ']]' + ta.value.slice(to);
    nbEditApply(text2, from + 2 + title.length);
    toast('یادداشت تازه: ' + title, 'plus');
  }
  function nbMakeTasks(t, sel){
    var from = ta.selectionStart, to = ta.selectionEnd;
    var lines = sel.split('\n').map(function(l){
      if (HOME_TASK_RE.test(l)) return l;
      return '- [ ] ' + l.replace(/^\s*[-*+]\s+/, '');
    }).join('\n');
    var text = ta.value.slice(0, from) + lines + ta.value.slice(to);
    nbEditApply(text, from, from + lines.length);
    toast('کار شد — در «کارها» دیده می شود', 'check');
  }
  /** A long press (≈450ms, finger still) opens the same menus the right-click opens. */
  var nbLongPressAt = function(x, y, target){
    var el = target || (document.elementFromPoint ? document.elementFromPoint(x, y) : null);
    if (!el) return false;
    try { if (navigator.vibrate) navigator.vibrate(10); } catch(e){}
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
    return $('nbMenu').hidden === false;
  };
  (function(){
    var timer = 0, x0 = 0, y0 = 0;
    function stop(){ if (timer){ clearTimeout(timer); timer = 0; } }
    document.addEventListener('touchstart', function(e){
      stop();
      if (e.touches.length !== 1) return;
      var target = e.target;
      var inField = target.closest('textarea, input, [contenteditable]');
      var hasSel = !!(window.getSelection && String(window.getSelection()).trim());
      if (inField && !hasSel) return;                    // the phone's own selection UI belongs there
      if (target.closest('#tabs, .mdbar, .status, #nbMenu')) return;   // those have their own long press
      var t0 = e.touches[0];
      x0 = t0.clientX; y0 = t0.clientY;
      timer = setTimeout(function(){ timer = 0; if (typeof NBD === 'object' && NBD && NBD.on) return; nbLongPressAt(x0, y0); }, 450);
    }, { passive: true });
    document.addEventListener('touchmove', function(e){
      if (!timer) return;
      var t1 = e.touches[0];
      if (Math.abs(t1.clientX - x0) > 10 || Math.abs(t1.clientY - y0) > 10) stop();
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function(k){ document.addEventListener(k, stop, { passive: true }); });
  })();
  /** The notebook's own entries for the app's tab menu (same shape: icon, label, kbd, run, disabled). */
  function nbTabMenuItems(t){
    if (!t) return [];
    if (t.nb) return [null, ['tree', 'نمایش در درخت', '', function(){ nbShowInTree(t.nb); }],
      ['cloud', 'تاریخچهٔ این یادداشت', '', function(){ nbShowHistory(t.nb); }]];
    if (String(t.text || '').trim()) return [null, ['cloud', 'ذخیره در دفترچه…', '', function(){ nbSaveTabDialog(t.id); }]];
    return [];
  }
  window.nbTabMenuItems = nbTabMenuItems;
  /* the whole map, in one place */
  $('nbBody').addEventListener('contextmenu', function(e){
    if (nbSearchCtx(e)) return;
    if (nbCalCtx(e)) return;
    if (nbTaskCtx(e)) return;
  });
  zoomWrap.addEventListener('contextmenu', function(e){
    if (nbTaskCtx(e)) return;
    nbPreviewCtx(e);
  });
  ta.addEventListener('contextmenu', function(e){ nbEditorCtx(e); });
  /* «باز کردن در تب تازه» lands back here with ?note=… */
  (function(){
    var m = /[?&]note=([^&]+)/.exec(location.search);
    if (m) NB.openOnLoad = decodeURIComponent(m[1].replace(/\+/g, ' '));
  })();
  /* ================= چه چیزی منتظر ارسال است ================= */
  /** Every pending change, one row each: a moved note is one row, not a delete plus a new file. */
  function nbPendingRows(){
    var files = NB.paths.map(function(p){ return NB.files[p]; }).filter(function(x){ return x && (x.dirty || x.deleted); });
    var deleted = {}, moved = {};
    files.filter(function(x){ return x.deleted; }).forEach(function(x){ deleted[x.path] = x; });
    var out = [];
    files.filter(function(x){ return !x.deleted; }).forEach(function(x){
      var from = x.movedFrom && deleted[x.movedFrom] ? x.movedFrom : Object.keys(deleted).filter(function(p){ return deleted[p].sha && deleted[p].sha === x.sha; })[0];
      if (from){
        delete deleted[from];
        out.push({ kind: 'move', path: x.path, from: from, label: nbTitle(x.path), folder: nbFolder(x.path) });
      } else {
        out.push({ kind: (x.isNew || !x.remote) ? 'new' : 'edit', path: x.path, label: nbTitle(x.path), folder: nbFolder(x.path) });
      }
    });
    Object.keys(deleted).forEach(function(p){
      out.push({ kind: 'del', path: p, label: nbTitle(p), folder: nbFolder(p), gone: true });
    });
    Object.keys(NB.attach || {}).filter(function(k){ return NB.attach[k].dirty; }).forEach(function(k){
      var a = NB.attach[k];
      out.push({ kind: a.deleted ? 'del' : 'attach', path: k, label: a.path.split('/').pop(), folder: a.path.split('/').slice(0, -1).join('/'), att: true });
    });
    return out;
  }
  /** The rows that are not notes read as what they are. */
  function nbPendLabel(row){
    var p = row.path;
    if (p === '.mizkar/config.json') return { label: 'تنظیمات مجموعه ها', folder: 'دفترچه' };
    if (p.indexOf('templates/') === 0) return { label: 'قالب: ' + row.label, folder: 'templates' };
    if (row.att || nbIsAttachment(p)) return { label: row.label, folder: row.folder || C.attachments || 'attachments', att: true };
    return { label: row.label, folder: row.folder };
  }
  var NB_KIND = { new: 'تازه', edit: 'ویرایش', del: 'حذف', move: 'جابه جا', attach: 'پیوست تازه' };
  function nbPendHtml(){
    var rows = nbPendingRows();
    if (!rows.length) return '<div class="nb-empty">چیزی منتظر ارسال نیست.</div>';
    return '<div class="nb-pend">' + rows.map(function(r, i){
      var info = nbPendLabel(r);
      return '<div class="nb-pend-row" data-nb-pend="' + i + '">'
        + '<button type="button" class="nb-pend-open" data-nb-pend-open="' + i + '">'
        + '<b dir="auto">' + escapeHtml(info.label) + '</b>'
        + '<small dir="auto">' + escapeHtml(info.folder || '—')
        + (r.kind === 'move' ? ' · از ' + escapeHtml(nbFolder(r.from) || 'ریشه') : '')
        + ' · ' + NB_KIND[r.kind] + '</small></button>'
        + '<span class="nb-pend-btns">'
        + (info.att ? '' : '<button type="button" class="elbtn xs" data-nb-pend-diff="' + i + '" title="چه چیزی عوض شده">تفاوت</button>')
        + '<button type="button" class="elbtn xs" data-nb-pend-drop="' + i + '" title="برگرداندن به نسخهٔ مخزن">دور انداختن</button>'
        + '</span></div>';
    }).join('') + '</div>';
  }
  /** Why sending cannot start right now, in one line, with the button that fixes it. */
  function nbPushBlocked(){
    if (!navigator.onLine) return { text: 'اینترنت نیست', btn: 'تلاش دوباره', act: function(){ nbPush({ loud: true }); } };
    if (NB.locked) return { text: 'قفل توکن بسته است', btn: 'باز کردن قفل', act: function(){ nbUnlock(); } };
    if (!C || !C.repo || !C.token) return { text: 'مخزن یا توکن ندارد', btn: 'تنظیمات دفترچه', act: function(){ nbOpenSettings(); } };
    if (NB.conflicts.length) return { text: faNum(NB.conflicts.length) + ' تعارض حل نشده', btn: 'حل تعارض', act: function(){ NB.section = 'conflicts'; nbSidebar(true); nbRender(); } };
    return null;
  }
  function nbPendRefresh(){
    var pop = $('nbSyncPop');
    if (pop && !pop.hidden){ pop.innerHTML = nbSyncPopHtml(); nbSyncPopWire(); }
    if (NB.open) nbRender();
  }
  function nbPendDiff(i){
    var row = nbPendingRows()[i];
    if (!row) return;
    var f = NB.files[row.path];
    var base = (row.from && NB.files[row.from] ? nbTextOf(NB.files[row.from]) : '') || (f && f.base) || '';
    var now = f ? (f.deleted ? '' : nbTextOf(f)) : '';
    var label = nbPendLabel(row).label;
    if (!base && row.kind === 'new'){ base = ''; }
    var diffs = nbDiffLines(base, now);
    var html = diffs.map(function(d){
      var sign = d.op === 'add' ? '+' : d.op === 'del' ? '−' : ' ';
      return '<div class="nb-diff-line nb-diff-' + d.op + '"><span>' + sign + '</span><code dir="auto">' + escapeHtml(d.text || ' ') + '</code></div>';
    }).join('') || '<p class="nb-mini-text">تفاوتی نیست.</p>';
    nbModalBox('چه چیزی عوض شده: ' + label,
      '<div class="nb-diff">' + html + '</div>'
      + (row.kind !== 'new' && base ? '' : '<p class="nb-mini-text">نسخهٔ مخزن برای مقایسه نبود؛ همهٔ متن «تازه» شمرده می شود.</p>'),
      '<button class="btn-soft" type="button" data-nb-mini-close>بستن</button>', 'compare');
  }
  /** Throw a change away: the pulled version comes back, a new note goes, a deleted one returns. */
  function nbPendDrop(i){
    var row = nbPendingRows()[i];
    if (!row) return;
    var info = nbPendLabel(row);
    var what = row.kind === 'new' ? 'این یادداشت تازه برداشته شود؟ (به مخزن نرفته)' : row.kind === 'del' ? 'این یادداشت برگردد؟' : 'تغییرها به نسخهٔ مخزن برگردند؟';
    nbConfirm('دور انداختن: ' + info.label, what, function(){
      var f = NB.files[row.path];
      if (row.att){
        var a = NB.attach[row.path];
        if (a){ a.dirty = false; a.deleted = false; }
        nbSaveFiles(); nbPendRefresh(); toast('پیوست دور انداخته شد', 'undo');
        return;
      }
      if (row.kind === 'new'){
        var keep = f ? Object.assign({}, f) : null;
        delete NB.files[row.path];
        NB.paths = NB.paths.filter(function(p){ return p !== row.path; });
        nbMoveTabOutOf(row.path);
        nbSaveFiles(); nbPendRefresh();
        toast('یادداشت تازه برداشته شد', 'undo', { label: 'بازگشت', icon: 'undo', run: function(){
          if (!keep) return;
          NB.files[keep.path] = Object.assign({}, keep, { dirty: true, isNew: true, deleted: false });
          if (NB.paths.indexOf(keep.path) === -1) NB.paths.push(keep.path);
          nbSaveFiles(); nbPendRefresh();
        } });
        return;
      }
      if (row.kind === 'del'){
        if (f){ f.deleted = false; f.dirty = false; }
        nbCountDirty(); nbSaveFiles(); nbPendRefresh();
        toast('یادداشت برگشت', 'undo');
        return;
      }
      if (row.kind === 'move'){
        var back = row.from;
        nbMoveNote(row.path, back);
        nbPendRefresh();
        toast('جابه جایی برگشت', 'undo');
        return;
      }
      var restore = function(){
        if (f && f.base){ nbStoreText(f, f.base); f.dirty = false; f.enc = false; f.plain = null; }
        if (f && nbIsEncrypted && nbIsEncrypted(f.base)) f.enc = true;
        nbRetargetText(row.path);
        nbCountDirty(); nbSaveFiles(); nbPendRefresh();
        toast('به نسخهٔ مخزن برگشت', 'undo');
      };
      if (f && f.base) restore();
      else {
        nbFileText(row.path).then(function(old){
          if (f){ nbStoreText(f, old); f.dirty = false; }
          nbRetargetText(row.path);
          nbCountDirty(); nbSaveFiles(); nbPendRefresh();
          toast('به نسخهٔ مخزن برگشت', 'undo');
        }, function(){ toast('نسخهٔ مخزن خوانده نشد', 'x'); });
      }
    });
  }
  /** The editor shows the file, so it has to follow what just happened to it. */
  function nbRetargetText(path){
    var t = nbTabFor(path), f = NB.files[path];
    if (!t || !f) return;
    t.text = f.deleted ? '' : nbTextOf(f);
    if (t.id === activeTab){ ta.value = t.text; render(); }
    else drawTabs();
  }
  function nbMoveTabOutOf(path){
    var t = nbTabFor(path);
    if (!t) return;
    delete t.nb;
    t.name = nbTitle(path) + ' (بسته شد)';
    drawTabs();
  }
  function nbSyncPopHtml(){
    var rows = nbPendingRows();
    var n = nbCountDirty();
    var blocked = nbPushBlocked();
    var head = '<div class="pop-title">دفترچه</div>'
      + '<div class="nb-sync-info">' + (NB_STATES[NB.state] || NB_STATES.off).t
      + (NB.error ? '<br><span class="nb-warn">' + escapeHtml(NB.error) + '</span>' : '')
      + '<br><small dir="ltr">' + (C && C.repo ? escapeHtml(C.repo) + ' · ' + escapeHtml(C.branch) : 'no repository') + '</small></div>';
    var why = blocked ? '<div class="nb-pend-why">' + escapeHtml(blocked.text)
      + ' <button type="button" class="elbtn xs" data-nb-pop="fix">' + escapeHtml(blocked.btn) + '</button></div>' : '';
    var body = '<div class="nb-pend-head">' + (n ? faNum(n) + ' تغییر منتظر ارسال' : 'همه چیز فرستاده شده') + '</div>' + nbPendHtml();
    return head + why + body
      + '<div class="nb-actions"><button class="btn-soft sm" type="button" data-nb-pop="pull">گرفتن</button>'
      + '<button class="btn-primary sm" type="button" data-nb-pop="push">ارسال همه</button>'
      + '<button class="btn-soft sm" type="button" data-nb-pop="settings">تنظیمات</button>'
      + '<button class="btn-soft sm" type="button" data-nb-pop="open">نوار کناری</button></div>';
  }
  function nbSyncPopWire(){
    var m = $('nbSyncPop');
    if (!m) return;
    m.onclick = function(ev){
      var diff = ev.target.closest('[data-nb-pend-diff]');
      if (diff){ nbPendDiff(+diff.dataset.nbPendDiff); return; }
      var drop = ev.target.closest('[data-nb-pend-drop]');
      if (drop){ nbPendDrop(+drop.dataset.nbPendDrop); return; }
      var open = ev.target.closest('[data-nb-pend-open]');
      if (open){
        var row = nbPendingRows()[+open.dataset.nbPendOpen];
        if (!row) return;
        m.hidden = true;
        if (row.att) nbDownloadAttachment(row.path);
        else if (NB.files[row.path]) nbOpen(row.path);
        else toast('این یادداشت حذف شده — با «دور انداختن» برمی گردد', 'x');
        return;
      }
      var b = ev.target.closest('[data-nb-pop]');
      if (!b) return;
      var w = b.dataset.nbPop;
      if (w === 'fix'){ var bl = nbPushBlocked(); m.hidden = true; if (bl) bl.act(); return; }
      m.hidden = true;
      if (w === 'settings') nbOpenSettings();
      else if (w === 'pull') nbPull({ loud: true });
      else if (w === 'push') nbPush({ loud: true });
      else if (w === 'open') nbSidebar(true);
    };
  }
  /** The sidebar footer opens the very same list. */
  document.addEventListener('click', function(e){
    var foot = e.target.closest('#nbFoot');
    if (!foot) return;
    var chip = $('nbSync');
    if (chip) chip.click();
  });

  /* ================= «موقت»: تب های باز و متن های اخیر، یک جا ================= */
  function nbByteSize(n){
    n = +n || 0;
    if (n < 1024) return faNum(n) + ' بایت';
    if (n < 1024 * 1024) return faNum(Math.round(n / 1024)) + ' کیلوبایت';
    return faNum(Math.round(n / 1048576 * 10) / 10) + ' مگابایت';
  }
  function nbKindLabel(item){
    if (item.closed) return 'تب بسته شده';
    var k = item.kind || item.fmt || 'text';
    return (typeof FMT_LABELS === 'object' && FMT_LABELS[k]) || k;
  }
  function nbHistFirstLines(item){
    return String(item.t || '').split('\n').slice(0, 3).join('\n').slice(0, 200);
  }
  /** «امروز» / «دیروز» / «این هفته» / «قدیمی تر» */
  function nbHistGroup(at){
    var d = new Date(at || 0), now = new Date();
    var day = function(x){ return x.getFullYear() + '-' + nbPad2(x.getMonth() + 1) + '-' + nbPad2(x.getDate()); };
    if (day(d) === day(now)) return 0;
    var y = new Date(now.getTime() - 864e5);
    if (day(d) === day(y)) return 1;
    if (now.getTime() - d.getTime() < 7 * 864e5) return 2;
    return 3;
  }
  var NB_HIST_GROUPS = ['امروز', 'دیروز', 'این هفته', 'قدیمی تر'];
  function nbTempsHtml(){
    var q = nbNorm(NB.tempQuery || '');
    var openTabs = tabs.filter(function(x){ return !x.nb; });
    var hist = (typeof historyLoad === 'function' ? historyLoad() : []);
    var match = function(text, title){ return !q || nbNorm(String(title || '') + ' ' + String(text || '')).indexOf(q) !== -1; };
    var openRows = openTabs.filter(function(x){ return match(x.text, tabLabel(x)); });
    var histRows = hist.filter(function(h){ return match(h.t, h.title); });
    var html = '<div class="nb-search"><input class="nb-input" id="nbTempQ" type="search" dir="auto" placeholder="جستجو در تب ها و متن های اخیر…" value="' + escapeHtml(NB.tempQuery || '') + '"></div>';
    html += '<div class="nb-temp-part"><h5>باز <b>' + faNum(openRows.length) + '</b></h5>';
    html += openRows.length ? openRows.map(function(x){
      return '<div class="nb-row nb-temp-row' + (x.id === activeTab ? ' active' : '') + '" data-nb-temp="' + x.id + '" tabindex="0">'
        + icon(x.nb ? 'file' : 'text') + '<span class="nb-name" dir="auto">' + escapeHtml(tabLabel(x)) + '</span>'
        + (x.nb ? '<span class="nb-saved">دفترچه</span>' : '<button type="button" class="elbtn xs" data-nb-save="' + x.id + '">ذخیره در دفترچه</button>')
        + '</div>';
    }).join('') : '<div class="nb-empty">تب موقتی باز نیست.</div>';
    html += '</div>';
    html += '<div class="nb-temp-part"><h5>اخیر <b>' + faNum(histRows.length) + '</b></h5>';
    if (!histRows.length) html += '<div class="nb-empty">' + (q ? 'چیزی پیدا نشد.' : 'متن اخیری نیست.') + '</div>';
    else {
      for (var g = 0; g < 4; g++){
        var inGroup = histRows.filter(function(h){ return nbHistGroup(h.at) === g; });
        if (!inGroup.length) continue;
        html += '<h6 class="nb-temp-g">' + NB_HIST_GROUPS[g] + '</h6>';
        html += inGroup.slice(0, 40).map(function(h){
          var idx = hist.indexOf(h);
          return '<div class="nb-row nb-hist-row" data-nb-hist-item="' + idx + '" tabindex="0" title="' + escapeHtml(nbHistFirstLines(h)) + '">'
            + icon(h.closed ? 'x' : 'clock')
            + '<span class="nb-name" dir="auto">' + escapeHtml(h.title || 'بدون عنوان') + '</span>'
            + '<span class="nb-hist-meta">' + escapeHtml(nbKindLabel(h)) + ' · ' + nbByteSize((h.t || '').length) + ' · ' + escapeHtml(relTime((h.at - Date.now()) / 1000)) + '</span>'
            + '<span class="nb-hist-btns">'
            + '<button type="button" class="elbtn xs" data-nb-hist-open="' + idx + '">باز کردن</button>'
            + '<button type="button" class="elbtn xs" data-nb-hist-save="' + idx + '">ذخیره در دفترچه…</button>'
            + '<button type="button" class="elbtn xs" data-nb-hist-del="' + idx + '" title="حذف">حذف</button>'
            + '</span></div>';
        }).join('');
      }
      html += '<div class="nb-actions"><button type="button" class="btn-soft sm" data-nb-hist-clear="1">پاک کردن همه</button></div>';
    }
    html += '</div>';
    return html;
  }
  function nbHistOpen(idx){
    var h = historyLoad()[idx];
    if (!h) return;
    if (tabs.some(function(x){ return x.text === h.t; })){ 
      var same = tabs.filter(function(x){ return x.text === h.t; })[0];
      switchTab(same.id);
      return;
    }
    openTab(h.t, h.fmt, 'متن اخیر باز شد — تا «ذخیره در دفترچه» به مخزن نمی رود');
    if (h.name){ var t = currentTab(); t.name = h.name; drawTabs(); saveState(); }
  }
  function nbHistSaveToNotebook(idx){
    var h = historyLoad()[idx];
    if (!h) return;
    nbSaveTextDialog(h.t, h.name || h.title || '');
  }
  function nbHistDelete(idx){
    var h = historyLoad()[idx];
    if (!h) return;
    var list = historyLoad().slice();
    list.splice(idx, 1);
    historySave(list);
    nbRender();
    toast('از متن های اخیر برداشته شد', 'undo', { label: 'بازگشت', icon: 'undo', run: function(){ var back = historyLoad().slice(); back.splice(idx, 0, h); historySave(back); nbRender(); } });
  }
  function nbHistMenu(idx, x, y){
    var h = historyLoad()[idx];
    if (!h) return;
    nbMenu(x, y, [
      { label: 'باز کردن', act: function(){ nbHistOpen(idx); } },
      { label: 'ذخیره در دفترچه…', act: function(){ nbHistSaveToNotebook(idx); } },
      { label: 'کپی متن', act: function(){ copyToClipboard('متن', h.t).then(function(ok){ toast(ok ? 'کپی شد' : 'کپی نشد', 'copy'); }); } },
      { label: 'نخستین خط ها', act: function(){ nbHistPreview(idx); } },
      null,
      { label: 'حذف', danger: true, act: function(){ nbHistDelete(idx); } }
    ]);
  }
  /** Saving a text into the notebook from the sidebar: pick the folder, then the name. */
  function nbSaveTextDialog(text, name){
    var folders = (function(){
      var out = [''];
      NB.paths.forEach(function(p){
        if (p.slice(-1) === '/'){ if (out.indexOf(p.slice(0, -1)) === -1) out.push(p.slice(0, -1)); }
        else { var d = nbFolder(p); if (d && out.indexOf(d) === -1) out.push(d); }
      });
      return out;
    })();
    nbModalBox('ذخیره در دفترچه',
      '<div class="nb-field"><label>پوشه</label><select id="nbSvFolder">'
      + folders.map(function(f){ return '<option value="' + escapeHtml(f) + '">' + escapeHtml(f || 'ریشهٔ دفترچه') + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="nb-field"><label>نام یادداشت</label><input class="nb-input" id="nbSvName" dir="auto" value="' + escapeHtml(String(name || '').slice(0, 60)) + '"></div>',
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button>'
      + '<button class="btn-primary" type="button" id="nbMiniOk">ذخیره</button>', 'cloud');
    $('nbMiniOk').onclick = function(){
      var folder = $('nbSvFolder').value, nm = $('nbSvName').value.trim() || textTitle(text) || 'یادداشت';
      var path = (folder ? folder + '/' : '') + nbSlug(nm) + '.md';
      if (NB.files[path] && !NB.files[path].deleted){ toast('یادداشتی با همین نام هست', 'x'); return; }
      nbWrite(path, text);
      nbCloseMini();
      nbOpen(path);
      toast('در دفترچه ذخیره شد: ' + nbTitle(path), 'cloud');
    };
  }
  /** A preview of the first lines. */
  function nbHistPreview(idx){
    var h = historyLoad()[idx];
    if (!h) return;
    nbModalBox(h.title || 'متن اخیر',
      '<pre class="nb-preview" dir="auto">' + escapeHtml(String(h.t || '').slice(0, 1200)) + '</pre>',
      '<button class="btn-soft" type="button" data-nb-mini-close>بستن</button>'
      + '<button class="btn-primary" type="button" id="nbMiniOk">باز کردن</button>', 'text');
    $('nbMiniOk').onclick = function(){ nbCloseMini(); nbHistOpen(idx); };
  }

  /* ================= لمس: کشیدن شیت به پایین، دکمهٔ بازگشت، کشیدن برای گرفتن تازه ================= */
  var nbHistoryDepth = 0;
  function nbLayerPushed(){ try { history.pushState({ nbLayer: ++nbHistoryDepth }, ''); } catch(e){} }
  function nbLayerPopped(){ if (nbHistoryDepth > 0) nbHistoryDepth--; }
  // the top layer closes with the phone's back button instead of leaving the page
  function nbCloseTopLayer(){
    var mini = $('nbMini'), mini2 = $('nbMini2'), modal = $('nbModal'), menu = $('nbMenu');
    if (mini2 && !mini2.hidden){ nbCloseMini('nbMini2'); return true; }
    if (mini && !mini.hidden){ nbCloseMini(); return true; }
    if (modal && !modal.hidden){ nbCloseSettings(); return true; }
    if (menu && !menu.hidden){ menu.hidden = true; return true; }
    if (NB.open){ nbSidebar(false); return true; }
    return false;
  }
  addEventListener('popstate', function(){ if (nbCloseTopLayer()) nbLayerPopped(); });
  // a swipe down on the drawer closes it, like a sheet
  (function(){
    var y0 = 0, x0 = 0, on = false;
    var sheet = $('nb');
    if (!sheet) return;
    sheet.addEventListener('touchstart', function(e){
      if (innerWidth > 760 || !NB.open || e.touches.length !== 1) return;
      var box = sheet.getBoundingClientRect();
      if (e.touches[0].clientY - box.top > 96) return;      // only from the top strip of the sheet
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; on = true;
      sheet.style.transition = 'none';
    }, { passive: true });
    sheet.addEventListener('touchmove', function(e){
      if (!on) return;
      var dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
      if (dx > 40 || dy < 0){ on = false; sheet.style.transform = ''; sheet.style.transition = ''; return; }
      sheet.style.transform = 'translateY(' + Math.min(dy, 200) + 'px)';
    }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function(k){
      sheet.addEventListener(k, function(e){
        if (!on) return;
        on = false;
        var dy = ((e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : y0) - y0;
        sheet.style.transition = '';
        sheet.style.transform = '';
        if (dy > 70) nbSidebar(false);
      }, { passive: true });
    });
  })();
  // pull down on the notes list (or «امروز») to pull from the repository
  (function(){
    var y0 = 0, on = false, box = null;
    function start(e){
      if (!C || !C.repo) return;
      var list = e.target.closest('#nbList, #zoomWrap');
      if (!list || e.touches.length !== 1) return;
      var scroller = list.id === 'nbList' ? list : (list.scrollTop != null ? list : null);
      var top = list.id === 'nbList' ? list.scrollTop : (list.scrollTop || 0);
      if (top > 2) return;
      box = list; y0 = e.touches[0].clientY; on = true;
    }
    function move(e){
      if (!on) return;
      var dy = e.touches[0].clientY - y0;
      if (dy < 0){ on = false; return; }
      if (dy > 8){
        var hint = $('nbPullHint');
        if (!hint){
          hint = document.createElement('div');
          hint.id = 'nbPullHint';
          hint.className = 'nb-pull-hint';
          (box && box.id === 'nbList' ? box.parentNode : document.body).appendChild(hint);
        }
        hint.textContent = dy > 70 ? 'رها کن تا تازه شود' : 'برای تازه سازی بکش پایین';
        hint.classList.toggle('ready', dy > 70);
      }
    }
    function end(e){
      if (!on) return;
      on = false;
      var dy = ((e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : y0) - y0;
      var hint = $('nbPullHint');
      if (hint) hint.remove();
      if (dy > 70) nbPull({ loud: true });
    }
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
  })();

  /* --- init --- */
  document.getElementById('appStyle').textContent += '\n' + NB_CSS;
  nbSlot();
  if (typeof nbShellSync === 'function') nbShellSync();
  nbLoad().then(function(){
    nbStatus(); nbAfterSwitch(); ipSync(); if (!ta.value.trim()) render();
    if (storeGet('fs2-nbopen') === '1') nbSidebar(true, false);   // the drawer stays where it was left
    if (NB.openOnLoad){ var on = NB.openOnLoad; NB.openOnLoad = ''; if (NB.files[on]) nbOpen(on); }
    if (typeof nbShellSync === 'function') nbShellSync();
  });
  NB.pure = { nbCtx: nbCtx, nbFillPath: nbFillPath, nbFillTemplate: nbFillTemplate, nbZip: nbZip, nbUnzip: nbUnzip, nbMerge3: nbMerge3, nbDiffLines: nbDiffLines, nbParseFm: nbParseFm, nbTags: nbTags, nbGToJ: nbGToJ, nbJToG: nbJToG, nbNorm: nbNorm, nbSlug: nbSlug, nbTemplates: NB_TEMPLATES, nbDefaults: NB_DEFAULTS, nbCommitMessage: nbCommitMessage };
  NB.ui = {
    open: nbOpen, newNote: nbNewNote, settings: nbOpenSettings, sidebar: nbSidebar, render: nbRender,
    dirty: nbDirtyList, resolve: nbResolve, write: nbWrite, push: nbPush, pull: nbPull, del: nbDeletePath,
    afterSwitch: nbAfterSwitch, section: function(s){ NB.section = s || NB.section; nbRender(); return NB.section; },
    search: function(q, col, tag){
      NB.query = q || ''; NB.colFilter = col || ''; NB.tagFilter = tag || '';
      var out = nbSearchResults().map(function(n){ return n.path; });
      if (NB.open && NB.section === 'search') nbRender();
      return out;
    },
    backlinks: nbBacklinks, tags: nbTagCounts, index: nbIndex, wikiOpen: nbWikiOpen, fixLinks: nbFixLinks,
    calendar: function(){ return { cells: (NB.calMonth = NB.calMonth || (function(){ var t = nbCtx(new Date(), '', C.weekStart); return { jy: +t.jy, jm: +t.jm }; })()), day: function(stamp){ return nbDayNotes({ gy: +stamp.split('-')[0], gm: +stamp.split('-')[1], gd: +stamp.split('-')[2] }).map(function(n){ return n.path; }); } }; },
    dayNotes: nbDayNotes, calShift: nbCalShift, makeOnDate: nbMakeOnDate,
    newDialog: nbNewDialog, dateDialog: nbDateDialog, shamsi: nbShamsiLabel, stampToDate: nbStampToDate,
    longPressAt: function(x, y, el){ return nbLongPressAt(x, y, el); }, tabMenuItems: nbTabMenuItems,
    moveToCollection: nbMoveNoteToCollection, showCollection: nbShowCollection, openAllIn: nbOpenAllIn,
    pending: nbPendingRows, syncPop: function(){ return $('nbSyncPop'); },
    closeTopLayer: nbCloseTopLayer, layers: function(){ return nbHistoryDepth; },
    tempsHtml: nbTempsHtml, histOpen: nbHistOpen, histDelete: nbHistDelete, histMenu: nbHistMenu,
    histSave: nbHistSaveToNotebook, saveText: nbSaveTextDialog,
    quick: nbQuickInbox, encrypt: nbToggleEncrypt, isEncrypted: nbIsEncrypted, encryptText: nbEncrypt, decryptText: nbDecrypt,
    attach: nbAddAttachment, attachments: function(){ return NB.attach; }, downloadAttachment: nbDownloadAttachment,
    profiles: nbProfiles, useProfile: nbUseProfile, saveProfile: nbSaveProfile, reload: nbReloadFiles,
    provider: function(p){ if (p) C.provider = p; return C.provider; }, ref: nbRef, tree: nbRemoteTree, fileText: nbFileText, history: nbHistoryList,
    state: function(){ return NB; },
    files: function(){ return NB.files; },
    cfg: function(o){ if (o){ Object.assign(C, o); nbSaveCfg(); nbSay(); } return C; },
    unlock: nbUnlock, load: nbLoad
  };
  window.mizkarNotebook = NB;
  // the app calls these by name (switchTab, render, the palette); this module is a closure, so they are published
  window.nbAfterSwitch = function(){ nbAfterSwitch(); ipSync(); };
  window.nbHomeHtml = nbHomeHtml;
  window.nbPaletteItems = nbPaletteItems;
})();
