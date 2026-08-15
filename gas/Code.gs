// 에니어그램 검사 앱 백엔드 (Google Apps Script Web App)
//
// 최초 설정
// 1. 이 코드를 검사 기록용 Google Sheet의 Apps Script에 붙여넣는다.
// 2. Apps Script > 프로젝트 설정 > 스크립트 속성에
//    ADMIN_PASSWORD 키와 최초 관리자 비밀번호 값을 추가한다.
// 3. 웹 앱을 "나로 실행 / 모든 사용자"로 배포한다.
// 4. 최초 관리자 로그인 시 ADMIN_PASSWORD 평문 속성은 해시로 전환되고 삭제된다.
//
// 기존 "기록" 시트는 그대로 마이그레이션된다. 새 열은 기존 열 뒤에만 추가된다.

var RECORD_SHEET_NAME = "기록";
var GROUP_SHEET_NAME = "집단";
var MAX_RECORDS_PER_EMAIL = 5;
var ADMIN_SESSION_SECONDS = 21600; // 6시간

var ADMIN_PASSWORD_PROPERTY = "ADMIN_PASSWORD";
var ADMIN_PASSWORD_HASH_PROPERTY = "ADMIN_PASSWORD_HASH";
var ADMIN_PASSWORD_VERSION_PROPERTY = "ADMIN_PASSWORD_VERSION";
var PASSWORD_SALT_PROPERTY = "PASSWORD_SALT";

var RECORD_HEADER = [
  "타임스탬프", "이름", "만나이", "출생연도", "소속", "이메일",
  "유형", "유형명", "힘의중심",
  "날개유형", "날개유형명", "날개표기",
  "분열유형", "분열유형명",
  "통합유형", "통합유형명",
  "유형별점수(JSON)", "집단ID", "기록ID",
];

var GROUP_HEADER = [
  "집단ID", "집단명", "검사비밀번호해시", "활성", "생성일", "수정일",
];

function doGet() {
  return jsonOutput({
    ok: true,
    service: "enneagram-app",
    message: "API is running",
  });
}

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ ok: false, error: "invalid_json" });
  }

  try {
    if (data.action === "groups") return handleListGroups_();
    if (data.action === "participantLogin") return handleParticipantLogin_(data);
    if (data.action === "lookup") return handleLookup_(data); // 이전 앱 호환
    if (data.action === "submit") return handleSubmit_(data);
    if (data.action === "adminLogin") return handleAdminLogin_(data);
    if (data.action === "adminDashboard") return handleAdminDashboard_(data);
    if (data.action === "adminCreateGroup") return handleAdminCreateGroup_(data);
    if (data.action === "adminUpdateGroup") return handleAdminUpdateGroup_(data);
    if (data.action === "adminChangePassword") return handleAdminChangePassword_(data);
    if (data.action === "adminLogout") return handleAdminLogout_(data);
    return jsonOutput({ ok: false, error: "unknown_action" });
  } catch (err) {
    Logger.log(err && err.stack ? err.stack : String(err));
    return jsonOutput({ ok: false, error: String(err.message || err) });
  }
}

function getOrCreateSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getMaxColumns() < header.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  sheet.setFrozenRows(1);
  return sheet;
}

function getRecordSheet_() {
  return getOrCreateSheet_(RECORD_SHEET_NAME, RECORD_HEADER);
}

function getGroupSheet_() {
  return getOrCreateSheet_(GROUP_SHEET_NAME, GROUP_HEADER);
}

function handleListGroups_() {
  // 종료된 집단도 과거 결과 조회를 위해 표시하되, 새 검사는 서버에서 차단한다.
  var groups = listGroups_(true).map(publicGroup_);
  return jsonOutput({ ok: true, groups: groups });
}

function handleParticipantLogin_(data) {
  var email = normalizeEmail_(data.email);
  if (!email) return jsonOutput({ ok: false, error: "email_required" });

  var records = listRecordsByEmail_(email);
  var access = verifyGroupAccess_(data.groupId, data.accessCode);

  return jsonOutput({
    ok: true,
    records: records,
    canTest: access.ok,
    accessError: access.ok ? null : access.error,
    group: access.ok ? publicGroup_(access.group) : null,
    maxRecords: MAX_RECORDS_PER_EMAIL,
  });
}

