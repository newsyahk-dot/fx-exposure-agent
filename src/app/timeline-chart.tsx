"use client";

// The money-in timeline as an AG Charts (Community) grouped bar chart: per week, money from clients abroad as invoiced
// (grey) and if clients pay as the proposals ask (blue). Colours are read from the page's CSS variables, so the chart
// follows light and dark mode like the rest of the page.

import { AllCommunityModule, ModuleRegistry, type AgCartesianChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { compact } from "@/lib/format";
import type { MoneyTimeline } from "@/lib/money-timeline";

ModuleRegistry.registerModules([AllCommunityModule]);

type Palette = { text: string; muted: string; grey: string; accent: string; warning: string; border: string };
const FALLBACK: Palette = { text: "#0b0b0b", muted: "#52514e", grey: "#b9b8b3", accent: "#2a78d6", warning: "#9a6200", border: "#e2e1dc" };

function readPalette(el: HTMLElement | null): Palette {
  if (!el) return FALLBACK;
  const cs = getComputedStyle(el);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const muted = v("--text-secondary", FALLBACK.muted);
  return {
    text: v("--text-primary", FALLBACK.text),
    muted,
    grey: muted, // drawn at 35% opacity (canvas fills do not take color-mix())
    accent: v("--accent", FALLBACK.accent),
    warning: v("--warning", FALLBACK.warning),
    border: v("--border", FALLBACK.border),
  };
}

export function TimelineChart({ bins, base }: { bins: MoneyTimeline["bins"]; base: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pal, setPal] = useState<Palette | null>(null);
  useEffect(() => {
    const update = () => setPal(readPalette(ref.current));
    update();
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  const c = (n: number) => compact(base, n);
  const options = useMemo<AgCartesianChartOptions | null>(() => {
    if (!pal) return null;
    const data = bins.map((b) => ({ label: b.label, key: b.key, asInvoiced: Math.round(b.asInvoiced), asProposed: Math.round(b.asProposed) }));
    const tip = (name: string) => ({
      renderer: (p: { datum: { label: string }; yKey: string; datum2?: unknown }) => ({
        heading: p.datum.label,
        title: name,
        data: [{ label: base, value: c((p.datum as Record<string, number | string>)[p.yKey] as number) }],
      }),
    });
    return {
      data,
      height: 210,
      background: { visible: false },
      padding: { top: 8, right: 8, bottom: 4, left: 4 },
      legend: { enabled: false }, // the page draws its own legend with the scenario note
      series: [
        { type: "bar", xKey: "label", yKey: "asInvoiced", yName: "As invoiced", fill: pal.grey, fillOpacity: 0.35, cornerRadius: 3, tooltip: tip("As invoiced") },
        { type: "bar", xKey: "label", yKey: "asProposed", yName: "If clients pay as proposed", fill: pal.accent, cornerRadius: 3, tooltip: tip("If clients pay as proposed") },
      ],
      axes: {
        x: {
          type: "category",
          position: "bottom",
          label: { color: pal.muted, fontSize: 12 },
          line: { stroke: pal.border },
        },
        y: {
          type: "number",
          position: "left",
          label: { color: pal.muted, fontSize: 11, formatter: ({ value }: { value: number }) => c(value) },
          gridLine: { style: [{ stroke: pal.border, lineDash: [2, 4] }] },
          line: { enabled: false },
        },
      },
    } as unknown as AgCartesianChartOptions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pal, bins, base]);
  return (
    <div ref={ref} style={{ minHeight: 210 }} aria-label="Money from clients abroad by the week it is due, as invoiced and as proposed" role="img">
      {options && <AgCharts options={options} />}
    </div>
  );
}
