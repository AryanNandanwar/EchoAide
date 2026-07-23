import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.join(__dirname, '../../..');

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function nginxConfigTestInDocker(configPath: string): void {
  const absoluteConfig = path.join(repoRoot, configPath);
  execSync(
    `docker run --rm -v "${absoluteConfig}:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`,
    { stdio: 'pipe' },
  );
}

function assertProxyRoutes(config: string): void {
  expect(config).toMatch(/location\s+\/api\//);
  expect(config).toMatch(/proxy_pass\s+http:\/\/backend:3000/);
  expect(config).toMatch(/proxy_http_version\s+1\.1/);
}

function assertNginxStructure(configPath: string): void {
  const config = fs.readFileSync(path.join(repoRoot, configPath), 'utf8');

  if (configPath.endsWith('nginx-local.conf')) {
    assertProxyRoutes(config);
    expect(config).toMatch(/location\s+\/socket\.io\//);
    expect(config).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html/);
    expect(config).toMatch(/Upgrade \$http_upgrade/);
    return;
  }

  if (configPath.endsWith('nginx-ssl.conf')) {
    assertProxyRoutes(config);
    expect(config).toMatch(/location\s+\/socket\.io\//);
    expect(config).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html/);
    expect(config).toMatch(/listen\s+443\s+ssl/);
    return;
  }

  if (configPath.endsWith('nginx.conf')) {
    assertProxyRoutes(config);
    expect(config).toMatch(/return\s+301\s+https:\/\//);
  }
}

function validateConfig(configPath: string): void {
  if (dockerAvailable()) {
    nginxConfigTestInDocker(configPath);
  } else {
    assertNginxStructure(configPath);
  }
}

describe('Infrastructure smoke: nginx config syntax', () => {
  it('validates frontend/nginx-local.conf (local docker-compose)', () => {
    validateConfig('frontend/nginx-local.conf');
  });

  it('validates frontend/nginx.conf (HTTP redirect layer)', () => {
    validateConfig('frontend/nginx.conf');
  });

  it('validates frontend/nginx-ssl.conf (HTTPS SPA + proxies)', () => {
    validateConfig('frontend/nginx-ssl.conf');
  });
});
