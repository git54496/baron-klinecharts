from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import venv
import zipfile
from pathlib import Path

repository = Path(__file__).resolve().parents[2]
package = repository / "python" / "baron-klinecharts"
fixture = repository / "tests" / "fixtures" / "scenes" / "minimal-valid.json"

with tempfile.TemporaryDirectory(prefix="baron-python-package-") as raw_directory:
    directory = Path(raw_directory)
    distribution = directory / "dist"
    subprocess.run(
        [
            sys.executable,
            "-m",
            "build",
            "--wheel",
            "--sdist",
            "--outdir",
            str(distribution),
            str(package),
        ],
        check=True,
    )
    wheel = next(distribution.glob("*.whl"))
    source = next(distribution.glob("*.tar.gz"))
    with zipfile.ZipFile(wheel) as archive:
        wheel_files = set(archive.namelist())
        assert any(name.endswith("runtime/runtime-template.html") for name in wheel_files)
        assert any(name.endswith("schemas/chart-scene.schema.json") for name in wheel_files)
        assert any(name.endswith(".dist-info/licenses/LICENSE") for name in wheel_files)
        assert any(name.endswith(".dist-info/licenses/NOTICE") for name in wheel_files)
        assert any("KLineCharts-LICENSE" in name for name in wheel_files)
        assert any("Noto-Sans-SC-OFL-1.1" in name for name in wheel_files)
        assert any("fflate-LICENSE" in name for name in wheel_files)
    with tarfile.open(source) as archive:
        source_files = set(archive.getnames())
        assert any(name.endswith("/LICENSE") for name in source_files)
        assert any(name.endswith("/NOTICE") for name in source_files)
        assert any(name.endswith("/runtime/runtime-template.html") for name in source_files)

    environment = directory / "venv"
    venv.EnvBuilder(with_pip=True).create(environment)
    executable = (
        environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    )
    subprocess.run(
        [str(executable), "-m", "pip", "install", str(wheel)],
        check=True,
    )
    example_output = directory / "python-example"
    subprocess.run(
        [
            str(executable),
            str(repository / "examples" / "python" / "main.py"),
            str(example_output),
        ],
        check=True,
    )
    output = example_output / "scene.html"
    png = example_output / "scene.png"
    assert "__BARON_KLINE_SCENE__" in output.read_text(encoding="utf-8")
    assert png.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")

print("Python wheel, sdist, and fresh-install smoke passed.")
