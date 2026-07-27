# @baron1996/klinecharts-cli

CLI for validating, inspecting, editing, and deterministically rendering ChartScene
files.

```bash
npm install --global @baron1996/klinecharts-cli
baron-kline install-browser
```

```bash
baron-kline validate scene.json
baron-kline inspect scene.json --json
baron-kline overlays list scene.json
baron-kline render scene.json --format html --output scene.html
baron-kline render scene.json --format png --output scene.png
```

Commands never overwrite an input scene. Replacing an existing output requires
`--force`.
