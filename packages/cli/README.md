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

DrawableWorkspace files have an explicit `workspace` namespace. Raw Scene commands
reject Workspace inputs and Workspace commands reject raw Scenes; there is no
automatic root-type guessing.

```bash
baron-kline workspace validate workspace.json
baron-kline workspace inspect workspace.json --json
baron-kline workspace drawings list workspace.json
baron-kline workspace drawings get workspace.json --id drawing-001
baron-kline workspace drawings add workspace.json --drawing drawing.json --output next.json
baron-kline workspace drawings replace workspace.json --drawing drawing.json --output next.json
baron-kline workspace drawings remove workspace.json --id drawing-001 --output next.json
baron-kline workspace render workspace.json --format html --output chart.html
baron-kline workspace render workspace.json --format png --output chart.png
```

Commands never overwrite an input scene. Replacing an existing output requires
`--force`.
