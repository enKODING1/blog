"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const CLARITY_PROJECT_ID = "zk8fgvcsde";

// Microsoft Clarity session analytics. Skipped on /admin so editor sessions
// (drafts, unpublished posts) are never recorded.
// The Script id must not be "clarity": element ids become window globals, so
// window.clarity would be the <script> element and the snippet never starts.
export default function Clarity() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <Script id="ms-clarity-init" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");`}
    </Script>
  );
}
