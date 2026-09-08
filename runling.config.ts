import { defineWebConfig } from "runling/web";
import joke from "./workflows/joke.ts";
import makePullRequest from "./workflows/make-pr.ts";

export default defineWebConfig({
  webhooks: {
    joke: {
      task: joke,
    },
    "make-pr": {
      task: makePullRequest,
    },
  },
});
