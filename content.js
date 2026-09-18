/** Research provenance and Korean editorial copy. No UI or model dependencies. */
export const SOURCES = [
  {
    id: 'comap2022',
    title: '2022 HiMCM Problem A: The Need for Bees (and not just for honey)',
    authors: 'COMAP',
    year: 2022,
    url: 'https://www.contest.comap.org/highschool/contests/himcm/2022_Problems/2022_HiMCM_Problem_A.pdf',
    note: '단일 군집의 개체수, 민감도 분석, 20에이커 수분, 비전문가용 1페이지 자료를 요구한다. 최종 PDF는 요약·목차·참고문헌·부록을 포함해 25페이지 이내이다.',
  },
  {
    id: 'khoury2011',
    title: 'A Quantitative Model of Honey Bee Colony Population Dynamics',
    authors: 'Khoury, Myerscough & Barron',
    year: 2011,
    url: 'https://doi.org/10.1371/journal.pone.0018491',
    note: '내근벌·채집벌 구분과 채집 전환의 사회적 억제에 대한 구조적 근거. 이 사이트의 연령 코호트·계절 모형은 원 논문의 직접 재현이 아닌 확장이다.',
  },
  {
    id: 'khoury2013',
    title: 'Modelling Food and Population Dynamics in Honey Bee Colonies',
    authors: 'Khoury, Barron & Myerscough',
    year: 2013,
    url: 'https://doi.org/10.1371/journal.pone.0059084',
    note: '육아 능력·먹이·채집 전환의 상호작용 근거. 현재 기본 모델은 먹이 저장량을 추적하지 않으므로 영양·단백질 부족을 직접 예측하지 않는다.',
  },
  {
    id: 'fukuda1968',
    title: 'Worker brood survival in honeybees',
    authors: 'Fukuda & Sakagami',
    year: 1968,
    url: 'https://doi.org/10.1007/BF02514731',
    note: '벌집 중앙부의 관찰 예시: 알 100개 중 94.2개가 유충, 85.1개가 성충에 도달했다. 유충·번데기 조건부 생존율은 0.851/0.942. 특정 관찰값이며 모든 군집에 적용되는 상수는 아니다.',
  },
  {
    id: 'fao',
    title: 'Honeybee biology — Development of the honeybee',
    authors: 'Food and Agriculture Organization of the United Nations',
    year: '자료',
    url: 'https://www.fao.org/4/x0083e/X0083E03.htm',
    note: '일벌의 대표 발달기간은 알 3일·유충 6일·번데기 12일, 수벌은 총 24일이다. 여왕의 최대 산란량 1,500–2,000개/일도 건강·먹이·공간이 충분한 조건의 설명이다.',
  },
  {
    id: 'rumkee2015',
    title: 'Predicting Honeybee Colony Failure: Using the BEEHAVE Model to Simulate Colony Responses to Pesticides',
    authors: 'Rumkee, Becher, Thorbek, Kennedy & Osborne',
    year: 2015,
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4633771/',
    note: '사망 스트레스의 크기뿐 아니라 발생 계절이 결과를 바꿀 수 있음을 보여 준 모델 연구. 이 사이트의 민감도 순위는 해당 논문의 순위를 복사하지 않고 현재 설정에서 다시 계산한다.',
  },
  {
    id: 'osu',
    title: 'Evaluating honey bee colonies for pollination',
    authors: 'Oregon State University Extension Service · PNW 623',
    year: '자료',
    url: 'https://extension.oregonstate.edu/catalog/pnw-623-evaluating-honey-bee-colonies-pollination',
    note: '태평양 북서부의 평균 사용량 예시: 사과 0.5, 체리 2, 블루베리 3벌통/에이커. 지역·날씨·군집 강도에 의존하는 비교 기준이며, 시뮬레이션의 정답이나 보정 목표가 아니다.',
  },
];

