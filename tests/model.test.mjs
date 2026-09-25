import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, advanceCohorts, simulate, sensitivity, pollination, uncertainty } from '../src/model.js';

test('isolated egg cohort emerges after exactly 21 days and survival is applied once', () => {
  let eggs = Float64Array.from([1000, 0, 0]);
  let brood = new Float64Array(18);
  let emerged = 0;
  let losses = 0;
  for (let day = 1; day <= 21; day++) {
    const e = advanceCohorts(eggs, 0, DEFAULTS.eggSurvival ** (1 / 3));
    const b = advanceCohorts(brood, e.matured, DEFAULTS.broodSurvival ** (1 / 18));
    eggs = e.next;
    brood = b.next;
    emerged += b.matured;
    losses += e.deaths + b.deaths;
    if (day < 21) assert.equal(emerged, 0);
    if (day === 3) assert.ok(Math.abs(brood[0] - 942) < 1e-9);
  }
  assert.ok(Math.abs(emerged - 851) < 1e-9);
  assert.ok(Math.abs(emerged + losses - 1000) < 1e-9);
});

test('all daily counts are finite/nonnegative and every internal transfer balances', () => {
  for (const params of Object.values(PRESETS)) {
    const result = simulate(params);
    assert.equal(result.days.length, 366);
    assert.equal(result.days[0].doy, 1);
    assert.equal(result.days[365].doy, 1);
    assert.ok(result.diagnostics.maxMassBalanceError < 1e-7);
    for (const row of result.days) {
      for (const key of ['eggs', 'brood', 'hiveBees', 'foragers', 'drones', 'adults', 'deaths', 'emerged']) {
        assert.ok(Number.isFinite(row[key]) && row[key] >= 0, `${key}: ${row[key]}`);
      }
      assert.ok(Math.abs(row.adults - row.hiveBees - row.foragers - row.drones) < 1e-8);
    }
    for (let i = 1; i < result.days.length; i++) {
      const previous = result.days[i - 1];
      const next = result.days[i];
      assert.ok(Math.abs(next.total - previous.total - next.viableLaying + next.deaths) < 1e-7);
    }
  }
});

test('no laying means no hidden recruitment input or spontaneous growth', () => {
  const result = simulate({ maxLaying: 0, burninYears: 0 });
  assert.equal(result.days[0].adults, DEFAULTS.initialAdults);
  for (let i = 1; i < result.days.length; i++) {
    assert.ok(result.days[i].total <= result.days[i - 1].total + 1e-10);
    assert.equal(result.days[i].emerged, 0);
  }
});

test('empty colony stays empty; fertility bounds separate workers and drones', () => {
  const empty = simulate({ initialAdults: 0 });
  assert.equal(empty.summary.peakAdults, 0);
  const onlyWorkers = simulate({ workerRatio: 1, burninYears: 0 });
  assert.ok(onlyWorkers.days.every(day => day.drones === 0));
  const noWorkers = simulate({ workerRatio: 0, burninYears: 0 });
  assert.ok(noWorkers.days.every(day => day.emerged === 0));
  assert.ok(noWorkers.days[24].drones > 0);
});

test('pollination obeys daily bottleneck, scaling, and impossible-weather limits', () => {
  const result = simulate();
  const p = pollination(result);
  assert.ok(p.feasible);
  assert.ok(p.hives >= p.totalLowerBound);
  assert.equal(p.hives, Math.ceil(Math.max(...p.daily.map(day => day.ratio))));
  const doubled = pollination(result, { area: 162000 });
  assert.ok(Math.abs(doubled.daily[0].ratio - 2 * p.daily[0].ratio) < 1e-12);
  const zeroWeather = pollination(result, { weather: 0 });
  assert.equal(zeroWeather.hives, Infinity);
  assert.equal(zeroWeather.feasible, false);
  assert.equal(pollination(result, { area: 0, weather: 0 }).hives, 0);
  assert.equal(pollination(result, { naturalShare: 1 }).hives, 0);
  assert.equal(pollination(result, { bloomStart: 360, bloomDays: 10 }).daily.length, 10);
  const firstYear = simulate({ burninYears: 0 });
  const twoYears = simulate({ burninYears: 0, years: 2 });
  const crossYear = pollination(firstYear, { bloomStart: 360, bloomDays: 10 });
  assert.equal(crossYear.daily.at(-1).day, 368);
  assert.equal(crossYear.daily.at(-1).foragers, twoYears.days[368].foragers);
});

test('sensitivity uses actual bounded perturbations and undefined zero-baseline elasticity', () => {
  const effects = sensitivity({ ...DEFAULTS, workerRatio: 1 });
  assert.equal(effects.length, 8);
  const fertility = effects.find(item => item.key === 'workerRatio');
  assert.equal(fertility.highValue, 1);
  assert.equal(fertility.highChange, 0);
  assert.equal(fertility.actualHighPercent, 0);
  assert.equal(fertility.bounded, true);
  const empty = sensitivity({ initialAdults: 0 });
  assert.ok(empty.every(item => item.elasticity === null));
});

test('scenario uncertainty is seeded and zero spread collapses to baseline', () => {
  const a = uncertainty(DEFAULTS, { runs: 3, seed: 72, spread: 0.1 });
  const b = uncertainty(DEFAULTS, { runs: 3, seed: 72, spread: 0.1 });
  assert.deepEqual(a, b);
  const flat = uncertainty(DEFAULTS, { runs: 2, spread: 0 });
  const reference = simulate();
  for (let i = 0; i < flat.bands.length; i++) {
    assert.equal(flat.bands[i].p10, reference.days[i].adults);
    assert.equal(flat.bands[i].p90, reference.days[i].adults);
  }
});
