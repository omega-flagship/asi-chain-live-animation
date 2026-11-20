"""Print the launcher settings that register this reviewed app in an OmegaHive checkout."""
import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import sys
import tempfile

APP = Path(__file__).resolve().parent / "app"
APP_ID = "shard-observatory"


def install_release(hive):
    from hive.core.programs import Programs

    digest = Programs.source_digest(APP)
    parent = hive.resolve() / ".runtime" / "app-releases" / APP_ID
    parent.mkdir(parents=True, exist_ok=True)
    release = parent / digest.removeprefix("sha256:")

    def verify(folder):
        if Programs.source_digest(folder) != digest:
            raise ValueError(f"Source digest mismatch in {folder}")
        ui = folder / "ui"
        for name, expected in json.loads((ui / "bundle.lock.json").read_text())["files"].items():
            if hashlib.sha256((ui / name).read_bytes()).hexdigest() != expected:
                raise ValueError(f"UI lock mismatch for {name}")

    if not release.exists():
        with tempfile.TemporaryDirectory(dir=parent) as staging:
            candidate = Path(staging) / "app"
            shutil.copytree(APP, candidate, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
            verify(candidate)
            try:
                candidate.rename(release)
            except OSError as exc:
                if exc.errno not in (errno.EEXIST, errno.ENOTEMPTY):
                    raise
    verify(release)
    return release, digest


def launcher_settings(environ, digest, swarm=None, *, release):
    pins = json.loads(environ.get("HIVE_APP_PINS") or "{}")
    replaced = {APP, release}
    previous = pins.get(APP_ID, {}).get("release")
    if previous:
        replaced.add(Path(previous).expanduser().resolve())
    directories = [p for p in environ.get("HIVE_PLUGIN_DIRS", "").split(os.pathsep)
                   if p and Path(p).expanduser().resolve() not in replaced]
    directories.append(str(release))
    pins[APP_ID] = {"release": str(release), "digest": digest}
    settings = {"HIVE_PLUGIN_DIRS": os.pathsep.join(directories), "HIVE_APP_PINS": json.dumps(pins)}
    if swarm:
        homes = json.loads(environ.get("HIVE_APP_HOMES") or "{}")
        homes[APP_ID] = [swarm]
        settings["HIVE_APP_HOMES"] = json.dumps(homes)
    return settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hive", type=Path, required=True, help="OmegaHive checkout")
    parser.add_argument("--home", help="Existing shared swarm ID to open from the Apps menu")
    args = parser.parse_args()
    sys.path.insert(0, str(args.hive.resolve()))
    release, digest = install_release(args.hive)
    for name, value in launcher_settings(os.environ, digest, args.home, release=release).items():
        print(f"export {name}={shlex.quote(value)}")


if __name__ == "__main__":
    main()
