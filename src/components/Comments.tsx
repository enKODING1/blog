"use client";

import { useEffect, useRef } from "react";

export default function Comments() {
  const commentsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!commentsRef.current) {
      console.error("Comments container not mounted yet");
      return;
    }

    commentsRef.current.innerHTML = "";

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

  return <div ref={commentsRef}></div>;
}
