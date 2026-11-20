# Shard Observatory for OmegaHive

Each star is a node reported by the local F1R3node Rust observer. Comets travel
between the peers involved in a block transfer, or enter from the edge when
a node admits an external signed deploy. Select a node to follow its traffic.
Each legend entry filters both the map and the event stream.

| Legend | What the comet shows |
| --- | --- |
| Block proposal · blue | The proposing node sent its new block to a specific peer. |
| Block confirmation · green | The receiving peer validated that block. The same comet turns green on arrival. |
| Block rejection · red | The receiving peer refused the incoming block or recorded a definitive invalid verdict. |
| Deploy submission · white | A node admitted a signed deploy, including a deploy forwarded through its queue. |

The **Finalized** counter tracks chain finality separately from individual peer
confirmations. The event table shows one row per observed transfer and its latest
result. A proposal can count in both the blue and green or red legend entries.
A verdict received on a later poll updates the same transfer.

Deploy intake identifies the receiving node and prints a shortened deploy
signature. The edge entry represents an anonymous external submitter. Its
position is illustrative. Hover over an event row for its recorded reference.

The white legend count covers validator receipts in the last 60 seconds.
**Deploys accepted by queues** sums the intake counters from the connected
validators’ deploy queues. This total rises when a queue accepts a client
submission, even if the validator receives it later. It stays visible through
quiet minutes and page reloads. Each queue’s contribution resets when that
queue restarts. A dash means the total is unavailable.

## Run locally

Use Python 3.12 or later. From this checkout, with the updated sibling
`omega-flagship/chain-tools` checkout available:

```sh
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e ../omega-flagship/chain-tools 'aiohttp>=3.10,<4'
.venv/bin/python serve.py
```

Open [the local observatory](http://127.0.0.1:18764/). Choose another loopback
port with `--port`. This server and the native Hive frame use the same app
and live feed. Only the standalone server needs aiohttp.

## Load in OmegaHive

The app source is in `app/`. It contains the v0.1 program, interface and
pinned UI bundle. The host process reads the observer and local container
logs. The Hive frame receives snapshots through its existing view bridge.

From this checkout, with the normal Hive launch environment already loaded:

```sh
hive=../omega-flagship/omegahive
uv pip install --python "$hive/.venv/bin/python" --no-deps -e ../omega-flagship/chain-tools
"$hive/.venv/bin/python" hive_env.py --hive "$hive" --home YOUR_SHARED_SWARM_ID > shard-observatory.env
. ./shard-observatory.env
```

The helper copies the app into a release directory named for its digest under
`$hive/.runtime/app-releases/shard-observatory/`. It checks the copied code
and UI bundle before printing the plugin path and pin. Edits to the working
copy can then be tested without closing the installed interface.

Save the merged exports in the Hive launcher configuration. Start or
gracefully restart Hive with those settings, then open **Apps → Shard
Observatory**. Omit `--home` to select a swarm in Hive. To upgrade, run the
helper for the new source and restart with its exports. A running Hive reads
pins from its process environment, so changing the launcher file alone takes
effect on the next start.

## Telemetry

The host adapter is `omega_shard_telemetry` in the sibling chain-tools package.
It uses the existing `CHAIN_OBSERVER_URL`, `CHAIN_NETWORK_ID` and
`CHAIN_SHARD_ID` settings, defaulting to `http://127.0.0.1:40453`,
`testnet` and `root`. Use the Docker context for the local shard. The host
account needs permission to read its container logs.

One shared poll serves concurrent viewers. Channel counts cover the most
recent sampled minute. The host returns up to 240 recent events. The table
shows the newest six, or up to fifty when expanded. Comets animate newly
observed activity. Missing logs are shown per node, and observer failures
put the feed offline. No chain transaction is required to view the shard.

The telemetry parser and snapshot regression tests live in
`chain-tools/tests/test_shard_telemetry.py`. Run OmegaHive's native contract
checker from the Hive checkout with `python -m hive.programs_check /path/to/asi-chain-live-animation/app`.
