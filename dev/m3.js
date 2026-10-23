  /* === M3 (beta2 only): the Android behaviours — the FAB and the ripple — Mizkar ===
     Does nothing unless the page was built with <html data-skin="m3"> (dev/beta.py --v2). */
  (function(){
    if ((document.documentElement.dataset.skin || '') !== 'm3') return;
    body.classList.add('m3');

    /* the FAB: the one «تازه» button of an Android app, bottom end on the phone */
    var fab = document.createElement('button');
    fab.id = 'm3Fab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'تازه');
    fab.setAttribute('aria-haspopup', 'menu');
    fab.innerHTML = icon('plus');
    document.body.appendChild(fab);
    fab.addEventListener('click', function(e){
      e.stopPropagation();
      var r = fab.getBoundingClientRect();
      nbMenu(r.left, Math.max(8, r.top - 300), nbPlusItems());
    });

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
