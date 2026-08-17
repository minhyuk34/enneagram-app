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

var ENNEAGRAM_TYPE_NAMES = {
  1: "개혁가", 2: "조력가", 3: "성취자", 4: "개인주의자", 5: "탐구자",
  6: "충성가", 7: "열정가", 8: "도전자", 9: "평화주의자",
};

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
  var chartBlob = null;
  try {
    chartBlob = buildScoreChart_(result);
  } catch (chartError) {
    Logger.log("score chart generation failed: " + chartError);
  }

  var message = {
    to: email,
    subject: subject,
    body: buildResultEmailText_(name, groupName, result),
    htmlBody: buildResultEmailHtml_(name, groupName, result, Boolean(chartBlob)),
    name: "에니어그램 검사",
  };
  if (chartBlob) {
    message.inlineImages = { scoreChart: chartBlob };
  }
  MailApp.sendEmail(message);
}

function buildScoreChart_(result) {
  var scores = result.scores || {};
  var selectedType = Number(result.type);
  var data = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, "유형")
    .addColumn(Charts.ColumnType.NUMBER, "점수")
    .addColumn(Charts.ColumnType.NUMBER, "최종 유형");

  for (var type = 1; type <= 9; type++) {
    var score = Number(scores[type] || 0);
    data.addRow([type + "번", score, type === selectedType ? score : null]);
  }

  var chart = Charts.newLineChart()
    .setDataTable(data.build())
    .setDimensions(720, 420)
    .setTitle("유형별 점수")
    .setXAxisTitle("에니어그램 유형")
    .setYAxisTitle("점수")
    .setRange(0, 45)
    .setColors(["#171310", "#8f1f26"])
    .setOption("legend.position", "none")
    .setOption("backgroundColor", "#fffaf2")
    .setOption("chartArea", { left: 58, top: 58, width: "80%", height: "66%" })
    .setOption("hAxis.textStyle", { color: "#615751", fontSize: 11 })
    .setOption("vAxis.textStyle", { color: "#615751", fontSize: 11 })
    .setOption("vAxis.gridlines", { color: "#ded3c6" })
    .setOption("series", {
      0: { color: "#171310", lineWidth: 2, pointSize: 5 },
      1: { color: "#8f1f26", lineWidth: 0, pointSize: 10 },
    })
    .build();

  return chart.getAs("image/png").setName("enneagram-score-chart.png");
}

