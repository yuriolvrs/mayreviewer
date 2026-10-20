import type { Question } from "@/app/types";

// A deterministic check for CPU-scheduling items. The model verifier misses
// keys that name a process or a sequence, so this reads the process table in
// the stimulus, simulates the schedule, and answers the question in code.
// Anything it cannot parse or recognise gets no opinion (null).

type Proc = { name: string; arrival: number; burst: number; priority?: number };
type Segment = { name: string | null; start: number; end: number };
type Algo =
  | { kind: "fcfs" | "sjf" | "srtf" }
  | { kind: "priority"; preemptive: boolean; lowerIsBetter: boolean }
  | { kind: "rr"; quantum: number };

type Schedule = {
  procs: Proc[];
  segments: Segment[];
  completion: number[];
  start: number[]; // first time on the CPU
  preemptive: boolean;
};

export type ScheduleCheck = {
  // Index of the option that matches the computed answer, or null when none does.
  computedIndex: number | null;
  // Short code-built explanation: the schedule plus the computed answer.
  explanation: string;
};

const NUMBER_CELL = /^(\d+(?:\.\d+)?)\s*(?:ms|units?)?$/i;
const MAX_STEPS = 10_000;

function fmt(v: number): string {
  return String(Math.round(v * 100) / 100);
}

function splitRow(line: string): string[] {
  const t = line.trim();
  if (t.includes("|")) return t.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  return t.split(/\s+/);
}

function normHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z]/g, "");
}

function parseTable(stimulus: string): Proc[] | null {
  const lines = stimulus.split(/\r?\n/).map((l) =>
    l
      .replace(/arrival\s+time/gi, "Arrival")
      .replace(/burst\s+time/gi, "Burst")
      .replace(/cpu\s+burst/gi, "Burst")
      .replace(/execution\s+time/gi, "Burst"),
  );
  for (let h = 0; h < lines.length; h++) {
    const head = splitRow(lines[h]).map(normHeader);
    const proc = head.findIndex((c) => /^(process|pid|proc|p|id|name|job)$/.test(c));
    const arrival = head.findIndex((c) => /^(arrival|at)$/.test(c));
    const burst = head.findIndex((c) => /^(burst|bt|duration)$/.test(c));
    if (proc < 0 || arrival < 0 || burst < 0) continue;
    const prio = head.findIndex((c) => /^(priority|prio|pri)$/.test(c));
    const widest = Math.max(proc, arrival, burst, prio);

    const procs: Proc[] = [];
    for (const line of lines.slice(h + 1)) {
      if (line.trim() === "" || /^[\s|:-]+$/.test(line)) continue;
      const cells = splitRow(line);
      if (cells.length <= widest) break; // End of the table.
      const a = NUMBER_CELL.exec(cells[arrival])?.[1];
      const b = NUMBER_CELL.exec(cells[burst])?.[1];
      const p = prio >= 0 ? NUMBER_CELL.exec(cells[prio])?.[1] : undefined;
      // A row shaped like data but with unreadable numbers: don't guess.
      if (cells[proc] === "" || a === undefined || b === undefined || (prio >= 0 && p === undefined)) return null;
      procs.push({ name: cells[proc], arrival: Number(a), burst: Number(b), priority: p === undefined ? undefined : Number(p) });
    }
    if (procs.length === 0) return null;
    if (new Set(procs.map((x) => x.name.toLowerCase())).size !== procs.length) return null;
    if (procs.some((x) => x.burst <= 0)) return null;
    return procs;
  }
  return null;
}

function detectAlgo(q: Question, procs: Proc[]): Algo | null {
  const firstLine = (q.stimulus ?? "").split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  // The stimulus header and group title name the algorithm; the question only
  // decides when they do not.
  const all = `${firstLine} ${q.groupTitle ?? ""} ${q.question}`;
  for (const text of [`${firstLine} ${q.groupTitle ?? ""}`, q.question]) {
    const algo = algoFromText(text, all, procs);
    if (algo !== undefined) return algo;
  }
  return null;
}

