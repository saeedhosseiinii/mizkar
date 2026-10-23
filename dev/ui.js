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
      setView(state.view === 'preview' ? (currentTab() && currentTab().nb ? 'editor' : 'split') : 'preview');
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
        menuAt(more, [
          { label: 'بزرگ‌نمایی (' + $('zLvl').textContent + ')', act: act('zoom-in') },
          { label: 'کوچک‌نمایی', act: act('zoom-out') },
          { label: 'اندازهٔ اصلی', act: act('zoom-reset') },
          { label: 'عرض صفحه: ' + ($('btnWidth').getAttribute('data-tip') || '').replace(/^عرض صفحه:\s*/, ''), act: act('width') },
          { label: 'حالت دست (جابه‌جایی با کشیدن)', act: act('hand') },
          { label: 'حالت مطالعه', act: act('read') },
          { label: 'تمام‌صفحه', act: act('fs') },
          { label: 'ارائه (اسلاید)', act: act('present') }
        ]);
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
  })();
  /* === /UI === */
