import {
  INTEGRATION_DISINTEGRATION_INTRO,
  GROWTH_TABLE,
  CENTER_DETAILS,
  TYPE_LONG_DESC,
  STRENGTHS_WEAKNESSES,
  WING_INTRO,
  WING_DETAILS,
} from "../data/enneagramDetails";
import "./EnneagramGuide.css";

const TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function IntegrationDisintegrationSection({ highlightType }) {
  return (
    <section className="guide-section">
      <h3 className="guide-heading">1. 에니어그램의 분열과 통합</h3>
      {INTEGRATION_DISINTEGRATION_INTRO.map((p, i) => (
        <p className="guide-paragraph" key={i}>
          {p}
        </p>
      ))}
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th>유형</th>
              <th>심리적기능</th>
              <th>회피</th>
              <th>함정</th>
              <th>약점(분열)</th>
              <th>강점(통합)</th>
              <th>성장 전략</th>
              <th>좌우명</th>
            </tr>
          </thead>
          <tbody>
            {TYPES.map((t) => {
              const g = GROWTH_TABLE[t];
              return (
                <tr key={t} className={t === highlightType ? "is-highlighted" : undefined}>
                  <td className="guide-table-typecell">
                    {t}번 · {g.name}
                  </td>
                  <td>{g.psychFunction}</td>
                  <td>{g.avoidance}</td>
                  <td>{g.trap}</td>
                  <td>{g.weakness}</td>
                  <td>{g.strength}</td>
                  <td>
                    <ul className="guide-inline-list">
                      {g.strategies.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </td>
                  <td>{g.motto}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CentersSection() {
  const rows = [
    ["설명", "desc"],
    ["감정", "emotion"],
    ["관심", "interest"],
    ["상황파악", "situationAwareness"],
    ["의사결정", "decision"],
    ["판단양식", "judgment"],
    ["신체발달", "bodyDevelopment"],
    ["지능", "intelligence"],
  ];
  return (
    <section className="guide-section">
      <h3 className="guide-heading">2. 에니어그램 힘의 중심</h3>
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th>구분</th>
              {CENTER_DETAILS.map((c) => (
                <th key={c.key}>
                  {c.key} ({c.types.join(", ")}유형)
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, key]) => (
              <tr key={key}>
                <td className="guide-table-typecell">{label}</td>
                {CENTER_DETAILS.map((c) => (
                  <td key={c.key}>{c[key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TypeDescriptionsSection({ highlightType }) {
  return (
    <section className="guide-section">
      <h3 className="guide-heading">3. 9가지 성격유형별 설명</h3>
      <div className="guide-type-grid">
        {TYPES.map((t) => {
          const d = TYPE_LONG_DESC[t];
          return (
            <div
              className={`guide-type-card${t === highlightType ? " is-highlighted" : ""}`}
              key={t}
            >
              <p className="guide-type-card-title">
                {t}. {GROWTH_TABLE[t].name}
              </p>
              <p className="guide-type-card-tagline">{d.tagline}</p>
              <p className="guide-type-card-body">{d.body}</p>
              <p className="guide-type-card-caution">{d.caution}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StrengthsWeaknessesSection({ highlightType }) {
  return (
    <section className="guide-section">
      <h3 className="guide-heading">4. 에니어그램 성격유형별 강점과 약점</h3>
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th>힘의 중심</th>
              <th>유형</th>
              <th>강점</th>
              <th>약점</th>
            </tr>
          </thead>
          <tbody>
            {TYPES.map((t) => {
              const sw = STRENGTHS_WEAKNESSES[t];
              return (
                <tr key={t} className={t === highlightType ? "is-highlighted" : undefined}>
                  <td>{sw.center}</td>
                  <td className="guide-table-typecell">
                    {t}번 · {GROWTH_TABLE[t].name}
                  </td>
                  <td>{sw.strengths.join(", ")}</td>
                  <td>{sw.weaknesses.join(", ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WingsSection({ highlightType }) {
  return (
    <section className="guide-section">
      <h3 className="guide-heading">5. 에니어그램의 날개(Wing)</h3>
      {WING_INTRO.map((p, i) => (
        <p className="guide-paragraph" key={i}>
          {p}
        </p>
      ))}
      <div className="guide-table-wrap">
        <table className="guide-table">
          <thead>
            <tr>
              <th>기본유형</th>
              <th>날개</th>
              <th>별칭</th>
              <th>특징</th>
            </tr>
          </thead>
          <tbody>
            {TYPES.map((t) =>
              WING_DETAILS[t].map((w, i) => (
                <tr key={w.code} className={t === highlightType ? "is-highlighted" : undefined}>
                  {i === 0 && (
                    <td className="guide-table-typecell" rowSpan={2}>
                      {t}번 · {GROWTH_TABLE[t].name}
                    </td>
                  )}
                  <td>{w.code}</td>
                  <td>{w.nickname}</td>
                  <td>
                    <ul className="guide-inline-list">
                      {w.points.map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function EnneagramGuide({ highlightType }) {
  return (
    <details className="guide-details" open>
      <summary className="guide-summary">에니어그램 상세 가이드 (KEPTI)</summary>
      <div className="guide-body">
        <IntegrationDisintegrationSection highlightType={highlightType} />
        <CentersSection />
        <TypeDescriptionsSection highlightType={highlightType} />
        <StrengthsWeaknessesSection highlightType={highlightType} />
        <WingsSection highlightType={highlightType} />
      </div>
    </details>
  );
}
