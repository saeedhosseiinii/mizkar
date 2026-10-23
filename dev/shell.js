  /* === SHELL: the frame around the notes — Mizkar ===
     Three sizes, one layout each:
       phone   ≤ 760   pages, not a drawer: a bottom bar switches «امروز · یادداشت‌ها · جستجو · تقویم · بیشتر»,
                       a note is a page of its own with a top bar (← title · sync · edit · ⋯), every menu is a sheet;
       tablet  761–1099 the panel slides over the page from the right, behind a backdrop;
       desktop ≥ 1100  the panel sits beside the page.
     On tablet and desktop one button opens the panel: the notebook button at the start of the top bar. */
  function nbSize(){ return innerWidth <= 760 ? 'phone' : innerWidth < 1100 ? 'tablet' : 'desk'; }
  var NB_SECTION_NAMES = { notes: 'یادداشت‌ها', temps: 'موقت', search: 'جستجو', cal: 'تقویم', tasks: 'کارها', tags: 'برچسب‌ها', trash: 'سطل بازیافت', conflicts: 'تعارض‌ها' };

  /** «امروز» is the empty page: an empty temp tab is reused instead of opening one more each time. */
  function nbGoHome(){
    var empty = tabs.filter(function(t){ return !t.nb && !String(t.text || '').trim(); })[0];
    if (empty){ if (empty.id !== activeTab) switchTab(empty.id); else render(); }
    else openTab('');
    if (nbSize() !== 'desk' && NB.open) nbSidebar(false);           // the page is behind the panel there
    NB.cameFrom = 'home';
    nbShellSync();
  }
  /** «بیشتر» on a phone: the sections without a place on the bottom bar, the new-note actions, settings. */
  function nbMoreItems(){
    var sec = function(s){ return function(){ NB.section = s; nbSidebar(true); }; };
    return [
      { label: 'موقت (تب ها و متن های اخیر)', act: sec('temps') },
      { label: 'کارها', act: sec('tasks') },
      { label: 'برچسب ها', act: sec('tags') },
      { label: 'سطل بازیافت' + ((NB.trash || []).length ? ' (' + faNum(NB.trash.length) + ')' : ''), act: sec('trash') },
      NB.conflicts.length ? { label: 'تعارض ها (' + faNum(NB.conflicts.length) + ')', act: sec('conflicts') } : null,
      null,
      { label: 'یادداشت جدید', act: function(){ nbNewDialog(); } },
      { label: 'ثبت سریع', act: function(){ nbQuickInbox(); } },
      { label: 'یادداشت امروز', act: function(){ if (ACTIONS['nb-today']) ACTIONS['nb-today'].run(); } },
      null,
      { label: 'همگام سازی: ' + (($('nbSync') && $('nbSync').textContent) || 'دفترچه'), act: function(){ nbToggleSyncPop(null); } },
      { label: 'ابزارها و فرمان ها', act: function(){ runAction('palette'); } },
      { label: 'تنظیمات', act: function(){ nbOpenSettings(''); } }
    ];
  }
  var nbShellSync = (function(){
    /* the bottom bar (phone) */
    var NAV = [['home', 'sun', 'امروز'], ['notes', 'tree', 'یادداشت‌ها'], ['search', 'search', 'جستجو'], ['cal', 'clock', 'تقویم'], ['more', 'list', 'بیشتر']];
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
      if (what === 'home'){ nbGoHome(); return; }
      if (what === 'more'){ var r = b.getBoundingClientRect(); nbMenu(r.left, r.top, nbMoreItems()); return; }
      NB.section = what;
      if (what === 'search') NB.focusSearch = true;
      if (NB.open) nbRender(); else nbSidebar(true);
      nbShellSync();
    });

    /* the note page's top bar (phone) */
    var top = document.createElement('div');
    top.id = 'nbTop';
    top.setAttribute('role', 'toolbar');
    top.setAttribute('aria-label', 'یادداشت');
    top.innerHTML = '<button type="button" class="ib" data-nb-top="back" aria-label="بازگشت"><svg class="i nb-rtl-back"><use href="#i-chev"/></svg></button>'
      + '<button type="button" class="nb-top-t" id="nbTopTitle" data-nb-top="rename" dir="auto" title="تغییر نام"></button>'
      + '<button type="button" class="nb-top-sync" data-nb-top="sync" aria-label="وضعیت همگام سازی"><i></i></button>'
      + '<button type="button" class="ib" data-nb-top="edit" aria-label="ویرایش"><svg class="i"><use href="#i-pen"/></svg></button>'
      + '<button type="button" class="ib" data-nb-top="more" aria-label="گزینه ها"><span class="ui-dots">⋯</span></button>';
    var header = document.querySelector('header.bar');
    if (header && header.parentNode) header.parentNode.insertBefore(top, header);
    else document.body.insertBefore(top, document.body.firstChild);
    top.addEventListener('click', function(e){
      var b = e.target.closest('[data-nb-top]');
      if (!b) return;
      e.stopPropagation();
      var t = currentTab(), path = t && t.nb;
      var w = b.dataset.nbTop;
      if (w === 'back'){
        if (NB.cameFrom && NB.cameFrom !== 'home'){ NB.section = NB.cameFrom; nbSidebar(true); }
        else nbGoHome();
      } else if (w === 'edit'){
        setView(state.view === 'preview' ? 'editor' : 'preview');
        saveState();
        if (state.view !== 'preview') setTimeout(function(){ ta.focus(); }, 0);
      } else if (w === 'rename' && path){
        if (nbReadOnly(path)){ toast('این پوشه فقط خواندنی است', 'lock'); return; }
        nbPrompt('نام یادداشت', nbTitle(path), function(v){ if (v) nbRenameDialog(path, v); });
      } else if (w === 'sync'){
        nbToggleSyncPop(b);
      } else if (w === 'more' && path){
        var r = b.getBoundingClientRect();
        nbMenu(r.left, r.bottom, [
          { label: 'گرفتن و ارسال', act: function(){ nbPull({ loud: true }).then(function(){ if (nbCountDirty()) nbPush({ loud: true }); }); } },
          null
        ].concat(nbNoteMenuItems(path).filter(function(it){ return !it || !/^(باز کردن|باز کردن در تب تازه|سنجاق در تب)$/.test(it.label); })));
      }
    });

    /* the sync list lives at the top level (the status bar it opens from is not there on a phone) and opens
       next to its chip, or as a sheet on a phone */
    var syncPop = $('nbSyncPop'), syncChip = $('nbSync');
    if (syncPop && syncChip){
      document.body.appendChild(syncPop);
    }

    /* the tabs join the top bar (one row instead of two): brand · tabs · the controls · export */
    var tabsRow = $('tabs'), bar = document.querySelector('header.bar'), brand = bar && bar.querySelector('.brand');
    if (tabsRow && bar && brand){ brand.parentNode.insertBefore(tabsRow, brand.nextSibling); body.classList.add('nb-tabs-in-bar'); }
    if ($('btnExport')){ $('btnExport').setAttribute('aria-label', 'خروجی'); $('btnExport').setAttribute('data-tip', 'خروجی: PDF، HTML، Word، لینک…'); }

    /* a note's page head shows where it lives (روزانه › 1405 › 08 › …) instead of «پیش‌نمایش»; a folder opens in the panel */
    var phTitle = document.querySelector('.pane.out .pane-head .ph-title'), phOrig = phTitle ? phTitle.innerHTML : '';
    function crumbs(path){
      if (!phTitle) return;
      if (!path){ if (phTitle.dataset.crumbs){ phTitle.innerHTML = phOrig; delete phTitle.dataset.crumbs; } return; }
      if (phTitle.dataset.crumbs === path) return;
      var parts = path.split('/'), name = nbTitle(parts.pop()), acc = '';
      phTitle.innerHTML = icon('folder') + parts.map(function(seg){
        acc = acc ? acc + '/' + seg : seg;
        return '<button type="button" class="nb-crumb" data-nb-crumb="' + escapeHtml(acc) + '" dir="auto">' + escapeHtml(seg) + '</button><span class="nb-crumb-sep">›</span>';
      }).join('') + '<b class="nb-crumb-t" dir="auto">' + escapeHtml(name) + '</b>';
      phTitle.dataset.crumbs = path;
    }
    if (phTitle) phTitle.addEventListener('click', function(e){
      var c = e.target.closest('[data-nb-crumb]');
      if (!c) return;
      var folder = c.dataset.nbCrumb, acc = '';
      folder.split('/').forEach(function(seg){ acc = acc ? acc + '/' + seg : seg; NB.expanded[acc] = true; });
      NB.section = 'notes'; NB.treeQuery = '';
      nbSidebar(true);
      var row = $('nbBody') && Array.prototype.filter.call($('nbBody').querySelectorAll('[data-nb-dir]'), function(r){ return r.dataset.nbDir === folder; })[0];
      if (row && row.scrollIntoView){ row.scrollIntoView({ block: 'center' }); row.classList.add('nb-flash'); setTimeout(function(){ row.classList.remove('nb-flash'); }, 1200); }
    });

    /* the ⋯ menu on the preview header drops the desktop-only bits on a phone */
    function phoneItems(items, w){
      if ((w || innerWidth) > 760) return items;
      return items.filter(function(it){ return !/بزرگ نمایی|کوچک نمایی|اندازهٔ اصلی|حالت دست/.test(it.label); });
    }
    /* theme-color follows the theme, so the phone's own bar matches the app */
    function themeColor(){
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta){ meta = document.createElement('meta'); meta.setAttribute('name', 'theme-color'); document.head.appendChild(meta); }
      var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
      meta.setAttribute('content', bg || '#ffffff');
    }
    themeColor();
    new MutationObserver(themeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    window.nbMobile = { phoneItems: phoneItems, themeColor: themeColor, nav: nav };

    function sync(){
      var size = nbSize(), t = currentTab(), path = t && t.nb ? t.nb : '';
      if (body.dataset.nbSize !== size) body.dataset.nbSize = size;
      var notePage = size === 'phone' && !!path && !NB.open;
      body.classList.toggle('nb-note-page', notePage);
      if (path) $('nbTopTitle').textContent = nbTitle(path);
      crumbs(path);
      var syncBtn = $('nbSync'), dot = top.querySelector('.nb-top-sync');
      if (syncBtn) dot.className = 'nb-top-sync ' + (syncBtn.className.match(/nb-(ok|pending|busy|conflict|error|off)/) || ['nb-off'])[0];
      dot.title = syncBtn ? syncBtn.textContent : '';
      var hs = $('nbHeadSync');
      if (hs){
        var n = NB.dirtyCount || 0;
        hs.className = 'nb-head-sync ' + dot.className.replace('nb-top-sync ', '');
        hs.querySelector('b').textContent = n ? faNum(n) : '';
        hs.title = (syncBtn ? syncBtn.textContent : 'همگام سازی') + ' — فهرست، گرفتن و ارسال';
      }
      top.querySelector('[data-nb-top="edit"]').setAttribute('aria-pressed', String(state.view !== 'preview'));
      var on = NB.open ? ({ notes: 'notes', search: 'search', cal: 'cal' }[NB.section] || 'more') : (!path && !String(ta.value || '').trim() ? 'home' : '');
      Array.prototype.forEach.call(nav.querySelectorAll('[data-nb-nav]'), function(b){ b.setAttribute('aria-pressed', String(b.dataset.nbNav === on)); });
      var head = $('nbHeadTitle');
      if (head) head.textContent = size === 'phone' ? (NB_SECTION_NAMES[NB.section] || 'دفترچه') : 'دفترچه';
      var btn = $('btnNotebook');
      if (btn) btn.setAttribute('aria-pressed', String(NB.open));
    }
    addEventListener('resize', function(){ sync(); if (NB.open) nbSlot(); });
    new MutationObserver(sync).observe(work, { attributes: true, attributeFilter: ['data-view'] });
    if ($('nbSync')) new MutationObserver(sync).observe($('nbSync'), { attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true });
    return sync;
  })();
  /**
   * Where the panel covers the page (phone, tablet), opening a note or a tab from it leaves the panel, remembering
   * where from (the note page's ← goes back there). Beside the page (desktop) it stays.
   */
  function nbPhoneLeavePanel(){
    if (nbSize() !== 'desk' && NB.open){ NB.cameFrom = NB.section; nbSidebar(false); }
    else if (!NB.open && !NB.cameFrom) NB.cameFrom = 'home';
  }
  /* === /SHELL === */