// 이전 버전과 기존 결과 조회 호환을 유지한다.
function handleLookup_(data) {
  var email = normalizeEmail_(data.email);
  if (!email) return jsonOutput({ ok: false, error: "email_required" });
  return jsonOutput({
    ok: true,
    records: listRecordsByEmail_(email),
    maxRecords: MAX_RECORDS_PER_EMAIL,
  });
}

function handleSubmit_(data) {
  var name = cleanText_(data.name);
  var email = normalizeEmail_(data.email);
  var age = data.age;
  var birthYear = data.birthYear;
  var result = data.result || {};
  var access = verifyGroupAccess_(data.groupId, data.accessCode);

  if (!access.ok) return jsonOutput({ ok: false, error: access.error });
  if (!name || !email || !result.type) {
    return jsonOutput({ ok: false, error: "missing_fields" });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 검사 도중 비밀번호가 바뀌었을 수 있으므로 저장 직전에 다시 확인한다.
    access = verifyGroupAccess_(data.groupId, data.accessCode);
    if (!access.ok) return jsonOutput({ ok: false, error: access.error });

    var sheet = getRecordSheet_();
    var recordId = "rec_" + Utilities.getUuid().replace(/-/g, "");
    sheet.appendRow([
      new Date(),
      name, age, birthYear, access.group.name, email,
      result.type, result.typeName, result.center,
      result.wing, result.wingName, result.wingLabel,
      result.stress, result.stressName,
      result.growth, result.growthName,
      JSON.stringify(result.scores || {}), access.group.id, recordId,
    ]);

    try {
      sendResultEmail_(name, email, access.group.name, result);
    } catch (mailError) {
      Logger.log("email send failed: " + mailError);
    }

    var remaining = enforceMaxRecords_(sheet, email, MAX_RECORDS_PER_EMAIL);
    return jsonOutput({
      ok: true,
      recordCount: remaining,
      maxRecords: MAX_RECORDS_PER_EMAIL,
      recordId: recordId,
    });
  } finally {
    lock.releaseLock();
  }
}

function handleAdminLogin_(data) {
  var configuredHash = getAdminPasswordHash_();
  if (!configuredHash) {
    return jsonOutput({ ok: false, error: "admin_not_configured" });
  }

  var password = String(data.password || "");
  if (!password || !secureEquals_(hashSecret_(password), configuredHash)) {
    return jsonOutput({ ok: false, error: "invalid_admin_password" });
  }

  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  var version = getAdminPasswordVersion_();
  CacheService.getScriptCache().put(
    "admin_session_" + token,
    JSON.stringify({ version: version, issuedAt: new Date().toISOString() }),
    ADMIN_SESSION_SECONDS
  );

  return jsonOutput({
    ok: true,
    token: token,
    expiresIn: ADMIN_SESSION_SECONDS,
  });
}

function handleAdminDashboard_(data) {
  requireAdmin_(data.token);
  return jsonOutput({
    ok: true,
    groups: listGroups_(true).map(adminGroup_),
    records: listAllRecords_(),
    maxRecords: MAX_RECORDS_PER_EMAIL,
  });
}

function handleAdminCreateGroup_(data) {
  requireAdmin_(data.token);
  var name = cleanText_(data.name);
  var accessCode = String(data.accessCode || "");
  if (!name) return jsonOutput({ ok: false, error: "group_name_required" });
  if (accessCode.length < 4) {
    return jsonOutput({ ok: false, error: "access_code_too_short" });
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var groups = listGroups_(true);
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].name.toLowerCase() === name.toLowerCase()) {
        return jsonOutput({ ok: false, error: "group_name_exists" });
      }
    }

    var id = "grp_" + Utilities.getUuid().replace(/-/g, "").slice(0, 16);
    var now = new Date();
    getGroupSheet_().appendRow([id, name, hashSecret_(accessCode), true, now, now]);
    return jsonOutput({
      ok: true,
      group: { id: id, name: name, active: true, createdAt: now, updatedAt: now },
    });
  } finally {
    lock.releaseLock();
  }
}

