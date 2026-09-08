import { AsyncLocalStorage } from "node:async_hooks";
import type { InputHandler } from "./input.ts";

interface ExecutionServices {
  verbose: boolean;
  handleInput?: InputHandler;
}

const services = new AsyncLocalStorage<ExecutionServices>();
export const executionServices = () => services.getStore();
export const withExecutionServices = <T>(options: ExecutionServices, work: () => T): T =>
  services.run(options, work);
