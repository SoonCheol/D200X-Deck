# DeckForge Store — NAS deployment status

## Current: 0.1.11 update (2026-11-28, Asia/Seoul)

- Source revision `93bffe5b125300be26d7fa794ebe78fdbbcad849`. Successful **push** [Store run 46027843224](https://github.com/SoonCheol/D200X-Deck/actions/runs/46027843224), artifact `deckforge-store-0.1.11-amd64` (ID `15213640476`). `source-revision.txt`, image revision label and SHA256 matched. Archive SHA256: `dca61c4a73ff772c4c322d36d9d176a5c5a2b9ba31b0cf9797dceab6ebe644b6`. NAS `docker load -i /home/hitmyhead/deckforge-store-0.1.11.tar.gz` loaded amd64 image `sha256:73ece527a3dba13798e64eb25d71a1e5e8ddd2bf9d7d672f5909e4c539895c78`.
- Before updating, stopped **only** `deckforge-store` and used a no-network, read-only mount of `deckforge-store_deckforge-store-data` to archive all `/data` files, including SQLite WAL/SHM, with numeric ownership. Protected backup: `/home/hitmyhead/deckforge-store-backups/pre-0.1.11-20261127T154931Z.tar.gz`, mode `600`, SHA256 `75634f832dd35f03bb676f93190c0f221a9f12d202ce2e9018cc09b966011c3c`. Original 0.1.10 service was restarted and became healthy. The health check initially remained `starting` for over 20 seconds because its interval is 30 seconds; it later reported `healthy` before update.
- Verified the archive in a **separate temporary volume**, with no network, using the verified 0.1.11 image. All six archive members were regular files or directories with safe relative paths; `python verify_data.py /data` returned `{"ok": true, "releases": 0, "verifiedBlobs": 0}`. The temporary restore volume was removed; the production volume was not changed by this drill.
- Through the trusted internal Portainer HTTPS path, fetched stack **38** from environment **7**, retained the exact existing Compose file, origin `https://deckstore.homedisk.net`, loopback port `18767`, and named volume; changed only `DECKFORGE_STORE_IMAGE` to `deckforge-store:0.1.11` with `Prune=false` and `PullImage=false`. `PUT /api/stacks/38?endpointId=7` returned **200**, TLS verification **0**. No second stack was created. Previous 0.1.10 image remains available.
- New container is `healthy`, 0 restarts, user `10001:10001`, read-only root, all capabilities dropped, `no-new-privileges:true`. It mounts the **same** `deckforge-store_deckforge-store-data` volume and publishes only `127.0.0.1:18767`. NPM configuration test passed; its LAN-only vhost and certificate were unchanged. Internal `https://deckstore.homedisk.net/api/v1/health` returned **200** with verified TLS and NAS LAN IP; unauthenticated catalog returned **401**.
- The previous database had **0 owners**. After the image update, the user directly entered the password twice in an interactive SSH/Docker TTY for `python server.py create-owner hitmyhead`. Read-only database verification found exactly **1 owner**, username `hitmyhead`; no password was recorded or displayed by Codex.
- Still untested: login with the user-held password, private catalog permissions, sample upload/publish/hash download/version restore, desktop 2.0.135 integration, and signing-key workflow. No public exposure or unrelated service setting was changed. The documentation commit after this update does not alter the running image revision.

## Previous: 0.1.10 initial LAN HTTPS deployment

Verified 2026-11-28 (Asia/Seoul). Repository `SoonCheol/D200X-Deck`, branch `codex/streamdeck-761-clean-editor`; deployed source revision `1538d8e24b0aa4c417d5eaa59e1944eebdaa7aa4`. The later documentation HEAD does not change the deployed image.

## Provenance

- Successful **push** [Store run 46024303349](https://github.com/SoonCheol/D200X-Deck/actions/runs/46024303349), artifact `deckforge-store-0.1.10-amd64` (ID `15211031528`). `source-revision.txt` matches the image label. Archive SHA256: `b9aaf34a26a2aaae21d8461a72166540b9e342de47829fa755508b503aef8542`, verified locally and again on NAS before `docker load`.
- Latest successful editor 2.0.135 Windows build at deployment: [run 46021484693](https://github.com/SoonCheol/D200X-Deck/actions/runs/46021484693), setup artifact `15210275360`, portable artifact `15210475232`. This is build evidence, not a new desktop/NAS integration test.

## Actual NAS configuration and commands

- HomeDisk `192.168.0.100`, x86_64, Docker `29.6.2`, Compose `v5.1.3`; existing SSH user `hitmyhead`, key `C:\Users\homes\.ssh\codex_nas`. Windows SCP SFTP mode could not write its target; `scp -O` to `/home/hitmyhead/deckforge-store-0.1.10.tar.gz` succeeded. `sha256sum` matched, then `docker load -i /home/hitmyhead/deckforge-store-0.1.10.tar.gz` loaded image `sha256:607514b87ab917549f6e59f04f1d01709325d811ba9535bf6b1da54585107dde` (amd64, revision label above).
- Existing Portainer CE 2.45.3 at LAN `http://192.168.0.100:9001`; existing token from `%USERPROFILE%\.codex\portainer-token.txt` sent only to that LAN API as `X-API-Key`. `/api/status`, `/api/endpoints`, `/api/stacks`, and environment 7 Docker `/info` returned HTTP 200. Existing Store stack was absent. Created only new stack `deckforge-store` ID **38**, environment **7**, from `store/compose.yaml` through `POST /api/stacks/create/standalone/string?endpointId=7`, with image `deckforge-store:0.1.10`, origin `https://deckstore.homedisk.net`, and unused loopback port `18767`.
- NPM container uses **host** network, so the Compose loopback variant is correct. Store volume `deckforge-store_deckforge-store-data` at `/volume3/@docker/volumes/deckforge-store_deckforge-store-data/_data`. Only `127.0.0.1:18767` is published. Container is healthy with 0 restarts, user `10001:10001`, read-only root, all capabilities dropped, and `no-new-privileges:true`.
- Existing NPM wildcard certificate ID 5 (`*.homedisk.net`, expires 2027-02-17) was reused. Added [Store-only NPM custom vhost](deploy/npm-lan.conf) at `/data/compose/3/npm-data/nginx/custom/http.conf`; `nginx -t` passed and `nginx -s reload` succeeded. The vhost allows loopback and `192.168.0.0/24` only; other sources are denied. Existing proxy hosts and certificates were not edited. This custom vhost is file-managed and does not appear as an NPM UI proxy host.
- AdGuard Home `rewrites: []` remained unchanged. Public DNS for `deckstore.homedisk.net` resolves to the WAN IP; no DNS, Cloudflare, router, or unrelated NAS service setting was changed. Internal verification used `curl.exe --resolve deckstore.homedisk.net:443:192.168.0.100` so the HTTPS connection reached the NAS LAN IP with normal certificate and hostname validation.

## Observed acceptance at this stage

- `https://deckstore.homedisk.net/api/v1/health` via the LAN override: **200**, TLS verify result **0**, remote IP `192.168.0.100`.
- Unauthenticated `/api/v1/catalog`: **401** with the same verified TLS route. HTTP on LAN redirects **301** to HTTPS. A request from the Store Docker bridge to the same HTTPS vhost received **403** while TLS validation succeeded, confirming the LAN allowlist behavior.
- Portainer HTTPS through existing NPM at `portainer.homedisk.net` returned **200** with trusted TLS; direct `https://192.168.0.100:9444` failed certificate trust. The Store stack was created through the verified LAN HTTP API before this HTTPS path was checked.

## Remaining gates

Owner initialization, account login, private catalog visibility, upload/publish/hash download/version restore, backup restoration drill, and editor 2.0.135 desktop flow are **not tested**. No owner password or signing key was generated here. No external exposure was enabled; public access remains blocked by the NPM LAN allowlist. Follow `OPERATIONS.md` before production data use or recovery.
