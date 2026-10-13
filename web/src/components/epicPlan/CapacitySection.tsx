import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import type { EpicPlanView } from '../../api/types';
import { useT } from '../../i18n';
import { fmtNum, fmtPct } from '../../lib/format';
import { Note } from '../common';
import { MemberSelection } from './MemberSelection';
import { FloatingMark, hours, rich, RoleChip, roleIndex } from './shared';

export function CapacitySection({ view }: { view: EpicPlanView }) {
  const t = useT();
  const m = t.epicPlan.capacity;
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
        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={18} />} title={m.uncoveredTitle}>
          {uncovered.map((r) => (
            <Text size="sm" key={r.papel_id}>
              {rich(m.uncovered(roles.get(r.papel_id)?.nome ?? '', r.subtarefas_afetadas.join(', ')))}
            </Text>
          ))}
        </Alert>
      )}

      <Title order={4} mt="xs">
        {m.byRole}
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
                  {m.perWeek(fmtNum(entry.potencial))}
                </Text>
                <Text size="xs" c="dimmed">
                  {m.peopleInRole(entry.membros.length)}
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
        <Note title={m.floatingTitle}>
          {m.floatingNote(
            capacity.flutuantes
              .map((id) => {
                const member = members.get(id);
                return member ? `${member.nome} (${member.papeis.map((p) => roles.get(p.papel_id)?.nome).join(' + ')})` : id;
              })
              .join(', '),
            t.epicPlan.tips.floating,
            fmtNum(capacity.real),
          )}
        </Note>
      )}

      <Title order={4} mt="xs">
        {m.byMember}
      </Title>
      {view.plano ? (
        <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={600} mb={0}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{m.member}</Table.Th>
                <Table.Th>{m.roles}</Table.Th>
                <Table.Th className="num">{m.capacity}</Table.Th>
                {weeks.map((w) => (
                  <Table.Th key={w.indice} className="num">
                    {m.week(w.semana)}
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
                    <Table.Td className="num">{m.perWeekShort(hours(row.capacidade_semanal))}</Table.Td>
                    {weeks.map((w) => {
                      const cell = load.get(w.semana);
                      const over = (cell?.ocupacao ?? 0) > 1;
                      return (
                        <Table.Td key={w.indice} className="num">
                          {cell ? (
                            <Tooltip label={m.loadTooltip(hours(cell.horas), hours(row.capacidade_semanal))} withArrow>
                              {over ? (
                                <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />} tt="none">
                                  {m.over(fmtPct(cell.ocupacao))}
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
          {m.noPlan}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {m.footer(view.plano?.origem === 'armazenado')}
      </Text>
    </Stack>
  );
}
