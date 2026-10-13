import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';

import { useT } from '../i18n';

/** Past this many characters the text is folded, so a long spec does not push the numbers away. */
const FOLD_AFTER = 900;

type Block = { kind: 'heading' | 'paragraph'; text: string };

/**
 * The Jira description as plain text: blank lines separate paragraphs and lines starting with `#`
 * are headings (see `jira/mapping.adf_text`). Anything else is kept verbatim, line breaks included.
 */
function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
    } else if (trimmed.startsWith('#')) {
      flush();
      blocks.push({ kind: 'heading', text: trimmed.replace(/^#+\s*/, '') });
    } else {
      paragraph.push(line.replace(/\s+$/, ''));
    }
  }
  flush();
  return blocks;
}

/** The item's description, shown on every detail page: epic, story, task, subtask, bug. */
export function ItemDescription({ text }: { text: string | null | undefined }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const value = (text ?? '').trim();
  const long = value.length > FOLD_AFTER;
  const folded = long && !open;

  return (
    <Paper withBorder p="md">
      <Title order={5} mb="xs">
        {t.shell.description.title}
      </Title>
      {value ? (
        <>
          <Stack gap="xs" style={folded ? { maxHeight: '12em', overflow: 'hidden', maskImage: 'linear-gradient(black 70%, transparent)' } : undefined}>
            {blocksOf(value).map((block, i) =>
              block.kind === 'heading' ? (
                <Text key={i} fw={600} size="sm" mt={i ? 'xs' : 0}>
                  {block.text}
                </Text>
              ) : (
                <Text key={i} size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {block.text}
                </Text>
              ),
            )}
          </Stack>
          {long && (
            <Button variant="subtle" size="compact-sm" mt="xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? t.shell.description.showLess : t.shell.description.showAll}
            </Button>
          )}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          {t.shell.description.empty}
        </Text>
      )}
    </Paper>
  );
}
