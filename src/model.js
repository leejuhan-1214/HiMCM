import { weatherAt } from './weather.js';

/**
 * HiMCM 2022 A · deterministic, daily, expected-count colony model.
 * This is an exploratory model, not a fitted colony/farm forecast.
 * State is observed at the beginning of each day. Eggs entered at boundary t
 * complete 3 egg and 18 brood transitions, and emerge at boundary t + 21.
 * Survival values below are WHOLE-STAGE probabilities, not daily probabilities.
 *
 * v2.5: worker longevity is a property of the bee, not of the calendar date.
 * Workers that emerge while there is little open brood to feed develop as
 * long-lived "winter" bees (W) that delay foraging until the next flight season;
 * workers reared under a high nursing load (H) mature into foragers on schedule.
 */
export const DEFAULTS = Object.freeze({
  maxLaying: 1900,
  workerRatio: 0.95,
  eggSurvival: 0.942,
  broodSurvival: 0.851 / 0.942,
  summerForagerLife: 12,
  winterLife: 150,
  transitionAge: 18,
  initialAdults: 20000,
  careHalf: 2500,
  peakDay: 170,
  seasonPower: 1.3,
  burninYears: 2,
  years: 1,
  socialInhibition: 0.75,
  hiveMortality: 0.003,
  minimumForagerAge: 8,
  nutrition: 1,
  winterLoadHalf: 0.15,
  foragerRestLife: 30,
});

const FUKUDA = 'https://doi.org/10.1007/BF02514731';
const KHOURY = 'https://doi.org/10.1371/journal.pone.0018491';
const FAO = 'https://www.fao.org/4/x0083e/X0083E03.htm';
const WINTER_BEES = 'https://doi.org/10.3389/fevo.2020.571094';
const COMAP = 'https://www.contest.comap.org/highschool/contests/himcm/2022_Problems/2022_HiMCM_Problem_A.pdf';
export const PARAM_META = [
  { key: 'maxLaying', label: '최대 산란량', unit: '알/일', min: 0, max: 3000, step: 50, source: KHOURY, status: '문헌 범위를 참고한 시나리오' },
  { key: 'workerRatio', label: '수정란 비율', unit: '비율', min: 0, max: 1, step: 0.01, source: '', status: '가정 · 여왕 생산은 제외' },
  { key: 'eggSurvival', label: '알 단계 생존율', unit: '3일 전체', min: 0, max: 1, step: 0.005, source: FUKUDA, status: '특정 현장 관찰의 예시값' },
  { key: 'broodSurvival', label: '유충·번데기 생존율', unit: '18일 전체', min: 0, max: 1, step: 0.005, source: FUKUDA, status: '0.851 / 0.942 · 조건부 생존율' },
  { key: 'summerForagerLife', label: '성수기 채집 단계 기대수명', unit: '일', min: 3, max: 30, step: 1, source: KHOURY, status: '시나리오 · 성충 전체 수명과 다름' },
  { key: 'winterLife', label: '겨울벌 기대수명', unit: '일', min: 60, max: 240, step: 5, source: COMAP, status: '문제의 4–6개월 · 장수형 겨울벌(W)에만 적용' },
  { key: 'winterLoadHalf', label: '겨울벌 전환 육아부담', unit: '열린 유충/내근벌', min: 0.02, max: 0.5, step: 0.01, source: WINTER_BEES, status: '열린 brood 감소가 장수 일벌을 유도한다는 관찰 · 문턱값은 미보정' },
  { key: 'foragerRestLife', label: '비행 휴지기 채집벌 기대수명', unit: '일', min: 5, max: 90, step: 1, source: WINTER_BEES, status: '가정 · 채집을 시작한 벌은 겨울벌 장수 생리를 잃음' },
  { key: 'transitionAge', label: '채집 전환 연령 기준', unit: '성충 일령', min: 8, max: 35, step: 1, source: KHOURY, status: '로지스틱 성숙도의 중간값 · 실제 평균 아님' },
  { key: 'initialAdults', label: '예열 시작 성충 수', unit: '마리', min: 0, max: 80000, step: 1000, source: '', status: '초기조건 · 내근벌 96%, 채집벌 4%' },
  { key: 'careHalf', label: '육아능력 반포화 개체수', unit: '내근벌 마리', min: 100, max: 12000, step: 100, source: KHOURY, status: '포화함수 형태를 참고한 미보정 가정' },
  { key: 'peakDay', label: '산란 성수기 중심', unit: '연중 일', min: 90, max: 240, step: 1, source: '', status: '북반구 온대 가상 기후 · 1월 1일=1' },
  { key: 'seasonPower', label: '계절 곡선 집중도', unit: '지수', min: 0.5, max: 3, step: 0.1, source: '', status: '가정 · 클수록 성수기에 집중' },
  { key: 'socialInhibition', label: '사회적 억제 강도', unit: '무차원', min: 0, max: 1.5, step: 0.05, source: KHOURY, status: '선행 모델에서 착안 · 동일 수식/단위 아님' },
  { key: 'nutrition', label: '미성숙 단계 영양 조건', unit: '비율', min: 0.4, max: 1, step: 0.05, source: 'https://doi.org/10.1371/journal.pone.0059084', status: '가정 · 단계 생존율에 곱함, 먹이 저장량은 미구현' },
  { key: 'burninYears', label: '예열 기간', unit: '년', min: 0, max: 5, step: 1, source: '', status: '수치적 설정 · 주기 수렴을 보장하지 않음' },
];

export const PRESETS = Object.freeze({
  baseline: { ...DEFAULTS },
  stress: { ...DEFAULTS, summerForagerLife: 6, broodSurvival: 0.8, nutrition: 0.8 },
  recovery: { ...DEFAULTS, summerForagerLife: 16, broodSurvival: 0.94, nutrition: 1 },
});

export const POLLINATION_DEFAULTS = Object.freeze({
  area: 81000,
  bloomStart: 120,
  bloomDays: 21,
  flowerDensity: 30,
  visitsPerFlower: 2,
  visitsPerBee: 1200,
  weather: 0.7,
  cropShare: 0.5,
  efficiency: 0.5,
  naturalShare: 0,
  reserve: 0.1,
  coverageTarget: 0.9,
});

