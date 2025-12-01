---
title: "브라우저가 html을 렌더링 하는 과정"
date: "2025-12-01"
category: "WEB"
---

# 목차

- 배경
- 브라우저 렌더링 과정 (reflow, repaint)
  - DOM트리 생성
  - CSSOM트리 생성
  - Render Tree 생성
  - Layout (reflow)
  - Paint (repaint)
  - Composite
- 개발자 도구로 렌더링 과정 보기
- 마치며
- reference

---

# 배경

브라우저가 html, css를 화면에 그리는 과정과 실제 흐름을 개발자도구로 확인하는 과정을 담았습니다.

개발을 하다보면 “어떤 기능이 성능에 좋다” 라는 얘기를 많이 듣습니다. 왜 성능에 좋은지 이해하기 위해선 브라우저의 렌더링 원리를 알아야했습니다. 렌더링 과정속에서 비용이 많이드는 작업, 적게드는 작업, 또는 GPU로 최적화 하는 작업등. 이 흐름의 이해를 통해 더 깊이있게 갈 수 있음을 깨닫고 기록하게 되었습니다.

---

# 화면이 그려지는 과정

1. HTML을 기반으로 DOM트리 생성
2. CSS를 기반으로 CSSOM트리 생성
3. DOM과 CSSOM을 합쳐 Render Tree 생성
4. Layout단계, Render Tree를 기반으로 각 요소의 위치와 크기 계산
5. Paint단계, Layout에서 계산된 크기를 바탕으로 Paint구성
6. Composite단계, Layout과 Paint에서 계산된 값들을 합치고 화면에 보여줌

## DOM트리 생성

브라우저가 서버에 요청을 보내면 브라우저는 바이트스트림을 받습니다. 서버가 헤더에 적어준 인코딩정보에 따라 바이트를 문자로 번역합니다. 규칙에따라 번역하면 아래 html과 같은 텍스트로 구성이 됩니다. link되어있는 css가 있다면 css도 요청해 동일한 과정으로 해석해 css파일을 구성합니다. 파서는 각 태그의 부모 자식 관계를 구분해 트리를 생성합니다.

1. 바이트 스트림 해석
   - `3C 64 69 76 3E 68 65 6C 6C 6F 3C 2F 64 69 76 3E` 와 같은 데이터를 받는다.
   - UTF-8인코딩 방식에 따라 해석하면 `<div>hello</div>`가 나옵니다.
2. 토큰화
   - `<div>, <li>, <span>…`등의 html태그 요소들을 토큰화 합니다.
   - https://html.spec.whatwg.org/multipage/parsing.html#tokenization 요소별 토큰화 방식이 지정되어있습니다.

3. 노드생성
   - 토큰을 브라우저가 이해할 수 있는 노드객체로 변환 합니다.
4. 트리생성
   - 노드객체를 바탕으로 부모 자식관계가 있는 DOM트리를 구성한다.

```html
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <link href="style.css" rel="stylesheet" />
    <title>Critical Path</title>
  </head>
  <body>
    <p>Hello <span>web performance</span> students!</p>
    <div><img src="awesome-photo.jpg" /></div>
  </body>
</html>
```

