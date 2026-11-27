import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import StatusBar from "./_terminal/StatusBar";

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
        <StatusBar />
        <div className="max-w-3xl mx-auto px-4">
          <main>{children}</main>
        </div>
        <div className="scanlines" aria-hidden />
        <GoogleAnalytics gaId="G-SQB18PDDPD" />
      </body>
    </html>
  );
}
