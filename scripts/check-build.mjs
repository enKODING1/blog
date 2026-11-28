// 빌드 결과(.next)가 정상인지 확인한다. 실패하면 배포 전에 CI 에서 막힌다.
import { existsSync, readFileSync } from "node:fs";

const NEXT = ".next";
// 라우트가 생길 때마다 추가한다
const REQUIRED_ROUTES = [
  "/",
  "/posts/[slug]",
  "/admin",
  "/admin/new",
  "/admin/[slug]/edit",
  "/api/auth/login",
  "/api/auth/callback",
  "/api/auth/logout",
];
const errors = [];

for (const required of ["BUILD_ID", "required-server-files.json"]) {
  if (!existsSync(`${NEXT}/${required}`))
    errors.push(`${NEXT}/${required} 가 없음`);
}

const manifestPath = `${NEXT}/app-path-routes-manifest.json`;
if (!existsSync(manifestPath)) {
  errors.push(`${manifestPath} 가 없음`);
} else {
  const routes = new Set(
    Object.values(JSON.parse(readFileSync(manifestPath, "utf8")))
  );
  for (const route of REQUIRED_ROUTES) {
    if (!routes.has(route)) errors.push(`라우트 ${route} 가 빌드되지 않음`);
  }
}

if (errors.length) {
  console.error("::error::빌드 결과가 비정상입니다");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`OK: 라우트 ${REQUIRED_ROUTES.join(", ")} 포함 빌드 정상`);
