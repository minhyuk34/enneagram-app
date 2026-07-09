import { useState } from "react";
import { QUESTIONS } from "./data/questions";
import { TYPE_INFO } from "./data/enneagramInfo";
import { computeResult, describeResult, recordToResult } from "./utils/scoring";
import { calcManAge, MIN_BIRTH_YEAR, MAX_BIRTH_YEAR } from "./utils/age";
import { MAX_RECORDS_PER_EMAIL } from "./config";
import { lookupByEmail, submitResult } from "./api/gas";
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

function LoginScreen({ onLogin, loading }) {
  const [form, setForm] = useState({
    name: "",
    birthYear: "",
    affiliation: "",
    email: "",
  });
  const manAge = calcManAge(form.birthYear);
  const canSubmit = form.name && manAge != null && form.affiliation && form.email;

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    onLogin({ ...form, age: manAge });
  }

  return (
    <div className="card">
      <h1 className="title">에니어그램 성격유형 검사</h1>
      <p className="lead">
        총 {QUESTIONS.length}개의 문항에 답하면 나의 에니어그램 유형, 힘의 중심,
        날개, 분열(스트레스)·통합(성장) 방향을 확인할 수 있습니다.
      </p>
      <p className="lead muted">
        같은 이메일로 로그인하면 과거 검사 기록을 날짜별로 다시 확인할 수
        있습니다 (최대 {MAX_RECORDS_PER_EMAIL}회까지 보관).
      </p>
      <form className="login-form" onSubmit={submit}>
        <input
          className="text-input"
          placeholder="이름"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
        />
        <div className="birthyear-field">
          <input
            className="text-input"
            type="number"
            min={MIN_BIRTH_YEAR}
            max={MAX_BIRTH_YEAR}
            placeholder="출생연도 (예: 1990)"
            value={form.birthYear}
            onChange={(e) => update("birthYear", e.target.value)}
            required
          />
          {manAge != null && (
            <p className="birthyear-hint">만 {manAge}세</p>
          )}
        </div>
        <input
          className="text-input"
          placeholder="소속"
          value={form.affiliation}
          onChange={(e) => update("affiliation", e.target.value)}
          required
        />
        <input
          className="text-input"
          type="email"
          placeholder="이메일"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          required
        />
        <button className="btn primary" type="submit" disabled={!canSubmit || loading}>
          {loading ? "확인 중..." : "로그인하고 시작하기"}
        </button>
      </form>
    </div>
  );
}

function HistoryScreen({ userInfo, records, onSelect, onStartNew }) {
  const sorted = [...records].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );

  return (
    <div className="card wide">
      <h1 className="title">{userInfo.name}님의 검사 기록</h1>
      <p className="lead muted">
        총 {records.length}개의 기록이 저장되어 있습니다. 같은 이메일당 최대{" "}
        {MAX_RECORDS_PER_EMAIL}개까지 보관되며, 초과 시 가장 오래된 기록부터
        자동으로 삭제됩니다.
      </p>

      <div className="history-list">
        {sorted.map((rec, idx) => (
          <button
            key={idx}
            type="button"
            className="history-item"
            onClick={() => onSelect(rec)}
          >
            <span className="history-date">{formatDate(rec.timestamp)}</span>
            <span className="history-type">
              {rec.type}번 · {rec.typeName}
            </span>
          </button>
        ))}
      </div>

      <button className="btn primary" onClick={onStartNew}>
        새로 검사하기
      </button>
    </div>
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
    <div className="card wide">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <p className="muted small">
        {start + 1}–{start + pageQuestions.length} / {QUESTIONS.length}문항
        &nbsp;·&nbsp;{page + 1} / {PAGES} 페이지
      </p>

      {pageQuestions.map((q) => (
        <div className="question" key={q.id}>
          <p className="question-text">
            {q.id}. {q.text}
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
        </div>
      ))}

      <div className="nav-row">
        <button className="btn" onClick={prev} disabled={page === 0}>
          이전
        </button>
        <button className="btn primary" onClick={next} disabled={!pageAnswered}>
          {page < PAGES - 1 ? "다음" : "결과 보기"}
        </button>
      </div>
    </div>
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
  const info = TYPE_INFO[result.type];
  const wingInfo = TYPE_INFO[result.wing];
  const stressInfo = TYPE_INFO[result.stress];
  const growthInfo = TYPE_INFO[result.growth];

  return (
    <div className="card wide">
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
          </p>
        )}

        <h1 className="title">
          {result.type}번 유형 · {info.name}
        </h1>
        <p className="lead center-text">{info.desc}</p>

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

        <h2 className="section-title">유형별 점수</h2>
        <ScoreChart scores={result.scores} highlightType={result.type} />

        <p className="notice-banner">
          안내: 같은 이메일로는 최대 {MAX_RECORDS_PER_EMAIL}회까지 검사 기록이
          저장되며, {MAX_RECORDS_PER_EMAIL + 1}번째 검사부터는 가장 오래된
          기록이 자동으로 삭제됩니다.
        </p>

        <EnneagramGuide />
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
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState("login");
  const [answers, setAnswers] = useState({});
  const [userInfo, setUserInfo] = useState(null);
  const [records, setRecords] = useState([]);
  const [result, setResult] = useState(null);
  const [isExisting, setIsExisting] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle");

  async function fetchRecords(email) {
    try {
      const res = await lookupByEmail(email);
      return res.records || [];
    } catch (err) {
      return [];
    }
  }

  async function handleLogin(info) {
    setUserInfo(info);
    setLoginLoading(true);
    const recs = await fetchRecords(info.email);
    setRecords(recs);
    setScreen(recs.length > 0 ? "history" : "quiz");
    setLoginLoading(false);
  }

  function handleSelectRecord(rec) {
    setResult(recordToResult(rec));
    setIsExisting(true);
    setScreen("result");
  }

  function handleStartNew() {
    setAnswers({});
    setScreen("quiz");
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
    } catch (err) {
      setSubmitStatus("error");
    }
  }

  async function handleViewHistory() {
    setLoginLoading(true);
    const recs = await fetchRecords(userInfo.email);
    setRecords(recs);
    setLoginLoading(false);
    setScreen("history");
  }

  function restart() {
    setAnswers({});
    setUserInfo(null);
    setRecords([]);
    setResult(null);
    setIsExisting(false);
    setSubmitStatus("idle");
    setScreen("login");
  }

  return (
    <div className="app-shell">
      {screen === "login" && (
        <LoginScreen onLogin={handleLogin} loading={loginLoading} />
      )}
      {screen === "history" && userInfo && (
        <HistoryScreen
          userInfo={userInfo}
          records={records}
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
    </div>
  );
}

export default App;
