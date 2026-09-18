import { DEFAULTS, PARAM_META, PRESETS, POLLINATION_DEFAULTS, normalizeParams, simulate, pollination, sensitivity, uncertainty } from './model.js';
import { SOURCES, MODEL_NOTES, BLOG, REPORT_CHECKLIST } from './content.js';
import { populationSVG, uncertaintySVG, pollinationSVG } from './charts.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const number = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: digits }) : '산정 불가';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date = day => new Date(Date.UTC(2022, 0, day + 1)).toLocaleDateString('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric' });
const colors = { hiveBees:'#477452',foragers:'#d6a83d',drones:'#78949f',eggs:'#92afb9',brood:'#d59877',adults:'#293e30' };
const names = { eggs:'알',brood:'유충·번데기',hiveBees:'내근벌',foragers:'채집벌',drones:'수벌',adults:'전체 성충' };
const iconPaths = {
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sliders:'<path d="M5 3v18M12 3v18M19 3v18"/><path d="M2 8h6M9 16h6M16 8h6" stroke-width="4"/>',
  flower:'<path d="M12 10C3-1 0 13 9 13C-2 20 14 26 12 15C19 26 27 11 15 12C26 4 10-4 12 10Z"/><circle cx="12" cy="12" r="2"/>',
  book:'<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1Zm0 0v16"/>',
  leaf:'<path d="M20 3C6 1 0 8 5 16s18 3 15-13Z"/><path d="m3 22 12-13"/>',
  github:'<path d="M9 21v-4c-5 1-5-3-7-3m13 7v-4c0-1-1-2-1-2 5 0 7-3 6-7l-1-2V2l-4 2H9L5 2v4c-4 5-1 9 4 9"/>',
  link:'<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 -1)"/>',
  reset:'<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  play:'<path d="m8 4 12 8-12 8Z"/>', pause:'<path d="M8 4v16M16 4v16" stroke-width="3"/>',
  spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/>',
  table:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  code:'<path d="m7 6-6 6 6 6m10-12 6 6-6 6M14 3l-4 18"/>',
  chart:'<path d="M3 3v18h18M6 15l5-6 4 3 6-8"/>',
  hex:'<path d="m12 2 9 5v10l-9 5-9-5V7Z"/>', egg:'<ellipse cx="12" cy="12" rx="6" ry="9"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.hex}</svg>`;
function icons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); }); }
let params = { ...DEFAULTS }, farm = { ...POLLINATION_DEFAULTS }, result, poll, baseline;
let view = 'overview', mode = 'adults', selectedDay = 170, visible = ['adults','hiveBees','foragers','drones'];
let metric = 'meanAdults', delta = .1, sensitivityRows = null, analysisSignature = '', generation = 0;
let timer, playTimer, toastTimer;
const meta = Object.fromEntries(PARAM_META.map(p => [p.key,p]));
const titles = {
  overview:['작은 벌통, 커다란 생태계.','한 마리의 성장이 군집을, 군집의 내일이 농장을 바꿉니다.','실험실'],
  sensitivity:['작은 변화는 얼마나 큰 차이를 만들까요?','같은 기준으로 변수를 바꾸고, 군집의 반응을 비교합니다.','민감도 분석'],
  pollination:['벌통에서, 꽃이 핀 농장으로.','개화기에 필요한 방문 수요와 채집벌의 공급을 연결합니다.','수분 계획'],
  method:['모든 숫자에는, 근거가 필요합니다.','관찰값과 가정을 구분하고, 모델의 작동 방식과 한계를 공개합니다.','모델과 근거'],
  blog:['작은 벌이 만드는 큰 연결.','비전문가에게 전하는 한 페이지의 이야기.','한 페이지 이야기'],
};

