import { useRunScene } from '../../api/hooks';
import type { DeckMapping, ReportRun, TemplateDetail } from '../../api/types';
import { fmtDate } from '../../lib/format';
import type { PresentSlide } from '../PresentMode';

/**
 * M15: the slides a generated run presents, built in one place for every entry that presents it —
 * the run's own panel and the workspace's "Apresentar a última geração".
 */
export function usePresentSlides(run: ReportRun | undefined, data: TemplateDetail | undefined, draft: DeckMapping | null): PresentSlide[] {
  const scene = useRunScene(run?.id);
  if (!run) return [];
  return (run.validation.preview.images ?? []).map((path, index) => {
    const name = path.split('/').pop()!;
    const produced = run.validation.produced?.find((p) => p.index === index + 1);
    const sceneSlide = scene.data?.slides.find((s) => s.index === index + 1);
    const templateSlide = data?.manifest.slides.find((s) => s.index === index + 1);
    const origin = produced && draft ? draft.slides[String(produced.origin_slide_id)] : undefined;
    const board = produced?.board_id ? data?.boards.find((b) => b.id === produced.board_id)?.name : undefined;
    return {
      // #30: keyed like the editor names a produced slide, so the usage report can find its template slide.
      key: produced ? `${produced.origin_slide_id}:${produced.board_id ?? 0}:${produced.page}` : name,
      image: `/api/reports/runs/${run.id}/files/${name}`,
      title: origin?.name || `Slide ${index + 1}`,
      subtitle: [board, fmtDate(run.reference_at, true)].filter(Boolean).join(' · '),
      notes: sceneSlide?.notes || templateSlide?.notes,
      minutes: origin?.minutes ?? null,
      transition: origin?.transition ?? 'nenhuma',
      text: sceneSlide
        ? sceneSlide.shapes
            .flatMap((s) => [...(s.text?.paragraphs.map((p) => p.text) ?? []), ...(s.table?.cells.flat() ?? [])])
            .join('\n')
        : undefined,
    };
  });
}
