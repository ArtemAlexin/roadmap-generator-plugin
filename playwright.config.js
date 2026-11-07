import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath=process.env.ROADMAP_BROWSER_PATH || (process.platform==='win32'?(fs.existsSync(edge)?edge:fs.existsSync(chrome)?chrome:undefined):undefined);
export default defineConfig({
  testDir:'./tests/ui',fullyParallel:false,workers:1,timeout:60000,
  reporter:[['list'],['html',{open:'never'}]],
  use:{headless:true,launchOptions:executablePath?{executablePath}:{},screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{browserName:'chromium'}}]
});
