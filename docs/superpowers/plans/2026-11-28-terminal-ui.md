# 터미널 OS UI 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 블로그를 어두운 터미널 OS 테마로 바꾸고, 텍스트 스크램블·블록 커서·읽기 진행도·`clear` 페이지 전환·키보드 탐색을 넣는다.

**Architecture:** 공개 페이지는 지금처럼 서버 컴포넌트가 DynamoDB를 읽고, 효과는 `src/app/_terminal/`의 클라이언트 컴포넌트가 맡는다. 레이아웃이 `TransitionProvider`·`StatusBar`·`BlockCursor`를 감싸고, `src/app/template.tsx`의 `PageEnter`가 페이지마다 등장 애니메이션을, `TransitionLink`가 퇴장 애니메이션 후 `router.push`를 맡는다. 애니메이션은 GSAP(`useGSAP`, ScrambleTextPlugin). 테스트 가능한 로직은 `src/lib/terminal/`의 순수 함수로 뺀다.

**Tech Stack:** Next.js 15.5.29, React 19.3.1, Tailwind CSS 4, GSAP 3.15.1, @gsap/react 2.1.2, next/font/google (JetBrains Mono), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-28-terminal-ui-design.md`

**작업 위치:** `/Users/skang/workspace/blog-dynamodb`, 브랜치 `feat/dynamodb-posts` (origin/main = 5b0d32b + 로컬 6a72427 설계 문서). `/Users/skang/workspace/blog`는 쓰지 않는다.

## Global Constraints

- 색 토큰: `--bg #1c1c1c`, `--fg #e8e8e8`, `--dim #8a8a8a`, `--line #333333`, `--accent #54fcfc`, `--error #ff5f57`. 강조·선택은 반전(배경 `--fg`, 글자 `--bg`).
- 글꼴: 화면 틀은 JetBrains Mono(`next/font/google`, `variable: "--font-mono"`), 글 본문은 산세리프 `system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`, 코드 블록은 고정폭.
- 전환 시간 상한: 퇴장 ≤ 300ms(줄 간격 40ms), 등장 ≤ 500ms(줄당 120ms, 줄 간격 40ms), 합계 ≤ 800ms.
- 스크램블 기호 집합: `!<>-_\/[]{}=+*^?#01`, 지속 0.4초.
- 진행도 형식: `[` + `#`×n + `-`×(10−n) + `] ` + 정수% (n = round(ratio×10)).
- 시계: 서울 시각 `HH:mm KST`, SSR 때는 `--:-- KST`.
- `prefers-reduced-motion: reduce`이면 전환·스크램블·커서 잔상 없음(즉시 이동, 원문). 진행도·주사선은 유지.
- 블록 커서는 `(pointer: fine)`이고 동작 줄이기가 꺼져 있고 경로가 `/admin`으로 시작하지 않을 때만.
- 관리자(`/admin/**`)는 색·글꼴만, 전환·커서·스크램블 없음.
- 기존 규칙: `.prettierrc`, `npm run lint`/`format:check`/`test`/`build`/`node scripts/check-build.mjs`가 AWS env 없이 통과. 글 경로 `/posts/{slug}` 유지. GA `G-SQB18PDDPD` 유지.
- 커밋 메시지 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push는 마지막 Task에서 사용자 확인 후.

## Review Focus

1. **수정키·가운데 클릭·새 탭** — `TransitionLink`가 가로채면 새 탭 열기가 깨진다. → Task 4 `shouldIntercept` 테스트.
2. **입력 중 단축키** — 관리자 폼이나 검색창에서 `j`/`Backspace`를 누를 때 이동하면 안 된다. → Task 5 `isTypingTarget` 테스트.
3. **hydration 불일치** — 서버와 클라이언트 시각이 달라 시계·경로가 경고를 낸다. → Task 2: SSR은 `--:--`, 마운트 후 갱신.
4. **스크린 리더가 기호를 읽음** — 스크램블 중 텍스트. → Task 3: 시각용 span `aria-hidden`, 부모에 원문 `aria-label`.
5. **짧은 글의 진행도** — 본문이 화면보다 짧으면 0%로 멈춤. → Task 1 `scrollRatio` 테스트(스크롤 불가 → 1).

---

## File Structure

