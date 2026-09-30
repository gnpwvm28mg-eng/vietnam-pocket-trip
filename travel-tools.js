(function (root) {
  "use strict";
  var BENEFITS = { breakfast: "早餐", tickets: "乐园 / Safari 门票", airport: "机场接送", shuttle: "园区 / 周边接驳" };
  var BENEFIT_STATUS = { pending: "待确认", confirmed: "订单已确认包含", excluded: "不包含" };
  var RESERVATION_STATUS = { pending: "待联系 / 待确认", confirmed: "已取得确认", cancelled: "已取消" };
  var detachListeners = null;
  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  function fail(message) { throw new Error(message); }
  function record(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function cleanString(value, max, label) { if (typeof value !== "string" || value.length > max) fail((label || "文字") + "格式或长度不正确"); return value; }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var p = value.split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    return p[0] >= 2000 && p[0] <= 2100 && d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] - 1 && d.getUTCDate() === p[2];
  }
  function validTime(value) { return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
  function safeKey(key) { return key !== "__proto__" && key !== "constructor" && key !== "prototype" && key.length <= 150; }
  function guardTree(value, depth, budget) {
    if (depth > 12 || --budget.left < 0) fail("备份结构过大或层级过深");
    if (value && typeof value === "object") Object.keys(value).forEach(function (k) {
      if (!safeKey(k)) fail("备份包含不安全字段");
      guardTree(value[k], depth + 1, budget);
    });
  }
  // Plain dong values accept correctly grouped thousands only. Decimal amounts
  // are supported with the explicit k suffix, never guessed from 200.000.
  function parseVnd(input) {
    var text = String(input == null ? "" : input).trim().replace(/\s+/g, "").replace(/(?:vnd|đ|₫)$/i, "");
    if (!text) return null;
    var number;
    if (/^\d+(?:[.,]\d{1,3})?k$/i.test(text)) number = Number(text.slice(0, -1).replace(",", ".")) * 1000;
    else if (/^\d+$/.test(text)) number = Number(text);
    else if (/^\d{1,3}(?:,\d{3})+$/.test(text) || /^\d{1,3}(?:\.\d{3})+$/.test(text)) number = Number(text.replace(/[,.]/g, ""));
    else return null;
    return Number.isSafeInteger(number) && number >= 0 && number <= 100000000000 ? number : null;
  }
  function safeReference(value) {
    value = cleanString(value, 1000, "预约凭证");
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) fail("凭证链接仅支持 http / https");
    return value;
  }
  function dictionary(value, mapper, label, max) {
    if (!record(value) || Object.keys(value).length > (max || 2000)) fail(label + "格式不正确");
    var result = {};
    Object.keys(value).forEach(function (key) { if (!safeKey(key) || !key) fail(label + "包含无效键"); result[key] = mapper(value[key]); });
    return result;
  }
  function sanitizeBackup(input) {
    if (typeof input === "string") { if (input.length > 2000000) fail("备份文件请小于 2 MB"); try { input = JSON.parse(input); } catch (e) { fail("不是有效的 JSON 备份"); } }
    if (!record(input)) fail("备份应为一个对象");
    guardTree(input, 0, { left: 18000 });
    var source = own(input, "trip") ? input.trip : input;
    if (own(input, "app") && input.app !== "vietnam-pocket-trip") fail("不是越南口袋游备份");
    if (own(input, "schemaVersion") && (own(input, "trip") ? input.schemaVersion !== 1 : input.schemaVersion !== 1 && input.schemaVersion !== 2)) fail("暂不支持这个备份版本");
    if (!record(source) || !validDate(source.start)) fail("备份缺少有效的出发日期");
    var result = { start: source.start, schemaVersion: 2 };
    ["note", "day7", "day7Stay", "day7Flight"].forEach(function (key) { result[key] = own(source, key) ? cleanString(source[key], 12000, key) : ""; });
    ["favorites", "done"].forEach(function (key) {
      result[key] = own(source, key) ? dictionary(source[key], function (v) { if (typeof v !== "boolean") fail(key + "应为是 / 否"); return v; }, key) : {};
    });
    result.branches = own(source, "branches") ? dictionary(source.branches, function (v) { if (!Number.isInteger(v) || v < 0 || v > 20) fail("路线分支无效"); return v; }, "路线分支", 30) : {};
    result.planBranches = own(source, "planBranches") ? dictionary(source.planBranches, function (v) { if (v !== 'combined' && (!Number.isInteger(v) || v < 0 || v > 20)) fail("自选行程分支无效"); return v; }, "自选行程分支", 30) : {};
    result.notes = own(source, "notes") ? dictionary(source.notes, function (v) { return cleanString(v, 12000, "每日备注"); }, "每日备注", 30) : {};
    result.plans = {};
    if (own(source, "plans")) {
      if (!record(source.plans)) fail("每日行程应按 d1–d7 保存");
      if (Object.keys(source.plans).length > 30) fail("每日行程数量过多");
      Object.keys(source.plans).forEach(function (key) {
        var entries = source.plans[key];
        if (!Array.isArray(entries) || entries.length > 100 || !/^d[1-7]$/.test(key)) fail("每日行程应为 d1–d7 对应的地点列表");
        var ids = {};
        result.plans[key] = entries.map(function (entry) {
          if (!record(entry)) fail("行程地点格式不正确");
          var item = { id: cleanString(entry.id, 150, "行程 ID"), placeKey: cleanString(entry.placeKey, 150, "地点 ID"), time: cleanString(entry.time || "", 5, "时间"), duration: entry.duration == null ? "" : entry.duration };
          if (!item.id || !item.placeKey || !safeKey(item.id) || !safeKey(item.placeKey) || ids[item.id]) fail("行程地点 ID 无效或重复");
          ids[item.id] = true;
          if (item.time && !validTime(item.time)) fail("行程时间应为 00:00–23:59");
          if (typeof item.duration === "number") { if (!Number.isFinite(item.duration) || item.duration < 0 || item.duration > 1440) fail("行程时长无效"); }
          else cleanString(item.duration, 100, "行程时长");
          return item;
        });
      });
    }
    result.benefits = {};
    if (own(source, "benefits")) {
      if (!record(source.benefits)) fail("酒店权益格式不正确");
      ["hotel0", "hotel1"].forEach(function (hotel) {
        if (!own(source.benefits, hotel)) return;
        if (!record(source.benefits[hotel])) fail("酒店权益格式不正确");
        result.benefits[hotel] = {};
        Object.keys(BENEFITS).forEach(function (key) { if (own(source.benefits[hotel], key)) { var status = source.benefits[hotel][key]; if (!own(BENEFIT_STATUS, status)) fail("酒店权益状态无效"); result.benefits[hotel][key] = status; } });
      });
    }
    result.reservations = [];
    if (own(source, "reservations")) {
      if (!Array.isArray(source.reservations) || source.reservations.length > 200) fail("预约记录过多或格式无效");
      var bookingIds = {};
      result.reservations = source.reservations.map(function (entry) {
        if (!record(entry)) fail("预约记录格式无效");
        var reservation = {};
        ["id", "date", "time", "type", "place", "notes"].forEach(function (key) { reservation[key] = cleanString(entry[key] == null ? "" : entry[key], key === "notes" ? 6000 : key === "place" ? 300 : 150, "预约 " + key); });
        if (!reservation.id || !safeKey(reservation.id) || bookingIds[reservation.id] || !reservation.place.trim() || !validDate(reservation.date) || (reservation.time && !validTime(reservation.time))) fail("预约日期、地点或 ID 无效");
        bookingIds[reservation.id] = true;
        reservation.reference = safeReference(entry.reference || "");
        reservation.status = entry.status || "pending";
        if (!own(RESERVATION_STATUS, reservation.status)) fail("预约状态无效");
        return reservation;
      });
    }
    result.currency = { rate: "", date: "" };
    if (own(source, "currency")) {
      if (!record(source.currency)) fail("汇率格式无效");
      var rate = source.currency.rate;
      if (rate !== "" && rate != null && (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0 || rate > 1000000)) fail("汇率必须是有效正数");
      var date = source.currency.date || "";
      if (date && !validDate(date)) fail("汇率日期无效");
      result.currency = { rate: rate == null ? "" : rate, date: date };
    }
    result.prefs = {};
    if (own(source, "prefs")) {
      if (!record(source.prefs)) fail("偏好格式无效");
      // Only UI preferences, never imported HTML, URLs, geolocation or code.
      ["publishedOnly", "compactFilters", "rain", "nearHotel", "preflightVisa", "preflightTerminal", "preflightTransfer", "preflightWeather"].forEach(function (key) { if (own(source.prefs, key)) { if (typeof source.prefs[key] !== "boolean") fail("偏好应为是 / 否"); result.prefs[key] = source.prefs[key]; } });
      ["nowOrigin", "nowKind", "nowDuration", "nowCity", "nowBudget", "nowTime", "nowMode"].forEach(function (key) { if (own(source.prefs, key)) result.prefs[key] = cleanString(source.prefs[key], 100, "偏好"); });
      ["preflightVisa", "preflightTerminal", "preflightTransfer", "preflightWeather"].forEach(function (key) { if (own(source.prefs, key)) { if (typeof source.prefs[key] !== "boolean") fail("出发前核对状态应为是 / 否"); result.prefs[key] = source.prefs[key]; } });
    }
    return { trip: result, counts: countTrip(result), exportedAt: typeof input.exportedAt === "string" ? input.exportedAt.slice(0, 40) : "" };
  }
  function countTrip(trip) {
    return { favorites: Object.keys(trip.favorites || {}).filter(function (k) { return trip.favorites[k]; }).length, reservations: (trip.reservations || []).length, planDays: Object.keys(trip.plans || {}).length, planItems: Object.keys(trip.plans || {}).reduce(function (n, k) { return n + trip.plans[k].length; }, 0), notes: Object.keys(trip.notes || {}).filter(function (k) { return trip.notes[k]; }).length };
  }
  function mergeTrip(current, incoming) {
    var old = sanitizeBackup(current).trip, fresh = sanitizeBackup(incoming).trip;
    var merged = Object.assign({}, old);
    ["favorites", "done", "branches", "notes", "prefs"].forEach(function (key) { merged[key] = Object.assign({}, old[key], fresh[key]); });
    // Keep current dates and trip-level notes in merge mode. Conflicting day
    // schedules must stay intact rather than mixing two incompatible routes.
    merged.plans = Object.assign({}, fresh.plans, old.plans);
    merged.planBranches = Object.assign({}, fresh.planBranches, old.planBranches);
    Object.keys(old.plans).forEach(function (day) {
      merged.branches[day] = own(old.branches, day) ? old.branches[day] : 0;
      // A legacy custom day without planBranches still uses its current default
      // branch. Imported metadata must not silently hide that retained route.
      if (!own(old.planBranches, day)) delete merged.planBranches[day];
    });
    merged.benefits = {};
    ["hotel0", "hotel1"].forEach(function (hotel) { merged.benefits[hotel] = Object.assign({}, old.benefits[hotel], fresh.benefits[hotel]); });
    var reservations = {};
    old.reservations.concat(fresh.reservations).forEach(function (entry) { reservations[entry.id] = entry; });
    merged.reservations = Object.keys(reservations).map(function (id) { return reservations[id]; });
    if (!old.currency.rate && fresh.currency.rate) merged.currency = fresh.currency;
    return sanitizeBackup(merged).trip;
  }
  function create(ctx) {
    if (detachListeners) detachListeners();
    var document = root.document, pendingImport = null, cardText = "", exportImage = null, imageURL = "", openGroups = {};
    var esc = ctx.esc;
    function trip() { return ctx.getTrip(); }
    function field(id) { return document.getElementById(id); }
    function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
    function options(map, value) { return Object.keys(map).map(function (key) { return '<option value="' + esc(key) + '"' + (value === key ? ' selected' : '') + '>' + esc(map[key]) + '</option>'; }).join(""); }
    function group(id, title, subtitle, body) { return '<details class="tool-group" data-tool-group="' + id + '"' + (openGroups[id] ? ' open' : '') + '><summary><span><strong>' + title + '</strong><small>' + subtitle + '</small></span><span class="tool-chevron" aria-hidden="true">⌄</span></summary><div class="tool-group-body">' + body + '</div></details>'; }
    function hotelName(i) { return (ctx.data.hotels[i] || {}).name || (i === 0 ? "Signature Hai Ba Trung" : "Meliá Vinpearl Phu Quoc"); }
    function renderMine() {
      var host = field("travel-tools-host"); if (!host) return;
      Array.prototype.forEach.call(host.querySelectorAll("[data-tool-group]"), function (el) { openGroups[el.dataset.toolGroup] = el.open; });
      var current = trip(), benefits = current.benefits || {}, reservations = current.reservations || [], currency = current.currency || {}, complete = 0;
      var hotels = [0, 1].map(function (i) {
        var id = "hotel" + i, values = benefits[id] || {};
        return '<div class="tool-hotel"><div class="tool-hotel-head"><h4>' + esc(hotelName(i)) + '</h4><button class="btn" data-tool-action="hotel-card" data-tool-hotel="' + i + '">给司机看</button></div>' + Object.keys(BENEFITS).map(function (key) {
          var status = values[key] || "pending"; if (status !== "pending") complete++;
          return '<label class="tool-benefit"><span>' + BENEFITS[key] + '</span><select aria-label="' + esc(hotelName(i) + ' ' + BENEFITS[key]) + '" data-tool-benefit="' + key + '" data-tool-hotel-id="' + id + '">' + options(BENEFIT_STATUS, status) + '</select></label>';
        }).join("") + '</div>';
      }).join("");
      var upcoming = reservations.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
      var bookingHTML = '<p class="tool-help">这是你的预约备忘。记录不会向商家发送预约；收到确认后，再切换为“已取得确认”。</p><button class="btn btn-primary" data-tool-action="reservation-new">＋ 添加预约</button><div class="tool-reservations">' + (upcoming.length ? upcoming.map(function (r) { return '<article class="tool-booking"><div class="tool-booking-meta">' + esc(r.date + (r.time ? ' · ' + r.time : '')) + '<span class="tag">' + esc(RESERVATION_STATUS[r.status] || RESERVATION_STATUS.pending) + '</span></div><h4>' + esc(r.place) + '</h4><p>' + esc([r.type, r.notes].filter(Boolean).join(' · ')) + '</p>' + (r.reference ? '<p class="tool-ref">凭证：' + (/^https?:\/\//i.test(r.reference) ? '<a href="' + esc(r.reference) + '" target="_blank" rel="noopener noreferrer">打开已保存链接 ↗</a>' : esc(r.reference)) + '</p>' : '') + '<div class="tool-row"><button class="btn" data-tool-action="reservation-edit" data-tool-id="' + esc(r.id) + '">编辑</button><button class="btn-subtle" data-tool-action="reservation-delete" data-tool-id="' + esc(r.id) + '">删除</button></div></article>'; }).join('') : '<p class="tool-help">餐厅、攀岩课程、接送和酒店确认，都可以放在这里。</p>') + '</div>';
      var calculator = '<form data-tool-form="currency" class="tool-form"><label>越南盾金额<input id="tool-vnd" type="text" inputmode="decimal" placeholder="例如 200k 或 200.000" autocomplete="off" data-tool-calc></label><div class="tool-form-row"><label>1 人民币 = 多少越南盾<input id="tool-rate" type="number" min="0.01" max="1000000" step="any" value="' + esc(currency.rate || '') + '" placeholder="填写兑换时汇率" inputmode="decimal" data-tool-calc></label><label>分摊人数<input id="tool-people" type="number" min="1" max="100" step="1" value="1" inputmode="numeric" data-tool-calc></label></div><label>汇率参考日期<input id="tool-rate-date" type="date" value="' + esc(currency.date || '') + '"></label><div class="tool-calculation" id="tool-calculation" aria-live="polite"><strong>先输入金额</strong><span>200k = 200,000 越南盾</span></div><p class="tool-help">汇率由你手动填写，不是实时牌价；刷卡和换汇手续费另计。没有汇率时仍可计算越南盾人均。</p><button type="submit" class="btn">保存汇率与日期</button></form>';
      var cards = '<p class="tool-help">酒店与已收录地点的大字卡可离线打开。餐厅、景点详情里也有“给司机 / 店员看”。</p><div class="tool-row">' + [0, 1].map(function (i) { return '<button class="btn" data-tool-action="hotel-card" data-tool-hotel="' + i + '">' + (i ? '富国岛酒店' : '胡志明酒店') + '</button>'; }).join('') + '<button class="btn" data-tool-action="phrase-card">点单表达卡</button></div>';
      var backup = '<p class="tool-help">收藏、行程、每日备注、酒店权益、预约和汇率保存在当前浏览器。导出文件后，换手机或浏览器可以恢复。</p><div class="tool-row"><button class="btn btn-primary" data-tool-action="backup-export">导出备份</button><button class="btn" data-tool-action="backup-choose">导入备份</button><input id="tool-backup-file" type="file" accept="application/json,.json" hidden data-tool-import></div><div class="tool-row"><button class="btn" data-tool-action="backup-text">查看 / 复制备份文字</button><button class="btn" data-tool-action="backup-paste">粘贴备份文字</button></div><p class="tool-help">也可复制完整备份文字到自己的备忘录，再粘贴恢复。导入先预览，再选择合并或替换。备份含个人行程和预约，请自行保管。</p><div class="tool-divider"></div><button class="btn" data-tool-action="daily-image">保存 ' + esc(ctx.dateLabel(ctx.getDayIndex())) + ' 行程长图</button><p class="tool-help">使用“行程”页当前选中的日期；生成真正的 PNG 图片，可存相册。</p>';
      host.innerHTML = '<div class="tool-section-label">出门随手用</div>' + group('currency', '越南盾快速看价', '看金额 · 算人民币 · 多人分摊', calculator) + group('bookings', '我的预约', reservations.length + ' 条记录 · 是否确认由你填写', bookingHTML) + group('benefits', '酒店订单权益', complete + ' / 8 项已核对', '<p class="tool-help">依据你的订单和酒店书面回复填写；所有项目默认待确认，不代表房价包含。</p>' + hotels) + group('cards', '大字沟通卡', '给司机看地址 · 给店员看需求', cards) + group('backup', '备份与离线行程图', '换设备可恢复 · 保存到相册', backup);
    }
    function calculate() {
      var input = field('tool-vnd'); if (!input) return;
      var amount = parseVnd(input.value), rate = Number(field('tool-rate').value), people = Number(field('tool-people').value), output = field('tool-calculation');
      if (amount === null) { output.innerHTML = '<strong>' + (input.value.trim() ? '金额格式没看懂' : '先输入金额') + '</strong><span>支持 200k、200.000、200,000；小数请写 200.5k。</span>'; return; }
      if (!Number.isInteger(people) || people < 1 || people > 100) { output.innerHTML = '<strong>人数请填 1–100 的整数</strong>'; return; }
      var converted = rate > 0 && rate <= 1000000 ? amount / rate : null;
      output.innerHTML = '<strong>' + amount.toLocaleString('en-US') + ' ₫' + (converted !== null ? ' <small>≈ ¥' + converted.toFixed(2) + '</small>' : '') + '</strong><span>每人 ' + Math.ceil(amount / people).toLocaleString('en-US') + ' ₫' + (converted !== null ? ' ≈ ¥' + (converted / people).toFixed(2) : ' · 填写汇率后显示人民币') + '</span>';
    }
    function reservationForm(id) {
      var r = (trip().reservations || []).filter(function (entry) { return entry.id === id; })[0] || { id: '', date: trip().start || today(), time: '', type: '餐厅', place: '', reference: '', notes: '', status: 'pending' };
      ctx.open('<div class="tool-dialog"><div class="detail-eyebrow">只保存在当前浏览器</div><h2>' + (r.id ? '编辑预约备忘' : '添加预约备忘') + '</h2><p class="tool-help">工具不会替你预约；取得商家回复后，再标记已确认。</p><form class="tool-form" data-tool-form="reservation" data-tool-id="' + esc(r.id) + '"><label>地点 / 商家<input name="place" value="' + esc(r.place) + '" required maxlength="300" placeholder="例如 Skywalk Climbing"></label><div class="tool-form-row"><label>日期<input name="date" type="date" value="' + esc(r.date) + '" required></label><label>时间<input name="time" type="time" value="' + esc(r.time) + '"></label></div><div class="tool-form-row"><label>类型<select name="type">' + options({ '餐厅': '餐厅', '攀岩': '攀岩 / 课程', '接送': '机场 / 包车接送', '酒店': '酒店', '其他': '其他' }, r.type) + '</select></label><label>状态<select name="status">' + options(RESERVATION_STATUS, r.status || 'pending') + '</select></label></div><label>确认号 / 凭证网页<input name="reference" value="' + esc(r.reference) + '" maxlength="1000" placeholder="订单号、确认邮件编号或 https 链接"></label><label>备注<textarea name="notes" rows="4" maxlength="6000" placeholder="人数、课程要求、集合点、取消规则等">' + esc(r.notes) + '</textarea></label><button class="btn btn-primary" type="submit">保存预约备忘</button></form></div>');
    }
    function showCard(place) {
      var p = place || {}, raw = p.raw || p, verification = raw.venueVerification || {}, name = verification.originalName || raw.originalName || raw.name || p.name || '', address = verification.address || raw.verifiedAddress || raw.address || '', verified = !!raw.verifiedAddress || p.type === 'hotel' || raw.addressVerified === true || verification.addressVerified === true || !!(raw.verification && raw.verification.address);
      var showAddress = address && verified ? address : '';
      cardText = ['Xin vui lòng đưa tôi đến đây.', name, showAddress, p.area || raw.city || ''].filter(Boolean).join('\n');
      ctx.open('<div class="tool-dialog tool-display-card"><div class="detail-eyebrow">给司机看 · 离线可用</div><p class="tool-translation">请带我去这里</p><h2 class="tool-vietnamese">Xin vui lòng đưa tôi đến đây.</h2><div class="tool-destination"><strong>' + esc(name) + '</strong>' + (showAddress ? '<p>' + esc(showAddress) + '</p>' : '<p class="tool-address-missing">暂无已核实的门牌地址。请让司机按原文店名确认门店。</p>') + '<small>' + esc(p.area || raw.city || '') + '</small></div>' + (address && !verified ? '<p class="tool-help">资料中的地址尚未核实，未放入司机卡。</p>' : '') + (showAddress && verification.verifiedAt ? '<p class="tool-help">地址核验：' + esc(verification.verifiedAt) + '</p>' : '') + '<button class="btn btn-primary" data-tool-action="card-copy">复制卡片文字</button><div class="tool-divider"></div><button class="btn" data-tool-action="phrase-card">打开点单表达卡</button></div>');
    }
    function showPhraseCard(mode) {
      mode = mode || 'both';
      var spicy = mode !== 'coriander', coriander = mode !== 'spicy';
      cardText = [spicy ? 'Không cay, xin vui lòng.\n请不要辣。' : '', coriander ? 'Không rau mùi (ngò rí), xin vui lòng.\n请不要香菜。' : ''].filter(Boolean).join('\n');
      ctx.open('<div class="tool-dialog tool-display-card"><div class="detail-eyebrow">给店员看 · 离线可用</div><h2>点单表达</h2><div class="tool-row"><button class="btn" data-tool-action="phrase-card" data-tool-mode="spicy">只显示不辣</button><button class="btn" data-tool-action="phrase-card" data-tool-mode="coriander">只显示不要香菜</button><button class="btn" data-tool-action="phrase-card" data-tool-mode="both">两项都显示</button></div>' + (spicy ? '<div class="tool-phrase"><span>请不要辣</span><strong>Không cay, xin vui lòng.</strong></div>' : '') + (coriander ? '<div class="tool-phrase"><span>请不要香菜</span><strong>Không rau mùi (ngò rí), xin vui lòng.</strong></div>' : '') + '<p class="tool-help">这是口味表达；过敏需求请单独与店员确认。</p><button class="btn btn-primary" data-tool-action="card-copy">复制卡片文字</button></div>');
    }
    function copy(text) {
      function fallback() {
        var box = document.createElement('textarea'); box.value = text; box.setAttribute('readonly', ''); box.style.cssText = 'position:fixed;left:0;top:0;opacity:0'; document.body.appendChild(box); box.select(); box.setSelectionRange(0, text.length);
        var copied = false; try { copied = document.execCommand('copy'); } catch (error) {} box.remove();
        ctx.toast(copied ? '已复制文字' : '可长按卡片文字选择并复制');
      }
      if (root.navigator.clipboard && root.navigator.clipboard.writeText) root.navigator.clipboard.writeText(text).then(function () { ctx.toast('已复制文字'); }).catch(fallback); else fallback();
    }
    function download(blob, filename) {
      var url = root.URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 60000);
    }
    function backupJSON() { return JSON.stringify({ app: 'vietnam-pocket-trip', schemaVersion: 1, exportedAt: new Date().toISOString(), trip: sanitizeBackup(trip()).trip }, null, 2); }
    function exportBackup() {
      try { download(new Blob([backupJSON()], { type: 'application/json;charset=utf-8' }), 'vietnam-pocket-backup-' + today() + '.json'); ctx.toast('备份已生成，请保存到文件'); } catch (e) { ctx.toast('备份失败：' + e.message); }
    }
    async function importFile(file) {
      if (!file) return;
      if (file.size > 2000000) { ctx.toast('备份文件请小于 2 MB'); return; }
      try { previewImport(await file.text()); } catch (e) { ctx.toast('无法读取备份文件：' + e.message); }
    }
    function previewImport(input) {
      try {
        pendingImport = sanitizeBackup(input); var c = pendingImport.counts;
        ctx.open('<div class="tool-dialog"><div class="detail-eyebrow">尚未写入本机</div><h2>确认导入内容</h2><p class="tool-help">出发日期：' + esc(pendingImport.trip.start) + (pendingImport.exportedAt ? '<br>导出时间：' + esc(pendingImport.exportedAt) : '') + '</p><div class="tool-import-counts"><span><strong>' + c.favorites + '</strong>收藏</span><span><strong>' + c.planDays + '</strong>自选行程天数</span><span><strong>' + c.planItems + '</strong>行程地点</span><span><strong>' + c.reservations + '</strong>预约</span></div><p class="tool-help">合并：保留本机出发日期、行程总备注和已有当天路线；补入其他天的路线，相同记录 ID 的收藏、备注、预约和权益以备份为准。本机已有汇率保留。</p><button class="btn btn-primary" data-tool-action="backup-merge">合并到本机</button><p class="tool-help">替换：本机个人设置将全部改为这份备份。先导出当前记录可保留恢复点。</p><div class="tool-row"><button class="btn" data-tool-action="backup-replace-preview">选择全部替换</button><button class="btn-subtle" data-tool-action="backup-cancel">取消</button></div></div>');
      } catch (e) { pendingImport = null; ctx.toast('未导入：' + e.message); }
    }
    function wrapText(context, text, maxWidth) {
      var lines = [];
      String(text || '').split('\n').forEach(function (paragraph) {
        if (!paragraph) { lines.push(''); return; }
        var line = '';
        Array.from(paragraph).forEach(function (character) { if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = character; } else line += character; });
        if (line) lines.push(line);
      }); return lines;
    }
    async function showDailyImage(dayIndex) {
      dayIndex = Math.max(0, Math.min(6, Number(dayIndex) || 0));
      var current = trip(), day = ctx.data.days[dayIndex] || {}, rows = [], items = ctx.getDayItems(dayIndex) || [];
      rows.push({ text: ctx.dateLabel(dayIndex) + ' · ' + (day.title || '今日行程'), size: 38, color: '#254f43', weight: '700', gap: 20 });
      rows.push({ text: '越南口袋游 · 我的离线行程', size: 19, color: '#698174', gap: 22 });
      var hotel = dayIndex < 2 ? hotelName(0) : dayIndex < 5 ? hotelName(1) : (current.day7Stay || '10/6 晚住宿待填写');
      rows.push({ text: '住宿 · ' + hotel, size: 24, color: '#31594b', gap: 18 });
      var flights = { 0: '航班 · 08:50 起飞 → 10:40 抵达 SGN', 2: '航班 · 14:50 SGN → 15:50 PQC；请保留去机场的时间', 5: '航班 · 18:55 PQC → 20:00 SGN；请保留去机场的时间', 6: current.day7Flight ? '返程 · ' + current.day7Flight : '返程航班待填写' };
      if (flights[dayIndex]) rows.push({ text: flights[dayIndex], size: 23, color: '#966f42', gap: 22 });
      rows.push({ text: '以上航班时间为当地时间；当天以航司通知为准。', size: 17, color: '#7b8477', gap: 24 });
      items.forEach(function (entry, index) {
        var p = entry.place || ctx.places[entry.placeKey] || entry, raw = p.raw || entry.raw || p;
        var timeLabel = entry.locked ? entry.timeLabel || raw.time || entry.time : entry.time || raw.time;
        rows.push({ text: (index + 1) + '. ' + (timeLabel || '时间待定') + '  ' + (p.name || raw.name || '地点待核对'), size: 28, color: '#254f43', weight: '600', gap: 7 });
        var duration = entry.duration || raw.duration; if (duration) rows.push({ text: '预计停留 ' + duration + (typeof duration === 'number' ? ' 分钟' : ''), size: 19, color: '#718170', gap: 5 });
        var venueAddress = (raw.venueVerification || {}).address || raw.verifiedAddress || raw.address;
        if (venueAddress) rows.push({ text: venueAddress, size: 20, color: '#5f7467', gap: 5 });
        var note = raw.travel || raw.visit || raw.note || p.note;
        if (note) rows.push({ text: String(note).slice(0, 420), size: 20, color: '#5f7467', gap: 23 });
      });
      if (!items.length) rows.push({ text: '尚未添加地点。可在发现页把喜欢的地方加入当天。', size: 24, color: '#698174', gap: 24 });
      var note = dayIndex === 6 ? current.day7 : (current.notes || {})[day.id];
      if (note) rows.push({ text: '我的备注\n' + note, size: 23, color: '#6e674f', gap: 24 });
      (current.reservations || []).filter(function (r) { var d = new Date(current.start + 'T00:00:00'); d.setDate(d.getDate() + dayIndex); return r.date === [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') && r.status !== 'cancelled'; }).forEach(function (r) { rows.push({ text: '预约备忘 · ' + (r.time || '时间待定') + ' ' + r.place + '\n' + (RESERVATION_STATUS[r.status] || RESERVATION_STATUS.pending) + (r.reference ? ' · ' + r.reference : ''), size: 22, color: '#6e674f', gap: 18 }); });
      rows.push({ text: '生成于 ' + today() + ' · 图片为静态快照，修改行程后请重新保存。\n地图、原帖和实时交通请回网页打开。', size: 17, color: '#809082', gap: 15 });
      try {
        var canvas = document.createElement('canvas'), context = canvas.getContext('2d'), contentWidth = 634, height = 58;
        if (!context) throw new Error('图片画布不可用');
        rows.forEach(function (row) { context.font = (row.weight || '400') + ' ' + row.size + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'; row.lines = wrapText(context, row.text, contentWidth); row.height = row.lines.length * Math.ceil(row.size * 1.55) + row.gap; height += row.height; });
        if (height > 15000) throw new Error('这天的文字过多，请缩短备注后重试');
        canvas.width = 750; canvas.height = height + 50; context.fillStyle = '#f8f6ed'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#426f5b'; context.fillRect(0, 0, canvas.width, 10); var y = 58;
        rows.forEach(function (row) { context.font = (row.weight || '400') + ' ' + row.size + 'px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'; context.fillStyle = row.color; context.textBaseline = 'top'; row.lines.forEach(function (line) { context.fillText(line, 58, y); y += Math.ceil(row.size * 1.55); }); y += row.gap; });
        var blob = await new Promise(function (resolve, reject) { canvas.toBlob(function (value) { if (value) resolve(value); else reject(new Error('图片生成失败')); }, 'image/png'); });
        if (imageURL) root.URL.revokeObjectURL(imageURL);
        imageURL = root.URL.createObjectURL(blob); exportImage = { blob: blob, name: 'vietnam-day-' + (dayIndex + 1) + '-' + current.start + '.png' };
        ctx.open('<div class="tool-dialog"><div class="detail-eyebrow">图片已生成 · ' + esc(ctx.dateLabel(dayIndex)) + '</div><h2>保存今天的安排</h2><p class="tool-help">可下载 PNG；手机也可长按下方图片保存到相册。支持文件分享的浏览器还能打开系统分享。</p><div class="tool-row"><a class="btn btn-primary" href="' + imageURL + '" download="' + esc(exportImage.name) + '">下载行程 PNG</a><button class="btn" data-tool-action="image-share">系统分享 / 保存</button></div><img class="tool-image-preview" src="' + imageURL + '" alt="' + esc(ctx.dateLabel(dayIndex)) + ' 行程长图"></div>');
      } catch (e) { ctx.toast('生成失败：' + e.message); }
    }
    function handleClick(event) {
      var button = event.target.closest('[data-tool-action]'); if (!button) return;
      var action = button.dataset.toolAction, id = button.dataset.toolId;
      if (action === 'hotel-card') { var i = Number(button.dataset.toolHotel), hotel = ctx.places['hotel' + i] || { raw: ctx.data.hotels[i], name: hotelName(i), type: 'hotel', area: i ? 'Phú Quốc' : 'Ho Chi Minh City' }; showCard(hotel); }
      else if (action === 'phrase-card') showPhraseCard(button.dataset.toolMode);
      else if (action === 'card-copy') copy(cardText);
      else if (action === 'reservation-new' || action === 'reservation-edit') reservationForm(id);
      else if (action === 'reservation-delete') { var r = (trip().reservations || []).filter(function (entry) { return entry.id === id; })[0]; if (r) ctx.open('<div class="tool-dialog"><h2>删除这条预约备忘？</h2><p>' + esc(r.place) + '</p><p class="tool-help">这里只删除本机记录，不会取消商家预约。</p><button class="btn btn-primary" data-tool-action="reservation-delete-confirm" data-tool-id="' + esc(id) + '">删除本机记录</button></div>'); }
      else if (action === 'reservation-delete-confirm') { trip().reservations = (trip().reservations || []).filter(function (r) { return r.id !== id; }); ctx.save('已删除本机预约备忘'); ctx.close(); renderMine(); }
      else if (action === 'backup-export') exportBackup();
      else if (action === 'backup-choose') field('tool-backup-file').click();
      else if (action === 'backup-text') {
        try { ctx.open('<div class="tool-dialog"><div class="detail-eyebrow">个人备份 · 完整 JSON</div><h2>保存备份文字</h2><p class="tool-help">复制全部内容，粘贴到你自己的备忘录保存。恢复时使用“粘贴备份文字”；请勿修改格式或删减内容。</p><div class="tool-form"><label>完整备份<textarea id="tool-backup-text" rows="10" readonly spellcheck="false">' + esc(backupJSON()) + '</textarea></label><button class="btn btn-primary" data-tool-action="backup-copy">复制完整备份</button></div></div>'); } catch (e) { ctx.toast('备份失败：' + e.message); }
      }
      else if (action === 'backup-copy') copy(field('tool-backup-text').value);
      else if (action === 'backup-paste') ctx.open('<div class="tool-dialog"><div class="detail-eyebrow">先校验和预览，再由你确认</div><h2>粘贴备份文字</h2><p class="tool-help">粘贴之前导出的完整 JSON 备份。此步不会覆盖本机记录。</p><form class="tool-form" data-tool-form="backup-paste"><label>完整备份<textarea id="tool-backup-paste" rows="10" required maxlength="2000000" spellcheck="false" placeholder="在这里粘贴完整备份文字"></textarea></label><button class="btn btn-primary" type="submit">校验并预览</button></form></div>');
      else if (action === 'backup-cancel') { pendingImport = null; ctx.close(); }
      else if (action === 'backup-replace-preview' && pendingImport) ctx.open('<div class="tool-dialog"><h2>全部替换本机记录？</h2><p class="tool-help">当前收藏、路线、预约和备注会被这份备份替换。若需保留，请先取消并导出当前记录。</p><div class="tool-row"><button class="btn btn-primary" data-tool-action="backup-replace-confirm">确认替换</button><button class="btn" data-tool-action="backup-cancel">取消</button></div></div>');
      else if ((action === 'backup-merge' || action === 'backup-replace-confirm') && pendingImport) { try { var candidate = action === 'backup-merge' ? mergeTrip(trip(), pendingImport.trip) : pendingImport.trip; ctx.replaceTrip(candidate); pendingImport = null; ctx.close(); renderMine(); } catch (e) { ctx.toast('未导入：' + e.message); } }
      else if (action === 'daily-image') showDailyImage(ctx.getDayIndex());
      else if (action === 'image-share' && exportImage) {
        var imageFile = typeof root.File === 'function' ? new root.File([exportImage.blob], exportImage.name, { type: 'image/png' }) : null;
        if (imageFile && root.navigator.share && root.navigator.canShare && root.navigator.canShare({ files: [imageFile] })) root.navigator.share({ files: [imageFile], title: '我的越南今日行程' }).catch(function (e) { if (e.name !== 'AbortError') ctx.toast('可长按图片保存，或点下载 PNG'); });
        else ctx.toast('请长按下方图片保存，或点下载 PNG');
      }
    }
    function handleChange(event) {
      var target = event.target;
      if (target.hasAttribute('data-tool-benefit')) { var hotel = target.dataset.toolHotelId, key = target.dataset.toolBenefit; trip().benefits = trip().benefits || {}; trip().benefits[hotel] = trip().benefits[hotel] || {}; trip().benefits[hotel][key] = target.value; ctx.save('权益核对状态已保存'); renderMine(); }
      if (target.hasAttribute('data-tool-import')) { importFile(target.files[0]); target.value = ''; }
    }
    function handleSubmit(event) {
      var form = event.target; if (!form.dataset.toolForm) return; event.preventDefault();
      if (form.dataset.toolForm === 'backup-paste') previewImport(field('tool-backup-paste').value);
      else if (form.dataset.toolForm === 'currency') {
        var rate = Number(field('tool-rate').value), date = field('tool-rate-date').value;
        if (!(rate > 0 && rate <= 1000000) || !validDate(date)) { ctx.toast('请填写有效汇率和参考日期'); return; }
        trip().currency = { rate: rate, date: date }; ctx.save('手动汇率已保存'); calculate();
      } else if (form.dataset.toolForm === 'reservation') {
        try {
          var fd = new root.FormData(form), r = { id: form.dataset.toolId || 'booking-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) };
          ['date', 'time', 'type', 'place', 'reference', 'notes', 'status'].forEach(function (key) { r[key] = String(fd.get(key) || '').trim(); });
          var validated = sanitizeBackup({ start: trip().start, reservations: [r] }).trip.reservations[0];
          var list = (trip().reservations || []).slice(), existing = list.findIndex(function (entry) { return entry.id === r.id; });
          if (existing >= 0) list[existing] = validated; else { if (list.length >= 200) fail('最多保存 200 条预约'); list.push(validated); }
          trip().reservations = list; ctx.save('预约备忘已保存'); ctx.close(); renderMine();
        } catch (e) { ctx.toast(e.message); }
      }
    }
    function handleInput(event) { if (event.target.hasAttribute('data-tool-calc')) calculate(); }
    document.addEventListener('click', handleClick);
    document.addEventListener('change', handleChange);
    document.addEventListener('input', handleInput);
    document.addEventListener('submit', handleSubmit);
    detachListeners = function () { document.removeEventListener('click', handleClick); document.removeEventListener('change', handleChange); document.removeEventListener('input', handleInput); document.removeEventListener('submit', handleSubmit); if (imageURL) root.URL.revokeObjectURL(imageURL); };
    return { renderMine: renderMine, showCard: showCard, showDailyImage: showDailyImage };
  }
  root.PocketTools = { create: create, parseVnd: parseVnd, sanitizeBackup: sanitizeBackup, mergeTrip: mergeTrip, validDate: validDate, countTrip: countTrip };
})(typeof window !== 'undefined' ? window : globalThis);
