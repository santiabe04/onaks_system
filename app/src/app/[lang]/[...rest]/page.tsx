import { notFound } from "next/navigation";

// Every URL goes through the proxy and falls under `[lang]`: the ones that do not exist land here
// to use the translated not-found page instead of Next's default 404.
export default function CatchAll() {
  notFound();
}
