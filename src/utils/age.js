// 출생연도만으로 계산하는 근사 만 나이 (생일 정보가 없어 "현재 연도 - 출생연도"로 계산)
export function calcManAge(birthYear) {
  const y = Number(birthYear);
  if (!y) return null;
  const currentYear = new Date().getFullYear();
  const age = currentYear - y;
  return age > 0 && age < 130 ? age : null;
}

export const MIN_BIRTH_YEAR = 1900;
export const MAX_BIRTH_YEAR = new Date().getFullYear();
