const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.maxColumns = 26;
  }

  getMaxColumns() {
    return this.maxColumns;
  }

  insertColumnsAfter(_after, count) {
    this.maxColumns += count;
  }

  setFrozenRows() {}

  getDataRange() {
    return { getValues: () => this.rows.map((row) => [...row]) };
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return {
      setValues: (values) => {
        for (let y = 0; y < rowCount; y += 1) {
          while (this.rows.length < row + y) this.rows.push([]);
          for (let x = 0; x < columnCount; x += 1) {
            this.rows[row - 1 + y][column - 1 + x] = values[y][x];
          }
        }
      },
      setValue: (value) => {
        while (this.rows.length < row) this.rows.push([]);
        this.rows[row - 1][column - 1] = value;
      },
    };
  }

  appendRow(values) {
    this.rows.push([...values]);
  }

  deleteRow(row) {
    this.rows.splice(row - 1, 1);
  }
}

class MockSpreadsheet {
  constructor() {
    this.sheets = new Map();
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
}

const spreadsheet = new MockSpreadsheet();
const properties = new Map([["ADMIN_PASSWORD", "admin-password"]]);
const cache = new Map();
let uuidIndex = 0;

const context = {
  console,
  Date,
  JSON,
  Math,
  Object,
  String,
  Boolean,
  Error,
  Logger: { log() {} },
  MailApp: { sendEmail() {} },
  LockService: {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => spreadsheet,
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, String(value)),
      deleteProperty: (key) => properties.delete(key),
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.get(key) || null,
      put: (key, value) => cache.set(key, value),
      remove: (key) => cache.delete(key),
    }),
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: "sha256" },
    Charset: { UTF_8: "utf8" },
    getUuid: () => `00000000-0000-4000-8000-${String(++uuidIndex).padStart(12, "0")}`,
    computeDigest: (_algorithm, value) => [...crypto.createHash("sha256").update(value).digest()],
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput: (content) => ({
      content,
      setMimeType() {
        return this;
      },
    }),
  },
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("gas/Code.gs", "utf8"), context);

function post(payload) {
  const output = context.doPost({ postData: { contents: JSON.stringify(payload) } });
  return JSON.parse(output.content);
}

const login = post({ action: "adminLogin", password: "admin-password" });
assert.equal(login.ok, true);
assert.ok(login.token);
assert.equal(properties.has("ADMIN_PASSWORD"), false);
assert.ok(properties.has("ADMIN_PASSWORD_HASH"));

const created = post({
  action: "adminCreateGroup",
  token: login.token,
  name: "리더십 1기",
  accessCode: "class-1004",
});
assert.equal(created.ok, true);

const groupId = created.group.id;
const groups = post({ action: "groups" });
assert.deepEqual(groups.groups, [{ id: groupId, name: "리더십 1기", active: true }]);

const deniedNewUser = post({
  action: "participantLogin",
  email: "person@example.com",
  groupId,
  accessCode: "wrong",
});
assert.equal(deniedNewUser.canTest, false);
assert.equal(deniedNewUser.records.length, 0);

const allowed = post({
  action: "participantLogin",
  email: "person@example.com",
  groupId,
  accessCode: "class-1004",
});
assert.equal(allowed.canTest, true);

const submitted = post({
  action: "submit",
  name: "홍길동",
  email: "person@example.com",
  age: 30,
  birthYear: 1995,
  groupId,
  accessCode: "class-1004",
  result: {
    type: 8,
    typeName: "도전자",
    center: "장(본능) 중심",
    wing: 7,
    wingName: "열정가",
    wingLabel: "8w7",
    stress: 5,
    stressName: "탐구자",
    growth: 2,
    growthName: "조력가",
    scores: { 8: 42 },
  },
});
assert.equal(submitted.ok, true);

const passwordChanged = post({
  action: "adminUpdateGroup",
  token: login.token,
  groupId,
  accessCode: "new-class-code",
});
assert.equal(passwordChanged.ok, true);

const historyOnly = post({
  action: "participantLogin",
  email: "person@example.com",
  groupId,
  accessCode: "class-1004",
});
assert.equal(historyOnly.canTest, false);
assert.equal(historyOnly.records.length, 1);
assert.equal(historyOnly.records[0].wingLabel, "8w7");

const groupClosed = post({
  action: "adminUpdateGroup",
  token: login.token,
  groupId,
  active: false,
});
assert.equal(groupClosed.ok, true);

const closedGroupHistory = post({
  action: "participantLogin",
  email: "person@example.com",
  groupId,
  accessCode: "new-class-code",
});
assert.equal(closedGroupHistory.canTest, false);
assert.equal(closedGroupHistory.records.length, 1);

const visibleClosedGroup = post({ action: "groups" });
assert.equal(visibleClosedGroup.groups[0].active, false);

post({
  action: "adminUpdateGroup",
  token: login.token,
  groupId,
  active: true,
});

for (let attempt = 0; attempt < 5; attempt += 1) {
  const repeated = post({
    action: "submit",
    name: "홍길동",
    email: "person@example.com",
    age: 30,
    birthYear: 1995,
    groupId,
    accessCode: "new-class-code",
    result: {
      type: 8,
      typeName: "도전자",
      center: "장(본능) 중심",
      wing: 7,
      wingName: "열정가",
      wingLabel: "8w7",
      stress: 5,
      stressName: "탐구자",
      growth: 2,
      growthName: "조력가",
      scores: { 8: 40 + attempt },
    },
  });
  assert.equal(repeated.ok, true);
}

const cappedHistory = post({
  action: "participantLogin",
  email: "person@example.com",
  groupId,
  accessCode: "new-class-code",
});
assert.equal(cappedHistory.records.length, 5);

const dashboard = post({ action: "adminDashboard", token: login.token });
assert.equal(dashboard.records.length, 5);
assert.equal(dashboard.records[0].groupId, groupId);
assert.equal(dashboard.records[0].center, "장(본능) 중심");
assert.equal(Object.hasOwn(dashboard.groups[0], "accessCodeHash"), false);
assert.notEqual(spreadsheet.getSheetByName("집단").rows[1][2], "new-class-code");

console.log("GAS backend authorization scenarios passed");
