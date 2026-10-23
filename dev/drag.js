  /* === DRAG: کشیدن و رها کردن — Mizkar ===
     Mouse drags right away; a finger has to hold first (like the tab bar). Every move can be taken back
     with the toast, and Esc cancels a drag in flight. */
  var NBD = { item: null, ghost: null, target: null, armed: false, on: false, x0: 0, y0: 0, hold: 0, taskId: '' };

  function nbdEl(sel, from){ return (from || document).querySelector(sel); }
  /** What is under the pointer, and what that means for the thing being dragged. */
  function nbdHit(x, y){
    var el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
    if (!el) return null;
    var day = el.closest('[data-nb-day]');
    if (day && NBD.item && NBD.item.kind === 'task') return { el: day, kind: 'day', stamp: day.dataset.nbDay };
    var row = el.closest('[data-nb-note]');
    if (row && NBD.item && NBD.item.kind === 'note' && row.dataset.nbNote !== NBD.item.path) return { el: row, kind: 'none' };
    var dir = el.closest('[data-nb-dir]');
    if (dir){
      var folder = dir.dataset.nbDir;
      var col = (C.collections.filter(function(c){ return nbFolderOfPattern(c.path) === folder; })[0]) || null;
      if (NBD.item && NBD.item.kind === 'note') return { el: dir, kind: 'folder', folder: folder, col: col };
      if (NBD.item && NBD.item.kind === 'folder' && folder !== NBD.item.path && folder.indexOf(NBD.item.path + '/') !== 0) return { el: dir, kind: 'folder-move', folder: folder };
      if (NBD.item && NBD.item.kind === 'tab') return { el: dir, kind: 'folder-tab', folder: folder };
      return { el: dir, kind: 'none' };
    }
    var editor = el.closest('textarea#input, #zoomWrap, .pane.editor');
    if (editor && NBD.item){
      if (NBD.item.kind === 'note') return { el: editor, kind: 'insert', el2: el };
      if (NBD.item.kind === 'attach') return { el: editor, kind: 'insert-image', path: NBD.item.path };
    }
    var list = el.closest('#nbList, #nbBody');
    if (list && NBD.item && (NBD.item.kind === 'note' || NBD.item.kind === 'folder')) return { el: list, kind: 'root' };
    return null;
  }
  function nbdMark(hit){
    if (NBD.target && NBD.target.el) NBD.target.el.classList.remove('nb-drop');
    NBD.target = hit;
    if (hit && hit.el && hit.kind !== 'none') hit.el.classList.add('nb-drop');
  }
  function nbdGhost(label){
    if (!NBD.ghost){
      NBD.ghost = document.createElement('div');
      NBD.ghost.className = 'nb-drag-ghost';
      document.body.appendChild(NBD.ghost);
    }
    NBD.ghost.textContent = label;
    NBD.ghost.hidden = false;
  }
  function nbdGhostAt(x, y){
    if (NBD.ghost){ NBD.ghost.style.left = (x + 8) + 'px'; NBD.ghost.style.top = (y + 10) + 'px'; }
  }
  function nbdEnd(){
    if (NBD.ghost){ NBD.ghost.hidden = true; NBD.ghost.remove(); NBD.ghost = null; }
    if (NBD.target && NBD.target.el) NBD.target.el.classList.remove('nb-drop');
    body.classList.remove('nb-dragging');
    NBD.item = null; NBD.target = null; NBD.armed = false; NBD.on = false; NBD.taskId = '';
    if (NBD.hold){ clearTimeout(NBD.hold); NBD.hold = 0; }
  }
  /** Drops a note (or a whole folder) into a folder. */
  function nbdDropNoteIn(path, folder, col){
    if (col){ nbMoveNoteToCollection(path, C.collections.indexOf(col)); return; }
    var to = (folder ? folder.replace(/\/+$/, '') + '/' : '') + path.split('/').pop();
    if (to === path) return;
    if (NB.files[to] && !NB.files[to].deleted){ toast('در آن پوشه یادداشتی با همین نام هست', 'x'); return; }
    nbMoveNote(path, to);
    toast('به «' + (folder || 'ریشه') + '» منتقل شد', 'folder', { label: 'بازگشت', icon: 'undo', run: function(){ nbMoveNote(to, path); } });
  }
  /** Moves a folder with everything in it. */
  function nbdDropFolder(from, to){
    if (!from || from === to) return;
    if (to.indexOf(from + '/') === 0){ toast('پوشه را داخل خودش نمی شود برد', 'x'); return; }
    var pre = from.replace(/\/+$/, '') + '/';
    var target = (to ? to.replace(/\/+$/, '') + '/' : '') + from.split('/').filter(Boolean).pop();
    var moved = 0;
    NB.paths.slice().forEach(function(p){
      if (p.indexOf(pre) !== 0) return;
      var rest = p.slice(pre.length);
      if (p.slice(-1) === '/'){
        var nd = target + '/' + rest;
        NB.paths = NB.paths.map(function(x){ return x === p ? nd : x; });
        return;
      }
      var dst = target + '/' + rest;
      if (NB.files[dst] && !NB.files[dst].deleted) return;
      var f = NB.files[p];
      nbMoveNote(p, dst);
      if (f && f.isNew) delete NB.files[p];
      moved++;
    });
    C.collections.forEach(function(c){
      if (nbFolderOfPattern(c.path) === from || nbFolderOfPattern(c.path).indexOf(pre) === 0) c.path = target + c.path.slice(from.length);
    });
    nbCollectionsChanged();
    nbCountDirty(); nbRender(); nbSaveFiles();
    toast('«' + from + '» با ' + faNum(moved) + ' یادداشت جابه جا شد', 'folder', { label: 'بازگشت', icon: 'undo', run: function(){ nbdDropFolder(target, nbFolder(from)); } });
  }
  /** A task dropped on a day gets that due date. */
  function nbdDropTaskOnDay(id, stamp){
    var at = homeTaskAt(id), f = NB.files[at.path];
    if (!f || f.deleted || nbReadOnly(at.path)){ toast('این یادداشت ویرایش نمی شود', 'x'); return; }
    var lines = nbTextOf(f).split('\n'), m = HOME_TASK_RE.exec(lines[at.line] || '');
    if (!m) return;
    var shamsi = nbShamsiStamp(stamp);
    var inner = m[3].replace(HOME_DUE_RE, '').replace(/[📅⏳]\s*(?![0-9۰-۹])/g, '').replace(/\s+$/, '');
    lines[at.line] = m[1] + '- [' + m[2] + '] ' + (inner ? inner + ' ' : '') + '📅 ' + shamsi;
    var before = nbTextOf(f), text = lines.join('\n');
    nbStoreText(f, text);
    var t = nbTabFor(at.path);
    if (t){ t.text = text; if (t.id === activeTab) ta.value = text; }
    nbCountDirty(); nbStatus(); nbSaveFiles();
    if (C.auto) nbScheduleCommit();
    render(); if (NB.open) nbRender();
    toast('سررسید: ' + nbShamsiLabel(shamsi), 'clock', { label: 'بازگشت', icon: 'undo', run: function(){
      nbStoreText(f, before);
      if (t && t.id === activeTab) ta.value = before;
      nbCountDirty(); nbSaveFiles(); render(); if (NB.open) nbRender();
    } });
  }
  /** A note dropped on the page leaves a link at the drop point. */
  function nbdDropLink(path, el){
    var t = currentTab();
    var link = '[[' + nbTitle(path) + ']]';
    if (!t || !t.nb){ openTab(link + '\n', 'markdown', 'پیوند ' + link); return; }
    if (ta.selectionStart !== ta.selectionEnd || document.activeElement === ta){
      var from = ta.selectionStart, to = ta.selectionEnd;
      var text = ta.value.slice(0, from) + link + ta.value.slice(to);
      nbEditApply(text, from + link.length);
    } else {
      var before = ta.value;
      var text2 = (before.replace(/\s+$/, '') ? before.replace(/\s+$/, '') + '\n\n' : '') + link + '\n';
      nbEditApply(text2, text2.length);
      toast('پیوند در انتهای یادداشت گذاشته شد', 'link', { label: 'بازگشت', icon: 'undo', run: function(){ nbEditApply(before, before.length); } });
      return;
    }
    toast('پیوند: ' + link, 'link');
  }
  /** A file dropped from the computer: Markdown becomes a note, an image an attachment. */
  function nbdDropFiles(files, folder, ontoEditor){
    Array.prototype.forEach.call(files, function(file){
      var name = file.name || 'file';
      var isMd = /\.(md|markdown|txt)$/i.test(name);
      var isImg = /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
      if (isMd){
        var rd = new FileReader();
        rd.onload = function(){
          var text = String(rd.result || '');
          var title = (text.match(/^\s{0,3}#{1,3}\s+(.+)$/m) || [])[1] || name.replace(/\.[^.]+$/, '');
          var path = (folder ? folder.replace(/\/+$/, '') + '/' : '') + nbSlug(title) + '.md';
          if (NB.files[path] && !NB.files[path].deleted){ toast('یادداشتی با همین نام هست: ' + title, 'x'); return; }
          nbWrite(path, text);
          toast('یادداشت اضافه شد: ' + nbTitle(path), 'cloud');
          nbRender();
        };
        rd.readAsText(file);
        return;
      }
      if (isImg){
        nbFileToBase64(file).then(function(b64){
          var p = nbAddAttachment(name, b64, file.type);
          if (!p) return;
          if (ontoEditor){
            var link = '![' + name + '](' + p + ')';
            var text = ta.value.slice(0, ta.selectionStart) + link + ta.value.slice(ta.selectionEnd);
            nbEditApply(text, ta.selectionStart + link.length);
          }
          toast('تصویر در ' + (C.attachments || 'attachments') + ' ذخیره شد', 'image');
        });
        return;
      }
      toast('فقط .md و تصویر پذیرفته می شود', 'x');
    });
  }

  /* ---- the pointer side: one flow for mouse and finger ---- */
  function nbdCandidate(el){
    var tab = el.closest('#tabsList [data-tab]');
    if (tab){
      var t = tabs.filter(function(x){ return x.id === tab.dataset.tab; })[0];
      if (t && !t.nb && String(t.text || '').trim() && t.id !== activeTab) return { kind: 'tab', el: tab, tab: t, label: tabLabel(t) };
      return null;
    }
    var task = el.closest('[data-task-open]');
    if (task) return { kind: 'task', el: task, id: task.dataset.taskOpen, label: task.textContent.trim().slice(0, 40) };
    var note = el.closest('[data-nb-note]');
    if (note && nbIsNote(note.dataset.nbNote)) return { kind: 'note', el: note, path: note.dataset.nbNote, label: nbTitle(note.dataset.nbNote) };
    var dir = el.closest('[data-nb-dir]');
    if (dir) return { kind: 'folder', el: dir, path: dir.dataset.nbDir, label: dir.dataset.nbDir };
    var att = el.closest('[data-nb-att]');
    if (att) return { kind: 'attach', el: att, path: att.dataset.nbAtt, label: att.dataset.nbAtt.split('/').pop() };
    return null;
  }
  document.addEventListener('pointerdown', function(e){
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    var wrong = e.target.closest('button, a, input, select, textarea');
    if (wrong && !wrong.matches('[data-task-open]')) return;   // a task row is a button too, and it can be dragged
    var c = nbdCandidate(e.target);
    if (!c) return;
    NBD.item = c; NBD.armed = true; NBD.x0 = e.clientX; NBD.y0 = e.clientY;
    if (e.pointerType === 'mouse') return;                       // a mouse drag starts on the first move
    NBD.hold = setTimeout(function(){                            // a finger has to hold first
      NBD.hold = 0;
      if (!NBD.armed) return;
      NBD.on = true;
      nbdGhost(c.label);
      nbdGhostAt(NBD.x0, NBD.y0);
      body.classList.add('nb-dragging');
      try { if (navigator.vibrate) navigator.vibrate(12); } catch(err){}
    }, 420);
  }, true);
  document.addEventListener('pointermove', function(e){
    if (!NBD.armed) return;
    var dx = Math.abs(e.clientX - NBD.x0), dy = Math.abs(e.clientY - NBD.y0);
    if (!NBD.on){
      if (dx < 6 && dy < 6) return;
      if (NBD.item.kind === 'note' && e.pointerType !== 'mouse') return;   // on touch a move is a scroll
      if (NBD.hold){ clearTimeout(NBD.hold); NBD.hold = 0; }
      NBD.on = true;
      nbdGhost(NBD.item.label);
      body.classList.add('nb-dragging');
    }
    e.preventDefault();
    nbdGhostAt(e.clientX, e.clientY);
    nbdMark(nbdHit(e.clientX, e.clientY));
  });
  function nbdFinish(e, drop){
    if (!NBD.armed) return;
    var item = NBD.item, hit = NBD.target, wasOn = NBD.on;
    nbdEnd();
    if (!wasOn) return;
    if (!drop){
      if (hit && hit.el) hit.el.classList.remove('nb-drop');
      toast('لغو شد', 'x');
      return;
    }
    if (!hit || hit.kind === 'none'){ toast('جای درستی رها نشد', 'x'); return; }
    if (item.kind === 'note'){
      if (hit.kind === 'folder') nbdDropNoteIn(item.path, hit.folder, hit.col);
      else if (hit.kind === 'root') nbdDropNoteIn(item.path, '');
      else if (hit.kind === 'insert') nbdDropLink(item.path, hit.el2);
    } else if (item.kind === 'folder'){
      if (hit.kind === 'folder-move') nbdDropFolder(item.path, hit.folder);
      else if (hit.kind === 'root') nbdDropFolder(item.path, '');
    } else if (item.kind === 'task' && hit.kind === 'day'){
      nbdDropTaskOnDay(item.id, hit.stamp);
    } else if (item.kind === 'tab' && hit.kind === 'folder-tab'){
      nbSaveTabInFolder(item.tab.id, hit.folder);
    } else if (item.kind === 'attach' && hit.kind === 'insert-image'){
      var link = '![' + item.label + '](' + item.path + ')';
      var text = ta.value.slice(0, ta.selectionStart) + link + ta.value.slice(ta.selectionEnd);
      nbEditApply(text, ta.selectionStart + link.length);
    }
  }
  document.addEventListener('pointerup', function(e){ nbdFinish(e, true); });
  document.addEventListener('pointercancel', function(e){ nbdFinish(e, false); if (NBD.armed) nbdEnd(); });
  addEventListener('keydown', function(e){ if (e.key === 'Escape' && NBD.on){ nbdEnd(); toast('کشیدن لغو شد', 'x'); } });

  /* ---- files from the computer ---- */
  function nbdFilesOver(e){ return e.dataTransfer && e.dataTransfer.types && Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') !== -1; }
  document.addEventListener('dragover', function(e){
    if (!nbdFilesOver(e)) return;
    e.preventDefault();
    var dir = e.target.closest('[data-nb-dir]');
    var list = e.target.closest('#nbList, #nbBody');
    var editor = e.target.closest('textarea#input, #zoomWrap');
    var mark = dir || (editor ? editor : (list ? list : null));
    if (mark && !mark.classList.contains('nb-drop')){ document.querySelectorAll('.nb-drop').forEach(function(x){ x.classList.remove('nb-drop'); }); mark.classList.add('nb-drop'); }
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', function(e){
    if (!nbdFilesOver(e)) return;
    var mark = e.target.closest('.nb-drop');
    if (mark && !mark.contains(e.relatedTarget)) mark.classList.remove('nb-drop');
  });
  document.addEventListener('drop', function(e){
    if (!nbdFilesOver(e)) return;
    e.preventDefault();
    document.querySelectorAll('.nb-drop').forEach(function(x){ x.classList.remove('nb-drop'); });
    var dir = e.target.closest('[data-nb-dir]');
    var editor = e.target.closest('textarea#input, #zoomWrap');
    nbdDropFiles(e.dataTransfer.files, dir ? dir.dataset.nbDir : '', !!editor);
  });
  /* the app (and the tests) can drive a drop without a pointer */
  window.nbDragFiles = nbdDropFiles;
  window.nbDrag = { note: nbdDropNoteIn, folder: nbdDropFolder, taskDay: nbdDropTaskOnDay, files: nbdDropFiles, link: nbdDropLink, hit: nbdHit, cancel: nbdEnd };
  /* === /DRAG === */
