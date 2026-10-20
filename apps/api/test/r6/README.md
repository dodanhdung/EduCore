# R6 independent verification

Run from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File apps/api/test/r6/start-r6-native.ps1 -RunTests
```

Requires the already installed local Docker engine, PostgreSQL 16 image and
workspace dependencies. The runner admits a new loopback-only container with
fresh storage. No application DATABASE_URL is used. Migration recovery, upgrade
and restore each use another newly labelled cluster with fresh storage.
All task containers are retained. No existing container is reused or
removed. Evidence is written under ignored `apps/api/coverage/r6/`.

Database dumps and password-free role SQL are streamed through process memory;
neither is written into repository files.
Credentials stay in process memory and are absent from evidence. A quiescent
fixture provides the coordinated DB/files recovery point. Local timings do not
establish production RPO/RTO, availability, representative load, or compatibility
with a different PostgreSQL/tzdata version. See the two R6 reports for exact
coverage and open obligations.
