"""Read-only OmegaHive app for the local F1R3node shard."""
import asyncio

from omega_shard_telemetry import ShardFeed

feed = ShardFeed()


def describe():
    return {"contract": "0.1", "actions": [], "relations": [],
            "kinds": [{"id": "shard", "label": "Shard", "role": "other"},
                      {"id": "node", "label": "Node", "role": "other"}]}


async def read_graph():
    sample = await feed.snapshot()
    nodes = [{"kind": "node", "label": n["id"], **n} for n in sample["nodes"]]
    root = {"id": "shard", "kind": "shard", "label": "Shard observatory",
            **{k: v for k, v in sample.items() if k != "nodes"}}
    return {"revision": str(sample["at"]), "title": "Shard observatory", "focus": "shard",
            "items": [root, *nodes], "links": []}


def view(ctx, focus, stage):
    # The live Hive awaits views. Hive's offline contract checker calls view synchronously.
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(read_graph())
    return read_graph()


def act(ctx, action, items, params):
    return {"status": "refused", "message": "The observatory is read-only."}
