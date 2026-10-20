import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, landscape } from '../src/model.js';
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
  assert.ok(sparse.days[130].flowerResource < typical.days[130].flowerResource);
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

test('seasonal landscape patches and distance accounting are finite and distinct', () => {
  const spring = landscape(130, { bloomStart: 120, bloomDays: 21 });
  const summer = landscape(230, { bloomStart: 120, bloomDays: 21 });
  assert.ok(spring.zoneResources.orchard > summer.zoneResources.orchard);
  assert.ok(summer.zoneResources.meadow > spring.zoneResources.meadow);
  assert.ok(spring.zoneResources.crop > 0);
  assert.equal(summer.zoneResources.crop, 0);
  assert.ok(spring.forageDistanceKm > 0 && spring.forageDistanceKm < 3.1);
  assert.ok(spring.landscapeAccess > 0 && spring.landscapeAccess <= 1);
});

test('water, fragmentation and pesticide pressure propagate to resources, stores or adults', () => {
  const normal = simulate({}, { ecology: { structure: 'mixed' } });
  const fragmented = simulate({}, { ecology: { structure: 'fragmented' } });
  const exposed = simulate({}, { ecology: { pesticidePressure: 1 } });
  const dry = landscape(190, { weatherRegime: 'drought', waterAccess: 0 });
  const watered = landscape(190, { weatherRegime: 'drought', waterAccess: 1 });
  assert.ok(fragmented.days[130].flowerResource < normal.days[130].flowerResource);
  assert.ok(fragmented.days[130].nectarStore < normal.days[130].nectarStore);
  assert.ok(exposed.summary.meanAdults < normal.summary.meanAdults);
  assert.ok(exposed.days[130].exposureIndex > 0);
  assert.ok(watered.flowerResource > dry.flowerResource);
  assert.ok(watered.nectarFactor > dry.nectarFactor);
  const frame = deriveWorldState(exposed, {}, createTimeline({ day: 130, playing: false }));
  assert.ok(frame.zoneResources.orchard >= 0);
  assert.ok(frame.exposureIndex > 0);
  assert.equal(frame.waterAccess, 0.7);
});

test('beekeeper feeding prevents winter starvation; switching it off exposes the unmanaged threshold', () => {
  const poor = { weatherRegime: 'drought', habitat: 0.5, waterAccess: 0 };
  const managed = simulate({}, { ecology: poor });
  const unmanaged = simulate({}, { ecology: { ...poor, feeding: false } });
  assert.equal(managed.ecology.feeding, true);
  assert.ok(managed.ecology.fedPerYear > 0);
  assert.ok(managed.summary.minAdults > 1000, `managed min ${managed.summary.minAdults}`);
  assert.ok(managed.days.every(day => day.nectarAdequacy === 1));
  assert.equal(unmanaged.ecology.fedPerYear, 0);
  assert.ok(unmanaged.summary.peakAdults < 1000);
  assert.ok(unmanaged.diagnostics.warnings.some(text => text.includes('소멸')));
  // A typical landscape stores enough on its own.
  assert.equal(simulate({}, { ecology: { weatherRegime: 'typical', habitat: 0.7 } }).ecology.fedPerYear, 0);
});

test('managed colony size rises gradually with habitat instead of jumping from zero', () => {
  const sizes = [0.3, 0.4, 0.5, 0.6, 0.7, 0.9].map(habitat =>
    simulate({}, { ecology: { weatherRegime: 'drought', habitat, waterAccess: 0 } }).summary.meanAdults);
  for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i] >= sizes[i - 1], sizes.join(', '));
  assert.ok(sizes[0] > 100 && sizes[2] > 3000, sizes.join(', '));
});

test('ecology mode computes nutrition itself instead of multiplying the exogenous proxy', () => {
  const settings = { ecology: { weatherRegime: 'typical', habitat: 0.7 } };
  assert.deepEqual(simulate({ nutrition: 0.5 }, settings).summary, simulate({ nutrition: 1 }, settings).summary);
  assert.notDeepEqual(simulate({ nutrition: 0.5 }).summary, simulate({ nutrition: 1 }).summary);
});