const YEAR = 365;
const H_AGES = 366; // Last bin aggregates ages >=365; no artificial age-culling.
// Unsealed (fed) larval days inside the brood queues: worker larvae ~6 d, drone larvae ~7 d (FAO).
const OPEN_WORKER_LARVA_DAYS = 6;
const OPEN_DRONE_LARVA_DAYS = 7;
// Steepness of the nursing-load switch; a steep Hill curve encodes the threshold-like
// rise of long-lived workers as brood rearing winds down. A function choice, not a fit.
const WINTER_HILL = 4;
const sum = array => {
  let total = 0;
  for (let i = 0; i < array.length; i++) total += array[i];
  return total;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const numeric = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeParams(input = {}) {
  const p = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) p[key] = numeric(input[key], fallback);
  for (const item of PARAM_META) p[item.key] = clamp(p[item.key], item.min, item.max);
  p.burninYears = Math.round(p.burninYears);
  p.years = Math.round(clamp(p.years, 1, 5));
  p.hiveMortality = clamp(p.hiveMortality, 0, 1);
  p.minimumForagerAge = Math.round(clamp(p.minimumForagerAge, 0, 35));
  return p;
}

export function seasonal(day, p = DEFAULTS) {
  const doy = ((day % YEAR) + YEAR) % YEAR + 1;
  const wave = clamp((1 + Math.cos(2 * Math.PI * (doy - p.peakDay) / YEAR)) / 2, 0, 1);
  const activity = clamp((wave - 0.12) / 0.88, 0, 1);
  return { doy, wave, laying: p.maxLaying * wave ** p.seasonPower, activity };
}

/** Daily aging; newborns at t+1 have not yet experienced a complete day. */
export function advanceCohorts(cohorts, newborns, survival) {
  const next = new Float64Array(cohorts.length);
  next[0] = newborns;
  for (let age = 1; age < cohorts.length; age++) next[age] = cohorts[age - 1] * survival;
  return {
    next,
    matured: cohorts[cohorts.length - 1] * survival,
    deaths: sum(cohorts) * (1 - survival),
  };
}

function acceptedLaying(p, state, day, foodFactor = 1) {
  const H = sum(state.H) + sum(state.W);
  const potential = seasonal(day, p).laying;
  const care = H > 0 ? H / (H + p.careHalf) : 0;
  return { potential, accepted: potential * care * foodFactor, care };
}

/** Open (fed) larvae per in-hive worker: the nursing load a newly emerged bee meets. */
function nursingLoad(state) {
  const inHive = sum(state.H) + sum(state.W);
  let larvae = 0;
  for (let i = 0; i < OPEN_WORKER_LARVA_DAYS; i++) larvae += state.B[i];
  for (let i = 0; i < OPEN_DRONE_LARVA_DAYS; i++) larvae += state.DB[i];
  return inHive > 0 ? larvae / inHive : larvae > 0 ? Infinity : 0;
}

/** Share of emerging workers that develop as long-lived winter bees. */
export function winterShare(load, p = DEFAULTS) {
  if (!(load > 0)) return 1;
  if (!Number.isFinite(load)) return 0;
  return 1 / (1 + (load / p.winterLoadHalf) ** WINTER_HILL);
}

/** Behavioural maturity by adult age; precomputed once per parameter set. */
function maturityCurve(p) {
  const curve = new Float64Array(H_AGES);
  for (let age = 0; age < H_AGES; age++) {
    curve[age] = age < p.minimumForagerAge ? 0 : 1 / (1 + Math.exp(-(age - p.transitionAge) / 3));
  }
  return curve;
}