```
src/lib/terminal/format.ts        formatKstClock, progressBar, terminalPath, scrollRatio
src/lib/terminal/keys.ts          nextIndex, isTypingTarget
src/lib/terminal/links.ts         shouldIntercept
src/lib/terminal/*.test.ts
src/app/_terminal/gsap.ts         GSAP + 플러그인 등록 ("use client")
src/app/_terminal/motion.ts       usePrefersReducedMotion, TIMINGS 상수
src/app/_terminal/StatusBar.tsx
src/app/_terminal/Scramble.tsx
src/app/_terminal/TransitionProvider.tsx   context + TransitionLink + exit 애니메이션
src/app/_terminal/PageEnter.tsx
src/app/_terminal/ListKeyboardNav.tsx
src/app/_terminal/PostKeys.tsx
src/app/_terminal/BlockCursor.tsx
src/app/_terminal/NotFoundPath.tsx
src/app/template.tsx              PageEnter 감싸기
src/app/layout.tsx, globals.css, page.tsx, posts/[slug]/page.tsx, not-found.tsx, admin/* (스타일)
```

---

### Task 1: 테마 기반과 순수 포맷 함수

**Files:**

- Modify: `package.json`, `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/lib/terminal/format.ts`, `src/lib/terminal/format.test.ts`

**Interfaces:**

- Produces:
  - `formatKstClock(d: Date): string` → `"HH:mm KST"` (Asia/Seoul, 24시간)
  - `progressBar(ratio: number): string` → ratio를 0~1로 자른 뒤 Global Constraints 형식
  - `terminalPath(pathname: string): string` → `/` → `"~"`, `/posts/x` → `"~/posts/x"`, 끝 `/` 제거
  - `scrollRatio(scrollTop: number, scrollHeight: number, clientHeight: number): number` → 스크롤 불가(≤0)면 1, 아니면 0~1
  - CSS: Tailwind `@theme`에 색 토큰(`--color-bg` 등)과 `--font-mono`, `.scanlines` 오버레이 클래스, `.invert`(배경 fg/글자 bg)

- [ ] **Step 1: 실패하는 테스트.** `formatKstClock(new Date("2025-12-01T13:14:00Z")) === "22:14 KST"`, `"2025-12-01T15:05:00Z"` → `"00:05 KST"`. `progressBar(0) === "[----------] 0%"`, `progressBar(0.5) === "[#####-----] 50%"`, `progressBar(1.2) === "[##########] 100%"`, `progressBar(-1) === "[----------] 0%"`, `progressBar(0.04) === "[----------] 4%"`. `terminalPath("/") === "~"`, `terminalPath("/posts/minishell/") === "~/posts/minishell"`. `scrollRatio(0, 800, 800) === 1`, `scrollRatio(100, 1200, 800) === 0.25`, `scrollRatio(500, 1200, 800) === 1`.
- [ ] **Step 2:** `npm test -- src/lib/terminal` — Expected: FAIL.
- [ ] **Step 3: 구현.** `npx npm@11 i gsap@3.15.1 @gsap/react@2.1.2`(로컬 npm 10 버그). `globals.css`: 라이트/다크 `:root` 제거, `@theme`에 토큰, `body { background: var(--color-bg); color: var(--color-fg); }`, `::selection` 반전, `:focus-visible` 반전 테두리, `.scanlines`(fixed inset 0, `repeating-linear-gradient(0deg, rgb(255 255 255 / .035) 0 1px, transparent 1px 3px)`, pointer-events none, z-index 위). `layout.tsx`: JetBrains Mono `next/font/google`(`subsets: ["latin"]`, `variable: "--font-mono"`), `<html lang="ko" className={mono.variable}>`, body에 `font-mono`, highlight.js는 github-dark만 남김, `<div className="scanlines" aria-hidden />`. 본문 폭은 `max-w-3xl mx-auto px-4`.
- [ ] **Step 4:** `npm test && npm run lint && npm run format:check && npm run build && node scripts/check-build.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): 터미널 테마 토큰·글꼴·주사선, 포맷 함수`

---

### Task 2: 상태 표시줄

**Files:**

