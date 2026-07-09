import { QUESTIONS } from "../data/questions.js";
import { TYPE_INFO, CENTER_MAP, STRESS_MAP, GROWTH_MAP, TYPE_ORDER } from "../data/enneagramInfo.js";

// answers: { [questionId]: 1~5 }
export function computeResult(answers) {
  const scores = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  for (const q of QUESTIONS) {
    scores[q.type] += Number(answers[q.id] || 0);
  }

  // 원본 시트: MAX(D2:L2) 후 MATCH로 D~L(순서 2,3,4,5,6,7,8,9,1) 중 먼저 나오는 유형 채택
  const maxScore = Math.max(...TYPE_ORDER.map((t) => scores[t]));
  const type = TYPE_ORDER.find((t) => scores[t] === maxScore);

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

export function isComplete(answers) {
  return QUESTIONS.every((q) => answers[q.id] != null);
}

// 시트 기록 / 이메일 전송을 위해 유형 이름까지 붙여 직렬화 가능한 형태로 변환
export function describeResult(result) {
  return {
    type: result.type,
    typeName: TYPE_INFO[result.type].name,
    center: result.center,
    wing: result.wing,
    wingName: TYPE_INFO[result.wing].name,
    wingLabel: result.wingLabel,
    stress: result.stress,
    stressName: TYPE_INFO[result.stress].name,
    growth: result.growth,
    growthName: TYPE_INFO[result.growth].name,
    scores: result.scores,
  };
}

// 시트에서 조회한 기존 기록을 ResultScreen이 기대하는 형태로 복원
export function recordToResult(record) {
  return {
    scores: record.scores,
    type: Number(record.type),
    center: record.center,
    wing: Number(record.wing),
    wingLabel: record.wingLabel,
    stress: Number(record.stress),
    growth: Number(record.growth),
  };
}
