import { DEFAULTS, PRESETS, POLLINATION_DEFAULTS, normalizeParams, simulate } from './model.js';
import { createTimeline, deriveWorldState } from './world-state.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = (n,d=0) => Number.isFinite(n) ? n.toLocaleString('ko-KR',{maximumFractionDigits:d}) : '—';
const date = d => new Date(Date.UTC(2022,0,Math.floor(d)+1)).toLocaleDateString('ko-KR',{timeZone:'UTC',month:'long',day:'numeric'});
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  chart:'<path d="M3 3v18h18M6 15l5-6 4 3 6-8"/>',
  sliders:'<path d="M5 3v18M12 3v18M19 3v18M2 8h6M9 16h6M16 8h6"/>',
  pin:'<path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 1 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  route:'<circle cx="5" cy="18" r="3"/><circle cx="19" cy="6" r="3"/><path d="M8 18h7a4 4 0 0 0 0-8H9a4 4 0 0 1 0-8h4" stroke-dasharray="2 3"/>',
  comb:'<path d="m8 3 4-2 4 2v5l-4 2-4-2ZM3 11l4-2 4 2v5l-4 2-4-2Zm10 0 4-2 4 2v5l-4 2-4-2Zm-5 8 4-2 4 2v4H8Z"/>',
  world:'<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  hive:'<path d="m12 2 9 5v10l-9 5-9-5V7Zm-9 5 9 5 9-5M12 12v10M3 11l9 5 9-5M3 15l9 5 9-5"/>',
  flower:'<path d="M12 10C3-1 0 13 9 13C-2 20 14 26 12 15C19 26 27 11 15 12C26 4 10-4 12 10Z"/><circle cx="12" cy="12" r="2"/>',
  bee:'<ellipse cx="12" cy="13" rx="8" ry="5"/><path d="M9 9v8M14 9v8M8 9C0 0 14 1 12 8c3-9 12-7 6 2M3 13H1M20 11l3-2"/>',
  mouse:'<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 5v5"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play:'<path d="m8 4 11 8-11 8Z" fill="currentColor" stroke="none"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  back:'<path d="m16 5-8 7 8 7M4 5v14"/>',
  next:'<path d="m8 5 8 7-8 7M20 5v14"/>',
  loop:'<path d="M4 10V7a3 3 0 0 1 3-3h13m-4-3 4 3-4 3M20 14v3a3 3 0 0 1-3 3H4m4-3-4 3 4 3"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.world}</svg>`;
