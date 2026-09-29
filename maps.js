(function (root) {
  'use strict';
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function coords(p) {
    var r = p && (p.raw || p) || {}, longitude = r.lon == null ? r.lng : r.lon;
    if (r.coordinatesVerified === false || r.lat == null || longitude == null || String(r.lat).trim() === '' || String(longitude).trim() === '') return null;
    var lat = Number(r.lat), lon = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat !== 0 || lon !== 0) ? [lat, lon] : null;
  }
  function city(p) {
    var r = p && (p.raw || p) || {}, value = String(r.city || p && p.city || p && p.area || r.area || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/富国|phu quoc|pqc/.test(value)) return '富国岛';
    if (/胡志明|西贡|ho chi minh|saigon|sai gon|hcm|sgn/.test(value)) return '胡志明市';
    var xy = coords(p);
    if (xy && xy[0] > 9.9 && xy[0] < 10.5 && xy[1] > 103.7 && xy[1] < 104.15) return '富国岛';
    if (xy && xy[0] > 10.3 && xy[0] < 11.2 && xy[1] > 106.2 && xy[1] < 107.1) return '胡志明市';
    return '';
  }
  function distance(a, b) { var x = coords(a), y = coords(b); if (!x || !y) return null; var rad = Math.PI / 180, dlat = (y[0]-x[0])*rad, dlon = (y[1]-x[1])*rad; var h = Math.sin(dlat/2)**2 + Math.cos(x[0]*rad)*Math.cos(y[0]*rad)*Math.sin(dlon/2)**2; h=Math.min(1,Math.max(0,h)); return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)); }
  function query(p) { p=p||{};var r = p.raw || p, xy = coords(p), name=r.originalName || r.name || p.name || '', location=city(p); return xy ? xy.join(',') : r.addressVerified && r.address ? name + ' ' + r.address : (r.query || name) + (location ? ' ' + (location === '富国岛' ? 'Phu Quoc' : 'Ho Chi Minh City') : '') + ' Vietnam'; }
  function backup(p, fallbackCity) {
    var xy=coords(p), location=city(p)||fallbackCity||'胡志明市', exact=!!xy;
    // These are broad city/island overview centers, never inferred shop pins.
    if(!xy) xy=location==='富国岛'?[10.21,103.96]:[10.7769,106.7009];
    var url='https://www.openstreetmap.org/'+(exact?'?mlat='+xy[0]+'&mlon='+xy[1]:'')+'#map='+(exact?'16':location==='富国岛'?'10':'13')+'/'+xy[0]+'/'+xy[1];
    return {url:url,label:'备用地图 · OpenStreetMap',note:exact?'打开当前地点的已有坐标。':'当前店铺暂无核实坐标，将显示'+location+'概览，不代表门店位置。',exact:exact};
  }
  function flight(name) { return /(?:PQC|SGN).*(?:→|->)|(?:→|->).*(?:PQC|SGN)|起飞/.test(name || ''); }
  function normalize(items) {
    var result=[],segment=0,lastCity='';
    (items || []).forEach(function (item) {
      if(!item)return;var p = item.place || item, r = p.raw || item.raw || p,name=p.name||r.name;
      if(flight(name)){segment+=1;lastCity='';return;}
      var location=city(p);
      if(lastCity&&location&&location!==lastCity)segment+=1;
      if(location)lastCity=location;
      var point={name:name,key:p.key || item.placeKey || r._key || r.id || '',city:location,kind:p.kind || r.kind || '',raw:r,routeSegment:Number.isInteger(p.routeSegment)?p.routeSegment:segment};
      if(point.name&&!/补充住宿|入住与休息/.test(point.name)&&(coords(point)||r.query||r.addressVerified))result.push(point);
    });
    return result;
  }
  function directions(items, mode) {
    var points=normalize(items),groups=[],group=[],links=[];
    points.forEach(function(point){var previous=group[group.length-1];if(previous&&(point.city!==previous.city||point.routeSegment!==previous.routeSegment)){groups.push(group);group=[];previous=null;}if(!previous||query(previous)!==query(point))group.push(point);});if(group.length)groups.push(group);
    groups.forEach(function(stops){
      if(stops.length===1){links.push({label:'在 Google Maps 查看'+(groups.length>1?' · '+stops[0].city:''),url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query(stops[0])),city:stops[0].city,stopKeys:[stops[0].key]});return;}
      for(var i=0;i<stops.length-1;i+=4){
        var chunk=stops.slice(i,i+5),url='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(query(chunk[0]))+'&destination='+encodeURIComponent(query(chunk[chunk.length-1]))+'&travelmode='+(mode==='walking'?'walking':'driving');
        if(chunk.length>2)url+='&waypoints='+encodeURIComponent(chunk.slice(1,-1).map(query).join('|'));
        links.push({label:stops.length>5||groups.length>1?'导航第'+(links.length+1)+'段 · '+stops[0].city+' '+(i+1)+'—'+(i+chunk.length)+'站':'在 Google Maps 规划整段路线',url:url,city:stops[0].city,stopKeys:chunk.map(function(p){return p.key;})});
      }
    });
    return links;
  }
  function render(host, options) {
    if (!host) return;
    options=options || {}; var all=normalize(options.items), cityList=Array.from(new Set(all.map(function (p) { return p.city; }).filter(Boolean)));
    var selectedCity=cityList[0] || options.city || '胡志明市', selectedIndex=0, mode='driving';
    var active=all.filter(function (p) {return !p.city || p.city === selectedCity;});
    host.classList.add('real-map');
    host.innerHTML='<div class="google-map-toolbar"><strong>Google 地图</strong><span>可缩放 · 查看真实街道</span></div>'+(cityList.length>1 ? '<label class="map-city-label">地图城市<select data-gmap-city aria-label="地图城市">'+cityList.map(function (c) {return '<option>'+esc(c)+'</option>';}).join('')+'</select></label>':'')+'<div class="google-map-frame"><iframe title="Google 真实街道地图" referrerpolicy="no-referrer-when-downgrade" allowfullscreen loading="lazy"></iframe></div><p class="google-map-hint">地图需要联网。在中国大陆网络下，Google 地图可能加载不出，可尝试下方备用地图；页面仍显示站点与已知坐标间的直线距离。</p><div class="google-map-current" aria-live="polite"></div><div class="google-map-backup"></div><div class="google-map-stops" aria-label="切换地图站点"></div><div class="google-map-mode"><label>出行方式<select data-gmap-mode aria-label="地图出行方式"><option value="driving">打车 / 驾车</option><option value="walking">步行</option></select></label><button class="btn-subtle" data-gmap-reload>重载地图</button></div><div class="google-map-links"></div><p class="meta map-distance-note">站点清单显示的是相邻站点直线距离，不是道路里程；实际车程与道路路线在 Google Maps 中查看。</p>'+(options.offlineSvg ? '<details class="offline-route"><summary>离线路线示意</summary>'+options.offlineSvg+'</details>':'');
    function show(index) {
      selectedIndex=Math.max(0,Math.min(active.length-1,index)); var p=active[selectedIndex];
      var q=p ? query(p) : selectedCity==='富国岛' ? 'Phu Quoc Vietnam' : 'Ho Chi Minh City Vietnam';
      host.querySelector('iframe').src='https://maps.google.com/maps?hl=zh-CN&q='+encodeURIComponent(q)+'&z='+(selectedCity==='富国岛' ? '12':'15')+'&output=embed';
      host.querySelector('.google-map-current').innerHTML='<strong>'+(p ? (selectedIndex+1)+'. '+esc(p.name) : esc(selectedCity))+'</strong><a class="btn" href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q)+'">打开 Google Maps ↗</a>'+(p && !coords(p) && !p.raw.addressVerified ? '<small>按店名检索，具体分店需在地图中确认。</small>':'');
      var alternative=backup(p,selectedCity);host.querySelector('.google-map-backup').innerHTML='<a class="btn" href="'+esc(alternative.url)+'" target="_blank" rel="noopener noreferrer">'+esc(alternative.label)+' ↗</a><small>'+esc(alternative.note)+'</small>';
      host.querySelector('.google-map-stops').innerHTML=active.map(function (point,i) { var newPart=i===0||active[i-1].routeSegment!==point.routeSegment,d=newPart?null:distance(active[i-1],point); return '<button class="map-stop-select'+(i===selectedIndex?' active':'')+'" data-gmap-point="'+i+'" aria-pressed="'+(i===selectedIndex)+'"><b>'+(i+1)+'</b><span>'+esc(point.name)+'<small>'+(newPart?(i===0?'起点':'新一段起点'):d == null?'距离待定位':d<0.005?'同一定位点':(d<1 ? Math.round(d*1000)+'米':d.toFixed(1)+'公里')+' · 距上一站直线')+'</small></span></button>';}).join('') || '<p class="notice">这一天还没有可定位的地点，可从发现页加入。</p>';
      host.querySelector('.google-map-links').innerHTML=directions(active,mode).map(function (link) {return '<a class="btn btn-primary" href="'+esc(link.url)+'">'+esc(link.label)+' ↗</a>';}).join('');
    }
    host.onclick=function (event) { var b=event.target.closest('button'); if (!b) return; if (b.dataset.gmapPoint!==undefined) show(Number(b.dataset.gmapPoint)); if (b.hasAttribute('data-gmap-reload')) show(selectedIndex); };
    host.onchange=function (event) { if (event.target.hasAttribute('data-gmap-city')) {selectedCity=event.target.value;active=all.filter(function(p){return !p.city||p.city===selectedCity;});show(0);} if (event.target.hasAttribute('data-gmap-mode')) {mode=event.target.value;show(selectedIndex);} };
    show(0);
  }
  root.PocketMaps={render:render,coords:coords,city:city,distance:distance,normalize:normalize,query:query,directions:directions,backup:backup};
}(typeof window!=='undefined'?window:globalThis));
