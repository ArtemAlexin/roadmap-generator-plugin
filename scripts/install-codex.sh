#!/bin/sh
set -eu

skip_browser=false
case "${1-}" in
    '') ;;
    --skip-browser) skip_browser=true; shift ;;
    -h|--help)
        printf '%s\n' 'Usage: sh scripts/install-codex.sh [--skip-browser]'
        exit 0 ;;
    *) printf '%s\n' "Unknown option: $1" >&2; exit 1 ;;
esac
if [ "$#" -ne 0 ]; then
    printf '%s\n' 'Unexpected arguments. Use --help for usage.' >&2
    exit 1
fi

for command_name in codex node npm; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
        printf '%s\n' "Required command is missing: $command_name" >&2
        exit 1
    fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22+ is required."); process.exit(1); }'

roadmap_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
codex plugin marketplace add "$roadmap_root"
install_json=$(codex plugin add roadmap-generator@roadmap-tools --json)
installed_root=$(printf '%s\n' "$install_json" | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => input += chunk);
  process.stdin.on("end", () => {
    const result = JSON.parse(input);
    if (typeof result.installedPath !== "string" || !result.installedPath) {
      console.error("Codex did not return installedPath. Update Codex CLI and retry.");
      process.exit(1);
    }
    console.log(result.installedPath);
  });
')
if [ ! -f "$installed_root/.codex-plugin/plugin.json" ]; then
    printf '%s\n' "Plugin manifest missing in $installed_root" >&2
    exit 1
fi

cd -- "$installed_root"
npm ci --omit=dev --no-audit --no-fund
node "$roadmap_root/scripts/check-codex-install.js" "$installed_root"
if [ "$skip_browser" = false ]; then
    if ! node "$roadmap_root/scripts/check-codex-install.js" "$installed_root" --browser; then
        npx --no-install playwright install chromium
        node "$roadmap_root/scripts/check-codex-install.js" "$installed_root" --browser
    fi
fi

printf '%s\n' "Installed and verified: $installed_root" \
    'Restart Codex and open a new chat. The roadmap skill and MCP tools are supplied by the plugin.' \
    'If a separate roadmap MCP entry was configured previously, remove it with: codex mcp remove roadmap'
