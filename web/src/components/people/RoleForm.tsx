import { Button, ColorInput, Group, NumberInput, Stack, TagsInput, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { useSaveRole, type RoleInput } from '../../api/planHooks';
import { useT } from '../../i18n';

export const failure = (title: string) => (error: Error) => notifications.show({ color: 'red', title, message: error.message });

/** A role of the catalogue: name, one-sentence description, colour, order and the Jira labels that mark its work. */
export function RoleForm({ role, onClose }: { role: RoleInput; onClose: () => void }) {
  const t = useT();
  const save = useSaveRole();
  const [draft, setDraft] = useState<RoleInput>(role);
  const submit = () => save.mutate(draft, { onSuccess: onClose, onError: failure(t.people.roles.roleNotSaved) });
  return (
    <Stack>
      <TextInput label={t.people.common.name} value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.currentTarget.value })} required data-autofocus />
      <Textarea
        label={t.people.common.description}
        description={t.people.roleForm.descriptionHint}
        value={draft.descricao}
        onChange={(e) => setDraft({ ...draft, descricao: e.currentTarget.value })}
        autosize
        minRows={2}
      />
      <Group grow>
        <ColorInput label={t.people.common.color} value={draft.cor} onChange={(cor) => setDraft({ ...draft, cor })} format="hex" />
        <NumberInput label={t.people.roleForm.order} value={draft.ordem} onChange={(v) => setDraft({ ...draft, ordem: Number(v) || 0 })} min={0} />
      </Group>
      <TagsInput
        label={t.people.roleForm.labels}
        description={t.people.roleForm.labelsHint}
        value={draft.rotulos}
        onChange={(rotulos) => setDraft({ ...draft, rotulos })}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          {t.people.common.cancel}
        </Button>
        <Button onClick={submit} loading={save.isPending} disabled={!draft.nome.trim()}>
          {t.people.common.save}
        </Button>
      </Group>
    </Stack>
  );
}
