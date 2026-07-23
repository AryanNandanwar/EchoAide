import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
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

/** Host-side dummy certs for nginx-ssl.conf (Let's Encrypt paths absent in CI). */
function ensureDummySslCertDir(): string {
  const certDir = path.join(os.tmpdir(), 'echoaide-nginx-smoke-certs');
  fs.mkdirSync(certDir, { recursive: true });
  const keyPath = path.join(certDir, 'privkey.pem');
  const certPath = path.join(certDir, 'fullchain.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    execSync(
      `openssl req -x509 -nodes -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -subj /CN=app.echoaide.in`,
      { stdio: 'pipe' },
    );
  }
  return certDir;
}

function nginxConfigTestInDocker(configPath: string): void {
  const absoluteConfig = path.join(repoRoot, configPath);
  // --add-host: nginx -t resolves upstream hostnames; "backend" only exists
  // on the compose network, not in this isolated container.
  const volumes = [
    `-v "${absoluteConfig}:/etc/nginx/conf.d/default.conf:ro"`,
  ];
  if (configPath.endsWith('nginx-ssl.conf')) {
    const certDir = ensureDummySslCertDir();
    volumes.push(
      `-v "${certDir}:/etc/letsencrypt/live/app.echoaide.in:ro"`,
    );
  }
  execSync(
    `docker run --rm --add-host=backend:127.0.0.1 ${volumes.join(' ')} nginx:alpine nginx -t`,
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
