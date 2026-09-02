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

export async function workingTreeHash(cwd = process.cwd()) {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await git(cwd, ["diff", "--binary", "HEAD"]));

  const untrackedFiles = new TextDecoder()
    .decode(
      await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
    )
    .split("\0")
    .filter(Boolean)
    .sort();

  for (const path of untrackedFiles) {
    hasher.update(path);
    hasher.update("\0");
    hasher.update(await Bun.file(resolve(cwd, path)).arrayBuffer());
    hasher.update("\0");
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
