import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown", () => {
  it("renders GFM tables", async () => {
    const html = await renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
  });

  it("converts single newlines to <br>", async () => {
    expect(await renderMarkdown("줄1\n줄2")).toContain("<br>");
  });

  it("keeps raw HTML", async () => {
    const html = await renderMarkdown('<div class="x">hi</div>');
    expect(html).toContain('<div class="x">hi</div>');
  });

  it("highlights code blocks", async () => {
    const html = await renderMarkdown("```c\nint main(){}\n```");
    expect(html).toContain('class="hljs language-c"');
  });

  it("renders headings from a realistic post body", async () => {
    const md = `컴퓨터는 데이터를 2진수로 저장한다.

## 정수를 2진수로

- 십진수 **42**를 2로 나눕니다.
  - \`42 ÷ 2 = 21\` --- 나머지 **0**
`;
    expect(await renderMarkdown(md)).toContain("<h2>");
  });
});
