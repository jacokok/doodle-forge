# Phase 4 — opt-in bounded PNG disk cache

Launch with `godot --path apps/game -- --content-api=http://127.0.0.1:5173 --content-cache`.
Without `--content-cache`, API behavior is unchanged; fixture mode ignores the flag.
Programmatic clients may pass `AssetDiskCache.new()` as the API repository's third constructor argument. HTTP/filesystem work stays outside fighters/combat. See ADR-023.

## Authority and validation

Only PNG bytes are cached. Discovery and manifests still require the API, with existing schema, exact manifest hash, identity and release-pin checks. No cached catalog, manifest, fallback, refresh or offline bundle is implemented. A valid cache hit can serve an asset even if the server's copy later becomes unavailable/corrupt; it is not a server-health audit.

Each hit checks the authoritative pinned manifest's exact byte length, SHA-256, PNG signature/IHDR and dimensions. A slot/header/key match is **not** validation. The unchanged resource builder still performs whole-package admission, repeated integrity checks, container restrictions and native decoding on every load. Entries are encoded-byte reuse, not evidence that a package is runnable. Hash-valid but unsupported/undecodable PNGs still fail runtime loading, even if cached.

## Bounded layout and eviction

The app-owned `user://content-cache/v1/` has exactly 16 managed slot names `00.entry` through `15.entry`. Slot = first hash byte modulo 16. Each entry contains a 64-byte lowercase hash tag followed by at most 16 MiB of PNG bytes. Colliding valid tags are cache misses; the next complete install evicts the old slot. This is deterministic direct-mapped eviction, **not LRU**. Hashes and asset paths never become filesystem paths. Cache names are confined lowercase ASCII identifiers (test isolation only; production uses `v1`).

Managed installed data is bounded to **256 MiB + 1024 bytes**. At most one managed temporary write adds **16 MiB + 64 bytes**; total **272 MiB + 1088 bytes**, excluding filesystem allocation/metadata. There is no directory enumeration on the runtime path: each operation checks the 16 fixed temp names, and reads at most a 64-byte tag plus one manifest-declared payload. Length is checked before payload allocation. Unknown externally created files are neither read nor deleted and are outside this managed-data bound. Do not use this private directory for other files. This is not a global resident-resource quota.

Eviction does not dispose in-use textures/fighters: reads close immediately and loaded resources own their bytes/textures independently. There are no long-lived file handles across awaits.

## Failure and interruption policy

- A missing slot or a well-formed different hash tag is a miss. Fetch exactly the same pinned asset, validate, then install. No revision/character substitution.
- Malformed/oversized/wrong-length entries, or a same-tag hash/header/dimension mismatch, are removed and return `cache_corrupt`. No automatic HTTP retry in that operation. A deliberate arena retry can fetch the same pinned bytes next time. If removal fails, return `cache_filesystem` instead.
- Open/write/flush/rename/lock/path failures return `cache_filesystem`, even if HTTP succeeded. Cache-enabled loading does not silently disable storage. Retry deliberately after fixing the issue, or relaunch without the explicit cache flag.
- Each synchronous operation exclusively creates a `lock` directory. Contention and stale locks fail closed; no waiting, time/PID expiry or takeover. After stopping **all** cache-using game processes, inspect and remove only a confirmed-stale empty `user://content-cache/v1/lock` with `rmdir`. Never remove it while another operation can run.
- With the lock held, known `NN.tmp` leftovers are removed without reading. Installation writes the complete tag/payload into one same-directory temp, flushes/closes, checks errors/length, then atomically renames over the slot. A failed/interrupted write never becomes a hit; the old entry remains until successful rename. A process killed while holding the lock requires the manual stale-lock recovery above. No machine-power-loss/fsync durability guarantee is claimed; subsequent reads always revalidate.
- Reject symlink root components, slots and temp files, plus directory obstructions. The Godot user-data root and app-owned cache must be a trusted local filesystem containing ordinary files only. Godot lacks race-free no-follow/nonblocking opens: hostile concurrent mutation, special-file injection, OS disk quotas and other-platform semantics are **not** supported/security-tested. The cache does not inspect arbitrary paths or recursively delete directories.

## Evidence and remaining work

`pnpm test:godot:api` retains the real built-studio arena regression and adds fixed-slot/read/write/corruption/interruption/lock/symlink tests plus HTTP request-count assertions proving hits avoid downloads and corruption does not trigger implicit retry. Real built-studio factory tests load with cache enabled twice and compare pinned identity/runtime pixels. No active catalog refresh/live addition, polling, export, offline bundle or Phase 5 acceptance follows from these tests.
