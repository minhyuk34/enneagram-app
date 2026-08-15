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
            <input
              className="text-input"
              placeholder="소속을 입력해 주세요"
              value={form.affiliation}
              onChange={(e) => update("affiliation", e.target.value)}
              required
            />
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
        <button className="btn primary" type="submit" disabled={!canSubmit || loading}>
          <span>{loading ? "기록을 확인하는 중" : "검사 시작하기"}</span>
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

function HistoryScreen({ userInfo, records, onSelect, onStartNew }) {
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
            <span className="history-arrow" aria-hidden="true">↗</span>
          </button>
        ))}
      </div>

      <button className="btn primary" onClick={onStartNew}>
        <span>새로 검사하기</span>
        <span aria-hidden="true">→</span>
      </button>
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
          </p>
        )}

        <div className="result-hero">
          <div className="result-type-number" aria-hidden="true">{result.type}</div>
          <div className="result-hero-copy">
            <p className="eyebrow">YOUR ENNEAGRAM PORTRAIT</p>
            <h1 className="title">{result.type}번 유형 · {info.name}</h1>
            <p className="lead">{info.desc}</p>
          </div>
        </div>

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
    </section>
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
    } catch {
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
    } catch {
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
      </main>
      <footer className="site-footer">
        <span>ENNEAGRAM PERSONALITY PROFILE</span>
        <span>SEOUL · {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

export default App;
