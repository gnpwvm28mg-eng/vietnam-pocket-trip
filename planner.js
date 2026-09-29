(function (root) {
  'use strict';

  // All editing helpers are pure: callers persist result.trip only on success.
  var own = Object.prototype.hasOwnProperty;
  var unsafeKeys = ['__proto__', 'prototype', 'constructor'];
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
  function clean(value, depth) {
    if ((depth || 0) > 12) return null;
    if (value == null || typeof value === 'boolean' || typeof value === 'string') return typeof value === 'string' ? value.slice(0, 20000) : value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.slice(0, 1000).map(function (x) { return clean(x, (depth || 0) + 1); });
    if (!object(value)) return null;
    var copy = {};
    Object.keys(value).slice(0, 2000).forEach(function (key) { if (unsafeKeys.indexOf(key) === -1) copy[key] = clean(value[key], (depth || 0) + 1); });
    return copy;
  }
  function text(value) { return String(value == null ? '' : value); }
  function normalized(value) { return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase(); }
  function validTime(value) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text(value)); }
  function time(value) { var match = text(value).match(/(?:^|\D)([01]?\d|2[0-3]):([0-5]\d)/); return match ? ('0' + match[1]).slice(-2) + ':' + match[2] : ''; }
  function minutes(value) { var t = validTime(value) ? value.split(':') : null; return t ? Number(t[0]) * 60 + Number(t[1]) : null; }
  function duration(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1440) return Math.round(value);
    var valueText = text(value), nums = valueText.match(/\d+(?:\.\d+)?/g);
    if (nums && /分钟|小时|hours?|minutes?|mins?/i.test(valueText)) {
      var n = Math.max.apply(Math, nums.map(Number)) * (/小时|hours?/i.test(valueText) ? 60 : 1);
      if (n > 0 && n <= 1440) return Math.round(n);
    }
    return fallback || 60;
  }
  function normalizeTrip(saved, defaults) {
    var result = clean(object(defaults) ? defaults : {}), incoming = clean(object(saved) ? saved : {});
    Object.keys(incoming).forEach(function (key) { result[key] = incoming[key]; });
    ['favorites', 'done', 'branches', 'notes', 'plans', 'planBranches'].forEach(function (key) { if (!object(result[key])) result[key] = {}; });
    Object.keys(result.plans).forEach(function (key) {
      if (!Array.isArray(result.plans[key])) { delete result.plans[key]; return; }
      result.plans[key] = result.plans[key].filter(function (item) { return object(item) && typeof item.placeKey === 'string' && item.placeKey && unsafeKeys.indexOf(item.placeKey) === -1; }).slice(0, 100).map(function (item, i) {
        return { id: typeof item.id === 'string' && item.id ? item.id : 'saved-' + i + '-' + item.placeKey, placeKey: item.placeKey, time: validTime(item.time) ? item.time : '', duration: duration(item.duration, 60) };
      });
    });
    Object.keys(result.branches).forEach(function (key) { if (!Number.isInteger(result.branches[key]) || result.branches[key] < 0) delete result.branches[key]; });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text(result.start))) result.start = (defaults || {}).start || '2026-10-01';
    result.schemaVersion = 2;
    return result;
  }
  function cityOf(p) {
    var raw = p && (p.raw || p) || {}, value = p && (p.area || p.city) || raw.city || raw.area || '';
    if (/富国|phu quoc|pqc/i.test(normalized(value))) return '富国岛';
    if (/胡志明|西贡|ho chi minh|saigon|sai gon|hcm|sgn/i.test(normalized(value))) return '胡志明市';
    return raw.city || '';
  }
  function kindOf(p) {
    var value = text(p && (p.kind || (p.raw || {}).kind));
    if (/吃喝|餐|咖啡|美食/.test(value)) return '吃喝';
    if (/衣服|购物/.test(value)) return '衣服';
    if (/攀岩|抱石/.test(value)) return '攀岩';
    if (/住宿|休整/.test(value)) return '住宿';
    if (/交通|航班|准备/.test(value)) return '交通';
    return '玩乐';
  }
  function isFlight(raw) { return /(?:SGN|PQC)\s*(?:→|->|—)\s*(?:SGN|PQC)/i.test(raw.name || '') || raw.flight === true; }
  function isLocked(raw) { return !!raw.locked || /航班/.test(raw.kind || '') || (/交通/.test(raw.kind || '') && /机场|airport|接机|送机/i.test([raw.name, raw.travel].join(' '))); }
  function getPlace(lookup, key) { return typeof lookup === 'function' ? lookup(key) : lookup && own.call(lookup, key) ? lookup[key] : null; }
  function defaultItems(data, trip, dayIndex, lookup) {
    var day = (data.days || [])[dayIndex]; if (!day) return [];
    var branches = trip && trip.branches || {}, branch = Number(branches[day.id]) || 0;
    var all = /两段都执行/.test(day.rule || '');
    var selected = all ? day.variants || [] : [(day.variants || [])[branch] || (day.variants || [])[0]].filter(Boolean);
    var items = [], seen = {};
    selected.forEach(function (variant) { var vi = day.variants.indexOf(variant); (variant.stops || []).forEach(function (raw, si) {
      var key = raw._key || raw.id || 'd' + dayIndex + 'v' + vi + 's' + si;
      if (seen[key]) return; seen[key] = true;
      var place = getPlace(lookup, key) || { key: key, name: raw.name, kind: kindOf(raw), area: raw.city || cityOf({ area: day.place }), raw: raw, day: dayIndex, variant: vi, index: si };
      var previous = variant.stops[si - 1], airportTransfer = /交通/.test(raw.kind || '') && previous && /机场.*到达|机场.*抵达|机场接机/.test(previous.name || '');
      items.push({ id: key, placeKey: key, time: time(raw.time), timeLabel: raw.time || '', duration: duration(raw.duration, 60), durationLabel: raw.duration || '', locked: isLocked(raw) || !!airportTransfer, origin: 'default', place: place, raw: raw, name: place.name, city: cityOf(place), day: dayIndex, variant: vi });
    }); });
    return items;
  }
  function selectedBranch(day, trip) { return /两段都执行/.test(day.rule || '') ? 'combined' : Number((trip.branches || {})[day.id]) || 0; }
  function getDayItems(data, trip, dayIndex, lookup) {
    trip = trip || {};
    var day = (data.days || [])[dayIndex]; if (!day) return [];
    var defaults = defaultItems(data, trip, dayIndex, lookup), plans = trip.plans || {}, saved = plans[day.id];
    if (!Array.isArray(saved)) return defaults;
    if (trip.planBranches && own.call(trip.planBranches, day.id) && trip.planBranches[day.id] !== selectedBranch(day, trip)) return defaults;
    var baseByKey = {}, anchors = [], baseSegments = {}, segment = 0;
    defaults.forEach(function (item) { baseByKey[item.placeKey] = item; if (item.locked) { anchors.push(item); segment += 1; } else baseSegments[item.placeKey] = segment; });
    var savedAnchorOrder = saved.filter(function (item) { return item && baseByKey[item.placeKey] && baseByKey[item.placeKey].locked; }).map(function (item) { return item.placeKey; });
    var intact = savedAnchorOrder.join('|') === anchors.map(function (item) { return item.placeKey; }).join('|');
    var groups = anchors.map(function () { return []; }); groups.push([]);
    var seen = {}, seenIds = {}, cursor = 0;
    saved.forEach(function (entry, index) {
      if (!object(entry) || typeof entry.placeKey !== 'string' || seen[entry.placeKey]) return;
      var base = baseByKey[entry.placeKey], place = getPlace(lookup, entry.placeKey) || base && base.place;
      if (!place) return;
      seen[entry.placeKey] = true;
      if (base && base.locked) { if (intact) cursor += 1; return; }
      // A protected anchor from another route is never importable as a custom stop.
      if (isLocked(place.raw || {})) return;
      var chosenTime = validTime(entry.time) ? entry.time : '', part = cursor;
      if (!intact) {
        if (own.call(baseSegments, entry.placeKey)) part = baseSegments[entry.placeKey];
        else { part = anchors.length; if (chosenTime) { var m = minutes(chosenTime); part = anchors.filter(function (anchor) { return minutes(anchor.time) !== null && minutes(anchor.time) <= m; }).length; } }
      }
      var id = typeof entry.id === 'string' && entry.id ? entry.id : 'saved-' + index + '-' + entry.placeKey;
      if (seenIds[id]) id = 'saved-' + index + '-' + entry.placeKey;
      seenIds[id] = true;
      groups[Math.min(part, anchors.length)].push({ id: id, placeKey: entry.placeKey, time: chosenTime, timeLabel: chosenTime, duration: duration(entry.duration, base ? base.duration : 60), locked: false, origin: base ? 'default' : 'custom', place: place, raw: place.raw || {}, name: place.name, city: cityOf(place), day: dayIndex, variant: base ? base.variant : null });
    });
    var result = [];
    groups.forEach(function (items, i) { result = result.concat(items); if (anchors[i]) result.push(anchors[i]); });
    return result;
  }
  function fail(message) { return { ok: false, message: message }; }
  function context(options) {
    var day = (options.data.days || [])[options.dayIndex];
    return { day: day, items: getDayItems(options.data, options.trip, options.dayIndex, options.placeLookup) };
  }
  function commit(options, items, message) {
    var next = normalizeTrip(options.trip, {}), day = options.data.days[options.dayIndex];
    next.plans[day.id] = items.map(function (item) { return { id: item.id, placeKey: item.placeKey, time: item.time, duration: item.duration }; });
    next.planBranches[day.id] = selectedBranch(day, next);
    return { ok: true, message: message, trip: next };
  }
  function allowedCities(data, trip, dayIndex, lookup) {
    var list = defaultItems(data, trip, dayIndex, lookup), cities = list.map(function (item) { return item.city; }).filter(Boolean);
    list.filter(function (item) { return isFlight(item.raw); }).forEach(function (item) { if (/→\s*SGN/.test(item.name)) cities.push('胡志明市'); if (/→\s*PQC/.test(item.name)) cities.push('富国岛'); });
    return cities;
  }
  function validatePlace(options, items, exceptId) {
    var p = getPlace(options.placeLookup, options.placeKey);
    if (!p) return fail('没有找到这个地点，请重新打开地点详情。');
    if (isLocked(p.raw || {})) return fail('航班和机场接送已固定在原定日期，无需重复添加。');
    if (items.some(function (item) { return item.id !== exceptId && item.placeKey === options.placeKey; })) return fail('这一天已安排了这个地点。');
    var city = cityOf(p), cities = allowedCities(options.data, options.trip, options.dayIndex, options.placeLookup);
    if (city && cities.length && cities.indexOf(city) === -1) return fail('这个地点位于' + city + '，与当天所在城市不同，请选择对应日期。');
    if (options.time !== undefined && options.time !== '' && !validTime(options.time)) return fail('时间请填写 00:00–23:59，或留空稍后安排。');
    if (options.duration !== undefined && (!Number.isFinite(Number(options.duration)) || Number(options.duration) <= 0 || Number(options.duration) > 1440)) return fail('停留时间请填写 1–1440 分钟。');
    return { ok: true, place: p };
  }
  function addToDay(options) {
    var ctx = context(options); if (!ctx.day) return fail('没有找到这一天。');
    var check = validatePlace(options, ctx.items); if (!check.ok) return check;
    var p = check.place, desiredTime = options.time || '', insertion = ctx.items.length;
    if (options.afterId) { var after = ctx.items.findIndex(function (item) { return item.id === options.afterId; }); if (after >= 0) insertion = after + 1; }
    else if (desiredTime) { var nextIndex = ctx.items.findIndex(function (item) { return item.time && minutes(item.time) > minutes(desiredTime); }); if (nextIndex >= 0) insertion = nextIndex; }
    var id = 'custom-' + options.placeKey, suffix = 1;
    while (ctx.items.some(function (item) { return item.id === id; })) id = 'custom-' + options.placeKey + '-' + suffix++;
    ctx.items.splice(insertion, 0, { id: id, placeKey: options.placeKey, time: desiredTime, duration: duration(Number(options.duration), suggestedDuration(p)), locked: false, place: p, raw: p.raw || {}, name: p.name, city: cityOf(p), origin: 'custom' });
    return commit(options, ctx.items, '已加入这一天；请查看时间与路线提醒。');
  }
  function moveItem(options) {
    var ctx = context(options), from = ctx.items.findIndex(function (item) { return item.id === options.itemId; });
    if (from < 0) return fail('没有找到这个安排。');
    if (ctx.items[from].locked) return fail('航班和机场接送为固定节点，不能移动。');
    var to = options.toIndex !== undefined ? Number(options.toIndex) : from + Number(options.delta || 0);
    if (!Number.isInteger(to) || to < 0 || to >= ctx.items.length) return fail('已经到达可移动范围的边缘。');
    var range = ctx.items.slice(Math.min(from, to), Math.max(from, to) + 1);
    if (range.some(function (item) { return item.locked; })) return fail('不能跨过航班或机场接送节点；请选择另一个时段或日期。');
    var item = ctx.items.splice(from, 1)[0]; ctx.items.splice(to, 0, item);
    return commit(options, ctx.items, '顺序已调整；原定时间保留，请核对时间提醒。');
  }
  function removeItem(options) {
    var ctx = context(options), item = ctx.items.find(function (entry) { return entry.id === options.itemId; });
    if (!item) return fail('没有找到这个安排。');
    if (item.locked) return fail('航班和机场接送为固定节点，不能删除。');
    return commit(options, ctx.items.filter(function (entry) { return entry.id !== options.itemId; }), '已移除这个安排。');
  }
  function replaceItem(options) {
    var ctx = context(options), index = ctx.items.findIndex(function (entry) { return entry.id === options.itemId; });
    if (index < 0) return fail('没有找到要替换的安排。');
    var old = ctx.items[index]; if (old.locked) return fail('航班和机场接送为固定节点，不能替换。');
    var check = validatePlace(options, ctx.items, old.id); if (!check.ok) return check;
    var p = check.place;
    ctx.items[index] = { id: old.id, placeKey: options.placeKey, time: options.time !== undefined ? options.time : old.time, duration: options.duration !== undefined ? Number(options.duration) : old.duration, locked: false, place: p, raw: p.raw || {}, name: p.name, city: cityOf(p), origin: 'custom' };
    return commit(options, ctx.items, '已替换，后面的安排与原定时间已保留。');
  }
  function coordinates(p) {
    var raw = p && (p.raw || p) || {};
    if (raw.coordinatesVerified === false || raw.lat == null || raw.lat === '' || (raw.lon == null && raw.lng == null) || raw.lon === '' || raw.lng === '') return null;
    var lat = Number(raw.lat), lon = Number(raw.lon == null ? raw.lng : raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (!lat && !lon)) return null;
    return { lat: lat, lon: lon };
  }
  function distanceKm(a, b) {
    var first = coordinates(a), second = coordinates(b); if (!first || !second) return null;
    var radians = Math.PI / 180, dlat = (second.lat - first.lat) * radians, dlon = (second.lon - first.lon) * radians;
    var h = Math.sin(dlat / 2) ** 2 + Math.cos(first.lat * radians) * Math.cos(second.lat * radians) * Math.sin(dlon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  }
  function regionOf(p) {
    if (!p) return '';
    var raw = p.raw || p, coord = coordinates(p), identity = normalized([p.name, raw.address].join(' '));
    if (cityOf(p) !== '富国岛' && !/北部|中部|南部/.test(raw.region || '')) return '';
    if (/melia|safari|vinwonders|grand world|ganh dau|bai dai/.test(identity)) return '北部';
    if (/sunset town|hon thom|an thoi|khem|sao beach|安泰|日落小镇|护国寺/.test(identity)) return '南部';
    if (/duong dong|阳东|舅舅庙/.test(identity)) return '中部';
    if (kindOf(p) === '交通' && coord && coord.lat > 9.9 && coord.lat < 10.5 && coord.lon > 103.7 && coord.lon < 104.15) return coord.lat >= 10.27 ? '北部' : coord.lat <= 10.13 ? '南部' : '中部';
    var explicit = text(raw.region || raw.zone || raw.area).match(/北部|中部|南部/g);
    if (explicit && new Set(explicit).size === 1) return explicit[0];
    if (coord && coord.lat > 9.9 && coord.lat < 10.5 && coord.lon > 103.7 && coord.lon < 104.15) return coord.lat >= 10.27 ? '北部' : coord.lat <= 10.13 ? '南部' : '中部';
    return '';
  }
  function regionWarnings(items, baseRegion) {
    baseRegion = baseRegion || '北部';
    var sequence = [baseRegion], unknown = false;
    (items || []).forEach(function (item) {
      var p = item.place || item; if (cityOf(p) !== '富国岛' || item.locked || kindOf(p) === '交通') return;
      var region = regionOf(p); if (!region) { unknown = true; return; }
      if (sequence[sequence.length - 1] !== region) sequence.push(region);
    });
    var messages = [], south = sequence.indexOf('南部') >= 0, central = sequence.indexOf('中部') >= 0;
    if (baseRegion === '北部' && south) messages.push('你住北部 Meliá；南部地点适合合并在同一天，出发前查看 Google Maps 路况与返程安排。');
    else if (baseRegion === '北部' && central) messages.push('这一天包含中部地点，建议把吃饭、购物一起安排，减少从北部酒店重复往返。');
    var reversals = 0, values = { '北部': 0, '中部': 1, '南部': 2 }, priorDirection = 0;
    sequence.forEach(function (region, i) { if (!i) return; var direction = Math.sign(values[region] - values[sequence[i - 1]]); if (priorDirection && priorDirection !== direction) reversals += 1; priorDirection = direction; });
    if (reversals >= 2 || sequence.length >= 5) messages.push('当前顺序多次跨区折返：' + sequence.join(' → ') + '。建议把同一区域的地点放在一起，再返回酒店。');
    if (unknown && (south || central)) messages.push('部分地点仅有店名，区域尚未核实；先确认门店位置，再把它加入跨岛路线。');
    return messages;
  }
  function timelineWarnings(data, trip, dayIndex, lookup) {
    var items = getDayItems(data, trip, dayIndex, lookup), warnings = [], day = (data.days || [])[dayIndex];
    if (!day) return warnings;
    function push(code, message, item) { warnings.push({ code: code, message: message, itemId: item && item.id || null }); }
    function clockLabel(value) { return (value >= 1440 ? '次日 ' : '') + ('0' + Math.floor(value / 60) % 24).slice(-2) + ':' + ('0' + value % 60).slice(-2); }
    function adjusted(item) { return item.origin === 'custom' || item.time !== time(item.raw.time) || item.duration !== duration(item.raw.duration, 60); }
    function flexible(item) { return /[–—-].*\d\d?:\d\d|后|待定/.test(item.raw.time || ''); }
    var cities = allowedCities(data, trip, dayIndex, lookup);
    items.forEach(function (item, i) {
      var start = minutes(item.time), previous = items[i - 1], end = start === null ? null : start + item.duration;
      if (item.city && cities.length && cities.indexOf(item.city) < 0) push('city', item.name + '位于' + item.city + '，与当天行程城市不同。', item);
      if (!item.locked && !item.time) push('unscheduled', item.name + '还没有安排时间，出门前请补齐。', item);
      if (start !== null && previous && minutes(previous.time) !== null && start < minutes(previous.time)) push('order', item.name + '的时间早于上一站，调整顺序后也需要核对时间。', item);
      if (!item.locked && previous && !previous.locked && start !== null && minutes(previous.time) !== null) {
        var previousStart = minutes(previous.time), previousEnd = previousStart + previous.duration;
        // Original flexible arrival/lunch ranges overlap by design. A custom
        // stop or an edited exact time still needs the same conflict check.
        var originalFlexibility = !adjusted(item) && !adjusted(previous) && (flexible(item) || flexible(previous));
        if (!originalFlexibility && start < previousEnd && previousStart < end) push('overlap', '「' + previous.name + '」预计停留至 ' + clockLabel(previousEnd) + '，与 ' + item.time + ' 的「' + item.name + '」时间重叠；尚未计入路程。请调整时间或停留时长，当前顺序已保留。', item);
      }
      if (!item.locked && end !== null) {
        var anchor = items.slice(i + 1).find(function (entry) { return entry.locked && minutes(entry.time) !== null; });
        if (anchor && end > minutes(anchor.time)) push('cutoff', item.name + '预计停留至 ' + ('0' + Math.floor(end / 60)).slice(-2) + ':' + ('0' + end % 60).slice(-2) + '，会挤占 ' + anchor.time + ' 的固定安排「' + anchor.name + '」。此处还未计入路上时间。', item);
        else if (anchor && minutes(anchor.time) - end < 30) push('buffer', item.name + '结束后距 ' + anchor.time + ' 的固定安排不足 30 分钟；请再按实际路况留出余量。', item);
        if (previous && previous.locked && start < minutes(previous.time) + previous.duration && !(item.origin === 'default' && /[–—-].*\d\d?:\d\d/.test(item.raw.time || ''))) push('arrival', item.name + '开始时间与前一段航班或机场接送重叠，请延后。', item);
      }
      if (item.locked && /机场|SGN|PQC/i.test(item.name)) push('anchor', item.time + ' ' + item.name + '为固定节点；航站楼和航班变动以航司通知为准。', item);
    });
    var flights = items.filter(function (item) { return isFlight(item.raw); });
    flights.forEach(function (flight) {
      var departure = minutes(flight.time), arrival = departure + flight.duration, from = /PQC\s*(?:→|->)/i.test(flight.name) ? '富国岛' : '胡志明市', to = from === '富国岛' ? '胡志明市' : '富国岛';
      items.filter(function (item) { return !item.locked && item.origin === 'custom' && item.time; }).forEach(function (item) {
        var at = minutes(item.time);
        if ((item.city === to && at < arrival) || (item.city === from && at >= departure)) push('flight-city', item.name + '的城市或时间与 ' + flight.time + ' 航班冲突：抵达后才能安排目的地活动。', item);
      });
    });
    regionWarnings(items).forEach(function (message) { push('region', message); });
    return warnings;
  }
  function suggestedDuration(p) {
    var raw = p.raw || {}, known = raw.durationMinutes || raw.duration;
    if (known) return duration(known, 60);
    if (kindOf(p) === '攀岩') return 120;
    if (kindOf(p) === '衣服') return 90;
    if (/乐园|safari|vinwonders|aquatopia/i.test([p.name, raw.kind].join(' '))) return 240;
    return kindOf(p) === '玩乐' ? 90 : 60;
  }
  function indoor(p) { return !!(p.raw || {}).indoor || /攀岩|博物馆|美术馆|水族馆|商场/.test([p.kind, (p.raw || {}).kind, p.name].join(' ')); }
  function outdoor(p) { return /海滩|沙滩|缆车|跳岛|safari|动物园|步行街|公园|码头|寺|花园/i.test([p.name, (p.raw || {}).kind].join(' ')); }
  function identity(p) { return [cityOf(p), kindOf(p), normalized(p.name).replace(/\s*(早餐|午餐|晚餐|外观|夜线)\s*$/, '')].join('|'); }
  function recommend(options) {
    options = options || {}; var excluded = options.excludeKeys || [], origin = options.origin, city = options.city || cityOf(origin), budget = Number(options.budgetMinutes) || 0;
    var rain = options.weather === 'rain' || /下雨|雨天|rain/.test(options.reason || ''), tired = /太累|累了|tired/.test(options.reason || '');
    var targetKind = options.kind && options.kind !== 'all' ? ({ '吃饭': '吃喝', '逛街': '衣服' }[options.kind] || options.kind) : null;
    var originRegion = regionOf(origin), used = {}, results = [];
    (options.places || []).forEach(function (p) {
      if (!p || excluded.indexOf(p.key) >= 0 || (p.aliasKeys || []).some(function (key) { return excluded.indexOf(key) >= 0; })) return;
      if (city && cityOf(p) !== city) return;
      var kind = kindOf(p); if (kind === '交通' || kind === '住宿' || (targetKind && kind !== targetKind)) return;
      if (rain && outdoor(p) && !indoor(p)) return;
      if (tired && (kind === '攀岩' || /乐园|safari|vinwonders|aquatopia|跳岛/i.test([p.name, (p.raw || {}).kind].join(' ')))) return;
      var stay = suggestedDuration(p), distance = distanceKm(origin, p), region = regionOf(p), key = identity(p), reasons = [], score = 0;
      if (budget && stay > budget) return;
      if (used[key]) return; used[key] = true;
      var knownDuration = !!((p.raw || {}).duration || (p.raw || {}).durationMinutes);
      reasons.push((knownDuration ? '资料中的停留时长约 ' : '建议预留 ') + stay + ' 分钟' + (budget ? '，符合这次可用时间；路程另计' : '；路程另计'));
      if (distance !== null) { score += Math.max(-20, 30 - distance * 2); reasons.push('距出发点直线约 ' + (distance < 1 ? distance.toFixed(1) : Math.round(distance)) + ' 公里，实际路线以地图为准'); }
      else if (originRegion && region && originRegion === region) { score += 20; reasons.push('和出发点同在' + region + '，可一起安排'); }
      if (originRegion && region && originRegion !== region) { score -= 15; reasons.push('需要从' + originRegion + '前往' + region + '，建议合并同区行程'); if (budget && budget <= 60) return; }
      if (rain && indoor(p)) { score += 25; reasons.push('有室内活动，适合雨天替换'); }
      else if (rain) reasons.push('先核对是否有室内座位与到店遮雨条件');
      if (tired && kind === '吃喝') { score += 15; reasons.push('可以坐下休息、吃点东西'); }
      var sourceCount = (p.sources || []).length; score += Math.min(sourceCount, 3) * 3;
      if (sourceCount) reasons.push('附 ' + sourceCount + ' 篇参考帖，可先看真实体验');
      reasons.push('营业与排队情况请到店前确认');
      results.push({ place: p, score: score, reasons: reasons, distanceKm: distance, durationMinutes: stay, durationEstimated: !knownDuration });
    });
    return results.sort(function (a, b) { return b.score - a.score || a.place.name.localeCompare(b.place.name); }).slice(0, 3);
  }
  function mapTarget(p) {
    var raw = p.raw || p, coords = coordinates(p);
    if (coords) return coords.lat + ',' + coords.lon;
    var address = raw.addressVerified === true ? raw.address : '', query = raw.query || [p.name, address].filter(Boolean).join(' ');
    return query ? query + ' ' + (cityOf(p) === '富国岛' ? 'Phu Quoc' : 'Ho Chi Minh City') + ' Vietnam' : '';
  }
  function routeLinks(items) {
    var groups = [], group = [], lastCity = '';
    function flush() { if (group.length >= 2) groups.push(group); group = []; lastCity = ''; }
    (items || []).forEach(function (item) {
      var p = item.place || item, raw = item.raw || p.raw || {}, city = cityOf(p);
      if (isFlight(raw)) { flush(); return; }
      var target = mapTarget(p); if (!target || !city) { flush(); return; }
      if (lastCity && city !== lastCity) flush();
      if (!group.length || group[group.length - 1].target !== target) group.push({ target: target, name: p.name || raw.name, placeKey: item.placeKey || p.key, city: city });
      lastCity = city;
    }); flush();
    var links = [];
    groups.forEach(function (stops) {
      for (var offset = 0; offset < stops.length - 1; offset += 4) {
        var chunk = stops.slice(offset, offset + 5), url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(chunk[0].target) + '&destination=' + encodeURIComponent(chunk[chunk.length - 1].target);
        if (chunk.length > 2) url += '&waypoints=' + encodeURIComponent(chunk.slice(1, -1).map(function (stop) { return stop.target; }).join('|'));
        links.push({ url: url, label: chunk[0].city + '路线 ' + (links.length + 1) + ' · ' + chunk.length + ' 站', city: chunk[0].city, stops: chunk });
      }
    });
    return links;
  }
  var api = { normalizeTrip: normalizeTrip, getDayItems: getDayItems, addToDay: addToDay, moveItem: moveItem, removeItem: removeItem, replaceItem: replaceItem, timelineWarnings: timelineWarnings, regionWarnings: regionWarnings, regionOf: regionOf, recommend: recommend, routeLinks: routeLinks, distanceKm: distanceKm, coordinates: coordinates, suggestedDuration: suggestedDuration, validTime: validTime, cityOf: cityOf };
  root.PocketPlanner = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
