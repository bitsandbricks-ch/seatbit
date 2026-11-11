# Running Seatbit on Kubernetes

Plain kustomize manifests for a small cluster. Seatbit stores everything in one
SQLite file, so it runs as **one replica** on a ReadWriteOnce volume.

| File | What it does |
| --- | --- |
| `deployment.yaml` | The app (`ghcr.io/bitsandbricks-ch/seatbit:main`), `Recreate` strategy, health probes on `/api/health`, non-root, read-only root FS |
| `pvc.yaml` | `seatbit-data` (1Gi, the database) and `seatbit-backups` (2Gi) |
| `configmap.yaml` | Public URL, time zone, mail sender, reminder timer off |
| `ingress.yaml` | `seatbit.ch` with a cert-manager certificate (`letsencrypt-prod`, ingress class `nginx`) |
| `reminders-cronjob.yaml` | Calls `/api/cron/reminders` every 15 minutes |
| `backup-cronjob.yaml` | Nightly online SQLite backup at 03:30 into `seatbit-backups`, keeps 14 days |

## Image

GitHub Actions (`.github/workflows/image.yml`) builds a multi-arch image
(amd64 + arm64) on every push to `main` and pushes it to GHCR as `:main` and
`:sha-<short sha>`. Tags `v1.2.3` also produce `:1.2.3`. Pull requests build
without pushing and validate these manifests.

The GHCR package starts **private**. Either make it public (GitHub → Packages →
seatbit → Package settings → Change visibility), or create a pull secret with a
token that has `read:packages`:

```sh
kubectl -n seatbit create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=<github user> --docker-password=<token>
```

## First deploy

```sh
kubectl apply -f deploy/k8s/namespace.yaml
cp deploy/k8s/secrets.env.example deploy/k8s/secrets.env   # git-ignored; fill in
kubectl -n seatbit create secret generic seatbit-secrets --from-env-file=deploy/k8s/secrets.env
kubectl apply -k deploy/k8s
kubectl -n seatbit rollout status deploy/seatbit
```

Then open https://seatbit.ch and register: the first account becomes admin.
Mail, Discord and Google can be set in the app under **Admin → Platform settings**
instead of the secret.

DNS: point `seatbit.ch` (A/AAAA) at the ingress controller's address before
cert-manager tries to issue the certificate.

OAuth redirect URLs to register:
- Discord: `https://seatbit.ch/api/auth/callback/discord`, bot interactions endpoint `https://seatbit.ch/api/discord/interactions`
- Google: `https://seatbit.ch/api/auth/callback/google`

## Updating

`main` is pulled on every pod start, so after a new image is built:

```sh
kubectl -n seatbit rollout restart deploy/seatbit
```

To pin a version, set `images:` in `kustomization.yaml` to a `sha-…` tag.
Migrations run automatically at startup.

## Reminders

The built-in timer is off (`REMINDER_INTERVAL_MINUTES=0`) and the CronJob calls
the endpoint instead. It reads `CRON_SECRET` from `seatbit-secrets`; if an admin
sets a different cron secret in the platform settings, update the secret too,
or the job gets `401`.

## Backups and restore

List backups:

```sh
kubectl -n seatbit create job --from=cronjob/seatbit-backup backup-now   # run one now
kubectl -n seatbit run ls --rm -it --restart=Never --image=busybox \
  --overrides='{"spec":{"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"seatbit-backups"}}],"containers":[{"name":"ls","image":"busybox","command":["ls","-l","/b"],"volumeMounts":[{"name":"b","mountPath":"/b"}]}]}}'
```

Restore: scale the app to 0, copy a backup over `/data/seatbit.db` (and delete
`seatbit.db-wal` / `seatbit.db-shm`) with a helper pod that mounts both volumes,
then scale back to 1.

The backups volume lives in the same cluster; copy it off-site (e.g. restic or
rclone to S3/B2) if the cluster's storage isn't already backed up.
