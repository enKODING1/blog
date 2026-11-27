import NotFoundPath from "./_terminal/NotFoundPath";
import { TransitionLink } from "@/app/_terminal/TransitionProvider";

export default function NotFound() {
  return (
    <div className="py-6">
      <p data-line className="text-error">
        <NotFoundPath />
      </p>
      <p data-line className="mt-4">
        <TransitionLink href="/" className="px-1 hover:term-sel">
          ← cd ~
        </TransitionLink>
      </p>
    </div>
  );
}
