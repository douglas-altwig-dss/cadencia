import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Collapse,
  CopyButton,
  Group,
  List,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy, IconDownload, IconFileTypePdf, IconLinkOff } from '@tabler/icons-react';
import { useState } from 'react';

import {
  runFileUrl,
  useCompareRuns,
  useCreateShare,
  usePartialRun,
  usePreviewRun,
  useReviewRun,
  useRevokeShare,
  useRunA11y,
  useShares,
} from '../../api/deckHooks';
import { useRunScene } from '../../api/hooks';
import type { A11yReport, ReportRun, ReviewEvent, ReviewStatus, TemplateDetail } from '../../api/types';
import { fmtDate, fmtDateTime, plural } from '../../lib/format';
import { ErrorState } from '../common';
import { DeckViewer } from './DeckViewer';

type Boards = TemplateDetail['boards'];
type Slides = TemplateDetail['manifest']['slides'];

const REVIEW: Record<ReviewStatus, { label: string; color: string }> = {
  rascunho: { label: 'rascunho', color: 'gray' },
  em_revisao: { label: 'em revisão', color: 'blue' },
  aprovado: { label: 'aprovada', color: 'teal' },
  reprovado: { label: 'devolvida', color: 'red' },
};

/** What a run's files are called in its own folder, from the paths validation stored. */
export const runImage = (run: ReportRun, index: number) => {
  const path = run.validation.preview.images?.[index - 1];
  return path ? `/api/reports/runs/${run.id}/files/${path.split('/').pop()}` : undefined;
};

/** #8, #12: whether a download needs `force` — the same two reasons the backend's blocker checks. */
export const needsForce = (run: ReportRun, requireApproval: boolean) =>
  run.status !== 'ok' || (requireApproval && (run.kind ?? 'entrega') === 'entrega' && run.review?.status !== 'aprovado');

/** #8: the deck as .pptx and as .pdf, from the same place. */
export function RunDownloads({ run, requireApproval, size = 'xs' }: { run: ReportRun; requireApproval: boolean; size?: 'xs' | 'compact-sm' }) {
  const force = needsForce(run, requireApproval);
  const why = run.status !== 'ok' ? 'reprovada na validação' : force ? 'ainda não aprovada' : '';
  return (
    <Group gap={6} wrap="nowrap">
      <Tooltip label={`Baixar mesmo assim — ${why}`} disabled={!force}>
        <Button
          component="a"
          href={runFileUrl(run, 'pptx', force)}
          size={size}
          leftSection={<IconDownload size={14} />}
          variant={force ? 'default' : 'filled'}
        >
          {force ? '.pptx mesmo assim' : 'Baixar .pptx'}
        </Button>
      </Tooltip>
      <Button component="a" href={runFileUrl(run, 'pdf', force)} size={size} variant="default" leftSection={<IconFileTypePdf size={14} />}>
        PDF
      </Button>
    </Group>
  );
}

export function ReviewBadge({ run }: { run: ReportRun }) {
  if ((run.kind ?? 'entrega') !== 'entrega' || !run.review) return null;
  const meta = REVIEW[run.review.status];
  const who = run.review.by ? ` por ${run.review.by}` : '';
  return (
    <Tooltip label={`${meta.label}${who}${run.review.at ? ` em ${fmtDateTime(run.review.at)}` : ''}`} disabled={!run.review.at}>
      <Badge color={meta.color} variant="light">
        {meta.label}
      </Badge>
    </Tooltip>
  );
}

/**
 * #12: draft → in review → approved or sent back. Approval is refused by the backend while the
 * validation failed or a comment on the template is still open; the message says which.
 */
export function ReviewControls({ run }: { run: ReportRun }) {
  const review = useReviewRun();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  if ((run.kind ?? 'entrega') !== 'entrega' || !run.review) return null;
  const status = run.review.status;
  const act = (action: 'enviar' | 'aprovar' | 'reprovar' | 'reabrir', text?: string) =>
    review.mutate({ runId: run.id, action, note: text }, { onSuccess: () => { setRejecting(false); setNote(''); } });
  return (
    <Stack gap={6}>
      <Group gap="xs">
        <Text size="sm" fw={500}>
          Revisão
        </Text>
        <ReviewBadge run={run} />
        {(status === 'rascunho' || status === 'reprovado') && (
          <Button size="compact-xs" variant="light" loading={review.isPending} onClick={() => act('enviar')}>
            Enviar para revisão
          </Button>
        )}
        {status === 'em_revisao' && (
          <>
            <Button size="compact-xs" color="teal" loading={review.isPending} onClick={() => act('aprovar')}>
              Aprovar
            </Button>
            <Button size="compact-xs" variant="default" onClick={() => setRejecting((r) => !r)}>
              Devolver…
            </Button>
          </>
        )}
        {status !== 'rascunho' && (
          <Button size="compact-xs" variant="subtle" color="gray" loading={review.isPending} onClick={() => act('reabrir')}>
            Voltar a rascunho
          </Button>
        )}
      </Group>
      {run.review.note && (
        <Text size="xs" c="dimmed">
          Observação: {run.review.note}
        </Text>
      )}
      <ReviewHistory history={run.review.history} />
      {rejecting && (
        <Group align="flex-end">
          <Textarea
            label="O que precisa mudar"
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={2}
            style={{ flex: 1 }}
          />
          <Button size="xs" color="red" disabled={!note.trim()} onClick={() => act('reprovar', note)}>
            Devolver
          </Button>
        </Group>
      )}
      {review.error && <ErrorState error={review.error} title="Revisão não registrada" />}
    </Stack>
  );
}