// undefined: no algorithm named in this text. null: named but not usable.
function algoFromText(text: string, all: string, procs: Proc[]): Algo | null | undefined {
  const preemptive = /(?<!non[-\s]?)preemptive/i.test(text);
  if (/\bround[-\s]?robin\b|\brr\b|\bquantum\b|\bq\s*=\s*\d/i.test(text)) {
    const m =
      /\bq\s*=\s*(\d+(?:\.\d+)?)/i.exec(all) ??
      /\b(?:time\s+)?(?:quantum|slice)(?:\s+(?:of|is|=|:))?\s*=?\s*(\d+(?:\.\d+)?)/i.exec(all);
    const quantum = m ? Number(m[1]) : NaN;
    return quantum > 0 ? { kind: "rr", quantum } : null;
  }
  if (/\bsrtf\b|\bsrt\b|shortest[-\s]remaining/i.test(text)) return { kind: "srtf" };
  if (/\bpriority\b/i.test(text)) {
    if (procs.some((p) => p.priority === undefined)) return null;
    const higherWins =
      /(higher|larger|greater|bigger)\s+(number|value|priority number)[^.]*\bhigher priority|highest (number|value)/i.test(text);
    const lowerWins =
      /(lower|smaller)\s+(number|value|priority number)[^.]*\bhigher priority|(lowest|smallest) (number|value)/i.test(text);
    if (higherWins && lowerWins) return null;
    return { kind: "priority", preemptive, lowerIsBetter: !higherWins };
  }
  if (/\bsjf\b|shortest[-\s]job|\bspn\b/i.test(text)) return preemptive ? { kind: "srtf" } : { kind: "sjf" };
  if (/\bfcfs\b|first[-\s]come/i.test(text)) return { kind: "fcfs" };
  return undefined;
}

function simulate(procs: Proc[], algo: Algo): Schedule | null {
  const n = procs.length;
  const rem = procs.map((p) => p.burst);
  const completion: number[] = new Array(n).fill(NaN);
  const start: number[] = new Array(n).fill(NaN);
  const segments: Segment[] = [];
  let t = Math.min(...procs.map((p) => p.arrival));
  let finished = 0;
  let steps = 0;

  const run = (i: number | null, length: number) => {
    const last = segments[segments.length - 1];
    const name = i === null ? null : procs[i].name;
    if (last && last.name === name && last.end === t) last.end = t + length;
    else segments.push({ name, start: t, end: t + length });
    if (i !== null) {
      if (Number.isNaN(start[i])) start[i] = t;
      rem[i] -= length;
      if (rem[i] <= 1e-9) {
        rem[i] = 0;
        completion[i] = t + length;
        finished++;
      }
    }
    t += length;
  };
  const nextArrival = () => Math.min(...procs.filter((p, i) => rem[i] > 0 && p.arrival > t).map((p) => p.arrival));
  const readyList = () => procs.map((_, i) => i).filter((i) => rem[i] > 0 && procs[i].arrival <= t);

  if (algo.kind === "rr") {
    const order = procs.map((_, i) => i).sort((a, b) => procs[a].arrival - procs[b].arrival || a - b);
    const queue: number[] = [];
    let next = 0;
    const admit = () => {
      while (next < n && procs[order[next]].arrival <= t) queue.push(order[next++]);
    };
    admit();
    while (finished < n) {
      if (++steps > MAX_STEPS) return null;
      if (queue.length === 0) {
        const jump = procs[order[next]].arrival;
        run(null, jump - t);
        admit();
        continue;
      }
      const i = queue.shift() as number;
      run(i, Math.min(algo.quantum, rem[i]));
      admit(); // Arrivals during the slice queue ahead of the preempted process.
      if (rem[i] > 0) queue.push(i);
    }
    return { procs, segments, completion, start, preemptive: true };
  }

  const preemptive = algo.kind === "srtf" || (algo.kind === "priority" && algo.preemptive);
  const key = (i: number): number => {
    if (algo.kind === "sjf") return procs[i].burst;
    if (algo.kind === "srtf") return rem[i];
    if (algo.kind === "priority") return (algo.lowerIsBetter ? 1 : -1) * (procs[i].priority as number);
    return 0;
  };
  while (finished < n) {
    if (++steps > MAX_STEPS) return null;
    const ready = readyList();
    if (ready.length === 0) {
      run(null, nextArrival() - t);
      continue;
    }
    ready.sort((a, b) => key(a) - key(b) || procs[a].arrival - procs[b].arrival || a - b);
    const i = ready[0];
    const until = preemptive ? nextArrival() - t : Infinity;
    run(i, Math.min(rem[i], until));
  }
  return { procs, segments, completion, start, preemptive };
}

