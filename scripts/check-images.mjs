// posts/*.md 가 참조하는 로컬 파일(/images/... 등)이 public/ 에 실제로 있는지 검사한다.
// 코드 블록 안의 예시(<img src="...">)는 건너뛴다.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const POSTS_DIR = "posts";
const PUBLIC_DIR = "public";

// ![alt](/path), [text](/path.ext), src="/path", href="/path.ext"
const REF_PATTERNS = [
  /\]\((\/[^)\s]+)\)/g,
  /\b(?:src|href)=["'](\/[^"']+)["']/g,
];

const stripCodeBlocks = md =>
  md.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");

const missing = [];
let checked = 0;

for (const file of readdirSync(POSTS_DIR).filter(f => f.endsWith(".md"))) {
  const body = stripCodeBlocks(
    readFileSync(path.join(POSTS_DIR, file), "utf8")
  );

  for (const pattern of REF_PATTERNS) {
    for (const [, raw] of body.matchAll(pattern)) {
      const ref = decodeURI(raw.split(/[?#]/)[0]);
      // 확장자가 없는 경로(/posts/foo 같은 페이지 링크)는 파일이 아니므로 제외
      if (!path.extname(ref)) continue;
      checked++;
      if (!existsSync(path.join(PUBLIC_DIR, ref))) {
        missing.push(`${POSTS_DIR}/${file}: ${raw}`);
      }
    }
  }
}

if (missing.length) {
  console.error(
    `::error::public/ 에 없는 파일을 참조하는 글이 있습니다 (${missing.length}개)`
  );
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}

console.log(`OK: 로컬 파일 참조 ${checked}개 모두 public/ 에 있음`);
