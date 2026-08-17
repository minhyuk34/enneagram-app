// Google Apps Script 웹앱(gas/Code.gs 배포본)과 통신하는 클라이언트.
// 프리플라이트(OPTIONS)를 피하기 위해 Content-Type을 지정하지 않고 문자열 body로 전송한다.
const WEBAPP_URL = import.meta.env.VITE_GAS_WEBAPP_URL || "";

export class GasApiError extends Error {
  constructor(code) {
    super(code || "GAS_ERROR");
    this.name = "GasApiError";
    this.code = code || "GAS_ERROR";
  }
}

export function isGasConfigured() {
  return Boolean(WEBAPP_URL);
}

async function callGas(payload) {
  if (!WEBAPP_URL) throw new GasApiError("GAS_NOT_CONFIGURED");

  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new GasApiError(`GAS_HTTP_${res.status}`);

  const json = await res.json();
  if (!json.ok) throw new GasApiError(json.error || "GAS_ERROR");
  return json;
}

export function listGroups() {
  return callGas({ action: "groups" });
}

export function participantLogin({ email, groupId, accessCode }) {
  return callGas({ action: "participantLogin", email, groupId, accessCode });
}

export function selectResultType(selectionToken, recordId, type) {
  return callGas({
    action: "selectResultType",
    selectionToken,
    recordId,
    type,
  });
}

// 과거 결과는 비밀번호가 바뀐 뒤에도 이메일 키로 다시 볼 수 있다.
export function lookupByEmail(email) {
  return callGas({ action: "lookup", email });
}

export function submitResult({
  name,
  age,
  birthYear,
  email,
  groupId,
  accessCode,
  result,
}) {
  return callGas({
    action: "submit",
    name,
    age,
    birthYear,
    email,
    groupId,
    accessCode,
    result,
  });
}

export function adminLogin(password) {
  return callGas({ action: "adminLogin", password });
}

export function getAdminDashboard(token) {
  return callGas({ action: "adminDashboard", token });
}

export function createAdminGroup(token, { name, accessCode }) {
  return callGas({ action: "adminCreateGroup", token, name, accessCode });
}

export function updateAdminGroup(token, groupId, changes) {
  return callGas({ action: "adminUpdateGroup", token, groupId, ...changes });
}

export function changeAdminPassword(token, newPassword) {
  return callGas({ action: "adminChangePassword", token, newPassword });
}

export function adminLogout(token) {
  return callGas({ action: "adminLogout", token });
}
