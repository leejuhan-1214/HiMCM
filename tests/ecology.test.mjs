import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/model.js';
import { createTimeline, deriveWorldState } from '../src/world-state.js';

test('ecological food stores and demographic feedback are finite and repeatable', () => {
  const settings = { ecology: { weatherRegime: 'typical', habitat: 0.7, bloomStart: 120, bloomDays: 21 } };
  const a = simulate({}, settings);
  const b = simulate({}, settings);
  assert.equal(a.days.length, 366);
  assert.deepEqual(a.days, b.days);
  assert.ok(a.summary.meanAdults > 20000);
  assert.ok(a.diagnostics.maxMassBalanceError < 1e-6);
  for (const row of a.days) {
    for (const key of ['adults', 'nectarStore', 'pollenStore', 'flowerResource', 'nectarAdequacy', 'pollenAdequacy']) {
      assert.ok(Number.isFinite(row[key]) && row[key] >= 0, `${key} on day ${row.day}`);
    }
  }
});

test('habitat and climate affect stores and can feed back to colony size', () => {
  const typical = simulate({}, { ecology: { weatherRegime: 'typical', habitat: 0.7 } });
  const wet = simulate({}, { ecology: { weatherRegime: 'wet', habitat: 0.7 } });
  const sparse = simulate({}, { ecology: { weatherRegime: 'typical', habitat: 0.5 } });
  assert.ok(typical.days[130].nectarStore > wet.days[130].nectarStore);
  assert.ok(typical.summary.meanAdults > sparse.summary.meanAdults);
  assert.ok(sparse.days.some(row => row.nectarAdequacy < 1));
});

test('crop bloom timing changes resource forcing and a visual frame exposes ecological state', () => {
  const early = simulate({}, { ecology: { bloomStart: 120, bloomDays: 21 } });
  const late = simulate({}, { ecology: { bloomStart: 240, bloomDays: 21 } });
  assert.ok(early.days[130].flowerResource > late.days[130].flowerResource);
  const clock = createTimeline({ day: 130, hour: 12, playing: false });
  const frame = deriveWorldState(early, {}, clock, { weather: 'clear' });
  assert.ok(frame.nectarStore > 0);
  assert.ok(frame.wildflowerCoverage > 0);
  assert.equal(frame.weatherExplanation.includes('되먹임'), false);
});
