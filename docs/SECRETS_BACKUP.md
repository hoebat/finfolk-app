# Local FinFolk secrets and backups

Actual credentials are kept in the ignored project `.env.local`, with permissions `0600`. The environment example contains names/placeholders only. Saving a credential in Cloudflare does not replace the local copy; update `.env.local` and back it up whenever credentials change.

Run `npm run env:backup` from the project root. This writes an AES-256-GCM encrypted, timestamped backup under `~/Library/Application Support/FinFolk/env-backups/`, then decrypts the file in memory to verify it exactly matches `.env.local`. Backup directory permissions are `0700`; files are `0600`.

The recovery key is stored separately in `~/.config/finfolk/env-backup.key`, also with `0600` permissions. Keep a secure recovery copy of that key: encrypted backup files cannot be recovered without it. No off-device backup destination has been configured yet. To back up a separate test environment, run `node scripts/backup_env.mjs .env.test.local`; production and test credentials stay separate.

To restore:

```sh
npm run env:restore -- '/path/to/finfolk-env-TIMESTAMP.enc.json'
```

This creates `.env.restored.local` and refuses to overwrite an existing file. Validate the restored configuration before replacing `.env.local`. A second argument can name a new output path. Neither command prints environment values. Never commit `.env.local`, recovery keys or plaintext restored files to Git.
