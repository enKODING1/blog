"use client";

import { useRef, useState, useTransition } from "react";
import {
  previewMarkdown,
  removePost,
  requestImageUpload,
  savePost,
} from "./actions";
import {
  imageMarkdown,
  insertAt,
  replacePlaceholder,
  uploadPlaceholder,
} from "@/lib/media/image-markdown";
import type { PostInput } from "@/lib/posts/types";
import { isValidSlug } from "@/lib/posts/validate";
import { seoulToday } from "@/lib/date";

type Props = { mode: "create" | "update"; initial?: PostInput };

const inputClass =
  "w-full border border-line bg-bg px-2 py-1 text-fg focus:border-fg";
const buttonClass =
  "border border-line px-3 py-1 enabled:hover:term-sel disabled:opacity-50";

export default function PostForm({ mode, initial }: Props) {
  const [form, setForm] = useState<PostInput>(
    initial ?? {
      slug: "",
      title: "",
      category: "",
      date: seoulToday(),
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

  // In-flight uploads: saving while placeholders are in the text would
  // persist empty-src images. The ref backs the guard in onSave; the state
  // drives the disabled button.
  const inFlight = useRef(0);
  const [uploading, setUploading] = useState(0);
  const trackUpload = (delta: number) => {
    inFlight.current += delta;
    setUploading(inFlight.current);
  };
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Each file gets a unique placeholder inserted synchronously at the cursor,
  // so later typing or overlapping uploads cannot shift the insert position.
  // The placeholder is swapped for the final markdown (or removed on failure)
  // by searching for it, and left alone if the user already deleted it.
  const uploadImages = (files: File[], textarea: HTMLTextAreaElement) => {
    const images = files.filter(f => f.type.startsWith("image/"));
    if (images.length === 0) return;
    const slug = form.slug;
    // Images live under the post's slug, so it has to be settled first.
    if (!isValidSlug(slug)) {
      setUploadError("주소(slug)를 먼저 입력하세요");
      return;
    }
    setUploadError(null);
    const jobs = images.map(file => ({
      file,
      placeholder: uploadPlaceholder(crypto.randomUUID()),
    }));
    const cursor = textarea.selectionStart;
    setForm(f => ({
      ...f,
      content: insertAt(
        f.content,
        cursor,
        jobs.map(j => j.placeholder).join("")
      ),
    }));
    const swap = (placeholder: string, replacement: string) =>
      setForm(f => ({
        ...f,
        content: replacePlaceholder(f.content, placeholder, replacement),
      }));
    trackUpload(jobs.length);
    for (const { file, placeholder } of jobs) {
      void (async () => {
        try {
          const { uploadUrl, markdownPath } = await requestImageUpload(
            slug,
            file.type,
            file.size
          );
          const res = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          if (!res.ok) throw new Error("upload failed: " + res.status);
          swap(placeholder, imageMarkdown(file.name, markdownPath));
        } catch {
          swap(placeholder, "");
          setUploadError("이미지를 올리지 못했습니다");
        } finally {
          trackUpload(-1);
        }
      })();
    }
  };

  const onSave = () => {
    if (inFlight.current > 0) return;
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
  };

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
      <span className="text-sm text-dim">{label}</span>
      {children}
      {errors[key] && <span className="text-sm text-error">{errors[key]}</span>}
    </label>
  );

  return (
    <div className="space-y-4">
      {failed && (
        <p className="text-sm text-error">
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
      {errors._ && <p className="text-sm text-error">{errors._}</p>}
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
          onPaste={e => {
            const files = Array.from(e.clipboardData.files);
            if (files.some(f => f.type.startsWith("image/"))) {
              e.preventDefault();
              uploadImages(files, e.currentTarget);
            }
          }}
          onDrop={e => {
            const files = Array.from(e.dataTransfer.files);
            if (files.some(f => f.type.startsWith("image/"))) {
              e.preventDefault();
              uploadImages(files, e.currentTarget);
            }
          }}
        />
      )}
      {uploadError && <p className="text-sm text-error">{uploadError}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={pending || uploading > 0}
          onClick={onSave}
          className={buttonClass}
        >
          저장
        </button>
        {uploading > 0 && (
          <span className="self-center text-sm text-dim">
            이미지 업로드 중…
          </span>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onPreview}
          className={buttonClass}
        >
          미리보기
        </button>
        {mode === "update" && (
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            className={`${buttonClass} text-error`}
          >
            삭제
          </button>
        )}
      </div>
      {html !== null && (
        <article
          className="prose prose-invert max-w-none font-sans"
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