- Create: `src/app/_terminal/StatusBar.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**

- Consumes: `formatKstClock`, `progressBar`, `terminalPath`, `scrollRatio`
- Produces: `<StatusBar />` (client). 레이아웃 최상단, `position: sticky; top: 0`, 하단 `--line` 테두리, 높이 고정(약 32px, CLS 없음).

- [ ] **Step 1: 구현.** 왼쪽: `seongjin@blog ` + `terminalPath(usePathname())` (좁은 화면 말줄임). 오른쪽: `/posts/`로 시작하면 `progressBar(scrollRatio(window.scrollY, document.documentElement.scrollHeight, innerHeight))`(scroll·resize 이벤트, `requestAnimationFrame` 스로틀), 그다음 `●`(`--accent`) + 시계. 시계 초기값 `"--:-- KST"`, 마운트 후 즉시 + 다음 정각 분까지 `setTimeout` → 이후 60초 `setInterval`. 경로 변경 시 진행도 다시 계산. 관리자 경로에서도 표시(진행도 없음).
- [ ] **Step 2:** `npm run lint && npm run build` — Expected: PASS, 빌드/콘솔에 hydration 경고 없음(`npm run dev` 후 `/` 열어 브라우저 콘솔 확인은 Task 8 수동 목록).
- [ ] **Step 3: Commit** `feat(ui): 상태 표시줄(경로·시계·읽기 진행도)`

---

### Task 3: 페이지 재디자인과 스크램블

**Files:**

- Create: `src/app/_terminal/gsap.ts`, `src/app/_terminal/motion.ts`, `src/app/_terminal/Scramble.tsx`, `src/app/_terminal/NotFoundPath.tsx`
- Modify: `src/app/page.tsx`, `src/app/posts/[slug]/page.tsx`, `src/app/not-found.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/PostForm.tsx` (클래스만)

**Interfaces:**

- Produces:
  - `gsap.ts`: `"use client"`; `gsap.registerPlugin(useGSAP, ScrambleTextPlugin)`; `export { gsap, useGSAP }`.
  - `motion.ts`: `usePrefersReducedMotion(): boolean`(matchMedia 구독, SSR false), `TIMINGS = { exitStep: 0.04, exitMax: 0.3, enterLine: 0.12, enterStep: 0.04, enterMax: 0.5, scramble: 0.4 }`, `SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#01"`.
  - `<Scramble text: string; trigger: "mount" | "hover" | "active"; active?: boolean; className?: string />` — 바깥 `span aria-label={text}`, 안쪽 시각용 `span aria-hidden="true"` 초기 내용 = `text`(SSR 원문). trigger에 맞춰 ScrambleTextPlugin(`{ text, chars: SCRAMBLE_CHARS, speed: 1 }`, duration `TIMINGS.scramble`). reduced motion이면 아무것도 안 함.
  - 목록 줄과 글 페이지의 각 시각 줄에 `data-line` 속성(Task 4가 사용).
- 화면(스펙 "레이아웃" 그대로):
  - `/`: `<p data-line className="text-dim">$ ls posts --sort=date</p>` + `<ul>` 각 `<li data-line data-index={i}>`: 날짜 · 카테고리 · `<Scramble trigger="hover" text={title}/>`, 그리드 `grid-cols-[auto_auto_1fr]`(모바일은 날짜·카테고리 한 줄, 제목 아래 줄). 링크는 이 Task에서는 `next/link`(Task 4에서 교체). hover·`aria-selected` 시 `.invert`.
  - `/posts/[slug]`: `$ cat posts/<slug>.md`(dim) → `<h1 data-line tabIndex={-1}>` 안에 `<Scramble trigger="mount">` → `날짜 · 카테고리`(dim) → `<article className="prose prose-invert font-sans">`(본문 블록 전체가 `data-line` 하나) → `← cd ..` 링크(`/`).
  - 404: `NotFoundPath`(client, `usePathname`)로 `bash: <pathname>: command not found` + `← cd ~` 링크.
  - 관리자: 배경·글자·테두리·입력 색을 토큰으로, 버튼은 `border` + hover `.invert`. 효과 없음.

- [ ] **Step 1: 구현.**
- [ ] **Step 2:** `npm test && npm run lint && npm run format:check && npm run build && node scripts/check-build.mjs` — Expected: PASS.
- [ ] **Step 3: Commit** `feat(ui): 터미널 레이아웃 재디자인, 텍스트 스크램블`

---

### Task 4: `clear` 페이지 전환

**Files:**

