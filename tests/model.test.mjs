import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, SENSITIVITY_KEYS, advanceCohorts, simulate, sensitivity, pollination, uncertainty,
  morris, winterShare, poissonAtLeast, requiredVisitRate } from '../src/model.js';

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
  assert.equal(effects.length, SENSITIVITY_KEYS.length);
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

test('nursing load decides how many emerging workers become long-lived winter bees', () => {
  assert.equal(winterShare(0, DEFAULTS), 1);
  assert.equal(winterShare(Infinity, DEFAULTS), 0);
  assert.ok(Math.abs(winterShare(DEFAULTS.winterLoadHalf, DEFAULTS) - 0.5) < 1e-12);
  assert.ok(winterShare(0.05, DEFAULTS) > winterShare(0.3, DEFAULTS));
  const result = simulate();
  let closedSeasonDays = 0;
  for (let i = 0; i < result.days.length; i++) {
    const row = result.days[i];
    assert.ok(row.winterBees >= 0 && row.winterBees <= row.hiveBees + 1e-9);
    // Winter bees postpone foraging while the flight season is closed (flows report the previous day).
    if (i > 0 && result.days[i - 1].activity === 0) {
      closedSeasonDays++;
      assert.equal(row.winterRecruits, 0);
    }
  }
  assert.ok(closedSeasonDays > 30);
  const june = result.days.find(d => d.doy === 166);
  const november = result.days.find(d => d.doy === 319);
  assert.ok(june.winterShare < 0.1, `June share ${june.winterShare}`);
  assert.ok(november.longLivedShare > 0.5, `November long-lived share ${november.longLivedShare}`);
});

test('baseline reproduces the seasonal patterns it is checked against', () => {
  const result = simulate();
  const { patterns, lifespans } = result.diagnostics;
  for (const check of patterns) assert.ok(check.pass, `${check.id}: ${check.observed}`);
  // Summer bees work themselves to death; autumn-reared bees live for months.
  assert.ok(lifespans.june.mean < 45 && lifespans.june.p90 <= 60);
  assert.ok(lifespans.october.p90 >= 120);
  assert.ok(lifespans.october.mean > 2 * lifespans.june.mean);
  const peak = result.summary.peakAdults;
  const december = result.days.find(d => d.doy === 335);
  assert.ok(december.adults < 0.75 * peak);
  assert.ok(result.summary.troughDay >= 32 && result.summary.troughDay <= 135);
});

test('Poisson helpers match closed forms and invert monotonically', () => {
  for (const lambda of [0.1, 1, 2.5, 7]) {
    assert.ok(Math.abs(poissonAtLeast(1, lambda) - (1 - Math.exp(-lambda))) < 1e-12);
    assert.ok(Math.abs(poissonAtLeast(2, lambda) - (1 - Math.exp(-lambda) * (1 + lambda))) < 1e-12);
  }
  assert.equal(poissonAtLeast(0, 0), 1);
  assert.equal(poissonAtLeast(3, 0), 0);
  assert.ok(Math.abs(requiredVisitRate(1, 0.9) - Math.log(10)) < 1e-9);
  const rate = requiredVisitRate(2, 0.9);
  assert.ok(Math.abs(poissonAtLeast(2, rate) - 0.9) < 1e-9);
  assert.ok(requiredVisitRate(3, 0.9) > rate && requiredVisitRate(2, 0.95) > rate);
});

test('random-visit coverage needs more hives than the mean-visit criterion and is minimal', () => {
  const result = simulate();
  const p = pollination(result);
  const c = p.coverage;
  assert.ok(c.feasible);
  assert.equal(c.minimumVisits, 2);
  assert.ok(c.hives >= p.hives);
  // The mean-visit plan leaves part of the flowers under-visited on its limiting day.
  assert.ok(c.atDeterministic.worst < c.target);
  const at = n => c.curve.find(point => point.hives === n);
  assert.ok(at(c.hives).worst >= c.target - 1e-12);
  assert.ok(at(c.hives - 1).worst < c.target);
  for (let i = 1; i < c.curve.length; i++) assert.ok(c.curve[i].worst >= c.curve[i - 1].worst);
  assert.equal(pollination(result, { weather: 0 }).coverage.feasible, false);
  assert.equal(pollination(result, { area: 0 }).coverage.hives, 0);
  assert.ok(pollination(result, { coverageTarget: 0.99 }).coverage.hives > c.hives);
});

test('Morris screening is seeded, complete and consistent', () => {
  const a = morris(DEFAULTS, { trajectories: 2, seed: 7 });
  const b = morris(DEFAULTS, { trajectories: 2, seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.rows.length, SENSITIVITY_KEYS.length);
  assert.equal(a.runs, 1 + 2 * (SENSITIVITY_KEYS.length + 1));
  for (const row of a.rows) {
    assert.equal(row.n, 2);
    assert.ok(row.muStar >= Math.abs(row.mu) - 1e-12);
    assert.ok(Number.isFinite(row.sigma) && row.sigma >= 0);
  }
  for (let i = 1; i < a.rows.length; i++) assert.ok(a.rows[i - 1].muStar >= a.rows[i].muStar);
  assert.throws(() => morris(DEFAULTS, { metric: 'nope' }), RangeError);
});