function buildResultEmailHtml_(name, groupName, result, hasChart) {
  var guide = result.guide || {};
  var selectedType = Number(result.type);
  var growthTable = guide.growthTable || {};
  var centers = Array.isArray(guide.centers) ? guide.centers : [];
  var typeDescriptions = guide.typeDescriptions || {};
  var strengthsWeaknessesTable = guide.strengthsWeaknessesTable || {};
  var wingDetails = guide.wingDetails || {};
  var integrationIntro = Array.isArray(guide.integrationIntro) ? guide.integrationIntro : [];
  var wingIntro = Array.isArray(guide.wingIntro) ? guide.wingIntro : [];
  var html = "";

  // 한동안 이전 프런트엔드에서 전송한 단일 선택 데이터도 지원한다.
  if (guide.growth && !growthTable[selectedType]) growthTable[selectedType] = guide.growth;
  if (guide.center && centers.length === 0) centers = [guide.center];
  if (guide.typeDescription && !typeDescriptions[selectedType]) typeDescriptions[selectedType] = guide.typeDescription;
  if (guide.strengthsWeaknesses && !strengthsWeaknessesTable[selectedType]) strengthsWeaknessesTable[selectedType] = guide.strengthsWeaknesses;
  if (Array.isArray(guide.wings) && !wingDetails[selectedType]) wingDetails[selectedType] = guide.wings;

  html += '<div style="margin:0;padding:24px 8px;background:#f6f0e7;color:#171310;font-family:Pretendard,Apple SD Gothic Neo,Noto Sans KR,Malgun Gothic,Arial,sans-serif;">';
  html += '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:1180px;margin:0 auto;border-collapse:collapse;background:#fffaf2;border:1px solid #b4a9a1;">';
  html += '<tr><td style="padding:30px 28px;background:#8f1f26;color:#fffaf2;">';
  html += '<div style="font-size:11px;font-weight:700;letter-spacing:2px;">ENNEAGRAM PERSONALITY PROFILE</div>';
  html += '<h1 style="margin:12px 0 8px;font-size:30px;line-height:1.35;color:#fffaf2;">' + escapeHtml_(name) + '님의 검사 결과</h1>';
  html += '<div style="font-size:17px;line-height:1.6;">' + escapeHtml_(result.type) + '번 유형 · ' + escapeHtml_(result.typeName) + '</div>';
  html += '</td></tr>';
  html += '<tr><td style="padding:28px;">';

  html += emailSectionTitle_("RESULT SUMMARY", "핵심 결과");
  html += emailKeyValueTable_([
    ["소속", groupName],
    ["최종 유형", result.type + "번 · " + result.typeName],
    ["힘의 중심", result.center],
    ["날개", result.wingLabel + " · " + result.wingName],
    ["분열(스트레스) 방향", result.stress + "번 · " + result.stressName],
    ["통합(성장) 방향", result.growth + "번 · " + result.growthName],
  ]);

  html += emailSectionTitle_("SCORE PROFILE", "유형별 점수");
  if (hasChart) {
    html += '<img src="cid:scoreChart" alt="1번부터 9번까지의 유형별 점수 그래프" width="720" style="display:block;width:100%;max-width:720px;height:auto;margin:0 0 14px;border:0;">';
  }
  html += buildScoreTableHtml_(result);

  if (Object.keys(growthTable).length || integrationIntro.length) {
    html += emailSectionTitle_("INTEGRATION & DISINTEGRATION", "분열과 통합");
    html += emailParagraphs_(integrationIntro);
    html += buildGrowthGuideTableHtml_(growthTable, selectedType);
  }

  if (centers.length) {
    html += emailSectionTitle_("CENTER OF INTELLIGENCE", "에니어그램 힘의 중심");
    html += buildCentersGuideTableHtml_(centers, selectedType);
  }

  if (Object.keys(typeDescriptions).length) {
    html += emailSectionTitle_("TYPE DESCRIPTION", "9가지 성격유형별 설명");
    html += buildTypeDescriptionsTableHtml_(typeDescriptions, growthTable, selectedType);
  }

  if (Object.keys(strengthsWeaknessesTable).length) {
    html += emailSectionTitle_("STRENGTHS & WEAKNESSES", "성격유형별 강점과 약점");
    html += buildStrengthsWeaknessesTableHtml_(strengthsWeaknessesTable, growthTable, selectedType);
  }

  if (Object.keys(wingDetails).length || wingIntro.length) {
    html += emailSectionTitle_("WING", "에니어그램의 날개");
    html += emailParagraphs_(wingIntro);
    html += buildWingsGuideTableHtml_(wingDetails, growthTable, selectedType, result.wingLabel);
  }

  html += '<p style="margin:34px 0 0;padding-top:18px;border-top:1px solid #d5cbc3;color:#776b63;font-size:11px;line-height:1.7;">이 결과는 자기이해와 성장을 위한 참고 자료입니다. 현재의 상황과 경험에 따라 표현 방식은 달라질 수 있습니다.</p>';
  html += '</td></tr></table></div>';
  return html;
}

