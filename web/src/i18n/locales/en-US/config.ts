// Namespace `config`, owned by the runtime configuration screens (`pages/SettingsPage.tsx`,
// `components/settings`, `components/config`) and the configuration wizard.
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.

import { plural } from '../../plural';

export const config = {
  /** The Settings page frame: header actions and the section navigation. */
  page: {
    wizard: 'Configuration wizard',
    jiraConnected: 'Jira connected',
    jiraNotConfigured: 'Jira not configured',
    navAria: 'Settings sections',
    groupSystem: 'System',
    groupJira: 'Jira data',
    groupDelivery: 'Delivery',
    discardTitle: 'Discard changes?',
    discardBody: 'There are unsaved changes in this section.',
    discardLabel: 'Discard',
  },
  /** Section names in the navigation, keyed by the `?tab=` value. */
  nav: {
    conexao: 'Jira connection',
    calendario: 'Calendar',
    coleta: 'Collection',
    email: 'E-mail & links',
    ia: 'AI narrative',
    geral: 'General',
    boards: 'Boards',
    campos: 'Fields',
    perfil: 'Board profile',
    notificacoes: 'Notifications',
    'plano-epico': 'Epic plan',
  },
  /** One card per configuration group, keyed by the API's group id. */
  groups: {
    jira: {
      title: 'Jira connection',
      description: 'The Jira Cloud instance Cadência reads and the account it reads as. Nothing is ever written to Jira.',
    },
    calendar: {
      title: 'Calendar defaults',
      description: 'When the weekly checkpoints are taken, for every board whose profile does not say otherwise.',
    },
    collection: {
      title: 'Collection',
      description: 'How much history is read from Jira and how often it is asked for changes.',
    },
    notifications: {
      title: 'E-mail and links',
      description: 'The mail server that sends digests and decks, and the address that links in messages point to.',
    },
    ai: {
      title: 'AI narrative',
      description: 'Drafts of a sprint’s narrative, written by Claude on request. Off unless you turn it on.',
    },
    general: {
      title: 'General',
      description: 'The language of what the server writes on its own, and the upload limit for templates.',
    },
  },
  /** Label, one-line description and an optional example for each field, keyed by the API's field key. */
  fields: {
    jira_base_url: {
      label: 'Jira URL',
      description: 'The address of your Jira Cloud site.',
      placeholder: 'https://your-company.atlassian.net',
    },
    jira_email: {
      label: 'Account e-mail',
      description: 'The Atlassian account that reads the boards.',
      placeholder: 'name@company.com',
    },
    jira_api_token: {
      label: 'API token',
      description: 'Created at id.atlassian.com → Security → API tokens. Stored encrypted.',
      placeholder: '',
    },
    jira_max_concurrency: {
      label: 'Parallel requests',
      description: 'How many requests to Jira run at once.',
      placeholder: '',
    },
    jira_max_retries: {
      label: 'Retries',
      description: 'How many times a rate-limited or failed request is tried again.',
      placeholder: '',
    },
    jira_timeout_seconds: {
      label: 'Timeout (seconds)',
      description: 'How long one request may take before it is given up.',
      placeholder: '',
    },
    timezone: {
      label: 'Time zone',
      description: 'Checkpoints, days and the end of a sprint are counted in it.',
      placeholder: '',
    },
    checkpoint_weekday: {
      label: 'Checkpoint day',
      description: 'The day of the week a snapshot is frozen.',
      placeholder: '',
    },
    checkpoint_hour: {
      label: 'Checkpoint hour',
      description: 'The hour of that day, in the time zone above.',
      placeholder: '',
    },
    default_sprint_weeks: {
      label: 'Sprint length (weeks)',
      description: 'Used when Jira does not give a sprint an end date.',
      placeholder: '',
    },
    history_sprints: {
      label: 'Sprints of history',
      description: 'How many past sprints the first full collection reads.',
      placeholder: '',
    },
    history_days: {
      label: 'Days of history',
      description: 'How far back items are read on a board without sprints.',
      placeholder: '',
    },
    collect_interval_minutes: {
      label: 'Collection interval (minutes)',
      description: 'How often Jira is asked for what changed.',
      placeholder: '',
    },
    incremental_overlap_minutes: {
      label: 'Overlap (minutes)',
      description: 'Each incremental collection reaches this far before the last one, so nothing falls between them.',
      placeholder: '',
    },
    public_url: {
      label: 'Public address',
      description: 'Where people open Cadência; links in e-mails and messages start with it.',
      placeholder: 'https://cadencia.company.com',
    },
    smtp_host: {
      label: 'SMTP server',
      description: 'The mail server that sends e-mail. Empty: no e-mail is sent.',
      placeholder: 'smtp.company.com',
    },
    smtp_port: {
      label: 'SMTP port',
      description: 'Usually 587 with STARTTLS.',
      placeholder: '',
    },
    smtp_user: {
      label: 'SMTP user',
      description: 'Empty when the server does not ask for a sign-in.',
      placeholder: '',
    },
    smtp_password: {
      label: 'SMTP password',
      description: 'Stored encrypted.',
      placeholder: '',
    },
    smtp_from: {
      label: 'Sender address',
      description: 'The “From” of every e-mail Cadência sends.',
      placeholder: 'cadencia@company.com',
    },
    smtp_starttls: {
      label: 'Use STARTTLS',
      description: 'Encrypt the connection to the mail server.',
      placeholder: '',
    },
    ai_enabled: {
      label: 'Enable AI narrative',
      description: 'Lets the deck editor draft a board’s narrative, which a person then reviews and saves.',
      placeholder: '',
    },
    anthropic_api_key: {
      label: 'Anthropic API key',
      description: 'Created in the Anthropic Console. Stored encrypted.',
      placeholder: '',
    },
    ai_model: {
      label: 'Model',
      description: 'The Claude model that writes the drafts.',
      placeholder: '',
    },
    ai_timeout_seconds: {
      label: 'Timeout (seconds)',
      description: 'How long a draft may take before it is given up.',
      placeholder: '',
    },
    locale: {
      label: 'Server language',
      description: 'For what the server writes with nobody asking: scheduled e-mails, digests, the CLI. Each person still picks their own.',
      placeholder: '',
    },
    template_max_mb: {
      label: 'Template size limit (MB)',
      description: 'The largest .pptx that can be uploaded as a template.',
      placeholder: '',
    },
  },
  /** The badge beside each field's label: where its current value comes from. */
  source: {
    database: 'Saved',
    environment: '.env',
    default: 'Default',
    databaseHelp: 'Saved in the app. It wins over the .env file.',
    environmentHelp: 'Comes from the .env file, an environment variable or a secret file. Saving it here makes the app’s value win.',
    defaultHelp: 'Not set anywhere; the built-in default applies.',
    envDiffers: 'The .env file has a different value, which applies again if this one is reset.',
  },
  reset: {
    aria: (label: string) => `Reset ${label}`,
    tooltip: 'Forget the saved value',
    title: 'Forget the saved value?',
    body: (label: string) => `${label} goes back to the value from the .env file, or to the default.`,
    confirm: 'Reset',
    done: (label: string) => `${label} reset`,
    failed: 'Not reset',
  },
  secret: {
    saved: '•••••••• saved',
    fromEnv: '•••••••• from .env',
    notSet: 'Not set',
    remove: 'Remove',
    keep: 'Keep it',
    willRemove: 'Will be removed when you save.',
  },
  errors: {
    required: 'Enter a number.',
    tooLow: (limit: number) => `At least ${limit}.`,
    tooHigh: (limit: number) => `At most ${limit}.`,
  },
  saveBar: {
    unsaved: (n: number) => plural(n, 'unsaved change', 'unsaved changes'),
    discard: 'Discard',
    save: 'Save',
    savedTitle: 'Settings saved',
    savedMessage: 'They apply from now on, with no restart.',
    notSaved: 'Settings not saved',
  },
  importEnv: {
    body: (n: number) => `${plural(n, 'value still comes', 'values still come')} from the .env file. Import them so they are kept in the database.`,
    action: 'Import',
    doneTitle: 'Imported from .env',
    done: (n: number) => `${plural(n, 'value', 'values')} now kept in the database.`,
    failed: 'Not imported',
  },
  connection: {
    test: 'Test connection',
    testHint: 'Tests what is in the form, saved or not.',
    advanced: 'Advanced',
    advancedHint: 'Parallel requests, retries and timeout',
    discoverHint: 'Discovery uses the saved connection; save first.',
  },
  ai: {
    privacy: 'Only numbers are sent to Anthropic — counts, durations, percentages — never a person’s name or an item’s title.',
  },
  environment: {
    title: 'Environment (read-only)',
    description: 'Set by the deployment, in environment variables or secret files. Changing one needs a restart.',
    set: 'set',
    notSet: 'not set',
    yes: 'yes',
    no: 'no',
    empty: 'None',
    labels: {
      database_url: 'Database',
      data_dir: 'Data directory',
      api_token: 'API token',
      cors_origins: 'CORS origins',
      log_level: 'Log level',
      log_json: 'JSON logs',
      secret_key: 'Encryption key',
    },
    sources: {
      environment: 'environment',
      file: 'generated file',
      default: 'default',
      database: 'database',
    },
  },
  /** `pages/ConfigWizardPage.tsx`: the runtime settings asked step by step and saved at the end. */
  wizard: {
    title: 'Configuration wizard',
    subtitle: 'Connect to Jira and set the defaults in a few steps. Nothing is saved until the last one.',
    back: 'Back to settings',
    previous: 'Back',
    next: 'Next',
    skip: 'Skip',
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    optional: 'Optional. You can skip this step and set it up later in Settings.',
    discardBody: 'Nothing you entered in the wizard has been saved yet.',
    steps: {
      jira: { label: 'Jira', description: 'Connection' },
      calendar: { label: 'Calendar', description: 'Checkpoints' },
      collection: { label: 'Collection', description: 'History and pace' },
      notifications: { label: 'E-mail', description: 'Optional' },
      ai: { label: 'AI', description: 'Optional' },
      review: { label: 'Review', description: 'Save' },
    },
    jira: {
      tokenHelp: 'How to create an API token',
      tested: 'Connection tested',
      needsTest: 'Test the connection to continue.',
      retest: 'The connection changed; test it again to continue.',
      alreadyConfigured: 'Jira is already configured. Test again only if you change the connection.',
      continueUntested: 'Continue without testing',
    },
    calendar: {
      preview: (day: string, hour: string, zone: string) => `Checkpoints every ${day} at ${hour} (${zone}).`,
    },
    collection: {
      recommended: 'The recommended values are filled in. Keep them unless you need more history or a different pace.',
      restore: 'Use the recommended values',
      advancedHint: 'How Jira is asked: parallel requests, retries and timeout',
    },
    review: {
      title: 'Review and save',
      description: 'This is what will be saved. Nothing has been written yet.',
      nothingChanged: 'Nothing was changed; saving keeps the current values.',
      edit: 'Edit',
      changed: 'changed',
      notSet: 'Not set',
      on: 'On',
      off: 'Off',
      secretNew: '•••• (new)',
      secretKept: '•••• kept',
      secretRemove: 'Will be removed',
      importEnv: 'Also import the remaining values from .env',
      importEnvHint: (n: number) => `${plural(n, 'value still comes', 'values still come')} from the .env file; importing keeps them in the database.`,
      save: 'Save configuration',
      notSaved: 'Configuration not saved',
    },
    done: {
      title: 'Configuration saved',
      body: 'It applies from now on, with no restart. Next, discover the boards in Jira and run the first collection.',
      start: 'Discover boards & start',
      settings: 'Open settings',
    },
  },
};
