import { defineWebConfig } from "runling/web";
import chattoInputDemo from "./workflows/chatto-input-demo.ts";
import chattoPlanDemo from "./workflows/chatto-plan-demo.ts";
import joke from "./workflows/joke.ts";
import makePullRequest from "./workflows/make-pr.ts";

export default defineWebConfig({
  webhooks: {
    "chatto-input-demo": {
      task: chattoInputDemo,
      route: chattoInputDemo.route,
    },
    "chatto-plan-demo": {
      task: chattoPlanDemo,
      route: chattoPlanDemo.route,
    },
    joke: {
      task: joke,
    },
    "make-pr": {
      task: makePullRequest,
    },
  },
});
