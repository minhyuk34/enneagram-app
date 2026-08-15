import { useEffect, useMemo, useState } from "react";
import {
  adminLogin,
  adminLogout,
  changeAdminPassword,
  createAdminGroup,
  getAdminDashboard,
  updateAdminGroup,
} from "../api/gas";
import { TYPE_INFO } from "../data/enneagramInfo";
import { recordToResult } from "../utils/scoring";
import ScoreChart from "../components/ScoreChart";
import "./AdminApp.css";

const ADMIN_TOKEN_KEY = "enneagram_admin_token";
const TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const ADMIN_ERRORS = {
  admin_not_configured:
    "관리자 비밀번호가 아직 설정되지 않았습니다. Apps Script의 스크립트 속성에 ADMIN_PASSWORD를 먼저 등록해 주세요.",
  invalid_admin_password: "관리자 비밀번호가 올바르지 않습니다.",
  admin_auth_required: "관리자 로그인이 필요합니다.",
  admin_session_expired: "관리자 세션이 만료되었습니다. 다시 로그인해 주세요.",
  group_name_required: "집단 이름을 입력해 주세요.",
  group_name_exists: "같은 이름의 집단이 이미 있습니다.",
  access_code_too_short: "검사 비밀번호는 4자 이상으로 정해 주세요.",
  admin_password_too_short: "관리자 비밀번호는 8자 이상으로 정해 주세요.",
};

function errorMessage(error, fallback = "요청을 처리하지 못했습니다.") {
  const code = error?.code || error?.message || error;
  return ADMIN_ERRORS[code] || fallback;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getGroupName(record, groups) {
  return (
    groups.find((group) => group.id === record.groupId)?.name ||
    record.affiliation ||
    "미지정"
  );
}

function summarize(records) {
  const byType = Object.fromEntries(TYPES.map((type) => [type, 0]));
  const byCenter = { gut: 0, heart: 0, head: 0 };
  const latestByParticipant = new Map();

  records.forEach((record) => {
    const participantKey = String(record.email || record.recordId || "").toLowerCase();
    if (!latestByParticipant.has(participantKey)) {
      latestByParticipant.set(participantKey, record);
    }
  });

  latestByParticipant.forEach((record) => {
    const type = Number(record.type);
    if (byType[type] != null) byType[type] += 1;
    const center = String(record.center || "");
    if (center.includes("장")) byCenter.gut += 1;
    if (center.includes("가슴")) byCenter.heart += 1;
    if (center.includes("머리")) byCenter.head += 1;
  });

  return {
    total: records.length,
    participants: latestByParticipant.size,
    byType,
    byCenter,
  };
}

function AdminLogin({ onLogin, loading, error }) {
  const [password, setPassword] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!password || loading) return;
    onLogin(password);
  }

  return (
    <div className="admin-login-wrap">
      <section className="admin-login-card">
        <p className="eyebrow">ADMINISTRATION</p>
        <h1>관리자 페이지</h1>
        <p className="admin-login-description">
          집단과 검사 비밀번호를 관리하고, 검사 결과와 유형별 통계를 확인합니다.
        </p>
        <form onSubmit={submit}>
          <label>
            <span>관리자 비밀번호</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="관리자 비밀번호"
              required
            />
          </label>
          {error && <p className="admin-form-error" role="alert">{error}</p>}
          <button className="btn primary" type="submit" disabled={!password || loading}>
            {loading ? "확인 중" : "관리자 로그인"}
          </button>
        </form>
        <a className="admin-back-link" href="#/">← 검사 화면으로 돌아가기</a>
      </section>
    </div>
  );
}

