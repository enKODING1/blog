"use client";

import { useEffect, useRef } from "react";

export default function Comments() {
  const ref = useRef(null);

  useEffect(() => {
    const script = document.createElement("script");

    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.setAttribute("repo", "enkoding1/enkoding1.github.io");
    script.setAttribute("issue-term", "title");
    script.setAttribute("label", "comments");
    script.setAttribute("theme", "github-light");
    script.setAttribute("crossorigin", "anonymous");
  }, []);

  return <div ref={ref}></div>;
}
