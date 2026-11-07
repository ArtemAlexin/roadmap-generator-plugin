import path from 'node:path';
import os from 'node:os';

export function defaultDataDirectory() {
  if (process.env.ROADMAP_DATA_DIR) return process.env.ROADMAP_DATA_DIR;
  const pluginData = process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA;
  if (pluginData) return path.join(pluginData, 'roadmap-state');
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'roadmap-generator', 'state');
}
