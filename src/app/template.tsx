"use client";

import { useEffect } from "react";
import { animatePageIn } from "./utils/BlindAnimation";
import BlindTransition from "./components/Transition/BlindTransition";

export default function Template({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    animatePageIn();
  }, []);

  return (
    <>
      <BlindTransition>{children}</BlindTransition>
    </>
  );
}
