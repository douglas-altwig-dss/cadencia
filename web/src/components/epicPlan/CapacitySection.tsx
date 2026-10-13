import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import type { EpicPlanView } from '../../api/types';
import { fmtNum, fmtPct } from '../../lib/format';
import { Note } from '../common';
import { MemberSelection } from './MemberSelection';
import { FloatingMark, hours, plural, RoleChip, roleIndex, TIPS } from './shared';

export function CapacitySection({ view }: { view: EpicPlanView }) {
  const roles = roleIndex(view);
  const members = new Map(view.membros.map((m) => [m.id, m]));
  const capacity = view.capacidade;
  const floating = new Set(capacity.flutuantes);
  const uncovered = capacity.por_papel.filter((r) => r.sem_membro && r.subtarefas_afetadas.length > 0);
  const weeks = view.plano?.semanas ?? [];

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <MemberSelection view={view} layout="chips" />
      </Paper>
      {uncovered.length > 0 && (
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title="Papel sem ninguém selecionado">
          {uncovered.map((r) => (
            <Text size="sm" key={r.papel_id}>
              <b>{roles.get(r.papel_id)?.nome}</b>: {r.subtarefas_afetadas.join(', ')} ficam sem quem as faça.
            </Text>
          ))}
        </Alert>
      )}

      <Title order={4} mt="xs">
        Por papel
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        {capacity.por_papel.map((entry) => {
          const role = roles.get(entry.papel_id);
          if (!role) return null;
          return (
            <Paper key={role.id} withBorder p="sm" style={{ borderTop: `4px solid ${role.cor}` }}>
              <Stack gap={6}>
                <Text size="xs" fw={700} tt="uppercase" style={{ letterSpacing: '0.03em' }}>
                  {role.nome}
                </Text>
                <Text size="xs" c="dimmed">
                  {role.descricao}
                </Text>
                <Text fw={700} fz="lg">
                  {fmtNum(entry.potencial)}h/semana
                </Text>
                <Text size="xs" c="dimmed">
                  {plural(entry.membros.length, 'pessoa neste papel', 'pessoas neste papel')}
                </Text>
                <Group gap={4}>
                  {entry.membros.map((id) => (
                    <Badge key={id} variant="default" tt="none" rightSection={floating.has(id) ? <FloatingMark /> : undefined}>
                      {members.get(id)?.nome ?? id}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
      {capacity.flutuantes.length > 0 && (
        <Note title="Capacidade flutuante">
          {capacity.flutuantes
            .map((id) => {
              const m = members.get(id);
              return m ? `${m.nome} (${m.papeis.map((p) => roles.get(p.papel_id)?.nome).join(' + ')})` : id;
            })
            .join(', ')}{' '}
          cobrem mais de um papel, por isso aparecem com ⇄ em cada um. {TIPS.floating} A capacidade real (
          {fmtNum(capacity.real)}h/semana) conta cada pessoa uma vez; os cards por papel mostram o máximo que cada área
          receberia se toda a capacidade dessas pessoas fosse para ela.
        </Note>
      )}

      <Title order={4} mt="xs">
        Por membro
      </Title>
      {view.plano ? (
        <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={600} mb={0}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Membro</Table.Th>
                <Table.Th>Papéis</Table.Th>
                <Table.Th className="num">Capacidade</Table.Th>
                {weeks.map((w) => (
                  <Table.Th key={w.indice} className="num">
                    Semana {w.semana}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {capacity.por_membro.map((row) => {
                const member = members.get(row.membro_id);
                const load = new Map(row.semanas.map((s) => [s.semana, s]));
                return (
                  <Table.Tr key={row.membro_id}>
                    <Table.Td>{member?.nome ?? row.membro_id}</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {member?.papeis.map((p) => {
                          const role = roles.get(p.papel_id);
                          return role && <RoleChip key={role.id} role={role} />;
                        })}
                      </Group>
                    </Table.Td>
                    <Table.Td className="num">{hours(row.capacidade_semanal)}/sem</Table.Td>
                    {weeks.map((w) => {
                      const cell = load.get(w.semana);
                      const over = (cell?.ocupacao ?? 0) > 1;
                      return (
                        <Table.Td key={w.indice} className="num">
                          {cell ? (
                            <Tooltip label={`${hours(cell.horas)} de ${hours(row.capacidade_semanal)}`} withArrow>
                              {over ? (
                                <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />} tt="none">
                                  {fmtPct(cell.ocupacao)} · acima de 100%
                                </Badge>
                              ) : (
                                <Text size="sm" span>
                                  {hours(cell.horas)} · {fmtPct(cell.ocupacao)}
                                </Text>
                              )}
                            </Tooltip>
                          ) : (
                            <Text size="sm" c="dimmed" span>
                              —
                            </Text>
                          )}
                        </Table.Td>
                      );
                    })}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        </Paper>
      ) : (
        <Text size="sm" c="dimmed">
          A ocupação por semana aparece quando houver um plano — veja os bloqueios na seção Planejamento.
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Ocupação calculada pelo {view.plano?.origem === 'armazenado' ? 'último plano gerado' : 'plano guloso da seleção atual'}. Alocação
        teórica por heurística ou solver: é uma base para conversa, não uma verdade.
      </Text>
    </Stack>
  );
}