- Create: `src/lib/terminal/links.ts`, `src/lib/terminal/links.test.ts`, `src/app/_terminal/TransitionProvider.tsx`, `src/app/_terminal/PageEnter.tsx`, `src/app/template.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/posts/[slug]/page.tsx`, `src/app/_terminal/NotFoundPath.tsx`

**Interfaces:**

- Produces:
  - `shouldIntercept(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }, href: string, currentPath: string, target?: string | null): boolean` — true는 오직: 왼쪽 버튼(0), 수정키 없음, defaultPrevented 아님, target 없음 또는 `_self`, `href`가 `/`로 시작하는 같은 사이트 경로(`//` 아님), `/admin`·`/api`로 시작하지 않음, 쿼리·해시 뺀 경로가 `currentPath`와 다름.
  - `TransitionProvider`(client, layout에서 `{children}` 감쌈): context `{ navigate(href: string): void; prefetch(href: string): void }`. `navigate`: reduced motion이면 바로 `router.push`; 아니면 `main [data-line]`을 위에서부터 GSAP로 `autoAlpha: 0`(stagger `TIMINGS.exitStep`, 전체가 `exitMax` 넘지 않도록 `stagger: { amount: min(exitStep*(n-1), exitMax) }`, duration 0) 후 `router.push(href)` + `window.scrollTo(0,0)`. 진행 중 다른 navigate가 오면 이전 타임라인 `progress(1)` 후 새 목적지.
  - `useTransitionNav()` 훅, `<TransitionLink href className children onFocus? />` — `<a href>` 렌더, onClick에서 `shouldIntercept`면 `preventDefault` + `navigate`. `onMouseEnter`/`onFocus`에 `prefetch`.
  - `PageEnter`(client, `template.tsx`에서 `{children}` 감쌈): 마운트 시 `[data-line]`를 `clipPath: "inset(0 100% 0 0)"` → `"inset(0 0% 0 0)"`, `ease: "steps(12)"`, duration `enterLine`, stagger `enterStep`(전체 `enterMax` 상한). 시작 전 `gsap.set`으로 숨긴 뒤 같은 프레임에 재생(깜빡임 없음). 끝나면 `h1[tabindex="-1"]`이 있으면 `focus({ preventScroll: true })`. reduced motion이면 아무것도 안 함. 관리자 경로에서는 아무것도 안 함.
  - 페이지의 `next/link`를 `TransitionLink`로 교체(목록 줄, `← cd ..`, 404의 `← cd ~`, 헤더 이름 링크가 있으면 그것도).

- [ ] **Step 1: 실패하는 테스트** (`links.test.ts`): 기본 클릭 `/posts/a` from `/` → true. metaKey/ctrlKey/shiftKey/altKey 각각 → false. button 1 → false. defaultPrevented → false. target `"_blank"` → false. `https://x.com/a` → false. `//evil.com` → false. `/admin` → false. `/api/auth/login` → false. `/posts/a#h` from `/posts/a` → false. `/?x=1` from `/` → false.
- [ ] **Step 2:** `npm test -- src/lib/terminal/links` — Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** `npm test && npm run lint && npm run format:check && npm run build && node scripts/check-build.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): clear 페이지 전환(퇴장 지우기·등장 타이핑)`

---

### Task 5: 키보드 탐색

**Files:**

- Create: `src/lib/terminal/keys.ts`, `src/lib/terminal/keys.test.ts`, `src/app/_terminal/ListKeyboardNav.tsx`, `src/app/_terminal/PostKeys.tsx`
- Modify: `src/app/page.tsx`, `src/app/posts/[slug]/page.tsx`, `src/app/_terminal/Scramble.tsx` (trigger `"active"` 사용)

**Interfaces:**

