import { createReadStream } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import { resolve } from "node:path";

async function git(cwd: string, args: string[]) {
  const process = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(stderr);
  }

  return stdout;
}

async function hasHead(cwd: string) {
  const process = Bun.spawn(["git", "rev-parse", "--verify", "HEAD"], {
    cwd,
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await process.exited) === 0;
}

function updateField(
  hasher: Bun.CryptoHasher,
  value: string | ArrayBuffer | Uint8Array,
) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  hasher.update(`${bytes.byteLength}:`);
  hasher.update(bytes);
}

async function updateUntrackedFile(
  hasher: Bun.CryptoHasher,
  cwd: string,
  path: string,
) {
  const absolutePath = resolve(cwd, path);
  const stat = await lstat(absolutePath);

  updateField(hasher, path);
  updateField(hasher, String(stat.mode));

  if (stat.isSymbolicLink()) {
    updateField(hasher, await readlink(absolutePath));
    return;
  }

  if (!stat.isFile()) {
    return;
  }

  updateField(hasher, String(stat.size));
  for await (const chunk of createReadStream(absolutePath)) {
    hasher.update(chunk);
  }
}

export async function workingTreeHash(cwd = process.cwd()) {
  const hasher = new Bun.CryptoHasher("sha256");
  if (await hasHead(cwd)) {
    updateField(hasher, await git(cwd, ["diff", "--binary", "HEAD"]));
  } else {
    updateField(hasher, await git(cwd, ["diff", "--binary", "--cached"]));
    updateField(hasher, await git(cwd, ["diff", "--binary"]));
  }

  const untrackedFiles = new TextDecoder()
    .decode(
      await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
    )
    .split("\0")
    .filter(Boolean)
    .sort();

  for (const path of untrackedFiles) {
    await updateUntrackedFile(hasher, cwd, path);
  }

  return hasher.digest("hex");
}

export class WorkingDirectory {
  private constructor(
    readonly path: string,
    private readonly initialHash: string,
  ) {}

  static async create(path = process.cwd()) {
    return new WorkingDirectory(path, await workingTreeHash(path));
  }

  get hasChanges(): Promise<boolean> {
    return workingTreeHash(this.path).then(
      (currentHash) => currentHash !== this.initialHash,
    );
  }
}

export function getPwd(path = process.cwd()) {
  return WorkingDirectory.create(path);
}
