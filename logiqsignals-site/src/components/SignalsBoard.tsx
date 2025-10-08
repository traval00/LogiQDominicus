import { useMemo, useState } from "react";
import importedPayload from "../data/signals.json"; // <— direct import

type Signal = {
  id: string;
  ticker: string;
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target: number;
  timeframe: string;
  strategy: string;
  status: "open" | "closed";
  ts: string;
};
type Payload = { updated?: string; signals?: Signal[] };

const payload = importedPayload as unknown as Payload;

export default function SignalsBoard() {
  const [tab, setTab] = useState<"today"|"week"|"all">("today");
  const rows = payload.signals ?? [];

  const filtered = useMemo(() => {
    const now = new Date();
    if (tab === "all") return rows;
    if (tab === "today") {
      const start = new Date(now); start.setHours(0,0,0,0);
      const end = new Date(now);   end.setHours(23,59,59,999);
      return rows.filter(s => {
        const d = new Date(s.ts);
        return d >= start && d <= end;
      });
    }
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return rows.filter(s => new Date(s.ts) >= start);
  }, [rows, tab]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <h1 className="text-3xl font-bold">LogiQ Signals™</h1>
        {payload.updated && <span className="text-sm opacity-70">updated {new Date(payload.updated).toLocaleString()}</span>}
        <span className="text-sm"> · {rows.length} total</span>
      </div>

      <div className="flex gap-2 mb-4">
        {(["today","week","all"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-xl border ${tab===t ? "bg-black text-white" : "bg-white"}`}
          >
            {t === "today" ? "Today" : t === "week" ? "Weekly" : "All"}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border rounded-2xl">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Ticker</th>
              <th className="text-left p-3">Side</th>
              <th className="text-right p-3">Entry</th>
              <th className="text-right p-3">Stop</th>
              <th className="text-right p-3">Target</th>
              <th className="text-left p-3">TF</th>
              <th className="text-left p-3">Strategy</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Time</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map(s => (
              <tr key={s.id} className="border-t">
                <td className="p-3 font-semibold">{s.ticker}</td>
                <td className="p-3">{s.side}</td>
                <td className="p-3 text-right">{s.entry.toFixed(2)}</td>
                <td className="p-3 text-right">{s.stop.toFixed(2)}</td>
                <td className="p-3 text-right">{s.target.toFixed(2)}</td>
                <td className="p-3">{s.timeframe}</td>
                <td className="p-3">{s.strategy}</td>
                <td className="p-3">{s.status}</td>
                <td className="p-3">{new Date(s.ts).toLocaleTimeString()}</td>
              </tr>
            )) : (
              <tr><td className="p-6 italic opacity-70" colSpan={9}>No signals yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
