import { Type } from "factory";
import { defineWebConfig, webhook } from "factory-web";
import joke from "./workflows/joke.ts";

export default defineWebConfig({
  webhooks: {
    joke: webhook({
      body: Type.Object({
        value: Type.String({
          minLength: 1,
          description: "The subject of the joke",
        }),
      }),
      workflow: joke,
      input: ({ value }) => value,
    }),
  },
});
