import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const installedRoot = path.resolve(process.argv[2]);
if (process.argv.includes('--browser')) {
  const { launchBrowser } = await import(pathToFileURL(path.join(installedRoot, 'src/browser.js')));
  const browser = await launchBrowser();
  await browser.close();
  console.log('Browser launch: OK');
} else {
  const requireInstalled = createRequire(path.join(installedRoot, 'package.json'));
  const { Client } = await import(pathToFileURL(requireInstalled.resolve('@modelcontextprotocol/sdk/client/index.js')));
  const { StdioClientTransport } = await import(pathToFileURL(requireInstalled.resolve('@modelcontextprotocol/sdk/client/stdio.js')));
  const client = new Client({ name: 'roadmap-install-check', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(installedRoot, 'src/server.js')], cwd: installedRoot, stderr: 'inherit' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    if (!tools.some(tool => tool.name === 'roadmap_build')) throw new Error('roadmap_build is missing');
    const guidance = await client.callTool({ name: 'roadmap_guidance', arguments: { phase: 'workflow' } });
    if (guidance.isError || !guidance.content?.some(item => item.type === 'text' && item.text.includes('roadmap_question'))) {
      throw new Error('Workflow guidance could not be read');
    }
    console.log('MCP handshake, tools and workflow guidance: OK');
  } finally {
    await client.close();
  }
}