// An explicitly hypothetical landscape extension. Stores are ration-equivalents,
// not measured kilograms: one unit feeds 1,000 summer adults for one day.
// The forcing is smooth and deterministic so seeking to a date is reproducible.
export function landscape(day, options = {}) {
  const doy = ((day % YEAR) + YEAR) % YEAR + 1;
  const regime = ['typical', 'wet', 'drought'].includes(options.weatherRegime) ? options.weatherRegime : 'typical';
  const habitat = clamp(numeric(options.habitat, 0.7), 0.2, 1.2);
  const structure = ['mixed', 'flowerStrip', 'fragmented'].includes(options.structure) ? options.structure : 'mixed';
  const waterAccess = clamp(numeric(options.waterAccess, 0.7), 0, 1);
  const pesticidePressure = clamp(numeric(options.pesticidePressure, 0), 0, 1);
  const bloomStart = clamp(numeric(options.bloomStart, 120), 1, 365);
  const bloomDays = clamp(numeric(options.bloomDays, 21), 1, 365);
  const offset = ((doy - bloomStart + YEAR) % YEAR);
  const cropBloom = offset < bloomDays ? Math.sin(Math.PI * offset / bloomDays) ** 0.65 : 0;
  const pulse = (center, width) => Math.exp(-(((doy - center) / width) ** 2));
  const spring = pulse(125, 67);
  const summer = pulse(225, 82);
  const autumn = pulse(290, 43);
  // A stylized landscape mosaic. Display coordinates are NOT km; these
  // distances only impose an illustrative round-trip cost on food collection.
  const patches = {
    meadow: { km: 0.8, bloom: 0.38 * spring + 0.57 * summer + 0.2 * autumn, weight: 0.44 },
    orchard: { km: 1.1, bloom: pulse(108, 35), weight: 0.28 },
    woodland: { km: 2.2, bloom: 0.42 * spring + 0.24 * summer + 0.35 * autumn, weight: 0.38 },
    village: { km: 3.1, bloom: 0.25 * spring + 0.48 * summer + 0.24 * autumn, weight: 0.20 },
  };
  const weather = weatherAt(day, { weatherRegime: regime, waterAccess });
  const connectivity = structure === 'fragmented' ? 0.95 : structure === 'flowerStrip' ? 1.12 : 1;
  const zoneResources = {};
  let resourceSum = 0;
  let distanceSum = 0;
  for (const [name, patch] of Object.entries(patches)) {
    const local = structure === 'flowerStrip' && name === 'meadow' ? 1.38 : 1;
    const access = Math.exp(-patch.km * (structure === 'fragmented' ? 0.22 : 0.15));
    const soilFactor = 0.78 + 0.22 * weather.soil[name];
    const resource = patch.bloom * patch.weight * habitat * connectivity * soilFactor * local * access;
    zoneResources[name] = resource;
    resourceSum += resource;
    distanceSum += resource * patch.km;
  }
  const wildflower = doy < 60 || doy > 335 ? 0 : clamp(resourceSum, 0, 1);
  const cropResource = cropBloom * 0.28 * (0.78 + 0.22 * weather.soil.crop);
  zoneResources.crop = cropResource;
  const flowerResource = clamp(wildflower + cropResource, 0, 1);
  const forageRain = Object.entries(zoneResources).reduce((total, [name, value]) => total + value * (weather.rain[name] + weather.snowfall[name]), 0)
    / Math.max(0.001, resourceSum + cropResource);
  const hivePrecipitation = weather.rain.hive + weather.snowfall.hive;
  const rainyDay = hivePrecipitation > 0.10;
  const flightWeather = clamp(1 - 0.48 * hivePrecipitation - 0.20 * forageRain, 0.35, 1);
  const weightedSoil = Object.entries(zoneResources).reduce((total, [name, value]) => total + value * weather.soil[name], 0)
    / Math.max(0.001, resourceSum + cropResource);
  const nectarFactor = clamp(0.84 + 0.16 * weightedSoil, 0.65, 1);
  const pollenFactor = clamp(0.87 + 0.13 * weightedSoil, 0.7, 1);
  const forageDistanceKm = resourceSum + cropResource > 0 ? (distanceSum + cropResource * 0.35) / (resourceSum + cropResource) : 0;
  const landscapeAccess = clamp((1 - 0.05 * forageDistanceKm) * (structure === 'fragmented' ? 0.96 : 1), 0.4, 1);
  const exposureIndex = pesticidePressure * (0.34 + 0.66 * cropBloom) * seasonActivity(doy);
  const wildPollinators = clamp((0.12 + 0.6 * spring + 0.42 * summer) * wildflower * (1 - 0.55 * pesticidePressure), 0, 1);
  return { flowerResource, wildflower, cropBloom, flightWeather, nectarFactor, pollenFactor, rainyDay, wildPollinators, regime,
    zoneResources, landscapeAccess, forageDistanceKm, exposureIndex, waterAccess, pesticidePressure, structure,
    zoneRain: weather.rain, zoneSnowfall: weather.snowfall, zoneSnowpack: weather.snowpack,
    zoneTemperature: weather.temperature, zoneCloud: weather.clouds, zoneSoil: weather.soil,
    zoneWeatherCause: weather.causes, zoneWeatherKind: weather.kinds };
}

function seasonActivity(doy) { return clamp((doy - 55) / 55, 0, 1) * clamp((350 - doy) / 60, 0, 1); }

function foodDay(state, food, p, day, options) {
  const habitat = landscape(day, options);
  const season = seasonal(day, p);
  const inHive = sum(state.H) + sum(state.W);
  const adults = inHive + state.F + state.D;
  const brood = sum(state.B) + sum(state.DB);
  const competition = 1 - 0.12 * habitat.wildPollinators;
  const forage = state.F * season.activity * habitat.flightWeather * habitat.flowerResource * habitat.landscapeAccess * competition;
  const nectarCollected = forage * 0.027 * habitat.nectarFactor;
  const pollenCollected = forage * 0.011 * habitat.pollenFactor;
  const nectarNeeded = adults / 1000 * (0.28 + 0.72 * season.activity) + brood / 1000 * 0.35;
  const pollenNeeded = brood / 1000 * 0.65 + inHive / 1000 * season.activity * 0.13;
  const nectarAvailable = food.nectar + nectarCollected;
  const pollenAvailable = food.pollen + pollenCollected;
  const nectarAdequacy = nectarNeeded > 0 ? clamp(nectarAvailable / nectarNeeded, 0, 1) : 1;
  const pollenAdequacy = pollenNeeded > 0 ? clamp(pollenAvailable / pollenNeeded, 0, 1) : 1;
  // Habitat quality proxies pollen diversity as well as quantity; this is an
  // explicit scenario assumption, not a fitted dose-response relationship.
  const quality = clamp(0.8 + 0.2 * clamp(numeric(options.habitat, 0.7), 0.2, 1.2) / 0.7, 0.65, 1.12);
  const nutritionFactor = clamp((0.35 + 0.65 * pollenAdequacy) * quality, 0.25, 1.12);
  const layingFactor = Math.min(nectarAdequacy, pollenAdequacy);
  return {
    ...habitat, nectarCollected, pollenCollected, nectarNeeded, pollenNeeded,
    nectarAdequacy, pollenAdequacy, nutritionFactor, layingFactor,
    food: {
      nectar: clamp(nectarAvailable - nectarNeeded, 0, 2500),
      pollen: clamp(pollenAvailable - pollenNeeded, 0, 360),
    },
  };
}

function initialize(p) {
  const state = {
    E: new Float64Array(3), B: new Float64Array(18),
    DE: new Float64Array(3), DB: new Float64Array(21),
    H: new Float64Array(H_AGES), W: new Float64Array(H_AGES), F: p.initialAdults * 0.04, D: 0,
  };
  // The run starts on 1 January, so the in-hive bees are an overwintering (W) cluster.
  // Unknown initial ages: an explicit broad overwinter-age assumption.
  for (let age = 0; age < 120; age++) state.W[age] = p.initialAdults * 0.96 / 120;
  const birth = acceptedLaying(p, state, 0);
  state.E[0] = birth.accepted * p.workerRatio;
  state.DE[0] = birth.accepted * (1 - p.workerRatio);
  return state;
}

