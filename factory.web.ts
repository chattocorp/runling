import { defineWebConfig } from "factory-web";
import joke from "./workflows/joke.ts";

export default defineWebConfig({
  webhooks: {
    joke: {
      workflow: joke,
    },
  },
});
