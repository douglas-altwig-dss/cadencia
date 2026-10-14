import { Badge, Box, Button } from '@mantine/core';
import { IconPlugConnected, IconPlugConnectedX, IconWand } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, Navigate } from 'react-router';

import { useConfig, useHealth } from '../api/hooks';
import { PageHeader, useConfirm } from '../components/common';
import { NotificationsSettings } from '../components/NotificationsSettings';
import { PlanParametersSettings } from '../components/PlanParametersSettings';
import { BoardsTab } from '../components/settings/BoardsTab';
import { FieldsTab } from '../components/settings/FieldsTab';
import { ProfileTab, discardDialog } from '../components/settings/ProfileTab';
import { SettingsNav } from '../components/settings/SettingsNav';
import { SystemSection } from '../components/settings/SystemSection';
import { isSection, isSystemSection, type SectionId } from '../components/settings/sections';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';

/**
 * Configuração: the runtime configuration that used to live in `.env` (System), what Cadência reads
 * from Jira (Jira data) and what it delivers (Delivery), one section at a time beside a side index.
 * `?tab=` names the section, with the values the old tab bar used, so older links still land.
 */
export function SettingsPage() {
  const { get, set } = useFilters();
  const { confirm, dialog: confirmDialog } = useConfirm();
  // Whether the open section holds unsaved edits; sections with a draft report it.
  const [dirty, setDirty] = useState(false);
  const t = useT();
  const m = t.tracking.settings;
  const c = t.config;
  const config = useConfig();
  const health = useHealth();
  const requested = get('tab') ?? 'conexao';
  // Absences are the team's, so they live on Pessoas now; an old link lands there.
  if (requested === 'ausencias') return <Navigate to="/pessoas?ausencias=1" replace />;
  const tab: SectionId = isSection(requested) ? requested : 'conexao';

  // Leaving a section with unsaved edits asks first.
  const goTo = async (value: SectionId) => {
    if (value === tab) return;
    const dialog = tab === 'perfil' ? discardDialog(m) : { title: c.page.discardTitle, body: c.page.discardBody, confirmLabel: c.page.discardLabel };
    if (dirty && !(await confirm(dialog))) return;
    set({ tab: value });
  };

  const jiraConfigured = config.data?.jira_configured ?? health.data?.jira_configured;
  const actions = (
    <>
      {jiraConfigured !== undefined && (
        <Badge
          size="lg"
          variant="light"
          color={jiraConfigured ? 'teal' : 'gray'}
          leftSection={jiraConfigured ? <IconPlugConnected size={14} /> : <IconPlugConnectedX size={14} />}
        >
          {jiraConfigured ? c.page.jiraConnected : c.page.jiraNotConfigured}
        </Badge>
      )}
      <Button component={Link} to="/configuracao/assistente" variant="default" leftSection={<IconWand size={16} />}>
        {c.page.wizard}
      </Button>
    </>
  );

  let content;
  if (isSystemSection(tab)) content = <SystemSection key={tab} section={tab} onDirtyChange={setDirty} />;
  else if (tab === 'boards') content = <BoardsTab />;
  else if (tab === 'campos') content = <FieldsTab />;
  else if (tab === 'perfil') content = <ProfileTab onDirtyChange={setDirty} />;
  else if (tab === 'notificacoes') content = <NotificationsSettings />;
  else content = <PlanParametersSettings />;

  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} actions={actions} />
      <Box className="settings-layout">
        <SettingsNav active={tab} onSelect={goTo} />
        <Box component="section" aria-label={c.nav[tab]} style={{ minWidth: 0 }}>
          {content}
        </Box>
      </Box>
      {confirmDialog}
    </>
  );
}
