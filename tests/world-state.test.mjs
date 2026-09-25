import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, deriveWorldState } from '../src/world-state.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≈ ${expected}`);
const farm = { area: 300, bloomStart: 120, bloomDays: 21, flowerDensity: 2, visitsPerFlower: 3,
  visitsPerBee: 20, weather: 0.5, cropShare: 0.2, efficiency: 0.5, naturalShare: 0.25, reserve: 0.1 };
const result = { days: Array.from({ length: 366 }, (_, day) => ({ day,
  adults: 20000 + day * 20, hiveBees: 19000 + day * 20, foragers: 600, drones: 400,
  eggs: 1000 + day * 2, brood: 5000 + day * 4, activity: 0.8,
  viableLaying: 700 + day, laying: 900 + day, emerged: 120 + day * 0.5,
  droneEmerged: 10, recruits: 80 + day * 0.2, deaths: 65 + day * 0.1, care: 0.7, muF: 0.08 })) };

test('timeline has one clock: 1× is six simulated hours per real second', () => {
  const clock = createTimeline();
  assert.equal(clock.getState().day, 119);
  near(clock.getState().hour, 10);
  clock.advance(0.1);
  near(clock.getState().hour, 10.6);
  clock.advance(100); // Browser suspension is clamped to a quarter-second.
  near(clock.getState().hour, 12.1);
  assert.equal(clock.getState().loop, false);
});

test('speed, pause, toggle and independent snapshots are predictable', () => {
  for (const speed of [0.25, 1, 4, 12]) {
    const clock = createTimeline({ day: 0, hour: 0, speed });
    clock.advance(0.2);
    near(clock.getState().hour, 1.2 * speed);
    clock.pause();
    const paused = clock.getState();
    clock.advance(0.25);
    assert.deepEqual(clock.getState(), paused);
    clock.toggle();
    assert.equal(clock.getState().playing, true);
    clock.setSpeed(4);
    assert.equal(clock.getState().speed, 4);
    const copy = clock.getState();
    copy.elapsedDays = 300;
    assert.notEqual(clock.getState().elapsedDays, 300);
  }
  assert.throws(() => createTimeline({ speed: 2 }), RangeError);
  assert.throws(() => createTimeline().setSpeed(0), RangeError);
});

test('negative and invalid frame deltas do not advance the clock', () => {
  const clock = createTimeline();
  const before = clock.getState();
  for (const delta of [-1, NaN, Infinity, -Infinity]) clock.advance(delta);
  assert.deepEqual(clock.getState(), before);
});

test('end boundary pauses without wrapping and can be rewound explicitly', () => {
  const clock = createTimeline({ day: 364, hour: 23.9, speed: 12 });
  clock.advance(0.25);
  assert.deepEqual(clock.getState(), { day: 364, hour: 24, elapsedDays: 365, playing: false, speed: 12, loop: false });
  clock.play();
  clock.advance(0.25);
  assert.equal(clock.getState().elapsedDays, 365);
  assert.equal(clock.getState().playing, false);
  clock.seek(1, 6);
  assert.equal(clock.getState().playing, false);
  clock.play();
  clock.advance(0.25);
  near(clock.getState().elapsedDays, 2);
});

test('looping wraps only when explicitly enabled', () => {
  const clock = createTimeline({ day: 364, hour: 23.4, speed: 4 });
  clock.setLoop(true);
  clock.advance(0.25);
  near(clock.getState().elapsedDays, 0.225);
  near(clock.getState().hour, 5.4);
  assert.equal(clock.getState().playing, true);
  clock.seek(364, 24);
  clock.pause();
  clock.play();
  assert.equal(clock.getState().elapsedDays, 0);
  clock.setLoop(false);
  assert.equal(clock.getState().loop, false);
});

test('seeking uses zero-based days, supports terminal hour 24, and preserves pause', () => {
  const clock = createTimeline({ playing: false });
  clock.seek(14);
  near(clock.getState().elapsedDays, 14.5);
  clock.seek(364, 24);
  assert.equal(clock.getState().elapsedDays, 365);
  clock.seek(1000, 0);
  assert.equal(clock.getState().elapsedDays, 365);
  clock.seek(-100, -2);
  assert.equal(clock.getState().elapsedDays, 0);
  clock.seek(100.5, 0);
  near(clock.getState().elapsedDays, 100.5);
  assert.equal(clock.getState().playing, false);
});

