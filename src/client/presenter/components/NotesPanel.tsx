import { createMemo, For, Match, Show, Switch } from "solid-js";
import type { JSX } from "@solidjs/web";
import { parseNotesBlocks, type Block, type Inline } from "../../../shared/notes.ts";
import { Icon } from "../../ui/icons.tsx";
import type { PresenterModel } from "../model.ts";
import { SpeakerChip } from "./Previews.tsx";

// Notes are re-parsed as a whole when they change, so blocks are rendered
// from plain values (no fine-grained updates needed inside a block).
function renderInlines(content: Inline[]): JSX.Element {
  return content.map((part) => {
    switch (part.type) {
      case "strong":
        return <strong>{part.text}</strong>;
      case "em":
        return <em>{part.text}</em>;
      case "code":
        return <code>{part.text}</code>;
      default:
        return part.text;
    }
  });
}

function renderBlock(block: Block): JSX.Element {
  switch (block.type) {
    case "paragraph":
      return <p>{renderInlines(block.content)}</p>;
    case "heading":
      return <h3 class="notes__heading">{renderInlines(block.content)}</h3>;
    case "list": {
      const items = block.items.map((item) => <li>{renderInlines(item)}</li>);
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "speaker":
      return (
        <p class="notes__speaker">
          <SpeakerChip name={block.name} />
          <span>{renderInlines(block.content)}</span>
        </p>
      );
    case "rule":
      return <hr />;
  }
}

export function NotesPanel(props: { model: PresenterModel; fontSize: number; onFontSize: (size: number) => void }) {
  const view = createMemo(() => props.model.notes.view());
  const blocks = createMemo(() => parseNotesBlocks(view().text));
  const origin = createMemo(() => {
    const value = view().origin;
    return value === "deck" ? "From the deck" : value === "file" ? "From notes file" : null;
  });

  return (
    <section class="panel notes" aria-label="Speaker notes">
      <header class="panel__header">
        <span class="panel__title">Notes</span>
        <span class="speakers">
          <Show
            when={view().speakers.length > 0}
            fallback={<Show when={view().carried}>{(name) => <SpeakerChip name={name()} carried />}</Show>}
          >
            <For each={view().speakers}>{(name) => <SpeakerChip name={name} />}</For>
          </Show>
        </span>
        <span class="panel__meta">{origin()}</span>
        <div class="notes__zoom" role="group" aria-label="Notes text size">
          <button
            class="btn btn--sm btn--ghost btn--icon"
            type="button"
            title="Smaller text"
            onClick={() => props.onFontSize(props.fontSize - 2)}
          >
            <Icon name="textSmaller" />
          </button>
          <button
            class="btn btn--sm btn--ghost btn--icon"
            type="button"
            title="Larger text"
            onClick={() => props.onFontSize(props.fontSize + 2)}
          >
            <Icon name="textLarger" />
          </button>
        </div>
      </header>
      <div class="notes__body" style={{ "--notes-size": `${props.fontSize}px` }} tabindex="0">
        <Switch>
          <Match when={view().status === "disabled"}>
            <p class="notes__empty">Speaker notes are turned off.</p>
          </Match>
          <Match when={view().status === "loading" && !view().text}>
            <p class="notes__empty">Loading notes…</p>
          </Match>
          <Match when={view().status === "empty"}>
            <p class="notes__empty">No notes for this slide.</p>
          </Match>
          <Match when={view().text}>
            <For each={blocks()}>{(block) => renderBlock(block)}</For>
          </Match>
        </Switch>
      </div>
    </section>
  );
}
