"""Serve the same OmegaHive view and assets on loopback for standalone observation."""
import argparse
from pathlib import Path

from aiohttp import web

from app.program import read_graph

UI = Path(__file__).parent / "app" / "ui"


async def snapshot(request):
    graph = await read_graph()
    return web.json_response(graph, headers={"Cache-Control": "no-store"})


async def index(request):
    return web.FileResponse(UI / "index.html")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18764)
    args = parser.parse_args()
    app = web.Application()
    app.router.add_get("/api/view", snapshot)
    app.router.add_get("/", index)
    app.router.add_static("/", UI)
    web.run_app(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
