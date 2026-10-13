import { Alert, Anchor, Button, Code, Group, List, MultiSelect, Paper, Stack, Stepper, Text, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconCheck, IconPlugConnected } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useBoards, useCollect, useConnectionTest, useDiscovery, useHealth, useSaveSelection, useStatus } from '../api/hooks';
import { CollectionProgress } from '../components/CollectionProgress';
import { ErrorState, PageHeader } from '../components/common';

/**
 * RF-79: the first run as a guided path — connect, discover, choose boards, collect, then the deck —
 * instead of a README and a terminal (the M0 milestone). Each step unlocks the next and says what
 * it did; the position is remembered, and a step already satisfied (Jira configured, boards chosen,
 * a collection done) is recognised rather than asked again.
 */
export function WizardPage() {
  const navigate = useNavigate();
  const health = useHealth();
  const status = useStatus();
  const test = useConnectionTest();
  const discover = useDiscovery();
  const boards = useBoards('', 1, 200);
  const select = useSaveSelection();
  const collect = useCollect();
  const [step, setStep] = useLocalStorage({ key: 'cadencia-inicio-passo', defaultValue: 0, getInitialValueInEffect: false });
  const [chosen, setChosen] = useState<string[]>([]);

  const selected = useMemo(() => (boards.data?.items ?? []).filter((b) => b.selected).map((b) => String(b.id)), [boards.data]);
  useEffect(() => {
    if (selected.length && !chosen.length) setChosen(selected);
  }, [selected, chosen.length]);

  const collected = (status.data?.runs ?? []).some((r) => r.status === 'success' || r.status === 'partial');
  const configured = health.data?.jira_configured ?? false;

  const options = (boards.data?.spaces ?? []).map((group) => ({
    group: group.space.name ?? 'Sem espaço',
    items: group.boards.map((b) => ({ value: String(b.id), label: `${b.name} (${b.type})` })),
  }));

  return (
    <>
      <PageHeader
        title="Primeiros passos"
        subtitle="Do Jira à primeira apresentação em cinco passos. Nada aqui escreve no Jira: a Cadência só lê."
        actions={
          <Button variant="subtle" size="xs" onClick={() => navigate('/')}>
            Pular e ir para o painel
          </Button>
        }
      />
      <Paper withBorder p="lg">
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label="Conexão" description="credencial do Jira" completedIcon={<IconCheck size={16} />}>
            <Stack gap="sm" mt="md">
              {!configured ? (
                <Alert color="yellow" variant="light" title="O Jira ainda não está configurado">
                  <Text size="sm">Defina três valores no arquivo <Code>.env</Code> (ou como segredo) e reinicie a API:</Text>
                  <List size="sm" mt={4}>
                    <List.Item><Code>CADENCIA_JIRA_BASE_URL</Code> — ex.: https://sua-empresa.atlassian.net</List.Item>
                    <List.Item><Code>CADENCIA_JIRA_EMAIL</Code> — a conta que lê os boards</List.Item>
                    <List.Item><Code>CADENCIA_JIRA_API_TOKEN</Code> — de preferência em <Code>secrets/jira_api_token</Code></List.Item>
                  </List>
                  <Text size="sm" mt={4}>
                    Sem credenciais ainda? Rode <Code>make demo</Code> para explorar com dados fictícios.
                  </Text>
                </Alert>
              ) : (
                <Text size="sm">
                  Instância: <b>{health.data?.jira_base_url ?? 'configurada'}</b>. Teste se a credencial abre os projetos.
                </Text>
              )}
              <Group>
                <Button leftSection={<IconPlugConnected size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!configured}>
                  Testar conexão
                </Button>
                <Button variant="default" disabled={!test.data?.ok} onClick={() => setStep(1)}>
                  Continuar
                </Button>
              </Group>
              {test.data?.ok && (
                <Alert color="teal" variant="light">
                  Conectado como {test.data.identity?.name}. Permissão de leitura: {test.data.permissions?.BROWSE_PROJECTS ? 'sim' : 'não'}.
                </Alert>
              )}
              {test.data && !test.data.ok && (
                <Alert color="red" variant="light" title={test.data.error?.cause ?? 'Falhou'}>
                  {test.data.error?.message} {test.data.error?.action}
                </Alert>
              )}
              {test.error && <ErrorState error={test.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Descoberta" description="boards e campos">
            <Stack gap="sm" mt="md">
              <Text size="sm">Lê os boards visíveis para a conta e encontra os campos customizados (pontos, sprint, épico, impedimento).</Text>
              <Group>
                <Button onClick={() => discover.mutate()} loading={discover.isPending}>
                  Descobrir
                </Button>
                <Button variant="default" disabled={!discover.data && !(boards.data?.total ?? 0)} onClick={() => setStep(2)}>
                  Continuar
                </Button>
              </Group>
              {discover.data && (
                <Alert color="teal" variant="light">
                  {discover.data.boards.length} boards em {discover.data.spaces.length} espaços.
                  {discover.data.missing_fields.length > 0 && (
                    <>
                      {' '}Campos não encontrados: {discover.data.missing_fields.join(', ')} —{' '}
                      <Anchor component={Link} to="/configuracao?tab=campos">informe manualmente</Anchor>.
                    </>
                  )}
                </Alert>
              )}
              {discover.error && <ErrorState error={discover.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Boards" description="o que acompanhar">
            <Stack gap="sm" mt="md">
              <MultiSelect
                label="Boards acompanhados"
                description="Agrupados pelo espaço (time) a que pertencem. Dá para mudar depois em Configuração."
                data={options}
                value={chosen}
                onChange={setChosen}
                searchable
                maw={640}
              />
              <Group>
                <Button
                  disabled={!chosen.length}
                  loading={select.isPending}
                  onClick={() => select.mutate(chosen.map(Number), { onSuccess: () => setStep(3) })}
                >
                  Salvar e continuar
                </Button>
              </Group>
              {select.error && <ErrorState error={select.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Primeira coleta" description="histórico completo">
            <Stack gap="sm" mt="md">
              <Text size="sm">
                A primeira coleta lê o histórico inteiro de cada item e congela os checkpoints passados. Pode levar alguns minutos em
                boards grandes; o progresso aparece abaixo.
              </Text>
              <Group>
                <Button onClick={() => collect.mutate({ mode: 'full' })} loading={collect.isPending} disabled={status.data?.collecting}>
                  Coletar agora
                </Button>
                <Button variant="default" disabled={!collected} onClick={() => setStep(4)}>
                  Continuar
                </Button>
              </Group>
              <CollectionProgress />
              {collected && !status.data?.collecting && <Alert color="teal" variant="light">Coleta concluída. Os painéis já têm dados.</Alert>}
              {collect.error && <ErrorState error={collect.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Apresentação" description="o modelo da empresa">
            <Stack gap="sm" mt="md">
              <Title order={5}>Última etapa: o modelo .pptx</Title>
              <Text size="sm">
                Envie o modelo da apresentação de sexta. A Cadência sugere onde cada dado entra; você revisa no editor e gera.
              </Text>
              <Group>
                <Button component={Link} to="/apresentacao" onClick={() => setStep(5)}>
                  Abrir a apresentação
                </Button>
                <Button variant="default" onClick={() => (setStep(5), navigate('/'))}>
                  Deixar para depois
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
          <Stepper.Completed>
            <Stack gap="sm" mt="md" align="flex-start">
              <Text>Tudo pronto. A coleta roda sozinha a cada hora e congela os checkpoints no horário de cada board.</Text>
              <Button component={Link} to="/">
                Ir para o painel
              </Button>
            </Stack>
          </Stepper.Completed>
        </Stepper>
      </Paper>
    </>
  );
}
