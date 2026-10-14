# Runtime configuration in the database

The variables that used to live only in `.env` are now edited in the app (Configuração and the
configuration wizard) and stored in the database. `.env` / `CADENCIA_*` / `/run/secrets` still work,
but only as the **seed**: once a value is saved in the database, the database wins.

## Two kinds of setting

**Runtime** (editable, stored in `app_setting` under the single key `config.values`, a JSON object
`{field: value}`; secrets are stored as `{"$enc": "<fernet token>"}`):

| group | fields |
|---|---|
| `jira` | `jira_base_url` (url), `jira_email` (email), `jira_api_token` (secret), `jira_max_concurrency` (int 1–32), `jira_max_retries` (int 0–20), `jira_timeout_seconds` (float 1–300) |
| `calendar` | `timezone` (timezone), `checkpoint_weekday` (weekday 0–6), `checkpoint_hour` (hour 0–23), `default_sprint_weeks` (int 1–8) |
| `collection` | `history_sprints` (int 1–52), `history_days` (int 7–1095), `collect_interval_minutes` (int 5–1440), `incremental_overlap_minutes` (int 0–240) |
| `notifications` | `public_url` (url), `smtp_host` (string), `smtp_port` (int 1–65535), `smtp_user` (string), `smtp_password` (secret), `smtp_from` (email), `smtp_starttls` (bool) |
| `ai` | `ai_enabled` (bool), `anthropic_api_key` (secret), `ai_model` (string), `ai_timeout_seconds` (float 5–600) |
| `general` | `locale` (locale: en-US, pt-BR, de-DE), `template_max_mb` (int 1–500) |

**Bootstrap** (env only, shown read-only, because they are needed before the database can be
reached or they guard the API itself): `database_url` (password masked), `data_dir`, `api_token`
(only whether it is set), `cors_origins`, `log_level`, `log_json`, `secret_key` (whether it is set,
and whether it came from the environment or from the generated file).

## Effective settings

`effective = env Settings` with the stored runtime values laid over it and validated by the same
`Settings` validators. Every consumer — API requests (`SettingsDep`), the scheduler's jobs, the CLI,
background collection — reads the effective settings at the moment it runs, never a copy captured at
process start.

## Secrets

Encrypted with Fernet (`cryptography`). The key is `CADENCIA_SECRET_KEY` (urlsafe base64, 32 bytes)
when set; otherwise `<data_dir>/secret.key`, generated on first use with mode 0600. A stored secret
that can no longer be decrypted (key lost) is treated as **not set** and logged once — never a 500.
The API never returns a secret: only `is_set`. Secrets are registered with the log redactor.

## API (all under `/api`, behind the usual token)

`GET /config`
```json
{
  "groups": [
    {"id": "jira", "fields": [
      {"key": "jira_base_url", "kind": "url", "value": "https://x.atlassian.net",
       "is_set": true, "source": "database", "default": "", "min": null, "max": null,
       "env_value_differs": false}
    ]}
  ],
  "bootstrap": [{"key": "database_url", "value": "postgresql://cadencia:***@db/cadencia", "source": "environment"}],
  "jira_configured": true,
  "importable": ["timezone", "jira_api_token"]
}
```
- `kind`: `string | url | email | secret | int | float | bool | timezone | locale | weekday | hour`.
- `source`: `database` (saved in the app), `environment` (from env/.env/secret file), `default`.
- For `secret`, `value` is always `null`; `is_set` says whether one exists. For others `is_set` is
  `value not in ("", null)`.
- `importable`: runtime fields whose `source` is `environment` — what "Import from .env" would copy.
- `bootstrap` entries are `{key, value, source}`. `api_token` and `secret_key` have `value` = a
  boolean (whether one is set), never the secret. `secret_key.source` is `environment`
  (`CADENCIA_SECRET_KEY`), `file` (the generated `<data_dir>/secret.key`) or `default` (none
  generated yet: no secret has been saved). `cors_origins` has a string array as its `value`;
  `database_url` has its password masked as `***`. The other entries' `source` is `environment` or
  `default`.

`PUT /config` body `{"values": {"timezone": "Europe/Berlin", ...}}` — partial. A key that is absent
is untouched. For a secret, `null` or `""` **clears** it from the database (falls back to env/default);
send the key only to replace it. For any other field, `null` is read as `""`: kept (an explicitly
empty value, `source: database`) where the kind allows it (`string`, `url`, `email`), refused with
400 naming the field everywhere else; the UI does not send it. Validation errors answer 400 with
`{"detail": {"cause": ..., "message": ..., "field": "<key>"}}` and nothing is saved. Unknown or
bootstrap keys are 400. Response: the same shape as `GET /config`.

`DELETE /config/{key}` — forget the stored value (back to env/default). Response: `GET /config`.

`POST /config/import-env` — copy every `importable` field's env value into the database.
Response: `GET /config` plus `"imported": ["timezone", ...]`. A value outside the app's own range
(e.g. `history_days=2000` in the env) or an empty secret is skipped: it stays `environment` and is
not listed in `imported`.

`POST /config/jira/test` body `{"jira_base_url"?, "jira_email"?, "jira_api_token"?}` — tests the
connection with these draft values laid over the effective ones (an omitted token uses the stored
one) and saves nothing. Same response as `POST /connection/test`
(`{"ok": true, "identity": ..., "permissions": ...}` or `{"ok": false, "error": {cause, message, action}}`).
A draft with no base URL, e-mail or token answers `{"ok": false, "error": ...}` saying what is missing.
An empty `jira_api_token` counts as omitted; a draft value the field's kind refuses (e.g. a base URL
that is not http/https) also answers `ok: false`, not 400.

`GET /health` keeps its shape; `jira_configured` and `timezone` reflect the effective settings.

## CLI

`cadencia config show` (JSON, secrets as `is_set`), `cadencia config set KEY VALUE`,
`cadencia config unset KEY`, `cadencia config import-env`.
