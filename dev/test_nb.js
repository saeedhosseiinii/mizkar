/* Node tests for the notebook engine: the pure half is pulled straight out of the built
   index.html and exercised on its own (Jalali dates, path patterns, templates, front matter,
   zip, diff, three-way merge). Run: node test_nb.js */
const fs = require('fs');
const vm = require('vm');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HTML = process.env.MIZKAR_HTML || '/root/workspace/mizkar/index.html';
const html = fs.readFileSync(HTML, 'utf8');
const m = html.match(/\/\* NB:PURE:START \*\/([\s\S]*)\/\* NB:PURE:END \*\//);
if (!m) { console.error('FAIL: NB:PURE markers not found'); process.exit(1); }
// the app's own pure half (styles, helpers, the Markdown renderer) — the font blobs are dropped
const appPure = html.match(/\/\/ === PURE ===([\s\S]*?)\/\/ === PURE END ===/);
const ctx = { console, TextEncoder, TextDecoder, Blob, Response, DecompressionStream, Object, Math, Date, String, Number, Array, Promise, Uint8Array, DataView, btoa, atob, unescape, escape };
vm.createContext(ctx);
if (appPure) {
  const slim = appPure[1].split('\n').filter((l) => !l.includes('base64')).join('\n');
  vm.runInContext(slim, ctx);
}
vm.runInContext(m[1], ctx);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); }

