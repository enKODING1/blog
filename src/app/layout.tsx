import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import BlockCursor from "./_terminal/BlockCursor";
import Clarity from "./Clarity";
import StatusBar from "./_terminal/StatusBar";
import { TransitionProvider } from "./_terminal/TransitionProvider";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "seongjin-kang blog",
  description: "Personal blog",
  // Site ownership tags for Naver Search Advisor and Bing Webmaster Tools.
  // Google Search Console is verified by a DNS TXT record on skang.dev.
  verification: {
    other: {
      "naver-site-verification": "89a9e32462b183be2ac48289260a9dcb2b9efc8b",
      "msvalidate.01": "4F1C7887D159E213D7B4251E74ECD43D",
    },
  },
};

// Runs before first paint: hide main's lines so PageEnter can type them in
// without a flash. Its conditions (not /admin, motion allowed) must stay in
// sync with PageEnter's skip rules, or lines stay clipped / flash. If
// hydration takes longer than 800ms the guard lifts and PageEnter's
// `firstLoad && !guarded` branch shows the page without animating (R8).
const ENTER_GUARD = `try{var d=document.documentElement;if(!location.pathname.startsWith("/admin")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.setAttribute("data-enter","");setTimeout(function(){d.removeAttribute("data-enter")},800)}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: ENTER_GUARD sets data-enter before hydration.
    <html lang="ko" className={mono.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ENTER_GUARD }} />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
        />
      </head>
      <body className="font-mono antialiased">
        <TransitionProvider>
          <StatusBar />
          <div className="max-w-3xl mx-auto px-4">
            <main>{children}</main>
          </div>
        </TransitionProvider>
        <div className="scanlines" aria-hidden />
        <BlockCursor />
        <GoogleAnalytics gaId="G-SQB18PDDPD" />
        <Clarity />
      </body>
    </html>
  );
}