function totals(state) {
  const winterBees = sum(state.W);
  const hiveBees = sum(state.H) + winterBees;
  const eggs = sum(state.E) + sum(state.DE);
  const brood = sum(state.B) + sum(state.DB);
  const adults = hiveBees + state.F + state.D;
  return { eggs, brood, hiveBees, winterBees, foragers: state.F, drones: state.D, adults, total: eggs + brood + adults };
}

/** Daily hazards and recruitment drivers shared by the population step and cohort tracing. */
function dailyRates(state, p, season, ecology) {
  const inHive = sum(state.H) + sum(state.W);
  const fraction = inHive + state.F > 0 ? state.F / (inHive + state.F) : 0;
  const social = Math.max(0, 1 - p.socialInhibition * fraction / 0.35);
  // Daily geometric hazards: mean residence time 1/mu, not a deterministic lifetime.
  const starvation = ecology ? (1 - ecology.nectarAdequacy) * 0.035 : 0;
  const badFlight = ecology ? ((1 - ecology.flightWeather) * 0.017 + (ecology.regime === 'drought' ? 0.003 : 0)
    + ecology.exposureIndex * 0.02) * season.activity : 0;
  return {
    social, activity: season.activity,
    // Short-lived (summer-type) nurses: background in-hive hazard in every season.
    muH: clamp(p.hiveMortality + starvation, 0, 1),
    // Long-lived winter bees keep their longevity until they start foraging.
    muW: clamp(1 / p.winterLife + starvation, 0, 1),
    // Foragers have lost the winter-bee physiology: flight wear in season, a short
    // residual life when they cannot fly (autumn, winter, spells of bad weather).
    muF: clamp(season.activity / p.summerForagerLife + (1 - season.activity) / p.foragerRestLife + starvation + badFlight, 0, 1),
    // Assumed drone mortality incl. autumn/winter exclusion; not a measured coefficient.
    muD: clamp(season.activity / 30 + (1 - season.activity) * 0.12, 0, 1),
  };
}

function stepState(state, p, time, ecology = null, maturity = maturityCurve(p)) {
  const season = seasonal(time, p);
  const nextBirth = acceptedLaying(p, state, time + 1, ecology?.layingFactor ?? 1);
  const se = p.eggSurvival ** (1 / 3);
  const effectiveNutrition = p.nutrition * (ecology?.nutritionFactor ?? 1);
  const sb = clamp(p.broodSurvival * effectiveNutrition, 0, 1) ** (1 / 18);
  // Drone brood duration 21 days after hatching. Same stage survival is an assumption.
  const sd = clamp(p.broodSurvival * effectiveNutrition, 0, 1) ** (1 / 21);
  const load = nursingLoad(state);
  const share = winterShare(load, p);
  const E = advanceCohorts(state.E, nextBirth.accepted * p.workerRatio, se);
  const DE = advanceCohorts(state.DE, nextBirth.accepted * (1 - p.workerRatio), se);
  const B = advanceCohorts(state.B, E.matured, sb);
  const DB = advanceCohorts(state.DB, DE.matured, sd);
  const rates = dailyRates(state, p, season, ecology);
  const { muH, muW, muF, muD, social } = rates;
  const nextH = new Float64Array(H_AGES);
  const nextW = new Float64Array(H_AGES);
  let recruits = 0;
  let winterRecruits = 0;
  for (let age = 0; age < H_AGES; age++) {
    const older = Math.min(age + 1, H_AGES - 1);
    // Summer-type bees mature into foragers on schedule, whatever the season.
    const summerSurvivors = state.H[age] * (1 - muH);
    const summerTransfer = summerSurvivors * clamp(0.35 * maturity[age] * social, 0, 1);
    nextH[older] += summerSurvivors - summerTransfer;
    // Winter bees postpone foraging until the flight season (activity) returns.
    const winterSurvivors = state.W[age] * (1 - muW);
    const winterTransfer = winterSurvivors * clamp(0.35 * season.activity * maturity[age] * social, 0, 1);
    nextW[older] += winterSurvivors - winterTransfer;
    recruits += summerTransfer + winterTransfer;
    winterRecruits += winterTransfer;
  }
  nextH[0] += B.matured * (1 - share);
  nextW[0] += B.matured * share;
  const next = {
    E: E.next, B: B.next, DE: DE.next, DB: DB.next, H: nextH, W: nextW,
    F: state.F * (1 - muF) + recruits,
    D: state.D * (1 - muD) + DB.matured,
  };
  const deaths = E.deaths + DE.deaths + B.deaths + DB.deaths
    + sum(state.H) * muH + sum(state.W) * muW + state.F * muF + state.D * muD;
  const residual = totals(next).total - totals(state).total - nextBirth.accepted + deaths;
  return {
    state: next,
    rates: { ...rates, winterShare: share },
    flows: { deaths, emerged: B.matured, droneEmerged: DB.matured, recruits, winterRecruits,
      laying: nextBirth.potential, viableLaying: nextBirth.accepted,
      care: nextBirth.care, massBalanceError: residual, muH, muW, muF,
      nurseLoad: load, winterShare: share },
  };
}

/**
 * Adult lifespan (days) of workers that emerge on output day `start`, traced through
 * the realised daily hazards and recruitment rates of the run: the expected value,
 * the median, and the age by which 90% have died (comparable to "lives up to X days").
 * The colony is treated as periodic after burn-in, so a cohort that outlives the
 * output year reuses the same calendar day's rates (check diagnostics.cycleDifference).
 */