const REVIEW_EVENT_LABEL: Record<ReviewEvent['action'], string> = {
  enviar: 'Enviado para revisão',
  aprovar: 'Aprovado',
  reprovar: 'Devolvido',
  reabrir: 'Voltou a rascunho',
};

/**
 * The single `review.note`/`review.by` above are only the *latest* decision; a later approval
 * overwrites an earlier rejection's reason. This keeps every decision visible, oldest first, so
 * "quem reprovou e por quê" survives someone else approving afterwards.
 */
function ReviewHistory({ history }: { history: ReviewEvent[] }) {
  const [open, setOpen] = useState(false);
  if (history.length < 2) return null;
  return (
    <Stack gap={4}>
      <Anchor component="button" type="button" size="xs" onClick={() => setOpen((o) => !o)}>
        {open ? 'Ocultar' : 'Ver'} histórico da revisão ({history.length})
      </Anchor>
      <Collapse expanded={open}>
        <List size="xs" spacing={2}>
          {history.map((h, i) => (
            <List.Item key={i}>
              {REVIEW_EVENT_LABEL[h.action]}
              {h.by ? ` por ${h.by}` : ''} em {fmtDateTime(h.at)}
              {h.note && ` — ${h.note}`}
            </List.Item>
          ))}
        </List>
      </Collapse>
    </Stack>
  );
}