![출처: [web.dev](https://web.dev/articles/critical-rendering-path/render-tree-construction?hl=ko)](/images/posts/browser-rendering/dom.png)

출처: [web.dev](https://web.dev/articles/critical-rendering-path/render-tree-construction?hl=ko)

## CSSOM트리 생성

html의 과정과 동일하게 바이트스트림을 해석→토큰화→파싱→노드생성 을 거쳐 CSSOM트리를 구성한다.

```css
body {
  font-size: 16px;
}

p {
  font-weight: bold;
}

span {
  color: red;
}

p span {
  display: none;
}

img {
  float: right;
}
```

![출처: [web.dev](https://web.dev/articles/critical-rendering-path/render-tree-construction?hl=ko)](/images/posts/browser-rendering/cssom.png)

출처: [web.dev](https://web.dev/articles/critical-rendering-path/render-tree-construction?hl=ko)

## 렌더트리 생성

dom트리와, cssom트리를 합치는 단계다.

- 이 단계에서는 display:none처럼 화면에 보여지지 않는 요소는 제외하고 트리를 생성한다. visible: hidden은 보이지 않지만 공간을 차지하기에 렌더트리에 포함된다. 브라우저는 dom트리의 루트 노드를 읽고, 대응되는 css객체가 있을 때 속성에 추가하고 하위속성으로 상속이 되는 속성은 하위에 상속된다. (Recalculation Style)

![출처: [web.dev](https://web.dev/articles/critical-rendering-path/render-tree-construction?hl=ko)](/images/posts/browser-rendering/renderTree.png)

출처: [web.dev](https://web.dev/articles/critical-rendering-path/render-tree-construction?hl=ko)

## Layout (reflow)

엘리먼트들이 뷰포트기준 화면 어디에 어떤 모양으로 배치될지를 계산하는 단계다.

- 렌더트리의 각 요소의 위치, 크기를 나타내는 값들을 계산한다. 계산은 viewport를 기준으로 %, vh, em등의 비율을 px값으로 계산 후 값을 각 객체에 저장한다.

```jsx
{
  tagName: 'DIV',
  layout: {
    x: 100.5,      // 뷰포트 기준 x 좌표 (px)
    y: 250.0,      // 뷰포트 기준 y 좌표 (px)
    width: 500.0,  // 컨텐츠 너비 (px)
    height: 300.0, // 컨텐츠 높이 (px)
    marginTop: 20.0,
    paddingLeft: 15.0,
    borderWidth: 1.0,
    // ... 등등 모든 기하학적 정보가 px 단위로 저장됨
  }
}
```

## Paint (repaint)

레이아웃트리의 각 요소에 어떤 색상을 채워야할지에 대한 명령을 구성하고 컴포지스터 스레드로 넘기는 단계다.

1. 메인스레드에서 페인트 기록(paint record)을 생성하기 위해 레이아웃 트리를 순회한다.
2. 페인트 기록은 “배경먼저, 다음 텍스트, 그다음 직사각형” 등 페인트 과정을 기록한 것이다. (canvas태그를 사용해 도형과 텍스트를 생성할 때 이와 비슷한 과정을 거치는데 과정이 다소 비슷하다.)
3. Layerize: 그려야할 위치, 색상이 있는 객체 투명한 객체 등을 모두 구분해 레이어트리를 구성한다.
4. 레이어 트리가 생성되고 페인트 순서가 결정되면 메인 스레드가 해당 정보를 컴포지스터 스레드에 넘긴다.(commit) 메인스레드는 작업이 끝나 휴식 상태에 들어간다.

## Composite

어디에 그려야할지, 어떤 순서로 페인트 해야할지에 대한 정보를 바탕으로 화면에 그리는 단계다. 현재 과정은 컴포지스터 스레드에서 동작중이다.

1. 컴포지스터는 각 `레이어를` 래스터화(정보를 화면의 픽셀로 변환하는 작업)한다.
2. 어떤 레이어는 페이지의 전체길이만큼 클 수 있어 타일 형태로 나눠 각 타일을 래스터 스레드로 보낸다.
3. 래스터 스래드는 각 `타일을` 래스터화 해 GPU메모리에 저장한다.
4. 컴포지스터 스레드가 합성프레임을 생성하기 위해 타일의 정보를 모은다. 이 타일의 정보를 “드로 쿼드(draw quads)”라고 부른다.
5. 드로쿼드는 gpu의 viz로 전달되어 최종적으로 화면에 ui가 보이게된다.

---

# 개발자도구로 렌더링 과정 보기

시크릿 탭 환경에서 performance(cpu 6x slowdown설정) 후 진행했습니다. 아래 예제는 reflow, repaint, composite단계를 각각 트리거 하는 예제입니다. performance탭에서 main thread를 확인하며 이론적인 배경이 실제로 어떻게 동작하는지 눈으로 확인하기 위해 테스트하게 되었습니다.

- reflow, repaint, composite 확인용 html코드

```html
<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <title>Rendering Pipeline Test</title>
    <style>
      body {
        display: flex;
        justify-content: space-around;
        align-items: center;
        height: 100vh;
        margin: 0;
        font-family: sans-serif;
        background: #f4f4f4;
      }

      .container {
        text-align: center;
      }

      .box {
        width: 150px;
        height: 150px;
        margin: 20px auto;
        background-color: #ddd;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        cursor: pointer;
      }

      /* 1. Reflow (Layout) 유발 */
      /* 너비/높이/마진 등 기하학적 속성 변경 */
      .reflow-box:hover {
        width: 200px;
        height: 200px;
        background-color: #ff9a9e; /* 시각적 확인용 */
      }

      /* 2. Repaint (Paint) 유발 */
      /* 크기는 그대로, 색상/그림자 등만 변경 */
      .repaint-box:hover {
        background-color: #84fab0;
        box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
        color: white;
      }

      /* 3. Composite (GPU) 유발 */
      /* transform, opacity 사용 + will-change로 레이어 분리 힌트 */
      .composite-box {
        /* 미리 레이어로 분리해두어야 최적화 효과가 확실함 */
        will-change: transform;
      }
      .composite-box:hover {
        transform: scale(1.4) rotate(10deg);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h3>1. Layout (Reflow)</h3>
      <p>width / height 변경</p>
      <div class="box reflow-box">비용: 높음 😡</div>
    </div>

    <div class="container">
      <h3>2. Paint (Repaint)</h3>
      <p>color / shadow 변경</p>
      <div class="box repaint-box">비용: 중간 😐</div>
    </div>

    <div class="container">
      <h3>3. Composite</h3>
      <p>transform 변경</p>
      <div class="box composite-box">비용: 낮음 😎</div>
    </div>
  </body>
</html>
```

🟨 **Scripting (스크립트 실행)**
자바스크립트 엔진(V8)이 돌아가는 시간입니다.

- `Evaluate Script` (스크립트 읽고 실행)
- `Function Call` (함수 호출)
- `Event` (이벤트 리스너 실행)
- `Major GC` / `Minor GC` (가비지 컬렉션)

**🟪 Rendering (구조 및 기하학 계산)**

- `Recalculate Style` (렌더 트리/스타일 계산)
- `Layout` (위치/크기 계산)
- `Pre-Paint` (transform, clip, effect, scroll등 gpu에서 처리할 속성트리 구성)
- `Hit Test` (클릭 위치 계산해 레이아웃트리, 속성트리의 노드 위치를 계산해 이벤트 발생여부 결정)
- `Layerise` (레이어 트리)

**🟩 Painting (그리기 및 전송)**

픽셀을 채울 준비를 하고 데이터를 넘기는 과정입니다.

- `Paint` (그리기 명령어/Artifacts 생성)
- `Commit` (메인 스레드→컴포지터 스레드로 데이터 전송)
- `Composite Layers` (합성 명령)

### 1. width/height 변경 (reflow 발생 확인)

![스크린샷 2025-12-01 오후 3.14.32.png](/images/posts/browser-rendering/reflow.png)

- 메인 스레드 흐름
  - `Recalculate Style` → `Layout` → `Pre-paint` → `Paint` → `Layerize` → `Commit`
  - Layer Tree 변경사항: Layout→Layerize순이 었지만 업데이트 후 Paint→Layerize로 순서로 변경되었습니다.
- Pre-paint는 Hit test계산하기 위해 호출되고, Layout이후 호출이 됩니다.
- 스레드 & 프로세스 간 데이터 이동 (Hand-off)
  1. Main Thread: `Commit`으로 데이터(트리)를 Compositor에게 넘김.
  2. Compositor Thread: 타일링 후 Raster Thread에게 넘김.
  3. Raster Thread: 픽셀화(Rasterize) 후 GPU 메모리에 저장.
  4. Compositor Thread: 저장된 타일 위치 정보(Draw Quads)를 모아서 Viz에게 보냄.
  5. Viz (GPU Process): 최종 화면 그리기.

### 2. background-color변경 (repaint 발생 확인)

![스크린샷 2025-12-01 오후 3.43.52.png](/images/posts/browser-rendering/repaint.png)

- 메인 스레드 흐름
  - `Recalculate Style` → `Pre-paint` → `Paint` → `Layerize` → `Commit`
  - Layout단계는 발생하지 않고 Paint과정만 발생

### 3. Transform 변경 (composite 발생 확인)

![스크린샷 2025-12-01 오후 3.53.37.png](/images/posts/browser-rendering/composite.png)

- 메인 스레드 흐름
  - `Recalculate Style` → `Pre-paint` → `Layerize` → `Commit`
  - Layout, Paint단계는 발생하지 않고 데이터를 Compositor에게 넘김

---

# 끝내며

테스트를 통해 메인 스레드 흐름을 줄이는 것이 최적화의 전략이라는 것을 알 수 있었습니다. 그렇지만 무조건 reflow와 repaint를 사용하지 않는 것 보다 상황에 맞게 선택하는 것이 좋을 것 같습니다.

- 움직이는 애니메이션을 구현한다면 position보다는 transform을 사용
- js에서 스타일을 적용하면 reflow가 발생한다. css에 미리 정의해놓은 속성을 요소에 추가하는 방식은 여러 속성을 정의해도 한번만 reflow가 발생한다.

---

# reference

- https://developer.mozilla.org/ko/docs/Web/Performance/Guides/How_browsers_work
- https://d2.naver.com/helloworld/5237120
- https://developer.chrome.com/docs/chromium/blinkng?hl=ko
- https://web.dev/articles/critical-rendering-path/constructing-the-object-model?hl=ko
