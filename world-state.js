import { POLLINATION_DEFAULTS } from './model.js';

const YEAR_DAYS = 365;
const HOURS_PER_REAL_SECOND = 6;
const SPEEDS = new Set([0.25, 1, 4, 12]);
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

function validSpeed(value) {
  const speed = Number(value);
  if (!SPEEDS.has(speed)) throw new RangeError('Timeline speed must be 0.25, 1, 4, or 12.');
  return speed;
}

function absoluteDay(day, hour) {
  return clamp(clamp(finite(day), 0, YEAR_DAYS) + clamp(finite(hour), 0, 24) / 24, 0, YEAR_DAYS);
}

function parts(elapsedDays) {
  if (elapsedDays >= YEAR_DAYS) return { day: YEAR_DAYS - 1, hour: 24 };
  const day = Math.floor(elapsedDays);
  return { day, hour: (elapsedDays - day) * 24 };
}

/**
 * Deterministic simulation clock. At 1×, one real second represents six hours.
 * A frame can advance at most 0.25 real seconds, so returning to a background
 * browser tab cannot silently skip a season. No browser timers are created.
 *
 * State is in [0, 365]. The terminal boundary is day 364, hour 24; it does not
 * silently become day 0. Mutators return fresh snapshots and preserve pause
 * state when seeking, except that a non-looping end boundary always pauses.
 */
export function createTimeline({ day = 119, hour = 10, speed = 1, playing = true, loop = false } = {}) {
  let elapsedDays = absoluteDay(day, hour);
  let currentSpeed = validSpeed(speed);
  let looping = Boolean(loop);
  let isPlaying = Boolean(playing) && (elapsedDays < YEAR_DAYS || looping);

  const getState = () => ({ ...parts(elapsedDays), elapsedDays, playing: isPlaying, speed: currentSpeed, loop: looping });
  const play = () => {
    if (elapsedDays >= YEAR_DAYS && looping) elapsedDays = 0;
    isPlaying = elapsedDays < YEAR_DAYS;
    return getState();
  };
  const pause = () => {
    isPlaying = false;
    return getState();
  };

  return {
    getState,
    play,
    pause,
    toggle: () => isPlaying ? pause() : play(),
    setSpeed(value) {
      currentSpeed = validSpeed(value);
      return getState();
    },
    seek(nextDay, nextHour = 12) {
      elapsedDays = absoluteDay(nextDay, nextHour);
      if (!looping && elapsedDays >= YEAR_DAYS) isPlaying = false;
      return getState();
    },
    advance(realDeltaSeconds) {
      const seconds = clamp(finite(realDeltaSeconds), 0, 0.25);
      if (!isPlaying || seconds === 0) return getState();
      elapsedDays += seconds * HOURS_PER_REAL_SECOND * currentSpeed / 24;
      if (elapsedDays >= YEAR_DAYS) {
        if (looping) elapsedDays %= YEAR_DAYS;
        else {
          elapsedDays = YEAR_DAYS;
          isPlaying = false;
        }
      }
      return getState();
    },
    setLoop(value) {
      looping = Boolean(value);
      if (!looping && elapsedDays >= YEAR_DAYS) isPlaying = false;
      return getState();
    },
  };
}

const WEATHER = Object.freeze({
  clear: { label: '맑음', activity: 1, flower: 1 },
  rain: { label: '비', activity: 0.25, flower: 0.9 },
  drought: { label: '가뭄', activity: 0.7, flower: 0.65 },
});

function seasonAt(day) {
  if (day >= 80 && day < 172) return { season: 'spring', seasonLabel: '봄' };
  if (day >= 172 && day < 264) return { season: 'summer', seasonLabel: '여름' };
  if (day >= 264 && day < 335) return { season: 'autumn', seasonLabel: '가을' };
  return { season: 'winter', seasonLabel: '겨울' };
}

function interpolateRows(rows, elapsedDays) {
  // Model results are chronological. A binary search also supports sparse
  // result fixtures and avoids assuming that row indexes equal timestamps.
  const at = index => finite(rows[index].day, index);
  if (rows.length === 1 || elapsedDays <= at(0)) return { left: rows[0], right: rows[0], fraction: 0 };
  const last = rows.length - 1;
  if (elapsedDays >= at(last)) return { left: rows[last], right: rows[last], fraction: 0 };
  let low = 0;
  let high = last;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (at(middle) <= elapsedDays) low = middle;
    else high = middle;
  }
  const distance = at(high) - at(low);
  return { left: rows[low], right: rows[high], fraction: distance > 0 ? (elapsedDays - at(low)) / distance : 0 };
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Pure mapping from the existing population model to a 3D world frame.
 * `weather` is an illustrative daily foraging multiplier, not population
 * feedback. Existing model counts are never changed. Farm weather and the
 * selected visual weather are each applied once to daily visit supply.
 *
 * Rendered bees are a capped representative sample, not individual colony
 * members. Daylight controls visible flying bees; daily supply remains a
 * daily measure and therefore does not drop to zero when the clock is night.
 */
