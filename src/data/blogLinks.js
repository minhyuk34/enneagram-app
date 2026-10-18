// 유형별 해석 블로그 포스팅.
// 결과 화면(BlogLinks)과 결과 메일(gas/Code.gs 의 ENNEAGRAM_BLOG_LINKS)에서 같은 목록을 쓴다.
// 주소를 바꾸면 gas/Code.gs 의 목록도 함께 바꾸고 Apps Script를 다시 배포해야 한다.
export const BLOG_LINKS = {
  1: "https://blog.naver.com/jwing34/224441885409",
  2: "https://blog.naver.com/jwing34/224437151969",
  3: "https://blog.naver.com/jwing34/224438087470",
  4: "https://blog.naver.com/jwing34/224438615272",
  5: "https://blog.naver.com/jwing34/224439323488",
  6: "https://blog.naver.com/jwing34/224439338053",
  7: "https://blog.naver.com/jwing34/224439904020",
  8: "https://blog.naver.com/jwing34/224439914612",
  9: "https://blog.naver.com/jwing34/224439923212",
};

export function blogLinkLabel(type) {
  return `에니어그램 ${type}번 해석하기`;
}