function buildResultEmailText_(name, groupName, result) {
  var guide = result.guide || {};
  var selectedType = Number(result.type);
  var growthTable = guide.growthTable || {};
  var centers = Array.isArray(guide.centers) ? guide.centers : [];
  var typeDescriptions = guide.typeDescriptions || {};
  var strengthsWeaknessesTable = guide.strengthsWeaknessesTable || {};
  var wingDetails = guide.wingDetails || {};
  var lines = [
    name + "님의 에니어그램 검사 결과입니다.",
    "",
    "소속: " + groupName,
    "유형: " + result.type + "번 - " + result.typeName,
    "힘의 중심: " + result.center,
    "날개: " + result.wingLabel + " (" + result.wingName + ")",
    "분열(스트레스) 방향: " + result.stress + "번 - " + result.stressName,
    "통합(성장) 방향: " + result.growth + "번 - " + result.growthName,
    "",
    "[유형별 점수]",
  ];
  for (var type = 1; type <= 9; type++) {
    lines.push(type + "번 " + ENNEAGRAM_TYPE_NAMES[type] + ": " + Number((result.scores || {})[type] || 0) + "점");
  }
  if (Array.isArray(guide.integrationIntro)) {
    lines.push("", "[분열과 통합 안내]");
    lines = lines.concat(guide.integrationIntro);
  }
  for (var growthType = 1; growthType <= 9; growthType++) {
    var growth = growthTable[growthType];
    if (!growth) continue;
    lines.push("", "[분열과 통합 · " + growthType + "번 " + growth.name + (growthType === selectedType ? " · 나의 최종 유형" : "") + "]", "심리적 기능: " + growth.psychFunction, "회피: " + growth.avoidance, "함정: " + growth.trap, "약점(분열): " + growth.weakness, "강점(통합): " + growth.strength, "성장 전략: " + joinListText_(growth.strategies), "좌우명: " + growth.motto);
  }
  for (var centerIndex = 0; centerIndex < centers.length; centerIndex++) {
    var center = centers[centerIndex];
    var isSelectedCenter = (center.types || []).indexOf(selectedType) !== -1;
    lines.push("", "[힘의 중심 · " + center.key + (isSelectedCenter ? " · 나의 힘의 중심" : "") + "]", center.desc, "감정: " + center.emotion, "관심: " + center.interest, "상황 파악: " + center.situationAwareness, "의사 결정: " + center.decision, "판단 양식: " + center.judgment, "신체 발달: " + center.bodyDevelopment, "지능: " + center.intelligence);
  }
  for (var descriptionType = 1; descriptionType <= 9; descriptionType++) {
    var description = typeDescriptions[descriptionType];
    if (!description) continue;
    lines.push("", "[" + descriptionType + "번 유형 설명" + (descriptionType === selectedType ? " · 나의 최종 유형" : "") + "]", description.tagline, description.body, "주의할 점: " + description.caution);
  }
  for (var swType = 1; swType <= 9; swType++) {
    var strengthsWeaknesses = strengthsWeaknessesTable[swType];
    if (!strengthsWeaknesses) continue;
    lines.push("", "[" + swType + "번 강점과 약점" + (swType === selectedType ? " · 나의 최종 유형" : "") + "]", "힘의 중심: " + strengthsWeaknesses.center, "강점: " + joinListText_(strengthsWeaknesses.strengths), "약점: " + joinListText_(strengthsWeaknesses.weaknesses));
  }
  if (Array.isArray(guide.wingIntro)) {
    lines.push("", "[날개 안내]");
    lines = lines.concat(guide.wingIntro);
  }
  for (var wingType = 1; wingType <= 9; wingType++) {
    var wings = wingDetails[wingType] || [];
    for (var wingIndex = 0; wingIndex < wings.length; wingIndex++) {
      lines.push("", "[" + wings[wingIndex].code + " · " + wings[wingIndex].nickname + (wings[wingIndex].code === result.wingLabel ? " · 나의 날개" : "") + "]", joinListText_(wings[wingIndex].points));
    }
  }
  return lines.join("\n");
}