function nameRegex(procs: Proc[], flags: string): RegExp {
  const names = procs.map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  return new RegExp(`(?<![A-Za-z0-9])(${names.join("|")})(?![A-Za-z0-9])`, flags);
}

// Process names in `text`, in order, as the table spells them.
function namesIn(text: string, procs: Proc[], caseInsensitive: boolean): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(nameRegex(procs, caseInsensitive ? "gi" : "g"))) {
    out.push(procs.find((p) => p.name.toLowerCase() === m[1].toLowerCase())?.name ?? m[1]);
  }
  return out;
}

type Computed =
  | { kind: "number"; value: number; text: string }
  | { kind: "name"; name: string | null; text: string } // null: the CPU is idle
  | { kind: "sequence"; names: string[]; text: string };

function answerQuestion(q: Question, s: Schedule): Computed | null {
  const text = q.question.toLowerCase();
  const { procs } = s;
  const turnaround = (i: number) => s.completion[i] - procs[i].arrival;
  const waiting = (i: number) => turnaround(i) - procs[i].burst;
  const response = (i: number) => s.start[i] - procs[i].arrival;

  const completionWord = /\b(complet\w*|finish\w*|terminat\w*)\b/.test(text);
  const wantsOrder = /\border\b/.test(text);
  const metrics = {
    waiting: /\bwait(?:ing)? time\b/.test(text),
    turnaround: /\bturn-?around\b/.test(text),
    response: /\bresponse time\b/.test(text),
    completion: completionWord && !wantsOrder && /\b(time|when)\b/.test(text),
  };
  const metricNames = (Object.keys(metrics) as (keyof typeof metrics)[]).filter((k) => metrics[k]);
  const schedule = s.segments.map((g) => `${g.name ?? "idle"} ${fmt(g.start)}–${fmt(g.end)}`).join(", ");
  const prefix = `Schedule: ${schedule}.`;

  if (wantsOrder) {
    if (metricNames.length > 0) return null;
    let names: string[];
    if (completionWord) {
      names = procs.map((_, i) => i).sort((a, b) => s.completion[a] - s.completion[b] || a - b).map((i) => procs[i].name);
    } else if (/\b(execution|execute|scheduling|scheduled|running|run)\b/.test(text) && !s.preemptive) {
      names = s.segments.flatMap((g) => (g.name === null ? [] : [g.name]));
    } else {
      return null;
    }
    return { kind: "sequence", names, text: `${prefix} Order: ${names.join(", ")}.` };
  }

  if (metricNames.length > 1) return null;
  const mentioned = [...new Set(namesIn(q.question, procs, false))];

  if (metricNames.length === 1) {
    const metric = metricNames[0];
    const value = { waiting, turnaround, response, completion: (i: number) => s.completion[i] }[metric];
    const label = { waiting: "Waiting time", turnaround: "Turnaround time", response: "Response time", completion: "Completion time" }[metric];
    if (/\b(average|mean|avg)\b/.test(text)) {
      if (metric === "completion" || mentioned.length > 0) return null;
      const all = procs.map((_, i) => value(i));
      const avg = all.reduce((a, b) => a + b, 0) / all.length;
      return {
        kind: "number",
        value: avg,
        text: `${prefix} Average ${label.toLowerCase()} = (${all.map(fmt).join(" + ")}) / ${all.length} = ${fmt(avg)}.`,
      };
    }
    if (mentioned.length !== 1) return null;
    const i = procs.findIndex((p) => p.name === mentioned[0]);
    return { kind: "number", value: value(i), text: `${prefix} ${label} of ${procs[i].name} = ${fmt(value(i))}.` };
  }

  if (/\b(running|executing|on the cpu|using the cpu|has the cpu)\b/.test(text)) {
    const m =
      /\b(?:time(?:\s+unit)?|t)\s*[=:]?\s*(\d+(?:\.\d+)?)/i.exec(q.question) ?? /\bat\s+(\d+(?:\.\d+)?)\b/i.exec(q.question);
    if (!m) return null;
    const t = Number(m[1]);
    const seg = s.segments.find((g) => g.start <= t && t < g.end);
    const name = seg?.name ?? null;
    return {
      kind: "name",
      name,
      text: `${prefix} At t = ${fmt(t)}, ${name === null ? "the CPU is idle" : `${name} is running`}.`,
    };
  }
  return null;
}

