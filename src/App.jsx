import { useEffect, useState } from "react";
import { QUESTIONS } from "./data/questions";
import { TYPE_INFO } from "./data/enneagramInfo";
import { computeResult, describeResult, recordToResult } from "./utils/scoring";
import { calcManAge, MIN_BIRTH_YEAR, MAX_BIRTH_YEAR } from "./utils/age";
import { MAX_RECORDS_PER_EMAIL } from "./config";
import { listGroups, participantLogin, selectResultType, submitResult } from "./api/gas";
import ScoreChart from "./components/ScoreChart";
import EnneagramGuide from "./components/EnneagramGuide";
import "./App.css";

const PAGE_SIZE = 9;
const PAGES = Math.ceil(QUESTIONS.length / PAGE_SIZE);
const SCALE = [
  { value: 1, label: "전혀 그렇지 않다" },
  { value: 2, label: "그렇지 않다" },
  { value: 3, label: "보통이다" },
  { value: 4, label: "그렇다" },
  { value: 5, label: "매우 그렇다" },
];

const ERROR_MESSAGES = {
  admin_not_configured: "관리자 설정이 아직 완료되지 않았습니다.",
  group_not_found: "선택한 집단은 현재 검사를 받을 수 없습니다.",
  invalid_access_code: "검사 비밀번호가 올바르지 않습니다.",
  participant_session_expired: "로그인 시간이 만료되었습니다. 처음 화면에서 다시 로그인해 주세요.",
  invalid_selected_type: "공동 1위로 나온 번호 중에서 선택해 주세요.",
  type_already_selected: "이 기록은 이미 유형 선택이 완료되었습니다.",
  GAS_NOT_CONFIGURED: "검사 서버가 연결되지 않았습니다.",
};

function getErrorMessage(error, fallback) {
  const code = error?.code || error?.message || error;
  return ERROR_MESSAGES[code] || fallback;
}

function EnneagramEmblem() {
  const points = [
    [100, 14, "9"],
    [155, 34, "1"],
    [185, 82, "2"],
    [174, 143, "3"],
    [131, 180, "4"],
    [69, 180, "5"],
    [26, 143, "6"],
    [15, 82, "7"],
    [45, 34, "8"],
  ];

  return (
    <svg
      className="enneagram-emblem"
      viewBox="0 0 200 200"
      role="img"
      aria-label="에니어그램을 상징하는 아홉 점 도형"
    >
      <circle className="emblem-ring" cx="100" cy="100" r="86" />
      <polyline className="emblem-line" points="100,14 174,143 26,143 100,14" />
      <polyline
        className="emblem-line"
        points="155,34 131,180 185,82 45,34 69,180 15,82 155,34"
      />
      {points.map(([x, y, number]) => (
        <g key={number}>
          <circle className="emblem-node" cx={x} cy={y} r="9" />
          <text className="emblem-number" x={x} y={y + 3.5} textAnchor="middle">
            {number}
          </text>
        </g>
      ))}
    </svg>
  );
}

