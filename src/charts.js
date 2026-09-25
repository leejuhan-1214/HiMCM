/** Standalone, dependency-free, exportable SVG charts. No external font/CSS/IDs. */
export const SERIES_COLORS = Object.freeze({
  hiveBees: '#477452', foragers: '#d6a83d', drones: '#78949f',
  eggs: '#92afb9', brood: '#d59877', adults: '#263c2e', total: '#263c2e',
});

export const SERIES_LABELS = Object.freeze({
  hiveBees: '내근벌', foragers: '채집벌', drones: '수벌',
  eggs: '알', brood: '유충·번데기', adults: '전체 성충', total: '모든 발달 단계',
});

const BOX = Object.freeze({ width: 900, height: 320, left: 68, right: 24, top: 30, bottom: 51 });
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const nonnegative = value => Math.max(0, finite(value));
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const f = value => finite(value).toFixed(2);
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function formatChartNumber(value, maximumFractionDigits = 1) {
  return Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits }) : '—';
}

function svgFrame(title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX.width} ${BOX.height}" width="${BOX.width}" height="${BOX.height}" role="img" aria-label="${escape(title)}" style="display:block;max-width:100%;height:auto;background:#fff;font-family:Inter,Arial,'Noto Sans KR',sans-serif"><title>${escape(title)}</title><desc>${escape(description)}</desc><rect width="900" height="320" fill="#ffffff"/>${body}</svg>`;
}

function emptyChart(title) {
  return svgFrame(title, '표시할 데이터가 없습니다.', '<text x="450" y="155" text-anchor="middle" font-size="14" fill="#788078">표시할 데이터가 없습니다</text>');
}

function plotBox() {
  return { left: BOX.left, top: BOX.top, width: BOX.width - BOX.left - BOX.right, height: BOX.height - BOX.top - BOX.bottom };
}

function scaleFor(minimumDay, maximumDay, maxValue) {
  const box = plotBox();
  const rawStep = Math.max(1e-6, maxValue) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const factor = rawStep / power;
  const niceFactor = [1, 2, 2.5, 5, 10].find(value => factor <= value) ?? 10;
  const step = niceFactor * power;
  const maximum = Math.max(step, Math.ceil(Math.max(0, maxValue) / step) * step);
  const range = Math.max(1, maximumDay - minimumDay);
  return {
    ...box, maximum, step, minimumDay, maximumDay,
    x: day => box.left + (finite(day) - minimumDay) / range * box.width,
    y: value => box.top + box.height * (1 - clamp(nonnegative(value) / maximum, 0, 1)),
  };
}

function axes(scale, { unit = '천 마리', divisor = 1000, xTicks = [], xLabel = '' } = {}) {
  let body = `<text x="${scale.left}" y="15" font-size="11" fill="#778074">${escape(unit)}</text>`;
  for (let tick = 0; tick <= scale.maximum + scale.step / 100; tick += scale.step) {
    const y = scale.y(tick);
    const rendered = tick / divisor;
    const precision = scale.step / divisor < 0.1 ? 3 : scale.step / divisor < 1 ? 2 : 1;
    body += `<line x1="${scale.left}" y1="${f(y)}" x2="${f(scale.left + scale.width)}" y2="${f(y)}" stroke="#e8ece5" stroke-width="1" ${tick > 0 ? 'stroke-dasharray="3 5"' : ''}/><text x="${scale.left - 13}" y="${f(y + 4)}" text-anchor="end" font-size="11" fill="#8a9087">${escape(formatChartNumber(rendered, precision))}</text>`;
  }
  for (const tick of xTicks) {
    if (tick.day < scale.minimumDay || tick.day > scale.maximumDay) continue;
    const x = scale.x(tick.day);
    const anchor = x < scale.left + 15 ? 'start' : x > scale.left + scale.width - 15 ? 'end' : 'middle';
    body += `<text x="${f(x)}" y="${f(scale.top + scale.height + 24)}" text-anchor="${anchor}" font-size="11" fill="#8a9087">${escape(tick.label)}</text>`;
  }
  if (xLabel) body += `<text x="${f(scale.left + scale.width)}" y="${BOX.height - 7}" text-anchor="end" font-size="10" fill="#9a9f97">${escape(xLabel)}</text>`;
  return body;
}