const IDLE_OPTION = /^(none|idle|nothing|no process|no one|the cpu is idle|cpu idle|cpu is idle)\b/i;

function matchOption(q: Question, c: Computed, procs: Proc[]): number | null {
  const options = q.options;
  if (c.kind === "name") {
    const hits = options.flatMap((o, i) => {
      if (c.name === null) return IDLE_OPTION.test(o.trim()) ? [i] : [];
      if (IDLE_OPTION.test(o.trim())) return [];
      const found = [...new Set(namesIn(o, procs, true))];
      return found.length === 1 && found[0] === c.name ? [i] : [];
    });
    return hits.length === 1 ? hits[0] : null;
  }
  if (c.kind === "sequence") {
    const want = c.names.join("|");
    const hits = options.flatMap((o, i) => (namesIn(o, procs, true).join("|") === want ? [i] : []));
    return hits.length === 1 ? hits[0] : null;
  }
  // Numbers: an option counts when it is within 0.01 of the value, or equals
  // it rounded to the option's own decimals ("3.3" for 3.333).
  const scored = options.flatMap((o, i) => {
    const nums = o.match(/-?\d+(?:\.\d+)?/g);
    if (!nums || nums.length !== 1) return [];
    const v = Number(nums[0]);
    const decimals = nums[0].split(".")[1]?.length ?? 0;
    const dist = Math.abs(v - c.value);
    const rounded = decimals > 0 && dist <= 0.5 * 10 ** -decimals + 1e-9;
    return dist <= 0.01 + 1e-9 || rounded ? [{ i, dist }] : [];
  });
  scored.sort((a, b) => a.dist - b.dist);
  if (scored.length === 0) return null;
  if (scored.length > 1 && Math.abs(scored[0].dist - scored[1].dist) < 1e-9) return null;
  return scored[0].i;
}

// No opinion (null) when the item is not a schedule item or cannot be read
// with confidence. Otherwise the computed answer, matched to the options.
export function scheduleCheck(q: Question): ScheduleCheck | null {
  if (q.answerKind === "short" || q.options.length < 2 || !q.stimulus) return null;
  const procs = parseTable(q.stimulus);
  if (!procs) return null;
  const algo = detectAlgo(q, procs);
  if (!algo) return null;
  const schedule = simulate(procs, algo);
  if (!schedule || schedule.completion.some((c) => Number.isNaN(c))) return null;
  const computed = answerQuestion(q, schedule);
  if (!computed) return null;
  return { computedIndex: matchOption(q, computed, procs), explanation: computed.text };
}
