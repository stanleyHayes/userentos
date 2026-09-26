# Restoring a database backup without undoing deletions

A backup is a copy of the database as it was when the backup was taken. Restoring one brings back every account, document and listing that people deleted after that moment. The erasure ledger records those deletions so they can be applied again. Follow this runbook for every restore — full, partial, or into a scratch copy — before anyone uses the restored data.

## What the ledger is

- Collection `erasureledgers`, written by `apps/api/src/services/erasureLedger.ts`.
- One entry per account closure (self-service, admin, or email request), per document deletion, and per listing or listing-photo deletion.
- It holds identifiers only: the account id, the ids of deleted records and the storage ids of deleted files. It never holds names, emails or phone numbers.
- A deletion is written to the ledger before the app reports success. If the ledger cannot be written, the deletion is refused.
- An entry is kept for `BACKUP_RETENTION_DAYS` + 30 days after its erasure completes, so it outlives every backup that could still contain the deleted data. Account closures complete at the day-30 purge.

## Where it lives

`ERASURE_LEDGER_MONGO_URI` points the ledger at its own database. Use a **separate cluster or Atlas project**: a snapshot restore rolls back the whole cluster it came from, so a ledger in the same cluster would be rolled back with the data and could no longer say what to delete.

When `ERASURE_LEDGER_MONGO_URI` is unset, the ledger is stored in the main database and the API logs a warning at boot. It also warns if the ledger URI points at the same cluster as `MONGO_URI`. In either case you **must** export the ledger before the restore (step 2) and import it into the restored copy (step 4).

## Runbook

1. **Stop writes to production** only if you are replacing it. Put the web app in maintenance mode, or scale the API to zero on Render. A restore for investigation does not need this.

2. **If the ledger shares the cluster, export it first**, before touching anything:

   ```sh
   mongoexport --uri "$MONGO_URI" --collection erasureledgers --out erasureledgers-$(date +%F).json
   ```

   Keep this file with the same care as the database: it contains account ids.

3. **Restore to a new cluster**, never over the live one. In Atlas: Backup → choose the snapshot → Restore → "Restore to a new cluster" (or `mongorestore` into an empty cluster for a dump). The live cluster stays intact until cutover.

4. **If you exported the ledger in step 2, import it** into the restored copy. This replaces the older ledger that came back with the restore:

   ```sh
   mongoimport --uri "$RESTORED_MONGO_URI" --collection erasureledgers --mode upsert --file erasureledgers-YYYY-MM-DD.json
   ```

   A separate ledger cluster needs no import: the ledger was never rolled back.

5. **Replay the ledger against the restored copy** before it takes any traffic. On Render, run a one-off job on the API service with `MONGO_URI` (and `ERASURE_LEDGER_MONGO_URI`, if set) pointing at the restored copy:

   ```sh
   node dist/scripts/replayErasureLedger.js
   ```

   Locally: `npx tsx --env-file=.env src/scripts/replayErasureLedger.ts`. The script prints a JSON summary and exits non-zero while any entry failed. It is safe to run repeatedly.

   What the replay does:
   - An account closed after the backup was taken is open again in the restored copy. It is closed with its original request date: listings and profiles taken down, identity scrubbed, sessions revoked. If the 30-day grace period has passed since the original request, its related records are erased at once.
   - A document or listing deleted after the backup is deleted again. Its stored files are deleted again at Cloudinary; "not found" counts as done.
   - A listing photo removed after the backup is deleted again at Cloudinary. The restored listing may still show its URL until the owner edits it; the file itself is gone.

6. **Repeat step 5 until it reports `"failed": 0`.** A failure is usually a payout still in flight (the account is kept until it settles) or Cloudinary not confirming a deletion.

7. **Check the TTL indexes** on the restored copy: `node dist/scripts/verifyRetentionIndexes.js` (exits non-zero and lists any missing index or wrong period).

8. **Cut over** by pointing `MONGO_URI` at the restored cluster and taking the app out of maintenance mode. Keep the old cluster until you have confirmed the restore, then delete it.

9. **Record the restore** in `COMPLIANCE_AUDIT.md`: when, which snapshot, why, the replay summary, and who ran it.

## Also covered by the daily job

The API replays the ledger every day at 04:00 (Africa/Accra), and within an hour of waking if the instance slept through it. This finishes any deletion that failed part-way and heals a restore where step 5 was forgotten — but only within 24 hours, so never rely on it for a cutover.

## Not covered

- **Copies outside Atlas snapshots.** Ad-hoc `mongodump` files, exports on laptops or CI artifacts do not expire on their own. Do not make them. If one exists, list it, then destroy it or apply this runbook before any use.
- **Cloudinary backups.** If Cloudinary's backup feature is on for the production account, deleted files can remain there. Confirm the setting and its retention period; if it is on, erasure must also delete backed-up versions.
- **Processors.** Deletions are not sent to Paystack, Sentry, Expo/APNs/FCM, email or SMS providers, or AI providers.
