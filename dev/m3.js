  /* === M3 (beta2 only): the Android behaviours — the FAB and the ripple — Mizkar ===
     Does nothing unless the page was built with <html data-skin="m3"> (dev/beta.py --v2). */
  (function(){
    /** The FAB: the one «تازه» button of an Android app, bottom end on the phone. */
    function m3Fab(){
      if ((document.documentElement.dataset.skin || '') !== 'm3') return false;
      body.classList.add('m3');
      if ($('m3Fab')) return true;                                  // one FAB, however often this runs
      var fab = document.createElement('button');
      fab.id = 'm3Fab';
      fab.type = 'button';
      fab.setAttribute('aria-label', 'تازه');
      fab.setAttribute('aria-haspopup', 'menu');
      fab.innerHTML = icon('plus');
      document.body.appendChild(fab);
      function open(){
        var r = fab.getBoundingClientRect();
        nbMenu(r.left, Math.max(8, r.top - 300), nbPlusItems());
      }
      /* A tap answers on the first of click/pointerup/touchend the browser gives us, and the rest of that one
         tap is dropped: a phone whose browser delivers no click (or a late one) still opens the menu. A second
         tap on the FAB closes it again — it is the switch of its own menu. */
      var last = 0;
      function tap(e){
        if (e && e.stopPropagation) e.stopPropagation();      // not «outside»: the menu must stay open
        var now = Date.now();
        if (now - last < 400){ if (e && e.preventDefault) e.preventDefault(); return; }
        last = now;
        var m = $('nbMenu');
        if (m && !m.hidden){ nbMenuClose(); return; }
        open();
      }
      fab.addEventListener('click', tap);
      fab.addEventListener('pointerup', function(e){ if (e.pointerType !== 'mouse') tap(e); });
      fab.addEventListener('touchend', tap);
      return true;
    }
    window.m3Fab = m3Fab;                                            // the tests wake it after setting the skin
    if (!m3Fab()) return;

    /* the ripple: a touch answers where it lands */
    var RIPPLY = '.ib, .btn-soft, .btn-primary, .elbtn, .mi, .nb-row, .nb-nav-b, .tab, .hm-note, .nb-set-item, .nb-tab, #m3Fab';
    document.addEventListener('pointerdown', function(e){
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      var el = e.target.closest && e.target.closest(RIPPLY);
      if (!el || el.disabled) return;
      var r = el.getBoundingClientRect(), d = Math.max(r.width, r.height);
      var dot = document.createElement('span');
      dot.className = 'm3-ripple';
      dot.style.width = dot.style.height = d + 'px';
      dot.style.left = (e.clientX - r.left - d / 2) + 'px';
      dot.style.top = (e.clientY - r.top - d / 2) + 'px';
      el.appendChild(dot);
      setTimeout(function(){ dot.remove(); }, 520);
    }, { passive: true });
  })();
  /* === /M3 === */