function cohortLifespan(rateLog, start, p, maturity = maturityCurve(p)) {
  const n = rateLog.length;
  if (!n) return null;
  const first = rateLog[((start % n) + n) % n];
  let summer = new Float64Array(H_AGES);
  let winter = new Float64Array(H_AGES);
  summer[0] = 1 - first.winterShare;
  winter[0] = first.winterShare;
  let forager = 0;
  let mean = 0;
  let median = null;
  let p90 = null;
  for (let k = 0; k < 3 * YEAR; k++) {
    const alive = sum(summer) + sum(winter) + forager;
    if (median === null && alive <= 0.5) median = k;
    if (p90 === null && alive <= 0.1) p90 = k;
    if (alive < 1e-5) break;
    mean += alive;
    const r = rateLog[(((start + 1 + k) % n) + n) % n];
    const nextSummer = new Float64Array(H_AGES);
    const nextWinter = new Float64Array(H_AGES);
    let recruits = 0;
    for (let age = 0; age < H_AGES; age++) {
      if (!summer[age] && !winter[age]) continue;
      const older = Math.min(age + 1, H_AGES - 1);
      const s = summer[age] * (1 - r.muH);
      const sMove = s * clamp(0.35 * maturity[age] * r.social, 0, 1);
      const w = winter[age] * (1 - r.muW);
      const wMove = w * clamp(0.35 * r.activity * maturity[age] * r.social, 0, 1);
      nextSummer[older] += s - sMove;
      nextWinter[older] += w - wMove;
      recruits += sMove + wMove;
    }
    forager = forager * (1 - r.muF) + recruits;
    summer = nextSummer;
    winter = nextWinter;
  }
  return { mean, median, p90, longLivedShare: first.winterShare };
}

const doyIndex = (days, doy) => days.findIndex(d => d.doy === doy);

/**
 * Pattern-oriented checks: qualitative patterns reported in the literature or the
 * problem statement. Passing them is necessary, not sufficient, for credibility.
 */
function phenologyChecks(days, summary, lifespans) {
  const observed = days.slice(0, -1);
  const workers = d => d.hiveBees + d.foragers;
  const nov15 = observed[doyIndex(observed, 319)];
  const dec1 = observed[doyIndex(observed, 335)];
  const longLivedNov = nov15 && workers(nov15) > 0 ? nov15.winterBees / workers(nov15) : null;
  const declineDec = dec1 && summary.peakAdults > 0 ? 1 - dec1.adults / summary.peakAdults : null;
  return [
    {
      id: 'range', label: '연중 최대 성충이 문제의 20,000–80,000마리 범위',
      observed: summary.peakAdults, pass: summary.peakAdults >= 20000 && summary.peakAdults <= 80000, source: COMAP,
    },
    {
      id: 'summerLifespan', label: '6월 15일 우화 일벌의 90%가 60일 안에 사망 (여름벌은 일하다 일찍 죽음)',
      observed: lifespans.june?.p90 ?? null, pass: lifespans.june?.p90 != null && lifespans.june.p90 <= 60, source: WINTER_BEES,
    },
    {
      id: 'autumnLifespan', label: '10월 15일 우화 일벌의 상위 10%가 4개월(120일) 이상 생존 (가을·겨울 4–6개월)',
      observed: lifespans.october?.p90 ?? null, pass: lifespans.october?.p90 != null && lifespans.october.p90 >= 120, source: COMAP,
    },
    {
      id: 'winterMajority', label: '11월 중순 일벌의 과반이 장수형 겨울벌',
      observed: longLivedNov, pass: longLivedNov !== null && longLivedNov > 0.5, source: WINTER_BEES,
    },
    {
      id: 'autumnDecline', label: '12월 1일 성충이 여름 최대치보다 25% 이상 적음',
      observed: declineDec, pass: declineDec !== null && declineDec >= 0.25, source: '',
    },
    {
      id: 'springLow', label: '연중 최소 성충이 늦겨울·초봄(2월–5월 중순)',
      observed: summary.troughDay, pass: summary.troughDay >= 32 && summary.troughDay <= 135, source: '',
    },
  ];
}

function row(state, day, flows = {}) {
  return { day, ...totals(state), ...flows };
}

