"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { animatePageOut } from "../utils/BlindAnimation";
import { ReactNode } from "react";

interface Props {
  href: string;
  children: ReactNode;
  style?: string;
}

export default function TransitionLink({ href, children, style }: Props) {
  const router = useRouter();
  const pathName = usePathname();

  const handleClick = () => {
    if (pathName !== href) {
      animatePageOut(href, router);
    }
  };
  return (
    <Link href={"#"} onClick={handleClick} className={style}>
      {children}
    </Link>
  );
}
