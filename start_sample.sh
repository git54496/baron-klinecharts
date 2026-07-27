#!/usr/bin/env bash

set -euo pipefail

repository_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "${repository_directory}"

if ! command -v npm >/dev/null 2>&1; then
	echo "启动失败：未找到 npm，请先安装仓库要求的 Node.js 与 npm 版本。" >&2
	exit 1
fi

exec npm run example:vanilla
