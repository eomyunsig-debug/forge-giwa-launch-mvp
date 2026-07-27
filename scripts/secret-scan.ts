import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(process.cwd());
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { cwd: root, encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const excludedExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".lock",
  ".png",
  ".webp",
]);
const signatures = [
  {
    label: "PEM private key",
    pattern: /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/u,
  },
  {
    label: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/u,
  },
  {
    label: "GitHub fine-grained token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/u,
  },
  { label: "OpenAI API key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u },
  {
    label: "assigned private key",
    pattern:
      /(?:^|\n)\s*(?:DEPLOYER_)?PRIVATE_KEY\s*=\s*0x[a-fA-F0-9]{64}\s*(?:\n|$)/u,
  },
] as const;

async function main(): Promise<void> {
  const findings: string[] = [];
  for (const relativePath of files) {
    if (
      relativePath === ".env.example" ||
      relativePath.startsWith("artifacts/abi/") ||
      excludedExtensions.has(extname(relativePath).toLowerCase())
    ) {
      continue;
    }
    const bytes = await readFile(resolve(root, relativePath));
    if (bytes.byteLength > 2 * 1024 * 1024 || bytes.includes(0)) continue;
    const content = bytes.toString("utf8");
    for (const signature of signatures) {
      if (signature.pattern.test(content)) {
        findings.push(`${relativePath}: ${signature.label}`);
      }
    }
  }

  if (findings.length > 0) {
    process.stderr.write(
      `Potential committed secrets found (values intentionally hidden):\n${findings
        .map((finding) => `- ${finding}`)
        .join("\n")}\n`,
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Secret pattern scan passed for ${files.length} files.\n`,
    );
  }
}

void main();
