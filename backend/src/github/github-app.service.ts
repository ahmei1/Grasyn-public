import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { GITHUB_SETTINGS } from '../common/config';

const API = 'https://api.github.com';
const MAX_REPOSITORY_PAGES = 10;

type Settings = {
  appId: string;
  slug: string;
  privateKey: string;
  webhookSecret: string;
};

export type GitHubAccount = { login: string; type: string };

export type GitHubRepository = {
  id: number;
  full_name: string;
  html_url?: string;
  default_branch?: string;
  private: boolean;
};

export class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`GitHub answered ${status} for ${path}`);
  }
}

/** GitHub accepts app tokens for at most ten minutes; back-date for clock drift. */
export function createAppJwt(
  appId: string,
  privateKey: string,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000) - 60;
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iat: issuedAt,
    exp: issuedAt + 600,
    iss: appId,
  })}`;
  const signature = createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey)
    .toString('base64url');
  return `${unsigned}.${signature}`;
}

/** The signature covers the exact bytes GitHub sent, not the parsed JSON. */
export function verifyWebhookSignature(
  secret: string,
  rawBody: Buffer,
  header: string | undefined,
) {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`,
  );
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

@Injectable()
export class GitHubAppService {
  private readonly logger = new Logger(GitHubAppService.name);
  private readonly settings: Settings | null;

  constructor(config: ConfigService) {
    this.settings = this.load(config);
  }

  get enabled() {
    return this.settings !== null;
  }

  installUrl(state: string) {
    const { slug } = this.require();
    return `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`;
  }

  verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.settings || !rawBody) return false;
    return verifyWebhookSignature(
      this.settings.webhookSecret,
      rawBody,
      signature,
    );
  }

  async getInstallation(installationId: number) {
    const installation = await this.request<{ account: GitHubAccount }>(
      `/app/installations/${installationId}`,
      this.appToken(),
    );
    return installation.account;
  }

  async listRepositories(installationId: number) {
    const { token } = await this.request<{ token: string }>(
      `/app/installations/${installationId}/access_tokens`,
      this.appToken(),
      'POST',
    );
    const repositories: GitHubRepository[] = [];
    for (let page = 1; page <= MAX_REPOSITORY_PAGES; page++) {
      const result = await this.request<{
        total_count: number;
        repositories: GitHubRepository[];
      }>(`/installation/repositories?per_page=100&page=${page}`, token);
      repositories.push(...result.repositories);
      if (
        result.repositories.length === 0 ||
        repositories.length >= result.total_count
      ) {
        break;
      }
    }
    return repositories;
  }

  private appToken() {
    const { appId, privateKey } = this.require();
    return createAppJwt(appId, privateKey);
  }

  private async request<T>(path: string, token: string, method = 'GET') {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': this.require().slug,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new GitHubApiError(response.status, path);
    return (await response.json()) as T;
  }

  private require() {
    if (!this.settings) throw new Error('GitHub is not configured');
    return this.settings;
  }

  private load(config: ConfigService): Settings | null {
    const values = GITHUB_SETTINGS.map((name) => config.get<string>(name));
    if (values.some((value) => !value)) return null;
    const [appId, slug, keyPath, webhookSecret] = values as string[];
    const resolvedKey = resolvePrivateKeyPath(keyPath);
    try {
      const privateKey = readFileSync(resolvedKey, 'utf8');
      return { appId, slug, privateKey, webhookSecret };
    } catch {
      this.logger.warn(
        `GitHub is off: cannot read the private key at ${resolvedKey}`,
      );
      return null;
    }
  }
}

function resolvePrivateKeyPath(keyPath: string) {
  if (isAbsolute(keyPath)) return keyPath;
  const candidates = [resolve(keyPath), resolve(__dirname, '../..', keyPath)];
  return candidates.find((path) => existsSync(path)) ?? candidates[0];
}
