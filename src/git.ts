import { $ } from "bun";

export async function workingTreeHash() {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(await $`git diff --binary HEAD`.arrayBuffer());

  const untrackedFiles = (await $`git ls-files --others --exclude-standard`.text())
    .split("\n")
    .filter(Boolean)
    .sort();

  for (const path of untrackedFiles) {
    hasher.update(path);
    hasher.update(await Bun.file(path).arrayBuffer());
  }

  return hasher.digest("hex");
}
