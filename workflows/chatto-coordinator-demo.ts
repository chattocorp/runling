import { runAgentWithText, progressInstructions } from "./chatto/agent-text.ts";
import {
  agent, createMessageChannel, defineAgentExtension, input, task, Type,
  type AgentOptions, type RunlingAgent,
} from "runling";
import { sendChattoTyping, type ChattoTyping } from "./chatto/typing.ts";
import { createChattoImplementation } from "./chatto/implement.ts";
import { runChattoAgent } from "./chatto/agent.ts";
import { createChattoWebhook, messageSignal, postToChatto, type ChattoPost } from "./chatto/webhook.ts";

type BotAgent = Pick<RunlingAgent, "runOutcome" | "steer" | "dispose">;
export interface CoordinatorDemoOptions {
  directory: string;
  post: ChattoPost;
  typing?: ChattoTyping;
  model?: string;
  timeout?: number;
  createAgent?: (options: AgentOptions) => Promise<BotAgent>;
  implement?: ReturnType<typeof createChattoImplementation>;
}

/** An ordinary root task defines the capabilities of its agentic coordinator. */
export function createChattoCoordinatorDemo({
  directory, post, typing, model = "openai-codex/gpt-5.6-sol", timeout = 900,
  createAgent = agent, implement,
}: CoordinatorDemoOptions) {
  if (!Number.isFinite(timeout) || timeout < 0 || Math.ceil(timeout * 1000) > 2_147_483_647) {
    throw new RangeError("timeout must be seconds between 0 and 2147483.647");
  }
  return createChattoWebhook({
    name: "Chatto coordinator demo",
    output: Type.Object({ summary: Type.String() }),
    post,
    async run(rootCtx, delivery, destination, inbox) {
      let outgoing = Promise.resolve();
      let questions = 0;
      const children = new Set<ReturnType<typeof createMessageChannel>>();
      async function delegate<T>(work: (messages: ReturnType<typeof createMessageChannel>) => Promise<T>): Promise<T> {
        const messages = createMessageChannel();
        children.add(messages);
        try { return await work(messages); }
        finally { children.delete(messages); }
      }
      const send: ChattoPost = (target, text, signal) => {
        const sent = outgoing.then(() => post(target, text, signal));
        outgoing = sent.catch(() => {});
        return sent;
      };
      // Tools share this run's context. A question follows any already queued replies.
      const ctx = {
        ...rootCtx,
        onText: (text: string) => send(destination, text, messageSignal(rootCtx)),
        onInput: async (request: Parameters<NonNullable<typeof rootCtx.onInput>>[0]) => {
          await outgoing;
          request.signal?.throwIfAborted();
          questions++;
          try { return await rootCtx.onInput!(request); }
          finally { questions--; }
        },
      };
      const say = (text: string) => ctx.onText(text);
      const investigationInput = Type.Object({ question: Type.String({ minLength: 1 }) });
      const investigate = (question: string) => task({
        name: `Investigate: ${question.replace(/\s+/g, " ").trim()}`,
        input: investigationInput,
        output: Type.String(),
      }, async (taskCtx, { question }) => {
        await taskCtx.onText?.(`Investigating: ${question}`);
        const researcher = await createAgent({
          cwd: directory, model, thinkingLevel: "medium",
          tools: ["read", "grep", "find", "ls"],
          resources: { extensions: false, skills: false, promptTemplates: false },
          instructions: [
            ...progressInstructions,
            "Investigate the requested repository facts without modifying files.",
            "Answer only the assigned question. Use targeted searches and stop once you have enough evidence; do not perform a broad repository audit.",
            "Return concise findings with file paths. Do not ask the user questions; explain gaps to the coordinator.",
          ],
        });
        try {
          const report = await runAgentWithText(taskCtx, researcher, question);
          if (report.outcome === "failed") throw new Error(report.summary);
          await taskCtx.onText?.("Investigation complete. Reviewing the findings for the plan.");
          return report.details ?? report.summary;
        } finally { researcher.dispose(); }
      });
      const askUser = task({
        name: "Ask Chatto user",
        input: Type.Object({ question: Type.String({ minLength: 1 }) }),
        output: Type.String(),
      }, (taskCtx, { question }) => input(taskCtx, question, { timeout }));

      const implementationTask = implement ?? createChattoImplementation({
        createAgent,
      });
      let approving = false;
      let implementationAttempted = false;
      const implementPlan = task({
        name: "Approve Chatto implementation",
        input: Type.Object({ plan: Type.String({ minLength: 1, maxLength: 20_000 }) }),
        output: Type.String(),
      }, async (taskCtx, { plan }) => {
        if (approving || implementationAttempted) throw new Error("An implementation is already pending or was attempted in this conversation. Start a new DM for another attempt.");
        approving = true;
        try {
          const answer = await input(taskCtx, `${plan}\n\nReply /implement to implement this exact plan in a new worktree, or send feedback to revise it.`, { timeout });
          if (answer.trim() !== "/implement") return `Implementation was not approved. User feedback: ${answer}`;
          taskCtx.signal.throwIfAborted();
          implementationAttempted = true;
          try {
            const result = await delegate(messages => implementationTask({ ...taskCtx, messages }, { directory, plan, model }));
            return `${result.summary}\n\nWorktree: ${result.directory}\nBranch: ${result.branch}\nChecks and tests passed. Review the changes in this worktree.`;
          } catch (error) {
            await say(error instanceof Error ? error.message : "Implementation failed; inspect the run for details.").catch(() => {});
            throw error;
          }
        } finally { approving = false; }
      });

      // Context stays explicit at the task call. These tools belong to this run only.
      const tools = defineAgentExtension(pi => {
        pi.registerTool({
          name: "investigate", label: "Investigate Chatto",
          description: "Ask one read-only specialist a focused repository question. Each call starts a new agent with its own cost. Reuse returned findings; combine related questions in one call. Returns findings to you, not the user.",
          parameters: investigationInput,
          async execute(_id, args, signal) {
            const result = await delegate(messages => investigate(args.question)({ ...ctx, messages, signal: signal ? AbortSignal.any([ctx.signal, signal]) : ctx.signal }, args));
            return { content: [{ type: "text", text: result }], details: {} };
          },
        });
        pi.registerTool({
          name: "ask_user", label: "Ask user",
          description: "Post a question to the Chatto thread and wait for the user's answer. Use this for clarification or plan feedback.",
          parameters: askUser.input,
          async execute(_id, args, signal) {
            const result = await askUser({ ...ctx, signal: signal ? AbortSignal.any([ctx.signal, signal]) : ctx.signal }, args);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        });
        pi.registerTool({
          name: "implement", label: "Implement plan",
          description: "Present the complete proposed plan, request explicit user approval, then implement and validate it in a separate worktree. This tool asks for approval itself; do not ask for /implement separately. Returns feedback if the user declines.",
          parameters: implementPlan.input,
          async execute(_id, args, signal) {
            const result = await implementPlan({ ...ctx, signal: signal ? AbortSignal.any([ctx.signal, signal]) : ctx.signal }, args);
            return { content: [{ type: "text", text: result }], details: {} };
          },
        });
      });
      await say("I’ll coordinate this request with specialist tasks. Send thoughts at any time, or /cancel to stop. I’ll ask you to approve the exact plan before implementing it.");
      const coordinator = await createAgent({
        cwd: directory, model, thinkingLevel: "medium",
        tools: ["investigate", "ask_user", "implement"], extensions: [tools],
        resources: { extensions: false, skills: false, promptTemplates: false },
        instructions: [
          "You coordinate a Chatto planning conversation. Choose your tools and sequence yourself.",
          "Use investigate for repository facts; use ask_user for material questions and feedback on your proposed plan.",
          "Default to one focused investigation. Combine related questions so one specialist can reuse what it reads. Reuse its findings rather than asking another agent to repeat the same work.",
          "Use parallel investigations only for independent questions that need different evidence and materially benefit from separate agents. Do not split a small feature into generic frontend/backend/testing investigations by default.",
          "Keep each investigation question concise and specific: it is also the task label shown in the timeline. Ask a follow-up investigation only for a concrete unresolved gap.",
          "Respond to incoming steering and conversational asides with brief text messages; these are sent to the user immediately after each assistant message completes.",
          "When asking a question, call ask_user with the complete user-facing message, including any greeting. Do not emit a separate assistant-text preface or repeat the question. For example, put Hey! What would you like to build? entirely in ask_user.question.",
          "Use implement with the complete generated plan when it is ready for approval. The tool obtains approval and runs the coding task. You cannot grant approval yourself.",
          "If implement returns feedback, revise the plan and call it again. If it fails, explain the failure and retained worktree; never claim success. After success, summarize the result and worktree location.",
          "Likewise, implement posts the plan and approval question itself; do not emit a separate preface or duplicate plan. Report completed when the user's request is handled, or when they want only a plan. Do not report blocked to ask questions: call ask_user instead.",
        ],
      });
      try {
        let prompt = delivery.message.body;
        while (true) {
          const report = await runChattoAgent(ctx, {
            runOutcome: coordinator.runOutcome.bind(coordinator),
            steer: async text => {
              const child = children.size === 1 ? [...children][0] : undefined;
              if (child && await child.send(text)) {
                // Retain the change in the coordinator conversation after delegation.
                const noted = coordinator.steer(`The active specialist consumed this user message: ${text}`);
                void noted.catch(() => {});
                await ctx.onText(`Passed your message to the active specialist: ${text}`).catch(() => {});
                return noted;
              }
              return coordinator.steer(text);
            },
          }, prompt, {
            destination, inbox, post: (_target, text) => ctx.onText(text),
            typing: typing ? (target, signal) => questions ? Promise.resolve() : typing(target, signal) : undefined,
          });
          ctx.signal.throwIfAborted();
          if (report.outcome === "failed") throw new Error(report.summary);
          const remaining = inbox.drain();
          if (remaining.length) {
            prompt = `Consider these additional messages before finishing:\n\n${remaining.join("\n\n")}`;
            continue;
          }
          const summary = report.details ?? report.summary;
          await say(summary);
          return { summary };
        }
      } finally { coordinator.dispose(); }
    },
  });
}

export default createChattoCoordinatorDemo({
  directory: process.env.CHATTO_WORKING_COPY ?? "/Users/hmans/src/chatto-umbrella/chatto",
  model: process.env.CHATTO_PLAN_MODEL ?? "openai-codex/gpt-5.6-sol",
  post: postToChatto,
  typing: sendChattoTyping,
});
