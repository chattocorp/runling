import { defineWebConfig } from "factory/web";
import joke from "./workflows/joke.ts";
import makePullRequest from "./workflows/make-pr.ts";

export default defineWebConfig({
  webhooks: {
    joke: {
      workflow: joke,
    },
    "make-pr": {
      workflow: makePullRequest,
    },
  },
});
