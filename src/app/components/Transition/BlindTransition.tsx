"use client";

import { useEffect } from "react";
import { animatePageIn } from "../../utils/BlindAnimation";

export default function BlindTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    animatePageIn();
  }, []);

  return (
    <div>
      <div
        id="banner-1"
        className="min-h-screen w-[100%] backdrop-blur-[8px] backdrop-saturate-[100%] bg-opacity-50 z-10 fixed top-0 left-0 "
      />

      {children}
    </div>
  );
}