/** #14: read-only links to a run, each with an expiry, a view count and a revoke button. */
export function ShareModal({ run, opened, onClose }: { run: ReportRun; opened: boolean; onClose: () => void }) {
  const shares = useShares(opened ? run.id : undefined);
  const create = useCreateShare(run.id);
  const revoke = useRevokeShare(run.id);
  const [days, setDays] = useState<number>(14);
  const link = (path: string, url: string | null) => url ?? `${window.location.origin}${path}`;
  const live = (shares.data?.items ?? []).filter((s) => !s.revoked && new Date(s.expires_at) > new Date());
  return (
    <Modal opened={opened} onClose={onClose} title="Compartilhar somente leitura" size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Quem tiver o link vê os slides desta geração, sem entrar na Cadência e sem poder editar.
          Revogue quando não for mais necessário.
        </Text>
        {run.anonymized ? null : (
          <Alert color="yellow" variant="light">
            Esta geração mostra nomes de pessoas. Para um público externo, gere com “Anonimizar nomes”.
          </Alert>
        )}
        <Group align="flex-end">
          <NumberInput label="Válido por (dias)" value={days} onChange={(v) => setDays(Number(v) || 14)} min={1} max={90} w={160} />
          <Button loading={create.isPending} onClick={() => create.mutate(days)}>
            Criar link
          </Button>
        </Group>
        {create.error && <ErrorState error={create.error} title="Link não criado" />}
        {shares.isLoading && <Loader size="sm" />}
        {live.length > 0 ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Link</Table.Th>
                <Table.Th>Expira</Table.Th>
                <Table.Th>Visitas</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {live.map((share) => (
                <Table.Tr key={share.token}>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs" className="mono" lineClamp={1} maw={220}>
                        {share.path}
                      </Text>
                      <CopyButton value={link(share.path, share.url)}>
                        {({ copied, copy }) => (
                          <Tooltip label={copied ? 'Copiado' : 'Copiar link'}>
                            <ActionIcon variant="subtle" size="sm" onClick={copy} aria-label="Copiar link">
                              {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  </Table.Td>
                  <Table.Td>{fmtDate(share.expires_at, true)}</Table.Td>
                  <Table.Td className="num">{share.views}</Table.Td>
                  <Table.Td>
                    <Tooltip label="Revogar">
                      <ActionIcon variant="subtle" color="red" size="sm" onClick={() => revoke.mutate(share.token)} aria-label="Revogar link">
                        <IconLinkOff size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          !shares.isLoading && (
            <Text size="sm" c="dimmed">
              Nenhum link ativo.
            </Text>
          )
        )}
      </Stack>
    </Modal>
  );
}

const CHANGE_COLORS = { novo: 'teal', removido: 'red', alterado: 'blue' } as const;

/** #11: what changed between two generations, slide by slide and line by line. */
export function CompareModal({
  runs,
  initial,
  opened,
  onClose,
}: {
  runs: ReportRun[];
  initial?: string;
  opened: boolean;
  onClose: () => void;
}) {
  const after = initial ?? runs[0]?.id;
  const [afterId, setAfterId] = useState<string | undefined>(after);
  const older = runs.filter((r) => r.id !== afterId);
  const [beforeId, setBeforeId] = useState<string | undefined>(runs.find((r) => r.id !== after)?.id);
  const compare = useCompareRuns(opened ? beforeId : undefined, opened ? afterId : undefined);
  const options = (list: ReportRun[]) =>
    list.map((r) => ({ value: r.id, label: `${fmtDateTime(r.created_at)} · ref. ${fmtDate(r.reference_at, true)}` }));
  return (
    <Modal opened={opened} onClose={onClose} title="Comparar gerações" size="xl">
      <Stack gap="md">
        <Group grow>
          <Select label="Antes" data={options(older)} value={beforeId ?? null} onChange={(v) => setBeforeId(v ?? undefined)} />
          <Select label="Depois" data={options(runs)} value={afterId ?? null} onChange={(v) => setAfterId(v ?? undefined)} />
        </Group>
        {compare.isLoading && <Loader size="sm" />}
        {compare.error && <ErrorState error={compare.error} title="Comparação indisponível" />}
        {compare.data?.same && <Text size="sm">As duas gerações dizem exatamente a mesma coisa.</Text>}
        {compare.data && !compare.data.same && (
          <Stack gap="sm">
            {compare.data.slides.map((slide) => (
              <Stack key={`${slide.key}:${slide.board}`} gap={4} p="xs" style={{ border: '1px solid var(--border-soft)', borderRadius: 6 }}>
                <Group gap="xs">
                  <Badge size="sm" variant="light" color={CHANGE_COLORS[slide.change]}>
                    {slide.change}
                  </Badge>
                  <Text size="sm" fw={500}>
                    Slide {slide.after_index ?? slide.before_index}
                    {slide.board ? ` · ${slide.board}` : ''}
                  </Text>
                </Group>
                {slide.removed?.map((line, i) => (
                  <Text key={`r${i}`} size="xs" c="red.8" className="mono">
                    − {line}
                  </Text>
                ))}
                {slide.added?.map((line, i) => (
                  <Text key={`a${i}`} size="xs" c="teal.8" className="mono">
                    + {line}
                  </Text>
                ))}
              </Stack>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

/** #10: redo some slides and/or some boards of a deck without regenerating the rest by hand. */
export function PartialModal({
  run,
  slides,
  boards,
  opened,
  onClose,
  onDone,
}: {
  run: ReportRun;
  slides: Slides;
  boards: Boards;
  opened: boolean;
  onClose: () => void;
  onDone?: (run: ReportRun) => void;
}) {
  const partial = usePartialRun();
  const [slideIds, setSlideIds] = useState<string[]>([]);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const runBoards = boards.filter((b) => run.board_ids.includes(b.id));
  return (
    <Modal opened={opened} onClose={onClose} title="Regenerar parte da apresentação" size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Gera de novo só os slides e boards escolhidos, na mesma data de referência, com o mapeamento
          e as variáveis de agora — para conferir uma correção sem refazer o resto. Uma lista vazia
          quer dizer todos; escolha ao menos um slide ou um board. A geração original fica como está.
        </Text>
        <Checkbox.Group label="Slides do modelo" value={slideIds} onChange={setSlideIds}>
          <Stack gap={4} mt={4}>
            {slides.map((s) => (
              <Checkbox key={s.slide_id} value={String(s.slide_id)} label={`${s.index}. ${s.headline || s.layout}`} />
            ))}
          </Stack>
        </Checkbox.Group>
        {runBoards.length > 1 && (
          <Checkbox.Group label="Boards" value={boardIds} onChange={setBoardIds}>
            <Group gap="md" mt={4}>
              {runBoards.map((b) => (
                <Checkbox key={b.id} value={String(b.id)} label={b.name} />
              ))}
            </Group>
          </Checkbox.Group>
        )}
        {partial.error && <ErrorState error={partial.error} title="Regeneração falhou" />}
        <Group justify="flex-end">
          <Button
            loading={partial.isPending}
            disabled={!slideIds.length && !boardIds.length}
            onClick={() =>
              partial.mutate(
                {
                  runId: run.id,
                  slideIds: slideIds.length ? slideIds.map(Number) : undefined,
                  boardIds: boardIds.length ? boardIds.map(Number) : undefined,
                },
                { onSuccess: (next) => { onDone?.(next); onClose(); } },
              )
            }
          >
            Regenerar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** #9: the whole deck for one board, drawn by the editor's renderer, never listed as a delivery. */
export function PreviewModal({
  templateId,
  boards,
  audiences,
  opened,
  onClose,
}: {
  templateId: number;
  boards: Boards;
  audiences: string[];
  opened: boolean;
  onClose: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Prévia da apresentação" size="80rem">
      <PreviewBody templateId={templateId} boards={boards} audiences={audiences} />
    </Modal>
  );
}

export function PreviewBody({ templateId, boards, audiences }: { templateId: number; boards: Boards; audiences: string[] }) {
  const preview = usePreviewRun(templateId);
  const [boardId, setBoardId] = useState<string | null>(boards[0] ? String(boards[0].id) : null);
  const [audience, setAudience] = useState<string | null>(null);
  const run = preview.data;
  const scene = useRunScene(run?.id);
  return (
      <Stack gap="md">
        <Group align="flex-end">
          <Select
            label="Board"
            data={boards.map((b) => ({ value: String(b.id), label: b.space_name ? `${b.name} · ${b.space_name}` : b.name }))}
            value={boardId}
            onChange={setBoardId}
            searchable
            w={300}
          />
          {audiences.length > 0 && (
            <Select label="Público" placeholder="todos os slides" data={audiences} value={audience} onChange={setAudience} clearable w={200} />
          )}
          <Button
            loading={preview.isPending}
            onClick={() => preview.mutate({ board_id: boardId ? Number(boardId) : null, audience: audience ?? '' })}
          >
            Gerar prévia
          </Button>
        </Group>
        {preview.error && <ErrorState error={preview.error} title="Prévia falhou" />}
        {run && (
          <Group gap="xs">
            <Badge color={run.status === 'ok' ? 'teal' : 'yellow'} variant="light">
              {run.status === 'ok' ? 'sem erros' : plural(run.validation.errors.length, 'erro', 'erros')}
            </Badge>
            <Text size="xs" c="dimmed">
              {plural(run.validation.slides, 'slide', 'slides')} · {plural(run.validation.warnings.length, 'aviso', 'avisos')} · a prévia não entra no histórico
            </Text>
          </Group>
        )}
        {run && run.validation.errors.length > 0 && (
          <List size="sm">
            {run.validation.errors.slice(0, 5).map((e, i) => (
              <List.Item key={i}>{e.message}</List.Item>
            ))}
          </List>
        )}
        {scene.isLoading && <Loader size="sm" />}
        {scene.data && run && <DeckViewer scene={scene.data} raster={(index) => runImage(run, index)} />}
      </Stack>
  );
}

const A11Y_LABELS: Record<string, string> = {
  sem_texto_alternativo: 'sem texto alternativo',
  contraste_baixo: 'contraste baixo',
  ordem_de_leitura: 'ordem de leitura',
};

/** #15: what a screen reader or a projector would struggle with, one link per shape. */
export function A11yList({ report, onOpen }: { report?: A11yReport; onOpen?: (slide: number, shape: string | null) => void }) {
  if (!report) return null;
  if (!report.findings.length) {
    return (
      <Text size="sm" c="teal.8">
        Nenhum problema de acessibilidade encontrado.
      </Text>
    );
  }
  return (
    <Stack gap={6}>
      <Group gap={6}>
        {Object.entries(report.summary).map(([kind, count]) => (
          <Badge key={kind} variant="light" color="yellow">
            {count} {A11Y_LABELS[kind] ?? kind}
          </Badge>
        ))}
      </Group>
      <List size="sm" spacing={2}>
        {report.findings.slice(0, 40).map((f, i) => (
          <List.Item key={i}>
            <b>Slide {f.slide}</b>: {f.message}
            {onOpen && (
              <Button size="compact-xs" variant="subtle" ml={4} onClick={() => onOpen(f.slide, f.shape)}>
                abrir
              </Button>
            )}
          </List.Item>
        ))}
      </List>
      {report.findings.length > 40 && (
        <Text size="xs" c="dimmed">
          …e mais {report.findings.length - 40}.
        </Text>
      )}
    </Stack>
  );
}

export function RunA11y({ run, onOpen }: { run: ReportRun; onOpen?: (slide: number, shape: string | null) => void }) {
  const report = useRunA11y(run.id);
  if (report.isLoading) return <Loader size="xs" />;
  return <A11yList report={report.data} onOpen={onOpen} />;
}
