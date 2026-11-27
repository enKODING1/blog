import type { Metadata } from "next";
import Link from "next/link";
import { JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

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
    <html lang="ko" className={mono.variable}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
        />
      </head>
      <body className="font-mono antialiased">
        <div className="max-w-3xl mx-auto px-4">
          <header className="py-6">
            <Link href="/" className="font-semibold">
              seongjin-kang blog
            </Link>
          </header>
          <main>{children}</main>
        </div>
        <div className="scanlines" aria-hidden />
        <GoogleAnalytics gaId="G-SQB18PDDPD" />
      </body>
    </html>
  );
}
