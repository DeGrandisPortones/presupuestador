const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptsDir = __dirname;
const scripts = [
  'apply_parantes_pricing_patch.cjs',
  'apply_odoo_debug_dashboard_patch.cjs',
];

for (const script of scripts) {
  const full = path.join(scriptsDir, script);
  if (!fs.existsSync(full)) {
    console.log(`[runtime-patches] ${script} no existe, se omite.`);
    continue;
  }
  const res = spawnSync(process.execPath, [full], { stdio: 'inherit' });
  if (res.status !== 0) process.exit(res.status || 1);
}
