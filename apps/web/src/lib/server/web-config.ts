import { pathToFileURL } from "node:url";
import { isWebConfig, type WebConfig } from "factory-web";

let loadedConfig: Promise<WebConfig> | undefined;

export function loadWebConfig(): Promise<WebConfig> {
  const configPath = process.env.FACTORY_WEB_CONFIG;
  if (configPath === undefined) {
    throw new Error("FACTORY_WEB_CONFIG is not set");
  }

  loadedConfig ??= import(
    /* @vite-ignore */ pathToFileURL(configPath).href
  ).then((module: { default?: unknown }) => {
    const config = module.default;
    if (!isWebConfig(config)) {
      throw new Error(`${configPath} must export a Factory web configuration`);
    }
    return config as WebConfig;
  });

  return loadedConfig;
}
