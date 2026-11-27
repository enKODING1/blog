import type { Metadata } from "next";
import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "seongjin-kang blog",
  description: "Personal blog",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body className="antialiased">
        <div className="max-w-2xl mx-auto px-4">
          <header className="py-6">
            <Link href="/" className="font-semibold">
              seongjin-kang blog
            </Link>
          </header>
          <main>{children}</main>
        </div>
        <GoogleAnalytics gaId="G-SQB18PDDPD" />
      </body>
    </html>
  );
}
