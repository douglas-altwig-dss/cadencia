import { useComputedColorScheme } from '@mantine/core';
import type { EChartsOption, EChartsType } from 'echarts';
import { useEffect, useRef } from 'react';

import { usePreferences } from '../lib/preferences';
import { chartColors, type ChartPalette } from '../theme';

type Option = EChartsOption;

/**
 * ECharts wrapper: follows the colour scheme, resizes with its container and exposes a text
 * description to assistive technology (the chart itself is a canvas).
 */
export function EChart({
  build,
  height = 300,
  label,
  deps,
}: {
  build: (palette: ChartPalette) => Option;
  height?: number;
  label: string;
  deps: unknown[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scheme = useComputedColorScheme('light');
  // RF-96: patterns on areas and bars, so no series is told apart by colour alone.
  const [{ chartPatterns }] = usePreferences();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const palette = chartColors[scheme];
    let disposed = false;
    let chart: EChartsType | undefined;
    let observer: ResizeObserver | undefined;
    // ECharts is loaded on demand: pages without charts do not pay for it.
    void import('echarts').then((echarts) => {
      if (disposed) return;
      chart = echarts.init(element, undefined, { renderer: 'canvas' });
      chart.setOption({
        backgroundColor: 'transparent',
        aria: { enabled: true, decal: { show: chartPatterns } },
        textStyle: { fontFamily: '"IBM Plex Sans", system-ui, sans-serif', color: palette.text },
        grid: { left: 48, right: 24, top: 36, bottom: 40, containLabel: true },
        ...build(palette),
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(element);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme, chartPatterns, ...deps]);

  return <div ref={ref} role="img" aria-label={label} style={{ width: '100%', height }} />;
}

export function axisStyle(palette: ChartPalette) {
  return {
    axisLine: { lineStyle: { color: palette.grid } },
    axisLabel: { color: palette.text },
    splitLine: { lineStyle: { color: palette.grid } },
  };
}