export function simulate(input = {}, options = {}) {
  const p = normalizeParams(input);
  const ecological = Boolean(options.ecology);
  const ecologyOptions = typeof options.ecology === 'object' ? options.ecology : {};
  const burnin = p.burninYears * YEAR;
  const length = p.years * YEAR;
  const maturity = maturityCurve(p);
  let state = initialize(p);
  let food = { nectar: 950, pollen: 180 };
  let maxMassBalanceError = 0;
  let lastFlows = { deaths: 0, emerged: 0, droneEmerged: 0, recruits: 0, winterRecruits: 0, ...acceptedLaying(p, state, 0) };
  let previousYear = [];
  const rateLog = [];
  const days = [];
  for (let t = 0; t <= burnin + length; t++) {
    const seas = seasonal(t, p);
    const environment = ecological ? foodDay(state, food, p, t, ecologyOptions) : null;
    const birth = acceptedLaying(p, state, t, environment?.layingFactor ?? 1);
    const workers = sum(state.H) + sum(state.W) + state.F;
    const current = {
      ...row(state, t - burnin, lastFlows), doy: seas.doy,
      activity: seas.activity, activeForagers: state.F * seas.activity,
      laying: t === 0 ? birth.potential : lastFlows.laying,
      viableLaying: t === 0 ? birth.accepted : lastFlows.viableLaying,
      workerAdults: workers,
      longLivedShare: workers > 0 ? sum(state.W) / workers : 0,
      ...(environment ? {
        nectarStore: food.nectar, pollenStore: food.pollen,
        nectarCollected: environment.nectarCollected, pollenCollected: environment.pollenCollected,
        nectarAdequacy: environment.nectarAdequacy, pollenAdequacy: environment.pollenAdequacy,
        nutritionFactor: environment.nutritionFactor, flowerResource: environment.flowerResource,
        wildflower: environment.wildflower, cropBloom: environment.cropBloom,
        wildPollinators: environment.wildPollinators,
        flightWeather: environment.flightWeather, rainyDay: environment.rainyDay,
        landscapeAccess: environment.landscapeAccess, forageDistanceKm: environment.forageDistanceKm,
        exposureIndex: environment.exposureIndex, zoneResources: environment.zoneResources,
        zoneRain: environment.zoneRain, zoneSnowfall: environment.zoneSnowfall,
        zoneSnowpack: environment.zoneSnowpack, zoneTemperature: environment.zoneTemperature,
        zoneCloud: environment.zoneCloud, zoneSoil: environment.zoneSoil,
        zoneWeatherCause: environment.zoneWeatherCause, zoneWeatherKind: environment.zoneWeatherKind,
      } : {}),
    };
    if (t >= burnin - YEAR && t < burnin) previousYear.push(current.adults);
    if (t >= burnin) days.push(current);
    if (t === burnin + length) break;
    const step = stepState(state, p, t, environment, maturity);
    if (t >= burnin && t < burnin + YEAR) rateLog.push(step.rates);
    state = step.state;
    if (environment) food = environment.food;
    lastFlows = step.flows;
    maxMassBalanceError = Math.max(maxMassBalanceError, Math.abs(step.flows.massBalanceError));
  }
  const observed = days.slice(0, -1); // Do not count a repeated year boundary twice.
  const peak = observed.reduce((a, b) => a.adults >= b.adults ? a : b);
  const trough = observed.reduce((a, b) => a.adults <= b.adults ? a : b);
  const meanAdults = sum(observed.map(d => d.adults)) / observed.length;
  const cycleDifference = previousYear.length === YEAR
    ? Math.max(...days.slice(0, YEAR).map((d, i) => Math.abs(d.adults - previousYear[i]))) / Math.max(1, peak.adults)
    : null;
  // Emergence on the eve of the target day: the cohort is first counted on that date.
  const lifespanFor = doy => {
    const index = doyIndex(observed, doy);
    return index < 1 || peak.adults <= 0 ? null : cohortLifespan(rateLog, index - 1, p, maturity);
  };
  const lifespans = { june: lifespanFor(166), october: lifespanFor(288) };
  const summary = {
    peakAdults: peak.adults,
    minAdults: trough.adults,
    finalAdults: days.at(-1).adults,
    meanAdults,
    foragerDays: sum(observed.map(d => d.foragers)),
    activeForagerDays: sum(observed.map(d => d.activeForagers)),
    peakDay: peak.doy,
    troughDay: trough.doy,
    summerLifespan: lifespans.june?.mean ?? null,
    autumnLifespan: lifespans.october?.mean ?? null,
  };
  const patterns = phenologyChecks(days, summary, lifespans);
  const warnings = [
    '북반구 온대의 가상 계절 시나리오입니다. 현장 자료로 보정·검증된 예측이 아닙니다.',
    ecological
      ? '여왕 1마리, 분봉·질병·공간 제한은 제외했습니다. 구역별 꽃·거리·물·농약 노출·먹이 저장의 계수는 미보정 시나리오 가정입니다.'
      : '여왕 1마리, 분봉·질병·공간 제한·먹이 저장 동학을 제외했습니다. 영양 계수는 시나리오 가정입니다.',
  ];
  if (cycleDifference !== null && cycleDifference > 0.05) warnings.push('이전 해와 성충 수 차이가 최대치의 5%를 넘습니다. 예열 후에도 주기 수렴이 확인되지 않았습니다.');
  if (peak.adults > 80000) warnings.push('성충 수가 문제의 참고 범위 80,000마리를 넘습니다. 공간 제한·분봉을 제외한 가정을 점검하세요.');
  if (p.initialAdults > 0 && peak.adults < 1000) {
    warnings.push(ecological
      ? '군집이 예열 또는 출력 기간 중 사실상 소멸했습니다(최대 성충 1,000마리 미만). 여러 먹이 압박이 겹치면 가을 저장량이 모자라 겨울에 굶어 죽을 수 있습니다. 양봉가의 먹이 보충은 모델에 없습니다.'
      : '군집이 예열 또는 출력 기간 중 사실상 소멸했습니다(최대 성충 1,000마리 미만). 산란·생존·수명 설정을 확인하세요.');
  }
  return {
    days,
    summary,
    params: p,
    ecology: ecological ? { ...ecologyOptions, storeUnit: '1,000 summer-adult daily ration equivalent', calibrated: false } : null,
    diagnostics: {
      maxMassBalanceError, cycleDifference, converged: cycleDifference === null ? null : cycleDifference <= 0.05,
      warmupDays: burnin, warnings, patterns, lifespans,
      stageDays: { egg: 3, workerBrood: 18, droneBrood: 21 },
      dailySurvival: { egg: p.eggSurvival ** (1 / 3), brood: (p.broodSurvival * p.nutrition) ** (1 / 18) },
      developmentSource: FAO,
    },
  };
}

export const SENSITIVITY_KEYS = Object.freeze(['maxLaying', 'workerRatio', 'eggSurvival', 'broodSurvival', 'summerForagerLife', 'winterLife',
  'foragerRestLife', 'winterLoadHalf', 'transitionAge', 'careHalf']);

/** Local finite differences only. This is not a global/Sobol sensitivity analysis. */
export function sensitivity(input = {}, metric = 'meanAdults', delta = 0.1) {
  const p = normalizeParams(input);
  const base = simulate(p).summary;
  if (!Object.hasOwn(base, metric)) throw new RangeError(`Unknown summary metric: ${metric}`);
  const baseline = base[metric];
  const relativeStep = clamp(numeric(delta, 0.1), 0.001, 0.5);
  return SENSITIVITY_KEYS.map(key => {
    const meta = PARAM_META.find(item => item.key === key);
    const distance = p[key] !== 0 ? Math.abs(p[key]) * relativeStep : (meta.max - meta.min) * relativeStep;
    const lowValue = Math.max(meta.min, p[key] - distance);
    const highValue = Math.min(meta.max, p[key] + distance);
    const low = simulate({ ...p, [key]: lowValue }).summary[metric];
    const high = simulate({ ...p, [key]: highValue }).summary[metric];
    const slope = highValue === lowValue ? null : (high - low) / (highValue - lowValue);
    const elasticity = baseline === 0 || slope === null ? null : slope * p[key] / baseline;
    return {
      key, label: meta.label, low, high, baseline, lowValue, highValue, elasticity,
      lowChange: baseline === 0 ? null : 100 * (low / baseline - 1),
      highChange: baseline === 0 ? null : 100 * (high / baseline - 1),
      actualLowPercent: p[key] === 0 ? null : 100 * (lowValue / p[key] - 1),
      actualHighPercent: p[key] === 0 ? null : 100 * (highValue / p[key] - 1),
      bounded: lowValue !== p[key] - distance || highValue !== p[key] + distance,
      metric,
    };
  }).sort((a, b) => Math.abs(b.elasticity ?? 0) - Math.abs(a.elasticity ?? 0));
}

