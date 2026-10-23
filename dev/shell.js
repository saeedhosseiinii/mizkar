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
    var NAV = [['home', 'sun', 'امروز'], ['temps', 'file', 'موقت'], ['notes', 'tree', 'یادداشت‌ها'], ['search', 'search', 'جستجو'], ['cal', 'clock', 'تقویم'], ['more', 'list', 'بیشتر']];
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
    // the panel's button sits at the right edge of the top bar, right above the panel it opens
    if ($('btnNotebook') && bar && brand){ bar.insertBefore($('btnNotebook'), bar.firstChild); $('btnNotebook').classList.add('nb-toggle'); }
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
      var on = NB.open ? ({ notes: 'notes', search: 'search', cal: 'cal', temps: 'temps' }[NB.section] || 'more') : (!path && !String(ta.value || '').trim() ? 'home' : '');
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

  /* ==== the phone's sideways swipes: the pages of the bottom bar, both edges included ====
     The bar, right to left, is the strip of pages: امروز · موقت · یادداشت ها · جستجو · تقویم. A finger moving to
     the right pulls the page on the left of the current one in (a right-to-left strip moves that way), and a
     finger moving left goes back. From the right edge a short pull brings the panel out the way a drawer comes,
     and from the left edge a short pull takes it away; both are wide enough for a thumb to find without aiming.
     «بیشتر» is a menu, not a page, and stays out. */
  var NB_PAGES = ['home', 'temps', 'notes', 'search', 'cal'];
  var NB_SWIPE = { edge: 28, need: 56, wobble: 24, slope: 1.6 };
  /** Which page is on screen: no panel is «امروز»; کارها/برچسب ها/سطل/تعارض count as «یادداشت ها». */
  function nbPageNow(){
    if (!NB.open) return 0;
    var i = NB_PAGES.indexOf(NB.section);
    return i > 0 ? i : 2;
  }
  /** Shows page `i` of the bar (0 is «امروز», where the panel is closed). */
  function nbPageGo(i){
    i = Math.max(0, Math.min(NB_PAGES.length - 1, i));
    var p = NB_PAGES[i];
    if (p === 'home'){
      if (NB.open){ NB.cameFrom = 'home'; nbSidebar(false); }
      nbGoHome();
    } else {
      NB.section = p;
      if (p === 'search') NB.focusSearch = true;
      if (NB.open) nbRender(); else nbSidebar(true);
    }
    nbShellSync();
    return p;
  }
  /** The panel out of the right edge: the page that was up last, «یادداشت ها» to begin with. */
  function nbPanelOut(){
    var i = NB_PAGES.indexOf(NB.section);
    return nbPageGo(i > 0 ? i : 2);
  }
  /**
   * What a finished sideways finger means on a phone: `{step}` turns a page of the bar, `{edge:'open'}` pulls the
   * panel out of the right edge, `{edge:'close'}` takes it away from the left edge, and null is «not a drag of
   * that kind». Short pulls at the edges count, so a thumb finds them without aiming.
   */
  function nbSwipeStep(dx, dy, x0){
    if (Math.abs(dx) < NB_SWIPE.wobble) return null;
    if (Math.abs(dx) < Math.abs(dy) * NB_SWIPE.slope) return null;      // that was a scroll, not a pull
    if (x0 >= innerWidth - NB_SWIPE.edge) return dx < 0 ? { edge: 'open' } : null;
    if (x0 <= NB_SWIPE.edge) return dx > 0 ? { edge: 'close' } : null;
    if (Math.abs(dx) < NB_SWIPE.need) return null;
    return { step: dx > 0 ? 1 : -1 };
  }
  /** What a finger may not start a page turn on: fields, sideways rows, and the rows a hold drags. */
  function nbSwipeBlocked(el){
    if (!el || !el.closest) return true;
    if (el.closest('textarea, input, select, [contenteditable], #tabs, .mdbar, .status, .nb-tabs, #nbMenu, #nbSyncPop, .nb-sug, .nb-set-nav')) return true;
    return !!el.closest('[data-nb-note], [data-nb-dir], [data-nb-att], [data-task-open]');
  }
  function nbSwipeReady(){
    if (nbSize() !== 'phone') return false;
    if (body.classList.contains('ip-tint') || body.classList.contains('readmode')) return false;
    if (document.querySelector('#deck:not([hidden]), #palette:not([hidden]), .modal:not([hidden])')) return false;
    var m = $('nbMenu');
    return !(m && !m.hidden);
  }
  (function(){
    var x0 = 0, y0 = 0, armed = false;
    document.addEventListener('touchstart', function(e){
      armed = false;
      if (e.touches.length !== 1 || !nbSwipeReady()) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
      armed = !nbSwipeBlocked(e.target);
    }, { passive: true });
    document.addEventListener('touchend', function(e){
      if (!armed) return;
      armed = false;
      if (typeof NBD === 'object' && NBD && (NBD.on || NBD.ready)) return;      // a drag is in flight
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var turn = nbSwipeStep(t.clientX - x0, t.clientY - y0, x0);
      if (!turn) return;
      if (turn.edge === 'open') nbPanelOut();
      else if (turn.edge === 'close') nbPageGo(0);
      else nbPageGo(nbPageNow() + turn.step);
    }, { passive: true });
    document.addEventListener('touchcancel', function(){ armed = false; }, { passive: true });
  })();
  if (window.nbMobile){
    window.nbMobile.pages = NB_PAGES;
    window.nbMobile.pageNow = nbPageNow;
    window.nbMobile.pageGo = nbPageGo;
    window.nbMobile.swipeStep = nbSwipeStep;
    window.nbMobile.swipeReady = nbSwipeReady;
  }
  /* === /SHELL === */
