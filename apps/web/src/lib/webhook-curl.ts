import { sample } from "./sample.ts";

/** Quote one argument for POSIX shells, including embedded apostrophes. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function webhookCurl(url: string, bodySchema: unknown): string {
  return [
    `curl --request POST ${shellQuote(url)}`,
    `  --header 'content-type: application/json'`,
    `  --data-raw ${shellQuote(JSON.stringify(sample(bodySchema), null, 2))}`,
  ].join(" \\\n");
}
