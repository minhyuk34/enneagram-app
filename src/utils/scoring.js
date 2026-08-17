import { QUESTIONS } from "../data/questions.js";
import { TYPE_INFO, CENTER_MAP, STRESS_MAP, GROWTH_MAP, TYPE_ORDER } from "../data/enneagramInfo.js";
import {
  INTEGRATION_DISINTEGRATION_INTRO,
  GROWTH_TABLE,
  CENTER_DETAILS,
  TYPE_LONG_DESC,
  STRENGTHS_WEAKNESSES,
  WING_INTRO,
  WING_DETAILS,
} from "../data/enneagramDetails.js";

export function getTopTypes(scores) {
  const maxScore = Math.max(...TYPE_ORDER.map((t) => Number(scores[t]) || 0));
  return TYPE_ORDER.filter((t) => (Number(scores[t]) || 0) === maxScore);
}

export function deriveResultForType(scores, requestedType) {
  const type = Number(requestedType);
  if (!TYPE_INFO[type]) throw new Error("invalid_result_type");

  const center = CENTER_MAP[type];

  // 날개: 원형(1~9~1)에서 좌우 이웃 중 점수가 더 높은 쪽. 동점이면 낮은 번호(왼쪽 이웃) 우선
  const left = type === 1 ? 9 : type - 1;
  const right = type === 9 ? 1 : type + 1;
  const wing = scores[left] >= scores[right] ? left : right;
  const wingLabel = `${type}w${wing}`;

  const stress = STRESS_MAP[type];
  const growth = GROWTH_MAP[type];

  return { scores, type, center, wing, wingLabel, stress, growth };
}

// answers: { [questionId]: 1~5 }
export function computeResult(answers) {
  const scores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const q of QUESTIONS) {
    scores[q.type] += Number(answers[q.id] || 0);
  }

  // 공동 1위는 모두 보존한다. 세부 설명의 임시 기준은 기존 시트 순서에서 첫 유형이다.
  const topTypes = getTopTypes(scores);
  const result = deriveResultForType(scores, topTypes[0]);
  return {
    ...result,
    topTypes,
    selectedType: topTypes.length === 1 ? topTypes[0] : null,
  };
}

export function isComplete(answers) {
  return QUESTIONS.every((q) => answers[q.id] != null);
}

// 시트 기록 / 이메일 전송을 위해 유형 이름까지 붙여 직렬화 가능한 형태로 변환
export function describeResult(result) {
  const type = Number(result.type);
  const topTypes = Array.isArray(result.topTypes) && result.topTypes.length
    ? result.topTypes.map(Number)
    : getTopTypes(result.scores || {});
  return {
    type,
    typeName: TYPE_INFO[type].name,
    center: result.center,
    wing: result.wing,
    wingName: TYPE_INFO[result.wing].name,
    wingLabel: result.wingLabel,
    stress: result.stress,
    stressName: TYPE_INFO[result.stress].name,
    growth: result.growth,
    growthName: TYPE_INFO[result.growth].name,
    scores: result.scores,
    topTypes,
    selectedType: result.selectedType == null ? null : Number(result.selectedType),
    guide: {
      integrationIntro: INTEGRATION_DISINTEGRATION_INTRO,
      growthTable: GROWTH_TABLE,
      centers: CENTER_DETAILS,
      typeDescriptions: TYPE_LONG_DESC,
      strengthsWeaknessesTable: STRENGTHS_WEAKNESSES,
      wingIntro: WING_INTRO,
      wingDetails: WING_DETAILS,
    },
  };
}

// 시트에서 조회한 기존 기록을 ResultScreen이 기대하는 형태로 복원
export function recordToResult(record) {
  const topTypes = Array.isArray(record.topTypes) && record.topTypes.length
    ? record.topTypes.map(Number)
    : getTopTypes(record.scores || {});
  return {
    scores: record.scores,
    type: Number(record.type),
    center: record.center,
    wing: Number(record.wing),
    wingLabel: record.wingLabel,
    stress: Number(record.stress),
    growth: Number(record.growth),
    topTypes,
    selectedType: record.selectedType == null || record.selectedType === ""
      ? null
      : Number(record.selectedType),
  };
}