function calendarTicks(minimumDay, maximumDay) {
  const firstYear = Math.floor(minimumDay / 365);
  const lastYear = Math.floor(maximumDay / 365);
  const multipleYears = lastYear > firstYear;
  const ticks = [];
  for (let year = firstYear; year <= lastYear; year++) {
    for (let month = 0; month < 12; month++) {
      if (multipleYears && month % (lastYear - firstYear >= 3 ? 6 : 3) !== 0) continue;
      ticks.push({ day: year * 365 + MONTH_STARTS[month], label: multipleYears ? `${year + 1}년 ${month + 1}월` : `${month + 1}월` });
    }
  }
  return ticks;
}

function displayedDays(result) {
  const rows = (result?.days ?? []).filter(row => Number.isFinite(Number(row.day)));
  if (rows.length > 1 && rows.at(-1).day > rows[0].day && rows.at(-1).day % 365 === 0) return rows.slice(0, -1);
  return rows;
}

function linePath(rows, scale, keyOrFunction) {
  const get = typeof keyOrFunction === 'function' ? keyOrFunction : row => row[keyOrFunction];
  return rows.map((row, index) => `${index ? 'L' : 'M'}${f(scale.x(row.day))},${f(scale.y(get(row)))}`).join(' ');
}

function bloomBands(scale, bloom) {
  if (!bloom || finite(bloom.days) <= 0) return '';
  const start = clamp(Math.round(finite(bloom.start, 120)), 1, 365) - 1;
  const duration = clamp(finite(bloom.days, 21), 1, 365);
  let body = '';
  // Include last year's flowering tail when its window crosses New Year.
  for (let year = Math.floor(scale.minimumDay / 365) - 1; year <= Math.floor(scale.maximumDay / 365); year++) {
    const begin = Math.max(scale.minimumDay, year * 365 + start);
    const end = Math.min(scale.maximumDay, year * 365 + start + duration);
    if (end <= begin) continue;
    const x = scale.x(begin);
    const width = scale.x(end) - x;
    body += `<rect x="${f(x)}" y="${scale.top}" width="${f(width)}" height="${scale.height}" fill="#f5edd0" opacity="0.62"/>`;
    if (width > 28) body += `<text x="${f(x + width / 2)}" y="${scale.top + 13}" text-anchor="middle" font-size="10" fill="#a08a42">개화기</text>`;
  }
  return body;
}

