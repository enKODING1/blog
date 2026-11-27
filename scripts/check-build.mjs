// `aws s3 sync --delete` 전에 out/ 이 정상인지 확인한다.
// 빌드가 비정상이면 S3 의 기존 사이트가 지워지므로, 여기서 실패시켜 배포를 막는다.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const OUT = "out";
const errors = [];

for (const required of ["index.html", "404.html", "_next/static"]) {
  if (!existsSync(path.join(OUT, required)))
    errors.push(`${OUT}/${required} 가 없음`);
}

const slugs = (dir, ext) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter(f => f.endsWith(ext))
        .map(f => f.slice(0, -ext.length))
    : [];

const posts = slugs("posts", ".md");
const pages = new Set(slugs(path.join(OUT, "posts"), ".html"));

if (posts.length === 0) errors.push("posts/*.md 가 하나도 없음");
for (const slug of posts) {
  if (!pages.has(slug))
    errors.push(`${OUT}/posts/${slug}.html 가 생성되지 않음`);
}

if (errors.length) {
  console.error("::error::빌드 결과가 비정상이라 배포를 중단합니다");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`OK: index.html, 404.html, 글 ${posts.length}개 모두 생성됨`);
