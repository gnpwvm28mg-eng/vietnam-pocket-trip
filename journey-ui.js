(function(root) {
  'use strict';
  function create(ctx) {
    var P=root.PocketPlanner, esc=ctx.esc, selectedGeo=null, replaceTarget=null;
    function $(id) {return document.getElementById(id);}
    function options(extra) {return Object.assign({data:ctx.data,trip:ctx.getTrip(),dayIndex:ctx.getState().day,placeLookup:ctx.places},extra||{});}
    function items(di) {return P.getDayItems(ctx.data,ctx.getTrip(),di,ctx.places);}
    function apply(result) {if (!result.ok) {ctx.toast(result.message);return false;} ctx.commit(result.trip,result.message);return true;}
    function action(name,label,key,cls) {return '<button type="button" class="'+(cls||'btn')+'" data-journey="'+name+'"'+(key?' data-key="'+esc(key)+'"':'')+'>'+label+'</button>';}
    function dayOptions(selected) {return ctx.data.days.map(function(d,i){return '<option value="'+i+'"'+(i===selected?' selected':'')+'>'+ctx.dateLabel(i)+' · '+esc(i===6?'胡志明收尾':d.place)+'</option>';}).join('');}
    function editForm(p,old) {
      var di=ctx.getState().day, duration=old?old.duration:P.suggestedDuration(p);
      ctx.open('<div class="detail-eyebrow">'+(old?'调整安排':'放进行程')+'</div><h2>'+esc(p.name)+'</h2><p class="detail-lead">选择日期、开始时间和预计停留。航班与机场节点会保留，冲突会在当天提醒。</p><form id="journey-edit-form" data-place="'+esc(p.key)+'" data-item="'+esc(old?old.id:'')+'"><label class="form-field"><span>安排在哪一天</span><select name="day"'+(old?' disabled':'')+'>'+dayOptions(di)+'</select></label><div class="journey-fields"><label class="form-field"><span>开始时间 · 越南当地</span><input type="time" name="time" value="'+esc(old?old.time:'')+'"></label><label class="form-field"><span>预计停留（分钟）</span><input name="duration" type="number" min="1" max="1440" required value="'+duration+'"></label></div>'+(p.raw.visit?'<p class="notice">'+esc(p.raw.visit)+'</p>':'')+'<button class="btn btn-primary" type="submit">'+(old?'保存调整':'加入当天')+'</button></form>');
    }
    function renderPlan() {
      var state=ctx.getState(),trip=ctx.getTrip(),di=state.day,d=ctx.data.days[di],list=items(di),personal=Array.isArray((trip.plans||{})[d.id]);
      var meaningful=list.filter(function(item){return !/补充住宿、返程或自由安排/.test(item.name);});
      if (di===6 && !personal) meaningful=[];
      var warnings=P.timelineWarnings(ctx.data,trip,di,ctx.places).filter(function(w){return w.code!=='anchor'&&w.code!=='region'&&(!w.itemId||meaningful.some(function(item){return item.id===w.itemId;}));});
      var regions=P.regionWarnings(meaningful,'北部');
      if (root.PocketMaps) root.PocketMaps.render($('route-map'),{items:meaningful,city:di===6?'胡志明市':ctx.area(d.place),offlineSvg:personal?'':(d.variants[state.variant]||d.variants[0]||{}).mapSvg});
      $('route-meta').textContent=(personal?'自定义行程 · ':'')+(/两段都执行/.test(d.rule)?'已合并当天两段安排；地图可逐站切换。':'按当天顺序打开地图；道路里程与车程以 Google Maps 为准。');
      var controls=$('journey-plan-actions');
      if (controls) controls.innerHTML=action('discover','＋ 找地点加入')+action('image','保存今日长图')+(personal?action('reset','恢复原方案','','btn-subtle'):'');
      Array.prototype.forEach.call($('route-toggle').querySelectorAll('button'),function(button){button.disabled=personal;button.title=personal?'自定义行程使用自己的顺序，可恢复原方案后切换':'';});
      if ($('journey-warnings')) $('journey-warnings').innerHTML=(regions.length?'<div class="region-route"><strong>富国岛 · 分区出行</strong><div class="island-regions"><span>北部 · Meliá / 乐园</span><span>中部 · 市区 / 机场</span><span>南部 · 缆车 / 海滩</span></div>'+regions.map(function(s){return '<p>'+esc(s)+'</p>';}).join('')+'</div>':'')+(warnings.length?'<details class="journey-warning-box"'+(warnings.some(function(w){return /cutoff|arrival|order|city|overlap/.test(w.code);})?' open':'')+'><summary>'+warnings.length+' 项时间 / 路线提醒</summary>'+warnings.slice(0,12).map(function(w){return '<p>'+esc(w.message)+'</p>';}).join('')+'</details>':'');
      var returnDetails=di===6?'<section class="return-details"><h3>住宿与返程备忘</h3>'+[{label:'10/6 晚住宿 / 地址',value:trip.day7Stay},{label:'10/7 返程航班',value:trip.day7Flight},{label:'10/7 自由安排',value:trip.day7}].map(function(x){return '<p><strong>'+esc(x.label)+'</strong><br>'+esc(x.value||'待补充')+'</p>';}).join('')+'<button class="btn" data-view="mine">去“我的”补充</button></section>':'';
      if (di===6 && !meaningful.length) {
        $('day-stops').innerHTML=returnDetails+'<div class="empty"><strong>最后一天留给你的安排</strong><p>从发现页加入想去的地方，按返程时间留出路上余量。</p>'+action('discover','找地点加入')+'</div>';
        return;
      }
      var completed=meaningful.filter(function(item){return trip.done[item.id];}).length,next=meaningful.find(function(item){return !trip.done[item.id];});
      $('plan-progress').textContent=completed+' / '+meaningful.length+' 已完成';
      $('now-card').innerHTML=next?'<div class="now-kicker">接下来这一站</div><strong>'+esc((next.time||'时间待定')+' · '+next.name)+'</strong><p>'+esc(next.locked?'固定交通节点，按航司及机场信息出发。':next.raw.travel||next.raw.visit||next.raw.note||'按体力和天气调整。')+'</p>'+action('done','完成这一站',next.id,'btn btn-primary')+' '+action('card','给司机 / 店员看',next.placeKey):'<div class="now-kicker">今天完成</div><strong>今天的安排走完了</strong><p>可以休息，或从发现页添加临时想去的地方。</p>'+action('discover','再找个去处');
      $('day-stops').innerHTML=meaningful.map(function(item,i){
        var done=trip.done[item.id],raw=item.raw,p=item.place,region=P.regionOf(p);
        return '<article class="place-card'+(done?' completed':'')+'"><div class="card-top"><span class="stop-number">'+(i+1)+'</span><div class="card-main"><div class="meta">'+esc(item.timeLabel||item.time||'时间待定')+' · '+esc(item.durationLabel||item.duration+'分钟')+(region?' · '+region:'')+'</div><h3><button class="title-button" data-place="'+esc(item.placeKey)+'">'+esc(item.name)+'</button></h3></div>'+(item.locked?'<span class="tag">固定</span>':'')+'</div><p class="card-note">'+esc(state.weather==='rain'&&raw.rain?raw.rain:raw.note||p.note||raw.visit||'')+'</p><div class="card-actions">'+action('done',done?'✓ 已完成':'○ 标记完成',item.id)+action('card','出示卡',item.placeKey)+(!item.locked?action('replace','去不了，换一个',item.id):'')+'</div>'+(!item.locked?'<details class="journey-adjust"><summary>调整时间与顺序</summary><div class="journey-order">'+action('edit','改时间',item.id,'btn-subtle')+action('up','↑ 上移',item.id,'btn-subtle')+action('down','↓ 下移',item.id,'btn-subtle')+action('remove','移除',item.id,'btn-subtle')+'</div></details>':'')+'</article>';
      }).join('')+returnDetails||'<div class="empty">今天还没有安排。'+action('discover','从发现页添加')+'</div>';
    }
    function chooseNow(target) {
      replaceTarget=target||null; selectedGeo=null;
      var state=ctx.getState(),city=target?P.cityOf(target.place):(state.area==='all'?ctx.area(ctx.data.days[state.day].place):state.area);
      ctx.open('<div class="detail-eyebrow">'+(target?'临时换计划':'NOW & NEARBY')+'</div><h2>'+(target?'这一站，换个去处':'现在，去哪儿')+'</h2><p class="detail-lead">'+(target?esc(target.name)+' · 替换后保留后面的安排与原定时间。':'结合城市、起点、时间和天气，挑三个合适的去处。')+'</p><form id="journey-now-form"><div class="journey-fields"><label class="form-field"><span>所在城市</span><select name="city"><option'+(city==='胡志明市'?' selected':'')+'>胡志明市</option><option'+(city==='富国岛'?' selected':'')+'>富国岛</option></select></label><label class="form-field"><span>想做什么</span><select name="kind">'+['吃喝','衣服','攀岩','玩乐','all'].map(function(k){return '<option value="'+k+'"'+(target&&target.place.kind===k?' selected':'')+'>'+(k==='all'?'都可以':k)+'</option>';}).join('')+'</select></label></div><div class="journey-fields"><label class="form-field"><span>可用时间</span><select name="budget"><option value="60">约1小时</option><option value="120" selected>约2小时</option><option value="240">半天</option></select></label><label class="form-field"><span>天气</span><select name="weather"><option value="clear">晴天 / 阴天</option><option value="rain"'+(state.weather==='rain'?' selected':'')+'>下雨</option></select></label></div>'+(target?'<label class="form-field"><span>为什么要换</span><select name="reason"><option value="closed">关门了</option><option value="queue">排队太久</option><option value="rain">下雨了</option><option value="tired">太累了</option></select></label>':'')+'<div class="origin-row"><span id="journey-origin">起点：'+(target?'原定地点':'所选城市的入住酒店')+'</span>'+action('locate','使用当前位置')+'</div><p class="meta">定位只在本次页面使用。未授权时仍可从酒店查找；距离按已知坐标估算，不代表实时车程或正在营业。</p><button class="btn btn-primary" type="submit">给我三个选择</button></form><div id="journey-now-results"></div>');
    }
    function recommendationResults(form) {
      var values=new FormData(form),city=values.get('city'),reason=values.get('reason')||'',origin=selectedGeo||(replaceTarget?replaceTarget.place:ctx.places[city==='富国岛'?'hotel1':'hotel0']),weather=reason==='rain'?'rain':values.get('weather');
      var pool=ctx.candidates().filter(function(p){return p.kind!=='交通'&&p.kind!=='住宿';});
      var picks=P.recommend({places:pool,city:city,kind:values.get('kind'),origin:origin,weather:weather,budgetMinutes:Number(values.get('budget')),reason:reason,excludeKeys:replaceTarget?items(ctx.getState().day).map(function(x){return x.placeKey;}):[]});
      $('journey-now-results').innerHTML='<div class="list-heading"><h3>'+picks.length+' 个可选去处</h3></div>'+picks.map(function(rec){var p=rec.place;ctx.places[p.key]=p;return '<article class="place-card"><div class="meta">'+esc(p.area+' · '+p.kind)+(rec.distanceKm!=null?' · 直线'+(rec.distanceKm<1?Math.round(rec.distanceKm*1000)+'米':rec.distanceKm.toFixed(1)+'公里'):' · 距离待核')+'</div><h3>'+esc(p.name)+'</h3><p>'+esc(rec.reasons.join('；'))+'</p><p class="meta">建议停留约'+rec.durationMinutes+'分钟；另留路上时间。</p><div class="card-actions">'+action(replaceTarget?'choose-replace':'add',replaceTarget?'换成这一站':'加入行程',p.key,'btn btn-primary')+'<button class="btn-subtle" data-place="'+esc(p.key)+'">看详情</button></div></article>';}).join('')+(picks.length?'':'<div class="empty">这个条件下没有合适的已收录地点。试试扩大时间或更换类别。</div>');
    }
    function enrichDetail(p) {
      var el=$('sheet-content'); if (!el) return;
      var row=document.createElement('div');row.className='card-actions journey-detail-actions';row.innerHTML=action('add','＋ 安排到某天',p.key,'btn btn-primary')+action('card','出示大字卡',p.key);
      el.insertBefore(row,el.children[3]||null);
      var raw=p.raw||{},verified=raw.venueVerification;
      if (verified) {var section=document.createElement('section'),contact=verified.bookingUrl||verified.contactURL;section.className='detail-section';section.innerHTML='<h3>门店核验 · '+esc(verified.verifiedAt||'待补')+'</h3><p>'+esc(verified.status==='verified'?'已核对具体门店地址；营业与价格以当天为准':verified.status==='pending'?'门店身份或地址仍待确认':'部分信息仍待确认')+'</p>'+(verified.address?'<p>'+esc(verified.address)+'</p>':'')+(verified.hours?'<p>营业参考：'+esc(verified.hours)+'</p>':'')+(verified.price?'<p>价格参考：'+esc(verified.price)+'</p>':'')+(verified.booking?'<p>'+esc(verified.booking)+'</p>':'')+(verified.phone?'<p>电话：'+esc(verified.phone)+'</p>':'')+(verified.email?'<p>邮箱：'+esc(verified.email)+'</p>':'')+(contact&&/^https:\/\//.test(contact)?'<a class="btn" href="'+esc(contact)+'">预约 / 联系门店 ↗</a>':'')+(verified.sourceURLs||[]).filter(function(url){return /^https:\/\//.test(url);}).map(function(url,i){return ' <a class="btn-subtle" href="'+esc(url)+'">核验来源 '+(i+1)+' ↗</a>';}).join('');el.insertBefore(section,row.nextSibling);}
      if(P.cityOf(p)==='富国岛'){var r=P.regionOf(p);if(r==='南部'||r==='中部'){var note=document.createElement('p');note.className='notice';note.textContent=r==='南部'?'你住北部 Meliá：建议把这里与10/5南部活动合并，避免单独往返。':'这个地点在中部，适合把吃饭、购物集中安排后再回北部酒店。';row.after(note);}}
    }
    document.addEventListener('click',function(event){var b=event.target.closest('[data-journey]');if(!b)return;var type=b.dataset.journey,key=b.dataset.key,di=ctx.getState().day,item=items(di).find(function(x){return x.id===key;});
      if(type==='add'&&ctx.places[key]) editForm(ctx.places[key]);
      else if(type==='edit'&&item) editForm(item.place,item);
      else if(type==='up'||type==='down') apply(P.moveItem(options({itemId:key,delta:type==='up'?-1:1})));
      else if(type==='remove') apply(P.removeItem(options({itemId:key})));
      else if(type==='done'){var trip=P.normalizeTrip(ctx.getTrip(),{});trip.done[key]=!trip.done[key];ctx.commit(trip,trip.done[key]?'这一站已完成':'已取消完成');}
      else if(type==='replace'&&item) chooseNow(item);
      else if(type==='choose-replace'&&replaceTarget){if(apply(P.replaceItem(options({itemId:replaceTarget.id,placeKey:key})))){replaceTarget=null;ctx.close();}}
      else if(type==='now') chooseNow();
      else if(type==='discover'){ctx.close();ctx.switchView('discover');ctx.toast('找到喜欢的地点后，点“安排到某天”');}
      else if(type==='card') ctx.tools().showCard(ctx.places[key]);
      else if(type==='image') ctx.tools().showDailyImage(di);
      else if(type==='reset') ctx.open('<h2>恢复这一天的原方案？</h2><p>只移除这一天的自定义顺序与新增安排。收藏、备注、预约和其他日期会保留。</p>'+action('confirm-reset','恢复原方案','','btn btn-primary'));
      else if(type==='confirm-reset'){var next=P.normalizeTrip(ctx.getTrip(),{}),day=ctx.data.days[di];delete next.plans[day.id];delete next.planBranches[day.id];ctx.commit(next,'已恢复原方案');ctx.close();}
      else if(type==='locate'){
        if(!navigator.geolocation){ctx.toast('此浏览器不支持定位，继续使用酒店起点');return;}
        b.disabled=true;b.textContent='正在定位…';navigator.geolocation.getCurrentPosition(function(position){b.disabled=false;b.textContent='重新定位';var lat=position.coords.latitude,lon=position.coords.longitude;if(lat<9||lat>12||lon<103||lon>108){ctx.toast('当前位置不在目的地附近，继续使用酒店起点');return;}selectedGeo={raw:{lat:lat,lon:lon,coordinatesVerified:true}};if($('journey-origin'))$('journey-origin').textContent='起点：当前位置（仅本次使用）';},function(){b.disabled=false;b.textContent='使用当前位置';ctx.toast('未获取定位，仍可从酒店查找');},{timeout:10000,maximumAge:300000,enableHighAccuracy:false});
      }
    });
    document.addEventListener('submit',function(event){var form=event.target;if(form.id==='journey-edit-form'){event.preventDefault();var fd=new FormData(form),dayIndex=Number(form.elements.day.value),extra={dayIndex:dayIndex,placeKey:form.dataset.place,time:fd.get('time')||'',duration:Number(fd.get('duration'))},result=form.dataset.item?P.replaceItem(options(Object.assign(extra,{itemId:form.dataset.item}))):P.addToDay(options(extra));if(apply(result)){ctx.close();ctx.selectDay(dayIndex);}}else if(form.id==='journey-now-form'){event.preventDefault();recommendationResults(form);}});
    return {renderPlan:renderPlan,enrichDetail:enrichDetail,openNow:chooseNow,getDayItems:items};
  }
  root.PocketJourney={create:create};
}(typeof window!=='undefined'?window:globalThis));
