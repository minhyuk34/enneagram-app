// 에니어그램 검사 앱 백엔드 (Google Apps Script Web App)
//
// 배포 방법:
// 1. 새 구글 시트를 만든다 (검사 기록 전용 시트 추천 — 기존 응답 시트와 분리).
// 2. 확장 프로그램 > Apps Script 를 연다.
// 3. 기본 생성된 Code.gs 내용을 지우고 이 파일 내용 전체를 붙여넣는다.
// 4. 배포 > 새 배포 > 유형: 웹 앱 선택.
//    - 실행 계정: 나
//    - 액세스 권한이 있는 사용자: 전체
// 5. 배포 후 나오는 웹 앱 URL을 복사해서 enneagram-app/.env 의 VITE_GAS_WEBAPP_URL 에 붙여넣는다.
// 6. 최초 1회는 승인(권한 허용) 팝업이 뜬다 — 본인 구글 계정으로 승인하면 된다.
//
// 정책: 같은 이메일당 검사 기록은 최대 MAX_RECORDS_PER_EMAIL(5)개까지 보관되며,
// 새 검사를 제출해 6개가 되면 가장 오래된 기록부터 자동으로 삭제된다.
// 이미 배포된 웹 앱이 있다면, 이 파일 전체를 다시 붙여넣고 "배포 > 배포 관리 > 수정"으로
// 같은 배포에 새 버전만 반영하면 URL이 바뀌지 않는다.

var SHEET_NAME = "기록";
var MAX_RECORDS_PER_EMAIL = 5;
var HEADER = [
  "타임스탬프", "이름", "만나이", "출생연도", "소속", "이메일",
  "유형", "유형명", "힘의중심",
  "날개유형", "날개유형명", "날개표기",
  "분열유형", "분열유형명",
  "통합유형", "통합유형명",
  "유형별점수(JSON)",
];

function doPost(e) {
  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ ok: false, error: "invalid_json" });
  }

  try {
    if (data.action === "lookup") {
      return handleLookup(data);
    }
    if (data.action === "submit") {
      return handleSubmit(data);
    }
    return jsonOutput({ ok: false, error: "unknown_action" });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
  }
  return sheet;
}

// 해당 이메일의 모든 검사 기록을 (오래된 순으로) 배열로 반환한다.
function handleLookup(data) {
  var email = String(data.email || "").trim().toLowerCase();
  if (!email) {
    return jsonOutput({ ok: false, error: "email_required" });
  }
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var records = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (String(row[5]).trim().toLowerCase() === email) {
      records.push(rowToRecord_(row));
    }
  }
  return jsonOutput({ ok: true, records: records, maxRecords: MAX_RECORDS_PER_EMAIL });
}

function handleSubmit(data) {
  var name = String(data.name || "").trim();
  var age = data.age;
  var birthYear = data.birthYear;
  var affiliation = String(data.affiliation || "").trim();
  var email = String(data.email || "").trim();
  var r = data.result || {};

  if (!name || !email || !r.type) {
    return jsonOutput({ ok: false, error: "missing_fields" });
  }

  var sheet = getSheet_();
  sheet.appendRow([
    new Date(),
    name, age, birthYear, affiliation, email,
    r.type, r.typeName, r.center,
    r.wing, r.wingName, r.wingLabel,
    r.stress, r.stressName,
    r.growth, r.growthName,
    JSON.stringify(r.scores || {}),
  ]);

  try {
    sendResultEmail_(name, email, r);
  } catch (err) {
    // 시트 저장은 성공했으므로 이메일 실패는 로그만 남기고 무시
    Logger.log("email send failed: " + err);
  }

  var remaining = enforceMaxRecords_(sheet, email, MAX_RECORDS_PER_EMAIL);

  return jsonOutput({ ok: true, recordCount: remaining, maxRecords: MAX_RECORDS_PER_EMAIL });
}

// 같은 이메일의 기록이 maxCount개를 넘으면 가장 오래된 것부터 삭제해 최신 maxCount개만 남긴다.
// 반환값: 정리 후 남은 기록 개수.
function enforceMaxRecords_(sheet, email, maxCount) {
  var emailLower = String(email).trim().toLowerCase();
  var values = sheet.getDataRange().getValues();
  var matchingRows = []; // 1-based 시트 행 번호, 오래된 순(=위에서 아래로 스캔한 순서)
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][5]).trim().toLowerCase() === emailLower) {
      matchingRows.push(i + 1);
    }
  }
  while (matchingRows.length > maxCount) {
    var oldestRow = matchingRows.shift();
    sheet.deleteRow(oldestRow);
    for (var j = 0; j < matchingRows.length; j++) {
      if (matchingRows[j] > oldestRow) {
        matchingRows[j] -= 1;
      }
    }
  }
  return matchingRows.length;
}

function sendResultEmail_(name, email, r) {
  var subject = "[에니어그램 검사 결과] " + name + "님 - " + r.type + "번 유형 (" + r.typeName + ")";
  var body =
    name + "님의 에니어그램 검사 결과입니다.\n\n" +
    "유형: " + r.type + "번 - " + r.typeName + "\n" +
    "힘의 중심: " + r.center + "\n" +
    "날개: " + r.wingLabel + " (" + r.wingName + ")\n" +
    "분열(스트레스) 방향: " + r.stress + "번 - " + r.stressName + "\n" +
    "통합(성장) 방향: " + r.growth + "번 - " + r.growthName + "\n";
  MailApp.sendEmail(email, subject, body);
}

function rowToRecord_(row) {
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
    scores: JSON.parse(row[16] || "{}"),
  };
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
