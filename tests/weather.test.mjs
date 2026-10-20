import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherAt, weatherYear, WEATHER_ZONES } from '../src/weather.js';
import { landscape, simulate } from '../src/model.js';
import { createTimeline, deriveWorldState } from '../src/world-state.js';

test('synthetic moving storms have spatial footprints and stated causes', () => {
  const year = weatherYear({ weatherRegime: 'typical' });
  assert.equal(year.length, 365);
  const day = year.find(row => Object.values(row.rain).some(value => value > 0.2)
    && Object.values(row.rain).some(value => value < 0.08));
  assert.ok(day, 'at least one day must be wet in one patch and dry in another');
  assert.deepEqual(Object.keys(day.rain), Object.keys(WEATHER_ZONES));
  for (const name of Object.keys(WEATHER_ZONES)) {
    assert.ok(day.rain[name] >= 0 && day.rain[name] <= 1);
    assert.ok(day.soil[name] >= 0 && day.soil[name] <= 1);
    assert.ok(day.causes[name].length > 15);
  }
  assert.deepEqual(weatherAt(1), weatherAt(366));
});

test('air-mass moisture alters rainfall while the same storm track is retained', () => {
  const wet = weatherYear({ weatherRegime: 'wet' });
  const dry = weatherYear({ weatherRegime: 'drought' });
  for (const name of Object.keys(WEATHER_ZONES)) {
    const wetTotal = wet.reduce((sum, day) => sum + day.rain[name], 0);
    const dryTotal = dry.reduce((sum, day) => sum + day.rain[name], 0);
    assert.ok(wetTotal > dryTotal, `${name} receives more rain with moister air`);
  }
  assert.ok(wet.some((row, day) => row.rain.woodland > dry[day].rain.woodland));
});

test('rain and retained soil moisture reach flowering and colony rows', () => {
  const exposed = landscape(190, { weatherRegime: 'drought', waterAccess: 0 });
  const watered = landscape(190, { weatherRegime: 'drought', waterAccess: 1 });
  assert.ok(watered.zoneSoil.crop > exposed.zoneSoil.crop);
  assert.ok(watered.flowerResource > exposed.flowerResource);
  const result = simulate({}, { ecology: { weatherRegime: 'typical' } });
  const rainyIndex = result.days.findIndex(row => Object.values(row.zoneRain).some(value => value > 0.2));
  assert.ok(rainyIndex >= 0);
  const row = result.days[rainyIndex];
  const frame = deriveWorldState(result, {}, createTimeline({ day: rainyIndex, hour: 15, playing: false }));
  assert.deepEqual(frame.zoneRain, row.zoneRain);
  assert.ok(frame.weatherExplanation.includes('토양'));
  assert.ok(Object.keys(frame.zoneWeatherCause).includes('woodland'));
});

test('afternoon showers are shown only in their patch and time window', () => {
  const result = simulate({}, { ecology: { weatherRegime: 'typical' } });
  const index = result.days.findIndex(row => Object.entries(row.zoneWeatherKind)
    .some(([key, kind]) => kind === 'shower' && row.zoneRain[key] > 0.2));
  assert.ok(index >= 0);
  const morning = deriveWorldState(result, {}, createTimeline({ day: index, hour: 8, playing: false }));
  const afternoon = deriveWorldState(result, {}, createTimeline({ day: index, hour: 15, playing: false }));
  const showerZone = Object.keys(afternoon.zoneWeatherKind).find(key => afternoon.zoneWeatherKind[key] === 'shower'
    && afternoon.zoneRain[key] > 0.2);
  assert.equal(morning.zoneRainNow[showerZone], 0);
  assert.ok(afternoon.zoneRainNow[showerZone] > 0.2);
  assert.ok(Object.values(afternoon.zoneRainNow).some(value => value < 0.08));
});

test('freezing precipitation accumulates locally and thaw releases stored water', () => {
  const year = weatherYear({ weatherRegime: 'wet' });
  const snowDay = year.findIndex(row => Object.values(row.snowfall).some(value => value > 0.1));
  assert.ok(snowDay >= 0);
  const snowyZone = Object.keys(year[snowDay].snowfall).find(key => year[snowDay].snowfall[key] > 0.1);
  assert.ok(year[snowDay].temperature[snowyZone] <= 0);
  assert.ok(year[snowDay].snowpack[snowyZone] > 0);
  assert.ok(year[snowDay].causes[snowyZone].includes('눈'));
  const thawDay = year.findIndex((row, index) => index > snowDay && row.temperature[snowyZone] > 0
    && year[index - 1].snowpack[snowyZone] > row.snowpack[snowyZone]);
  assert.ok(thawDay > snowDay);
});