function buildScoreTableHtml_(result) {
  var scores = result.scores || {};
  var selectedType = Number(result.type);
  var html = '<table role="presentation" width="100%" border="1" bordercolor="#d5cbc3" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">';
  html += '<tr>' + emailTableHeaderCell_("유형", "34%", false) + emailTableHeaderCell_("이름", "46%", false) + emailTableHeaderCell_("점수", "20%", false, "text-align:right;") + '</tr>';
  for (var type = 1; type <= 9; type++) {
    var highlighted = type === selectedType;
    var typeLabel = '<strong>' + type + '번</strong>' + (highlighted ? '<span style="display:inline-block;margin-left:7px;padding:2px 7px;background:#8f1f26;color:#ffffff;font-size:9px;font-weight:700;">최종 유형</span>' : "");
    html += '<tr>';
    html += emailTableCell_(typeLabel, highlighted, true, "34%", "font-weight:700;");
    html += emailTableCell_(escapeHtml_(ENNEAGRAM_TYPE_NAMES[type]), highlighted, false, "46%", "");
    html += emailTableCell_(Number(scores[type] || 0) + "점", highlighted, false, "20%", "text-align:right;font-weight:700;");
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function buildGrowthGuideTableHtml_(growthTable, selectedType) {
  var html = '<table role="presentation" width="100%" border="1" bordercolor="#d5cbc3" cellspacing="0" cellpadding="0" style="width:100%;min-width:1080px;border-collapse:collapse;table-layout:fixed;">';
  html += '<tr>';
  html += emailTableHeaderCell_("유형", "115", false);
  html += emailTableHeaderCell_("심리적 기능", "155", false);
  html += emailTableHeaderCell_("회피", "65", false);
  html += emailTableHeaderCell_("함정", "65", false);
  html += emailTableHeaderCell_("약점(분열)", "95", false);
  html += emailTableHeaderCell_("강점(통합)", "95", false);
  html += emailTableHeaderCell_("성장 전략", "250", false);
  html += emailTableHeaderCell_("좌우명", "240", false);
  html += '</tr>';
  for (var type = 1; type <= 9; type++) {
    var growth = growthTable[type];
    if (!growth) continue;
    var highlighted = type === selectedType;
    var typeHtml = '<strong>' + type + '번 · ' + escapeHtml_(growth.name) + '</strong>';
    if (highlighted) typeHtml += '<div style="margin-top:6px;color:#8f1f26;font-size:9px;font-weight:700;">나의 최종 유형</div>';
    html += '<tr>';
    html += emailTableCell_(typeHtml, highlighted, true, "115", "");
    html += emailTableCell_(escapeHtml_(growth.psychFunction), highlighted, false, "155", "");
    html += emailTableCell_(escapeHtml_(growth.avoidance), highlighted, false, "65", "");
    html += emailTableCell_(escapeHtml_(growth.trap), highlighted, false, "65", "");
    html += emailTableCell_(escapeHtml_(growth.weakness), highlighted, false, "95", "");
    html += emailTableCell_(escapeHtml_(growth.strength), highlighted, false, "95", "");
    html += emailTableCell_(emailInlineListHtml_(growth.strategies), highlighted, false, "250", "");
    html += emailTableCell_(escapeHtml_(growth.motto), highlighted, false, "240", "");
    html += '</tr>';
  }
  return emailWideTableWrap_(html + '</table>');
}

function buildCentersGuideTableHtml_(centers, selectedType) {
  var rows = [
    ["설명", "desc"], ["감정", "emotion"], ["관심", "interest"],
    ["상황 파악", "situationAwareness"], ["의사 결정", "decision"],
    ["판단 양식", "judgment"], ["신체 발달", "bodyDevelopment"], ["지능", "intelligence"],
  ];
  var html = '<table role="presentation" width="100%" border="1" bordercolor="#d5cbc3" cellspacing="0" cellpadding="0" style="width:100%;min-width:980px;border-collapse:collapse;table-layout:fixed;">';
  html += '<tr>' + emailTableHeaderCell_("구분", "100", false);
  for (var centerIndex = 0; centerIndex < centers.length; centerIndex++) {
    var center = centers[centerIndex];
    var selectedCenter = (center.types || []).indexOf(selectedType) !== -1;
    var centerLabel = center.key + " (" + (center.types || []).join(", ") + "유형)" + (selectedCenter ? " · 나의 중심" : "");
    html += emailTableHeaderCell_(centerLabel, "293", selectedCenter);
  }
  html += '</tr>';
  for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    html += '<tr>' + emailTableCell_('<strong>' + escapeHtml_(rows[rowIndex][0]) + '</strong>', false, true, "100", "background:#f6f0e7;");
    for (var columnIndex = 0; columnIndex < centers.length; columnIndex++) {
      var selectedColumn = (centers[columnIndex].types || []).indexOf(selectedType) !== -1;
      html += emailTableCell_(escapeHtml_(centers[columnIndex][rows[rowIndex][1]]), selectedColumn, false, "293", "");
    }
    html += '</tr>';
  }
  return emailWideTableWrap_(html + '</table>');
}

function buildTypeDescriptionsTableHtml_(typeDescriptions, growthTable, selectedType) {
  var html = '<table role="presentation" width="100%" border="1" bordercolor="#d5cbc3" cellspacing="0" cellpadding="0" style="width:100%;min-width:980px;border-collapse:collapse;table-layout:fixed;">';
  html += '<tr>' + emailTableHeaderCell_("유형", "130", false) + emailTableHeaderCell_("특징", "220", false) + emailTableHeaderCell_("상세 설명", "430", false) + emailTableHeaderCell_("주의할 점", "200", false) + '</tr>';
  for (var type = 1; type <= 9; type++) {
    var description = typeDescriptions[type];
    if (!description) continue;
    var highlighted = type === selectedType;
    var typeName = growthTable[type] ? growthTable[type].name : ENNEAGRAM_TYPE_NAMES[type];
    var typeHtml = '<strong>' + type + '번 · ' + escapeHtml_(typeName) + '</strong>';
    if (highlighted) typeHtml += '<div style="margin-top:6px;color:#8f1f26;font-size:9px;font-weight:700;">나의 최종 유형</div>';
    html += '<tr>';
    html += emailTableCell_(typeHtml, highlighted, true, "130", "");
    html += emailTableCell_('<strong>' + escapeHtml_(description.tagline) + '</strong>', highlighted, false, "220", "");
    html += emailTableCell_(escapeHtml_(description.body), highlighted, false, "430", "");
    html += emailTableCell_(escapeHtml_(description.caution), highlighted, false, "200", "color:#641116;");
    html += '</tr>';
  }
  return emailWideTableWrap_(html + '</table>');
}

function buildStrengthsWeaknessesTableHtml_(table, growthTable, selectedType) {
  var html = '<table role="presentation" width="100%" border="1" bordercolor="#d5cbc3" cellspacing="0" cellpadding="0" style="width:100%;min-width:900px;border-collapse:collapse;table-layout:fixed;">';
  html += '<tr>' + emailTableHeaderCell_("힘의 중심", "110", false) + emailTableHeaderCell_("유형", "150", false) + emailTableHeaderCell_("강점", "320", false) + emailTableHeaderCell_("약점", "320", false) + '</tr>';
  for (var type = 1; type <= 9; type++) {
    var item = table[type];
    if (!item) continue;
    var highlighted = type === selectedType;
    var typeName = growthTable[type] ? growthTable[type].name : ENNEAGRAM_TYPE_NAMES[type];
    var typeHtml = '<strong>' + type + '번 · ' + escapeHtml_(typeName) + '</strong>';
    if (highlighted) typeHtml += '<div style="margin-top:6px;color:#8f1f26;font-size:9px;font-weight:700;">나의 최종 유형</div>';
    html += '<tr>';
    html += emailTableCell_(escapeHtml_(item.center), highlighted, true, "110", "font-weight:700;");
    html += emailTableCell_(typeHtml, highlighted, false, "150", "");
    html += emailTableCell_(escapeHtml_((item.strengths || []).join(", ")), highlighted, false, "320", "");
    html += emailTableCell_(escapeHtml_((item.weaknesses || []).join(", ")), highlighted, false, "320", "");
    html += '</tr>';
  }
  return emailWideTableWrap_(html + '</table>');
}

function buildWingsGuideTableHtml_(wingDetails, growthTable, selectedType, selectedWing) {
  var html = '<table role="presentation" width="100%" border="1" bordercolor="#d5cbc3" cellspacing="0" cellpadding="0" style="width:100%;min-width:900px;border-collapse:collapse;table-layout:fixed;">';
  html += '<tr>' + emailTableHeaderCell_("기본 유형", "150", false) + emailTableHeaderCell_("날개", "100", false) + emailTableHeaderCell_("별칭", "150", false) + emailTableHeaderCell_("특징", "500", false) + '</tr>';
  for (var type = 1; type <= 9; type++) {
    var wings = wingDetails[type] || [];
    var highlightedType = type === selectedType;
    for (var wingIndex = 0; wingIndex < wings.length; wingIndex++) {
      var wing = wings[wingIndex];
      var exactWing = wing.code === selectedWing;
      html += '<tr>';
      if (wingIndex === 0) {
        var typeName = growthTable[type] ? growthTable[type].name : ENNEAGRAM_TYPE_NAMES[type];
        var typeHtml = '<strong>' + type + '번 · ' + escapeHtml_(typeName) + '</strong>';
        if (highlightedType) typeHtml += '<div style="margin-top:6px;color:#8f1f26;font-size:9px;font-weight:700;">나의 최종 유형</div>';
        html += emailTableCellWithRowspan_(typeHtml, highlightedType, true, "150", wings.length);
      }
      var wingHtml = '<strong>' + escapeHtml_(wing.code) + '</strong>';
      if (exactWing) wingHtml += '<div style="margin-top:6px;color:#8f1f26;font-size:9px;font-weight:700;">나의 날개</div>';
      html += emailTableCell_(wingHtml, highlightedType, false, "100", exactWing ? "color:#8f1f26;" : "");
      html += emailTableCell_(escapeHtml_(wing.nickname), highlightedType, false, "150", exactWing ? "color:#8f1f26;font-weight:700;" : "");
      html += emailTableCell_(emailInlineListHtml_(wing.points), highlightedType, false, "500", "");
      html += '</tr>';
    }
  }
  return emailWideTableWrap_(html + '</table>');
}

function emailSectionTitle_(english, korean) {
  return '<div style="margin:32px 0 12px;padding-bottom:9px;border-bottom:1px solid #b4a9a1;"><div style="color:#8f1f26;font-size:9px;font-weight:700;letter-spacing:1.5px;">' + escapeHtml_(english) + '</div><h2 style="margin:5px 0 0;color:#171310;font-size:21px;line-height:1.4;">' + escapeHtml_(korean) + '</h2></div>';
}

function emailKeyValueTable_(rows) {
  var html = '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;border-top:1px solid #d5cbc3;">';
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][1] == null || String(rows[i][1]) === "") continue;
    html += '<tr><th width="160" bgcolor="#f6f0e7" align="left" valign="top" style="padding:11px 12px;border-bottom:1px solid #d5cbc3;color:#8f1f26;font-size:11px;line-height:1.6;">' + escapeHtml_(rows[i][0]) + '</th><td align="left" valign="top" style="padding:11px 13px;border-bottom:1px solid #d5cbc3;color:#615751;font-size:12px;line-height:1.7;white-space:pre-line;">' + escapeHtml_(rows[i][1]) + '</td></tr>';
  }
  html += '</table>';
  return html;
}