test('world populations interpolate deterministically and rewind with no accumulated state', () => {
  const clock = createTimeline({ day: 125, hour: 12, playing: false });
  const first = deriveWorldState(result, farm, clock);
  near(first.adults, 22510);
  near(first.eggs, 1251);
  near(first.brood, 5502);
  near(first.viableLaying, 825.5);
  near(first.emerged, 182.75);
  near(first.recruits, 105.1);
  near(first.deaths, 77.55);
  near(first.care, 0.7);
  near(first.foragerMortality, 0.08);
  clock.seek(280, 8);
  deriveWorldState(result, farm, clock, { weather: 'rain' });
  clock.seek(125, 12);
  assert.deepEqual(deriveWorldState(result, farm, clock), first);
  assert.deepEqual(deriveWorldState(result, farm, clock.getState()), first);
});

test('daily visit estimate uses each weather factor once, without a nighttime daily-demand error', () => {
  const clock = createTimeline({ day: 125, hour: 12 });
  const clear = deriveWorldState(result, farm, clock);
  near(clear.dailyDemand, 1485);
  near(clear.dailySupply, 480);
  near(clear.pollinationRate, 480 / 1485);
  assert.equal(clear.beeCount, 8);
  const rain = deriveWorldState(result, farm, clock, { weather: 'rain' });
  near(rain.dailySupply, 120);
  assert.equal(rain.adults, clear.adults);
  assert.equal(rain.beeCount, 2);
  clock.seek(125, 1);
  const night = deriveWorldState(result, farm, clock);
  assert.equal(night.beeCount, 0);
  assert.equal(night.activity, 0);
  assert.equal(night.dailySupply, clear.dailySupply);
  assert.equal(night.dailyDemand, clear.dailyDemand);
});

test('bloom days have exact boundaries and smooth visual flower edges', () => {
  const clock = createTimeline({ day: 118, hour: 23.9 });
  assert.equal(deriveWorldState(result, farm, clock).inBloom, false);
  assert.equal(deriveWorldState(result, farm, clock).pollinationRate, null);
  clock.seek(119, 0);
  const opening = deriveWorldState(result, farm, clock);
  assert.equal(opening.inBloom, true);
  assert.equal(opening.flowerCoverage, 0);
  clock.seek(121, 12);
  const middle = deriveWorldState(result, farm, clock);
  assert.ok(middle.flowerCoverage > 0.9);
  clock.seek(139, 23.9);
  assert.equal(deriveWorldState(result, farm, clock).inBloom, true);
  assert.ok(deriveWorldState(result, farm, clock).flowerCoverage < 0.01);
  clock.seek(140, 0);
  const closed = deriveWorldState(result, farm, clock);
  assert.equal(closed.inBloom, false);
  assert.equal(closed.flowerCoverage, 0);
  assert.equal(closed.dailyDemand, 0);
  assert.equal(closed.dailySupply, 0);
});

test('year-wrapping blooms, zero demand, and no supply have explicit outcomes', () => {
  const clock = createTimeline({ day: 0, hour: 12 });
  const winterFarm = { ...farm, bloomStart: 360, bloomDays: 12 };
  assert.equal(deriveWorldState(result, winterFarm, clock).inBloom, true);
  assert.equal(deriveWorldState(result, { ...winterFarm, area: 0 }, clock).pollinationRate, 1);
  const noFlight = deriveWorldState(result, { ...winterFarm, weather: 0 }, clock);
  assert.equal(noFlight.pollinationRate, 0);
  assert.equal(noFlight.dailySupply, 0);
  clock.seek(6, 0);
  assert.equal(deriveWorldState(result, winterFarm, clock).inBloom, false);
});

test('season labels, representative bee cap, sparse rows, and endpoint interpolation are finite', () => {
  const clock = createTimeline({ day: 0, hour: 12 });
  for (const [day, season] of [[0, 'winter'], [80, 'spring'], [172, 'summer'], [264, 'autumn'], [335, 'winter']]) {
    clock.seek(day, 12);
    assert.equal(deriveWorldState(result, farm, clock).season, season);
  }
  const sparse = { days: [{ day: 0, adults: 0, activity: 1, foragers: 120000 },
    { day: 365, adults: 36500, activity: 1, foragers: 120000 }] };
  clock.seek(100, 12);
  const frame = deriveWorldState(sparse, farm, clock, { weather: 'unknown' });
  near(frame.adults, 10050);
  assert.equal(frame.beeCount, 160);
  assert.equal(frame.eggs, 0);
  assert.equal(frame.weather, 'clear');
  for (const value of Object.values(frame)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  clock.seek(364, 24);
  assert.equal(deriveWorldState(sparse, farm, clock).adults, 36500);
  assert.throws(() => deriveWorldState({ days: [] }, farm, clock), TypeError);
});