function CreateGroupForm({ onCreate, loading }) {
  const [name, setName] = useState("");
  const [accessCode, setAccessCode] = useState("");

  async function submit(event) {
    event.preventDefault();
    const created = await onCreate({ name, accessCode });
    if (created) {
      setName("");
      setAccessCode("");
    }
  }

  return (
    <form className="group-create-form" onSubmit={submit}>
      <label>
        <span>새 집단 이름</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 8월 리더십 과정"
          required
        />
      </label>
      <label>
        <span>검사 비밀번호</span>
        <input
          type="password"
          value={accessCode}
          onChange={(event) => setAccessCode(event.target.value)}
          placeholder="4자 이상"
          minLength={4}
          required
        />
      </label>
      <button className="btn primary" type="submit" disabled={loading}>
        집단 만들기
      </button>
    </form>
  );
}

function GroupRow({ group, onUpdate, loading }) {
  const [name, setName] = useState(group.name);
  const [accessCode, setAccessCode] = useState("");

  useEffect(() => setName(group.name), [group.name]);

  async function saveName() {
    if (name.trim() && name.trim() !== group.name) {
      await onUpdate(group.id, { name: name.trim() });
    }
  }

  async function changeCode(event) {
    event.preventDefault();
    if (!accessCode) return;
    const updated = await onUpdate(group.id, { accessCode });
    if (updated) setAccessCode("");
  }

  return (
    <article className={`group-row ${group.active ? "" : "inactive"}`}>
      <div className="group-row-heading">
        <span className={`group-status ${group.active ? "active" : ""}`}>
          {group.active ? "검사 가능" : "중지됨"}
        </span>
        <button
          type="button"
          className="text-button"
          onClick={() => onUpdate(group.id, { active: !group.active })}
          disabled={loading}
        >
          {group.active ? "검사 닫기" : "검사 열기"}
        </button>
      </div>
      <label>
        <span>집단 이름</span>
        <div className="inline-field">
          <input value={name} onChange={(event) => setName(event.target.value)} />
          <button type="button" onClick={saveName} disabled={loading || name.trim() === group.name}>
            저장
          </button>
        </div>
      </label>
      <form onSubmit={changeCode}>
        <label>
          <span>새 검사 비밀번호</span>
          <div className="inline-field">
            <input
              type="password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              placeholder="변경할 때만 입력"
              minLength={4}
            />
            <button type="submit" disabled={loading || accessCode.length < 4}>
              변경
            </button>
          </div>
        </label>
      </form>
      <p className="group-row-meta">최근 변경 {formatDate(group.updatedAt)}</p>
    </article>
  );
}

function ResultDetail({ record, groups, onClose }) {
  const result = recordToResult(record);
  const info = TYPE_INFO[result.type];

  return (
    <section className="admin-result-detail" aria-label="선택한 검사 결과">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">INDIVIDUAL RESULT</p>
          <h2>{record.name}님의 검사 결과</h2>
        </div>
        <button className="text-button" type="button" onClick={onClose}>닫기 ×</button>
      </div>
      <div className="admin-result-identity">
        <div className="admin-result-number">{result.type}</div>
        <div>
          <p>{getGroupName(record, groups)} · {formatDate(record.timestamp)}</p>
          <h3>{result.type}번 · {info?.name || record.typeName}</h3>
          <span>{record.email}</span>
        </div>
      </div>
      <div className="admin-result-facts">
        <div><span>힘의 중심</span><strong>{result.center}</strong></div>
        <div><span>날개</span><strong>{result.wingLabel} · {TYPE_INFO[result.wing]?.name}</strong></div>
        <div><span>분열</span><strong>{result.stress}번 · {TYPE_INFO[result.stress]?.name}</strong></div>
        <div><span>통합</span><strong>{result.growth}번 · {TYPE_INFO[result.growth]?.name}</strong></div>
      </div>
      <ScoreChart scores={result.scores} highlightType={result.type} />
    </section>
  );
}