function handleAdminUpdateGroup_(data) {
  requireAdmin_(data.token);
  var groupId = cleanText_(data.groupId);
  if (!groupId) return jsonOutput({ ok: false, error: "group_required" });

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var group = findGroupById_(groupId, true);
    if (!group) return jsonOutput({ ok: false, error: "group_not_found" });

    var sheet = getGroupSheet_();
    var row = group.rowNumber;
    if (data.name != null) {
      var name = cleanText_(data.name);
      if (!name) return jsonOutput({ ok: false, error: "group_name_required" });
      var groups = listGroups_(true);
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].id !== groupId && groups[i].name.toLowerCase() === name.toLowerCase()) {
          return jsonOutput({ ok: false, error: "group_name_exists" });
        }
      }
      sheet.getRange(row, 2).setValue(name);
    }

    if (data.accessCode != null && String(data.accessCode) !== "") {
      var accessCode = String(data.accessCode);
      if (accessCode.length < 4) {
        return jsonOutput({ ok: false, error: "access_code_too_short" });
      }
      sheet.getRange(row, 3).setValue(hashSecret_(accessCode));
    }

    if (Object.prototype.hasOwnProperty.call(data, "active")) {
      sheet.getRange(row, 4).setValue(Boolean(data.active));
    }
    sheet.getRange(row, 6).setValue(new Date());

    return jsonOutput({ ok: true, group: adminGroup_(findGroupById_(groupId, true)) });
  } finally {
    lock.releaseLock();
  }
}

function handleAdminChangePassword_(data) {
  requireAdmin_(data.token);
  var newPassword = String(data.newPassword || "");
  if (newPassword.length < 8) {
    return jsonOutput({ ok: false, error: "admin_password_too_short" });
  }
  var props = PropertiesService.getScriptProperties();
  props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY, hashSecret_(newPassword));
  props.setProperty(ADMIN_PASSWORD_VERSION_PROPERTY, String(new Date().getTime()));
  props.deleteProperty(ADMIN_PASSWORD_PROPERTY);
  return jsonOutput({ ok: true });
}

function handleAdminLogout_(data) {
  if (data.token) {
    CacheService.getScriptCache().remove("admin_session_" + String(data.token));
  }
  return jsonOutput({ ok: true });
}

function requireAdmin_(token) {
  var cleanToken = String(token || "");
  if (!cleanToken) throw new Error("admin_auth_required");
  var raw = CacheService.getScriptCache().get("admin_session_" + cleanToken);
  if (!raw) throw new Error("admin_session_expired");
  var session = JSON.parse(raw);
  if (String(session.version) !== String(getAdminPasswordVersion_())) {
    CacheService.getScriptCache().remove("admin_session_" + cleanToken);
    throw new Error("admin_session_expired");
  }
}

function getAdminPasswordHash_() {
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty(ADMIN_PASSWORD_HASH_PROPERTY);
  if (hash) return hash;

  // 최초 설정 편의를 위해 평문 속성을 한 번만 읽고 즉시 해시로 교체한다.
  var bootstrapPassword = props.getProperty(ADMIN_PASSWORD_PROPERTY);
  if (!bootstrapPassword) return "";
  hash = hashSecret_(bootstrapPassword);
  props.setProperty(ADMIN_PASSWORD_HASH_PROPERTY, hash);
  props.setProperty(ADMIN_PASSWORD_VERSION_PROPERTY, String(new Date().getTime()));
  props.deleteProperty(ADMIN_PASSWORD_PROPERTY);
  return hash;
}

function getAdminPasswordVersion_() {
  return PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_VERSION_PROPERTY) || "1";
}

function listGroups_(includeInactive) {
  var sheet = getGroupSheet_();
  var values = sheet.getDataRange().getValues();
  var groups = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[0]) continue;
    var group = {
      id: String(row[0]),
      name: String(row[1]),
      accessCodeHash: String(row[2]),
      active: toBoolean_(row[3]),
      createdAt: row[4],
      updatedAt: row[5],
      rowNumber: i + 1,
    };
    if (includeInactive || group.active) groups.push(group);
  }
  groups.sort(function (a, b) {
    return a.name.localeCompare(b.name, "ko");
  });
  return groups;
}