console.log('\n— Jalali dates —');
eq('2026-10-23 → 1405/08/01', ctx.nbGToJ(2026, 10, 23), { jy: 1405, jm: 8, jd: 1 });
eq('1405/08/01 → 2026-10-23', ctx.nbJToG(1405, 8, 1), { gy: 2026, gm: 10, gd: 23 });
eq('2024-03-20 → 1403/01/01 (نوروز)', ctx.nbGToJ(2024, 3, 20), { jy: 1403, jm: 1, jd: 1 });
eq('1979-02-11 → 1357/11/22', ctx.nbGToJ(1979, 2, 11), { jy: 1357, jm: 11, jd: 22 });
eq('1400/12/29 → 2022-03-20', ctx.nbJToG(1400, 12, 29), { gy: 2022, gm: 3, gd: 20 });
roundtrip();
function roundtrip() {
  let bad = null;
  for (let t = Date.UTC(1990, 0, 1); t < Date.UTC(2060, 0, 1); t += 86400000) {
    const d = new Date(t), j = ctx.nbGToJ(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const g = ctx.nbJToG(j.jy, j.jm, j.jd);
    if (g.gy !== d.getUTCFullYear() || g.gm !== d.getUTCMonth() + 1 || g.gd !== d.getUTCDate()) { bad = { d: d.toISOString(), j, g }; break; }
  }
  ok('round trip, 70 years day by day', bad === null, bad);
}

console.log('\n— path patterns and templates —');
const D = new Date(2026, 9, 23, 15, 30);           // 1405/08/01, a Friday
const c = ctx.nbCtx(D, '', 'saturday');
eq('ctx shamsi', { jy: c.jy, jm: c.jm, jd: c.jd }, { jy: '1405', jm: '08', jd: '01' });
eq('ctx miladi', { gy: c.gy, gm: c.gm, gd: c.gd }, { gy: '2026', gm: '10', gd: '23' });
eq('weekday', c.weekday, 'جمعه');
const cols = [
  { path: 'روزانه/{jy}/{jm}/{jy}-{jm}-{jd}.md' },
  { path: 'جلسه ها/{jy}/{jm}/{jy}-{jm}-{jd} {title}.md' },
  { path: 'هفتگی/{jy}-W{jw}.md' },
  { path: 'ایده ها/{title}.md' }
];
eq('daily path', ctx.nbFillPath(cols[0].path, ctx.nbCtx(D, '', 'saturday')), 'روزانه/1405/08/1405-08-01.md');
eq('weekly path', ctx.nbFillPath(cols[2].path, ctx.nbCtx(D, '', 'saturday')), 'هفتگی/1405-W' + c.jw + '.md');
eq('idea path', ctx.nbFillPath(cols[3].path, ctx.nbCtx(D, ctx.nbSlug('دفترچه با Git'), 'saturday')), 'ایده ها/دفترچه با Git.md');
ok('weekly number is a number 1..53', +c.jw >= 1 && +c.jw <= 53, c.jw);
ok('the same week for two days of the same week', ctx.nbCtx(new Date(2026, 9, 23), '', 'saturday').jw === ctx.nbCtx(new Date(2026, 9, 22), '', 'saturday').jw);
ok('a new week starts on Saturday', +ctx.nbCtx(new Date(2026, 9, 24), '', 'saturday').jw === +ctx.nbCtx(new Date(2026, 9, 23), '', 'saturday').jw + 1);

const tpl = '---\ntype: meeting\ndate: {{gdate}}\n---\n# {{title}} — {{jdate}}\n\n**موضوع:** {{cursor}}\n\n← [[{{prev}}]]\n';
const filled = ctx.nbFillTemplate(tpl, ctx.nbCtx(D, 'شبکه', 'saturday'), { prev: 'روزانه/1405/08/1405-08-01' });
ok('{{title}} filled', filled.text.includes('# شبکه — ۱۴۰۵/۰۸/۰۱'.replace('۱۴۰۵/۰۸/۰۱', '1405/08/01')), filled.text);
ok('{{prev}} filled', filled.text.includes('[[روزانه/1405/08/1405-08-01]]'));
ok('{{cursor}} removed', !filled.text.includes('{{cursor}}'));
ok('cursor lands at the end of «**موضوع:**»', filled.text.slice(0, filled.cursor).endsWith('**موضوع:**'), JSON.stringify(filled.text.slice(filled.cursor - 14, filled.cursor)));
ok('no line keeps trailing whitespace', !/[ \t]+\n/.test(filled.text), JSON.stringify(filled.text));
const empty = ctx.nbFillTemplate('متن\n\n← [[{{prev}}]] · [[{{next}}]]\n', ctx.nbCtx(D, '', 'saturday'));
eq('a link line disappears when both neighbours are empty', empty.text, 'متن\n');
const half = ctx.nbFillTemplate('← [[{{prev}}]] · [[{{next}}]]\n', ctx.nbCtx(D, '', 'saturday'), { prev: 'روز قبل' });
eq('a half-filled link line keeps its one link', half.text, '← [[روز قبل]]\n');
eq('{{date}} is the Gregorian date', ctx.nbFillTemplate('{{date}}', ctx.nbCtx(D, '', 'saturday')).text, '2026-10-23');

console.log('\n— front matter, tags, slugs, normalisation —');
const fm = ctx.nbParseFm('---\ntype: meeting\ndate: 2026-10-23\ntags: [جلسه, شبکه]\n---\n# عنوان\nمتن #برچسب و #شبکه\n');
eq('front matter keys', Object.keys(fm.data).sort(), ['date', 'tags', 'type']);
eq('front matter tags', fm.data.tags, ['جلسه', 'شبکه']);
ok('body starts after front matter', fm.body.startsWith('# عنوان'));
eq('inline tags merge with front matter', ctx.nbTags(fm.body + ''), ['برچسب', 'شبکه'].filter((x, i, a) => a.indexOf(x) === i));
eq('tags from both places, deduped', ctx.nbTags('---\ntags: [شبکه]\n---\nمتن #شبکه و #کار').sort(), ['شبکه', 'کار']);
eq('slug keeps Persian', ctx.nbSlug('دفترچه با Git'), 'دفترچه با Git');
eq('slug strips path characters', ctx.nbSlug('a/b:c*d?e'), 'a b c d e');
eq('empty slug', ctx.nbSlug('   '), 'بدون عنوان');
eq('normalisation ی/ک/ZWNJ/ارقام', ctx.nbNorm('كتاب يادداشت‌ها ۱۲۳'), 'کتاب یادداشتها 123');
ok('normalised text matches what is typed without ZWNJ', ctx.nbNorm('یادداشت‌ها').indexOf(ctx.nbNorm('یادداشت')) === 0);

console.log('\n— front matter in the preview —');
if (typeof ctx.renderMarkdown === 'function') {
  const note = '---\ntype: daily\ndate: 2026-10-23\ntags: [روزانه, کار]\n---\n# 1405/08/01\n\nمتن\n';
  const html2 = ctx.renderMarkdown(note, {});
  ok('the front matter becomes a properties strip', html2.includes('class=\"fmprops\"'), html2.slice(0, 160));
  ok('the strip comes before the body', html2.indexOf('fmprops') < html2.indexOf('<h1'));
  ok('keys and values are shown', html2.includes('>type<') && html2.includes('>daily<'), html2.slice(0, 260));
  ok('tags become chips', html2.includes('#روزانه') && html2.includes('#کار'), html2.slice(0, 400));
  ok('no stray rule or setext heading is left behind', !html2.includes('<hr'), html2.slice(0, 200));
  ok('the body text survives', html2.includes('متن') && html2.includes('1405/08/01'));
  const plain = ctx.renderMarkdown('# بدون فراداده\nمتن\n', {});
  ok('a document without front matter is untouched', !plain.includes('fmprops'), plain.slice(0, 80));
} else {
  ok('the app pure half was extracted', false, 'renderMarkdown missing');
}

console.log('\n— zip —');
const files = [{ path: 'a/یادداشت.md', text: '# سلام\nمتن فارسی\n' }, { path: 'b.json', text: '{"x":1}' }];
const zip = ctx.nbZip(files);
const tmp = path.join(os.tmpdir(), 'nb-test.zip');
fs.writeFileSync(tmp, Buffer.from(zip));
let unzipOut = '';
try { unzipOut = execFileSync('unzip', ['-t', tmp], { encoding: 'utf8' }); } catch (e) { unzipOut = 'ERROR ' + e.message; }
ok('system unzip accepts the archive', /No errors detected/.test(unzipOut), unzipOut.trim().split('\n').slice(-2));

console.log('\n— diff and three-way merge —');
const base = 'خط یک\nخط دو\nخط سه\nخط چهار\n';
const mine = 'خط یک\nخط دو (من)\nخط سه\nخط چهار\n';
const theirs = 'خط یک\nخط دو\nخط سه\nخط چهار (آن)\n';
const merged = ctx.nbMerge3(base, mine, theirs);
ok('changes in different places merge on their own', merged.conflicts.length === 0 && merged.text.includes('(من)') && merged.text.includes('(آن)'), merged);
const clash = ctx.nbMerge3(base, 'خط یک\nمن اینجا\nخط سه\n', 'خط یک\nآنها اینجا\nخط سه\n');
ok('overlapping changes are reported as a conflict', clash.conflicts.length === 1, clash);
ok('a conflict keeps both versions', clash.conflicts[0].mine.includes('من اینجا') && clash.conflicts[0].theirs.includes('آنها اینجا'));
eq('identical change on both sides', ctx.nbMerge3(base, 'س\n', 'س\n').text, 'س\n');
eq('one side untouched → the other wins', ctx.nbMerge3(base, base, 'تازه\n').text, 'تازه\n');
eq('insertion merges after a change', ctx.nbMerge3('a\nb\n', 'a\nB\nb\n', 'a\nb\nc\n').text, 'a\nB\nb\nc\n');
const ops = ctx.nbDiffLines('a\nb\nc\n', 'a\nx\nc\n');
ok('diff reports one del and one add', ops.filter(o => o.op === 'del').length === 1 && ops.filter(o => o.op === 'add').length === 1, ops);

console.log('\n— commit messages —');
const msg = ctx.nbCommitMessage([{ path: 'روزانه/1405/08/1405-08-01.md' }, { path: 'جلسه ها/1405/08/1405-08-01 شبکه.md', deleted: true }]);
ok('commit message names the notes', msg.includes('1405-08-01') && msg.includes('حذف'), msg);

console.log(`\n${fail === 0 ? 'ALL GOOD' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
