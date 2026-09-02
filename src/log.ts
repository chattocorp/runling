function paint(color: string, text: string) {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
}

export type LogLevel = "info" | "debug";

export const log = {
  level: "info" as LogLevel,
  debug: (message: string) => {
    if (log.level === "debug") {
      console.log(`${paint("gray", "·")} ${message}`);
    }
  },
  info: (message: string) =>
    console.log(`${paint("dodgerblue", "●")} ${message}`),
  success: (message: string) =>
    console.log(`${paint("limegreen", "✓")} ${message}`),
  error: (message: string) =>
    console.error(`${paint("crimson", "✗")} ${message}`),
};
