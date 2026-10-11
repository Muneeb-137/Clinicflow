import { Link } from "react-router-dom";
import { SearchX } from "lucide-react";

function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#13B2B3]/10 text-[#13B2B3]">
        <SearchX size={28} />
      </div>

      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-[#13B2B3]">
        Page not found
      </p>

      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
        We couldn't find that page.
      </h1>

      <p className="mt-3 text-slate-500">
        The link may be out of date, or the page may have
        moved.
      </p>

      <Link
        to="/"
        className="mt-8 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Go to the home page
      </Link>
    </section>
  );
}

export default NotFoundPage;
