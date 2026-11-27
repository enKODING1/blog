// Pure helpers, safe to import from client code (no AWS / env).

export function imageMarkdown(fileName: string, markdownPath: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const alt = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]/g, "")
    .replace(/[\\[\]]/g, "\\$&")
    .trim();
  return `![${alt || "image"}](${markdownPath})`;
}

export function uploadPlaceholder(id: string): string {
  return `![업로드 중 ${id}]()`;
}

export function insertAt(content: string, index: number, text: string): string {
  return content.slice(0, index) + text + content.slice(index);
}

export function replacePlaceholder(
  content: string,
  placeholder: string,
  replacement: string
): string {
  const i = content.indexOf(placeholder);
  if (i < 0) return content;
  return (
    content.slice(0, i) + replacement + content.slice(i + placeholder.length)
  );
}

export function removePlaceholder(
  content: string,
  placeholder: string
): string {
  return replacePlaceholder(content, placeholder, "");
}
