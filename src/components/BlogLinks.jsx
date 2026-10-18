import { TYPE_INFO } from "../data/enneagramInfo";
import { BLOG_LINKS, blogLinkLabel } from "../data/blogLinks";
import "./BlogLinks.css";

const TYPES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function BlogLinks({ highlightTypes = [] }) {
  const highlighted = highlightTypes.map(Number);

  return (
    <section className="blog-links">
      <p className="eyebrow">INTERPRETATION</p>
      <h2 className="section-title">에니어그램 해석하기</h2>
      <p className="blog-links-lead">
        유형별 해석 글을 블로그에서 더 자세히 읽어볼 수 있습니다.
      </p>
      <ul className="blog-links-grid">
        {TYPES.map((type) => {
          const isMine = highlighted.includes(type);
          return (
            <li key={type}>
              <a
                className={`blog-link${isMine ? " is-highlighted" : ""}`}
                href={BLOG_LINKS[type]}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="blog-link-number" aria-hidden="true">
                  {type}
                </span>
                <span className="blog-link-text">
                  <span className="blog-link-title">{blogLinkLabel(type)}</span>
                  <span className="blog-link-sub">
                    {TYPE_INFO[type].name}
                    {isMine && <span className="blog-link-badge">나의 유형</span>}
                  </span>
                </span>
                <span className="blog-link-arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
