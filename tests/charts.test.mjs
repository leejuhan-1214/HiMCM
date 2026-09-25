import test from 'node:test';
import assert from 'node:assert/strict';
import { populationSVG, uncertaintySVG, pollinationSVG, SERIES_COLORS } from '../src/charts.js';
import { simulate, pollination } from '../src/model.js';

const BOUNDS = { left: 68, right: 876, top: 30, bottom: 269 };

function pathTags(svg) {
  return [...svg.matchAll(/<path\b[^>]*>/g)].map(match => match[0]);
}

function pathFor(svg, color) {
  const path = pathTags(svg).find(tag => tag.includes(`stroke="${color}"`));
  assert.ok(path, `A path for ${color} must be present`);
  return path;
}

function points(path) {
  const data = /\bd="([^"]*)"/.exec(path)?.[1] ?? '';
  return [...data.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
}

function assertStandalone(svg) {
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 900 320"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /<title>[^<]+<\/title>/);
  assert.match(svg, /<desc>[^<]+<\/desc>/);
  assert.match(svg, /<rect width="900" height="320" fill="#ffffff"\/>/);
  assert.match(svg, /<\/svg>$/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined|\bid=|\bhref=|<script\b|<link\b/);
}

function assertPointsInPlot(svg) {
  const all = pathTags(svg).flatMap(points);
  for (const { x, y } of all) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    assert.ok(x >= BOUNDS.left - 0.01 && x <= BOUNDS.right + 0.01, `x=${x}`);
    assert.ok(y >= BOUNDS.top - 0.01 && y <= BOUNDS.bottom + 0.01, `y=${y}`);
  }
  return all;
}

function synthetic(adults = 3000) {
  return { days: [0, 182, 364, 365].map(day => ({ day, doy: day % 365 + 1, hiveBees: 1000, foragers: 1900, drones: 100, eggs: 500, brood: 800, adults, total: adults + 1300 })) };
}

test('all three chart types export self-contained, labelled, bounded SVGs from model results', () => {
  const result = simulate();
  const bands = result.days.map(row => ({ day: row.day, p10: row.adults * 0.8, p50: row.adults, p90: row.adults * 1.2 }));
  const charts = [
    populationSVG(result),
    populationSVG(result, { mode: 'all', baseline: result }),
    uncertaintySVG({ bands }),
    pollinationSVG(pollination(result)),
  ];
  for (const svg of charts) {
    assertStandalone(svg);
    assert.ok(assertPointsInPlot(svg).length > 0);
  }
});

test('empty charts remain accessible standalone documents', () => {
  for (const svg of [populationSVG(), populationSVG(null), populationSVG({ days: [] }), uncertaintySVG({ bands: [] }), uncertaintySVG(null), pollinationSVG(null), pollinationSVG({ daily: [] })]) {
    assertStandalone(svg);
    assert.match(svg, /표시할 데이터가 없습니다/);
    assert.equal(pathTags(svg).length, 0);
  }
});

test('invalid numeric counts and dates cannot leak nonfinite SVG coordinates', () => {
  const result = { days: [
    { day: NaN, hiveBees: 5000 },
    { day: 0, hiveBees: NaN, foragers: Infinity, drones: -10 },
    { day: 20, hiveBees: undefined, foragers: 0, drones: 0 },
  ] };
  const svg = populationSVG(result, { selectedDay: NaN });
  assertStandalone(svg);
  const rendered = assertPointsInPlot(svg);
  assert.equal(rendered.length, 6);
  assert.ok(rendered.every(point => point.y === BOUNDS.bottom));
  const noneSelected = populationSVG(synthetic(), { visible: ['not-a-series'], baseline: null });
  assert.match(noneSelected, /표시할 개체군을 선택하세요/);
  assertStandalone(noneSelected);
});

test('baseline and selected series use one common linear scale', () => {
  const subject = synthetic();
  const baseline = synthetic(10000);
  const alone = populationSVG(subject, { visible: ['hiveBees'], selectedDay: null, bloom: null });
  const together = populationSVG(subject, { visible: ['hiveBees'], baseline, selectedDay: null, bloom: null });
  const hiveAlone = points(pathFor(alone, SERIES_COLORS.hiveBees))[0];
  const hiveTogether = points(pathFor(together, SERIES_COLORS.hiveBees))[0];
  const basePoint = points(pathFor(together, '#9da795'))[0];
  assert.ok(hiveTogether.y > hiveAlone.y, 'Large baseline must expand the common axis, moving the smaller series toward zero.');
  const renderedRatio = (BOUNDS.bottom - basePoint.y) / (BOUNDS.bottom - hiveTogether.y);
  assert.ok(Math.abs(renderedRatio - 10) < 0.005, `Relative height should reflect 10,000 / 1,000: ${renderedRatio}`);
  assert.match(pathFor(together, '#9da795'), /stroke-dasharray=/);
  assertPointsInPlot(together);
});

