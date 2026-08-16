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
const sentEmails = [];
const builtCharts = [];
let uuidIndex = 0;

function chainableChartBuilder() {
  const state = {};
  const builder = {
    setDataTable(value) {
      state.data = value;
      return this;
    },
    setDimensions(width, height) {
      state.dimensions = [width, height];
      return this;
    },
    setTitle(value) {
      state.title = value;
      return this;
    },
    setXAxisTitle(value) {
      state.xAxisTitle = value;
      return this;
    },
    setYAxisTitle(value) {
      state.yAxisTitle = value;
      return this;
    },
    setRange(min, max) {
      state.range = [min, max];
      return this;
    },
    setColors(value) {
      state.colors = value;
      return this;
    },
    setOption(key, value) {
      state[key] = value;
      return this;
    },
    build() {
      builtCharts.push(state);
      return {
        getAs: () => ({
          name: "",
          setName(name) {
            this.name = name;
            return this;
          },
        }),
      };
    },
  };
  return builder;
}

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
  MailApp: { sendEmail: (message) => sentEmails.push(message) },
  Charts: {
    ColumnType: { STRING: "string", NUMBER: "number" },
    newDataTable: () => {
      const columns = [];
      const rows = [];
      return {
        addColumn(type, label) {
          columns.push([type, label]);
          return this;
        },
        addRow(row) {
          rows.push(row);
          return this;
        },
        build: () => ({ columns, rows }),
      };
    },
    newLineChart: chainableChartBuilder,
  },
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
    scores: { 1: 20, 2: 21, 3: 22, 4: 23, 5: 24, 6: 25, 7: 26, 8: 42, 9: 27 },
    guide: {
      integrationIntro: ["통합과 분열 안내"],
      growthTable: {
        1: {
          name: "개혁가",
          psychFunction: "합리성",
          avoidance: "성냄",
          trap: "완벽",
          weakness: "분노",
          strength: "침착",
          strategies: ["너그럽게 대하기"],
          motto: "사랑할 시간을 만든다",
        },
        8: {
          name: "지도자",
          psychFunction: "본능",
          avoidance: "나약함",
          trap: "정의",
          weakness: "욕망",
          strength: "적절한 힘",
          strategies: ["경청하기"],
          motto: "힘은 보호를 위해 쓴다",
        },
      },
      centers: [
        {
          key: "가슴",
          types: [2, 3, 4],
          desc: "가슴 중심 설명",
          emotion: "수치심",
          interest: "관계",
          situationAwareness: "감정적 파악",
          decision: "관계에 따라 결정",
          judgment: "감정",
          bodyDevelopment: "순환기",
          intelligence: "감성지능",
        },
        {
          key: "장",
          types: [8, 9, 1],
          desc: "장 중심 설명",
          emotion: "분노",
          interest: "힘과 정의",
          situationAwareness: "본능적 파악",
          decision: "즉시 결정",
          judgment: "직관",
          bodyDevelopment: "소화기",
          intelligence: "신체지능",
        },
      ],
      typeDescriptions: {
        1: {
          tagline: "원칙적인 유형",
          body: "개혁가 상세 설명",
          caution: "완벽주의를 주의한다",
        },
        8: {
          tagline: "힘 있고 통솔하는 유형",
          body: "도전자 상세 설명",
          caution: "화를 조절한다",
        },
      },
      strengthsWeaknessesTable: {
        1: {
          center: "장",
          strengths: ["원칙적이다"],
          weaknesses: ["비판적이다"],
        },
        8: {
          center: "장",
          strengths: ["용감하다"],
          weaknesses: ["통제하려 한다"],
        },
      },
      wingIntro: ["날개 안내"],
      wingDetails: {
        1: [
          { code: "1w9", nickname: "이상주의자", points: ["차분하다"] },
          { code: "1w2", nickname: "변호자", points: ["사람을 돕는다"] },
        ],
        8: [
          { code: "8w7", nickname: "독립자", points: ["행동력이 강하다"] },
          { code: "8w9", nickname: "곰", points: ["차분하다"] },
        ],
      },
    },
  },
});
assert.equal(submitted.ok, true);
assert.equal(sentEmails.length, 1);
assert.equal(sentEmails[0].to, "person@example.com");
assert.match(sentEmails[0].subject, /8번 유형/);
assert.match(sentEmails[0].body, /도전자 상세 설명/);
assert.match(sentEmails[0].htmlBody, /cid:scoreChart/);
assert.match(sentEmails[0].htmlBody, /SCORE PROFILE/);
assert.match(sentEmails[0].htmlBody, /장 중심 설명/);
assert.match(sentEmails[0].htmlBody, /가슴 중심 설명/);
assert.match(sentEmails[0].htmlBody, /경청하기/);
assert.match(sentEmails[0].htmlBody, /개혁가 상세 설명/);
assert.match(sentEmails[0].htmlBody, /1w9 · 이상주의자/);
assert.match(sentEmails[0].htmlBody, /8w7 · 독립자/);
assert.match(sentEmails[0].htmlBody, /나의 날개/);
assert.match(sentEmails[0].htmlBody, /최종 유형/);
assert.equal(sentEmails[0].inlineImages.scoreChart.name, "enneagram-score-chart.png");
assert.equal(builtCharts[0].data.rows.length, 9);
assert.deepEqual(Array.from(builtCharts[0].data.rows[7]), ["8번", 42, 42]);
assert.equal(context.escapeHtml_("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");

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