function AdminDashboard({ token, dashboard, onRefresh, onLogout }) {
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");

  const { groups, records } = dashboard;
  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return records.filter((record) => {
      const groupMatches =
        selectedGroup === "all" ||
        record.groupId === selectedGroup ||
        getGroupName(record, groups) === groups.find((group) => group.id === selectedGroup)?.name;
      const searchMatches =
        !keyword ||
        String(record.name || "").toLowerCase().includes(keyword) ||
        String(record.email || "").toLowerCase().includes(keyword);
      return groupMatches && searchMatches;
    });
  }, [groups, records, search, selectedGroup]);
  const stats = useMemo(() => summarize(filteredRecords), [filteredRecords]);
  const maxTypeCount = Math.max(1, ...Object.values(stats.byType));

  async function runAction(action, successMessage) {
    setActionLoading(true);
    setActionError("");
    setActionMessage("");
    try {
      await action();
      await onRefresh();
      setActionMessage(successMessage);
      return true;
    } catch (error) {
      setActionError(errorMessage(error));
      return false;
    } finally {
      setActionLoading(false);
    }
  }

  function createGroup(values) {
    return runAction(() => createAdminGroup(token, values), "새 집단을 만들었습니다.");
  }

  function updateGroup(groupId, changes) {
    return runAction(
      () => updateAdminGroup(token, groupId, changes),
      changes.accessCode ? "검사 비밀번호를 변경했습니다." : "집단 정보를 변경했습니다."
    );
  }

  async function updatePassword(event) {
    event.preventDefault();
    if (newAdminPassword.length < 8) return;
    setActionLoading(true);
    setActionError("");
    try {
      await changeAdminPassword(token, newAdminPassword);
      setNewAdminPassword("");
      onLogout("관리자 비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.");
    } catch (error) {
      setActionError(errorMessage(error));
      setActionLoading(false);
    }
  }

  return (
    <>
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">THE NINE · ADMIN</p>
          <h1>검사 관리 대시보드</h1>
        </div>
        <nav>
          <a href="#/">검사 화면</a>
          <button type="button" onClick={() => onLogout()}>로그아웃</button>
        </nav>
      </header>

      <main className="admin-main">
        {(actionMessage || actionError) && (
          <div className={`admin-flash ${actionError ? "error" : ""}`} role="status">
            {actionError || actionMessage}
          </div>
        )}

        <section className="admin-overview">
          <div className="admin-section-heading">
            <div>
              <p className="eyebrow">OVERVIEW</p>
              <h2>집단 통계</h2>
            </div>
            <select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}>
              <option value="all">전체 집단</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>

          <div className="summary-cards">
            <article><span>검사 기록</span><strong>{stats.total}</strong><small>회</small></article>
            <article><span>검사 인원</span><strong>{stats.participants}</strong><small>명</small></article>
            <article><span>운영 집단</span><strong>{groups.filter((group) => group.active).length}</strong><small>개</small></article>
          </div>

          <div className="stats-grid">
            <article className="type-stat-panel">
              <h3>번호별 최종 유형 <small>참가자별 최신 결과 기준</small></h3>
              <div className="type-bars">
                {TYPES.map((type) => (
                  <div className="type-bar-item" key={type}>
                    <span>{type}</span>
                    <div className="type-bar-track">
                      <div style={{ width: `${(stats.byType[type] / maxTypeCount) * 100}%` }} />
                    </div>
                    <strong>{stats.byType[type]}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="center-stat-panel">
              <h3>힘의 중심별 분포 <small>참가자별 최신 결과 기준</small></h3>
              <div className="center-stat-list">
                <div><span>장 · 본능</span><strong>{stats.byCenter.gut}</strong><small>1 · 8 · 9</small></div>
                <div><span>가슴 · 감정</span><strong>{stats.byCenter.heart}</strong><small>2 · 3 · 4</small></div>
                <div><span>머리 · 사고</span><strong>{stats.byCenter.head}</strong><small>5 · 6 · 7</small></div>
              </div>
            </article>
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <p className="eyebrow">GROUP ACCESS</p>
              <h2>집단과 검사 비밀번호</h2>
            </div>
            <span>비밀번호는 화면에 다시 표시되지 않습니다.</span>
          </div>
          <CreateGroupForm onCreate={createGroup} loading={actionLoading} />
          <div className="group-grid">
            {groups.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                onUpdate={updateGroup}
                loading={actionLoading}
              />
            ))}
          </div>
        </section>

        <section className="admin-section">
          <div className="admin-section-heading records-heading">
            <div>
              <p className="eyebrow">PARTICIPANT RECORDS</p>
              <h2>검사 기록</h2>
            </div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="이름 또는 이메일 검색"
            />
          </div>
          <div className="records-table-wrap">
            <table className="records-table">
              <thead>
                <tr>
                  <th>번호</th><th>검사일</th><th>이름</th><th>집단</th><th>최종 결과</th><th>힘의 중심</th><th>날개</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, index) => (
                  <tr key={record.recordId || `${record.email}-${record.timestamp}`}>
                    <td data-label="번호">{String(filteredRecords.length - index).padStart(3, "0")}</td>
                    <td data-label="검사일">{formatDate(record.timestamp)}</td>
                    <td data-label="이름"><strong>{record.name}</strong><small>{record.email}</small></td>
                    <td data-label="집단">{getGroupName(record, groups)}</td>
                    <td data-label="최종 결과"><b>{record.type}번</b> · {record.typeName}</td>
                    <td data-label="힘의 중심">{record.center}</td>
                    <td data-label="날개">{record.wingLabel}</td>
                    <td data-label="상세"><button type="button" onClick={() => setSelectedRecord(record)}>상세 보기</button></td>
                  </tr>
                ))}
                {filteredRecords.length === 0 && (
                  <tr><td className="empty-cell" colSpan={8}>조건에 맞는 검사 기록이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedRecord && (
          <ResultDetail
            record={selectedRecord}
            groups={groups}
            onClose={() => setSelectedRecord(null)}
          />
        )}

        <section className="admin-section admin-security">
          <div>
            <p className="eyebrow">ADMIN SECURITY</p>
            <h2>관리자 비밀번호 변경</h2>
            <p>변경하면 현재 세션이 종료되고 새 비밀번호로 다시 로그인해야 합니다.</p>
          </div>
          <form onSubmit={updatePassword}>
            <input
              type="password"
              value={newAdminPassword}
              onChange={(event) => setNewAdminPassword(event.target.value)}
              placeholder="새 관리자 비밀번호 · 8자 이상"
              minLength={8}
              required
            />
            <button className="btn" type="submit" disabled={actionLoading || newAdminPassword.length < 8}>
              변경하기
            </button>
          </form>
        </section>
      </main>
    </>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) || "");
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState("");

  async function loadDashboard(activeToken = token) {
    if (!activeToken) return;
    setLoading(true);
    try {
      const data = await getAdminDashboard(activeToken);
      setDashboard({ groups: data.groups || [], records: data.records || [] });
      setError("");
    } catch (loadError) {
      const message = errorMessage(loadError);
      setError(message);
      if (["admin_auth_required", "admin_session_expired"].includes(loadError?.code)) {
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken("");
        setDashboard(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) loadDashboard(token);
  }, [token]);

  async function login(password) {
    setLoading(true);
    setError("");
    try {
      const data = await adminLogin(password);
      sessionStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setToken(data.token);
    } catch (loginError) {
      setError(errorMessage(loginError));
      setLoading(false);
    }
  }

  async function logout(message = "") {
    if (token) {
      try {
        await adminLogout(token);
      } catch {
        // 로컬 세션 제거는 계속 진행한다.
      }
    }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken("");
    setDashboard(null);
    setError(message);
  }

  if (!token) return <AdminLogin onLogin={login} loading={loading} error={error} />;

  if (!dashboard) {
    return (
      <div className="admin-loading">
        <span className="brand-dot" />
        <p>{loading ? "관리 데이터를 불러오는 중입니다." : error}</p>
        {!loading && <button className="btn" onClick={() => loadDashboard(token)}>다시 시도</button>}
      </div>
    );
  }

  return (
    <div className="admin-site">
      <AdminDashboard
        token={token}
        dashboard={dashboard}
        onRefresh={() => loadDashboard(token)}
        onLogout={logout}
      />
    </div>
  );
}
