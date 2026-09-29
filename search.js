(function (root) {
  "use strict";

  function normalize(value) {
    return String(value == null ? "" : value).normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase()
      .replace(/[’‘]/g, "'").replace(/[^a-z0-9\u3400-\u9fff]+/g, " ").trim().replace(/\s+/g, " ");
  }

  // Names are aliases, not extra recommendations. They do not add words from
  // a linked roundup to every place mentioned by that roundup.
  var aliasGroups = [
    ["胡志明市", "胡志明市", "胡志明", "西贡", "ho chi minh city", "ho chi minh", "hcmc", "saigon", "sai gon"],
    ["富国岛", "富国岛", "富国", "phu quoc"],
    ["melia", "美利亚", "美利雅", "美丽亚", "melia"],
    ["m village", "modern village lifestyle", "m village", "美村"],
    ["vinwonders", "珍珠游乐园", "珍珠乐园", "vin wonders", "vinwonders"],
    ["safari", "野生动物园", "珍珠动物园", "safari"],
    ["hon thom", "hon thom", "香岛"],
    ["grand world", "grand world", "富国大世界", "大世界"],
    ["sunset town", "sunset town", "日落小镇"],
    ["coffee", "咖啡", "coffee", "cafe"],
    ["seafood", "海鲜", "seafood"],
    ["hotel", "酒店", "住宿", "hotel", "hotels", "resort"],
    ["北部", "北部", "北边", "北区"],
    ["南部", "南部", "南边", "南区"],
    ["中部", "中部", "中区"],
    ["缆车", "缆车", "cable car"],
    ["法棍", "法棍", "banh mi"],
    ["河粉", "越南粉", "越南河粉", "河粉", "pho"],
    ["吃喝", "吃喝", "特色美食", "当地美食", "美食", "food"],
    ["玩乐", "玩乐", "好玩去处", "好玩的地方", "好玩", "景点"],
    ["衣服", "好看衣服", "买衣服", "衣服", "服装", "购物", "穿搭", "clothing", "fashion", "shopping"],
    ["攀岩", "攀岩馆", "攀岩", "抱石", "rock climbing", "bouldering", "climbing"],
    ["机场", "机场", "airport"],
    ["雨天", "下雨天", "下雨", "雨天", "雨备", "避雨"],
    ["沙滩", "沙滩", "海滩", "beach"]
  ];
  var aliasLookup = {};
  aliasGroups.forEach(function (group) {
    group.slice(1).forEach(function (alias) { aliasLookup[normalize(alias)] = group[0]; });
  });
  var aliasPattern = new RegExp(Object.keys(aliasLookup).sort(function (a, b) { return b.length - a.length; }).map(function (alias) {
    var escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return /^[a-z0-9]/.test(alias) ? "\\b" + escaped + "\\b" : escaped;
  }).join("|"), "g");

  function canonical(value) {
    return normalize(value).replace(aliasPattern, function (word) { return " " + aliasLookup[word] + " "; }).trim().replace(/\s+/g, " ");
  }
  function tokens(value) {
    return canonical(value).match(/[a-z0-9]+|[\u3400-\u9fff]+/g) || [];
  }
  function contains(text, word) {
    if (/^[a-z0-9]+$/.test(word)) return text.split(/\s+/).some(function (part) { return part.indexOf(word) === 0; });
    return text.indexOf(word) !== -1;
  }
  function cities(value) {
    var text = canonical(value), found = [];
    ["胡志明市", "富国岛"].forEach(function (city) { if (text.indexOf(city) !== -1) found.push(city); });
    return found;
  }
  function compactName(value) {
    return canonical(String(value || "").replace(/\s*(早餐|午餐|晚餐|外观|夜线)\s*$/, ""));
  }
  function regions(value) {
    var text = canonical(value);
    return ["北部", "南部", "中部"].filter(function (region) { return text.indexOf(region) !== -1; });
  }
  function coordinateRegion(p) {
    var raw = p.raw || {}, lat = Number(raw.lat), lon = Number(raw.lon);
    if (p.area !== "富国岛" || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 9.9 || lat > 10.5 || lon < 103.7 || lon > 104.15) return null;
    return lat >= 10.27 ? "北部" : lat <= 10.13 ? "南部" : "中部";
  }
  function placeRegion(p) {
    var raw = p.raw || {};
    // A transport stop's zone describes its day's route, while the map point
    // describes the destination (e.g. returning north to Melia from the south).
    if (p.kind === "交通" && coordinateRegion(p)) return coordinateRegion(p);
    var explicit = regions([raw.zone, raw.area].filter(Boolean).join(" "));
    if (explicit.length === 1) return explicit[0];
    var identity = canonical([p.name, raw.area, raw.address].filter(Boolean).join(" "));
    if (/melia|safari|vinwonders|grand world|bai dai|ganh dau/.test(identity)) return "北部";
    if (/sunset town|hon thom|an thoi|khem|sao beach|安泰/.test(identity)) return "南部";
    if (/duong dong|阳东|舅舅庙/.test(identity)) return "中部";
    return coordinateRegion(p);
  }
  function unique(values) { return Array.from(new Set(values)); }
  function completeness(p) {
    var raw = p.raw || {};
    return (p.type === "discovery" ? 20000 : p.type === "food" || p.type === "hotel" ? 10000 : 0) +
      [raw.address, raw.order, raw.query, raw.stay, raw.best, raw.watch].filter(Boolean).length * 100 +
      String(p.note || "").length + (p.sources || []).length * 10;
  }
  function branchAddress(p) { return normalize((p.raw || {}).address || ""); }

  function deduplicate(list) {
    var groups = [];
    list.forEach(function (p) {
      var identity = [p.area, p.kind, compactName(p.name)].join("|");
      var address = branchAddress(p);
      var group = groups.find(function (g) {
        return g.identity === identity && (!address || !g.address || address === g.address);
      });
      if (!group) { group = { identity: identity, address: address, members: [] }; groups.push(group); }
      if (!group.address) group.address = address;
      group.members.push(p);
    });
    return groups.map(function (g) {
      var sorted = g.members.slice().sort(function (a, b) { return completeness(b) - completeness(a); });
      var best = sorted[0];
      var copy = Object.assign({}, best, {
        sources: unique(sorted.flatMap(function (p) { return p.sources || []; })),
        aliasKeys: sorted.map(function (p) { return p.key; })
      });
      return { place: copy, members: sorted };
    });
  }

  function placeFields(p) {
    var raw = p.raw || {};
    var identity = canonical(p.name);
    var extra = [];
    if (/signature hai ba trung/.test(identity)) extra.push("m village hotel");
    if (/melia/.test(identity)) extra.push("北部");
    if (/safari/.test(identity)) extra.push("动物园 北部");
    if (/vinwonders/.test(identity)) extra.push("乐园 北部");
    if (/grand world/.test(canonical(raw.area || ""))) extra.push("北部");
    return {
      name: canonical([p.name, extra.join(" ")].join(" ")),
      location: canonical([p.area, raw.city, raw.area, raw.zone, raw.address, raw.query].filter(Boolean).join(" ")),
      detail: canonical([p.note, raw.note, raw.order, raw.why, raw.best, raw.watch, raw.travel, raw.visit, raw.stay, raw.kind].filter(Boolean).join(" ")),
      rain: raw.rain ? canonical("雨天 " + raw.rain) : "",
      category: canonical([p.kind].concat(raw.topics || []).join(" "))
    };
  }
  function topicMatches(topic, topics, kind, text, strict) {
    if (!topic || topic === "all") return true;
    var wanted = canonical(topic), assigned = (topics || []).map(canonical);
    if (assigned.indexOf(wanted) !== -1) return true;
    if (strict) return false;
    if (["吃喝", "玩乐", "衣服", "攀岩"].indexOf(wanted) !== -1) return canonical(kind) === wanted;
    // Curated topic labels are authoritative. A warning about an unrelated
    // activity must not turn a clothing shop into a climbing recommendation.
    if (assigned.length) return false;
    return wanted === "河粉" && canonical(kind) === "吃喝" && contains(canonical(text), wanted);
  }
  function sourceKinds(s, linkedKinds) {
    var assigned = (s.topics || []).map(canonical);
    var explicit = assigned.map(function (topic) { return topic === "河粉" ? "吃喝" : topic; }).filter(function (topic) {
      return ["吃喝", "玩乐", "衣服", "攀岩", "住宿", "交通"].indexOf(topic) !== -1;
    });
    if (explicit.length) return unique(explicit);
    var text = canonical([s.title, s.topic, s.summary].join(" "));
    var kinds = [];
    if (/吃|喝|餐|美食|河粉|法棍|coffee|seafood|披萨|火锅|food|pizza/.test(text)) kinds.push("吃喝");
    if (/hotel|住客|入住|别墅|度假村/.test(text)) kinds.push("住宿");
    if (/机场|航班|交通|接驳|包车|打车|grab|巴士|公交|航站楼/.test(text)) kinds.push("交通");
    if (/玩|游|缆车|safari|vinwonders|乐园|博物馆|公园|教堂|沙滩|city walk|citywalk|sunset town|grand world|步行街/.test(text)) kinds.push("玩乐");
    if (/衣服/.test(text)) kinds.push("衣服");
    return unique(kinds.concat((linkedKinds || []).filter(function (kind) { return kind !== '攀岩'; })));
  }
  function match(fields, words, full, name) {
    if (!words.length) return { score: 0, fields: [] };
    var matched = [], score = 0;
    var names = Object.keys(fields);
    var all = words.every(function (word) {
      var hit = names.filter(function (field) { return contains(fields[field], word); });
      if (!hit.length) return false;
      matched = matched.concat(hit);
      score += hit.indexOf("name") !== -1 ? 40 : hit.indexOf("location") !== -1 ? 12 : 6;
      return true;
    });
    if (!all) return null;
    if (full && name === full) score += 400;
    else if (full && name.indexOf(full) === 0) score += 150;
    else if (full && name.indexOf(full) !== -1) score += 120;
    if (words.every(function (word) { return contains(fields.name || "", word); })) score += 60;
    return { score: score, fields: unique(matched) };
  }

  function create(placeList, sourceList) {
    var grouped = deduplicate(placeList || []);
    var sourceArray = Array.isArray(sourceList) ? sourceList : Object.keys(sourceList || {}).map(function (key) { return sourceList[key]; });
    var sourceById = {};
    sourceArray.forEach(function (s) { sourceById[s.id] = s; });
    var linkedKinds = {};
    (placeList || []).forEach(function (p) {
      (p.sources || []).forEach(function (id) { (linkedKinds[id] || (linkedKinds[id] = [])).push(p.kind); });
    });
    var indexedPlaces = grouped.map(function (group, index) {
      var fields = {};
      group.members.forEach(function (p) {
        var memberFields = placeFields(p);
        Object.keys(memberFields).forEach(function (key) { fields[key] = (fields[key] || "") + " " + memberFields[key]; });
      });
      return { place: group.place, fields: fields, region: group.members.map(placeRegion).filter(Boolean)[0] || null, name: compactName(group.place.name), index: index };
    });
    var indexedSources = sourceArray.map(function (s, index) {
      return { source: s, cities: cities(s.region), kinds: sourceKinds(s, linkedKinds[s.id]), index: index, fields: {
        name: canonical(s.title), location: canonical(s.region), detail: canonical([s.author, s.topic, s.summary].concat(s.topics || []).join(" ")),
        category: canonical(sourceKinds(s, linkedKinds[s.id]).join(" "))
      } };
    });
    return {
      search: function (query, options) {
        options = options || {};
        var full = canonical(query);
        var words = unique(tokens(query));
        // A restaurant called MADAM SAIGON is on Phu Quoc. A complete venue
        // name is an identity query; its branding is not a city constraint.
        var exactVenue = !!full && indexedPlaces.some(function (entry) { return entry.name === full; });
        var requestedCities = exactVenue ? [] : cities(query);
        var requestedRegions = exactVenue ? [] : regions(query);
        var cityConflict = requestedCities.length > 1 || (options.area && options.area !== "all" && requestedCities.length && requestedCities[0] !== options.area);
        var selectedCity = options.area && options.area !== "all" ? options.area : requestedCities[0];
        var remainingWords = exactVenue ? words : words.filter(function (word) { return word !== "胡志明市" && word !== "富国岛"; });
        var placeWords = remainingWords.filter(function (word) { return requestedRegions.indexOf(word) === -1; });
        var rainyQuery = words.indexOf("雨天") !== -1;
        var requestedKinds = exactVenue ? [] : ["衣服", "攀岩"].filter(function (kind) { return words.indexOf(kind) !== -1; });
        var selectedKind = options.kind && options.kind !== "all" ? options.kind : requestedKinds.length === 1 ? requestedKinds[0] : null;
        var selectedWindow = options.window || "recent";
        // In the curated month view, typing a theme has the same meaning as
        // choosing its chip. Incidental mentions in travel tips are not a match.
        var queryTopics = selectedWindow === 'month' && !exactVenue ? words.filter(function (word) {
          return ['河粉', '吃喝', '玩乐', '衣服', '攀岩'].indexOf(word) !== -1;
        }) : [];
        var selectedTopics = unique((options.topic && options.topic !== 'all' ? [canonical(options.topic)] : []).concat(queryTopics));
        if (queryTopics.length) {
          remainingWords = remainingWords.filter(function (word) { return queryTopics.indexOf(word) === -1; });
          placeWords = placeWords.filter(function (word) { return queryTopics.indexOf(word) === -1; });
        }
        if (cityConflict) return { places: [], sources: [], terms: words, totalPlaces: 0, totalSources: 0 };
        var places = indexedPlaces.filter(function (entry) {
          return (!selectedCity || entry.place.area === selectedCity) && (!selectedKind || entry.place.kind === selectedKind) &&
            (selectedWindow !== "month" || entry.place.sources.some(function (id) { return sourceById[id] && sourceById[id].inMonthWindow === true; })) &&
            groupTopicMatches(entry) &&
            (!requestedRegions.length || (requestedRegions.length === 1 && entry.region === requestedRegions[0]));
        }).map(function (entry) {
          var fields = Object.assign({}, entry.fields);
          if (!rainyQuery) delete fields.rain;
          var hit = match(fields, placeWords, full, entry.name);
          if (hit) hit.score += entry.place.type === "hotel" ? 8 : entry.place.type === "food" ? 5 : 0;
          return hit ? { entry: entry, hit: hit } : null;
        }).filter(Boolean).sort(function (a, b) { return b.hit.score - a.hit.score || a.entry.index - b.entry.index; }).map(function (result) {
          return Object.assign({}, result.entry.place, { matchedBy: result.hit.fields.indexOf("name") !== -1 ? "名称匹配" : result.hit.fields.indexOf("detail") !== -1 ? "点单 / 说明匹配" : "区域 / 分类匹配" });
        });
        var sources = indexedSources.filter(function (entry) {
          return (selectedWindow === "all" || (selectedWindow === "month" ? entry.source.inMonthWindow === true : entry.source.inRecentWindow === true)) &&
            (!selectedCity || entry.cities.indexOf(selectedCity) !== -1) && (!selectedKind || entry.kinds.indexOf(selectedKind) !== -1) &&
            selectedTopics.every(function (topic) { return entry.kinds.some(function (kind) { return topicMatches(topic, entry.source.topics, kind, entry.source.title + " " + entry.source.summary, selectedWindow === 'month'); }); });
        }).map(function (entry) {
          var hit = match(entry.fields, remainingWords, full, canonical(entry.source.title));
          return hit ? { entry: entry, hit: hit } : null;
        }).filter(Boolean).sort(function (a, b) {
          return b.hit.score - a.hit.score || String(b.entry.source.date).localeCompare(String(a.entry.source.date)) || a.entry.index - b.entry.index;
        }).map(function (result) { return result.entry.source; });
        return { places: places, sources: sources, terms: words, totalPlaces: places.length, totalSources: sources.length };
        function groupTopicMatches(entry) {
          var p = entry.place, raw = p.raw || {};
          return selectedTopics.every(function (topic) { return topicMatches(topic, raw.topics, p.kind, p.name + " " + (raw.order || ""), selectedWindow === 'month'); });
        }
      }
    };
  }
  root.PocketSearch = { normalize: normalize, create: create };
}(typeof window !== "undefined" ? window : globalThis));
