import { TYPE_INFO } from "../data/enneagramInfo";
import "./ScoreChart.css";

const W = 760;
const H = 440;
const MARGIN = { top: 30, right: 96, bottom: 64, left: 46 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;
const MAX_Y = 45;
const Y_TICKS = [0, 9, 18, 27, 36, 45];
const BANDS = [
  { from: 0, to: 9, label: "매우낮음" },
  { from: 9, to: 18, label: "평균이하" },
  { from: 18, to: 27, label: "평균" },
  { from: 27, to: 36, label: "평균이상" },
  { from: 36, to: 45, label: "매우높음" },
];

function xPos(index) {
  return MARGIN.left + (PLOT_W / 8) * index;
}
function yPos(score) {
  return MARGIN.top + PLOT_H - (score / MAX_Y) * PLOT_H;
}

export default function ScoreChart({ scores, highlightType }) {
  const points = Array.from({ length: 9 }, (_, i) => {
    const type = i + 1;
    const score = Number(scores[type]) || 0;
    return { type, score, x: xPos(i), y: yPos(score) };
  });
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="score-chart-wrap">
      <p className="score-chart-scroll-hint">← 옆으로 스크롤해서 전체 그래프 보기 →</p>
      <svg
        className="score-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="유형별 점수 차트"
      >
        <defs>
          <pattern id="graphPaper" width="14.5" height="14.5" patternUnits="userSpaceOnUse">
            <path d="M 14.5 0 L 0 0 0 14.5" fill="none" stroke="#cfe3f2" strokeWidth="1" />
          </pattern>
        </defs>

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="url(#graphPaper)"
          stroke="#8fb8d8"
        />

        {/* 세로 그리드 (유형 구분선) */}
        {points.map((p) => (
          <line
            key={`v-${p.type}`}
            x1={p.x}
            y1={MARGIN.top}
            x2={p.x}
            y2={MARGIN.top + PLOT_H}
            stroke="#8fb8d8"
            strokeWidth={1}
          />
        ))}

        {/* 가로 밴드 구분선 + 좌측 눈금 */}
        {Y_TICKS.map((t) => (
          <g key={`h-${t}`}>
            <line
              x1={MARGIN.left}
              y1={yPos(t)}
              x2={MARGIN.left + PLOT_W}
              y2={yPos(t)}
              stroke="#5b8bb0"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 10}
              y={yPos(t) + 4}
              textAnchor="end"
              className="score-chart-tick"
            >
              {t}
            </text>
          </g>
        ))}

        {/* 우측 밴드 라벨 */}
        {BANDS.map((b) => (
          <text
            key={b.label}
            x={MARGIN.left + PLOT_W + 12}
            y={(yPos(b.from) + yPos(b.to)) / 2 + 4}
            className="score-chart-band-label"
          >
            {b.label}
          </text>
        ))}

        {/* 데이터 라인 */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke="#1b1b1b"
          strokeWidth={2}
        />
        {points.map((p) => (
          <circle
            key={`pt-${p.type}`}
            cx={p.x}
            cy={p.y}
            r={p.type === highlightType ? 6 : 4}
            fill={p.type === highlightType ? "#aa3bff" : "#1b1b1b"}
          />
        ))}

        {/* X축 라벨 (유형 번호 + 이름) */}
        <text
          x={MARGIN.left}
          y={16}
          className="score-chart-axis-title"
        >
          유형
        </text>
        {points.map((p) => (
          <g key={`x-${p.type}`}>
            <text
              x={p.x}
              y={MARGIN.top + PLOT_H + 20}
              textAnchor="middle"
              className="score-chart-x-number"
            >
              {p.type}
            </text>
            <text
              x={p.x}
              y={MARGIN.top + PLOT_H + 38}
              textAnchor="middle"
              className="score-chart-x-name"
            >
              {TYPE_INFO[p.type].name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
