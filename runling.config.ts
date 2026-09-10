import chattoAgentDemo from "./workflows/chatto-agent-demo.ts";
import channelDemo from "./workflows/channel-demo.ts";
import { defineWebConfig, startWorkflow } from "runling/web";
import chattoInputDemo from "./workflows/chatto-input-demo.ts";
import chattoCoordinatorDemo from "./workflows/chatto-coordinator-demo.ts";
import chattoPlanDemo from "./workflows/chatto-plan-demo.ts";
import joke from "./workflows/joke.ts";
import makePullRequest from "./workflows/make-pr.ts";

export default defineWebConfig({
  webhooks: {
    "chatto-agent-demo": chattoAgentDemo.route,
    "channel-demo": startWorkflow(channelDemo),
    "chatto-input-demo": chattoInputDemo.route,
    "chatto-plan-demo": chattoPlanDemo.route,
    "chatto-coordinator-demo": chattoCoordinatorDemo.route,
    joke: startWorkflow(joke),
    "make-pr": startWorkflow(makePullRequest),
  },
});
