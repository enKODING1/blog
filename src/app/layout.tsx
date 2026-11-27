import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import StatusBar from "./_terminal/StatusBar";
import { TransitionProvider } from "./_terminal/TransitionProvider";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "seongjin-kang blog",
  description: "Personal blog",
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
        <GoogleAnalytics gaId="G-SQB18PDDPD" />
      </body>
    </html>
  );
}
