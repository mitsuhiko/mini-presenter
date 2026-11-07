import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { ROUTES, type Question } from "../../../shared/protocol.ts";
import { relativeTime } from "../../lib/format.ts";
import { Icon } from "../../ui/icons.tsx";
import type { PresenterModel } from "../model.ts";
import { Dialog } from "./Dialog.tsx";
import { Popconfirm } from "./Popconfirm.tsx";

function sorted(list: Question[]): Question[] {
  return [...list].sort(
    (a, b) => Number(a.answered) - Number(b.answered) || b.votes - a.votes || a.createdAt.localeCompare(b.createdAt),
  );
}

export function QuestionsDialog(props: { model: PresenterModel; onClose: () => void }) {
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal<string | null>(null);
  const list = createMemo(() => sorted(props.model.questions()));
  const answered = createMemo(() => props.model.questions().filter((question) => question.answered).length);

  const run = async (id: string, action: () => Promise<void>) => {
    setBusy(id);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  onSettled(() => {
    void props.model.refreshQuestions();
  });

  return (
    <Dialog
      title="Audience questions"
      class="dialog--questions"
      subtitle={
        <>
          {list().length - answered()} open · {answered()} answered
        </>
      }
      onClose={props.onClose}
      actions={
        <>
          <a class="btn btn--sm" href={ROUTES.questionsQr} target="_blank" rel="noopener">
            <Icon name="qr" /> QR page
          </a>
          <button class="btn btn--sm btn--icon" type="button" title="Refresh" onClick={() => void props.model.refreshQuestions()}>
            <Icon name="refresh" />
          </button>
        </>
      }
    >
      <Show when={error()}>{(text) => <div class="message" data-level="error">{text()}</div>}</Show>
      <Show
        when={list().length > 0}
        fallback={
          <div class="empty">
            <Icon name="questions" size={28} />
            <p>No questions yet.</p>
            <p class="subtle">
              Share <a href={ROUTES.questionsQr} target="_blank" rel="noopener">the QR code</a> or press <span class="kbd">Q</span> on
              the slides to show it to the audience.
            </p>
          </div>
        }
      >
        <ul class="qa-list">
          <For each={list()} keyed={(question) => question.id}>
            {(question) => (
              <li class={["qa", { "qa--answered": question().answered }]}>
                <div class="qa__votes" title="Votes">
                  <Icon name="up" size={14} />
                  {question().votes}
                </div>
                <div class="qa__body">
                  <p class="qa__text">{question().text}</p>
                  <div class="qa__meta">
                    {relativeTime(question().createdAt)}
                    <Show when={question().answered}>
                      <span class="qa__answered">
                        <Icon name="check" size={12} /> Answered
                      </span>
                    </Show>
                  </div>
                </div>
                <div class="qa__actions">
                  <button
                    class={["btn", "btn--sm", { "btn--primary": !question().answered }]}
                    type="button"
                    disabled={busy() === question().id}
                    onClick={() =>
                      void run(question().id, () => props.model.answerQuestion(question().id, !question().answered))
                    }
                  >
                    <Icon name={question().answered ? "reset" : "check"} />
                    {question().answered ? "Reopen" : "Mark answered"}
                  </button>
                  <Popconfirm
                    title="Delete this question?"
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => void run(question().id, () => props.model.deleteQuestion(question().id))}
                    trigger={(open, expanded) => (
                      <button
                        class="btn btn--sm btn--ghost btn--icon btn--danger"
                        type="button"
                        title="Delete"
                        aria-label="Delete question"
                        aria-expanded={expanded() ? "true" : "false"}
                        disabled={busy() === question().id}
                        onClick={open}
                      >
                        <Icon name="trash" />
                      </button>
                    )}
                  />
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </Dialog>
  );
}
