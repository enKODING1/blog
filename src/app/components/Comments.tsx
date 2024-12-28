"use client";

import { useEffect, useRef } from "react";

export default function Comments() {
  const commentsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!commentsRef.current) return;

    // 중복 삽입 방지
    if (commentsRef.current.hasChildNodes()) return;


    const script = document.createElement("script");
    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.setAttribute("repo", "enkoding1/enkoding1.github.io");
    script.setAttribute("issue-term", "pathname");
    script.setAttribute("label", "comments");
    script.setAttribute("theme", "github-light");
    script.setAttribute("crossorigin", "anonymous");

    commentsRef.current.appendChild(script);
  }, []);

  return <div ref={commentsRef} className="w-full mt-10"></div>;
}