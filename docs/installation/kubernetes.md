# Kubernetes

Seatbit runs as a single pod with a persistent volume. There is no Helm chart; the manifests below are a minimal starting point.

## Requirements

| | |
| --- | --- |
| **Replicas** | Exactly **1** (SQLite). Use the `Recreate` strategy so the old pod stops before the new one starts. |
| **Storage** | A PersistentVolumeClaim on `/data` (database and uploads). A few hundred MB is plenty. |
| **User** | The image runs as uid/gid `1001`; set `fsGroup: 1001` so the volume is writable. |
| **Probes** | `GET /api/health` on port 3000 returns `{"ok":true}`. |
| **Ingress** | HTTPS, forwarding `Host` and `X-Forwarded-Proto`. `BETTER_AUTH_URL` must be the public URL. |
| **Image tags** | `:main-<UTC timestamp>-<sha>` sorts by build time, for automatic updates (e.g. Flux image policies). See [Docker](docker.md). |

## Example

```yaml title="seatbit.yaml"
apiVersion: v1
kind: Secret
metadata:
  name: seatbit
stringData:
  BETTER_AUTH_URL: https://seatbit.example.com
  BETTER_AUTH_SECRET: change-me            # openssl rand -base64 32
  DISCORD_CLIENT_ID: "1234567890123456789"
  DISCORD_CLIENT_SECRET: your-client-secret
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: seatbit-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: seatbit
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels: { app: seatbit }
  template:
    metadata:
      labels: { app: seatbit }
    spec:
      securityContext:
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: seatbit
          image: ghcr.io/bitsandbricks-ch/seatbit:main
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef: { name: seatbit }
          env:
            - name: TZ
              value: Europe/Zurich
          volumeMounts:
            - { name: data, mountPath: /data }
          readinessProbe:
            httpGet: { path: /api/health, port: 3000 }
          livenessProbe:
            httpGet: { path: /api/health, port: 3000 }
            periodSeconds: 30
          resources:
            requests: { cpu: 50m, memory: 192Mi }
            limits: { memory: 512Mi }
      volumes:
        - name: data
          persistentVolumeClaim: { claimName: seatbit-data }
---
apiVersion: v1
kind: Service
metadata:
  name: seatbit
spec:
  selector: { app: seatbit }
  ports:
    - port: 80
      targetPort: 3000
```

Add an Ingress (or Gateway route) for your domain pointing at the `seatbit` service.

## Read-only root filesystem

The app works with `readOnlyRootFilesystem: true` if `/tmp` and `/app/.next/cache` are writable, e.g. with `emptyDir` volumes.

## Backups

Run `node scripts/backup.mjs` from a CronJob with the same image that mounts the data volume and a volume for `/backups`. With a `ReadWriteOnce` volume, the job must run on the same node as the Seatbit pod (pod affinity), or use `kubectl exec deploy/seatbit -- node scripts/backup.mjs` instead. See [Backups](operations.md#backups).

## Admin CLI

```sh
kubectl exec deploy/seatbit -- node scripts/admin.mjs list
```

See [Admin CLI](operations.md#admin-cli).