/** selectedDay is zero-based model row.day; bloom.start is one-based day of year. */
export function populationSVG(result, { mode = 'adults', visible, baseline = null, selectedDay = 170, bloom = { start: 120, days: 21 } } = {}) {
  const rows = displayedDays(result);
  if (!rows.length) return emptyChart('꿀벌 군집 개체수');
  const defaultKeys = mode === 'all' ? ['eggs', 'brood', 'hiveBees', 'foragers', 'drones'] : mode === 'total' ? ['total'] : ['hiveBees', 'foragers', 'drones'];
  const keys = (Array.isArray(visible) ? visible : defaultKeys).filter(key => Object.hasOwn(SERIES_COLORS, key));
  const minimumDay = rows[0].day;
  const maximumDay = rows.at(-1).day;
  const baseRows = baseline ? displayedDays(baseline).filter(row => row.day >= minimumDay && row.day <= maximumDay) : [];
  let maxValue = 0;
  for (const row of rows) for (const key of keys) maxValue = Math.max(maxValue, nonnegative(row[key]));
  for (const row of baseRows) maxValue = Math.max(maxValue, nonnegative(row.adults));
  const scale = scaleFor(minimumDay, maximumDay, maxValue > 0 ? maxValue * 1.05 : 1000);
  let body = bloomBands(scale, bloom);
  body += axes(scale, { xTicks: calendarTicks(minimumDay, maximumDay) });
  if (baseRows.length) body += `<path d="${linePath(baseRows, scale, 'adults')}" fill="none" stroke="#9da795" stroke-width="1.7" stroke-dasharray="6 5" stroke-linecap="round"><title>기준 시나리오 전체 성충</title></path>`;
  for (const key of keys) {
    body += `<path d="${linePath(rows, scale, key)}" fill="none" stroke="${SERIES_COLORS[key]}" stroke-width="${key === 'adults' || key === 'total' ? 2.8 : 2.25}" stroke-linejoin="round" stroke-linecap="round"><title>${SERIES_LABELS[key]}</title></path>`;
  }
  if (selectedDay !== null && selectedDay !== undefined && Number.isFinite(Number(selectedDay))) {
    const selection = clamp(Number(selectedDay), minimumDay, maximumDay);
    const selected = rows.reduce((closest, row) => Math.abs(row.day - selection) < Math.abs(closest.day - selection) ? row : closest, rows[0]);
    const x = scale.x(selected.day);
    body += `<line x1="${f(x)}" y1="${scale.top}" x2="${f(x)}" y2="${scale.top + scale.height}" stroke="#a0aa96" stroke-width="1" stroke-dasharray="3 4"/>`;
    for (const key of keys) body += `<circle cx="${f(x)}" cy="${f(scale.y(selected[key]))}" r="4" fill="${SERIES_COLORS[key]}" stroke="#fff" stroke-width="2"><title>${SERIES_LABELS[key]} ${formatChartNumber(nonnegative(selected[key]), 0)}마리 · ${selected.day + 1}일</title></circle>`;
  }
  if (!keys.length && !baseRows.length) body += `<text x="${f(scale.left + scale.width / 2)}" y="${f(scale.top + scale.height / 2)}" text-anchor="middle" font-size="13" fill="#8a9087">표시할 개체군을 선택하세요</text>`;
  return svgFrame('시간에 따른 꿀벌 군집 개체수', `세로축 천 마리, 가로축 날짜. ${keys.map(key => SERIES_LABELS[key]).join(', ')}. ${baseRows.length ? '점선은 기준 시나리오의 전체 성충 수입니다.' : ''} 개화기는 옅은 노란색으로 표시됩니다.`, body);
}

export function uncertaintySVG(analysis) {
  let rows = (analysis?.bands ?? []).filter(row => Number.isFinite(Number(row.day)));
  if (!rows.length) return emptyChart('성충 수의 파라미터 불확실성 시나리오');
  if (rows.length > 1 && rows.at(-1).day > 0 && rows.at(-1).day % 365 === 0) rows = rows.slice(0, -1);
  let maximum = 0;
  for (const row of rows) maximum = Math.max(maximum, nonnegative(row.p10), nonnegative(row.p50), nonnegative(row.p90));
  const scale = scaleFor(rows[0].day, rows.at(-1).day, maximum > 0 ? maximum * 1.05 : 1000);
  let body = axes(scale, { xTicks: calendarTicks(rows[0].day, rows.at(-1).day) });
  const upper = linePath(rows, scale, 'p90');
  const lower = [...rows].reverse().map(row => `L${f(scale.x(row.day))},${f(scale.y(row.p10))}`).join(' ');
  body += `<path d="${upper} ${lower} Z" fill="#dce9d9" opacity="0.85"><title>파라미터 시나리오의 10–90백분위 범위</title></path>`;
  body += `<path d="${linePath(rows, scale, 'p50')}" fill="none" stroke="#477452" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"><title>중앙값 P50</title></path>`;
  body += '<rect x="650" y="9" width="14" height="8" rx="2" fill="#dce9d9"/><text x="671" y="17" font-size="10" fill="#778074">P10–P90</text><line x1="744" y1="13" x2="760" y2="13" stroke="#477452" stroke-width="2.2"/><text x="767" y="17" font-size="10" fill="#778074">중앙값 P50</text>';
  return svgFrame('성충 수의 파라미터 불확실성 시나리오', '초록 띠는 독립적인 파라미터 시나리오의 P10–P90이며 통계적 신뢰구간이 아닙니다. 선은 P50 중앙값입니다.', body);
}

