function paint(color: string, text: string) {
  const ansi = Bun.color(color, "ansi");
  return ansi ? `${ansi}${text}\x1b[0m` : text;
}

export const log = {
  info: (message: string) =>
    console.log(`${paint("dodgerblue", "●")} ${message}`),
  success: (message: string) =>
    console.log(`${paint("limegreen", "✓")} ${message}`),
  error: (message: string) =>
    console.error(`${paint("crimson", "✗")} ${message}`),
};
