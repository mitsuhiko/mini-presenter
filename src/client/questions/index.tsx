import "./questions.css";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { render } from "@solidjs/web";
import { ROUTES, type Question } from "../../shared/protocol.ts";
import { createWebSocketTransport, webSocketUrl, type ConnectionStatus } from "../lib/transport.ts";
import { Icon } from "../ui/icons.tsx";
import { relativeTime } from "../lib/format.ts";

const LIMIT = 500;

function sortQuestions(list: Question[]): Question[] {
  return [...list].sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt));
}

async function postJson(url: string, body: unknown): Promise<Response> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error((await response.text()).trim() || `Request failed (${response.status})`);
  }
  return response;
}

function QuestionItem(props: { question: Question; voted: boolean; onVote: (id: string) => void }) {
  return (
    <li class={["question", { "question--answered": props.question.answered }]}>
      <button
        class={["vote", { "vote--active": props.voted }]}
        type="button"
        disabled={props.voted || props.question.answered}
        aria-label={props.voted ? "You voted for this question" : "Vote for this question"}
        onClick={() => props.onVote(props.question.id)}
      >
        <Icon name="up" size={18} />
        <span>{props.question.votes}</span>
      </button>
      <div class="question__body">
        <p class="question__text">{props.question.text}</p>
        <div class="question__meta">
          <Show when={props.question.answered}>
            <span class="question__answered">
              <Icon name="check" size={13} /> Answered
            </span>
          </Show>
          <time datetime={props.question.createdAt}>{relativeTime(props.question.createdAt)}</time>
        </div>
      </div>
    </li>
  );
}

function App() {
  const [questions, setQuestions] = createSignal<Question[]>([]);
  const [voted, setVoted] = createSignal<ReadonlySet<string>>(new Set());
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [notice, setNotice] = createSignal<{ level: "ok" | "error"; text: string } | null>(null);
  const [status, setStatus] = createSignal<ConnectionStatus>("connecting");
  const [title, setTitle] = createSignal<string | null>(null);
  const [, setTick] = createSignal(0);

  const open = createMemo(() => sortQuestions(questions().filter((question) => !question.answered)));
  const answered = createMemo(() => sortQuestions(questions().filter((question) => question.answered)));
  const remaining = createMemo(() => LIMIT - draft().length);

  const markVoted = (ids: Iterable<string>) => setVoted((previous) => new Set([...previous, ...ids]));

  const load = async () => {
    const response = await fetch(ROUTES.api.questions, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { questions: Question[] };
    setQuestions(data.questions);
    markVoted(data.questions.filter((question) => question.voted).map((question) => question.id));
  };

  const flash = (level: "ok" | "error", text: string) => {
    setNotice({ level, text });
    setTimeout(() => setNotice((current) => (current?.text === text ? null : current)), 3500);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const text = draft().trim();
    if (!text || sending()) return;
    setSending(true);
    try {
      await postJson(ROUTES.api.questions, { text });
      setDraft("");
      flash("ok", "Thanks! Your question was sent.");
      await load();
    } catch (error) {
      flash("error", (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  const vote = async (id: string) => {
    markVoted([id]);
    setQuestions((list) => list.map((question) => (question.id === id ? { ...question, votes: question.votes + 1 } : question)));
    try {
      await postJson(ROUTES.api.questionsVote, { id });
    } catch (error) {
      flash("error", (error as Error).message);
      await load();
    }
  };

  onSettled(() => {
    void load();
    void fetch(ROUTES.api.config)
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { title?: unknown } | null) => setTitle(typeof config?.title === "string" ? config.title : null));
    const transport = createWebSocketTransport(webSocketUrl(ROUTES.ws), "questions", {
      onMessage(message) {
        if (message.type === "questions") setQuestions(message.questions);
      },
      onStatus(next) {
        setStatus(next);
        if (next === "open") void load();
      },
    });
    transport.start();
    const ticker = setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => {
      transport.stop();
      clearInterval(ticker);
    };
  });

  return (
    <main class="questions">
      <header class="questions__header">
        <div>
          <Show when={title()}>{(value) => <div class="questions__eyebrow">{value()}</div>}</Show>
          <h1>Ask a question</h1>
        </div>
        <div class="questions__status" title={status() === "open" ? "Live updates" : "Reconnecting…"}>
          <span class="dot" data-state={status() === "open" ? "ok" : "warn"} />
          {status() === "open" ? "Live" : "Offline"}
        </div>
      </header>

      <form class="card composer" onSubmit={submit}>
        <label class="sr-only" for="question">
          Your question
        </label>
        <textarea
          id="question"
          class="textarea"
          rows={4}
          maxlength={LIMIT}
          placeholder="What would you like to ask?"
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          required
        />
        <div class="composer__footer">
          <span class={["composer__count", { "composer__count--low": remaining() < 50 }]}>{remaining()}</span>
          <button class="btn btn--primary btn--lg" type="submit" disabled={sending() || !draft().trim()}>
            <Icon name="send" />
            {sending() ? "Sending…" : "Send question"}
          </button>
        </div>
        <Show when={notice()}>
          {(value) => (
            <div class="message" data-level={value().level === "error" ? "error" : "info"} role="status">
              {value().text}
            </div>
          )}
        </Show>
      </form>

      <section>
        <h2 class="questions__section">
          Questions <span class="subtle">{open().length}</span>
        </h2>
        <Show when={open().length > 0} fallback={<p class="questions__empty">No questions yet. Be the first!</p>}>
          <ul class="question-list">
            <For each={open()} keyed={(question) => question.id}>
              {(question) => <QuestionItem question={question()} voted={voted().has(question().id)} onVote={vote} />}
            </For>
          </ul>
        </Show>
      </section>

      <Show when={answered().length > 0}>
        <details class="questions__answered">
          <summary class="questions__section">
            Answered <span class="subtle">{answered().length}</span>
          </summary>
          <ul class="question-list">
            <For each={answered()} keyed={(question) => question.id}>
              {(question) => <QuestionItem question={question()} voted={voted().has(question().id)} onVote={vote} />}
            </For>
          </ul>
        </details>
      </Show>
    </main>
  );
}

render(() => <App />, document.getElementById("app")!);