function formatDate(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTopTypes(recordOrResult) {
  const selectedType = Number(recordOrResult.selectedType);
  if (selectedType) return [selectedType];
  if (Array.isArray(recordOrResult.topTypes) && recordOrResult.topTypes.length) {
    return recordOrResult.topTypes.map(Number);
  }
  return [Number(recordOrResult.type)];
}

function needsTypeSelection(record) {
  return Array.isArray(record.topTypes) && record.topTypes.length > 1 && !Number(record.selectedType);
}

function TieTypeSelectionModal({ record, saving, error, onSelect, onDefer }) {
  const topTypes = record.topTypes.map(Number);
  const topScore = Math.max(...topTypes.map((type) => Number(record.scores?.[type]) || 0));

  return (
    <div className="type-choice-backdrop" role="presentation">
      <section
        className="type-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="type-choice-title"
      >
        <p className="eyebrow">JOINT HIGHEST SCORE</p>
        <h2 className="type-choice-title" id="type-choice-title">
          공동 1위 중 나의 유형을 선택해 주세요.
        </h2>
        <p className="type-choice-description">
          {formatDate(record.timestamp)} 검사에서 아래 유형들이 모두 {topScore}점으로
          공동 1위였습니다. 선택하면 이후에는 정한 번호로 결과가 표시됩니다.
        </p>
        <div className="type-choice-options">
          {topTypes.map((type) => (
            <button
              className="type-choice-option"
              type="button"
              key={type}
              disabled={saving}
              onClick={() => onSelect(type)}
            >
              <span className="type-choice-number">{type}</span>
              <span>
                <strong>{type}번 · {TYPE_INFO[type].name}</strong>
                <small>{TYPE_INFO[type].desc}</small>
              </span>
            </button>
          ))}
        </div>
        {error && <p className="type-choice-error" role="alert">{error}</p>}
        <button className="btn type-choice-defer" type="button" onClick={onDefer} disabled={saving}>
          아직 선택 안함
        </button>
        <p className="type-choice-note">
          지금 정하지 않아도 괜찮습니다. 선택하지 않으면 다음 로그인 때 다시 안내합니다.
        </p>
      </section>
    </div>
  );
}

function LoginScreen({
  onLogin,
  loading,
  groups,
  groupsLoading,
  groupsError,
  loginError,
  onReloadGroups,
}) {
  const [form, setForm] = useState({
    name: "",
    birthYear: "",
    groupId: "",
    accessCode: "",
    email: "",
  });
  const manAge = calcManAge(form.birthYear);
  const canSubmit =
    form.name &&
    manAge != null &&
    form.groupId &&
    form.accessCode &&
    form.email;

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    const group = groups.find((item) => item.id === form.groupId);
    onLogin({ ...form, age: manAge, affiliation: group?.name || "" });
  }

  return (
    <section className="login-layout">
      <div className="login-hero">
        <div className="hero-copy">
          <p className="eyebrow eyebrow-light">THE INNER PORTRAIT · NO. 09</p>
          <h1 className="hero-title">
            나를 이해하는
            <br />
            아홉 개의 길
          </h1>
          <p className="hero-description">
            익숙한 나를 새롭게 바라보는 시간.
            <br />
            당신의 중심과 성장의 방향을 발견하세요.
          </p>
        </div>
        <EnneagramEmblem />
        <div className="hero-meta" aria-hidden="true">
          <span>81 QUESTIONS</span>
          <span>KEPTI GUIDE</span>
          <span>PERSONAL ARCHIVE</span>
        </div>
      </div>

      <div className="login-panel">
        <div className="login-panel-copy">
          <p className="eyebrow">BEGIN THE JOURNEY</p>
          <h2 className="form-title">당신의 내면을 만나는 시간</h2>
          <p className="lead">
            총 {QUESTIONS.length}개의 문항을 통해 에니어그램 유형과 힘의 중심,
            날개, 스트레스·성장 방향을 살펴봅니다.
          </p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="form-field">
            <span className="field-label">이름</span>
            <input
              className="text-input"
              placeholder="이름을 입력해 주세요"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </label>
          <label className="form-field birthyear-field">
            <span className="field-label">출생연도</span>
          <input
            className="text-input"
            type="number"
            min={MIN_BIRTH_YEAR}
            max={MAX_BIRTH_YEAR}
            placeholder="예: 1990"
            value={form.birthYear}
            onChange={(e) => update("birthYear", e.target.value)}
            required
          />
          {manAge != null && (
            <p className="birthyear-hint">만 {manAge}세</p>
          )}
          </label>
          <label className="form-field">
            <span className="field-label">소속</span>
            <select
              className="text-input"
              value={form.groupId}
              onChange={(e) => update("groupId", e.target.value)}
              disabled={groupsLoading || groups.length === 0}
              required
            >
              <option value="">
                {groupsLoading ? "집단을 불러오는 중" : "집단을 선택해 주세요"}
              </option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}{group.active === false ? " (검사 종료 · 기록 조회만)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="field-label">이메일</span>
            <input
              className="text-input"
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              required
            />
          </label>
          <label className="form-field form-field-wide">
            <span className="field-label">검사 비밀번호</span>
            <input
              className="text-input"
              type="password"
              autoComplete="one-time-code"
              placeholder="관리자에게 받은 비밀번호"
              value={form.accessCode}
              onChange={(e) => update("accessCode", e.target.value)}
              required
            />
          </label>
          {(groupsError || loginError) && (
            <div className="form-message error" role="alert">
              <span>{groupsError || loginError}</span>
              {groupsError && (
                <button type="button" onClick={onReloadGroups}>
                  다시 불러오기
                </button>
              )}
            </div>
          )}
          {!groupsLoading && !groupsError && groups.length === 0 && (
            <p className="form-message">
              현재 참여 가능한 집단이 없습니다. 관리자에게 문의해 주세요.
            </p>
          )}
        <button className="btn primary" type="submit" disabled={!canSubmit || loading}>
          <span>{loading ? "기록을 확인하는 중" : "기록 확인 · 검사 시작"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </form>
        <p className="privacy-note">
          같은 이메일로 로그인하면 이전 결과를 다시 볼 수 있습니다. 기록은 최대 {MAX_RECORDS_PER_EMAIL}회까지 보관됩니다.
        </p>
      </div>
    </section>
  );
}

function HistoryScreen({
  userInfo,
  records,
  canTest,
  accessError,
  onSelect,
  onStartNew,
}) {
  const sorted = [...records].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <section className="card wide history-card">
      <p className="eyebrow">PERSONAL ARCHIVE</p>
      <h1 className="title">{userInfo.name}님의 기록</h1>
      <p className="lead muted">
        총 {records.length}개의 기록이 저장되어 있습니다. 같은 이메일당 최대{" "}
        {MAX_RECORDS_PER_EMAIL}개까지 보관되며, 초과 시 가장 오래된 기록부터
        자동으로 삭제됩니다.
      </p>

      {!canTest && (
        <div className="access-restricted" role="status">
          <span className="access-restricted-icon" aria-hidden="true">○</span>
          <div>
            <strong>현재는 새 검사를 시작할 수 없습니다.</strong>
            <p>
              {accessError === "invalid_access_code"
                ? "집단의 검사 비밀번호가 변경되었거나 입력한 비밀번호가 다릅니다. 저장된 결과는 계속 확인할 수 있습니다."
                : "선택한 집단의 검사가 현재 닫혀 있습니다. 저장된 결과는 계속 확인할 수 있습니다."}
            </p>
          </div>
        </div>
      )}

      <div className="history-list">
        {sorted.map((rec) => (
          <button
            key={rec.recordId || rec.timestamp}
            type="button"
            className="history-item"
            onClick={() => onSelect(rec)}
          >
            <span className="history-date">{formatDate(rec.timestamp)}</span>
            <span className="history-type">
              {needsTypeSelection(rec)
                ? `공동 1위 · ${rec.topTypes.map((type) => `${type}번`).join(" · ")}`
                : `${rec.type}번 · ${rec.typeName}`}
            </span>
            <span className="history-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>

      {canTest && (
        <button className="btn primary" onClick={onStartNew}>
          <span>새로 검사하기</span>
          <span aria-hidden="true">→</span>
        </button>
      )}
    </section>
  );
}

function QuizScreen({ answers, setAnswers, onFinish }) {
  const [page, setPage] = useState(0);
  const start = page * PAGE_SIZE;
  const pageQuestions = QUESTIONS.slice(start, start + PAGE_SIZE);
  const pageAnswered = pageQuestions.every((q) => answers[q.id] != null);
  const progress = Math.round(
    (Object.keys(answers).length / QUESTIONS.length) * 100
  );

  function select(qid, value) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }

  function next() {
    if (page < PAGES - 1) {
      setPage(page + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      onFinish();
    }
  }

  function prev() {
    if (page > 0) {
      setPage(page - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <section className="card wide quiz-card">
      <div className="quiz-heading-row">
        <div>
          <p className="eyebrow">THE INNER PORTRAIT · QUESTIONNAIRE</p>
          <h1 className="title quiz-title">지금의 나와 가까운 답을 골라주세요.</h1>
        </div>
        <p className="page-number" aria-label={`${PAGES}페이지 중 ${page + 1}페이지`}>
          {String(page + 1).padStart(2, "0")}<span> / {String(PAGES).padStart(2, "0")}</span>
        </p>
      </div>
      <div className="progress-block">
        <div className="progress-meta">
          <span>{start + 1}–{start + pageQuestions.length}번 문항</span>
          <span>{progress}% COMPLETE</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {pageQuestions.map((q) => (
        <article className="question" key={q.id}>
          <p className="question-text">
            <span className="question-number">{String(q.id).padStart(2, "0")}</span>
            <span>{q.text}</span>
          </p>
          <div className="scale">
            {SCALE.map((s) => (
              <label
                key={s.value}
                className={`scale-option ${
                  answers[q.id] === s.value ? "selected" : ""
                }`}
              >
                <input
                  type="radio"
                  name={`q${q.id}`}
                  value={s.value}
                  checked={answers[q.id] === s.value}
                  onChange={() => select(q.id, s.value)}
                />
                <span className="scale-dot" />
                <span className="scale-label">{s.label}</span>
              </label>
            ))}
          </div>
        </article>
      ))}

      <div className="nav-row">
        <button className="btn" onClick={prev} disabled={page === 0}>
          이전
        </button>
        <button className="btn primary" onClick={next} disabled={!pageAnswered}>
          <span>{page < PAGES - 1 ? "다음 페이지" : "결과 보기"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

function ResultScreen({
  result,
  isExisting,
  submitStatus,
  hasHistory,
  onRestart,
  onViewHistory,
}) {
  const highlightTypes = getTopTypes(result);
  const hasUnresolvedTie = highlightTypes.length > 1 && !Number(result.selectedType);
  const info = TYPE_INFO[result.type];
  const wingInfo = TYPE_INFO[result.wing];
  const stressInfo = TYPE_INFO[result.stress];
  const growthInfo = TYPE_INFO[result.growth];

  return (
    <section className="card wide result-card">
      <div className="result-printable">
        {isExisting ? (
          <p className="muted small center-text">
            저장된 검사 기록을 불러왔습니다
          </p>
        ) : (
          <p className="muted small center-text">
            {submitStatus === "saving" && "결과를 저장하고 이메일로 보내는 중..."}
            {submitStatus === "saved" &&
              "결과가 저장되었고 이메일로 전송되었습니다."}
            {submitStatus === "error" &&
              "결과 저장/이메일 전송에 실패했습니다. 아래 결과는 정상 확인 가능합니다."}
            {submitStatus === "access_denied" &&
              "검사 중 비밀번호가 변경되어 결과가 저장되지 않았습니다. 관리자에게 새 비밀번호를 받은 뒤 다시 검사해 주세요."}
          </p>
        )}

        <div className="result-hero">
          <div className={`result-type-number${hasUnresolvedTie ? " is-multiple" : ""}`} aria-hidden="true">
            {highlightTypes.map((type) => <span key={type}>{type}</span>)}
          </div>
          <div className="result-hero-copy">
            <p className="eyebrow">YOUR ENNEAGRAM PORTRAIT</p>
            <h1 className="title">
              {hasUnresolvedTie
                ? `공동 1위 · ${highlightTypes.map((type) => `${type}번 ${TYPE_INFO[type].name}`).join(" · ")}`
                : `${result.type}번 유형 · ${info.name}`}
            </h1>
            <p className="lead">
              {hasUnresolvedTie
                ? "동일한 최고 점수를 받은 유형을 모두 강조했습니다. 다음 로그인 때 가장 자신과 가깝다고 느끼는 유형을 선택할 수 있습니다."
                : info.desc}
            </p>
          </div>
        </div>

        {hasUnresolvedTie && (
          <div className="tie-result-notice">
            아래 힘의 중심·날개·분열·통합 방향은 공동 1위 중 {result.type}번을 임시
            기준으로 보여줍니다. 유형을 선택하면 선택한 번호 기준으로 다시 표시됩니다.
          </div>
        )}

        <div className="stat-grid">
          <div className="stat">
            <p className="stat-label">힘의 중심</p>
            <p className="stat-value">{result.center}</p>
          </div>
          <div className="stat">
            <p className="stat-label">날개</p>
            <p className="stat-value">
              {result.wingLabel}{" "}
              <span className="muted">({wingInfo.name})</span>
            </p>
          </div>
          <div className="stat">
            <p className="stat-label">분열(스트레스) 방향</p>
            <p className="stat-value">
              {result.stress}번{" "}
              <span className="muted">({stressInfo.name})</span>
            </p>
          </div>
          <div className="stat">
            <p className="stat-label">통합(성장) 방향</p>
            <p className="stat-value">
              {result.growth}번{" "}
              <span className="muted">({growthInfo.name})</span>
            </p>
          </div>
        </div>

        <p className="eyebrow result-section-kicker">SCORE PROFILE</p>
        <h2 className="section-title">유형별 점수</h2>
        <ScoreChart scores={result.scores} highlightTypes={highlightTypes} />

        <p className="notice-banner">
          안내: 같은 이메일로는 최대 {MAX_RECORDS_PER_EMAIL}회까지 검사 기록이
          저장되며, {MAX_RECORDS_PER_EMAIL + 1}번째 검사부터는 가장 오래된
          기록이 자동으로 삭제됩니다.
        </p>

        <EnneagramGuide highlightTypes={highlightTypes} />
      </div>

      <div className="result-actions no-print">
        <button className="btn primary" onClick={() => window.print()}>
          PDF로 저장하기
        </button>
        {hasHistory && (
          <button className="btn" onClick={onViewHistory}>
            내 기록 목록 보기
          </button>
        )}
        <button className="btn" onClick={onRestart}>
          처음으로
        </button>
      </div>
    </section>
  );
}

function App() {
  const [screen, setScreen] = useState("login");
  const [answers, setAnswers] = useState({});
  const [userInfo, setUserInfo] = useState(null);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState("");
  const [loginError, setLoginError] = useState("");
  const [records, setRecords] = useState([]);
  const [canTest, setCanTest] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [result, setResult] = useState(null);
  const [isExisting, setIsExisting] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [selectionToken, setSelectionToken] = useState("");
  const [pendingTypeChoices, setPendingTypeChoices] = useState([]);
  const [typeChoiceSaving, setTypeChoiceSaving] = useState(false);
  const [typeChoiceError, setTypeChoiceError] = useState("");

  async function refreshGroups() {
    setGroupsLoading(true);
    setGroupsError("");
    try {
      const res = await listGroups();
      setGroups(res.groups || []);
    } catch (error) {
      setGroupsError(
        getErrorMessage(error, "집단 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    } finally {
      setGroupsLoading(false);
    }
  }

  useEffect(() => {
    refreshGroups();
  }, []);

  async function handleLogin(info) {
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await participantLogin(info);
      const recs = res.records || [];
      const nextUserInfo = {
        ...info,
        affiliation: res.group?.name || info.affiliation,
      };
      setUserInfo(nextUserInfo);
      setRecords(recs);
      setCanTest(Boolean(res.canTest));
      setAccessError(res.accessError || null);
      setSelectionToken(res.selectionToken || "");
      setPendingTypeChoices(
        recs
          .filter(needsTypeSelection)
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      );
      setTypeChoiceError("");

      if (recs.length > 0) {
        setScreen("history");
      } else if (res.canTest) {
        setScreen("quiz");
      } else {
        setUserInfo(null);
        setLoginError(
          ERROR_MESSAGES[res.accessError] || "관리자에게 받은 집단과 비밀번호를 확인해 주세요."
        );
      }
    } catch (error) {
      setLoginError(
        getErrorMessage(error, "로그인 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    } finally {
      setLoginLoading(false);
    }
  }

  function handleSelectRecord(rec) {
    setResult(recordToResult(rec));
    setIsExisting(true);
    setScreen("result");
  }

  function handleStartNew() {
    if (!canTest) return;
    setAnswers({});
    setScreen("quiz");
  }

  async function handleSelectTiedType(type) {
    const pendingRecord = pendingTypeChoices[0];
    if (!pendingRecord || !selectionToken || typeChoiceSaving) return;
    setTypeChoiceSaving(true);
    setTypeChoiceError("");
    try {
      const res = await selectResultType(selectionToken, pendingRecord.recordId, type);
      const updatedRecord = res.record;
      setRecords((current) => current.map((record) =>
        record.recordId === updatedRecord.recordId ? updatedRecord : record
      ));
      setPendingTypeChoices((current) => current.slice(1));
    } catch (error) {
      setTypeChoiceError(
        getErrorMessage(error, "유형을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")
      );
    } finally {
      setTypeChoiceSaving(false);
    }
  }

  function handleDeferTypeChoice() {
    if (typeChoiceSaving) return;
    setPendingTypeChoices([]);
    setTypeChoiceError("");
  }

  async function handleQuizFinish() {
    const r = computeResult(answers);
    setResult(r);
    setIsExisting(false);
    setScreen("result");
    setSubmitStatus("saving");
    try {
      await submitResult({ ...userInfo, result: describeResult(r) });
      setSubmitStatus("saved");
    } catch (error) {
      if (error?.code === "invalid_access_code" || error?.code === "group_not_found") {
        setCanTest(false);
        setAccessError(error.code);
        setSubmitStatus("access_denied");
      } else {
        setSubmitStatus("error");
      }
    }
  }

  async function handleViewHistory() {
    setLoginLoading(true);
    try {
      const res = await participantLogin(userInfo);
      setRecords(res.records || []);
      setCanTest(Boolean(res.canTest));
      setAccessError(res.accessError || null);
      setSelectionToken(res.selectionToken || selectionToken);
      setScreen("history");
    } catch {
      setScreen("history");
    } finally {
      setLoginLoading(false);
    }
  }

  function restart() {
    setAnswers({});
    setUserInfo(null);
    setRecords([]);
    setCanTest(false);
    setAccessError(null);
    setLoginError("");
    setResult(null);
    setIsExisting(false);
    setSubmitStatus("idle");
    setSelectionToken("");
    setPendingTypeChoices([]);
    setTypeChoiceSaving(false);
    setTypeChoiceError("");
    setScreen("login");
  }

  const screenLabel = {
    login: "INTRODUCTION",
    history: "ARCHIVE",
    quiz: "QUESTIONNAIRE",
    result: "PORTRAIT",
  }[screen];

  return (
    <div className="site-frame">
      <header className="site-header">
        <div className="brand-mark">
          <span className="brand-dot" aria-hidden="true" />
          <span>THE NINE</span>
        </div>
        <p>{screenLabel} · KEPTI</p>
      </header>
      <main className={`app-shell screen-${screen}`}>
        {screen === "login" && (
          <LoginScreen
            onLogin={handleLogin}
            loading={loginLoading}
            groups={groups}
            groupsLoading={groupsLoading}
            groupsError={groupsError}
            loginError={loginError}
            onReloadGroups={refreshGroups}
          />
        )}
        {screen === "history" && userInfo && (
          <HistoryScreen
            userInfo={userInfo}
            records={records}
            canTest={canTest}
            accessError={accessError}
            onSelect={handleSelectRecord}
            onStartNew={handleStartNew}
          />
        )}
        {screen === "quiz" && (
          <QuizScreen
            answers={answers}
            setAnswers={setAnswers}
            onFinish={handleQuizFinish}
          />
        )}
        {screen === "result" && result && (
          <ResultScreen
            result={result}
            isExisting={isExisting}
            submitStatus={submitStatus}
            hasHistory={Boolean(userInfo)}
            onRestart={restart}
            onViewHistory={handleViewHistory}
          />
        )}
      </main>
      {pendingTypeChoices.length > 0 && (
        <TieTypeSelectionModal
          record={pendingTypeChoices[0]}
          saving={typeChoiceSaving}
          error={typeChoiceError}
          onSelect={handleSelectTiedType}
          onDefer={handleDeferTypeChoice}
        />
      )}
      <footer className="site-footer">
        <span>ENNEAGRAM PERSONALITY PROFILE</span>
        <span className="footer-links">
          <a href="#/admin">ADMIN</a>
          <span>SEOUL · {new Date().getFullYear()}</span>
        </span>
      </footer>
    </div>
  );
}

export default App;