/** Receptive flower density is simultaneous flowers/m², not annual flowers/m². */
export function pollination(result, input = {}) {
  if (!result?.days?.length) throw new TypeError('pollination requires a simulation result');
  const o = {};
  for (const [key, fallback] of Object.entries(POLLINATION_DEFAULTS)) o[key] = numeric(input[key], fallback);
  for (const key of ['area', 'flowerDensity', 'visitsPerFlower', 'visitsPerBee', 'reserve']) o[key] = Math.max(0, o[key]);
  for (const key of ['weather', 'cropShare', 'efficiency', 'naturalShare']) o[key] = clamp(o[key], 0, 1);
  o.bloomStart = Math.round(clamp(o.bloomStart, 1, YEAR));
  o.bloomDays = Math.round(clamp(o.bloomDays, 1, YEAR));
  // A bloom crossing 31 December must use the next simulated year, not wrap
  // back to a possibly different first-year population (especially without burn-in).
  const lastDay = o.bloomStart - 1 + o.bloomDays - 1;
  let timeline = result.days;
  if (lastDay >= timeline.length && result.params) {
    timeline = simulate({ ...result.params, years: Math.ceil((lastDay + 1) / YEAR) }).days;
  }
  const daily = [];
  for (let offset = 0; offset < o.bloomDays; offset++) {
    const doy = (o.bloomStart - 1 + offset) % YEAR + 1;
    const day = timeline[o.bloomStart - 1 + offset];
    if (!day) throw new RangeError(`Missing simulation day ${doy}`);
    const demand = o.area * o.flowerDensity * o.visitsPerFlower * (1 - o.naturalShare) * (1 + o.reserve);
    const supply = day.foragers * day.activity * o.weather * o.cropShare * o.visitsPerBee * o.efficiency;
    const ratio = demand === 0 ? 0 : supply > 0 ? demand / supply : Infinity;
    daily.push({ day: day.day, doy, demand, supply, ratio, hives: Math.ceil(ratio), foragers: day.foragers, activeForagers: day.activeForagers });
  }
  const limiting = daily.reduce((a, b) => a.ratio >= b.ratio ? a : b);
  const demand = sum(daily.map(d => d.demand));
  const capacity = sum(daily.map(d => d.supply));
  const lower = demand === 0 ? 0 : capacity > 0 ? demand / capacity : Infinity;
  const coverage = visitCoverage(daily, o, limiting.hives);
  return {
    hives: limiting.hives,
    totalLowerBound: Math.ceil(lower),
    limitingDay: limiting.doy,
    demand, capacity,
    avgForagers: sum(daily.map(d => d.foragers)) / daily.length,
    feasible: Number.isFinite(limiting.hives),
    coverage,
    daily, options: o,
    assumptions: ['각 벌통의 세기와 접근성이 동일하고 벌통 간 먹이 경쟁은 무시합니다.', '면적·꽃 밀도·작물 선호·유효 방문 확률은 사용자가 지정한 가정입니다.', '일별 최대 필요량을 사용합니다. 총량 비율은 개화 중 부족한 날을 숨길 수 있어 하한으로만 표시합니다.', '무작위 방문 기준은 방문이 꽃 사이에 독립적으로(포아송) 흩어진다고 보고, 목표 비율의 꽃이 하루 필요 방문 수를 채우는 벌통 수를 계산합니다.'],
  };
}

/** P(X ≥ k) for X ~ Poisson(lambda). */
export function poissonAtLeast(k, lambda) {
  if (k <= 0) return 1;
  if (!(lambda > 0)) return 0;
  if (!Number.isFinite(lambda)) return 1;
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let j = 1; j < k; j++) {
    term *= lambda / j;
    cdf += term;
  }
  return clamp(1 - cdf, 0, 1);
}

