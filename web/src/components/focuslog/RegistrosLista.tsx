import { Badge, Group, Table, Text, UnstyledButton } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort } from '@tabler/icons-react';

import { useT } from '../../i18n';
import { brDeIso, corDoTema, type CriterioOrdem, type Documento, type Entrada, type Ordem, rotuloPessoa } from '../../lib/focusLog';

/** The records as a table: one row per line of the log, sortable by its column headers. */
export function RegistrosLista({
  entradas,
  documento,
  ordem,
  onOrdem,
  onEditar,
}: {
  entradas: Entrada[];
  documento: Documento;
  ordem: Ordem;
  onOrdem: (criterio: CriterioOrdem, direcao: Ordem['direcao']) => void;
  onEditar: (uid: string) => void;
}) {
  const t = useT();
  // A header sorts by its column first; clicking the column that is already sorted reverses it.
  const clicar = (criterio: CriterioOrdem) =>
    ordem.criterio === criterio ? onOrdem(criterio, ordem.direcao === 'asc' ? 'desc' : 'asc') : onOrdem(criterio, 'asc');

  const cabecalho = (criterio: CriterioOrdem, rotulo: string) => {
    const ativo = ordem.criterio === criterio;
    const Icone = !ativo ? IconArrowsSort : ordem.direcao === 'asc' ? IconArrowUp : IconArrowDown;
    return (
      <Table.Th aria-sort={ativo ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <UnstyledButton onClick={() => clicar(criterio)} className="tf-sort-head" aria-label={t.people.focus.list.sortBy(rotulo)}>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" fw={600} c={ativo ? undefined : 'dimmed'}>
              {rotulo}
            </Text>
            <Icone size={12} aria-hidden />
          </Group>
        </UnstyledButton>
      </Table.Th>
    );
  };

  return (
    <div className="tf-list-wrap">
      <Table verticalSpacing="xs" highlightOnHover striped="odd" aria-label={t.people.focus.list.tableAria} miw={720}>
        <Table.Thead>
          <Table.Tr>
            {cabecalho('data', t.people.focus.sort.data)}
            {cabecalho('pessoa', t.people.focus.sort.pessoa)}
            {cabecalho('tipo', t.people.focus.sort.tipo)}
            {cabecalho('texto', t.people.focus.sort.texto)}
            <Table.Th>
              <Text size="xs" fw={600} c="dimmed">
                {t.people.focus.list.themesAndSignals}
              </Text>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {entradas.map((e) => (
            <Table.Tr key={`${e.uid}-${e.pessoa}`} onClick={() => onEditar(e.uid)} style={{ cursor: 'pointer' }}>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{brDeIso(e.dataIso)}</Table.Td>
              <Table.Td>{rotuloPessoa(e.pessoa)}</Table.Td>
              <Table.Td>{e.tipo === 'troca' ? t.people.focus.page.shift : t.people.focus.page.activity}</Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={2}>
                  {e.texto}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="wrap">
                  {e.temas.map((tema) => (
                    <Badge
                      key={`t-${tema}`}
                      size="xs"
                      variant="light"
                      color="gray"
                      styles={{ root: { textTransform: 'none' } }}
                      leftSection={<span className="tf-dot" style={{ background: corDoTema(documento, tema) }} aria-hidden />}
                    >
                      {tema}
                    </Badge>
                  ))}
                  {e.tags.map((tag) => (
                    <Badge key={`s-${tag}`} size="xs" variant="outline" styles={{ root: { textTransform: 'none' } }}>
                      {tag}
                    </Badge>
                  ))}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
