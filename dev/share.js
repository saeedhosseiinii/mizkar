  /* === SHARE: a note through a GitHub Gist — open, with the key in the link, or behind a password — Mizkar ===
     A share is one unlisted gist. «باز» holds the Markdown as it is; the other two hold only ciphertext (the same
     AES-GCM + PBKDF2 as secret notes), and the title travels inside it. The key of «کلید در لینک» lives in the
     link's fragment, which never reaches GitHub; a password is never stored anywhere.
     «اشتراک‌ها» (settings) lists every share: GitHub is the source of truth, a local copy keeps titles and keys. */
  var NB_SHARE_PREFIX = 'mizkar-share';
  var NB_SHARE_MODES = { open: 'باز', key: 'کلید در لینک', pass: 'رمزدار' };
  var nbShareReg = null;                     // [{id, file, path, title, mode, key, at, exp}]

  function nbShareToken(){ return C.gistToken || ((C.provider || 'github') === 'github' ? C.token : ''); }
  /** The GitHub API for gists, whatever the notebook's own provider is. `anon`: no token (opening a link). */
  function nbGistApi(method, path, body, anon){
    var headers = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    var tok = nbShareToken();
    if (tok && !anon) headers.Authorization = 'Bearer ' + tok;
    var init = { method: method, headers: headers };
    if (body){ headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    return fetch('https://api.github.com' + path, init).then(function(res){
      if (res.status === 204) return null;
      return res.json().catch(function(){ return null; }).then(function(data){
        if (res.ok) return data;
        var msg = (data && data.message) || ('خطای گیت هاب (' + res.status + ')');
        if (res.status === 401) msg = 'توکن پذیرفته نشد';
        if ((res.status === 403 || res.status === 404) && !anon && method !== 'GET') msg = 'توکن اجازهٔ گیست ندارد — در گیت هاب به توکن دسترسی Gists (خواندن و نوشتن) بده';
        if (res.status === 404 && (anon || method === 'GET')) msg = 'این اشتراک برداشته شده';
        throw nbError(res.status, msg);
      });
    }, function(){ throw nbError(0, 'اتصال به گیت هاب برقرار نشد'); });
  }
  function nbShareLoadReg(){
    if (nbShareReg) return Promise.resolve(nbShareReg);
    return idbGet('shares', 'meta').then(function(v){ nbShareReg = Array.isArray(v) ? v : []; return nbShareReg; }, function(){ nbShareReg = []; return nbShareReg; });
  }
  function nbShareSaveReg(){ return idbSet('shares', nbShareReg || [], 'meta'); }
  function nbShareUrl(rec){ return SHARE_BASE + '#g=' + rec.id + (rec.mode === 'key' && rec.key ? '.' + rec.key : ''); }
  function nbShareKey(){ return b64urlFromBytes(crypto.getRandomValues(new Uint8Array(18))); }
  function nbShareGive(url, title){
    if (navigator.share && window.matchMedia && matchMedia('(pointer: coarse)').matches){
      navigator.share({ title: title || 'میزکار', url: url }).catch(function(){});
      return;
    }
    copyToClipboard('', url).then(function(ok){ toast(ok ? 'لینک اشتراک کپی شد' : 'کپی لینک ممکن نشد — از «اشتراک‌ها» بردار', ok ? 'link' : 'x'); });
  }

  /** «اشتراک‌گذاری…» for a note: the three ways, an optional expiry, then one link. */
  function nbShareDialog(path){
    var f = NB.files[path];
    if (!f || f.deleted){ toast('این یادداشت پیدا نشد', 'x'); return; }
    if (f.enc && f.plain == null){ nbEnsurePlain(path).then(function(ok){ if (ok) nbShareDialog(path); }); return; }
    if (!nbShareToken()){
      nbConfirm('اشتراک‌گذاری با گیست', 'برای ساختن لینک یک توکن گیت هاب با دسترسی Gists لازم است. تنظیماتش را باز کنم؟', function(){ nbOpenSettings('shares'); });
      return;
    }
    var secret = !!f.enc, text = nbTextOf(f);
    var pics = /!\[[^\]]*\]\((?!https?:)[^)]+\)/.test(text);
    var mode = secret ? 'key' : 'open';
    var opt = function(m, label, sub){
      return '<label class="nb-share-opt"><input type="radio" name="nbShareMode" value="' + m + '"' + (m === mode ? ' checked' : '') + (secret && m === 'open' ? ' disabled' : '') + '>'
        + '<span><b>' + label + '</b><small>' + sub + '</small></span></label>';
    };
    nbModalBox('اشتراک‌گذاری: ' + nbTitle(path),
      '<div class="nb-share">'
      + opt('open', 'باز', 'هر کس لینک را داشته باشد می خواند؛ متن روی گیست ساده است.')
      + opt('key', 'کلید در لینک', 'روی گیت هاب فقط متن رمزشده است؛ کلید داخل خود لینک است، پس لینک کامل کافی است.')
      + opt('pass', 'رمزدار', 'خواننده باید گذرواژه را هم بداند؛ گذرواژه جایی ذخیره نمی شود.')
      + '<input class="nb-input" id="nbSharePass" type="password" autocomplete="new-password" placeholder="گذرواژه" hidden>'
      + '<div class="nb-field"><label>انقضا</label><select id="nbShareExp"><option value="0">هرگز</option><option value="1">یک روز</option><option value="7">یک هفته</option><option value="30">یک ماه</option></select>'
      + '<small class="nb-mini-text">گیست خودش منقضی نمی شود؛ میزکار بعد از موعد، وقتی آنلاین باز شود، برش می دارد.</small></div>'
      + (secret ? '<p class="nb-mini-text">این یادداشت رمزدار است؛ فقط به صورت رمزشده شیر می شود.</p>' : '')
      + (pics ? '<p class="nb-mini-text nb-warn">تصویرهای پیوست همراهش نمی روند.</p>' : '')
      + '</div>',
      '<button class="btn-soft" type="button" data-nb-mini-close>انصراف</button><button class="btn-primary" type="button" id="nbMiniOk">ساختن لینک</button>', 'link');
    var box = $('nbMini');
    var pick = function(){ var r = box.querySelector('input[name="nbShareMode"]:checked'); return r ? r.value : mode; };
    box.onchange = function(){ $('nbSharePass').hidden = pick() !== 'pass'; if (pick() === 'pass') $('nbSharePass').focus(); };
    $('nbMiniOk').onclick = function(){
      var m = pick(), pass = $('nbSharePass').value, days = +$('nbShareExp').value;
      if (m === 'pass' && pass.length < 4){ toast('گذرواژه دست کم ۴ نویسه باشد', 'x'); $('nbSharePass').focus(); return; }
      nbCloseMini();
      nbShareCreate(path, m, pass, days);
    };
  }
  function nbShareCreate(path, mode, pass, days){
    var f = NB.files[path], title = nbTitle(path), text = nbTextOf(f);
    var exp = days ? homeAddDays(homeToday(), days) : '';
    var key = mode === 'key' ? nbShareKey() : '';
    var file = (nbSlug(title) || 'note') + (mode === 'open' ? '.md' : '.mizkar');
    // the title of an encrypted share stays inside the ciphertext, not in the gist's description
    var desc = NB_SHARE_PREFIX + (mode === 'open' ? ': ' + title : '') + (exp ? ' | exp ' + exp : '');
    toast('در حال ساختن لینک…', 'link');
    var body = mode === 'open' ? Promise.resolve(text) : nbEncrypt(JSON.stringify({ t: title, x: text }), mode === 'key' ? key : pass);
    return body.then(function(content){
      var files = {}; files[file] = { content: content };
      return nbGistApi('POST', '/gists', { description: desc, public: false, files: files });
    }).then(function(g){
      return nbShareLoadReg().then(function(){
        var rec = { id: g.id, file: file, path: path, title: title, mode: mode, key: key, at: Date.now(), exp: exp };
        nbShareReg.unshift(rec);
        nbShareSaveReg();
        nbShareGive(nbShareUrl(rec), title);
        return rec;
      });
    }).catch(function(e){ toast(e.message || 'ساختن لینک ممکن نشد', 'x'); return null; });
  }
  /** «به‌روزرسانی»: the note's current text goes into the same gist, so the same link shows it. */
  function nbShareUpdate(rec){
    var f = NB.files[rec.path];
    if (!f || f.deleted){ toast('یادداشتِ این اشتراک دیگر نیست', 'x'); return Promise.resolve(false); }
    if (f.enc && f.plain == null) return nbEnsurePlain(rec.path).then(function(ok){ return ok ? nbShareUpdate(rec) : false; });
    var send = function(content){
      var files = {}; files[rec.file] = { content: content };
      return nbGistApi('PATCH', '/gists/' + rec.id, { files: files }).then(function(){ rec.at = Date.now(); nbShareSaveReg(); toast('اشتراک به روز شد — همان لینک', 'check'); return true; });
    };
    var payload = JSON.stringify({ t: nbTitle(rec.path), x: nbTextOf(f) });
    if (rec.mode === 'open') return send(nbTextOf(f)).catch(function(e){ toast(e.message, 'x'); return false; });
    if (rec.mode === 'key' && rec.key) return nbEncrypt(payload, rec.key).then(send).catch(function(e){ toast(e.message, 'x'); return false; });
    return new Promise(function(resolve){
      nbPrompt('گذرواژهٔ همین اشتراک', '', function(pass){
        if (!pass){ resolve(false); return; }
        nbEncrypt(payload, pass).then(send).then(resolve, function(e){ toast(e.message, 'x'); resolve(false); });
      });
      if ($('nbMiniInput')) $('nbMiniInput').type = 'password';
    });
  }
  function nbShareRemove(rec, quiet){
    return nbGistApi('DELETE', '/gists/' + rec.id).catch(function(e){ if (e.status !== 404) throw e; }).then(function(){
      nbShareReg = (nbShareReg || []).filter(function(x){ return x.id !== rec.id; });
      nbShareSaveReg();
      if (!quiet) toast('اشتراک برداشته شد — لینکش دیگر کار نمی کند', 'trash');
      return true;
    }, function(e){ if (!quiet) toast(e.message, 'x'); return false; });
  }
  /** Every share: what GitHub has (any device made it) joined with what this device remembers. */
  function nbShareList(){
    return nbShareLoadReg().then(function(){
      if (!nbShareToken()) return nbShareReg;
      return nbGistApi('GET', '/gists?per_page=100').then(function(list){
        var mine = (list || []).filter(function(g){ return String(g.description || '').indexOf(NB_SHARE_PREFIX) === 0; });
        var known = {};
        nbShareReg.forEach(function(r){ known[r.id] = r; });
        nbShareReg = mine.map(function(g){
          var r = known[g.id], file = Object.keys(g.files || {})[0] || '';
          var d = String(g.description || ''), exp = (/\| exp (\d{4}-\d\d-\d\d)/.exec(d) || [])[1] || '';
          if (r) return Object.assign(r, { file: r.file || file, exp: r.exp || exp });
          var title = (/^mizkar-share: (.*?)(?: \| exp .*)?$/.exec(d) || [])[1] || '';
          return { id: g.id, file: file, path: '', title: title || 'رمزدار (روی دستگاه دیگری ساخته شده)', mode: /\.md$/.test(file) ? 'open' : 'pass', key: '', at: Date.parse(g.created_at) || 0, exp: exp };
        });
        nbShareSaveReg();
        return nbShareReg;
      }, function(){ return nbShareReg; });
    });
  }
  /** Past their date: removed the next time the app runs online. */
  function nbShareExpire(){
    if (!navigator.onLine || !nbShareToken()) return Promise.resolve(0);
    return nbShareLoadReg().then(function(){
      var today = homeToday(), due = nbShareReg.filter(function(r){ return r.exp && r.exp < today; });
      if (!due.length) return 0;
      return Promise.all(due.map(function(r){ return nbShareRemove(r, true); })).then(function(){
        toast(faNum(due.length) + ' اشتراک منقضی شده برداشته شد', 'trash');
        return due.length;
      });
    });
  }

  /* --- «اشتراک‌ها» in the settings page --- */
  function nbSharesSectionHtml(){
    return '<div id="nbShareList"><p class="nb-mini-text">در حال خواندن…</p></div>'
      + '<h5>توکن برای اشتراک</h5>'
      + '<div class="nb-field"><label>توکن گیت هاب با دسترسی Gists (اختیاری)</label><input class="nb-input" id="nbGistToken" dir="ltr" type="password" autocomplete="off" placeholder="'
      + ((C.provider || 'github') === 'github' ? 'خالی = همان توکن مخزن' : 'github_pat_…') + '" value="' + escapeHtml(C.gistToken || '') + '">'
      + '<small class="nb-mini-text">در <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">گیت هاب</a>، Account permissions › Gists › Read and write.</small></div>';
  }
  function nbSharesFill(filterPath){
    var box = $('nbShareList');
    if (!box) return;
    nbShareList().then(function(list){
      if (!$('nbShareList')) return;
      var rows = filterPath ? list.filter(function(r){ return r.path === filterPath; }) : list;
      $('nbShareList').innerHTML = rows.length ? rows.map(function(r){
        var i = nbShareReg.indexOf(r);
        return '<div class="nb-row nb-hist-row nb-share-row">' + icon(r.mode === 'open' ? 'link' : 'lock')
          + '<span class="nb-name" dir="auto">' + escapeHtml(r.title || 'بدون عنوان') + '<small> · ' + NB_SHARE_MODES[r.mode]
          + (r.at ? ' · ' + escapeHtml(nbShamsiLabel(new Date(r.at))) : '') + (r.exp ? ' · تا ' + escapeHtml(nbShamsiLabel(r.exp)) : '') + '</small></span>'
          + '<span class="nb-hist-btns">'
          + '<button type="button" class="elbtn xs" data-nb-share-copy="' + i + '">کپی لینک</button>'
          + (r.path ? '<button type="button" class="elbtn xs" data-nb-share-up="' + i + '">به‌روزرسانی</button>' : '')
          + '<button type="button" class="elbtn xs" data-nb-share-del="' + i + '">برداشتن</button></span></div>';
      }).join('') : '<p class="nb-mini-text">' + (filterPath ? 'این یادداشت هنوز شیر نشده.' : 'هنوز چیزی شیر نشده. از ⋯ یا راست کلیکِ یک یادداشت «اشتراک‌گذاری…» را بزن.') + '</p>';
    });
  }
  function nbSharesClick(e){
    var c = e.target.closest('[data-nb-share-copy]'), u = e.target.closest('[data-nb-share-up]'), d = e.target.closest('[data-nb-share-del]');
    if (!c && !u && !d) return false;
    var rec = nbShareReg[+(c || u || d).getAttribute(c ? 'data-nb-share-copy' : u ? 'data-nb-share-up' : 'data-nb-share-del')];
    if (!rec) return true;
    if (c){
      if (rec.mode === 'key' && !rec.key) toast('کلید این لینک روی این دستگاه نیست — لینک بدون کلید کپی شد', 'x');
      copyToClipboard('', nbShareUrl(rec)).then(function(ok){ if (ok) toast('لینک کپی شد', 'link'); });
    } else if (u) nbShareUpdate(rec);
    else nbConfirm('برداشتن اشتراک', '«' + (rec.title || 'این اشتراک') + '» برداشته شود؟ لینکش دیگر کار نمی کند.', function(){ nbShareRemove(rec).then(function(){ nbSharesFill(); }); });
    return true;
  }

  /* --- opening a link: #g=<id> or #g=<id>.<key> --- */
  function nbReadGistHash(hash){
    var m = /^#g=([0-9a-f]{20,40})(?:\.([A-Za-z0-9_-]+))?$/.exec(hash || location.hash);
    if (!m) return Promise.resolve(false);
    if (!hash) history.replaceState(null, '', location.pathname + location.search);
    toast('در حال خواندن متن اشتراکی…', 'link');
    return nbGistApi('GET', '/gists/' + m[1], null, true).then(function(g){
      var name = Object.keys(g.files || {})[0], file = name && g.files[name];
      if (!file) throw nbError(404, 'این اشتراک برداشته شده');
      var content = file.truncated && file.raw_url ? fetch(file.raw_url).then(function(r){ return r.text(); }) : Promise.resolve(file.content || '');
      return content.then(function(text){
        if (/\.md$/.test(name)) return { title: name.replace(/\.md$/, ''), text: text };
        return nbShareOpenCipher(text, m[2]);
      });
    }).then(function(d){
      if (!d) return false;
      receiveText(d.text, 'markdown', 'متن اشتراکی باز شد' + (d.title ? ': ' + d.title : ''));
      setView('preview'); saveState();
      return true;
    }).catch(function(e){ toast(e.message || 'لینک اشتراک خوانده نشد', 'x'); return false; });
  }
  function nbShareOpenCipher(text, key){
    var parse = function(plain){ var d = JSON.parse(plain); return { title: d.t || '', text: String(d.x || '') }; };
    if (key) return nbDecrypt(text, key).then(parse, function(){ throw nbError(0, 'کلید این لینک درست نیست — لینک کامل را بگیر'); });
    return new Promise(function(resolve){
      (function ask(again){
        nbPrompt(again ? 'گذرواژه درست نبود — دوباره' : 'گذرواژهٔ این متن', '', function(pass){
          if (!pass){ resolve(null); return; }
          nbDecrypt(text, pass).then(function(plain){ resolve(parse(plain)); }, function(){ ask(true); });
        });
        if ($('nbMiniInput')) $('nbMiniInput').type = 'password';
      })(false);
    });
  }
  addEventListener('hashchange', function(){ nbReadGistHash(); });
  setTimeout(function(){ nbReadGistHash(); }, 0);
  setTimeout(function(){ if (NB.loaded) nbShareExpire(); }, 8000);
  /* === /SHARE === */