export const MODEL_NOTES = [
  {
    title: '벌통 하나에서 시작합니다',
    text: '일벌의 알 → 유충·번데기 → 내근벌 H → 채집벌 F를 하루씩 추적하고 수벌도 따로 계산합니다. 화면의 알·brood 합계에는 미성숙 수벌이 포함됩니다. 성충 일벌 H+F와 전체 성충 H+F+D를 구분합니다.',
  },
  {
    title: '발달에는 시간이 필요합니다',
    text: '알 3일과 유충·번데기 18일을 연령별 대기열로 계산합니다. 단계 생존율의 일수별 거듭제곱근을 매일 적용해 사망을 중복 계산하지 않습니다. 개체수는 기대값이므로 소수가 가능합니다.',
  },
  {
    title: '양육과 역할 전환을 구분합니다',
    text: '내근벌 수에 따른 보정은 양육 가능한 새 알의 비율에 적용합니다. 사회적 억제는 채집벌 비율이 높을 때 H→F 전환을 늦추는 장치입니다. 전환에는 성충 나이 제한도 반영합니다.',
  },
  {
    title: '계절은 가정한 시나리오입니다',
    text: '날짜에 따른 매끄러운 계절함수로 산란·활동·사망확률을 조절합니다. 실제 기상 관측을 입력한 예보가 아닙니다. 겨울의 장수 일벌은 주로 H에 남으며, 겨울 수명은 개체별 고정 수명이 아닙니다.',
  },
  {
    title: '민감도 순위는 설정에 따라 달라집니다',
    text: '한 변수씩 변화시킨 결과로 산란·생존·역할 전환의 영향을 비교합니다. 선택한 출력과 변화 범위에 대한 국소 결과이므로 전역 민감도나 인과관계의 증명으로 해석하지 않습니다.',
  },
  {
    title: '꽃이 피는 날의 공급을 계산합니다',
    text: '20에이커의 일별 꽃 방문 수요와 채집벌 공급을 연결합니다. 꽃 밀도는 그날 수분이 필요한 꽃/m², 방문 요구량은 꽃 한 송이당 하루 기준입니다. 예시 입력의 방문량은 수확량이나 수정 성공률과 동일하지 않습니다.',
  },
  {
    title: '계산 검증과 현장 검증은 다릅니다',
    text: '비음수·발달 지연·흐름 보존·재현성을 확인해 구현 오류를 줄입니다. 관측 군집에 대한 적합과 독립 자료 검증을 완료한 예측 모델은 아니며, 결과를 현장 의사결정에 그대로 적용할 수 없습니다.',
  },
];

export const BLOG = {
  eyebrow: 'THE NEED FOR BEES · 한 페이지로 이해하기',
  title: '벌통이 많다고, 수분이 충분할까요?',
  subtitle: '꽃이 피는 순간, 일할 수 있는 벌이 얼마나 있는지가 중요합니다.',
  intro: '벌통 속 모든 벌이 꽃을 찾아 나가는 것은 아닙니다. 알과 어린 벌을 돌보는 내근벌, 바깥에서 먹이를 모으는 채집벌이 함께 있어야 다음 세대가 자랍니다. 이 시뮬레이션은 그 연결을 하루씩 따라갑니다.',
  sections: [
    {
      number: '01',
      title: '오늘 낳은 알은 오늘 일하지 않습니다',
      text: '기본 모델에서 일벌은 알에서 성충까지 21일을 보냅니다. 성충이 된 뒤에도 내근 기간이 필요합니다. 개화 직전에 산란량만 늘려서는 그날의 채집벌 부족을 해결하기 어렵습니다.',
    },
    {
      number: '02',
      title: '채집벌의 손실은 벌통 안에도 이어집니다',
      text: '채집벌이 줄면 어린 내근벌이 더 일찍 바깥일을 맡을 수 있습니다. 양육 인력이 줄어드는 효과까지 연결되므로, 생존과 산란 중 무엇이 중요한지는 함께 계산해야 합니다.',
    },
    {
      number: '03',
      title: '20에이커에도 정답은 하나가 아닙니다',
      text: '작물의 꽃 수, 개화 시기, 날씨, 채집벌이 그 작물을 찾는 비율에 따라 필요한 벌통 수가 달라집니다. 이 모델은 개화기 전체 방문량과 하루별 부족량을 함께 확인합니다.',
    },
    {
      number: '04',
      title: '숫자 하나보다 조건을 함께 읽으세요',
      text: '슬라이더를 움직여 같은 조건에서 결과를 비교해 보세요. 민감도 순위는 현재 가정에 대한 계산 결과입니다. 실제 농장에 적용하려면 꽃 밀도와 벌통 강도, 지역의 개화·기상 자료가 필요합니다.',
    },
  ],
  takeaway: '건강한 벌통을 준비하고, 개화기와 채집벌의 활동 시기를 맞추는 것. 수분 계획은 여기서 시작됩니다.',
  footnote: '2022 HiMCM Problem A를 위한 설명용 모델. 아래 결과는 선택한 시나리오의 모의값이며 현장 예측으로 검증되지 않았습니다.',
  sources: ['comap2022', 'khoury2011', 'fao', 'osu'],
};

export const REPORT_CHECKLIST = [
  { title: '요구사항 1 · 개체군', text: '일별 상태·전환·초기조건과 계절 가정을 제시하고, 성충과 미성숙 개체를 구분합니다.' },
  { title: '요구사항 2 · 민감도', text: '출력지표와 변화 범위를 명시하고, 수명·산란·수정란 비율을 같은 기준으로 비교합니다.' },
  { title: '요구사항 3 · 수분', text: '20에이커에서 작물·개화기·꽃 밀도를 가정하고, 벌통 수 계산과 지역 경험값을 비교합니다.' },
  { title: '요구사항 4 · 전달', text: '비전문가용 1페이지 블로그와 출처를 포함합니다. 웹사이트는 25페이지 이내 PDF 보고서를 보완합니다.' },
];