let worker, jobId = 0;
const jobs = new Map();
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type:'module' });
  worker.onmessage = ({data}) => {
    const job = jobs.get(data.id); if (!job) return;
    jobs.delete(data.id); data.error ? job.reject(new Error(data.error)) : job.resolve(data.result);
  };
  worker.onerror = () => { jobs.forEach(j => j.reject(new Error('분석 작업을 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.'))); jobs.clear(); worker?.terminate(); worker = null; };
} catch { worker = null; }
function analyze(task, options) {
  if (!worker) return new Promise((resolve,reject) => setTimeout(() => { try { resolve(task === 'sensitivity' ? sensitivity(params, options.metric, options.delta) : uncertainty(params, options)); } catch(e) { reject(e); } }, 30));
  return new Promise((resolve,reject) => { const id = ++jobId; jobs.set(id,{resolve,reject}); worker.postMessage({id,task,params,options}); });
}
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4000); }
function formattedParam(key,value) { return ['workerRatio','eggSurvival','broodSurvival','nutrition'].includes(key) ? `${number(value*100,1)}%` : number(value,2); }
function control(p, value, type = 'model') {
  return `<div class="parameter"><label for="${type}-${p.key}">${p.label}<b id="value-${type}-${p.key}">${formattedParam(p.key,value)}<small>${p.unit}</small></b></label><input id="${type}-${p.key}" data-${type}="${p.key}" type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${value}"><div class="range-limits"><span>${formattedParam(p.key,p.min)}</span><span>${formattedParam(p.key,p.max)}</span></div>${p.status ? `<p class="param-source">${p.status}</p>` : ''}</div>`;
}
function renderControls() {
  const primary = ['maxLaying','workerRatio','summerForagerLife','winterLife','transitionAge'];
  $('#primary-controls').innerHTML = primary.map(k => control(meta[k],params[k])).join('');
  $('#advanced-controls').innerHTML = PARAM_META.filter(p => !primary.includes(p.key)).map(p => control(p,params[p.key])).join('');
}
function stat(label, value, unit, note, symbol) {
  return `<div class="stat-card"><div class="stat-top">${label}<span class="stat-icon">${icon(symbol)}</span></div><div class="stat-value">${value}<small>${unit}</small></div><div class="stat-bottom">${note}</div></div>`;
}
function run() {
  clearTimeout(timer); params = normalizeParams({...params,years:1}); const start = performance.now();
  result = simulate(params); poll = pollination(result,farm); generation++; sensitivityRows = null; analysisSignature = '';
  renderOverview(); renderPollination(); renderMethod(); renderBlog();
  $('#run-note').textContent = `365일 계산 완료 · ${Math.round(performance.now()-start)} ms · 예열 ${params.burninYears}년`;
  if(view==='sensitivity') renderSensitivity();
}
function renderOverview() {
  const s = result.summary;
  $('#stats').innerHTML = stat('연중 최대 성충',number(s.peakAdults),'마리',`<span>${date(s.peakDay-1)}</span> H + F + 수벌`, 'chart')
    + stat('연평균 성충',number(s.meanAdults),'마리','<span>365일</span> 일별 성충 수의 평균','hex')
    + stat('채집 활동량',number(s.activeForagerDays/10000,1),'만 벌·일','<span>계절 반영</span> Σ F × 활동률','flower')
    + stat('필요 벌통',number(poll.hives),'개',`<span>일별 수요</span> ${number(farm.area)} m² · 예시 조건`,'grid');
  $('#insight-title').textContent = result.diagnostics.warnings.length ? '현재 설정에서 확인할 점' : '꽃이 피는 시기와 채집벌의 시기를 함께 보세요.';
  $('#insight-text').textContent = result.diagnostics.warnings.join(' ') || `산란 성수기는 ${date(params.peakDay-1)}, 성충이 가장 많은 날은 ${date(s.peakDay-1)}입니다. 성장 지연이 만드는 시차도 수분 계획에 중요합니다.`;
  renderLegend(); renderChart(); renderDay();
}
function renderLegend() {
  const keys = mode==='all' ? ['adults','eggs','brood','hiveBees','foragers','drones'] : ['adults','hiveBees','foragers','drones'];
  $('#chart-legend').innerHTML = keys.map(k => `<button data-series="${k}" class="${visible.includes(k)?'':'off'}" aria-pressed="${visible.includes(k)}"><i class="dot" style="background:${colors[k]}"></i>${names[k]}</button>`).join('');
}
function chartOptions() { return {mode,visible,baseline:$('#compare-toggle').checked ? baseline : null,selectedDay,bloom:{start:farm.bloomStart,days:farm.bloomDays}}; }
function renderChart() { $('#population-chart').innerHTML = populationSVG(result,chartOptions()); }
function renderDay() {
  const row = result.days[selectedDay]; $('#current-date').textContent = `${date(selectedDay)} · Day ${selectedDay+1}`; $('#day-slider').value = selectedDay;
  $('#life-stages').innerHTML = ['eggs','brood','hiveBees','foragers','drones'].map((k,i) => `<div class="life-stage"><div class="life-stage-icon">${icon(['egg','hex','grid','flower','hex'][i])}</div><div class="life-stage-label">${names[k]} ${['E','L','H','F','D'][i]}</div><div class="life-stage-value">${number(row[k])}<small>마리</small></div></div>`).join('');
}
function navigate(next) {
  if(!titles[next]) return; view = next; stopPlaying();
  $$('.view').forEach(el => el.hidden = el.id !== `${next}-view`);
  $$('[data-view]').forEach(el => { el.classList.toggle('active',el.dataset.view===next); if(el.dataset.view===next) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  $('#page-title').textContent=titles[next][0]; $('#page-subtitle').textContent=titles[next][1]; $('#breadcrumb-current').textContent=titles[next][2];
  if(next==='sensitivity') renderSensitivity();
  window.scrollTo({top:0,behavior:'instant'});
}

async function getSensitivity() {
  const sig = JSON.stringify([params,metric,delta]);
  if(sensitivityRows && analysisSignature===sig) return sensitivityRows;
  const rows = await analyze('sensitivity',{metric,delta});
  if(sig===JSON.stringify([params,metric,delta])) { sensitivityRows=rows; analysisSignature=sig; }
  return rows;
}
const metricNames={meanAdults:'年평균 성충 수',peakAdults:'최대 성충 수',minAdults:'최소 성충 수',foragerDays:'누적 채집벌·일'};
async function renderSensitivity() {
  const stamp=generation, requestedMetric=metric, requestedDelta=delta;
  $('#sensitivity-view').innerHTML = `<div class="analysis-header"><div><h2>무엇이 군집을 움직일까요?</h2><p>다른 조건은 유지하고 한 변수씩 바꿉니다. 막대는 출력 변화율, 오른쪽은 실제 입력 변화율로 정규화한 탄력성입니다.</p></div><span class="pill">LOCAL SENSITIVITY</span></div><div class="analysis-grid"><section class="card"><div class="section-kicker">ONE FACTOR AT A TIME</div><h2>변화에 대한 반응</h2><div class="select-row"><label>비교할 출력<select id="metric-select">${Object.entries(metricNames).map(([k,v])=>`<option value="${k}" ${k===metric?'selected':''}>${v.replace('年','연')}</option>`).join('')}</select></label><label>입력 변화 범위<select id="delta-select">${[.05,.1,.2].map(v=>`<option value="${v}" ${v===delta?'selected':''}>±${v*100}%</option>`).join('')}</select></label></div><div id="tornado-output" class="uncertainty-placeholder"><span class="loader"></span>8개 변수를 비교하고 있습니다</div><div class="legend-key"><span><i class="dot amber"></i>입력 감소</span><span><i class="dot green"></i>입력 증가</span></div><div class="note-box">확률은 0–1 범위를 벗어나지 않도록 제한합니다. 입력 경계에 닿으면 실제 증감 폭을 표시합니다. 산란·단계 생존율의 근접한 순위는 곱셈 구조의 영향일 수 있습니다.</div></section><section class="card"><div class="section-kicker">READ THE RESULT</div><h2>결과를 읽는 방법</h2><div id="sensitivity-summary"><p class="analysis-label">분석 중</p></div><div class="note-box"><b>국소 민감도 ≠ 원인 규명</b><br>순위는 현재 시나리오·출력·변화 범위에만 적용됩니다. 기준 출력이 0이면 비율과 탄력성을 정의하지 않습니다.</div></section></div><section class="card uncertainty-card"><div class="card-heading"><div><div class="section-kicker">UNCERTAINTY EXPLORER</div><h2>여러 가정이 함께 달라진다면</h2></div><button id="uncertainty-btn" class="button quiet">64개 시나리오 계산</button></div><div id="uncertainty-output" class="uncertainty-placeholder">변수 8개를 동시에 ±10% 변화시켜 보세요.</div><p>독립 균등분포 · seed 2022 · P10–P90 시나리오 범위. 관측 자료에서 추정한 신뢰구간이 아닙니다.</p></section>`;
  try {
    const rows=await getSensitivity(); if(stamp!==generation || requestedMetric!==metric || requestedDelta!==delta || !$('#tornado-output')) return;
    const max=Math.max(1,...rows.flatMap(r=>[Math.abs(r.lowChange||0),Math.abs(r.highChange||0)]));
    $('#tornado-output').className='tornado';
    $('#tornado-output').innerHTML=rows.map(r => {
      const bar=(v,cls)=>Number.isFinite(v)?`<span class="tornado-bar ${cls}" title="${number(v,2)}%" style="left:${50+Math.min(0,v)/max*48}%;width:${Math.abs(v)/max*48}%"></span>`:'';
      return `<div class="tornado-row"><div class="tornado-label">${r.label}<small>${r.bounded?`실제 ${number(r.actualLowPercent,1)}% / +${number(r.actualHighPercent,1)}%`:`−${delta*100}% / +${delta*100}%`}</small></div><div class="tornado-bars">${bar(r.lowChange,'')}${bar(r.highChange,'high')}</div><div class="tornado-elasticity" title="탄력성">${r.elasticity===null?'—':number(r.elasticity,2)}</div></div>`;
    }).join('')+`<div class="axis-caption"><span>−${number(max,1)}%</span><span>0</span><span>+${number(max,1)}%</span></div>`;
    const first=rows[0];
    $('#sensitivity-summary').innerHTML=`<p class="analysis-label">현재 설정에서 |탄력성|이 큰 변수</p><div class="number-highlight">${first.elasticity===null?'—':number(Math.abs(first.elasticity),2)}</div><h3>${first.label}</h3><p class="analysis-label">1%의 입력 변화에 대한 출력 변화의 근사 크기입니다. 근접값은 사실상 동률로 해석하세요.</p><div class="metric-list"><div><span>기준 출력</span><b>${number(first.baseline)}</b></div><div><span>입력 감소 시 출력 변화</span><b>${first.lowChange===null?'정의 불가':number(first.lowChange,2)+'%'}</b></div><div><span>입력 증가 시 출력 변화</span><b>${first.highChange===null?'정의 불가':number(first.highChange,2)+'%'}</b></div><div><span>비교 지표</span><b>${metricNames[metric].replace('年','연')}</b></div></div>`;
  } catch(e) { if($('#tornado-output')) $('#tornado-output').textContent=e.message; }
}

const FARM_META = [
  {key:'area',label:'농장 면적',unit:'m²',min:4050,max:202500,step:4050},
  {key:'bloomStart',label:'개화 시작일',unit:'연중 일',min:1,max:365,step:1},
  {key:'bloomDays',label:'개화 기간',unit:'일',min:1,max:90,step:1},
  {key:'flowerDensity',label:'당일 수분 대상 꽃 밀도',unit:'송이/m²',min:0,max:150,step:1},
  {key:'visitsPerFlower',label:'꽃당 필요 방문',unit:'회/일',min:1,max:10,step:1},
  {key:'visitsPerBee',label:'활동 벌 한 마리의 방문',unit:'회/일',min:100,max:2500,step:100},
  {key:'weather',label:'날씨에 따른 활동 비율',unit:'비율',min:0,max:1,step:.05},
  {key:'cropShare',label:'목표 작물 방문 비율',unit:'비율',min:0,max:1,step:.05},
  {key:'efficiency',label:'방문의 유효 비율',unit:'비율',min:0,max:1,step:.05},
  {key:'naturalShare',label:'다른 수분매개자의 기여',unit:'비율',min:0,max:1,step:.05},
  {key:'reserve',label:'수요 안전 여유',unit:'비율',min:0,max:.5,step:.05},
];
function farmArt(count) {
  const bees=Number.isFinite(count)?Math.min(12,count):0;
  return `<svg viewBox="0 0 640 235" role="img" aria-label="농장과 벌통의 개념도"><defs><pattern id="crop-rows" width="31" height="31" patternUnits="userSpaceOnUse"><path d="M0 15h31" stroke="#c0d3a2" stroke-width="10"/><path d="M10 11v8m11-8v8" stroke="#f5f7e8" stroke-width="1.5"/></pattern></defs><g transform="translate(321 103) rotate(-14) skewX(19)"><rect x="-184" y="-62" width="368" height="138" rx="7" fill="#dfE8ca" stroke="#c5d3af" stroke-width="12"/><rect x="-168" y="-49" width="336" height="112" fill="url(#crop-rows)"/><path d="M0-48V64" stroke="#f4edd6" stroke-width="13"/></g>${Array.from({length:bees},(_,i)=>{const x=132+i*31,y=190;return `<g transform="translate(${x} ${y})"><path d="m0 0 12-6 13 6v19l-13 6-12-6Z" fill="#dcb257"/><path d="m0 0 12 6 13-6M12 6v19M0 7l12 6 13-6" fill="none" stroke="#b68d35"/><path d="m15 17 5-2" stroke="#5b613e" stroke-width="3"/></g>`;}).join('')}</svg>`;
}
function renderPollination() {
  $('#pollination-view').innerHTML=`<div class="analysis-header"><div><h2>면적만으로 벌통 수를 정할 수는 없습니다.</h2><p>성충 전체가 아닌 실제 활동 가능한 채집벌로 계산합니다. 입력은 가상의 농장 조건이며, 작물과 지역 자료로 보정해야 합니다.</p></div><span class="pill">20 ACRES → 81,000 m²</span></div><div class="pollination-grid"><section class="card farm-settings"><div class="card-heading"><div><div class="section-kicker">THE FIELD</div><h2>농장과 개화 조건</h2></div></div>${FARM_META.slice(0,6).map(p=>control(p,farm[p.key],'farm')).join('')}<details class="advanced"><summary>활동률과 유효 방문 설정 <span>+</span></summary><div>${FARM_META.slice(6).map(p=>control(p,farm[p.key],'farm')).join('')}</div></details><p class="farm-footnote">꽃 밀도와 방문 요구량은 모두 하루 기준입니다. 총 꽃 수를 개화일수로 다시 나누지 않습니다.</p></section><div><section class="card farm-display"><div class="farm-summary"><div><div class="section-kicker">POLLINATION PLAN</div><h2>개화기의 매일을 충족하려면</h2><p id="bloom-label"></p></div><div id="hive-result" class="hive-result"></div></div><div class="field-illustration"><span class="field-corner">A LITTLE FIELD, A BIG CONNECTION</span><div id="farm-art"></div><span class="field-caption">배치 최적화가 아닌 개념도</span></div><div id="poll-metrics" class="metric-list"></div><div class="formula">벌통 수 = ⌈ max<sub>개화일</sub> (일별 방문 수요 ÷ 한 벌통의 유효 공급) ⌉</div><p id="poll-warning" class="farm-footnote"></p></section><section class="card" style="margin-top:22px"><div class="card-heading"><div><div class="section-kicker">DEMAND & CAPACITY</div><h2>하루의 수요와 공급</h2></div></div><div id="poll-chart" class="chart-container"></div></section><section class="card benchmark"><h3>현장의 경험값과 나란히 보기</h3><p>OSU Extension의 태평양 북서부 평균 사용량. 표준 20에이커 기준이며, 계산 결과에 맞추는 목표값은 아닙니다.</p><div class="benchmark-grid"><div class="benchmark-item">사과<strong>10<small>벌통</small></strong>0.5 / acre</div><div class="benchmark-item">체리<strong>40<small>벌통</small></strong>2 / acre</div><div class="benchmark-item">블루베리<strong>60<small>벌통</small></strong>3 / acre</div></div><p><a href="${SOURCES.find(s=>s.id==='osu').url}" target="_blank" rel="noopener">군집 강도·지역·작물별 권고의 원문 보기 ↗</a></p></section></div></div>`;
  updatePollination();
}
function updatePollination() {
  poll=pollination(result,farm); $('#bloom-label').textContent=`${date(farm.bloomStart-1)}부터 ${farm.bloomDays}일 · ${number(farm.area)} m²`;
  $('#hive-result').innerHTML=Number.isFinite(poll.hives)?`${number(poll.hives)}<small>벌통</small>`:'<span style="font-size:24px;letter-spacing:-1px">충족 불가</span>';
  $('#farm-art').innerHTML=farmArt(poll.hives);
  $('#poll-metrics').innerHTML=`<div><span>개화기 누적 수요</span><b>${number(poll.demand/1e6,2)}백만 회</b></div><div><span>한 벌통의 누적 유효 공급</span><b>${number(poll.capacity/1e6,2)}백만 회</b></div><div><span>일별 부족을 무시한 누적량 하한</span><b>${number(poll.totalLowerBound)} 벌통</b></div><div><span>가장 부족한 날</span><b>${poll.hives===0?'추가 벌통 불필요':date((poll.limitingDay||farm.bloomStart)-1)}</b></div>`;
  $('#poll-warning').textContent=poll.feasible?'가정 기반 산정입니다. 벌통을 늘려도 한 벌통당 공급이 동일하다고 가정하며, 밀도 증가에 따른 경쟁·방문 불균등은 제외합니다. 수분 성공과 수확량을 직접 보장하지 않습니다.':'수요가 있지만 활동 가능한 채집벌 또는 유효 방문 공급이 0인 날이 있습니다. 벌통 수만 늘려 해결할 수 없으므로 개화일·활동 조건을 확인하세요.';
  $('#poll-chart').innerHTML=pollinationSVG(poll);
}

function renderMethod() {
  const diag=result.diagnostics;
  $('#method-view').innerHTML=`<div class="analysis-header"><div><h2>문헌에 기반하고, 가정은 드러냅니다.</h2><p>정교한 그래프가 검증된 예측을 의미하지는 않습니다. 계산 구조의 검증과 관측 자료에 대한 검증을 구분합니다.</p></div><a href="./METHODOLOGY.md" target="_blank" class="button quiet">전체 방법론 ↗</a></div><div class="method-layout"><section class="card method-card"><div class="section-kicker">A DAILY, AGE-STRUCTURED MODEL</div><h2>한 벌통의 연결 구조</h2><div class="model-flow"><span><strong>E</strong>알<small>3일</small></span>→<span><strong>L</strong>유충·번데기<small>18일</small></span>→<span><strong>H</strong>내근벌<small>나이 + 군집 필요</small></span>→<span><strong>F</strong>채집벌<small>계절별 사망</small></span></div><div class="formula">I(t+1) = Q(t+1) · H(t) / [H(t) + K]<br>N<sub>성충</sub>(t) = H(t) + F(t) + D(t)</div>${MODEL_NOTES.map(n=>`<div class="method-note"><h3>${n.title}</h3><p>${n.text}</p></div>`).join('')}</section><div><section class="card method-card"><div class="section-kicker">NUMERICAL CHECKS</div><h2>현재 실험의 계산 점검</h2><div class="metric-list"><div><span>최대 개체수 보존 오차</span><b>${diag.maxMassBalanceError.toExponential(2)}</b></div><div><span>예열 기간</span><b>${diag.warmupDays}일</b></div><div><span>이전 해 대비 일별 최대 차이</span><b>${diag.cycleDifference===null?'평가하지 않음':number(diag.cycleDifference*100,3)+'%'}</b></div><div><span>주기 수렴 점검</span><b>${diag.converged===null?'평가하지 않음':diag.converged?'기준 충족':'미충족 · 예열 조정 권장'}</b></div></div><p class="note-box">개체수는 하루 시작 시점입니다. CSV의 사망·우화·전환은 직전 하루의 흐름입니다. 성충 여왕 1마리와 여왕 교체·분봉·먹이 저장량·진드기 질병은 제외합니다.</p></section><section class="card method-card" style="margin-top:22px"><div class="section-kicker">COMPETITION CHECKLIST</div><h2>대회 요구사항에 연결하기</h2>${REPORT_CHECKLIST.map(n=>`<div class="method-note"><h3>${n.title}</h3><p>${n.text}</p></div>`).join('')}<div class="note-box">이 사이트는 연구 도구입니다. <b>최종 제출물은 25페이지 이내 PDF</b>이며, 요약·목차·참고문헌·부록을 포함합니다.</div></section></div></div><section class="card source-card" style="margin-top:22px"><div class="section-kicker">PARAMETER PROVENANCE</div><h2>현재 값과 그 근거</h2><div class="table-wrap"><table class="parameter-table"><thead><tr><th>파라미터</th><th>현재 값</th><th>문헌 / 가정</th></tr></thead><tbody>${PARAM_META.map(p=>`<tr><td>${p.label}</td><td>${formattedParam(p.key,params[p.key])} ${p.unit}</td><td>${p.status}${p.source?` <a href="${p.source}" target="_blank" rel="noopener">↗</a>`:''}</td></tr>`).join('')}</tbody></table></div></section><section class="card source-card" style="margin-top:22px"><div class="section-kicker">FURTHER READING</div><h2>참고문헌</h2>${SOURCES.map((s,i)=>`<article class="source-item"><span class="source-number">${String(i+1).padStart(2,'0')}</span><div><a href="${s.url}" target="_blank" rel="noopener">${s.title} ↗</a><small>${s.authors} · ${s.year}</small><p>${s.note}</p></div></article>`).join('')}</section>`;
}
function renderBlog() {
  $('#blog-view').innerHTML=`<div class="blog-toolbar"><span>현재 실험의 수치를 반영합니다. 인쇄 시 브라우저 머리글·바닥글을 끄세요.</span><button id="print-blog" class="button primary">한 페이지 인쇄 / PDF ↗</button></div><article class="blog-sheet"><div class="eyebrow">${BLOG.eyebrow}</div><h2>${BLOG.title}</h2><p class="blog-subtitle">${BLOG.subtitle}</p><p class="blog-intro">${BLOG.intro}</p><div class="blog-flow"><span>알</span>→<span>어린 벌</span>→<span>돌보는 벌</span>→<span>꽃을 찾는 벌</span>→<span>열매 맺는 농장</span></div><div class="blog-sections">${BLOG.sections.map(s=>`<section class="blog-section"><span class="section-number">${s.number}</span><h3>${s.title}</h3><p>${s.text}</p></section>`).join('')}</div><div class="blog-live"><div><div class="stat-value">${number(result.summary.peakAdults)}</div><p>현재 설정의 최대 성충 / 마리</p></div><div><div class="stat-value">${number(poll.hives)}</div><p>필요 벌통 / ${number(farm.area)} m²</p></div><div><div class="stat-value">${farm.bloomDays}<small>days</small></div><p>${date(farm.bloomStart-1)} 시작 개화기</p></div></div><p class="blog-takeaway">${BLOG.takeaway}</p><p class="blog-footnote">${BLOG.footnote} 농장 조건: 꽃 ${farm.flowerDensity}송이/m²/일, 꽃당 ${farm.visitsPerFlower}회/일, 날씨 ${farm.weather}, 작물 방문 ${farm.cropShare}, 유효 비율 ${farm.efficiency}. 월동 ${params.winterLife}일, 성수기 채집 ${params.summerForagerLife}일.</p><div class="blog-source-links">참고: ${BLOG.sources.map(id=>{const s=SOURCES.find(s=>s.id===id);return `<a href="${s.url}" target="_blank" rel="noopener">${s.authors} (${s.year})</a>`;}).join(' · ')}</div></article>`;
}

function experiment() { return {version:'1.0.0',model:'BeeLab daily age-structured colony',params:{...params},farm:{...farm},analysis:{metric,delta},note:'Uncalibrated exploratory scenario; see METHODOLOGY.md'}; }
function applyExperiment(data) {
  if(!data || data.version!=='1.0.0' || !data.params || !data.farm) throw new Error('BeeLab v1.0.0 실험 설정 파일이 아닙니다.');
  for(const [k,v] of Object.entries(data.params)) { if(!(k in DEFAULTS) || typeof v!=='number' || !Number.isFinite(v)) throw new Error('모델 설정에 잘못된 값이 있습니다.'); }
  for(const [k,v] of Object.entries(data.farm)) { const m=FARM_META.find(p=>p.key===k); if(!m || typeof v!=='number' || !Number.isFinite(v) || v<m.min || v>m.max) throw new Error('농장 설정이 허용 범위를 벗어났습니다.'); }
  params=normalizeParams({...DEFAULTS,...data.params,years:1}); farm={...POLLINATION_DEFAULTS,...data.farm};
  for(const k of ['bloomStart','bloomDays']) farm[k]=Math.round(farm[k]);
  if(data.analysis && Object.hasOwn(metricNames,data.analysis.metric)) metric=data.analysis.metric;
  if([.05,.1,.2].includes(data.analysis?.delta)) delta=data.analysis.delta;
}
function download(name,content,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type})), a=document.createElement('a'); a.href=url; a.download=name; document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast(`${name} 저장을 시작했습니다.`);
}
function csv(rows) { return '\uFEFF'+rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n'); }
function downloadCSV() {
  const keys=['day','doy','eggs','brood','hiveBees','foragers','drones','adults','workerAdults','total','activity','activeForagers','laying','viableLaying','deaths','emerged','droneEmerged','recruits','massBalanceError'];
  download('beelab-daily.csv',csv([keys.map(k=>['deaths','emerged','droneEmerged','recruits'].includes(k)?k+'_previous_interval':k),...result.days.map(r=>keys.map(k=>r[k]))]),'text/csv;charset=utf-8');
}
function downloadFigure(){download('beelab-population.svg',populationSVG(result,chartOptions()),'image/svg+xml;charset=utf-8');}
function stopPlaying(){clearInterval(playTimer);playTimer=null;$('#play-btn').innerHTML=icon('play');$('#play-btn').setAttribute('aria-label','날짜 애니메이션 재생');}

document.addEventListener('click', async event => {
  const button=event.target.closest('button');
  if(event.target.closest('.brand')) { event.preventDefault(); navigate('overview'); return; }
  if(!button) return;
  if(button.dataset.view || button.dataset.go) {navigate(button.dataset.view||button.dataset.go);return;}
  if(button.dataset.mode){mode=button.dataset.mode;visible=mode==='all'?['adults','eggs','brood','hiveBees','foragers','drones']:['adults','hiveBees','foragers','drones'];$$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));renderLegend();renderChart();return;}
  if(button.dataset.series){const k=button.dataset.series;if(visible.includes(k)){if(visible.length===1)return;visible=visible.filter(v=>v!==k);}else visible.push(k);renderLegend();renderChart();return;}
  switch(button.id){
    case 'how-btn':navigate('method');break;
    case 'reset-btn':stopPlaying();params={...DEFAULTS};farm={...POLLINATION_DEFAULTS};metric='meanAdults';delta=.1;selectedDay=170;$('#scenario-select').value='baseline';renderControls();run();toast('기준 실험으로 초기화했습니다.');break;
    case 'run-btn':run();toast('현재 설정으로 계산했습니다.');break;
    case 'play-btn':if(playTimer){stopPlaying();break;}button.innerHTML=icon('pause');button.setAttribute('aria-label','날짜 애니메이션 일시정지');playTimer=setInterval(()=>{selectedDay=(selectedDay+2)%365;renderDay();renderChart();},120);break;
    case 'export-btn':clearTimeout(timer);run();$('#export-dialog').showModal();break;
    case 'close-export':$('#export-dialog').close();break;
    case 'download-csv':downloadCSV();break;
    case 'download-pollination':{const keys=['day','doy','demand','supply','ratio','hives','foragers','activeForagers'];download('beelab-pollination.csv',csv([keys,...poll.daily.map(r=>keys.map(k=>Number.isFinite(r[k])?r[k]:'not_feasible'))]),'text/csv;charset=utf-8');break;}
    case 'download-json':download('beelab-experiment.json',JSON.stringify(experiment(),null,2),'application/json');break;
    case 'download-figure':case 'svg-export':downloadFigure();break;
    case 'download-sensitivity':{button.disabled=true;const stamp=JSON.stringify([generation,metric,delta]);try{const rows=await getSensitivity();if(stamp!==JSON.stringify([generation,metric,delta]))throw new Error('설정이 변경되었습니다. 다시 내보내기를 눌러 주세요.');const keys=['key','label','metric','baseline','lowValue','highValue','actualLowPercent','actualHighPercent','low','high','lowChange','highChange','elasticity','bounded'];download('beelab-sensitivity.csv',csv([keys,...rows.map(r=>keys.map(k=>r[k]))]),'text/csv;charset=utf-8');}catch(e){toast(e.message);}finally{button.disabled=false;}break;}
    case 'uncertainty-btn':{button.disabled=true;const stamp=generation;$('#uncertainty-output').innerHTML='<span class="loader"></span>64개 시나리오 계산 중';try{const a=await analyze('uncertainty',{runs:64,seed:2022,spread:.1});if(stamp===generation){$('#uncertainty-output').className='chart-container';$('#uncertainty-output').innerHTML=uncertaintySVG(a);button.textContent='다시 계산';}}catch(e){toast(e.message);}finally{button.disabled=false;}break;}
    case 'print-blog':window.print();break;
    case 'share-btn':{const url=new URL(location.href);url.hash='experiment='+encodeURIComponent(JSON.stringify(experiment()));history.replaceState(null,'',url);try{await navigator.clipboard.writeText(url.href);toast('설정이 포함된 실험 주소를 복사했습니다.');}catch{toast('주소창에 실험 설정을 담았습니다. 주소를 복사해 공유하세요.');}break;}
  }
});
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.dataset.model){const k=el.dataset.model;params[k]=Number(el.value);$(`#value-model-${k}`).innerHTML=`${formattedParam(k,params[k])}<small>${meta[k].unit}</small>`;$('#scenario-select').value='custom';clearTimeout(timer);timer=setTimeout(run,150);}
  if(el.dataset.farm){const k=el.dataset.farm;farm[k]=Number(el.value);const m=FARM_META.find(p=>p.key===k);$(`#value-farm-${k}`).innerHTML=`${number(farm[k],2)}<small>${m.unit}</small>`;updatePollination();renderOverview();renderBlog();}
  if(el.id==='day-slider'){stopPlaying();selectedDay=Number(el.value);renderDay();renderChart();}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='scenario-select' && PRESETS[el.value]) {params={...PRESETS[el.value]};renderControls();run();}
  if(el.id==='compare-toggle') renderChart();
  if(el.id==='metric-select'){metric=el.value;sensitivityRows=null;renderSensitivity();}
  if(el.id==='delta-select'){delta=Number(el.value);sensitivityRows=null;renderSensitivity();}
  if(el.id==='import-json' && el.files[0]) {try{if(el.files[0].size>100000)throw new Error('설정 파일이 너무 큽니다.');applyExperiment(JSON.parse(await el.files[0].text()));$('#scenario-select').value='custom';renderControls();run();$('#export-dialog').close();toast('실험 설정을 불러왔습니다.');}catch(e){toast(e.message);}el.value='';}
});
$('#population-chart').addEventListener('pointermove',event=>{
  const svg=$('#population-chart svg');if(!svg)return;const box=svg.getBoundingClientRect();const x=(event.clientX-box.left)/box.width;const d=Math.max(0,Math.min(364,Math.round((x*900-68)/808*364)));const r=result.days[d];
  let tip=$('#population-chart .chart-tooltip');if(!tip){tip=document.createElement('div');tip.className='chart-tooltip';$('#population-chart').append(tip);}
  tip.innerHTML=`<strong>${date(d)}</strong>${visible.map(k=>`<div><span>${names[k]}</span><b>${number(r[k])}</b></div>`).join('')}<div><span>전체 성충</span><b>${number(r.adults)}</b></div>`;
  tip.style.left=`${Math.max(5,Math.min(event.clientX-box.left+15,box.width-160))}px`;tip.style.top='25px';
});
$('#population-chart').addEventListener('pointerleave',()=>$('#population-chart .chart-tooltip')?.remove());
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlaying();});
try{const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('experiment')){applyExperiment(JSON.parse(hash.get('experiment')));$('#scenario-select').value='custom';}}catch{toast('공유 설정을 읽지 못해 기준값으로 시작합니다.');}
baseline=simulate(DEFAULTS);renderControls();run();icons();
