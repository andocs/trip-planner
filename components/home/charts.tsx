"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact, formatMoney, formatPercent } from "@/lib/format";
import type { CategoryLine } from "@/lib/queries/budget";
import type { DonutSlice } from "./chart-data";

type TooltipPayload = readonly { name?: string; value?: number | string; payload?: Record<string, unknown> }[];

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-card">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 tabular-nums">
          {r.color && <span className="size-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />}
          <span className="text-fg-muted">{r.label}</span>
          <span className="ml-auto font-semibold">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function PlannedVsSpent({ lines, currency }: { lines: CategoryLine[]; currency: string }) {
  const data = lines
    .filter((l) => l.category && (l.planned || l.spent))
    .map((l) => ({ name: l.name, planned: l.planned ?? 0, spent: l.spent }));
  if (data.length === 0)
    return <p className="py-6 text-center text-sm text-fg-muted">Plan amounts per category to compare.</p>;

  return (
    <div style={{ height: data.length * 52 + 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
          barGap={2}
          barCategoryGap={14}
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatCompact(v, "").trim()}
            tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={104}
            tick={{ fill: "var(--fg)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) => {
              const p = payload as TooltipPayload | undefined;
              if (!active || !p?.length) return null;
              const row = p[0].payload as { planned: number; spent: number };
              return (
                <TipBox
                  title={String(label)}
                  rows={[
                    { label: "Planned", value: formatMoney(row.planned, currency), color: "var(--chart-planned)" },
                    { label: "Spent", value: formatMoney(row.spent, currency), color: "var(--chart-spent)" },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="planned" name="Planned" fill="var(--chart-planned)" barSize={10} radius={[0, 4, 4, 0]} />
          <Bar dataKey="spent" name="Spent" fill="var(--chart-spent)" barSize={10} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SpendDonut({ slices, total, currency }: { slices: DonutSlice[]; total: number; currency: string }) {
  if (slices.length === 0) return <p className="py-6 text-center text-sm text-fg-muted">No spending yet.</p>;
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[176px_1fr]">
      <div className="relative mx-auto size-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const p = payload as TooltipPayload | undefined;
                if (!active || !p?.length) return null;
                const v = Number(p[0].value);
                return (
                  <TipBox
                    title={String(p[0].name)}
                    rows={[{ label: formatPercent((v / total) * 100), value: formatMoney(v, currency) }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xs text-fg-muted">Spent</p>
            <p className="text-sm font-bold tabular-nums">{formatCompact(total, currency)}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center gap-2 tabular-nums">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="text-fg-muted">{formatPercent((s.value / total) * 100)}</span>
            <span className="w-28 text-right font-semibold">{formatMoney(s.value, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
