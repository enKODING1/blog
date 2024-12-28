import gsap from "gsap";
import { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function animatePageIn() {
  const bannerOne = document.getElementById("banner-1");

  if (bannerOne) {
    const tl = gsap.timeline();
    tl.set([bannerOne], {
      yPercent: 0,
    }).to([bannerOne], {
      yPercent: 100,
      stagger: 0.2,
    });
  }
}

export function animatePageOut(href: string, router: AppRouterInstance) {
  const bannerOne = document.getElementById("banner-1");

  if (bannerOne) {
    const tl = gsap.timeline();
    tl.set([bannerOne], {
      yPercent: -100,
    }).to([bannerOne], {
      yPercent: 0,
      stagger: 0.2,
      onComplete: () => {
        router.push(href);
      },
    });
  }
}