export function pollinationSVG(poll) {
  const rows = (poll?.daily ?? []).filter(row => Number.isFinite(Number(row.day)));
  if (!rows.length) return emptyChart('개화기의 일별 수분 수요와 공급');
  const hives = Number.isFinite(poll.hives) && poll.hives >= 0 ? poll.hives : null;
  const showFleet = hives !== null && hives > 1;
  let maximum = 0;
  for (const row of rows) maximum = Math.max(maximum, nonnegative(row.demand), nonnegative(row.supply), showFleet ? nonnegative(row.supply) * hives : 0);
  const scale = scaleFor(rows[0].day, rows.at(-1).day, maximum > 0 ? maximum * 1.08 : 1000000);
  const indexSet = new Set([0, Math.round((rows.length - 1) / 4), Math.round((rows.length - 1) / 2), Math.round(3 * (rows.length - 1) / 4), rows.length - 1]);
  const ticks = [...indexSet].map(index => ({ day: rows[index].day, label: `${rows[index].doy ?? ((rows[index].day % 365) + 1)}일` }));
  let body = axes(scale, { unit: '백만 유효 방문/일', divisor: 1000000, xTicks: ticks, xLabel: '연중 날짜 · 1월 1일=1일' });
  if (showFleet) body += `<path d="${linePath(rows, scale, row => nonnegative(row.supply) * hives)}" fill="none" stroke="#8ca583" stroke-width="2" stroke-dasharray="6 4" stroke-linejoin="round"><title>${hives}개 벌통의 일일 수분 공급</title></path>`;
  body += `<path d="${linePath(rows, scale, 'demand')}" fill="none" stroke="#bd885d" stroke-width="2.3" stroke-linejoin="round"><title>작물의 일일 유효 방문 수요</title></path>`;
  body += `<path d="${linePath(rows, scale, 'supply')}" fill="none" stroke="#477452" stroke-width="2.4" stroke-linejoin="round"><title>벌통 1개의 일일 유효 방문 공급</title></path>`;
  if (rows.length === 1) {
    const row = rows[0];
    for (const [value, color] of [[row.demand, '#bd885d'], [row.supply, '#477452'], ...(showFleet ? [[row.supply * hives, '#8ca583']] : [])]) {
      body += `<circle cx="${f(scale.x(row.day))}" cy="${f(scale.y(value))}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
    }
  }
  body += '<line x1="425" y1="13" x2="443" y2="13" stroke="#bd885d" stroke-width="2.2"/><text x="450" y="17" font-size="10" fill="#778074">작물 수요</text><line x1="527" y1="13" x2="545" y2="13" stroke="#477452" stroke-width="2.2"/><text x="552" y="17" font-size="10" fill="#778074">1개 벌통 공급</text>';
  if (showFleet) body += `<line x1="656" y1="13" x2="674" y2="13" stroke="#8ca583" stroke-width="2" stroke-dasharray="5 3"/><text x="681" y="17" font-size="10" fill="#778074">${escape(hives)}개 벌통 공급</text>`;
  if (hives === null) body += `<text x="${f(scale.left + scale.width / 2)}" y="${scale.top + 18}" text-anchor="middle" font-size="12" fill="#b27354">활동 불가능한 날은 벌통을 늘려도 수요를 충족할 수 없습니다</text>`;
  return svgFrame('개화기의 일별 수분 수요와 공급', `세로축 하루당 백만 유효 방문. 갈색은 작물 수요, 초록 실선은 한 벌통의 공급${showFleet ? `, 초록 점선은 ${hives}개 벌통의 공급` : ''}. ${hives === null ? '수요를 충족하지 못하는 활동 불가능 날짜가 있습니다.' : ''}`, body);
}
