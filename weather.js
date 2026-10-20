/**
 * Deterministic, spatially explicit *scenario* weather, not a forecast.
 * Scene coordinates are illustrative, not a meteorological grid in kilometres.
 * A moving frontal band or a smaller afternoon shower needs both moisture and
 * lift. The wooded northern ridge receives extra upslope lift. Each patch then
 * retains rainfall in a simple soil-water bucket with evaporation and limited
 * managed watering. Fixed events make seeking and scenario comparison exact.
 */
const YEAR = 365;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
export const WEATHER_ZONES = Object.freeze({
  hive: { x: -9, z: -2, title: '벌통 주변', ridge: 0, evaporation: 1, irrigation: 0 },
  meadow: { x: -40, z: 1, title: '초지', ridge: 0, evaporation: 1.05, irrigation: 0.7 },
  orchard: { x: 39, z: -12, title: '과수원', ridge: 0.1, evaporation: 0.88, irrigation: 0.55 },
  woodland: { x: -1, z: -43, title: '숲 능선', ridge: 1, evaporation: 0.72, irrigation: 0 },
  crop: { x: 34, z: 17, title: '경작지', ridge: 0, evaporation: 1.18, irrigation: 1 },
  village: { x: 39, z: 40, title: '마을 정원', ridge: 0, evaporation: 1.12, irrigation: 0.32 },
});
const names = Object.keys(WEATHER_ZONES);
let seed = 2022;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function makeEvents() {
  seed = 2022;
  const events = [];
  for (let day = 0; day < YEAR; day++) {
    const warm = Math.sin(Math.PI * clamp((day - 65) / 240));
    if (random() < 0.105) events.push({ kind: 'front', start: day, duration: 4,
      moisture: 0.65 + random() * 0.4, tilt: random() * 0.5 - 0.25 });
    if (random() < 0.025 + 0.085 * warm) events.push({ kind: 'shower', start: day,
      duration: 1.7, moisture: 0.65 + random() * 0.4,
      x: -55 + random() * 105, z: -48 + random() * 95 });
  }
  return events;
}
const EVENTS = makeEvents();
const cache = new Map();

function atmosphericDay(day, regime) {
  const moisture = regime === 'wet' ? 1.32 : regime === 'drought' ? 0.54 : 1;
  const rain = {}, clouds = {}, causes = {}, kinds = {};
  for (const name of names) {
    const zone = WEATHER_ZONES[name];
    let total = 0, cloud = 0, primary = null, strongest = 0;
    for (const event of EVENTS) {
      const elapsed = day - event.start;
      if (elapsed < 0 || elapsed >= event.duration) continue;
      let footprint;
      if (event.kind === 'front') {
        const bandX = -84 + elapsed * 49;
        const distance = (zone.x - bandX + (0.30 + event.tilt) * zone.z) / 30;
        footprint = Math.exp(-distance * distance);
      } else {
        const dx = (zone.x - event.x - elapsed * 13) / 29;
        const dz = (zone.z - event.z + elapsed * 9) / 25;
        footprint = Math.exp(-(dx * dx + dz * dz));
      }
      const lift = event.kind === 'front' ? 0.64 + zone.ridge * 0.38 : 0.73 + zone.ridge * 0.18;
      const forcing = event.moisture * moisture * footprint * lift;
      const contribution = clamp((forcing - 0.21) * 1.55);
      total += contribution;
      cloud = Math.max(cloud, clamp(footprint * moisture * 0.93));
      if (contribution > strongest) { strongest = contribution; primary = event.kind; }
    }
    rain[name] = clamp(total);
    clouds[name] = Math.max(cloud, rain[name]);
    kinds[name] = primary ?? 'clear';
    causes[name] = rain[name] > 0.08
      ? primary === 'front'
        ? (zone.ridge ? '습한 전선이 숲 능선을 타고 상승해 응결했습니다.' : '습한 전선의 비구름 띠가 이 구역을 통과합니다.')
        : '가열된 공기가 상승해 국지적인 소나기 구름이 생겼습니다.'
      : cloud > 0.12
        ? '비구름 가장자리이지만 이 구역의 습기와 상승 조건은 강수에 부족합니다.'
        : '오늘의 습한 전선과 소나기 중심이 이 구역을 지나지 않습니다.';
  }
  return { rain, clouds, causes, kinds };
}

/** The returned 365 days share the same synthetic storms across regimes. */
export function weatherYear({ weatherRegime = 'typical', waterAccess = 0.7 } = {}) {
  const regime = ['typical', 'wet', 'drought'].includes(weatherRegime) ? weatherRegime : 'typical';
  const water = clamp(Number.isFinite(Number(waterAccess)) ? Number(waterAccess) : 0.7);
  const key = `${regime}:${water}`;
  if (cache.has(key)) return cache.get(key);
  const atmosphere = Array.from({ length: YEAR }, (_, day) => atmosphericDay(day, regime));
  const soil = Object.fromEntries(names.map(name => [name, 0.55]));
  const snowpack = Object.fromEntries(names.map(name => [name, 0]));
  const rows = [];
  // One repeat-year spin-up removes an arbitrary January soil initial state.
  for (let pass = 0; pass < 2; pass++) for (let day = 0; day < YEAR; day++) {
    const dayWeather = atmosphere[day];
    const warmth = clamp(Math.sin(Math.PI * (day - 55) / 270), 0, 1);
    const zoneSoil = {}, zoneRain = {}, zoneSnowfall = {}, zoneSnowpack = {}, zoneTemperature = {}, zoneCauses = {};
    for (const name of names) {
      const zone = WEATHER_ZONES[name];
      const temperature = 9 + 13 * Math.sin(2 * Math.PI * (day - 80) / YEAR) - zone.ridge * 1.7;
      const frozen = temperature <= 0;
      const rain = frozen ? 0 : dayWeather.rain[name];
      const snowfall = frozen ? dayWeather.rain[name] : 0;
      snowpack[name] = clamp(snowpack[name] + snowfall * 0.24, 0, 2);
      const melt = Math.min(snowpack[name], Math.max(0, temperature) * 0.006);
      snowpack[name] -= melt;
      const evaporativeLoss = (0.0045 + 0.008 * warmth) * zone.evaporation;
      const irrigation = water * zone.irrigation * (0.011 + 0.012 * warmth);
      soil[name] = clamp(soil[name] + rain * 0.22 + melt + irrigation - evaporativeLoss);
      zoneSoil[name] = soil[name];
      zoneRain[name] = rain;
      zoneSnowfall[name] = snowfall;
      zoneSnowpack[name] = snowpack[name];
      zoneTemperature[name] = temperature;
      zoneCauses[name] = snowfall > 0.08
        ? (zone.ridge ? '습한 공기가 숲 능선에서 상승했고, 영하의 공기에서 눈이 됩니다.' : '전선 또는 소나기 구름이 지나며, 영하의 기온 때문에 눈이 됩니다.')
        : dayWeather.causes[name];
    }
    if (pass === 1) rows.push({ ...dayWeather, rain: zoneRain, snowfall: zoneSnowfall,
      snowpack: zoneSnowpack, temperature: zoneTemperature, soil: zoneSoil, causes: zoneCauses, regime });
  }
  if (cache.size > 8) cache.clear();
  cache.set(key, rows);
  return rows;
}

export function weatherAt(day, options = {}) {
  const index = ((Math.floor(Number.isFinite(Number(day)) ? Number(day) : 0) % YEAR) + YEAR) % YEAR;
  return weatherYear(options)[index];
}
