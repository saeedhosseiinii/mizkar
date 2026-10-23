  /* === IN PLACE: a notebook note is one page — read it, double-click to edit right there — Mizkar ===
     Notebook tabs open in reading view; a double-click (or E) turns the same column into the Markdown source,
     caret on the line and word that was clicked, Markdown tinted; Esc goes back to reading at the same spot.
     Ticking ☐ works while reading. Temp tabs keep the two columns. */
  var ip = { tempView: null, wasNb: false, md: null, raf: 0, note: '' };
  function ipTab(){ var t = currentTab(); return t && t.nb ? t : null; }
  function ipReadOnly(t){ return !!(t && nbReadOnly(t.nb)); }
  /** Called after a tab switch or a note opening: notes read, temp tabs get back the view they had. */
  function ipSync(){
    var t = ipTab();
    body.classList.toggle('ip-on', !!t);
    if (t && !ip.wasNb){ ip.tempView = state.view; }
    if (t && state.view !== 'preview' && state.view !== 'editor') setView('preview');
    if (t && t.nb !== ip.note && state.view === 'editor' && document.activeElement !== ta) setView('preview');   // another note opens to read
    ip.note = t ? t.nb : '';
    if (!t && ip.wasNb && ip.tempView && ip.tempView !== state.view) setView(ip.tempView);
    ip.wasNb = !!t;
    ipTint();
  }
  /* --- from a rendered block to its source line, and back (by text, then by position) --- */
  function ipNorm(s){
    return normalizeFa(String(s)).replace(/[‌‎‏\s]+/g, '').toLowerCase();
  }
  function ipPlainLine(line){
    return line.replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/, '')
      .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/!?\[\[([^\]]+)\]\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|__|~~|`)/g, '').replace(/^\|/, '');
  }
  var IP_BLOCKS = 'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,td,th,.nb-props,.callout-title';
  function ipBlocks(){
    return Array.prototype.filter.call(zoomWrap.querySelectorAll(IP_BLOCKS), function(el){ return !el.closest('[data-ui]') && !el.querySelector('p,li,pre'); });
  }
  function ipKey(text){ return ipNorm(text).slice(0, 18); }
  /** The source line a block came from: the k-th line holding the block's opening text, else by position. */
  function ipLineOf(el){
    var lines = ta.value.split('\n'), blocks = ipBlocks(), at = blocks.indexOf(el.closest(IP_BLOCKS) || el);
    var block = blocks[at], key = block ? ipKey(block.tagName === 'PRE' ? (block.textContent.split('\n')[0] || '') : block.textContent) : '';
    if (block && block.classList.contains('nb-props')) return 1;
    if (key.length >= 2){
      var nth = blocks.slice(0, at).filter(function(b){ return ipKey(b.tagName === 'PRE' ? (b.textContent.split('\n')[0] || '') : b.textContent) === key; }).length;
      for (var i = 0, seen = 0; i < lines.length; i++){
        var norm = ipNorm(ipPlainLine(lines[i]));
        if (norm && (norm.indexOf(key) === 0 || (key.length > 6 && norm.indexOf(key) !== -1))){
          if (seen === nth) return i;
          seen++;
        }
      }
    }
    return Math.round((at < 0 ? 0 : at / Math.max(1, blocks.length)) * (lines.length - 1));
  }
  function ipBlockOfLine(line){
    var lines = ta.value.split('\n'), key = ipKey(ipPlainLine(lines[line] || ''));
    if (key.length < 2) return null;
    var nth = 0;
    for (var i = 0; i < line; i++) if (ipKey(ipPlainLine(lines[i])) === key) nth++;
    return ipBlocks().filter(function(b){ return ipKey(b.tagName === 'PRE' ? (b.textContent.split('\n')[0] || '') : b.textContent) === key; })[nth] || null;
  }
  /** Where a character of the textarea sits, measured on a hidden copy with the same font and wrapping. */
  function ipCaretTop(pos){
    var m = document.createElement('div'), cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'whiteSpace', 'overflowWrap', 'wordBreak', 'textAlign', 'direction', 'unicodeBidi', 'boxSizing'].forEach(function(k){ m.style[k] = cs[k]; });
    m.style.position = 'absolute'; m.style.visibility = 'hidden'; m.style.top = '0'; m.style.left = '-9999px';
    m.style.width = ta.clientWidth + 'px'; m.style.height = 'auto';
    m.textContent = ta.value.slice(0, pos);
    var mark = document.createElement('span');
    mark.textContent = '​';
    m.appendChild(mark);
    body.appendChild(m);
    var top = mark.offsetTop;
    m.remove();
    return top;
  }
  /** Reading → editing, with the caret on `line` (and on `word` in it), the line kept where the block was. */
  function ipEdit(line, word, screenY){
    var t = ipTab();
    if (!t) return;
    if (ipReadOnly(t)){ toast('این پوشه فقط خواندنی است', 'x'); return; }
    var lines = ta.value.split('\n'), pos = 0;
    line = Math.max(0, Math.min(line, lines.length - 1));
    for (var i = 0; i < line; i++) pos += lines[i].length + 1;
    var inLine = word ? lines[line].indexOf(word) : -1;
    if (inLine > 0) pos += inLine;
    setView('editor');
    saveState();
    ta.focus();
    ta.setSelectionRange(pos, pos);
    var paneTop = ta.getBoundingClientRect().top;
    ta.scrollTop = Math.max(0, ipCaretTop(pos) - (typeof screenY === 'number' ? screenY - paneTop : ta.clientHeight / 3));
    ipTint();
  }
  /** Editing → reading, the preview scrolled to the block of the caret line. */
  function ipRead(){
    if (!ipTab()) return;
    var line = ta.value.slice(0, ta.selectionStart).split('\n').length - 1;
    setView('preview');
    saveState();
    render();
    var block = ipBlockOfLine(line);
    if (block) block.scrollIntoView({ block: 'center' });
  }
  zoomWrap.addEventListener('dblclick', function(e){
    if (!ipTab() || state.view !== 'preview' || e.target.closest('a,button,input,[data-ui],.mermaid,.katex,time')) return;
    var word = String(window.getSelection ? window.getSelection() : '').trim();
    var block = e.target.closest(IP_BLOCKS);
    ipEdit(block ? ipLineOf(block) : 0, word.length > 1 && word.length < 60 ? word : '', block ? block.getBoundingClientRect().top : e.clientY);
  });
  // ticking ☐ while reading: the n-th task box is the n-th checkbox line of the source (fences skipped)
  zoomWrap.addEventListener('click', function(e){
    var box = e.target.closest('li.task > .box');
    var t = ipTab();
    if (!box || !t || ipReadOnly(t)) return;
    var all = Array.prototype.slice.call(zoomWrap.querySelectorAll('li.task > .box')), k = all.indexOf(box);
    var lines = ta.value.split('\n'), fence = false, seen = -1;
    for (var i = 0; i < lines.length; i++){
      if (/^\s*(```|~~~)/.test(lines[i])){ fence = !fence; continue; }
      if (fence) continue;
      var m = /^(\s*[-*+] \[)( |x|X)(\] .*)$/.exec(lines[i]);
      if (m && ++seen === k){
        lines[i] = m[1] + (m[2] === ' ' ? 'x' : ' ') + m[3];
        ta.value = lines.join('\n');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        render();
        return;
      }
    }
  });
  // a press outside the text box (the margins of the page, the empty work area) ends editing; the press is
  // judged where it starts, so a selection dragged out of the text never counts
  var IP_STAY = 'textarea, .mdbar, .pane-head, #nb, #nbNav, #nbRail, #nbEdge, .bar, .tabs, .status, .modal, .pop, .ctx-menu, #nbMenu, #nbMini, #nbMini2, #nbModal, .findbar, #palette, .toast, .fabs';
  document.addEventListener('mousedown', function(e){
    if (!ipTab() || state.view !== 'editor' || e.button !== 0) return;
    if (!e.target.closest || !e.target.closest('#work') || e.target.closest(IP_STAY)) return;
    ipRead();
  }, true);
  document.addEventListener('keydown', function(e){
    var t = ipTab();
    if (!t || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && e.target === ta && state.view === 'editor'){ e.preventDefault(); e.stopPropagation(); ipRead(); return; }
    if (e.code === 'KeyE' && state.view === 'preview' && !e.shiftKey && !isEditable(e.target) && !state.read && !nbLayerOpen()){
      e.preventDefault(); e.stopPropagation();
      var first = ipBlocks().filter(function(b){ return b.getBoundingClientRect().bottom > out.getBoundingClientRect().top + 8; })[0];
      ipEdit(first ? ipLineOf(first) : 0, '', first ? first.getBoundingClientRect().top : undefined);
    }
  }, true);

  /* --- Markdown tint: a copy behind the transparent source text, colours only (no width ever changes) --- */
  function ipTintLine(line, state0){
    var esc = escapeHtml(line);
    if (state0.fence || /^\s*(```|~~~)/.test(line)){
      if (/^\s*(```|~~~)/.test(line)) state0.fence = !state0.fence;
      return '<span class="mk-c">' + esc + '</span>';
    }
    if (state0.fm) return '<span class="mk-fm">' + esc + '</span>';
    var h = /^(#{1,6}\s)(.*)$/.exec(esc);
    if (h) return '<span class="mk-m">' + h[1] + '</span><span class="mk-h">' + ipTintInline(h[2]) + '</span>';
    esc = esc.replace(/^(\s*)([-*+]\s\[[ xX]\]\s|[-*+]\s|\d+[.)]\s|&gt;\s?)/, '$1<span class="mk-m">$2</span>');
    return ipTintInline(esc);
  }
  function ipTintInline(s){
    return s.replace(/(`[^`]+`)|(\[\[[^\]]+\]\])|(!?\[[^\]]*\]\([^)\s]*\))|(\*\*|__|~~)|((?:^|\s)#[^\s#&<]+)|(📅\s*[0-9۰-۹\/\-.]+)/g, function(m, code, wiki, link, mark, tag, due){
      if (code) return '<span class="mk-c">' + m + '</span>';
      if (wiki || link) return '<span class="mk-l">' + m + '</span>';
      if (mark) return '<span class="mk-m">' + m + '</span>';
      if (tag || due) return '<span class="mk-t">' + m + '</span>';
      return m;
    });
  }
  function ipTint(){
    var on = !!ipTab() && state.view === 'editor';
    body.classList.toggle('ip-tint', on);
    if (!on){ if (ip.md) ip.md.hidden = true; return; }
    if (!ip.md){
      ip.md = document.createElement('div');
      ip.md.className = 'ta-md';
      ip.md.setAttribute('aria-hidden', 'true');
      ta.parentNode.insertBefore(ip.md, ta);
    }
    var cs = getComputedStyle(ta);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'whiteSpace', 'overflowWrap', 'wordBreak', 'textAlign', 'direction', 'unicodeBidi', 'textIndent'].forEach(function(k){ ip.md.style[k] = cs[k]; });
    ip.md.style.top = ta.offsetTop + 'px'; ip.md.style.left = ta.offsetLeft + 'px';
    ip.md.style.width = ta.clientWidth + 'px'; ip.md.style.height = ta.clientHeight + 'px';
    var st = { fence: false, fm: false }, lines = ta.value.split('\n');
    ip.md.innerHTML = lines.map(function(line, i){
      if (i === 0 && line === '---'){ st.fm = true; return '<span class="mk-fm">---</span>'; }
      if (st.fm && line === '---'){ st.fm = false; return '<span class="mk-fm">---</span>'; }
      return ipTintLine(line, st);
    }).join('\n') + '\n ';
    ip.md.hidden = false;
    ip.md.scrollTop = ta.scrollTop;
  }
  ta.addEventListener('input', function(){ if (body.classList.contains('ip-tint')){ cancelAnimationFrame(ip.raf); ip.raf = requestAnimationFrame(ipTint); } });
  ta.addEventListener('scroll', function(){ if (ip.md && !ip.md.hidden) ip.md.scrollTop = ta.scrollTop; });
  if (window.ResizeObserver) new ResizeObserver(function(){ if (body.classList.contains('ip-tint')) ipTint(); }).observe(ta);
  new MutationObserver(ipTint).observe(work, { attributes: true, attributeFilter: ['data-view'] });
  /* === /IN PLACE === */