- Consumes: `useTransitionNav`
- Produces:
  - `nextIndex(current: number | null, key: string, length: number): number | null` — length 0 → null. `j`/`ArrowDown`: null → 0, 그 외 `min(current+1, length-1)`. `k`/`ArrowUp`: null → 0, 그 외 `max(current-1, 0)`. 다른 키 → current.
  - `isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null): boolean` — `INPUT`, `TEXTAREA`, `SELECT`, contentEditable → true.
  - `ListKeyboardNav`(client): 목록 `ul`의 자식 `li[data-index]`를 대상으로 상태 `selected`. keydown(window): `isTypingTarget(document.activeElement)` 또는 수정키면 무시; `nextIndex`로 갱신, `aria-selected`·`.invert` 반영, `scrollIntoView({ block: "nearest" })`; `Enter`이고 선택이 있으면 그 줄 링크 href로 `navigate`. 선택된 줄의 `Scramble trigger="active"`가 재생. 마우스 hover는 선택을 바꾸지 않음(hover 스타일만).
  - 하단 키 안내 `[J][K] 이동  [↵] 열기` — `(pointer: fine)`일 때만(`hidden pointer-fine:flex` 등 CSS 미디어 쿼리).
  - `PostKeys`(client, 글 페이지): `Escape` 또는 `Backspace`(타이핑 대상 아님, 수정키 없음) → `navigate("/")`. 하단 안내 `[esc] 목록으로`.

- [ ] **Step 1: 실패하는 테스트.** `nextIndex(null,"j",6)===0`, `nextIndex(5,"j",6)===5`, `nextIndex(2,"ArrowDown",6)===3`, `nextIndex(0,"k",6)===0`, `nextIndex(null,"k",6)===0`, `nextIndex(3,"x",6)===3`, `nextIndex(null,"j",0)===null`. `isTypingTarget({tagName:"INPUT"})===true`, `{tagName:"TEXTAREA"}` true, `{tagName:"DIV",isContentEditable:true}` true, `{tagName:"A"}` false, `null` false.
- [ ] **Step 2:** `npm test -- src/lib/terminal/keys` — Expected: FAIL.
- [ ] **Step 3: 구현.**
- [ ] **Step 4:** `npm test && npm run lint && npm run format:check && npm run build` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(ui): 목록 키보드 탐색(J/K/Enter)과 글 Esc 복귀`

---

### Task 6: 블록 커서

**Files:**

- Create: `src/app/_terminal/BlockCursor.tsx`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`

**Interfaces:**

- Produces: `<BlockCursor />`(client, layout 안). 조건(Global Constraints) 만족 시에만 렌더 + `document.documentElement.classList.add("block-cursor")`(해제 시 제거). CSS `.block-cursor, .block-cursor * { cursor: none; }` 단 `input, textarea, select, [contenteditable]`은 제외. 블록 10×18px `--fg` + `mix-blend-mode: difference`, 잔상 블록 `--accent` opacity .35. `gsap.quickTo` x/y: 블록 duration 0.08, 잔상 0.25. `pointermove`만 사용(터치 무시), 창 밖으로 나가면 숨김. `position: fixed; pointer-events: none; z-index` 최상위. 경로가 `/admin`으로 바뀌면 해제.

- [ ] **Step 1: 구현.**
- [ ] **Step 2:** `npm run lint && npm run build` — Expected: PASS.
- [ ] **Step 3: Commit** `feat(ui): 블록 커서와 잔상`

---

### Task 7: 로컬 확인과 배포

- [ ] **Step 1:** 전체 검사: `npm run lint && npm run format:check && npm test && npm run build && node scripts/check-build.mjs` — Expected: 모두 PASS.
- [ ] **Step 2:** 로컬 실행: `.env.local`(이미 있음, 운영 리소스, `BLOG_SITE_URL=http://localhost:3001`)로 `AWS_PROFILE=seongjin npx next dev -p 3001`. `curl`로 `/` 200, `/posts/browser-rendering` 200, `/posts/nope` 404, HTML 안에 글 제목 원문이 들어 있는지(SSR) 확인.
- [ ] **Step 3: 수동 확인 목록**(사용자에게 브라우저로 요청): 목록 hover 스크램블 · J/K/Enter · 글 열 때 `clear` 전환 ≤ 0.8초 · Esc로 복귀 · 진행도 0→100% · 시계 · ⌘클릭 새 탭 · 뒤로 가기 · 블록 커서(데스크톱) · macOS "동작 줄이기" 켜고 전환/스크램블 없음 · 휴대폰에서 커서 없음 · 관리자 화면 색만 바뀜 · 콘솔에 hydration 경고 없음.
- [ ] **Step 4:** 사용자 확인 후 `git push origin feat/dynamodb-posts:main` → CI·Amplify 빌드 성공 확인 → `https://blog.skang.dev`에서 Step 3 일부 재확인.
