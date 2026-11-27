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
// without a flash. Mirrors PageEnter's skip rules; the timeout reveals the
// page anyway if hydration never happens.
const ENTER_GUARD = `try{var d=document.documentElement;if(!location.pathname.startsWith("/admin")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){d.setAttribute("data-enter","");setTimeout(function(){d.removeAttribute("data-enter")},3000)}}catch(e){}`;

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