export function deriveWorldState(result, farm = {}, timeline, { weather = 'clear' } = {}) {
  if (!Array.isArray(result?.days) || result.days.length === 0) {
    throw new TypeError('deriveWorldState requires a simulation result with daily rows.');
  }
  const clock = typeof timeline?.getState === 'function' ? timeline.getState() : (timeline ?? {});
  const elapsedDays = clamp(finite(clock.elapsedDays, absoluteDay(clock.day ?? 119, clock.hour ?? 10)), 0, YEAR_DAYS);
  const { day, hour } = parts(elapsedDays);
  const { left, right, fraction } = interpolateRows(result.days, elapsedDays);
  const interpolate = key => Math.max(0, finite(left[key]) + (finite(right[key]) - finite(left[key])) * fraction);
  const adults = interpolate('adults');
  const foragers = interpolate('foragers');
  const hiveBees = interpolate('hiveBees');
  const eggs = interpolate('eggs');
  const brood = interpolate('brood');
  const drones = interpolate('drones');
  const viableLaying = interpolate('viableLaying');
  const laying = interpolate('laying');
  const emerged = interpolate('emerged');
  const droneEmerged = interpolate('droneEmerged');
  const recruits = interpolate('recruits');
  const deaths = interpolate('deaths');
  const care = clamp(interpolate('care'), 0, 1);
  const foragerMortality = clamp(interpolate('muF'), 0, 1);
  const seasonalActivity = clamp(interpolate('activity'), 0, 1);
  const selectedWeather = Object.hasOwn(WEATHER, weather) ? weather : 'clear';
  const conditions = WEATHER[selectedWeather];
  const daylight = hour > 6 && hour < 18 ? Math.sin(Math.PI * (hour - 6) / 12) ** 1.3 : 0;
  const activity = seasonalActivity * daylight * conditions.activity;
  const activeForagers = foragers * activity;
  const beeCount = Math.round(clamp(activeForagers / 60, 0, 160));

  const options = {};
  const source = farm?.options ?? farm ?? {};
  for (const [key, fallback] of Object.entries(POLLINATION_DEFAULTS)) options[key] = finite(source[key], fallback);
  for (const key of ['area', 'flowerDensity', 'visitsPerFlower', 'visitsPerBee', 'reserve']) options[key] = Math.max(0, options[key]);
  for (const key of ['weather', 'cropShare', 'efficiency', 'naturalShare']) options[key] = clamp(options[key], 0, 1);
  options.bloomStart = Math.round(clamp(options.bloomStart, 1, YEAR_DAYS));
  options.bloomDays = Math.round(clamp(options.bloomDays, 1, YEAR_DAYS));
  const bloomOffset = modulo(day - (options.bloomStart - 1), YEAR_DAYS);
  const inBloom = bloomOffset < options.bloomDays;
  const continuousBloomOffset = modulo(Math.min(elapsedDays, YEAR_DAYS - 1e-9) - (options.bloomStart - 1), YEAR_DAYS);
  const edgeDays = Math.min(3, options.bloomDays / 3);
  const bloomShape = options.bloomDays === YEAR_DAYS ? 1
    : smoothstep(continuousBloomOffset / edgeDays) * smoothstep((options.bloomDays - continuousBloomOffset) / edgeDays);
  const flowerCoverage = inBloom ? bloomShape * conditions.flower : 0;
  const dailyDemand = inBloom
    ? options.area * options.flowerDensity * options.visitsPerFlower * (1 - options.naturalShare) * (1 + options.reserve)
    : 0;
  const potentialDailySupply = foragers * seasonalActivity * options.weather * conditions.activity
    * options.cropShare * options.visitsPerBee * options.efficiency;
  const dailySupply = inBloom ? potentialDailySupply : 0;
  const pollinationRate = !inBloom ? null : dailyDemand === 0 ? 1 : clamp(dailySupply / dailyDemand, 0, 1);

  return {
    day, hour, elapsedDays, doy: day + 1,
    ...seasonAt(day),
    playing: Boolean(clock.playing),
    speed: SPEEDS.has(clock.speed) ? clock.speed : 1,
    loop: Boolean(clock.loop),
    weather: selectedWeather,
    weatherLabel: conditions.label,
    weatherFactor: conditions.activity,
    seasonalActivity, daylight, activity, activeForagers, beeCount,
    flowerCoverage, inBloom,
    adults, foragers, hiveBees, eggs, brood, drones,
    viableLaying, laying, emerged, droneEmerged, recruits, deaths, care, foragerMortality,
    pollinationRate, dailyDemand, dailySupply, potentialDailySupply,
    effectiveVisits: dailySupply,
    weatherExplanation: '선택한 날씨는 시각화와 당일 채집 능력의 가정입니다. 군집 개체수에는 되먹임하지 않습니다.',
  };
}
