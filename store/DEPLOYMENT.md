# DeckForge Store — NAS deployment (0.1.10 candidate)

No NAS changes are performed by this repository or CI. Only deploy a successful push artifact from the existing branch. Editor baseline 2.0.135 (Windows #139).

## Preflight and boundaries
- Target: UGREEN DXP4800 Plus / UGOS Pro, HomeDisk, 192.168.0.100. PowerShell on Windows, existing `ssh nas`, existing Portainer API token. Verify current actual endpoints, account access, Docker environment ID and permissions before changing anything.
- Intended origin: https://deckstore.homedisk.net. Inspect existing NPM, AdGuard Home and Cloudflare records; preserve all unrelated apps and DNS. Never guess Docker network names, ports, volume paths, certificates, or credentials.
- Download the successful push artifact `deckforge-store-0.1.10-amd64` from GitHub Actions, verify matching source-revision.txt and SHA256SUMS. Check NAS architecture amd64. Import the image only after separate deployment instruction. Do not pull an invented GHCR tag.
- Use the existing authorized SSH account and existing Docker privilege mechanism, not new credentials or chmod 777. Verify image labels and inspect image ID after docker load. Do not substitute a locally rebuilt image without repeating verification.

## Stack
Use `compose.npm.yaml` if NPM is a Docker container with an existing private bridge network: set DECKFORGE_STORE_IMAGE=deckforge-store:0.1.10, DECKFORGE_STORE_ORIGIN=https://deckstore.homedisk.net, DECKFORGE_STORE_PROXY_NETWORK to the verified NPM network. No host ports. NPM forwards to deckforge-store:8080 over that network. If NPM truly runs in host network, use compose.yaml with an inspected unused loopback port instead. Do not publish 8080 to LAN/WAN. Inspect Portainer environment and existing stack/container/volume names; create a new stack named deckforge-store only if absent. If it exists, back up first, keep its volume and update in place. Do not delete or recreate unrelated stacks. Named volume is the default; if a bind mount is desired, verify actual storage location and UID 10001 permissions first.

Configure NPM HTTPS and forced HTTPS, max request body 61 MiB and timeouts sufficient for uploads (application worker 120s); do not expose admin management ports. Check TLS certificate and external DNS. Prefer LAN-only first: AdGuard Home internal record points to the verified NPM address; external Cloudflare DNS/proxy only after LAN checks and explicit public exposure approval. No TLS verification bypass. If Cloudflare is used, confirm strict origin TLS and the actual DNS/proxy configuration. Do not change unrelated proxy hosts, certificates or DNS entries.

## Acceptance gates
1. Verify container health, nonroot 10001, read-only root filesystem, dropped capabilities, no-new-privileges, volume persistence, no direct external port.
2. Initialize owner only once: interactive `docker exec -it deckforge-store python server.py create-owner OWNER_NAME`. User enters password; do not log it. No public registration.
3. Verify HTTPS health, unauthenticated catalog 401, owner login, user login, private pack visibility restriction, draft upload, publish, actual hash download and previous version restore with harmless sample pack. No production data deletion.
4. Verify desktop 2.0.135: connection, account, catalog parity, install/remove, retained button image and updates. Independently pin a trusted signing public key if native plugin installation is tested; private key stays offline.
5. Follow OPERATIONS.md for a separate backup restoration drill, record actual stack/image/volume/network/proxy facts and test results. Stop and report any failing gate; do not expose externally. No claim of actual NAS success before verification.