test('annual plot includes Jan 1 through Dec 31 once, with monthly date labels', () => {
  const result = simulate();
  const svg = populationSVG(result, { visible: ['adults'], selectedDay: null, bloom: null });
  const adultPoints = points(pathFor(svg, SERIES_COLORS.adults));
  assert.equal(adultPoints.length, 365);
  assert.equal(adultPoints[0].x, BOUNDS.left);
  assert.equal(adultPoints.at(-1).x, BOUNDS.right);
  assert.ok(adultPoints.every((point, index) => index === 0 || point.x > adultPoints[index - 1].x));
  for (let month = 1; month <= 12; month++) assert.match(svg, new RegExp(`>${month}월<`));
  assert.doesNotMatch(svg, />13월</);
});

test('bloom shading stays inside the plot and selected day clamps to a visible endpoint', () => {
  const svg = populationSVG(synthetic(), { bloom: { start: 360, days: 21 }, selectedDay: 9999 });
  const bands = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="#f5edd0"/g)];
  assert.equal(bands.length, 2, 'A New Year crossing bloom has a January tail and a December start.');
  for (const match of bands) {
    const x = Number(match[1]);
    const width = Number(match[3]);
    assert.ok(x >= BOUNDS.left && x + width <= BOUNDS.right + 0.01);
  }
  const circles = [...svg.matchAll(/<circle cx="([\d.]+)"/g)];
  assert.equal(circles.length, 3);
  assert.ok(circles.every(match => Number(match[1]) === BOUNDS.right));
});

test('uncertainty median lies inside its ordered P10–P90 polygon', () => {
  const bands = [0, 100, 364].map(day => ({ day, p10: 1000 + day, p50: 2000 + day, p90: 4000 + day }));
  const svg = uncertaintySVG({ bands });
  const polygon = points(pathTags(svg).find(path => path.includes('fill="#dce9d9"')));
  const median = points(pathFor(svg, '#477452'));
  assert.equal(polygon.length, bands.length * 2);
  assert.equal(median.length, bands.length);
  for (let index = 0; index < bands.length; index++) {
    const upper = polygon[index];
    const lower = polygon[polygon.length - index - 1];
    assert.equal(median[index].x, upper.x);
    assert.equal(median[index].x, lower.x);
    assert.ok(upper.y <= median[index].y && median[index].y <= lower.y);
  }
  assert.match(svg, /통계적 신뢰구간이 아닙니다/);
  assertStandalone(svg);
});

test('zero supply is clearly infeasible and never renders an infinite fleet line', () => {
  const result = simulate();
  const svg = pollinationSVG(pollination(result, { weather: 0 }));
  assertStandalone(svg);
  assertPointsInPlot(svg);
  assert.match(svg, /활동 불가능한 날/);
  assert.ok(!pathTags(svg).some(path => path.includes('stroke="#8ca583"')));
  assert.ok(points(pathFor(svg, '#477452')).every(point => point.y === BOUNDS.bottom));
});

test('one-day bloom has visible point marks and cross-year demand retains chronology', () => {
  const result = simulate({ burninYears: 0 });
  const oneDay = pollinationSVG(pollination(result, { bloomDays: 1 }));
  assertStandalone(oneDay);
  assert.ok([...oneDay.matchAll(/<circle\b/g)].length >= 2);
  const acrossYear = pollination(result, { bloomStart: 360, bloomDays: 10 });
  const svg = pollinationSVG(acrossYear);
  const supply = points(pathFor(svg, '#477452'));
  assert.equal(supply.length, 10);
  assert.ok(supply.every((point, index) => index === 0 || point.x > supply[index - 1].x));
  assertPointsInPlot(svg);
  assertStandalone(svg);
});

test('multi-year populations keep all daily samples and label distinct years', () => {
  const result = simulate({ years: 2 });
  const svg = populationSVG(result, { visible: ['adults'], selectedDay: null });
  assert.equal(points(pathFor(svg, SERIES_COLORS.adults)).length, 730);
  assert.match(svg, />1년 1월</);
  assert.match(svg, />2년 1월</);
  assertPointsInPlot(svg);
});