$$('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
$('.world-intro h1').innerHTML='벌통과 들판의<br>한 해.';
$('.world-intro .overline').textContent='FIELD OBSERVATION · ONE COLONY';
$('.world-intro p').innerHTML='꽃이 피고, 벌이 먹이를 모으고, 새 일벌이 태어납니다.<br>계절과 시간을 움직여 연결된 변화를 관찰하세요.';
$('.environment-panel .panel-note').textContent='평년·다우·가뭄은 하루 날씨가 아닌 연중 기후 시나리오입니다. 꽃 자원, 채집, 먹이 저장, 육아·생존을 함께 다시 계산합니다. 수치는 현장 보정값이 아닙니다.';
const climateLabels={clear:'평년',rain:'비 많은 해',drought:'가뭄 해'};
$$('[data-weather]').forEach(button=>{button.lastChild.textContent=climateLabels[button.dataset.weather];});
$('.hive-processes').insertAdjacentHTML('beforeend','<div><span>꿀 저장</span><b id="detail-nectar">—</b></div><div><span>꽃가루 저장</span><b id="detail-pollen">—</b></div><div><span>주변 꽃 자원</span><b id="detail-resource">—</b></div><div><span>꽃가루 충족</span><b id="detail-nutrition">—</b></div><div><span>야생 수분매개자 활동</span><b id="detail-wild">—</b></div>');
$('.pollination-status').insertAdjacentHTML('beforeend','<p id="world-resource" class="world-resource" aria-live="off">꽃 자원과 저장량을 계산하는 중입니다.</p>');
$('.quality-setting').insertAdjacentHTML('beforebegin','<div class="setting"><label for="habitat-quality">주변 꽃 서식지 <b id="habitat-quality-label">70%</b></label><input id="habitat-quality" type="range" min="50" max="110" value="70" step="5"><p class="setting-hint">농지 가장자리·야생화·꽃나무가 제공하는 먹이의 가상 상대량</p></div>');
$('.honesty-note strong').textContent='자연의 연결을 단순화한 실험 모델입니다.';
$('.honesty-note p').textContent='꽃 자원과 연중 기후가 채집·먹이 저장·육아·생존에 영향을 줍니다. 저장량은 실제 kg이 아닌 상대적인 먹이 단위입니다. 화면의 벌·꽃·벌집은 표본이며, 지형은 실제 20에이커 측량 지도가 아닙니다. 계수는 현장 자료로 보정되지 않았습니다.';
$('#results-dialog .panel-note').textContent='한 군집의 일별 기대 개체수입니다. 선택한 연중 기후·서식지 조건이 꽃 자원과 먹이 저장을 거쳐 다음 세대에 영향을 줍니다. 현장 관측으로 보정된 예측은 아닙니다.';
$('.world-footnote').textContent='HiMCM 2022 · 가상 온대 농장 관찰 장면 · 먹이 계수 미보정 · 벌과 꽃은 대표 표본';
let params={...DEFAULTS}, farm={...POLLINATION_DEFAULTS}, weather='clear', scenario='baseline', habitat=0.7;
const ecologyOptions=()=>({weatherRegime:{clear:'typical',rain:'wet',drought:'drought'}[weather],bloomStart:farm.bloomStart,bloomDays:farm.bloomDays,habitat});
const runEcology=()=>simulate(params,{ecology:ecologyOptions()});
let result=runEcology(), world, frame, selection=null, routes=false, detail=false, toastTimer, lastTime=0, lastUI=0, rafId=0, disposed=false, returnToPlay=false, snapshotURL=null;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeline=createTimeline({day:130,hour:11,speed:.25,playing:!reduced});
function toast(text){$('#world-toast').textContent=text;$('#world-toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#world-toast').classList.remove('visible'),3300);}
function timeText(hour){const total=Math.min(1440,Math.floor(hour*60));return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;}
function refreshFrame(){frame=deriveWorldState(result,farm,timeline,{weather});frame.motionTime=frame.elapsedDays*9;}
function makeSparkline(){
  const rows=result.days.slice(0,365),max=Math.max(1,...rows.map(r=>r.adults)),min=Math.min(...rows.map(r=>r.adults));
  const points=rows.filter((_,i)=>i%5===0||i===364).map(r=>`${(r.day/364*180).toFixed(1)},${(30-(r.adults-min)/(max-min||1)*25).toFixed(1)}`).join(' ');
  $('#mini-population').innerHTML=`<svg viewBox="0 0 180 35"><path d="M${points.replaceAll(' ',' L')} L180 35 L0 35Z" fill="#abbf8525"/><polyline points="${points}" fill="none" stroke="#9bb277" stroke-width="1.3"/><line id="spark-cursor" x1="0" x2="0" y1="0" y2="35" stroke="#d1b264" stroke-width="1"/></svg>`;
}
function updateLabLink(){
  const data={version:'1.0.0',params,farm,analysis:{metric:'meanAdults',delta:.1}};
  $('#lab-link').href='./lab.html#experiment='+encodeURIComponent(JSON.stringify(data));
}
function updateBloomUI(){
  $('#bloom-start').value=farm.bloomStart;$('#bloom-duration').value=farm.bloomDays;
  $('#bloom-start-label').textContent=date(farm.bloomStart-1);$('#bloom-duration-label').textContent=`${farm.bloomDays}일`;
  $('#bloom-marker').style.left=`${(farm.bloomStart-1)/365*100}%`;
  $('#bloom-marker').style.width=`${Math.min(farm.bloomDays,366-farm.bloomStart)/365*100}%`;
  let wrapped=$('#bloom-marker-wrap');if(!wrapped){wrapped=document.createElement('div');wrapped.id='bloom-marker-wrap';wrapped.setAttribute('aria-hidden','true');$('.timeline-track').append(wrapped);}
  const extra=Math.max(0,farm.bloomStart-1+farm.bloomDays-365);wrapped.style.width=`${extra/365*100}%`;wrapped.hidden=extra===0;
  updateLabLink();
}
function updateControls(){
  const t=timeline.getState();$('#world-play').innerHTML=icon(t.playing?'pause':'play');$('#world-play').setAttribute('aria-label',t.playing?'시간 일시정지':'시간 재생');
  $$('[data-speed]').forEach(b=>{const active=Number(b.dataset.speed)===t.speed;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  $('#time-rate').textContent=`1초 = ${fmt(t.speed*6,1)}시간`;
  $('#loop-button').setAttribute('aria-pressed',String(t.loop));$('#loop-button').setAttribute('aria-label',t.loop?'연간 반복 끄기':'연간 반복 켜기');
}
function updateDetailUI(){
  if(!frame)return;
  const values={eggs:frame.eggs,brood:frame.brood,hive:frame.hiveBees,foragers:frame.foragers};
  for(const [key,value] of Object.entries(values)){$(`#detail-${key}`).textContent=`${fmt(value)}마리`;}
  $('#detail-laying').textContent=`${fmt(frame.viableLaying)}개`;
  $('#detail-emerged').textContent=`${fmt(frame.emerged)}마리`;
  $('#detail-recruits').textContent=`${fmt(frame.recruits)}마리`;
  $('#detail-deaths').textContent=`${fmt(frame.deaths)}마리`;
  $('#detail-care').textContent=`${fmt(frame.care*100)}%`;
  $('#detail-care-fill').style.width=`${frame.care*100}%`;
  $('#detail-nectar').textContent=frame.nectarStore==null?'—':`${fmt(frame.nectarStore)} 단위`;
  $('#detail-pollen').textContent=frame.pollenStore==null?'—':`${fmt(frame.pollenStore)} 단위`;
  $('#detail-resource').textContent=`${fmt(frame.flowerResource*100)}%`;
  $('#detail-nutrition').textContent=frame.pollenAdequacy==null?'—':`${fmt(frame.pollenAdequacy*100)}%`;
  $('#detail-wild').textContent=`${fmt(frame.wildPollinators*100)}% 지수`;
  const story=frame.season==='winter'?'월동기에는 여왕의 산란과 채집 전환이 줄고, 긴 수명의 겨울벌이 군집을 지탱합니다.':frame.viableLaying>1200?'여왕의 산란이 활발합니다. 육아벌이 알과 유충을 돌보고 새 일벌이 계속 우화합니다.':frame.recruits>frame.emerged?'내근벌에서 채집벌로 넘어가는 수가 많아, 벌통 밖 노동 비중이 커지는 시기입니다.':'군집이 다음 세대의 알과 유충을 키우며 채집 인력을 보충하고 있습니다.';
  $('#detail-story').textContent=story;
}
function updateUI(){
  $('#world-adults').innerHTML=`${fmt(frame.adults)}<small>마리</small>`;
  $('#world-foragers').innerHTML=`${fmt(frame.activeForagers)}<small>마리</small>`;
  $('#world-date').innerHTML=`${date(frame.day)}<span>${timeText(frame.hour)}</span>`;
  $('#season-label').textContent=frame.seasonLabel;$('#weather-label').textContent=frame.weatherLabel;
  $('#season-icon').textContent={spring:'✿',summer:'☀',autumn:'❧',winter:'❄'}[frame.season];
  $('#world-pollination').textContent=frame.inBloom?`${fmt(frame.pollinationRate*100)}%`:'개화 전후';
  $('#supply-progress').style.width=`${(frame.pollinationRate||0)*100}%`;
  $('#world-status').textContent=!frame.inBloom?'작물 개화 전후에도 야생화·꽃나무의 먹이 자원은 변합니다.':frame.daylight===0?'밤에는 비행을 쉬어요. 위 비율은 하루 공급 기준이에요.':`한 벌통이 하루 수요의 ${fmt(frame.pollinationRate*100)}%를 담당할 수 있어요.`;
  $('#world-resource').textContent=`꽃 자원 ${fmt(frame.flowerResource*100)}% · 꽃가루 저장 ${fmt(frame.pollenStore)} 단위`;
  $('#world-timeline').value=frame.elapsedDays;
  $('#spark-cursor')?.setAttribute('x1',String(Math.min(180,frame.elapsedDays/365*180)));$('#spark-cursor')?.setAttribute('x2',String(Math.min(180,frame.elapsedDays/365*180)));
  document.body.dataset.night=String(frame.daylight<.05);
  if(world){const s=world.getStats();$('#world').dataset.renderedBees=String(s.renderedBees);$('#world').dataset.drawCalls=String(s.drawCalls);$('#world').dataset.motionTime=String(s.motionTime);$('#world').dataset.camera=s.camera;}
  updateControls();updateDetailUI(); if(selection) updateSelectionDetails();
}
function seek(day,hour=12){timeline.pause();timeline.seek(day,hour);refreshFrame();updateUI();}
function togglePlay(){if(timeline.getState().elapsedDays>=365)timeline.seek(0,0);timeline.toggle();refreshFrame();updateControls();}
function environment(open=$('#environment-panel').hidden){
  // Call with true to open, false to close; callers provide explicit intent.
  if(open&&detail)detailView(false,false);
  $('#environment-panel').hidden=!open;$('#environment-button').setAttribute('aria-expanded',String(open));
}
function detailView(open=!detail,moveCamera=true){
  detail=Boolean(open);$('#detail-panel').hidden=!detail;$('#detail-button').setAttribute('aria-expanded',String(detail));
  world?.setDetail(detail);if(detail){environment(false);if(moveCamera)world?.setCamera('inside');updateDetailUI();}else if(moveCamera)world?.setCamera('hive');
}
function selectObject(item){
  if(!item)return;if(item.type==='hive'){detailView(true);selection=null;$('#selection-panel').hidden=true;return;}selection=item;$('#selection-panel').hidden=false;$('#selection-type').textContent={hive:'INSIDE THE COLONY',flowers:'THE FLOWERING FIELD',bee:'A FORAGER’S JOURNEY'}[item.type]||'FIELD NOTES';
  $('#selection-title').textContent=item.title||{hive:'하나의 벌통, 여러 역할',flowers:'꽃이 피는 시간',bee:'벌의 하루를 따라가면'}[item.type]||'가상 생태계';
  $('#selection-description').textContent=item.description||'시간을 움직여 변화를 관찰하세요.';updateSelectionDetails();
}
function updateSelectionDetails(){
  const details=selection.type==='hive'?[['여왕 산란 / 일',`${fmt(frame.viableLaying)} 개`],['오늘 우화',`${fmt(frame.emerged)} 마리`],['채집 전환',`${fmt(frame.recruits)} 마리`]]:selection.type==='flowers'?[['현재 개화',frame.inBloom?'개화 중':'개화 전후'],['유효 방문 / 일',`${fmt(frame.dailySupply)} 회`],['수분 충족률',frame.inBloom?`${fmt(frame.pollinationRate*100)}%`:'—']]:[['화면의 대표 벌',`${frame.beeCount} 마리`],['활동 채집벌',`${fmt(frame.activeForagers)} 마리`],['귀환 벌의 꽃가루',frame.inBloom?'뒷다리 노란 화분단':'없음']];
  $('#selection-details').innerHTML=details.map(([k,v])=>`<div class="selection-mini"><span>${k}</span><b>${v}</b></div>`).join('');
}
function showResults(){
  timeline.pause();refreshFrame();updateUI();$('#result-date').textContent=`${date(frame.day)} ${timeText(frame.hour)}의 벌통`;
  $('#result-stages').innerHTML=[['알 E','eggs'],['유충·번데기 L','brood'],['내근벌 H','hiveBees'],['채집벌 F','foragers'],['수벌 D','drones']].map(([label,key])=>`<div class="snapshot-stage"><span>${label}</span><b>${fmt(frame[key])} <small>마리</small></b></div>`).join('');
  $('#result-supply').innerHTML=`<div class="snapshot-supply">${frame.inBloom?`하루 방문 수요 <b>${fmt(frame.dailyDemand)}</b>회<br>한 벌통의 하루 유효 공급 <b>${fmt(frame.dailySupply)}</b>회<br>일별 필요 벌통 <b>${frame.dailyDemand===0?'0':frame.dailySupply>0?Math.ceil(frame.dailyDemand/frame.dailySupply):'충족 불가'}</b>`:'현재는 목표 작물의 개화기가 아닙니다.'}<br>화면의 벌 ${frame.beeCount}마리는 ${fmt(frame.activeForagers)}마리의 활동 상태를 나타내는 표본입니다.</div>`;
  saveSnapshot();$('#results-dialog').showModal();
}
function saveSnapshot(){
  const data={version:'2.2.0',timestamp:new Date().toISOString(),params,farm,ecology:ecologyOptions(),timeline:timeline.getState(),weather,scenario,snapshot:frame,notes:['Counts interpolate a deterministic daily cohort model with hypothetical floral-resource and food-store feedback.','Store units are 1,000 summer-adult daily ration equivalents, not measured kilograms.','3D bees, flowers and comb cells are illustrative samples, not individually modelled organisms.']};
  if(snapshotURL)URL.revokeObjectURL(snapshotURL);snapshotURL=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));$('#export-world').href=snapshotURL;
  let preview=$('#snapshot-preview');if(!preview){preview=document.createElement('details');preview.id='snapshot-preview';preview.innerHTML='<summary>다운로드가 시작되지 않나요? JSON 내용 보기</summary><textarea id="snapshot-json" readonly aria-label="현재 시점 JSON 데이터" rows="7"></textarea>';$('#results-dialog').append(preview);}$('#snapshot-json').value=JSON.stringify(data,null,2);
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  if(b.dataset.speed){timeline.setSpeed(Number(b.dataset.speed));updateControls();return;}
  if(b.dataset.camera){if(detail)detailView(false,false);world?.setCamera(b.dataset.camera);$$('[data-camera]').forEach(el=>{const a=el===b;el.classList.toggle('selected',a);el.setAttribute('aria-pressed',String(a));});if(b.dataset.camera==='follow'&&frame.beeCount===0)toast('지금 벌들이 쉬고 있어요. 낮이나 개화기로 이동해 보세요.');return;}
  if(b.dataset.weather){weather=b.dataset.weather;$$('[data-weather]').forEach(el=>{el.classList.toggle('selected',el===b);el.setAttribute('aria-pressed',String(el===b));});result=runEcology();makeSparkline();refreshFrame();updateUI();toast('기후 시나리오를 바꿔 1년의 군집과 먹이 저장을 다시 계산했어요.');return;}
  switch(b.id){
    case 'world-play':togglePlay();break;
    case 'restart-button':seek(0,12);toast('1월 1일로 돌아왔어요.');break;
    case 'step-back':seek(Math.max(0,frame.day-1),frame.hour);break;
    case 'step-forward':seek(Math.min(365,frame.day+1),frame.hour);break;
    case 'loop-button':timeline.setLoop(!timeline.getState().loop);updateControls();break;
    case 'environment-button':environment($('#environment-panel').hidden);break;
    case 'close-environment':environment(false);break;
    case 'detail-button':detailView(!detail);break;
    case 'close-detail':detailView(false);break;
    case 'routes-button':routes=!routes;b.setAttribute('aria-pressed',String(routes));world?.setRoutes(routes);break;
    case 'close-selection':selection=null;$('#selection-panel').hidden=true;break;
    case 'jump-bloom':seek((farm.bloomStart-1+Math.min(10,Math.floor(farm.bloomDays/2)))%365,12);environment(false);toast('꽃이 핀 날의 낮 12시로 이동했어요.');break;
    case 'help-button':timeline.pause();updateControls();$('#help-dialog').showModal();break;
    case 'close-help':$('#help-dialog').close();break;
    case 'results-button':showResults();break;
    case 'close-results':$('#results-dialog').close();break;
    case 'export-world':saveSnapshot();break;
  }
});
$('#world-timeline').addEventListener('input',e=>seek(Number(e.target.value),0));
$('#bloom-start').addEventListener('input',e=>{farm.bloomStart=Number(e.target.value);updateBloomUI();result=runEcology();makeSparkline();refreshFrame();updateUI();});
$('#bloom-duration').addEventListener('input',e=>{farm.bloomDays=Number(e.target.value);updateBloomUI();result=runEcology();makeSparkline();refreshFrame();updateUI();});
$('#habitat-quality').addEventListener('input',e=>{habitat=Number(e.target.value)/100;$('#habitat-quality-label').textContent=`${e.target.value}%`;result=runEcology();makeSparkline();refreshFrame();updateUI();});
$('#world-scenario').addEventListener('change',e=>{scenario=e.target.value;params={...PRESETS[scenario]};result=runEcology();makeSparkline();refreshFrame();updateUI();updateLabLink();toast('군집 조건을 바꾸고 같은 시간에서 비교합니다.');});
$('#world-quality').addEventListener('change',e=>{world?.setQuality(e.target.value);});
document.addEventListener('keydown',e=>{
  if(e.repeat||e.altKey||e.ctrlKey||e.metaKey||['INPUT','SELECT','TEXTAREA','BUTTON','A'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  else if(e.code==='ArrowLeft'){e.preventDefault();seek(Math.max(0,frame.day-1),frame.hour);}
  else if(e.code==='ArrowRight'){e.preventDefault();seek(Math.min(365,frame.day+1),frame.hour);}
  else if(e.key.toLowerCase()==='e')environment($('#environment-panel').hidden);
  else if(e.key.toLowerCase()==='r')$('#routes-button').click();
  else if(e.key.toLowerCase()==='i')detailView(!detail);
});
document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){returnToPlay=timeline.getState().playing;timeline.pause();}else if(returnToPlay){timeline.play();returnToPlay=false;}});
function animate(now){
  if(disposed)return;rafId=requestAnimationFrame(animate);if(document.hidden)return;
  const dt=lastTime?Math.min((now-lastTime)/1000,.1):0;lastTime=now;timeline.advance(dt);refreshFrame();
  try{world.update(frame,dt);}catch(error){console.error(error);timeline.pause();cancelAnimationFrame(rafId);toast('3D 장면을 갱신하지 못했습니다. 새로고침해 주세요.');return;}
  if(now-lastUI>160){updateUI();lastUI=now;}
}
async function start(){
  try{
    // Optional inherited research settings are numeric-only and bounded.
    const inherited=new URLSearchParams(location.hash.slice(1)).get('experiment');
    if(inherited){const saved=JSON.parse(inherited);if(saved.version==='1.0.0'&&saved.params){
      params=normalizeParams(saved.params);
      for(const [key,value] of Object.entries(saved.farm||{}))if(Object.hasOwn(POLLINATION_DEFAULTS,key)&&typeof value==='number'&&Number.isFinite(value))farm[key]=Math.max(0,value);
      for(const key of ['weather','cropShare','efficiency','naturalShare'])farm[key]=Math.min(1,farm[key]);
      farm.bloomStart=Math.max(1,Math.min(365,Math.round(farm.bloomStart)));farm.bloomDays=Math.max(7,Math.min(90,Math.round(farm.bloomDays)));
      farm.area=Math.min(farm.area,202500);farm.flowerDensity=Math.min(farm.flowerDensity,150);farm.visitsPerFlower=Math.min(farm.visitsPerFlower,10);farm.visitsPerBee=Math.min(farm.visitsPerBee,2500);farm.reserve=Math.min(farm.reserve,.5);
      result=runEcology();
    }}
  }catch{toast('공유 설정을 읽지 못해 기준 군집을 사용합니다.');}
  makeSparkline();updateBloomUI();refreshFrame();updateUI();
  try{
    const {createWorld}=await import('./world.js');world=createWorld($('#world'),{onSelect:selectObject});
    if(innerWidth<600){world.setQuality('low');$('#world-quality').value='low';}
    world.update(frame,0);$('#world-loading').classList.add('done');setTimeout(()=>$('#world-loading').hidden=true,600);rafId=requestAnimationFrame(animate);
  }catch(error){
    console.error(error);timeline.pause();updateControls();
    $('#world-loading').innerHTML=`<div class="webgl-error"><span class="loading-hex">⬡</span><h2>3D 화면을 열지 못했어요</h2><p>WebGL2를 지원하는 최신 브라우저와 하드웨어 가속이 필요합니다. 데이터 연구실은 계속 사용할 수 있습니다.</p><small>${esc(error.message)}</small><a href="./lab.html">데이터 연구실 열기 ↗</a></div>`;
  }
}
window.addEventListener('pagehide',event=>{if(event.persisted){lastTime=0;return;}disposed=true;cancelAnimationFrame(rafId);world?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted){lastTime=0;world?.resize();refreshFrame();updateUI();}});
start();
