  /* === HOME: «امروز», tasks, recent notes, notes in the palette — Mizkar === */
  var HOME_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  /** A due date written in a task: 📅 1405-08-05 (Shamsi) or 📅 2026-10-27, also «due: …». */
  var HOME_DUE_RE = /(?:📅|⏳|\bdue:)\s*([0-9۰-۹]{4})[-\/.]([0-9۰-۹]{1,2})[-\/.]([0-9۰-۹]{1,2})/;
  var HOME_TASK_RE = /^(\s*)[-*+] \[( |x|X)\] (.*)$/;

  function homeDigits(s){ return String(s).replace(/[۰-۹]/g, function(d){ return String(d.charCodeAt(0) - 0x06F0); }); }
  function homeStamp(gy, gm, gd){ return gy + '-' + nbPad2(gm) + '-' + nbPad2(gd); }
  function homeToday(){ var d = new Date(); return homeStamp(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function homeAddDays(stamp, n){
    var p = stamp.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return homeStamp(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  /** «۵ آبان» for a Gregorian stamp. */
  function homeDayLabel(stamp){
    var p = stamp.split('-'), j = nbGToJ(+p[0], +p[1], +p[2]);
    return faNum(j.jd) + ' ' + HOME_MONTHS[j.jm - 1];
  }
  /** Every checkbox line of every readable note: {path, line, done, text, due}. Locked secret notes are skipped. */
  function homeTasks(){
    var out = [];
    NB.paths.forEach(function(p){
      var f = NB.files[p];
      if (!f || f.deleted || p.slice(-1) === '/' || !nbIsNote(p) || (f.enc && f.plain == null)) return;
      nbTextOf(f).split('\n').forEach(function(line, i){
        var m = HOME_TASK_RE.exec(line);
        if (!m) return;
        var due = null, dm = HOME_DUE_RE.exec(m[3]);
        if (dm){
          var y = +homeDigits(dm[1]), mo = +homeDigits(dm[2]), d = +homeDigits(dm[3]);
          if (y < 1700){ var g = nbJToG(y, mo, d); due = homeStamp(g.gy, g.gm, g.gd); } else due = homeStamp(y, mo, d);
        }
        out.push({ path: p, line: i, done: m[2] !== ' ', text: m[3].replace(HOME_DUE_RE, '').trim(), due: due, ro: nbReadOnly(p) });
      });
    });
    return out;
  }
  function homeGroups(tasks){
    var today = homeToday(), week = homeAddDays(today, 7), g = { late: [], today: [], week: [], later: [], none: [] };
    tasks.filter(function(t){ return !t.done; }).forEach(function(t){
      if (!t.due) g.none.push(t);
      else if (t.due < today) g.late.push(t);
      else if (t.due === today) g.today.push(t);
      else if (t.due <= week) g.week.push(t);
      else g.later.push(t);
    });
    ['late', 'today', 'week', 'later'].forEach(function(k){ g[k].sort(function(a, b){ return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; }); });
    return g;
  }
  function homeTaskRow(t){
    var id = encodeURIComponent(t.path) + ':' + t.line;
    return '<div class="hm-task' + (t.done ? ' done' : '') + '">'
      + '<input type="checkbox" data-task-toggle="' + escapeHtml(id) + '"' + (t.done ? ' checked' : '') + (t.ro ? ' disabled title="این پوشه فقط خواندنی است"' : '') + ' aria-label="انجام شد">'
      + '<button type="button" class="hm-task-text" data-task-open="' + escapeHtml(id) + '" dir="auto">' + escapeHtml(t.text || '—') + '</button>'
      + '<small>' + (t.due ? '<b class="hm-due' + (t.due < homeToday() ? ' late' : '') + '">' + escapeHtml(homeDayLabel(t.due)) + '</b> · ' : '')
      + escapeHtml(nbTitle(t.path)) + '</small></div>';
  }
  function homeTaskSection(title, list, max){
    if (!list.length) return '';
    return '<div class="hm-group"><h5>' + escapeHtml(title) + ' <b>' + faNum(list.length) + '</b></h5>'
      + list.slice(0, max).map(homeTaskRow).join('')
      + (list.length > max ? '<div class="hm-more">و ' + faNum(list.length - max) + ' کار دیگر</div>' : '') + '</div>';
  }
  /** The sidebar section «کارها». */
  function nbTasksHtml(){
    var tasks = homeTasks(), g = homeGroups(tasks), done = tasks.filter(function(t){ return t.done; }).length;
    var html = homeTaskSection('عقب افتاده', g.late, 50) + homeTaskSection('امروز', g.today, 50) + homeTaskSection('هفت روز آینده', g.week, 50)
      + homeTaskSection('بعدا', g.later, 50) + homeTaskSection('بدون تاریخ', g.none, 80);
    return (html || '<div class="nb-empty">کار بازی نیست.<br>هر خط «- [ ] …» در یادداشت ها یک کار است؛ تاریخ سررسید را با «📅 1405-08-05» کنارش بنویس.</div>')
      + (done ? '<div class="nb-hint">' + faNum(done) + ' کار انجام شده</div>' : '');
  }
  function homeOpenNotes(){
    return NB.paths.map(function(p){ return NB.files[p]; }).filter(function(f){ return f && !f.deleted && f.path.slice(-1) !== '/' && nbIsNote(f.path); });
  }
  /** «امروز»: what the empty page shows once the notebook is in use. */
  function nbHomeHtml(){
    if (!NB.loaded || !C || !(C.repo || NB.paths.length)) return '';
    var ctx = nbCtx(new Date(), '', C.weekStart), g = homeGroups(homeTasks());
    var cals = C.collections.filter(function(c){ return c.calendar; });
    var recent = homeOpenNotes().sort(function(a, b){ return (b.at || 0) - (a.at || 0); }).slice(0, 8);
    var due = g.late.concat(g.today, g.week);
    return '<div class="hm" data-ui>'
      + '<div class="hm-head"><h1>امروز</h1><span>' + escapeHtml(ctx.weekday + ' ' + faNum(+ctx.jd) + ' ' + HOME_MONTHS[+ctx.jm - 1] + ' ' + faNum(+ctx.jy).replace(/٬/g, '')) + '</span></div>'
      + '<div class="hm-actions">'
      + cals.map(function(c){
        var label = c.calendar === 'day' ? c.name + ' امروز' : c.calendar === 'week' ? c.name + ' این هفته' : c.name + ' — تازه';
        return '<button type="button" class="btn-soft" data-home="cal" data-col="' + escapeHtml(c.id) + '"><i class="hm-dot" style="background:' + escapeHtml(c.color || 'var(--accent)') + '"></i>' + escapeHtml(label) + '</button>';
      }).join('')
      + '<button type="button" class="btn-soft" data-home="new">' + icon('plus') + 'یادداشت جدید</button>'
      + '<button type="button" class="btn-soft" data-home="quick">' + icon('pen') + 'ثبت سریع</button>'
      + '</div><div class="hm-grid">'
      + '<section><h3>' + icon('check') + 'کارها</h3>'
      + (due.length ? homeTaskSection('عقب افتاده', g.late, 6) + homeTaskSection('امروز', g.today, 8) + homeTaskSection('هفت روز آینده', g.week, 6)
        : '<p class="hm-empty">برای امروز و این هفته کاری با تاریخ نیست' + (g.none.length ? ' — ' + faNum(g.none.length) + ' کار بدون تاریخ هست' : '') + '.</p>')
      + '<button type="button" class="hm-link" data-home="tasks">همهٔ کارها ←</button></section>'
      + '<section><h3>' + icon('clock') + 'یادداشت های اخیر</h3>'
      + (recent.length ? recent.map(function(f){
        return '<button type="button" class="hm-note" data-home="open" data-path="' + escapeHtml(f.path) + '"><b dir="auto">' + escapeHtml(nbTitle(f.path)) + '</b>'
          + '<small dir="auto">' + escapeHtml(nbFolder(f.path) || '—') + (f.at ? ' · ' + escapeHtml(relTime((f.at - Date.now()) / 1000)) : '') + '</small></button>';
      }).join('') : '<p class="hm-empty">هنوز یادداشتی نیست.</p>')
      + '</section></div>'
      + '<p class="hm-hint">برای دیدن سریع یک متن، همین‌جا بچسبان (Ctrl+V) — در یک تب موقت باز می شود و به دفترچه نمی رود.</p>'
      + '</div>';
  }
  /** Notes in the command palette, most recent first: a quick way to jump to any of them. */
  function nbPaletteItems(){
    if (!NB.loaded) return [];
    return homeOpenNotes().sort(function(a, b){ return (b.at || 0) - (a.at || 0); }).slice(0, 400).map(function(f){
      return { label: 'یادداشت: ' + nbTitle(f.path), icon: 'file', kw: 'note ' + f.path, run: function(){ nbOpen(f.path); } };
    });
  }
  function homeTaskAt(id){
    var cut = id.lastIndexOf(':');
    return { path: decodeURIComponent(id.slice(0, cut)), line: +id.slice(cut + 1) };
  }
  /** Ticks or unticks a task in its note (secret notes stay secret: the plaintext copy is what changes). */
  function homeToggleTask(id, done){
    var at = homeTaskAt(id), f = NB.files[at.path];
    if (!f || nbReadOnly(at.path) || (f.enc && f.plain == null)) return;
    var lines = nbTextOf(f).split('\n'), m = HOME_TASK_RE.exec(lines[at.line] || '');
    if (!m) return;
    lines[at.line] = m[1] + '- [' + (done ? 'x' : ' ') + '] ' + m[3];
    var text = lines.join('\n');
    nbStoreText(f, text);
    var t = nbTabFor(at.path);
    if (t){ t.text = text; if (t.id === activeTab){ ta.value = text; } }
    nbCountDirty(); nbStatus(); nbSaveFiles();
    if (C.auto) nbScheduleCommit();
    render(); if (NB.open) nbRender();
  }
  function homeOpenTask(id){
    var at = homeTaskAt(id), f = NB.files[at.path];
    if (!f) return;
    var lines = nbTextOf(f).split('\n'), pos = 0;
    for (var i = 0; i < at.line && i < lines.length; i++) pos += lines[i].length + 1;
    nbOpen(at.path, pos);
  }
  function homeClick(e){
    var tg = e.target.closest('[data-task-toggle]');
    if (tg){ homeToggleTask(tg.dataset.taskToggle, tg.checked); return true; }
    var op = e.target.closest('[data-task-open]');
    if (op){ homeOpenTask(op.dataset.taskOpen); return true; }
    var h = e.target.closest('[data-home]');
    if (!h) return false;
    var what = h.dataset.home;
    if (what === 'open') nbOpen(h.dataset.path);
    else if (what === 'new') nbNewDialog(C.collections[0] && C.collections[0].id, null, new Date());
    else if (what === 'quick') nbQuickInbox();
    else if (what === 'tasks'){ NB.section = 'tasks'; nbSidebar(true); nbRender(); }
    else if (what === 'cal'){
      var col = C.collections.filter(function(c){ return c.id === h.dataset.col; })[0];
      if (col) nbMakeOnDate(col, new Date());
    }
    return true;
  }
  zoomWrap.addEventListener('click', function(e){ if (e.target.closest('.hm')) homeClick(e); });
  $('nbBody').addEventListener('click', function(e){ if (e.target.closest('[data-task-toggle],[data-task-open]')) homeClick(e); });
  /* === /HOME === */
