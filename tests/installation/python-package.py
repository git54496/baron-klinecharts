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
time_series_fixture = (
    repository / "tests" / "fixtures" / "time-series" / "minimal-valid.json"
)

with tempfile.TemporaryDirectory(prefix="baron-python-package-") as raw_directory:
    directory = Path(raw_directory)
    artifact_directory = os.environ.get("BARON_PYTHON_ARTIFACT_DIR")
    if artifact_directory is None:
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
    else:
        distribution = Path(artifact_directory).resolve()
    wheels = list(distribution.glob("*.whl"))
    sources = list(distribution.glob("*.tar.gz"))
    assert len(wheels) == 1, "Expected exactly one Python wheel artifact."
    assert len(sources) == 1, "Expected exactly one Python sdist artifact."
    wheel = wheels[0]
    source = sources[0]
    with zipfile.ZipFile(wheel) as archive:
        wheel_files = set(archive.namelist())
        assert any(name.endswith("runtime/runtime-template.html") for name in wheel_files)
        assert any(name.endswith("schemas/chart-scene.schema.json") for name in wheel_files)
        assert any(
            name.endswith("schemas/time-series-scene.schema.json")
            for name in wheel_files
        )
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
        assert any(
            name.endswith("/schemas/time-series-scene.schema.json")
            for name in source_files
        )

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

    subprocess.run(
        [
            str(executable),
            "-c",
            "\n".join(
                [
                    "from pathlib import Path",
                    "from baron_kline import (",
                    "    build_time_series_standalone_html,",
                    "    hash_canonical_time_series_scene,",
                    "    load_time_series_scene,",
                    ")",
                    "scene = load_time_series_scene(Path(__import__('sys').argv[1]))",
                    "assert len(scene.series) == 3",
                    "assert len(hash_canonical_time_series_scene(scene)) == 64",
                    "assert '__BARON_KLINE_SCENE__' in build_time_series_standalone_html(scene)",
                ]
            ),
            str(time_series_fixture),
        ],
        check=True,
    )

print("Python wheel, sdist, and fresh-install smoke passed.")
