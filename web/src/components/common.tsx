import {
  Alert,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Group,
  Menu,
  Modal,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconDownload, IconExternalLink, IconInbox, IconInfoCircle, IconPlugConnectedX } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { ApiError, exportUrl } from '../api/client';
import type { Category, Distribution, Freshness as FreshnessData, IssueBrief, Progress as ProgressData } from '../api/types';
import { t as messages, useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { fmtDateTime, fmtNum, fmtPct, fromNow } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';

export function PageHeader({
  title,
  subtitle,
  crumbs,
  actions,
  documentTitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  crumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
  /** The browser tab's title when ``title`` is not plain text. */
  documentTitle?: string;
}) {
  const t = useT();
  const { carry } = useFilters();
  // The tab, the history and a screen reader's page announcement all say where you are.
  const named = documentTitle ?? (typeof title === 'string' ? title : undefined);
  useEffect(() => {
    document.title = named ? `${named} · Cadência` : 'Cadência';
  }, [named]);
  return (
    <Stack gap={4} mb="lg">
      {crumbs && crumbs.length > 0 && (
        <Breadcrumbs aria-label={t.shell.common.breadcrumbs} separator="/" separatorMargin={6}>
          {crumbs.map((c) =>
            c.to ? (
              <Anchor key={c.label} component={Link} to={carry(c.to)} size="xs" c="dimmed" underline="hover">
                {c.label}
              </Anchor>
            ) : (
              <Text key={c.label} size="xs" fw={500} aria-current="page">
                {c.label}
              </Text>
            ),
          )}
        </Breadcrumbs>
      )}
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md" className="mobile-stack">
        <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
          <Title order={2}>{title}</Title>
          {subtitle && (
            // A div, not a p: some screens pass a layout (a Group) as the subtitle.
            <Text c="dimmed" size="sm" component="div" maw={820}>
              {subtitle}
            </Text>
          )}
        </Stack>
        {actions && (
          <Group gap="xs" wrap="wrap">
            {actions}
          </Group>
        )}
      </Group>
    </Stack>
  );
}

/** RF-35: every screen states when the data was collected; stale or failed data is never silent. */
export function Freshness({ freshness }: { freshness?: FreshnessData }) {
  const t = useT();
  if (!freshness) return null;
  const last = freshness.last_success_at;
  const state = freshness.last_error ? 'red' : freshness.stale ? 'yellow' : 'teal';
  return (
    <Stack gap="xs" mb="md">
      <Group gap={6} w="fit-content" wrap="nowrap">
        <Box w={7} h={7} style={{ borderRadius: 99, background: `var(--mantine-color-${state}-6)` }} aria-hidden />
        <Text size="xs" c="dimmed">
          {t.shell.common.collectedAt(fromNow(last))}
          {last ? ` · ${fmtDateTime(last)}` : ''}
        </Text>
        <InfoTip label={HELP['freshness']} about={t.shell.common.freshness} />
      </Group>
      {freshness.last_error && (
        <Alert color="red" variant="light" icon={<IconPlugConnectedX size={18} />} title={t.shell.common.lastFailedTitle}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{t.shell.common.lastFailedBody(freshness.last_error)}</Text>
            <Button component={Link} to="/status" size="xs" variant="light">
              {t.shell.common.openStatus}
            </Button>
          </Stack>
        </Alert>
      )}
      {!freshness.last_error && freshness.stale && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title={t.shell.common.staleTitle}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{t.shell.common.staleBody(fromNow(last))}</Text>
            <Button component={Link} to="/status" size="xs" variant="light">
              {t.shell.common.openStatus}
            </Button>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

export function ErrorState({ error, title: given }: { error: unknown; title?: string }) {
  const t = useT();
  const title = given ?? t.shell.common.loadFailed;
  const apiError = error instanceof ApiError ? error : null;
  return (
    <Alert color="red" variant="light" title={apiError ? `${title}: ${apiError.reason}` : title} icon={<IconAlertTriangle size={18} />}>
      <Stack gap={4}>
        <Text size="sm">{apiError?.message ?? String(error)}</Text>
        {apiError?.action && (
          <Text size="sm" fw={500}>
            {t.shell.common.whatToDo(apiError.action)}
          </Text>
        )}
      </Stack>
    </Alert>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  const t = useT();
  return (
    <Stack gap="xs" aria-busy="true" aria-label={t.shell.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={28} />
      ))}
    </Stack>
  );
}

export interface EmptyAction {
  label: string;
  to?: string;
  onClick?: () => void;
}

/**
 * RF-84: an empty screen says why it is empty and offers the one step that fills it. A blank table
 * with no explanation reads as "broken"; the reason plus a button reads as "not yet".
 */
export function Empty({
  title,
  children,
  action,
  secondary,
}: {
  title: string;
  children?: ReactNode;
  action?: EmptyAction;
  secondary?: EmptyAction;
}) {
  const button = (item: EmptyAction, primary: boolean) =>
    item.to ? (
      <Button component={Link} to={item.to} size="xs" variant={primary ? 'filled' : 'default'}>
        {item.label}
      </Button>
    ) : (
      <Button onClick={item.onClick} size="xs" variant={primary ? 'filled' : 'default'}>
        {item.label}
      </Button>
    );
  return (
    <Paper withBorder p="xl">
      <Group align="flex-start" wrap="nowrap" gap="md">
        <ThemeIcon variant="light" size={40} radius="md" aria-hidden>
          <IconInbox size={22} />
        </ThemeIcon>
        <Stack gap={6} align="flex-start">
          <Text fw={600}>{title}</Text>
          {children && (
            <Text size="sm" c="dimmed" maw={640}>
              {children}
            </Text>
          )}
          {(action || secondary) && (
            <Group gap="xs" mt={6}>
              {action && button(action, true)}
              {secondary && button(secondary, false)}
            </Group>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}

export function Note({ children, title, color = 'petrol' }: { children: ReactNode; title?: string; color?: string }) {
  return (
    <Alert variant="light" color={color} icon={<IconInfoCircle size={18} />} title={title} className={color === 'petrol' ? 'note' : undefined}>
      <Text size="sm" component="div">
        {children}
      </Text>
    </Alert>
  );
}

export function IssueLink({ issue, showSummary = true }: { issue: Pick<IssueBrief, 'key' | 'summary' | 'url'>; showSummary?: boolean }) {
  const t = useT();
  const { carry } = useFilters();
  return (
    <Group gap={6} wrap="nowrap">
      <Anchor component={Link} to={carry(`/issues/${issue.key}`)} className="mono">
        {issue.key}
      </Anchor>
      {showSummary && (
        <Text size="sm" lineClamp={1}>
          {issue.summary}
        </Text>
      )}
      {issue.url && (
        <Anchor href={issue.url} target="_blank" rel="noreferrer" aria-label={t.shell.common.openInJira(issue.key)} c="dimmed">
          <IconExternalLink size={14} />
        </Anchor>
      )}
    </Group>
  );
}

const CATEGORY_COLOR: Record<Category, string> = { new: 'gray', indeterminate: 'petrol', done: 'teal' };

/** An item's own Jira status, coloured by its status *category* — "Em andamento" reads the same
 * petrol everywhere even though two boards never name their own "in progress" column the same way. */
export function IssueStatusBadge({ status, category }: { status: string; category: Category }) {
  return (
    <Badge size="xs" variant="light" color={CATEGORY_COLOR[category]}>
      {status}
    </Badge>
  );
}

/** A flat list of keys, each resolved to its own `IssueLink` when its brief was fetched. */
export function KeyList({ keys, items }: { keys: string[]; items: Record<string, IssueBrief> }) {
  const t = useT();
  if (!keys.length) return <Text size="sm" c="dimmed">{t.shell.common.none}</Text>;
  return (
    <Stack gap={2}>
      {keys.map((k) => (items[k] ? <IssueLink key={k} issue={items[k]} /> : <Text key={k} size="sm" className="mono">{k}</Text>))}
    </Stack>
  );
}

/** One item with its own status beside it, or one "nenhum". */
export function KeyRow({ k, items }: { k: string; items: Record<string, IssueBrief> }) {
  const issue = items[k];
  if (!issue) return <Text size="sm" className="mono">{k}</Text>;
  return (
    <Group gap={6} wrap="nowrap" justify="space-between">
      <IssueLink issue={issue} />
      <IssueStatusBadge status={issue.status} category={issue.category} />
    </Group>
  );
}

/**
 * RF-112: a list of keys grouped under their epic when there is a link to one — a story and the
 * epic it belongs to read as one unit instead of two same-looking rows. Only standard-level items
 * ever reach a sprint's or a board's own window list (subtasks travel with their parent, the rule
 * used throughout the app), so one level of grouping, story or task under epic, is the whole of
 * it. An item whose epic was not itself fetched (the caller's own `items` dict, widened to include
 * it — `sprint_overview`/`board_overview` both do) falls back to the flat row it always was.
 */
export function GroupedKeyList({ keys, items }: { keys: string[]; items: Record<string, IssueBrief> }) {
  const t = useT();
  if (!keys.length) return <Text size="sm" c="dimmed">{t.shell.common.none}</Text>;
  const groups = new Map<string, string[]>();
  const loose: string[] = [];
  for (const k of keys) {
    const parent = items[k]?.parent_key;
    if (parent && items[parent]) {
      const group = groups.get(parent);
      if (group) group.push(k);
      else groups.set(parent, [k]);
    } else {
      loose.push(k);
    }
  }
  if (groups.size === 0) {
    return (
      <Stack gap={2}>
        {keys.map((k) => <KeyRow key={k} k={k} items={items} />)}
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      {[...groups.entries()].map(([epicKey, childKeys]) => (
        <Stack key={epicKey} gap={2}>
          <Group gap={6} wrap="nowrap" justify="space-between">
            <Group gap={6} wrap="nowrap">
              <Badge size="xs" variant="light" color="gray">
                {t.shell.common.epic}
              </Badge>
              <IssueLink issue={items[epicKey]} />
            </Group>
            <IssueStatusBadge status={items[epicKey].status} category={items[epicKey].category} />
          </Group>
          <Stack gap={2} pl="md" style={{ borderLeft: '2px solid var(--border-soft)' }}>
            {childKeys.map((k) => <KeyRow key={k} k={k} items={items} />)}
          </Stack>
        </Stack>
      ))}
      {loose.map((k) => <KeyRow key={k} k={k} items={items} />)}
    </Stack>
  );
}

export function ProgressBars({
  progress,
  compact = false,
  elapsed,
}: {
  progress: ProgressData | null;
  compact?: boolean;
  /** How much of the sprint's time has passed, 0 to 1: a mark on the items bar to read the work against. */
  elapsed?: number | null;
}) {
  const t = useT();
  if (!progress || progress.total === 0) return <Text size="sm" c="dimmed">—</Text>;
  const count = (progress.count_ratio ?? 0) * 100;
  const estimate = (progress.estimate_ratio ?? 0) * 100;
  const countLabel = t.shell.common.itemsDone(fmtPct(progress.count_ratio));
  return (
    <Stack gap={4} miw={compact ? 150 : 200}>
      <Group gap="xs" wrap="nowrap">
        <Box style={{ flex: 1, position: 'relative' }}>
          <Progress
            value={count}
            size="sm"
            aria-label={elapsed == null ? countLabel : t.shell.common.sprintElapsed(countLabel, Math.round(elapsed * 100))}
          />
          {elapsed != null && (
            <span
              aria-hidden
             
              style={{ position: 'absolute', top: -3, bottom: -3, left: `${elapsed * 100}%`, width: 2, borderRadius: 1, background: 'var(--mantine-color-text)' }}
            />
          )}
        </Box>
        <Text size="xs" className="num" w={88}>
          {t.shell.common.itemsCount(progress.done, progress.total)}
        </Text>
      </Group>
      <Group gap="xs" wrap="nowrap">
        <Progress
          value={estimate}
          size="sm"
          color="gray"
          style={{ flex: 1 }}
          aria-label={t.shell.common.estimateDone(fmtPct(progress.estimate_ratio))}
        />
        <Text size="xs" className="num" w={88}>
          {t.shell.common.points(fmtNum(progress.estimate_done), fmtNum(progress.estimate_total))}
        </Text>
      </Group>
      {progress.coverage_warning && (
        <Group gap={4} wrap="nowrap">
          <Badge variant="outline" color="yellow" size="xs" leftSection={<IconAlertTriangle size={10} />}>
            {t.shell.common.coverage(fmtPct(progress.coverage))}
          </Badge>
          <InfoTip label={`${HELP['progress:coverage']}\n\n${progress.coverage_warning}`} about={t.shell.common.coverageAbout} width={280} />
        </Group>
      )}
    </Stack>
  );
}

/** RF-22: percentiles always with the sample size; small samples are flagged. */
export function Percentiles({ dist, unit: given }: { dist: Distribution; unit?: string }) {
  const t = useT();
  const unit = given ?? t.shell.format.dayUnit;
  if (!dist.n) return <Text size="sm" c="dimmed">{t.shell.common.noSample}</Text>;
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="sm" className="num">
        P50 <b>{fmtNum(dist.p50)}</b> · P85 <b>{fmtNum(dist.p85)}</b> · P95 <b>{fmtNum(dist.p95)}</b> {unit}
      </Text>
      <Text size="xs" c="dimmed">
        n={dist.n}
      </Text>
      {dist.low_confidence && (
        <Group gap={4} wrap="nowrap">
          <Badge size="xs" variant="outline" color="yellow">
            {t.shell.common.lowConfidence}
          </Badge>
          <InfoTip label={HELP['sample:low']} about={t.shell.common.sampleConfidence} />
        </Group>
      )}
    </Group>
  );
}

/**
 * The small "i" that explains how a number is calculated. A real button, so a keyboard reaches it: it
 * opens on hover and on focus. Hover does not exist on a touch screen (and Mantine's own touch mode
 * closes the tooltip as soon as the finger lifts), so a click — which a tap is — pins it open until the
 * next tap elsewhere or Escape. ``about`` names the indicator for a screen reader.
 *
 * ``nested`` is for an "i" that sits inside something already clickable, where a second button would
 * be a button inside a button: it becomes a plain hover-only mark.
 */
export function InfoTip({ label, width = 320, about, nested = false }: { label: ReactNode; width?: number; about?: string; nested?: boolean }) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const away = (event: Event) => {
      if (!button.current?.contains(event.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [pinned]);

  const name = about ? t.shell.common.howCalculated(about) : t.shell.common.moreInfo;
  // A long explanation reads better as paragraphs: a blank line in the text starts a new one.
  const body =
    typeof label === 'string' && label.includes('\n\n') ? (
      <Stack gap={6}>
        {label.split('\n\n').map((paragraph) => (
          <Text key={paragraph} size="sm" inherit>
            {paragraph}
          </Text>
        ))}
      </Stack>
    ) : (
      label
    );
  if (nested) {
    return (
      <Tooltip label={body} multiline w={width} withArrow>
        <span role="img" aria-label={name} className="info-tip">
          <IconInfoCircle size={14} aria-hidden />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={body} multiline w={width} withArrow position="top" opened={hover || focus || pinned}>
      <button
        ref={button}
        type="button"
        className="info-tip"
        aria-label={name}
        aria-expanded={hover || focus || pinned}
        onPointerEnter={(event) => event.pointerType === 'mouse' && setHover(true)}
        onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
        }}
        onClick={() => {
          // A second click closes it even though the button still has focus, which would keep it open.
          if (pinned) {
            setPinned(false);
            setFocus(false);
            setHover(false);
          } else {
            setPinned(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setHover(false);
            setFocus(false);
            setPinned(false);
          }
        }}
      >
        <IconInfoCircle size={14} aria-hidden />
      </button>
    </Tooltip>
  );
}

/**
 * A label and its "i" kept together: the icon travels with the last word, so a label that wraps
 * never leaves the icon alone on a line of its own. Without help it is just the text.
 */
export function Tipped({ children, help, about, width }: { children: string; help?: ReactNode; about?: string; width?: number }) {
  if (!help) return <>{children}</>;
  const cut = children.lastIndexOf(' ');
  const head = cut < 0 ? '' : `${children.slice(0, cut)} `;
  const tail = cut < 0 ? children : children.slice(cut + 1);
  return (
    <>
      {head}
      <span className="nowrap">
        {tail}
        <InfoTip label={help} about={about ?? children} width={width} />
      </span>
    </>
  );
}

/** One indicator: a quiet label, the number, then whatever qualifies it. ``aside`` holds a sparkline. */
export function KpiCard({
  label,
  value,
  children,
  aside,
  help,
}: {
  label: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  /** How the number is calculated: shown as an "i" beside the label. */
  help?: ReactNode;
}) {
  return (
    <Paper withBorder p="md" h="100%">
      <Stack gap={6}>
        {/* The label has the whole width, so it rarely wraps and the numbers below line up across cards. */}
        <Text className="kpi-label" component="div">
          {typeof label === 'string' ? (
            <Tipped help={help}>{label}</Tipped>
          ) : (
            <>
              {label}
              {help && <InfoTip label={help} />}
            </>
          )}
        </Text>
        {(value !== undefined || aside) && (
          <Group justify="space-between" align="flex-end" wrap="nowrap" gap="xs">
            {value !== undefined && (
              <Text className="kpi-value num" ta="left" component="div">
                {value}
              </Text>
            )}
            {aside}
          </Group>
        )}
        {children && (
          <Text size="xs" c="dimmed" component="div">
            {children}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

export function Stat({ label, value, hint, help }: { label: string; value: ReactNode; hint?: ReactNode; help?: ReactNode }) {
  return (
    <KpiCard label={label} value={value} help={help}>
      {hint}
    </KpiCard>
  );
}

interface ConfirmRequest {
  title: string;
  /** The consequence, in words: what is lost and whether it can be undone. */
  body: ReactNode;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

/**
 * M23: every deletion asks first, in the same dialog. ``confirm`` resolves to whether the person
 * agreed; render ``dialog`` once in the component that calls it.
 */
export function useConfirm() {
  const t = useT();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirm = useCallback(
    (options: Omit<ConfirmRequest, 'resolve'>) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );
  const settle = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };
  const dialog = (
    <Modal opened={request !== null} onClose={() => settle(false)} title={request?.title} size="sm" centered>
      <Stack gap="md">
        <Text size="sm">{request?.body}</Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => settle(false)}>
            {t.shell.common.cancel}
          </Button>
          <Button color="red" onClick={() => settle(true)}>
            {request?.confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
  return { confirm, dialog };
}

/** M23: an item removed at once, with a way back for a few seconds (``undo`` repeats the create). */
export function notifyUndo(title: string, undo: () => void) {
  const id = `undo-${Date.now()}`;
  notifications.show({
    id,
    title,
    message: (
      <Button
        size="compact-xs"
        variant="subtle"
        onClick={() => {
          notifications.hide(id);
          undo();
        }}
      >
        {messages().shell.common.undo}
      </Button>
    ),
    autoClose: 8000,
  });
}

export function ExportMenu({
  dataset,
  params,
  label,
}: {
  dataset: string;
  params: Record<string, string | number | undefined>;
  label?: string;
}) {
  const t = useT();
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
          {label ?? t.shell.common.export}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component="a" href={exportUrl(dataset, { ...params, format: 'csv' })}>
          {t.shell.common.csv}
        </Menu.Item>
        <Menu.Item component="a" href={exportUrl(dataset, { ...params, format: 'json' })}>
          JSON
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
