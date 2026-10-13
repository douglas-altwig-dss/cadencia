import { Button, ColorInput, Group, NumberInput, Stack, TagsInput, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { useSaveRole, type RoleInput } from '../../api/planHooks';

export const failure = (title: string) => (error: Error) => notifications.show({ color: 'red', title, message: error.message });

/** A role of the catalogue: name, one-sentence description, colour, order and the Jira labels that mark its work. */
export function RoleForm({ role, onClose }: { role: RoleInput; onClose: () => void }) {
  const save = useSaveRole();
  const [draft, setDraft] = useState<RoleInput>(role);
  const submit = () => save.mutate(draft, { onSuccess: onClose, onError: failure('Função não salva') });
  return (
    <Stack>
      <TextInput label="Nome" value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.currentTarget.value })} required data-autofocus />
      <Textarea
        label="Descrição"
        description="Uma frase, exibida nos cards e nas dicas."
        value={draft.descricao}
        onChange={(e) => setDraft({ ...draft, descricao: e.currentTarget.value })}
        autosize
        minRows={2}
      />
      <Group grow>
        <ColorInput label="Cor" value={draft.cor} onChange={(cor) => setDraft({ ...draft, cor })} format="hex" />
        <NumberInput label="Ordem" value={draft.ordem} onChange={(v) => setDraft({ ...draft, ordem: Number(v) || 0 })} min={0} />
      </Group>
      <TagsInput
        label="Labels ou componentes no Jira"
        description="Uma subtarefa com qualquer um destes é trabalho desta função."
        value={draft.rotulos}
        onChange={(rotulos) => setDraft({ ...draft, rotulos })}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} loading={save.isPending} disabled={!draft.nome.trim()}>
          Salvar
        </Button>
      </Group>
    </Stack>
  );
}