function findGroupById_(groupId, includeInactive) {
  var groups = listGroups_(Boolean(includeInactive));
  var id = String(groupId || "");
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].id === id) return groups[i];
  }
  return null;
}

function verifyGroupAccess_(groupId, accessCode) {
  var group = findGroupById_(groupId, false);
  if (!group) return { ok: false, error: "group_not_found" };
  var code = String(accessCode || "");
  if (!code || !secureEquals_(hashSecret_(code), group.accessCodeHash)) {
    return { ok: false, error: "invalid_access_code" };
  }
  return { ok: true, group: group };
}

function publicGroup_(group) {
  return {
    id: group.id,
    name: group.name,
    active: group.active,
  };
}

function adminGroup_(group) {
  return {
    id: group.id,
    name: group.name,
    active: group.active,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function listRecordsByEmail_(email) {
  var records = listAllRecords_();
  var target = normalizeEmail_(email);
  return records.filter(function (record) {
    return normalizeEmail_(record.email) === target;
  });
}

function listAllRecords_() {
  var sheet = getRecordSheet_();
  var values = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0] && !values[i][5]) continue;
    records.push(rowToRecord_(values[i], i + 1));
  }
  records.sort(function (a, b) {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  return records;
}

function rowToRecord_(row, rowNumber) {
  return {
    timestamp: row[0],
    name: row[1],
    age: row[2],
    birthYear: row[3],
    affiliation: row[4],
    email: row[5],
    type: row[6],
    typeName: row[7],
    center: row[8],
    wing: row[9],
    wingName: row[10],
    wingLabel: row[11],
    stress: row[12],
    stressName: row[13],
    growth: row[14],
    growthName: row[15],
    scores: safeJsonParse_(row[16], {}),
    groupId: row[17] || "",
    recordId: row[18] || "legacy_row_" + rowNumber,
  };
}

function enforceMaxRecords_(sheet, email, maxCount) {
  var emailLower = normalizeEmail_(email);
  var values = sheet.getDataRange().getValues();
  var matchingRows = [];
  for (var i = 1; i < values.length; i++) {
    if (normalizeEmail_(values[i][5]) === emailLower) matchingRows.push(i + 1);
  }
  while (matchingRows.length > maxCount) {
    var oldestRow = matchingRows.shift();
    sheet.deleteRow(oldestRow);
    for (var j = 0; j < matchingRows.length; j++) {
      if (matchingRows[j] > oldestRow) matchingRows[j] -= 1;
    }
  }
  return matchingRows.length;
}

function sendResultEmail_(name, email, groupName, result) {
  var subject = "[에니어그램 검사 결과] " + name + "님 - " + result.type + "번 유형 (" + result.typeName + ")";
  var body =
    name + "님의 에니어그램 검사 결과입니다.\n\n" +
    "소속: " + groupName + "\n" +
    "유형: " + result.type + "번 - " + result.typeName + "\n" +
    "힘의 중심: " + result.center + "\n" +
    "날개: " + result.wingLabel + " (" + result.wingName + ")\n" +
    "분열(스트레스) 방향: " + result.stress + "번 - " + result.stressName + "\n" +
    "통합(성장) 방향: " + result.growth + "번 - " + result.growthName + "\n";
  MailApp.sendEmail(email, subject, body);
}

function hashSecret_(value) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty(PASSWORD_SALT_PROPERTY);
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(PASSWORD_SALT_PROPERTY, salt);
  }
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + "|" + String(value),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (byte) {
    var normalized = (byte + 256) % 256;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function secureEquals_(a, b) {
  var left = String(a || "");
  var right = String(b || "");
  if (left.length !== right.length) return false;
  var mismatch = 0;
  for (var i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText_(value) {
  return String(value || "").trim();
}

function toBoolean_(value) {
  if (value === true || value === 1) return true;
  return String(value).toLowerCase() === "true";
}

function safeJsonParse_(value, fallback) {
  try {
    return JSON.parse(value || "{}");
  } catch (err) {
    return fallback;
  }
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
