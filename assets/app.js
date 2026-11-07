(function () {
  'use strict';
  var data = window.ROADMAP;
  if (!data) return;
  var prefix = location.pathname.replace(/\\/g, '/').includes('/stages/') ? '../' : '';
  var $ = function (q) { return document.querySelector(q); };
  var $$ = function (q) { return Array.from(document.querySelectorAll(q)); };
  var validIds = new Set(data.stages.flatMap(function (s) { return [s.id].concat(s.dodIds); }));
  var key = 'roadmap-progress-' + data.id, progress = {};
  try { progress = clean(JSON.parse(localStorage.getItem(key) || '{}')); } catch (_) {}
  function clean(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ожидается объект отметок');
    var out = {};
    Object.keys(value).forEach(function (id) { if (validIds.has(id) && typeof value[id] === 'boolean') out[id] = value[id]; });
    return out;
  }
  function updateProgress() {
    $$('[data-progress]').forEach(function (el) { el.checked = !!progress[el.dataset.progress]; });
    $$('[data-nav-stage], [data-stage]').forEach(function (el) { el.classList.toggle('is-done', !!progress[el.dataset.navStage || el.dataset.stage]); });
    var count = data.stages.filter(function (s) { return progress[s.id]; }).length;
    $('#progress-summary').textContent = count + '/' + data.stages.length;
    try { localStorage.setItem(key, JSON.stringify(progress)); } catch (_) { $('#progress-message').textContent = 'Хранилище недоступно: отметки действуют до закрытия страницы.'; }
  }
  $$('[data-progress]').forEach(function (el) { el.addEventListener('change', function () { progress[el.dataset.progress] = el.checked; updateProgress(); }); });
  updateProgress();
  $('#progress-export').addEventListener('click', function () {
    var url = URL.createObjectURL(new Blob([JSON.stringify({ roadmapId: data.id, marks: progress }, null, 2)], { type: 'application/json' }));
    var a = document.createElement('a'); a.href = url; a.download = 'roadmap-progress.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  $('#progress-import').addEventListener('change', async function (e) {
    try {
      var file = e.target.files[0]; if (!file) return;
      if (file.size > 1024 * 1024) throw new Error('Слишком большой файл');
      var imported = JSON.parse(await file.text());
      if (imported.roadmapId !== data.id) throw new Error('Файл относится к другой программе');
      progress = clean(imported.marks); updateProgress(); $('#progress-message').textContent = 'Прогресс импортирован.';
    } catch (err) { $('#progress-message').textContent = 'Не удалось импортировать: ' + err.message; }
    e.target.value = '';
  });
  $('#theme-toggle').addEventListener('click', function () {
    var theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('roadmap-theme', theme); } catch (_) {}
  });
  var menu = $('#menu-toggle');
  menu.addEventListener('click', function () { var open = $('#sidebar').classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
  var dialog = $('#search-dialog'), search = $('#search-input');
  function openSearch() { if (!dialog.open) dialog.showModal(); search.focus(); renderResults(); }
  $('#search-open').addEventListener('click', openSearch);
  $('#search-close').addEventListener('click', function () { dialog.close(); });
  function renderResults() {
    var query = search.value.trim().toLocaleLowerCase();
    var results = query ? data.index.filter(function (x) { return (x.title + ' ' + x.text).toLocaleLowerCase().includes(query); }).slice(0, 50) : data.index.slice(0, 12);
    var list = $('#search-results'); list.replaceChildren();
    results.forEach(function (result) { var li = document.createElement('li'), a = document.createElement('a'); a.href = prefix + result.url; a.textContent = result.title; li.append(a); list.append(li); });
    $('#search-count').textContent = results.length ? 'Результатов: ' + results.length : 'Ничего не найдено';
  }
  search.addEventListener('input', renderResults);
  dialog.addEventListener('keydown', function (e) {
    var links = $$('#search-results a'), current = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); if (links.length) links[(current + 1) % links.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (links.length) links[(current < 0 ? links.length - 1 : (current - 1 + links.length) % links.length)].focus(); }
    if (e.key === 'Enter' && document.activeElement === search && links.length) { e.preventDefault(); links[0].click(); }
  });
  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') { $('#sidebar').classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
  });
  var sections = $$('.stage-block');
  if ('IntersectionObserver' in window && sections.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) $$('.toc a').forEach(function (a) { a.classList.toggle('active', a.hash === '#' + e.target.id); }); });
    }, { rootMargin: '-10% 0px -60% 0px' }); sections.forEach(function (s) { observer.observe(s); });
  }
  var svg = $('#roadmap-graph'), viewport = $('.graph-viewport');
  if (!svg || !viewport) return;
  var scale = 1;
  function zoom(value) {
    scale = Math.max(.15, Math.min(2.5, value));
    svg.style.width = Number(svg.dataset.width) * scale + 'px'; svg.style.height = Number(svg.dataset.height) * scale + 'px';
    $('#map-scale').textContent = 'Масштаб ' + Math.round(scale * 100) + '%';
  }
  $('#zoom-in').addEventListener('click', function () { zoom(scale * 1.2); });
  $('#zoom-out').addEventListener('click', function () { zoom(scale / 1.2); });
  $('#zoom-fit').addEventListener('click', function () { zoom(Math.min(viewport.clientWidth / Number(svg.dataset.width), viewport.clientHeight / Number(svg.dataset.height))); viewport.scrollTo(0, 0); });
  $('#zoom-reset').addEventListener('click', function () { zoom(1); });
  viewport.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoom(scale * (e.deltaY < 0 ? 1.08 : .92)); } }, { passive: false });
  var drag;
  viewport.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.target.closest('a')) return; drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop }; viewport.setPointerCapture(e.pointerId); viewport.classList.add('dragging'); });
  viewport.addEventListener('pointermove', function (e) { if (!drag) return; viewport.scrollLeft = drag.left - e.clientX + drag.x; viewport.scrollTop = drag.top - e.clientY + drag.y; });
  ['pointerup', 'pointercancel'].forEach(function (event) { viewport.addEventListener(event, function () { drag = null; viewport.classList.remove('dragging'); }); });
  var touches = new Map(), pinch;
  viewport.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') touches.set(e.pointerId, { x:e.clientX, y:e.clientY }); if (touches.size === 2) { var p=Array.from(touches.values()); pinch={ distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),scale:scale }; } });
  viewport.addEventListener('pointermove', function (e) { if (!touches.has(e.pointerId)) return; touches.set(e.pointerId,{x:e.clientX,y:e.clientY}); if(touches.size===2&&pinch){ var p=Array.from(touches.values()); zoom(pinch.scale*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/pinch.distance); } });
  ['pointerup','pointercancel'].forEach(function(event){viewport.addEventListener(event,function(e){touches.delete(e.pointerId);pinch=null;});});
  function filter() {
    var status = $('#status-filter').value, query = $('#map-query').value.trim().toLocaleLowerCase();
    $$('.node').forEach(function (node) { node.classList.toggle('dimmed', !!((status && node.dataset.status !== status) || (query && !node.textContent.toLocaleLowerCase().includes(query)))); });
    $$('.edge').forEach(function (edge) { edge.classList.remove('dimmed'); });
  }
  $('#status-filter').addEventListener('change', filter); $('#map-query').addEventListener('input', filter);
  function highlight(id) {
    var related = new Set([id]);
    function walk(start, reverse, visited) {
      if (visited.has(start)) return; visited.add(start);
      data.stages.forEach(function (s) { var targets = reverse ? (s.dependencies.includes(start) ? [s.id] : []) : (s.id === start ? s.dependencies : []); targets.forEach(function (target) { related.add(target); walk(target, reverse, visited); }); });
    }
    walk(id, false, new Set()); walk(id, true, new Set());
    $$('.node').forEach(function (n) { n.classList.toggle('dimmed', !related.has(n.dataset.stage)); });
    $$('.edge').forEach(function (e) { e.classList.toggle('dimmed', !(related.has(e.dataset.from) && related.has(e.dataset.to))); });
  }
  $$('.node').forEach(function (node) { node.addEventListener('mouseenter', function () { highlight(node.dataset.stage); }); node.addEventListener('focus', function () { highlight(node.dataset.stage); }); node.addEventListener('mouseleave', filter); node.addEventListener('blur', filter); });
})();
