import Link from "next/link";

const CARD_ASPECT = 88 / 63; // height/width, matching a physical MTG card

export default function ReportsPage() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-900 px-4 py-8">
      <div className="w-full max-w-4xl">
        <Link
          href="/reports/sets"
          style={{ width: 200, height: 200 * CARD_ASPECT }}
          className="group relative flex flex-col items-center justify-center overflow-hidden rounded-2xl shadow-lg transition hover:-translate-y-1 hover:shadow-2xl"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 20%, #7a6488 0%, #5F4F66 45%, #362c3f 100%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-0 transition group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(circle at 30% 20%, rgba(212,175,110,0.25) 0%, transparent 60%)",
            }}
          />
          <div
            className="absolute inset-[3px] rounded-[14px] border"
            style={{ borderColor: "rgba(212,175,110,0.35)" }}
          />

          <svg
            viewBox="0 0 20 20"
            className="relative h-7 w-7"
            style={{ fill: "#D4AF6E" }}
          >
            <path d="M10 1.5l2.35 4.86 5.36.8-3.88 3.78.92 5.34L10 13.75l-4.75 2.53.92-5.34-3.88-3.78 5.36-.8L10 1.5z" />
          </svg>

          <span
            className="relative mt-2 text-2xl tracking-wide"
            style={{
              color: "#FDFDFD",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            Set Value
          </span>
          <span
            className="relative mt-1 h-px w-10"
            style={{ backgroundColor: "rgba(212,175,110,0.5)" }}
          />
        </Link>
      </div>
    </div>
  );
}
