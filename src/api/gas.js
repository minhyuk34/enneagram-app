// Google Apps Script 웹앱(gas/Code.gs 배포본)과 통신하는 얇은 클라이언트.
// 프리플라이트(OPTIONS)를 피하기 위해 Content-Type을 지정하지 않고 문자열 body로 전송한다.
const WEBAPP_URL = import.meta.env.VITE_GAS_WEBAPP_URL || "";

export function isGasConfigured() {
  return Boolean(WEBAPP_URL);
}

async function callGas(payload) {
  if (!WEBAPP_URL) {
    throw new Error("GAS_NOT_CONFIGURED");
  }
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`GAS_HTTP_${res.status}`);
  }
  const json = await res.json();
  if (!json.ok) {
    throw new Error(json.error || "GAS_ERROR");
  }
  return json;
}

// { records: [...] } (오래된 순), 기록이 없으면 records: []
export async function lookupByEmail(email) {
  return callGas({ action: "lookup", email });
}

export async function submitResult({ name, age, birthYear, affiliation, email, result }) {
  return callGas({ action: "submit", name, age, birthYear, affiliation, email, result });
}