/** Smallest mean visits per flower, lambda, with P(Poisson(lambda) ≥ k) ≥ target. */
export function requiredVisitRate(k, target) {
  if (k <= 0 || target <= 0) return 0;
  let lo = 0;
  let hi = Math.max(1, k);
  while (poissonAtLeast(k, hi) < target) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (poissonAtLeast(k, mid) >= target) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * Random-visit (Poisson) coverage. The mean-visit criterion assumes every flower
 * receives exactly its share; with independent random visits many flowers get fewer.
 * Here k = required effective visits per flower per day, other pollinators supply
 * naturalShare × k mean visits, and hives are added until `coverageTarget` of the
 * open flowers reach k visits on every bloom day. The reserve multiplier is not used:
 * the coverage target replaces it as the safety margin.
 */
function visitCoverage(daily, o, deterministicHives) {
  const target = clamp(numeric(o.coverageTarget, 0.9), 0.5, 0.99);
  o.coverageTarget = target;
  const minimumVisits = Math.max(0, Math.round(o.visitsPerFlower));
  const visitRate = requiredVisitRate(minimumVisits, target);
  const wildRate = o.naturalShare * minimumVisits;
  const beeRate = Math.max(0, visitRate - wildRate);
  const flowers = o.area * o.flowerDensity;
  for (const day of daily) {
    const need = flowers * beeRate;
    day.coverageNeed = need;
    day.coverageRatio = need === 0 ? 0 : day.supply > 0 ? need / day.supply : Infinity;
    day.coverageHives = Math.ceil(day.coverageRatio);
  }
  const limiting = daily.reduce((a, b) => a.coverageRatio >= b.coverageRatio ? a : b);
  const covered = (hives, day) => flowers === 0 ? 1 : poissonAtLeast(minimumVisits, hives * day.supply / flowers + wildRate);
  const at = hives => {
    const values = daily.map(day => covered(hives, day));
    return { hives, worst: Math.min(...values), mean: sum(values) / values.length };
  };
  const anchor = Math.max(Number.isFinite(limiting.coverageHives) ? limiting.coverageHives : 0,
    Number.isFinite(deterministicHives) ? deterministicHives : 0, 4);
  const top = Math.min(400, Math.ceil(anchor * 1.5));
  const curve = [];
  for (let hives = 0; hives <= top; hives++) curve.push(at(hives));
  return {
    target, minimumVisits, visitRate, wildRate, beeRate,
    hives: limiting.coverageHives,
    limitingDay: limiting.doy,
    feasible: Number.isFinite(limiting.coverageHives),
    atDeterministic: Number.isFinite(deterministicHives) ? at(deterministicHives) : null,
    curve,
  };
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function quantiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = probability => {
    const i = probability * (sorted.length - 1);
    const lo = Math.floor(i);
    return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
  };
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}

/** Independent uniform parameter scenarios; percentiles are NOT confidence limits. */
export function uncertainty(input = {}, options = {}) {
  const p = normalizeParams(input);
  const runs = Math.round(clamp(numeric(options.runs, 64), 2, 256));
  const seed = Math.round(numeric(options.seed, 2022));
  const spread = clamp(numeric(options.spread, 0.1), 0, 0.5);
  const random = seeded(seed);
  const simulations = [];
  for (let i = 0; i < runs; i++) {
    const sample = { ...p };
    for (const key of SENSITIVITY_KEYS) {
      const meta = PARAM_META.find(item => item.key === key);
      // Sample directly from the truncated physical interval (no endpoint pile-up).
      const lo = Math.max(meta.min, p[key] * (1 - spread));
      const hi = Math.min(meta.max, p[key] * (1 + spread));
      sample[key] = lo + random() * (hi - lo);
    }
    simulations.push(simulate(sample));
  }
  return {
    bands: simulations[0].days.map((d, i) => ({ day: d.day, doy: d.doy, ...quantiles(simulations.map(run => run.days[i].adults)) })),
    runs, seed, spread,
    final: quantiles(simulations.map(run => run.summary.finalAdults)),
    peak: quantiles(simulations.map(run => run.summary.peakAdults)),
    method: '독립 균등분포 가정의 파라미터 시나리오 P10–P90. 통계적 신뢰구간이 아닙니다.',
  };
}

/**
 * Morris elementary-effects screening (Morris 1991; mu* from Campolongo et al. 2007).
 * Every factor moves on a 4-level grid inside θ0·(1 ± spread), truncated to its
 * physical range, while the others sit at random grid points — so, unlike the local
 * one-at-a-time analysis, each effect is measured in many different contexts.
 * Effects are relative (elasticity-like): (ΔY / Y0) / (Δθ / θ0).
 * mu* ranks overall influence; a large sigma (relative to mu*) flags non-linearity or
 * interaction with other factors, without saying which ones. A screening, not Sobol indices.
 */
export function morris(input = {}, options = {}) {
  const p = normalizeParams(input);
  const metric = options.metric ?? 'meanAdults';
  const trajectories = Math.round(clamp(numeric(options.trajectories, 10), 2, 50));
  const spread = clamp(numeric(options.spread, 0.2), 0.01, 0.5);
  const seed = Math.round(numeric(options.seed, 2022));
  const base = simulate(p).summary;
  if (!Object.hasOwn(base, metric)) throw new RangeError(`Unknown summary metric: ${metric}`);
  const baseline = base[metric];
  const random = seeded(seed);
  const levels = 4;
  const jump = levels / (2 * (levels - 1));
  const factors = SENSITIVITY_KEYS.map(key => {
    const meta = PARAM_META.find(item => item.key === key);
    return {
      key, label: meta.label,
      lo: Math.max(meta.min, p[key] * (1 - spread)),
      hi: Math.min(meta.max, p[key] * (1 + spread)),
    };
  });
  const effects = Object.fromEntries(factors.map(f => [f.key, []]));
  const level = (f, u) => f.lo + u * (f.hi - f.lo);
  let runs = 1;
  for (let r = 0; r < trajectories; r++) {
    const x = factors.map(() => Math.floor(random() * 2) / (levels - 1));
    const direction = factors.map(() => random() < 0.5 ? 1 : -1);
    direction.forEach((d, i) => { if (d < 0) x[i] += jump; });
    const sample = () => ({ ...p, ...Object.fromEntries(factors.map((f, i) => [f.key, level(f, x[i])])) });
    let current = simulate(sample()).summary[metric];
    runs++;
    const order = factors.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const i of order) {
      const f = factors[i];
      const before = level(f, x[i]);
      x[i] += direction[i] * jump;
      if (!(f.hi > f.lo)) continue;
      const after = level(f, x[i]);
      const next = simulate(sample()).summary[metric];
      runs++;
      if (baseline !== 0 && p[f.key] !== 0 && Number.isFinite(baseline) && Number.isFinite(next) && Number.isFinite(current)) {
        effects[f.key].push(((next - current) / baseline) / ((after - before) / p[f.key]));
      }
      current = next;
    }
  }
  const rows = factors.map(f => {
    const e = effects[f.key];
    const n = e.length;
    const mu = n ? sum(e) / n : null;
    const muStar = n ? sum(e.map(Math.abs)) / n : null;
    const sigma = n > 1 ? Math.sqrt(sum(e.map(v => (v - mu) ** 2)) / (n - 1)) : null;
    return { key: f.key, label: f.label, mu, muStar, sigma, ratio: muStar ? sigma / muStar : null, n, low: f.lo, high: f.hi };
  }).sort((a, b) => (b.muStar ?? -1) - (a.muStar ?? -1));
  return {
    rows, metric, baseline, trajectories, spread, seed, runs,
    method: 'Morris 기초효과 선별법(4수준, 상대 효과). μ*는 영향의 크기, σ/μ*가 크면 비선형·상호작용 가능성을 뜻합니다. 분산 기반(Sobol) 지수는 아닙니다.',
  };
}

