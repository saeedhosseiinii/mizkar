  /* === UI: a quieter layout for the notebook — Mizkar ===
     Nothing is removed: buttons move into menus (and every action stays in Ctrl+K and its shortcut). */
  (function(){
    var bar = document.querySelector('.bar-end');
    if (!bar) return;
    body.classList.add('ui-calm');

    // one «ویرایش» switch instead of the three view buttons (Alt+1/2/3 still work)
    var edit = document.createElement('button');
    edit.className = 'ib ui-edit';
    edit.type = 'button';
    edit.id = 'uiEdit';
    edit.setAttribute('aria-label', 'ویرایش');
    edit.setAttribute('data-tip', 'ویرایش ↔ خواندن (Alt+2 / Alt+3)');
    edit.innerHTML = icon('pen') + '<span>ویرایش</span>';
    edit.addEventListener('click', function(e){
      e.stopPropagation();
      // a notebook note is edited in place (one column); a temp tab gets the source next to the preview
      // on a phone there is no room for two columns: it is always read ↔ edit
      var narrow = innerWidth <= 760, isNote = !!(currentTab() && currentTab().nb);
      setView(state.view === 'preview' ? ((narrow || isNote) ? 'editor' : 'split') : 'preview');
      saveState();
      if (state.view !== 'preview') setTimeout(function(){ ta.focus(); }, 0);
    });
    var nbBtn = $('btnNotebook');
    bar.insertBefore(edit, nbBtn ? nbBtn.nextSibling : bar.firstChild);
    function syncEdit(){
      var on = state.view !== 'preview';
      edit.setAttribute('aria-pressed', String(on));
      edit.querySelector('span').textContent = on ? 'خواندن' : 'ویرایش';
    }
    new MutationObserver(syncEdit).observe(work, { attributes: true, attributeFilter: ['data-view'] });
    syncEdit();

    // «ابزارها»: the occasional tools, out of sight until needed
    var tools = document.createElement('button');
    tools.className = 'ib ui-tools';
    tools.type = 'button';
    tools.id = 'uiTools';
    tools.setAttribute('aria-label', 'ابزارها');
    tools.setAttribute('aria-haspopup', 'menu');
    tools.setAttribute('data-tip', 'ابزارها');
    tools.innerHTML = icon('tool') + '<span>ابزارها</span>' + '<svg class="i chev"><use href="#i-chev"/></svg>';
    var pal = bar.querySelector('[data-action="palette"]');
    bar.insertBefore(tools, pal || null);
    var TOOL_ITEMS = [
      ['open', 'باز کردن فایل…'], ['toolbox', 'جعبه‌ابزار (Base64، URL، Hash، UUID…)'], ['net-calc', 'ماشین‌حساب شبکه'],
      ['time-convert', 'تبدیل زمان و تاریخ شمسی'], ['compare', 'مقایسهٔ دو متن یا JSON'], ['fa-edit', 'ویراستار فارسی'],
      ['convert', 'تبدیل فرمت'], ['present', 'ارائه (اسلاید)'], null,
      ['theme', 'تم روشن / تیره'], ['dir', 'جهت پایه: راست‌به‌چپ / چپ‌به‌راست'], ['install', 'نصب به‌عنوان برنامه']
    ];
    function menuAt(btn, items){
      var r = btn.getBoundingClientRect();
      nbMenu(r.left, r.bottom + 6, items.filter(Boolean).filter(function(it){ return !it.hide; }));
    }
    function act(id){ return function(){ runAction(id); }; }
    tools.addEventListener('click', function(e){
      e.stopPropagation();
      closePops();
      menuAt(tools, TOOL_ITEMS.map(function(it){
        if (!it) return null;
        return { label: it[1], act: act(it[0]), hide: it[0] === 'install' && $('btnInstall') && $('btnInstall').hidden };
      }));
    });

    // the preview header keeps the outline; the rest goes under «⋯»
    var head = document.querySelector('.pane.out .ph-actions');
    if (head){
      var more = document.createElement('button');
      more.className = 'ib sm ui-more';
      more.type = 'button';
      more.setAttribute('aria-label', 'گزینه‌های نمایش');
      more.setAttribute('data-tip', 'گزینه‌های نمایش');
      more.innerHTML = '<span class="ui-dots">⋯</span>';
      head.appendChild(more);
      more.addEventListener('click', function(e){
        e.stopPropagation();
        closePops();
        menuAt(more, (typeof nbMobile === 'object' && nbMobile ? nbMobile.phoneItems : function(x){ return x; })([
          { label: 'بزرگ‌نمایی (' + $('zLvl').textContent + ')', act: act('zoom-in') },
          { label: 'کوچک‌نمایی', act: act('zoom-out') },
          { label: 'اندازهٔ اصلی', act: act('zoom-reset') },
          { label: 'عرض صفحه: ' + ($('btnWidth').getAttribute('data-tip') || '').replace(/^عرض صفحه:\s*/, ''), act: act('width') },
          { label: 'حالت دست (جابه‌جایی با کشیدن)', act: act('hand') },
          { label: 'حالت مطالعه', act: act('read') },
          { label: 'تمام‌صفحه', act: act('fs') },
          { label: 'ارائه (اسلاید)', act: act('present') }
        ]));
      });
    }

    // the format: a small label in the status bar opens the list (the chips row is gone)
    var fmt = $('stFmt');
    if (fmt){
      fmt.classList.add('ui-fmt');
      fmt.setAttribute('role', 'button');
      fmt.setAttribute('tabindex', '0');
      fmt.title = 'تغییر فرمت (معمولاً خودکار درست است)';
      var openFmt = function(e){
        e.stopPropagation();
        var r = fmt.getBoundingClientRect();
        var items = [{ label: (state.fmt === 'auto' ? '✓ ' : '') + 'تشخیص خودکار', act: function(){ setFormat('auto'); saveState(); } }]
          .concat(Object.keys(FMT_LABELS).map(function(k){
            return { label: (state.fmt === k ? '✓ ' : '') + FMT_LABELS[k], act: function(){ setFormat(k); saveState(); } };
          }));
        nbMenu(r.left, Math.max(8, r.top - Math.min(items.length * 34 + 16, innerHeight * 0.7)), items);
      };
      fmt.addEventListener('click', openFmt);
      fmt.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openFmt(e); } });
    }

    // §1a: every control but «خروجی» gathers next to the brand, in this order from the right:
    // sidebar · ویرایش · اخیر · ابزارها · فرمان‌ها · تنظیمات. «خروجی» stays alone at the far end.
    var header = document.querySelector('header.bar');
    if (header){
      var near = document.createElement('div');
      near.className = 'ui-near';
      header.insertBefore(near, bar);
      [ $('btnNotebook'), edit,
        $('btnHistory') && $('btnHistory').closest('.pop-wrap'),
        tools, pal,
        $('btnSettings') && $('btnSettings').closest('.pop-wrap')
      ].forEach(function(el){ if (el) near.appendChild(el); });
      var expWrap = $('btnExport') && $('btnExport').closest('.pop-wrap');
      var expBox = document.createElement('div');
      expBox.className = 'ui-export';
      header.appendChild(expBox);
      if (expWrap) expBox.appendChild(expWrap);
    }
  })();

  /* === §1b: the drawer's own edge handle, the rail, and keeping them in step === */
  var nbShellSync = (function(){
    var edge = document.createElement('button');
    edge.type = 'button';
    edge.id = 'nbEdge';
    edge.setAttribute('aria-label', 'نوار کناری دفترچه');
    edge.setAttribute('data-tip', 'دفترچه: یادداشت ها · Ctrl+\\');
    edge.setAttribute('aria-expanded', 'false');
    edge.innerHTML = icon('chev') + '<span class="nb-edge-t">دفترچه</span>';
    document.body.appendChild(edge);

    var RAIL = [
      ['notes', 'tree', 'دفترچه'], ['home', 'sun', 'امروز'], ['search', 'search', 'جستجو'],
      ['cal', 'clock', 'تقویم'], ['tasks', 'check', 'کارها'], ['temps', 'text', 'موقت']
    ];
    var rail = document.createElement('nav');
    rail.id = 'nbRail';
    rail.setAttribute('aria-label', 'دفترچه');
    rail.innerHTML = RAIL.map(function(r){
      return '<button type="button" class="nb-rail-b" data-nb-rail="' + r[0] + '" aria-label="' + r[2] + '" data-tip="' + r[2] + '">' + icon(r[1]) + '</button>';
    }).join('');
    document.body.appendChild(rail);
    body.classList.add('nb-rail-on');

    edge.addEventListener('click', function(e){ e.stopPropagation(); nbSidebar(); });
    rail.addEventListener('click', function(e){
      var b = e.target.closest('[data-nb-rail]');
      if (!b) return;
      e.stopPropagation();
      var what = b.dataset.nbRail;
      if (what === 'home'){ nbGoHome(); return; }
      NB.section = what;
      nbSidebar(true);
    });

    return function(){
      var open = body.classList.contains('nb-open');
      edge.setAttribute('aria-expanded', String(open));
      edge.title = open ? 'بستن نوار کناری' : 'باز کردن نوار کناری';
      var ch = edge.querySelector('.i');
      if (ch) ch.style.transform = open ? 'rotate(90deg)' : 'rotate(-90deg)';
      var sec = NB.section;
      Array.prototype.forEach.call(rail.querySelectorAll('[data-nb-rail]'), function(b){
        b.setAttribute('aria-pressed', String(!open && b.dataset.nbRail === sec));
      });
    };
  })();
  /** «امروز» is the empty page: an empty temp tab is reused instead of opening one more each time. */
  function nbGoHome(){
    var empty = tabs.filter(function(t){ return !t.nb && !String(t.text || '').trim(); })[0];
    if (empty){ if (empty.id !== activeTab) switchTab(empty.id); else render(); }
    else openTab('');
    if (innerWidth <= 1099 && NB.open) nbSidebar(false);            // the page is behind the drawer there
  }
  /* === §4: on a phone the app gets a bottom bar and its own kind of sheets === */
  var nbMobile = (function(){
    var NAV = [
      ['home', 'sun', 'امروز'], ['notes', 'tree', 'دفترچه'], ['search', 'search', 'جستجو'],
      ['cal', 'clock', 'تقویم'], ['new', 'plus', 'تازه']
    ];
    var nav = document.createElement('nav');
    nav.id = 'nbNav';
    nav.setAttribute('aria-label', 'بخش ها');
    nav.innerHTML = NAV.map(function(x){
      return '<button type="button" class="nb-nav-b" data-nb-nav="' + x[0] + '" aria-label="' + x[2] + '">' + icon(x[1]) + '<span>' + x[2] + '</span></button>';
    }).join('');
    document.body.appendChild(nav);
    body.classList.add('nb-nav-on');
    nav.addEventListener('click', function(e){
      var b = e.target.closest('[data-nb-nav]');
      if (!b) return;
      e.stopPropagation();
      var what = b.dataset.nbNav;
      if (what === 'new'){
        nbMenu(12, innerHeight - 190, [
          { label: 'یادداشت جدید', act: function(){ nbNewDialog(); } },
          { label: 'ثبت سریع', act: function(){ nbQuickInbox(); } },
          { label: 'یادداشت امروز', act: function(){ if (typeof ACTIONS === 'object' && ACTIONS['nb-today']) ACTIONS['nb-today'].run(); else nbNewDialog(); } }
        ]);
        return;
      }
      if (what === 'home'){ nbGoHome(); return; }
      NB.section = what;
      nbSidebar(true);
    });
    // the ⋯ menu on the preview header drops the desktop-only bits on a phone
    function phoneItems(items, w){
      if ((w || innerWidth) > 760) return items;
      return items.filter(function(it){
        return !/بزرگ نمایی|کوچک نمایی|اندازهٔ اصلی|حالت دست/.test(it.label);
      });
    }
    // theme-color follows the theme, so the phone's own bar matches the app
    function themeColor(){
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta){
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head.appendChild(meta);
      }
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      meta.setAttribute('content', bg || '#ffffff');
    }
    themeColor();
    new MutationObserver(themeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    var api = { phoneItems: phoneItems, themeColor: themeColor, nav: nav };
    window.nbMobile = api;
    return api;
  })();
  /* === /UI === */
