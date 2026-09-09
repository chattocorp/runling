import { defineWebConfig } from "runling/web";
import chattoInputDemo from "./workflows/chatto-input-demo.ts";
import joke from "./workflows/joke.ts";
import makePullRequest from "./workflows/make-pr.ts";

export default defineWebConfig({
  webhooks: {
    "chatto-input-demo": {
      task: chattoInputDemo,
    },
    joke: {
      task: joke,
    },
    "make-pr": {
      task: makePullRequest,
    },
  },
});
