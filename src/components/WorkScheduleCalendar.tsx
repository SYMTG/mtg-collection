"use client";

import { useMemo, useState } from "react";

// Reference point: 2026-09-09 is the 1st day of an off-block, in a repeating
// 4-days-on / 4-days-off cycle (8-day period). All dates are compared in UTC
// calendar days so local time-of-day/DST never shifts which day something falls on.
const ANCHOR_UTC = Date.UTC(2026, 8, 9); // 2026-09-09, day 0 of the cycle (1st day off)
const CYCLE_LENGTH = 8;

// What each of the 8 cycle days actually looks like, capacity-wise — the raw
// work/off split doesn't capture this: two "off" mornings are lost to sleep
// (night-shift recovery), and one "work" day is actually free before a night shift.
const CYCLE_INFO = [
  { working: false, free: false, label: "Day off 1 — day sleep after night shift" },
  { working: false, free: true, label: "Day off 2 — free" },
  { working: false, free: true, label: "Day off 3 — free" },
  { working: false, free: true, label: "Day off 4 — free" },
  { working: true, free: false, label: "Work day 1 — 12h day shift" },
  { working: true, free: false, label: "Work day 2 — 12h day shift" },
  { working: true, free: true, label: "Work day 3 — free before night shift" },
  { working: true, free: false, label: "Work day 4 — day sleep, then night shift" },
] as const;

type DayStatus = {
  working: boolean;
  free: boolean;
  label: string;
  dayInBlock: number;
};

function statusFor(date: Date): DayStatus {
  const dayUtc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceAnchor = Math.round((dayUtc - ANCHOR_UTC) / 86_400_000);
  const cycleDay = ((daysSinceAnchor % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH;
  const info = CYCLE_INFO[cycleDay];
  const dayInBlock = cycleDay < 4 ? cycleDay + 1 : cycleDay - 3;
  return { ...info, dayInBlock };
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function WorkScheduleCalendar() {
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    // Monday-first grid: shift Sunday (0) to the end of the week.
    const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(viewYear, viewMonth, 1 - leadingBlanks);

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      return {
        date,
        inMonth: date.getMonth() === viewMonth,
        isToday: isSameDay(date, today),
        status: statusFor(date),
      };
    });
  }, [viewYear, viewMonth, today]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  const todayStatus = statusFor(today);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-wide text-zinc-500">Schedule</p>
          <p className="mt-0.5 text-sm text-zinc-300">
            Today —{" "}
            <span className={todayStatus.free ? "font-medium text-emerald-400" : "font-medium text-rose-400"}>
              {todayStatus.free ? "free" : "paralyzed"}
            </span>{" "}
            <span className="text-zinc-500">
              ({todayStatus.working ? "work" : "off"} {todayStatus.dayInBlock}/4)
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ‹
          </button>
          <span className="w-32 text-center text-[13px] text-zinc-300">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center font-mono text-[10px] uppercase tracking-wide text-zinc-600">
            {w}
          </div>
        ))}
        {cells.map(({ date, inMonth, isToday, status }, i) => (
          <div
            key={i}
            title={status.label}
            className={`flex aspect-square items-center justify-center rounded-md text-[13px] tabular-nums ${
              inMonth ? "opacity-100" : "opacity-30"
            } ${
              status.free ? "bg-emerald-950/40 text-emerald-300" : "bg-rose-950/40 text-rose-300"
            } ${isToday ? "ring-1 ring-inset ring-zinc-100" : ""}`}
          >
            {date.getDate()}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-950/40 ring-1 ring-inset ring-emerald-700" /> Free
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-950/40 ring-1 ring-inset ring-rose-700" /> Paralyzed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-900 ring-1 ring-inset ring-zinc-100" /> Today
        </span>
      </div>
    </div>
  );
}