function emailWideTableWrap_(tableHtml) {
  return '<div style="width:100%;margin:0 0 18px;overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid #b4a9a1;">' + tableHtml + '</div>';
}

function emailTableHeaderCell_(label, width, highlighted, extraStyle) {
  var background = highlighted ? "#8f1f26" : "#171310";
  return '<th width="' + width + '" bgcolor="' + background + '" align="left" valign="middle" style="padding:13px 11px;color:#fffaf2;font-size:11px;line-height:1.5;font-weight:700;' + (extraStyle || "") + '">' + escapeHtml_(label) + '</th>';
}

function emailTableCell_(html, highlighted, firstCell, width, extraStyle) {
  var background = highlighted ? "#f7e7e3" : "#fffaf2";
  var color = highlighted ? "#6f171b" : "#615751";
  var leftBorder = highlighted && firstCell ? "border-left:5px solid #9f2027;" : "";
  return '<td width="' + width + '" bgcolor="' + background + '" align="left" valign="top" style="padding:14px 11px;color:' + color + ';font-size:12px;line-height:1.65;' + leftBorder + (extraStyle || "") + '">' + html + '</td>';
}

function emailTableCellWithRowspan_(html, highlighted, firstCell, width, rowspan) {
  var background = highlighted ? "#f7e7e3" : "#fffaf2";
  var color = highlighted ? "#6f171b" : "#615751";
  var leftBorder = highlighted && firstCell ? "border-left:5px solid #9f2027;" : "";
  return '<td width="' + width + '" rowspan="' + rowspan + '" bgcolor="' + background + '" align="left" valign="top" style="padding:14px 11px;color:' + color + ';font-size:12px;line-height:1.65;' + leftBorder + '">' + html + '</td>';
}

function emailInlineListHtml_(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  var html = '<ul style="margin:0;padding-left:18px;color:inherit;font-size:12px;line-height:1.7;">';
  for (var i = 0; i < items.length; i++) html += '<li style="margin:0 0 3px;">' + escapeHtml_(items[i]) + '</li>';
  return html + '</ul>';
}

function emailParagraphs_(paragraphs) {
  var html = "";
  for (var i = 0; i < paragraphs.length; i++) {
    html += '<p style="margin:0 0 10px;color:#615751;font-size:12px;line-height:1.8;">' + escapeHtml_(paragraphs[i]) + '</p>';
  }
  return html;
}

function joinListText_(items) {
  return Array.isArray(items) ? items.join("\n• ").replace(/^/, "• ") : String(items || "");
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
