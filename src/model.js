/**
 * HiMCM 2022 A · deterministic, daily, expected-count colony model.
 * This is an exploratory model, not a fitted colony/farm forecast.
 * State is observed at the beginning of each day. Eggs entered at boundary t
 * complete 3 egg and 18 brood transitions, and emerge at boundary t + 21.
 * Survival values below are WHOLE-STAGE probabilities, not daily probabilities.
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
});

const FUKUDA = 'https://doi.org/10.1007/BF02514731';
const KHOURY = 'https://doi.org/10.1371/journal.pone.0018491';
const FAO = 'https://www.fao.org/4/x0083e/X0083E03.htm';
export const PARAM_META = [
  { key: 'maxLaying', label: '최대 산란량', unit: '알/일', min: 0, max: 3000, step: 50, source: KHOURY, status: '문헌 범위를 참고한 시나리오' },
  { key: 'workerRatio', label: '수정란 비율', unit: '비율', min: 0, max: 1, step: 0.01, source: '', status: '가정 · 여왕 생산은 제외' },
  { key: 'eggSurvival', label: '알 단계 생존율', unit: '3일 전체', min: 0, max: 1, step: 0.005, source: FUKUDA, status: '특정 현장 관찰의 예시값' },
  { key: 'broodSurvival', label: '유충·번데기 생존율', unit: '18일 전체', min: 0, max: 1, step: 0.005, source: FUKUDA, status: '0.851 / 0.942 · 조건부 생존율' },
  { key: 'summerForagerLife', label: '성수기 채집 단계 기대수명', unit: '일', min: 3, max: 30, step: 1, source: KHOURY, status: '시나리오 · 성충 전체 수명과 다름' },
  { key: 'winterLife', label: '월동기 기대수명', unit: '일', min: 60, max: 240, step: 5, source: '', status: '문제의 4–6개월을 참고한 가정' },
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
});

const YEAR = 365;
const H_AGES = 366; // Last bin aggregates ages >=365; no artificial age-culling.
const sum = array => array.reduce((a, b) => a + b, 0);
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
  const H = sum(state.H);
  const potential = seasonal(day, p).laying;
  const care = H > 0 ? H / (H + p.careHalf) : 0;
  return { potential, accepted: potential * care * foodFactor, care };
}

// An explicitly hypothetical landscape extension. Stores are ration-equivalents,
// not measured kilograms: one unit feeds 1,000 summer adults for one day.
// The forcing is smooth and deterministic so seeking to a date is reproducible.
function landscape(day, options = {}) {
  const doy = ((day % YEAR) + YEAR) % YEAR + 1;
  const regime = ['typical', 'wet', 'drought'].includes(options.weatherRegime) ? options.weatherRegime : 'typical';
  const habitat = clamp(numeric(options.habitat, 0.7), 0.2, 1.2);
  const bloomStart = clamp(numeric(options.bloomStart, 120), 1, 365);
  const bloomDays = clamp(numeric(options.bloomDays, 21), 1, 365);
  const offset = ((doy - bloomStart + YEAR) % YEAR);
  const cropBloom = offset < bloomDays ? Math.sin(Math.PI * offset / bloomDays) ** 0.65 : 0;
  const spring = Math.exp(-(((doy - 125) / 67) ** 2));
  const summer = Math.exp(-(((doy - 225) / 82) ** 2));
  const autumn = Math.exp(-(((doy - 290) / 43) ** 2));
  const wildflower = doy < 60 || doy > 335 ? 0 : clamp((0.04 + 0.54 * spring + 0.38 * summer + 0.15 * autumn) * habitat, 0, 1);
  const flowerResource = clamp(wildflower + cropBloom * 0.28, 0, 1);
  const weatherPulse = Math.sin(doy * 0.19 + 1.4) + 0.45 * Math.sin(doy * 0.61);
  const rainyDay = regime === 'wet' ? weatherPulse > 0.35 : regime === 'drought' ? weatherPulse > 1.05 : weatherPulse > 0.85;
  const flightWeather = rainyDay ? 0.55 : regime === 'wet' ? 0.93 : regime === 'drought' ? 0.96 : 1;
  const nectarFactor = regime === 'drought' ? 0.82 : regime === 'wet' ? 0.94 : 1;
  const pollenFactor = regime === 'drought' ? 0.87 : regime === 'wet' ? 0.95 : 1;
  const wildPollinators = clamp((0.12 + 0.6 * spring + 0.42 * summer) * flowerResource, 0, 1);
  return { flowerResource, wildflower, cropBloom, flightWeather, nectarFactor, pollenFactor, rainyDay, wildPollinators, regime };
}

function foodDay(state, food, p, day, options) {
  const habitat = landscape(day, options);
  const season = seasonal(day, p);
  const adults = sum(state.H) + state.F + state.D;
  const brood = sum(state.B) + sum(state.DB);
  const competition = 1 - 0.12 * habitat.wildPollinators;
  const forage = state.F * season.activity * habitat.flightWeather * habitat.flowerResource * competition;
  const nectarCollected = forage * 0.021 * habitat.nectarFactor;
  const pollenCollected = forage * 0.008 * habitat.pollenFactor;
  const nectarNeeded = adults / 1000 * (0.28 + 0.72 * season.activity) + brood / 1000 * 0.35;
  const pollenNeeded = brood / 1000 * 0.65 + sum(state.H) / 1000 * season.activity * 0.13;
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
    H: new Float64Array(H_AGES), F: p.initialAdults * 0.04, D: 0,
  };
  // Unknown initial ages: an explicit broad overwinter-age assumption.
  for (let age = 0; age < 120; age++) state.H[age] = p.initialAdults * 0.96 / 120;
  const birth = acceptedLaying(p, state, 0);
  state.E[0] = birth.accepted * p.workerRatio;
  state.DE[0] = birth.accepted * (1 - p.workerRatio);
  return state;
}

function totals(state) {
  const hiveBees = sum(state.H);
  const eggs = sum(state.E) + sum(state.DE);
  const brood = sum(state.B) + sum(state.DB);
  const adults = hiveBees + state.F + state.D;
  return { eggs, brood, hiveBees, foragers: state.F, drones: state.D, adults, total: eggs + brood + adults };
}

function stepState(state, p, time, ecology = null) {
  const season = seasonal(time, p);
  const nextBirth = acceptedLaying(p, state, time + 1, ecology?.layingFactor ?? 1);
  const se = p.eggSurvival ** (1 / 3);
  const effectiveNutrition = p.nutrition * (ecology?.nutritionFactor ?? 1);
  const sb = clamp(p.broodSurvival * effectiveNutrition, 0, 1) ** (1 / 18);
  // Drone brood duration 21 days after hatching. Same stage survival is an assumption.
  const sd = clamp(p.broodSurvival * effectiveNutrition, 0, 1) ** (1 / 21);
  const E = advanceCohorts(state.E, nextBirth.accepted * p.workerRatio, se);
  const DE = advanceCohorts(state.DE, nextBirth.accepted * (1 - p.workerRatio), se);
  const B = advanceCohorts(state.B, E.matured, sb);
  const DB = advanceCohorts(state.DB, DE.matured, sd);
  const H = sum(state.H);
  const fraction = H + state.F > 0 ? state.F / (H + state.F) : 0;
  const social = Math.max(0, 1 - p.socialInhibition * fraction / 0.35);
  // Daily geometric hazards: mean residence time 1/mu, not a deterministic lifetime.
  const starvation = ecology ? (1 - ecology.nectarAdequacy) * 0.035 : 0;
  const badFlight = ecology ? ((1 - ecology.flightWeather) * 0.017 + (ecology.regime === 'drought' ? 0.003 : 0)) * season.activity : 0;
  const muH = clamp(season.activity * p.hiveMortality + (1 - season.activity) / p.winterLife + starvation, 0, 1);
  const muF = clamp(season.activity / p.summerForagerLife + (1 - season.activity) / p.winterLife + starvation + badFlight, 0, 1);
  // Assumed drone mortality incl. autumn/winter exclusion; not a measured coefficient.
  const muD = season.activity / 30 + (1 - season.activity) * 0.12;
  const nextH = new Float64Array(H_AGES);
  let recruits = 0;
  for (let age = 0; age < H_AGES; age++) {
    const surviving = state.H[age] * (1 - muH);
    const maturity = age < p.minimumForagerAge ? 0 : 1 / (1 + Math.exp(-(age - p.transitionAge) / 3));
    const rho = clamp(0.35 * season.activity * maturity * social, 0, 1);
    const transfer = surviving * rho;
    recruits += transfer;
    nextH[Math.min(age + 1, H_AGES - 1)] += surviving - transfer;
  }
  nextH[0] += B.matured;
  const next = {
    E: E.next, B: B.next, DE: DE.next, DB: DB.next, H: nextH,
    F: state.F * (1 - muF) + recruits,
    D: state.D * (1 - muD) + DB.matured,
  };
  const deaths = E.deaths + DE.deaths + B.deaths + DB.deaths + H * muH + state.F * muF + state.D * muD;
  const residual = totals(next).total - totals(state).total - nextBirth.accepted + deaths;
  return {
    state: next,
    flows: { deaths, emerged: B.matured, droneEmerged: DB.matured, recruits,
      laying: nextBirth.potential, viableLaying: nextBirth.accepted,
      care: nextBirth.care, massBalanceError: residual, muH, muF },
  };
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
  let state = initialize(p);
  let food = { nectar: 950, pollen: 180 };
  let maxMassBalanceError = 0;
  let lastFlows = { deaths: 0, emerged: 0, droneEmerged: 0, recruits: 0, ...acceptedLaying(p, state, 0) };
  let previousYear = [];
  const days = [];
  for (let t = 0; t <= burnin + length; t++) {
    const seas = seasonal(t, p);
    const environment = ecological ? foodDay(state, food, p, t, ecologyOptions) : null;
    const birth = acceptedLaying(p, state, t, environment?.layingFactor ?? 1);
    const current = {
      ...row(state, t - burnin, lastFlows), doy: seas.doy,
      activity: seas.activity, activeForagers: state.F * seas.activity,
      laying: t === 0 ? birth.potential : lastFlows.laying,
      viableLaying: t === 0 ? birth.accepted : lastFlows.viableLaying,
      workerAdults: sum(state.H) + state.F,
      ...(environment ? {
        nectarStore: food.nectar, pollenStore: food.pollen,
        nectarCollected: environment.nectarCollected, pollenCollected: environment.pollenCollected,
        nectarAdequacy: environment.nectarAdequacy, pollenAdequacy: environment.pollenAdequacy,
        nutritionFactor: environment.nutritionFactor, flowerResource: environment.flowerResource,
        wildflower: environment.wildflower, cropBloom: environment.cropBloom,
        wildPollinators: environment.wildPollinators,
        flightWeather: environment.flightWeather, rainyDay: environment.rainyDay,
      } : {}),
    };
    if (t >= burnin - YEAR && t < burnin) previousYear.push(current.adults);
    if (t >= burnin) days.push(current);
    if (t === burnin + length) break;
    const step = stepState(state, p, t, environment);
    state = step.state;
    if (environment) food = environment.food;
    lastFlows = step.flows;
    maxMassBalanceError = Math.max(maxMassBalanceError, Math.abs(step.flows.massBalanceError));
  }
  const observed = days.slice(0, -1); // Do not count a repeated year boundary twice.
  const peak = observed.reduce((a, b) => a.adults >= b.adults ? a : b);
  const meanAdults = sum(observed.map(d => d.adults)) / observed.length;
  const cycleDifference = previousYear.length === YEAR
    ? Math.max(...days.slice(0, YEAR).map((d, i) => Math.abs(d.adults - previousYear[i]))) / Math.max(1, peak.adults)
    : null;
  const warnings = [
    '북반구 온대의 가상 계절 시나리오입니다. 현장 자료로 보정·검증된 예측이 아닙니다.',
    ecological
      ? '여왕 1마리, 분봉·질병·공간 제한은 제외했습니다. 꽃·날씨·먹이 저장과 영양 피드백은 미보정 시나리오 가정입니다.'
      : '여왕 1마리, 분봉·질병·공간 제한·먹이 저장 동학을 제외했습니다. 영양 계수는 시나리오 가정입니다.',
  ];
  if (cycleDifference !== null && cycleDifference > 0.05) warnings.push('이전 해와 성충 수 차이가 최대치의 5%를 넘습니다. 예열 후에도 주기 수렴이 확인되지 않았습니다.');
  if (peak.adults > 80000) warnings.push('성충 수가 문제의 참고 범위 80,000마리를 넘습니다. 공간 제한·분봉을 제외한 가정을 점검하세요.');
  return {
    days,
    summary: {
      peakAdults: peak.adults,
      minAdults: Math.min(...observed.map(d => d.adults)),
      finalAdults: days.at(-1).adults,
      meanAdults,
      foragerDays: sum(observed.map(d => d.foragers)),
      activeForagerDays: sum(observed.map(d => d.activeForagers)),
      peakDay: peak.doy,
    },
    params: p,
    ecology: ecological ? { ...ecologyOptions, storeUnit: '1,000 summer-adult daily ration equivalent', calibrated: false } : null,
    diagnostics: {
      maxMassBalanceError, cycleDifference, converged: cycleDifference === null ? null : cycleDifference <= 0.05,
      warmupDays: burnin, warnings,
      stageDays: { egg: 3, workerBrood: 18, droneBrood: 21 },
      dailySurvival: { egg: p.eggSurvival ** (1 / 3), brood: (p.broodSurvival * p.nutrition) ** (1 / 18) },
      developmentSource: FAO,
    },
  };
}

const SENSITIVITY_KEYS = ['maxLaying', 'workerRatio', 'eggSurvival', 'broodSurvival', 'summerForagerLife', 'winterLife', 'transitionAge', 'careHalf'];

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
  return {
    hives: limiting.hives,
    totalLowerBound: Math.ceil(lower),
    limitingDay: limiting.doy,
    demand, capacity,
    avgForagers: sum(daily.map(d => d.foragers)) / daily.length,
    feasible: Number.isFinite(limiting.hives),
    daily, options: o,
    assumptions: ['각 벌통의 세기와 접근성이 동일하고 벌통 간 먹이 경쟁은 무시합니다.', '면적·꽃 밀도·작물 선호·유효 방문 확률은 사용자가 지정한 가정입니다.', '일별 최대 필요량을 사용합니다. 총량 비율은 개화 중 부족한 날을 숨길 수 있어 하한으로만 표시합니다.'],
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
