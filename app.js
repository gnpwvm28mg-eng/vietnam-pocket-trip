(function () {
  "use strict";
  var data = window.TRIP_DATA;
  var standalone = !window.xhs;
  var state = { day: 0, autoDay: true, variant: 0, view: "plan", kind: "all", topic: "all", window: "month", query: "", area: "all", weather: "clear", searchLimit: 12, discoverSourceLimit: 6, searchType: "all", sourceLimit: 12 };
  var trip = { start: "2026-10-01", note: "10/1 08:50 起飞，10:40 抵达新山一机场。\n10/3 14:50 SGN → 15:50 PQC。\n10/6 18:55 PQC → 20:00 SGN。\n10/1–3 Signature Hai Ba Trung；10/3–6 Meliá Vinpearl Phu Quoc。", day7: "", day7Stay: "", day7Flight: "", favorites: {}, done: {}, branches: {}, notes: {} };
  var sources = {}, places = {}, placeList = [], nativeStore = null, discoverySearch = null, composing = false, journeyUI = null, toolsUI = null;
  var key = "vietnam-pocket-v1";
  function $ (id) { return document.getElementById(id); }
  function esc (v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
  function low (v) { return String(v || "").toLowerCase().replace(/đ/g, "d"); }
  function toast (s) { $("toast").textContent = s; $("toast").classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(function () { $("toast").classList.remove("show"); }, 2300); }
  function area (v) { return /富国|phu quoc|pqc|北部|南部|中部/i.test(v || "") ? "富国岛" : "胡志明市"; }
  function kind (s) { if (/洗头|按摩|spa|养生/.test((s.kind || '') + ' ' + (s.name || ''))) return "洗头按摩"; if (/攀岩|抱石/.test(s.kind || "")) return "攀岩"; if (/衣服|购物/.test(s.kind || "")) return "衣服"; if (/吃喝|餐|咖啡/.test(s.kind || "")) return "吃喝"; if (/住宿|休整/.test(s.kind || "")) return "住宿"; if (/航班|交通|准备/.test(s.kind || "")) return "交通"; return "玩乐"; }
  function day () { return data.days[state.day] || data.days[0]; }
  function variant () { return day().variants[state.variant] || day().variants[0] || { stops: [] }; }
  function place (s, di, vi, si, dayArea) { var id = s.id || "d" + di + "v" + vi + "s" + si; s._key = id; if (!places[id]) { places[id] = { key: id, name: s.name, kind: kind(s), area: s.city || dayArea, note: [s.note, s.order, s.best, s.watch].filter(Boolean).join("；"), sources: s.sources || [], raw: s, day: di, variant: vi, index: si, type: "stop" }; placeList.push(places[id]); } return places[id]; }
  function index () { data.sources.forEach(function (s) { sources[s.id] = s; }); data.days.forEach(function (d, di) { var dayArea = /富国/.test(d.place || '') ? '富国岛' : '胡志明市'; d.variants.forEach(function (v, vi) { v.stops.forEach(function (s, si) { place(s, di, vi, si, dayArea); }); }); }); (data.food || []).forEach(function (s, i) { var p = { key: "food" + i, name: s.name, kind: "吃喝", area: s.city || (/富国岛南部|Meliá|Grand World|Phú Quốc|富国/.test(s.area || '') ? '富国岛' : '胡志明市'), note: [s.order, s.note, s.why].filter(Boolean).join("；"), sources: s.sources || [], raw: s, type: "food" }; places[p.key] = p; placeList.push(p); }); (data.hotels || []).forEach(function (s, i) { var p = { key: "hotel" + i, name: s.name, kind: "住宿", area: s.city || area([s.name, s.area].join(" ")), note: [s.best, s.watch, s.address].filter(Boolean).join("；"), sources: s.sources || [], raw: s, type: "hotel" }; places[p.key] = p; placeList.push(p); }); placeList.forEach(function (p) { p.search = low([p.name, p.area, p.kind, p.note, p.raw.query, p.raw.travel, p.raw.rain].join(" ")); }); }
  function dateLabel (i) { var a = trip.start.split("-"); if (a.length !== 3) return "D" + (i + 1); var d = new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]) + i); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function indexDiscoveries () {
    (data.discoveries || []).forEach(function (s, i) {
      var p = { key: s.id || 'discovery' + i, name: s.name, kind: kind(s), area: s.city || area(s.area), note: s.note || s.order || '', sources: s.sources || [], raw: s, type: 'discovery' };
      places[p.key] = p; placeList.push(p);
    });
  }
  function monthWindow () {
    var w = data.meta.monthWindow;
    if (w && typeof w === 'object') return [w.from || w.start, w.to || w.end].filter(Boolean).join(' — ');
    return typeof w === 'string' ? w : data.meta.fromTo || '2026-08-29 — 2026-09-29';
  }
  function monthSources (p) { return (p.sources || []).map(function (id) { return sources[id]; }).filter(function (s) { return s && s.inMonthWindow === true && (!$('published-only').checked || s.dateType === 'published'); }); }
  function sourceDate (s) { return (s.date || '日期待核验') + (s.dateType === 'edited' ? ' 更新' : s.dateType === 'published' ? ' 发布' : ''); }
  function vietnamDate () { var parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); var values = {}; parts.forEach(function (p) { values[p.type] = p.value; }); return values.year + "-" + values.month + "-" + values.day; }
  function tripDayIndex () { var start = trip.start.split("-").map(Number); var now = vietnamDate().split("-").map(Number); if (start.length !== 3 || now.length !== 3 || !start[0] || !now[0]) return 0; var a = Date.UTC(start[0], start[1] - 1, start[2]); var b = Date.UTC(now[0], now[1] - 1, now[2]); return Math.max(0, Math.min(6, Math.floor((b - a) / 86400000))); }
  function favorite (p) { return '<button class="favorite' + (trip.favorites[p.key] ? ' active' : '') + '" data-favorite="' + esc(p.key) + '" aria-label="收藏" aria-pressed="' + !!trip.favorites[p.key] + '">' + (trip.favorites[p.key] ? '♥' : '♡') + '</button>'; }
  function card (p, timeline) { var s = p.raw; return '<article class="place-card' + (trip.done[p.key] ? ' completed' : '') + '"><div class="card-top">' + (timeline ? '<span class="stop-number">' + (p.index + 1) + '</span>' : '') + '<div class="card-main"><div class="meta">' + esc(timeline ? (s.time || '') + (s.duration ? ' · ' + s.duration : '') : p.area + ' · ' + p.kind) + '</div><h3><button class="title-button" data-place="' + esc(p.key) + '">' + esc(p.name) + '</button></h3></div>' + favorite(p) + '</div><p class="card-note">' + esc(state.weather === "rain" && s.rain ? s.rain : p.note) + '</p>' + (s.travel ? '<p class="meta">' + esc(s.travel) + '</p>' : '') + '<div class="card-actions"><button class="btn-subtle" data-place="' + esc(p.key) + '">详情' + (p.sources.length ? ' · ' + p.sources.length + ' 篇参考' : '') + '</button>' + (timeline ? '<button class="done' + (trip.done[p.key] ? ' active' : '') + '" data-done="' + esc(p.key) + '">' + (trip.done[p.key] ? '✓ 已完成' : '○ 标记完成') + '</button>' : '') + (!timeline ? '<button class="btn" data-journey="add" data-key="' + esc(p.key) + '">＋ 安排到某天</button>' : '') + '</div></article>'; }
  function renderBasePlan () { var d = day(), v = variant(); $("day-tabs").innerHTML = data.days.map(function (x, i) { return '<button class="day-tab' + (i === state.day ? ' active' : '') + '" data-day="' + i + '"><small>DAY ' + (i + 1) + '</small><strong>' + dateLabel(i) + '</strong><span>' + (i === 6 ? '收尾' : area(x.place)) + '</span></button>'; }).join(""); $("today-day").textContent = state.day === tripDayIndex() ? '今天' : '回到今天'; $("day-title").textContent = d.title; $("day-summary").textContent = state.day === 6 ? ([trip.day7Stay, trip.day7Flight].filter(Boolean).join(' · ') || '10月6日晚住宿、10月7日返程和自由安排，集中在“我的”里补齐。') : d.summary; $("route-toggle").innerHTML = d.variants.map(function (x, i) { return '<button class="chip' + (i === state.variant ? ' active' : '') + '" data-variant="' + i + '">' + esc(x.label) + '</button>'; }).join(""); $("route-meta").textContent = (d.rule ? d.rule + ' · ' : '') + (v.distance || '第七天待补'); var points = v.stops.filter(function (s) { return s.name; }); var pointList = points.length ? '<div class="map-points">' + points.map(function (s, pi) { return '<button type="button" class="map-point-row" data-place="' + esc(s._key) + '"><b>' + (pi + 1) + '</b><span>' + esc(s.name) + '</span></button>'; }).join('') + '</div>' : ''; $("route-map").innerHTML = v.mapSvg ? v.mapSvg + pointList : '<div class="empty"><strong>第七天收尾</strong><p>补充住宿和返程后，这一天就能直接照着走。</p></div>'; if (state.day === 6) { var day7Items = [{ label: '10/6 晚住宿 / 地址', value: trip.day7Stay }, { label: '10/7 返程航班', value: trip.day7Flight }, { label: '10/7 自由安排', value: trip.day7 }]; var filled = day7Items.filter(function (x) { return x.value; }).length; $("now-card").innerHTML = '<div class="now-kicker">返程收尾</div><strong>' + (filled === 3 ? '三项信息已补齐' : '还有 ' + (3 - filled) + ' 项待补') + '</strong><p>把晚住宿、返程航班和最后一天安排填好，出发时就不用临时翻聊天记录。</p><button class="btn btn-primary" data-view="mine">去“我的”填写</button>'; $("plan-progress").textContent = filled + ' / 3 已补齐'; $("day-stops").innerHTML = day7Items.map(function (x, i) { return '<article class="place-card day7-item' + (x.value ? ' completed' : '') + '"><div class="card-top"><span class="stop-number">' + (i + 1) + '</span><div class="card-main"><div class="meta">收尾清单</div><h3>' + esc(x.label) + '</h3></div></div><p class="card-note">' + esc(x.value || '待在“我的”里补充') + '</p></article>'; }).join(''); $("day-note").value = trip.day7 || ''; return; } var next = v.stops.filter(function (s) { return !trip.done[s._key]; })[0]; $("now-card").innerHTML = next ? '<div class="now-kicker">' + (state.day === tripDayIndex() ? '今天这一步' : '这一天的第一步') + '</div><strong>' + esc(next.time + ' · ' + next.name) + '</strong><p>' + esc(next.travel || next.note || '点开详情查看这一站。') + '</p><button class="btn btn-primary" data-place="' + esc(next._key) + '">打开这一步</button>' : '<div class="now-kicker">今天完成</div><strong>这条路线已经走完啦</strong><p>可以去发现页找一顿晚餐，或者给明天留点体力。</p>'; var done = v.stops.filter(function (s) { return trip.done[s._key]; }).length; $("plan-progress").textContent = v.stops.length ? done + ' / ' + v.stops.length + ' 已完成' : '待补录'; $("day-stops").innerHTML = v.stops.map(function (s) { return card(places[s._key], true); }).join(""); $("day-note").value = trip.notes[d.id] || ''; }
  function renderPlan () {
    renderBasePlan();
    if (journeyUI) journeyUI.renderPlan();
    else if (window.PocketMaps) window.PocketMaps.render($('route-map'), {items:variant().stops, offlineSvg:variant().mapSvg, city:area(day().place)});
    renderDepartureChecklist();
  }
  function renderDepartureChecklist () {
    var host=$('departure-checklist'); if(!host)return;
    var today=vietnamDate(),start=trip.start||'2026-10-01',days=Math.ceil((Date.parse(start+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    if(days>7||days<0){host.innerHTML='';return;}
    var prefs=trip.prefs||{},items=[
      {id:'visa',title:'签证与入境资格',detail:'确认签证 / 电子签覆盖 SGN 入境口岸，并与护照信息一致。',done:!!prefs.preflightVisa},
      {id:'terminal',title:'航班与航站楼',detail:'核对航空公司通知、航班状态及当日航站楼。',done:!!prefs.preflightTerminal},
      {id:'transfer',title:'酒店接送与权益',detail:'确认 Meliá 接送是否含在订单内、集合点与酒店权益。',done:!!prefs.preflightTransfer},
      {id:'weather',title:'天气与海上项目',detail:'查看阵雨 / 风浪；决定 10/4 与 10/5 是否调换。',done:!!prefs.preflightWeather}
    ];
    var done=items.filter(function(item){return item.done;}).length;
    host.innerHTML='<details class="departure-checklist"'+(done<items.length?' open':'')+'><summary><span>出发前核对</span><small>'+(days===0?'今天出发':days>0?'还有 '+days+' 天':'行程中')+' · '+done+'/'+items.length+' 完成</small></summary><div class="departure-check-items">'+items.map(function(item){return '<label><input type="checkbox" data-preflight="'+item.id+'" '+(item.done?'checked':'')+'><span><strong>'+item.title+'</strong><small>'+item.detail+'</small></span></label>';}).join('')+'</div></details>';
  }
  function unique (arr) { var seen = {}; return arr.filter(function (p) { var k = low(p.name).replace(/早餐|午餐|晚餐|外观/g, ''); if (seen[k]) return false; seen[k] = 1; return true; }); }
  function recommend () { var a = state.area === 'all' ? area(day().place) : state.area; var list = unique(placeList.filter(function (p) { return p.area === a && p.kind !== '交通'; })); list.forEach(function (p) { var n = p.day === state.day ? 10 : 0; if (p.kind === '吃喝') n += 3; if (p.sources.length > 1) n += 2; if (trip.done[p.key]) n -= 20; if (state.weather === 'rain') { if (p.raw.indoor || /室内|博物馆|咖啡|河粉|美术馆/.test(p.name + p.note)) n += 15; if (/缆车|码头|沙滩|跳岛|动物园|Safari|步行街/.test(p.name)) n -= 20; } p._score = n; }); list.sort(function (x, y) { return y._score - x._score; }); $("recommend-title").textContent = (state.weather === 'rain' ? '雨天慢游' : '顺路推荐') + ' · ' + a; $("recommendations").innerHTML = list.slice(0, 2).map(function (p) { return card(p, false); }).join(""); }
  function mapUrl (p) {
    if (p.raw.mapsUrl && /^https:\/\//.test(p.raw.mapsUrl)) return p.raw.mapsUrl;
    if (p.raw.lat && p.raw.lon) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.raw.lat + ',' + p.raw.lon);
    var query = p.raw.query || [p.name, p.raw.address].filter(Boolean).join(' ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query + ' ' + p.area + ' Vietnam');
  }
  function discoveryCard (p) {
    places[p.key] = p;
    var html = card(p, false);
    var monthNotes = monthSources(p).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var verification = p.raw.venueVerification || {}, isSpa = p.kind === '洗头按摩';
    var extra = (isSpa ? '<p class="discovery-evidence"><span class="tag">帖子体验</span>' + (verification.status === 'verified' ? '<span class="tag">门店地址已核验</span>' : '<span class="tag muted">地址待复核</span>') + (verification.price ? '<span class="tag muted">帖子当次套餐</span>' : '') + '</p>' : '') + (monthNotes.length ? '<p class="discovery-evidence"><span class="tag">近1个月</span>' + esc(sourceDate(monthNotes[0])) + ' · ' + monthNotes.length + ' 篇直接参考</p>' : '') + (p.raw.visit ? '<p class="visit-note"><span>怎么安排</span>' + esc(p.raw.visit) + '</p>' : '');
    var routePlace = (p.aliasKeys || [p.key]).map(function (key) { return places[key]; }).filter(function (item) { return item && item.type === 'stop'; })[0];
    var routeButton = routePlace ? '<button class="btn-subtle" data-route="' + esc(routePlace.key) + '">查看当天安排</button>' : '';
    var mapButton = p.raw.query || p.raw.mapsUrl || (p.raw.lat && p.raw.lon) ? webLink(mapUrl(p), 'Google Maps', 'btn') : '';
    return html.replace('<div class="card-actions">', extra + '<div class="card-actions">' + mapButton + routeButton);
  }
  function resetSearchFilters () {
    state.kind = 'all'; state.topic = 'all'; state.area = 'all'; $('area').value = 'all';
  }
  function searchChanged () {
    state.query = $('query').value;
    state.searchLimit = state.query.trim() ? 4 : 12;
    state.discoverSourceLimit = state.query.trim() ? 3 : 6;
    state.searchType = 'all';
    renderSearch();
  }
  function renderSearch () {
    if (!discoverySearch) discoverySearch = window.PocketSearch.create(placeList, data.sources);
    var query = state.query.trim(), filtered = state.kind !== 'all' || state.area !== 'all' || state.topic !== 'all';
    var results = discoverySearch.search(query, { area: state.area, kind: state.kind, topic: state.topic, window: state.window, publishedOnly: !!$('published-only').checked });
    var list = results.places, notes = results.sources;
    var filterLabel = [state.area !== 'all' ? state.area : '', state.kind !== 'all' ? state.kind : '', state.topic !== 'all' ? state.topic : ''].filter(Boolean).join(' · ');
    $('result-count').textContent = (query ? '“' + query + '” · ' : '') + list.length + ' 个地点 · ' + notes.length + ' 篇笔记' + (filterLabel ? '（' + filterLabel + '）' : '');
    $('month-window').textContent = $('published-only').checked ? '仅近1个月新发布：' + monthWindow() + '。排除只显示编辑日期的旧帖；地点须有关联的新发布原帖。' : state.window === 'month' ? '本次近1个月：' + monthWindow() + '。按可见发布 / 更新日期收录，更新帖会单独标注；地点须有对应近期原帖。' : '全部已收录：包含历史资料；每篇标注日期，请结合出发前信息判断。';
    $('discover-notes-heading').textContent = '相关笔记 · ' + ($('published-only').checked ? '近1个月新发布' : state.window === 'month' ? '近1个月' : '全部已收录');
    $('clear-query').hidden = !state.query;
    $('reset-filters').hidden = !filtered;
    $('recommend-wrap').hidden = !!query || filtered || state.window === 'month';
    if (!query && !filtered && state.window === 'all') recommend();
    Array.prototype.forEach.call(document.querySelectorAll('[data-topic]'), function (button) {
      var selected = button.dataset.topic === state.topic;
      button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-window]'), function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.window === state.window));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-kind]'), function (button) {
      var selected = button.dataset.kind === state.kind;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('result-types').hidden = !list.length && !notes.length;
    Array.prototype.forEach.call(document.querySelectorAll('[data-search-type]'), function (button) {
      var type = button.dataset.searchType;
      button.setAttribute('aria-pressed', String(type === state.searchType));
      button.textContent = type === 'all' ? '全部' : type === 'places' ? '地点 ' + list.length : '笔记 ' + notes.length;
    });
    $('places-heading').textContent = query ? '匹配的地点' : '地点清单';
    $('place-count').textContent = list.length + ' 个';
    $('place-results-section').hidden = state.searchType === 'notes';
    $('search-results').innerHTML = list.slice(0, state.searchLimit).map(discoveryCard).join('') || '<div class="empty"><strong>' + (state.window === 'month' ? '暂无符合本次近1个月条件的地点' : '没有匹配的地点') + '</strong><p>' + (notes.length ? '下方有相关笔记；暂未从中提取出可直接安排的地点。' : '没有用其他类别补位。可切换“全部已收录”，或继续外部搜索。') + '</p></div>';
    $('more-results').hidden = list.length <= state.searchLimit;
    $('more-results').textContent = '再看 ' + Math.min(12, Math.max(0, list.length - state.searchLimit)) + ' 个地点';
    $('note-results-section').hidden = state.searchType === 'places';
    $('discover-source-count').textContent = notes.length + ' 篇';
    $('discover-source-results').innerHTML = notes.slice(0, state.discoverSourceLimit).map(sourceCard).join('') || '<div class="empty">' + (state.window === 'month' ? '本次近1个月范围内，尚未收录符合筛选的帖子。' : '已收录笔记中暂无匹配。') + '可调整筛选或继续外部搜索。</div>';
    $('more-discover-sources').hidden = notes.length <= state.discoverSourceLimit;
    var externalTerm = query || (state.topic !== 'all' ? state.topic : state.kind !== 'all' ? state.kind : '');
    $('search-external').hidden = !externalTerm || !standalone;
    if (externalTerm && standalone) {
      var hasCity = /胡志明|西贡|富国|saigon|ho chi minh|phu quoc/i.test(window.PocketSearch.normalize(externalTerm));
      var resultCities = list.map(function (p) { return p.area; }).concat(notes.map(function (s) { return s.region; })).filter(Boolean);
      var oneCity = resultCities.length && resultCities.every(function (city) { return city === resultCities[0]; }) ? resultCities[0] : '';
      var city = hasCity ? '' : (state.area === 'all' ? oneCity || area(day().place) : state.area);
      var externalQuery = [city, externalTerm].filter(Boolean).join(' ');
      $('search-external').innerHTML = '<p>继续找' + (city ? ' · ' + esc(city) : '') + ' · 外部实时搜索</p><div class="card-actions">' + webLink('https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(externalQuery), '去小红书搜', 'btn') + webLink('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(externalQuery + ' Vietnam'), '去 Google Maps 搜', 'btn') + '</div>';
    } else $('search-external').innerHTML = '';
  }
  function sourceCard (s) {
    var label = s.inMonthWindow ? '近1个月' : s.inRecentWindow ? '近3个月' : '历史备查';
    return '<article class="source-card"><div class="meta">' + esc(s.region) + ' · ' + esc(sourceDate(s)) + '<span class="tag' + (s.inMonthWindow ? '' : ' muted') + '">' + label + '</span></div><h3><button class="title-button" data-source="' + esc(s.id) + '">' + esc(s.title) + '</button></h3><p class="meta">' + esc(s.author) + ' · ' + esc(s.trust) + '</p><p class="card-note">' + esc(s.summary) + '</p><div class="card-actions">' + webLink(s.url, '打开原帖', 'btn-subtle') + webLink(s.searchUrl, '站内搜索', 'btn-subtle') + '<button class="btn-subtle" data-source="' + esc(s.id) + '">看核验摘记</button></div></article>';
  }
  function renderSources () {
    if (!discoverySearch) discoverySearch = window.PocketSearch.create(placeList, data.sources);
    var q = $('source-query').value.trim(), r = $('source-region').value, st = $('source-status').value;
    var list = discoverySearch.search(q, { area: r, topic: $('source-topic').value, window: st === 'used' ? 'all' : st === 'published' ? 'month' : st, publishedOnly: st === 'published' }).sources;
    if (st === 'used') list = list.filter(function (s) { return s.used; });
    $('source-count').textContent = list.length + ' 篇';
    $('source-results').innerHTML = list.slice(0, state.sourceLimit).map(sourceCard).join('') || '<div class="empty">' + (st === 'month' ? '本次近1个月内，尚未收录该主题的匹配帖子。' : '没有找到匹配帖子。') + '可调整主题或日期范围。</div>';
    $('more-sources').hidden = list.length <= state.sourceLimit;
    $('source-window').textContent = st === 'published' ? '只看新发布：' + monthWindow() + '，不含只核验到编辑日期的帖子。' : st === 'month' ? '本次近1个月：' + monthWindow() : st === 'recent' ? '近3个月资料，逐篇保留原帖日期。' : '包含历史资料，逐篇保留原帖日期。';
    $('source-method').textContent = (data.meta.method || '帖子均为离线摘记，不能代表平台全部内容；工具不提供实时价格、营业或天气。') + ' 本次近1个月窗口：' + monthWindow() + '。更新日期不会自动改写为今天。';
  }
  function section (h, b) { return b ? '<section class="detail-section"><h3>' + esc(h) + '</h3><p>' + esc(b) + '</p></section>' : ''; }
  function webLink (url, label, cls) { return standalone && url ? '<a class="' + (cls || 'btn') + '" href="' + esc(url) + '">' + esc(label) + ' ↗</a>' : ''; }
  function open (html) { $("sheet-content").innerHTML = html; $("sheet").hidden = false; $("sheet").classList.remove('hidden'); document.body.classList.add('modal-open'); }
  function close () { $("sheet").hidden = true; $("sheet").classList.add('hidden'); document.body.classList.remove('modal-open'); }
  function showPlace (id) {
    var p = places[id]; if (!p) return;
    var s = p.raw;
    var coords = s.lat && s.lon ? Number(s.lat).toFixed(5) + ', ' + Number(s.lon).toFixed(5) : '';
    var query = s.query || [s.name, s.address].filter(Boolean).join(' ');
    var orderLabel = p.kind === '衣服' ? '选购建议' : p.kind === '攀岩' ? '体验建议' : p.kind === '洗头按摩' ? '体验与避雷' : '点单建议';
    var recentSources = p.sources.map(function (x) { return sources[x]; }).filter(Boolean).sort(function (a, b) { return Number(!!b.inMonthWindow) - Number(!!a.inMonthWindow) || String(b.date).localeCompare(String(a.date)); });
    var verification = s.venueVerification, verifyHTML = verification ? '<section class="detail-section"><h3>信息状态</h3><p>'+esc(verification.status==='partial'?'近期体验线索；地址与具体分店仍需复核':verification.status==='pending'?'小红书体验线索；店址与营业状态待核验':verification.status==='verified'?'商户地址已核对；帖子体验、营业和价格仍以当日为准':'信息待复核')+'</p></section>' : '';
    open('<div class="detail-eyebrow">' + esc(p.area + ' · ' + p.kind) + '</div><h2>' + esc(p.name) + '</h2><p class="detail-lead">' + esc(p.note) + '</p>' + section('怎么安排 / 从酒店出发', s.visit) + section('时间 / 移动', [s.time, s.duration, s.travel].filter(Boolean).join(' · ')) + section(orderLabel, s.order) + section('地址 / 定位线索', s.address) + section('地图检索名', query) + section('坐标（备用）', coords) + section('住宿信息', s.stay) + section('雨天替代', s.rain) + section('注意', s.watch) + verifyHTML + '<div class="card-actions">' + (query ? webLink(mapUrl(p), '在 Google Maps 搜索', 'btn btn-primary') : '') + (p.type === 'stop' ? '<button class="btn" data-route="' + esc(id) + '">回到当天路线</button>' : '') + '</div>' + (standalone ? '' : '<p class="notice">网页版本可直接打开外链；小红书小工具版受沙箱限制，只显示离线地图与检索名。</p>') + '<section class="detail-section"><h3>相关原帖 · 日期逐篇标注</h3>' + recentSources.map(sourceCard).join('') + (!recentSources.length ? '<p>这条是路线组织建议，暂无直接挂靠帖子。</p>' : '') + '</section>');
    if (journeyUI) journeyUI.enrichDetail(p);
  }
  function showSource (id) { var s = sources[id]; if (!s) return; open('<div class="detail-eyebrow">小红书原帖线索 · ' + (s.inMonthWindow ? '近1个月' : s.inRecentWindow ? '近3个月' : '历史备查') + '</div><h2>' + esc(s.title) + '</h2><p class="meta">' + esc(s.author) + ' · ' + esc(sourceDate(s)) + '</p>' + section('核验摘记', s.summary) + section('日期依据', s.dateEvidence) + section('参考类型', s.trust) + '<div class="source-keywords"><small>小红书站内搜索词</small><strong>' + esc(s.author + ' ' + s.title) + '</strong></div><div class="card-actions">' + webLink(s.url, '打开原帖', 'btn btn-primary') + webLink(s.searchUrl, '站内搜索', 'btn') + '<button class="btn" data-source-filter="' + esc(s.author) + '">筛选此作者</button></div>' + (standalone ? '<p class="notice">原帖链接已改为 /explore/ 详情地址；若帖子被删、权限变化或 token 过期，点“站内搜索”仍可按作者和标题找回。</p>' : '<p class="notice">小红书小工具版受沙箱限制，不显示外链；独立网页可打开原帖或站内搜索。</p>')); }
  function renderBaseMine () { $("trip-start").value = trip.start; $("trip-note").value = trip.note; $("day7-note").value = trip.day7 || ''; $("day7-stay").value = trip.day7Stay || ''; $("day7-flight").value = trip.day7Flight || ''; var favs = placeList.filter(function (p) { return trip.favorites[p.key]; }); $("saved-list").innerHTML = favs.map(function (p) { return card(p, false); }).join('') || '<div class="empty">把心动的餐厅和景点收藏在这里。</div>'; $("essentials-list").innerHTML = (data.essentials || []).map(function (s) { return '<div class="essential-row"><strong>' + esc(s.label || '') + '</strong><p>' + esc(typeof s.value === 'string' ? s.value : (s.note || '')) + '</p></div>'; }).join('') + (data.alerts || []).map(function (s) { return '<p class="notice">' + esc(typeof s === 'string' ? s : s.value || s.note || '') + '</p>'; }).join(''); }
  function renderMine () { renderBaseMine(); if (toolsUI) toolsUI.renderMine(); }
  function switchView (v) { state.view = v; document.body.classList.toggle('is-discover', v === 'discover'); ['plan', 'discover', 'sources', 'mine'].forEach(function (x) { $(x + '-view').classList.toggle('hidden', x !== v); }); Array.prototype.forEach.call(document.querySelectorAll('[data-view]'), function (b) { b.classList.toggle('active', b.getAttribute('data-view') === v); }); if (v === 'plan') renderPlan(); if (v === 'discover') renderSearch(); if (v === 'sources') renderSources(); if (v === 'mine') renderMine(); window.scrollTo(0, 0); }
  function bindInstall () { var button = $("install-app"); if (!button || !standalone) return; button.addEventListener("click", function () { if (window.PocketTripPWA && window.PocketTripPWA.install) { window.PocketTripPWA.install().then(function (result) { if (result && result.outcome === "accepted") toast("已添加到手机主屏幕"); }); } else { toast("请在浏览器菜单中选择“添加到主屏幕”"); } }); }
  async function save (message) { try { var raw = JSON.stringify(trip); if (nativeStore) await nativeStore.setStorage({ key: key, data: raw }); else window.localStorage.setItem(key, raw); $("save-status").textContent = '已保存到此设备'; if (message) toast(message); return true; } catch (e) { $("save-status").textContent = '尚未保存，请导出备份'; toast('暂时无法保存，本次修改仍可使用，请导出备份'); return false; } }
  async function storage () { var api = window.xhs && window.xhs.miniTool, launch = window.xhs && window.xhs.launchOptions, build = Number(launch && launch.miniToolEnv && launch.miniToolEnv.buildVersion) || 0; if (!build && api && api.getLaunchOptions) { try { launch = await api.getLaunchOptions(); build = Number(launch && launch.miniToolEnv && launch.miniToolEnv.buildVersion) || 0; } catch (e) {} } if (Math.floor(build / 1000) >= 9460 && api && api.getStorage && api.setStorage) nativeStore = api; try { var raw = nativeStore ? (await nativeStore.getStorage({ key: key })).data : window.localStorage.getItem(key); var saved = raw ? JSON.parse(raw) : null; if (saved) trip = window.PocketPlanner.normalizeTrip(saved, trip); if (trip.prefs) { state.weather = trip.prefs.rain ? 'rain' : 'clear'; $('weather').value = state.weather; $('published-only').checked = !!trip.prefs.publishedOnly; } if (state.autoDay) { state.day = tripDayIndex(); state.variant = trip.branches[day().id] || 0; } $("save-status").textContent = nativeStore ? '保存在小工具缓存中' : '兼容存储模式'; } catch (e) { $("save-status").textContent = '无法读取旧记录，本次仍可使用'; } renderPlan(); renderMine(); }
  function click (e) {
    var b = e.target.closest('button');
    if (b) {
      if (b.dataset.view) switchView(b.dataset.view);
      else if (b.dataset.day !== undefined) { state.day = Number(b.dataset.day); state.variant = trip.branches[day().id] || 0; state.autoDay = false; renderPlan(); }
      else if (b.dataset.variant !== undefined) { state.variant = Number(b.dataset.variant); trip.branches[day().id] = state.variant; renderPlan(); save(); }
      else if (b.dataset.place) showPlace(b.dataset.place);
      else if (b.dataset.source) showSource(b.dataset.source);
      else if (b.dataset.sourceFilter) { close(); $('source-query').value = b.dataset.sourceFilter; $('source-status').value = 'all'; $('source-topic').value = 'all'; $('source-region').value = 'all'; state.sourceLimit = 12; switchView('sources'); }
      else if (b.dataset.favorite) { trip.favorites[b.dataset.favorite] = !trip.favorites[b.dataset.favorite]; renderMine(); renderSearch(); save(trip.favorites[b.dataset.favorite] ? '已加入收藏' : '已取消收藏'); }
      else if (b.dataset.done) { trip.done[b.dataset.done] = !trip.done[b.dataset.done]; renderPlan(); save(); }
      else if (b.dataset.route) { var p = places[b.dataset.route]; state.day = p.day; state.variant = p.variant; state.autoDay = false; close(); switchView('plan'); }
      else if (b.dataset.kind) { state.kind = b.dataset.kind; state.topic = 'all'; searchChanged(); }
      else if (b.dataset.topic) { state.topic = state.topic === b.dataset.topic ? 'all' : b.dataset.topic; state.kind = 'all'; $('query').value = ''; searchChanged(); }
      else if (b.dataset.window) { state.window = b.dataset.window; searchChanged(); }
      else if (b.dataset.query) { resetSearchFilters(); $('query').value = b.dataset.query; searchChanged(); }
      else if (b.dataset.searchType) { state.searchType = b.dataset.searchType; renderSearch(); }
    }
    var mp = e.target.closest('[data-map-index]');
    if (mp) { var s = variant().stops[Number(mp.getAttribute('data-map-index'))]; if (s) showPlace(s._key); }
  }
  function init () {
    index(); indexDiscoveries(); state.day = tripDayIndex();
    trip = window.PocketPlanner.normalizeTrip(trip, {});
    var bridge = {
      data:data, places:places, esc:esc, toast:toast, open:open, close:close, dateLabel:dateLabel, area:area,
      getTrip:function () {return trip;}, getState:function () {return state;}, getDayIndex:function () {return state.day;},
      save:save, tools:function () {return toolsUI;}, switchView:switchView,
      candidates:function () { if (!discoverySearch) discoverySearch = window.PocketSearch.create(placeList, data.sources); return discoverySearch.search('', {window:'month',publishedOnly:!!$('published-only').checked}).places; },
      getDayItems:function (i) {return window.PocketPlanner.getDayItems(data, trip, i, places);},
      selectDay:function (i) {state.day=i;state.variant=trip.branches[day().id]||0;state.autoDay=false;switchView('plan');},
      commit:function (next,message) {trip=window.PocketPlanner.normalizeTrip(next,trip);renderPlan();renderMine();if(state.view==='discover')renderSearch();save(message);},
      replaceTrip:function (next) {trip=window.PocketPlanner.normalizeTrip(next,trip);state.weather=trip.prefs&&trip.prefs.rain?'rain':'clear';$('weather').value=state.weather;$('published-only').checked=!!(trip.prefs&&trip.prefs.publishedOnly);if(state.autoDay)state.day=tripDayIndex();state.variant=trip.branches[day().id]||0;renderPlan();renderMine();if(state.view==='discover')renderSearch();return save('备份已恢复到此设备');}
    };
    toolsUI = window.PocketTools.create(bridge);
    journeyUI = window.PocketJourney.create(bridge);
    var recentCount = data.sources.filter(function (s) { return s.inMonthWindow; }).length;
    $('source-total').textContent = recentCount + ' 篇近1个月笔记';
    document.addEventListener('click', click);
    $('close-sheet').addEventListener('click', close);
    $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) close(); });
    $('query').addEventListener('compositionstart', function () { composing = true; });
    $('query').addEventListener('compositionend', function () { composing = false; searchChanged(); });
    $('query').addEventListener('input', function () { if (!composing) searchChanged(); });
    $('query').addEventListener('search', searchChanged);
    $('discover-search').addEventListener('submit', function (event) {
      event.preventDefault(); if (composing) return;
      searchChanged(); $('query').blur();
      $('search-feedback').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    $('clear-query').addEventListener('click', function () { $('query').value = ''; searchChanged(); $('query').focus(); });
    $('reset-filters').addEventListener('click', function () { resetSearchFilters(); searchChanged(); });
    $('area').addEventListener('change', function () { state.area = this.value; searchChanged(); });
    $('weather').addEventListener('change', function () { state.weather = this.value; trip.prefs=trip.prefs||{};trip.prefs.rain=state.weather==='rain';renderPlan(); if (state.view === 'discover') renderSearch(); save(); });
    $('published-only').addEventListener('change', function () {trip.prefs=trip.prefs||{};trip.prefs.publishedOnly=this.checked;searchChanged();save();});
    $('departure-checklist').addEventListener('change',function(event){var input=event.target.closest('[data-preflight]');if(!input)return;trip.prefs=trip.prefs||{};trip.prefs['preflight'+input.dataset.preflight.charAt(0).toUpperCase()+input.dataset.preflight.slice(1)]=input.checked;renderDepartureChecklist();save('出发前核对已保存');});
    ['source-query', 'source-region', 'source-status', 'source-topic'].forEach(function (id) { $(id).addEventListener(id === 'source-query' ? 'input' : 'change', function () { state.sourceLimit = 12; renderSources(); }); });
    $('more-results').addEventListener('click', function () { state.searchLimit += 12; renderSearch(); });
    $('more-discover-sources').addEventListener('click', function () { state.discoverSourceLimit += 6; renderSearch(); });
    $('more-sources').addEventListener('click', function () { state.sourceLimit += 12; renderSources(); });
    $('today-day').addEventListener('click', function () { state.day = tripDayIndex(); state.variant = trip.branches[day().id] || 0; state.autoDay = true; renderPlan(); toast(state.day === 0 && vietnamDate() < trip.start ? '行程尚未开始，已回到第一天' : '已回到越南当地今天'); });
    $('day-note').addEventListener('change', function () { if (state.day === 6) trip.day7 = this.value; else trip.notes[day().id] = this.value; save('当天备注已保存'); });
    $('save-trip').addEventListener('click', function () {
      trip.start = $('trip-start').value; trip.note = $('trip-note').value; trip.day7 = $('day7-note').value;
      trip.day7Stay = $('day7-stay').value.trim(); trip.day7Flight = $('day7-flight').value.trim();
      if (state.autoDay) state.day = tripDayIndex(); renderPlan(); save('我的安排已保存');
    });
    bindInstall(); renderPlan(); renderMine(); storage();
  }
  init();
}());
