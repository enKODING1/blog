"use client";

import { useState, useTransition } from "react";
import { previewMarkdown, removePost, savePost } from "./actions";
import type { PostInput } from "@/lib/posts/types";

type Props = { mode: "create" | "update"; initial?: PostInput };

const today = () => new Date().toISOString().slice(0, 10);

const inputClass = "w-full rounded border px-2 py-1";

export default function PostForm({ mode, initial }: Props) {
  const [form, setForm] = useState<PostInput>(
    initial ?? {
      slug: "",
      title: "",
      category: "",
      date: today(),
      content: "",
      status: "draft",
    }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [html, setHtml] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof PostInput>(k: K, v: PostInput[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // A rejected action keeps the form as is and offers a login link instead.
  const [failed, setFailed] = useState(false);
  const loginHref = () =>
    "/api/auth/login?next=" + encodeURIComponent(window.location.pathname);

  const onSave = () =>
    startTransition(async () => {
      try {
        setFailed(false);
        const res = await savePost(mode, form);
        if (res.ok) {
          window.location.href = "/admin";
        } else {
          setErrors(res.errors);
        }
      } catch {
        setFailed(true);
      }
    });

  const onPreview = () =>
    startTransition(async () => {
      try {
        setHtml(await previewMarkdown(form.content));
      } catch {
        setFailed(true);
      }
    });

  const onDelete = () => {
    if (!window.confirm("정말 삭제할까요?")) return;
    startTransition(async () => {
      try {
        await removePost(form.slug);
      } catch (err) {
        // redirect() from a Server Action is handled by Next; anything else
        // here means the session is gone.
        if (isRedirect(err)) throw err;
        setFailed(true);
      }
    });
  };

  const field = (
    label: string,
    key: keyof PostInput,
    children: React.ReactNode
  ) => (
    <label className="block">
      <span className="text-sm">{label}</span>
      {children}
      {errors[key] && (
        <span className="text-sm text-red-600">{errors[key]}</span>
      )}
    </label>
  );

  return (
    <div className="space-y-4">
      {failed && (
        <p className="text-sm text-red-600">
          저장하지 못했습니다. 로그인이 만료되었을 수 있습니다.{" "}
          <a
            href={loginHref()}
            target="_blank"
            rel="noopener"
            className="underline"
          >
            로그인
          </a>
        </p>
      )}
      {errors._ && <p className="text-sm text-red-600">{errors._}</p>}
      {field(
        "제목",
        "title",
        <input
          className={inputClass}
          value={form.title}
          onChange={e => set("title", e.target.value)}
        />
      )}
      {field(
        "주소(slug)",
        "slug",
        <input
          className={inputClass}
          value={form.slug}
          readOnly={mode === "update"}
          onChange={e => set("slug", e.target.value)}
        />
      )}
      {field(
        "날짜",
        "date",
        <input
          className={inputClass}
          value={form.date}
          onChange={e => set("date", e.target.value)}
        />
      )}
      {field(
        "카테고리",
        "category",
        <input
          className={inputClass}
          value={form.category}
          onChange={e => set("category", e.target.value)}
        />
      )}
      {field(
        "상태",
        "status",
        <select
          className={inputClass}
          value={form.status}
          onChange={e => set("status", e.target.value as PostInput["status"])}
        >
          <option value="draft">초안</option>
          <option value="published">발행</option>
        </select>
      )}
      {field(
        "본문",
        "content",
        <textarea
          className={`${inputClass} h-96 font-mono`}
          value={form.content}
          onChange={e => set("content", e.target.value)}
        />
      )}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded border px-3 py-1"
        >
          저장
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onPreview}
          className="rounded border px-3 py-1"
        >
          미리보기
        </button>
        {mode === "update" && (
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className="rounded border px-3 py-1 text-red-600"
          >
            삭제
          </button>
        )}
      </div>
      {html !== null && (
        <article
          className="prose dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}

function isRedirect(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
