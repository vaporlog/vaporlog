/*
 * Undo/redo history for the cover document. A bounded past/future stack
 * around the present snapshot; selection lives outside on purpose (it
 * is a transient UI choice, not document state).
 *
 * Continuous controls (color pickers, sliders, size inputs) should hold
 * a local draft and dispatch update_layer once on commit — otherwise
 * every keystroke becomes an undo step.
 */

import type { BackgroundFill, CoverLayer } from "./model";
import { nextId } from "./model";

export type CanvasSnapshot = {
  layers: CoverLayer[];
  background: BackgroundFill;
};

export type CanvasAction =
  | { type: "add_layer"; layer: CoverLayer }
  | { type: "delete_layer"; id: string }
  | {
      type: "update_layer";
      id: string;
      patch: Partial<CoverLayer>;
      /** Continuous controls (sliders, color pickers) pass a stable key
       *  per gesture — consecutive updates with the same key mutate the
       *  present without pushing a new history entry, so one drag of a
       *  slider is one undo step. */
      coalesceKey?: string;
    }
  | {
      type: "move_layer";
      id: string;
      direction: "forward" | "backward" | "top" | "bottom";
    }
  | { type: "duplicate_layer"; id: string }
  | { type: "clear_all" }
  | { type: "set_background"; background: BackgroundFill }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset_with"; layers: CoverLayer[]; background: BackgroundFill }
  | { type: "replace_doc"; layers: CoverLayer[]; background: BackgroundFill };

export type HistoryState = {
  past: CanvasSnapshot[];
  present: CanvasSnapshot;
  future: CanvasSnapshot[];
  /** Active coalescing gesture key, null when the last action broke the
   *  streak (any non-update action, a different key, undo/redo). */
  coalescing: string | null;
};

/** Bounded history so the stack can't grow unbounded during long sessions. */
const HISTORY_LIMIT = 50;

export const EMPTY_PRESENT: CanvasSnapshot = { layers: [], background: "night" };

export const INITIAL_HISTORY: HistoryState = {
  past: [],
  present: EMPTY_PRESENT,
  future: [],
  coalescing: null,
};

function pushHistory(
  state: HistoryState,
  next: CanvasSnapshot,
  coalescing: string | null = null,
): HistoryState {
  const past =
    state.past.length >= HISTORY_LIMIT
      ? [...state.past.slice(state.past.length - HISTORY_LIMIT + 1), state.present]
      : [...state.past, state.present];
  return { past, present: next, future: [], coalescing };
}

export function historyReducer(state: HistoryState, action: CanvasAction): HistoryState {
  switch (action.type) {
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        coalescing: null,
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
        coalescing: null,
      };
    }
    case "reset_with": {
      // Initial seed or doc load: wipes history — the prior state is no
      // longer reachable from this editing session.
      return {
        past: [],
        present: { layers: action.layers, background: action.background },
        future: [],
        coalescing: null,
      };
    }
    case "replace_doc": {
      // Template apply: swaps the whole document but pushes the previous
      // one onto the stack, so the user can undo back out of it.
      return pushHistory(state, {
        layers: action.layers,
        background: action.background,
      });
    }
    case "add_layer": {
      return pushHistory(state, {
        ...state.present,
        layers: [...state.present.layers, action.layer],
      });
    }
    case "delete_layer": {
      return pushHistory(state, {
        ...state.present,
        layers: state.present.layers.filter((entry) => entry.id !== action.id),
      });
    }
    case "update_layer": {
      const next: CanvasSnapshot = {
        ...state.present,
        layers: state.present.layers.map((entry) =>
          entry.id === action.id ? ({ ...entry, ...action.patch } as CoverLayer) : entry,
        ),
      };
      // Same coalesce key as the previous update → fold into the same
      // history entry instead of pushing another one.
      if (action.coalesceKey !== undefined && state.coalescing === action.coalesceKey) {
        return { ...state, present: next, future: [] };
      }
      return pushHistory(state, next, action.coalesceKey ?? null);
    }
    case "duplicate_layer": {
      const source = state.present.layers.find((entry) => entry.id === action.id);
      if (source === undefined) return state;
      const copy: CoverLayer = {
        ...source,
        id: nextId(),
        x: source.x + 40,
        y: source.y + 40,
      } as CoverLayer;
      return pushHistory(state, {
        ...state.present,
        layers: [...state.present.layers, copy],
      });
    }
    case "move_layer": {
      const layers = state.present.layers.slice();
      const index = layers.findIndex((entry) => entry.id === action.id);
      if (index === -1) return state;
      const [entry] = layers.splice(index, 1);
      let target: number;
      switch (action.direction) {
        case "forward":
          target = Math.min(layers.length, index + 1);
          break;
        case "backward":
          target = Math.max(0, index - 1);
          break;
        case "top":
          target = layers.length;
          break;
        case "bottom":
          target = 0;
          break;
      }
      layers.splice(target, 0, entry);
      return pushHistory(state, { ...state.present, layers });
    }
    case "clear_all": {
      if (state.present.layers.length === 0) return state;
      return pushHistory(state, { ...state.present, layers: [] });
    }
    case "set_background": {
      if (state.present.background === action.background) return state;
      return pushHistory(state, {
        ...state.present,
        background: action.background,
      });
    }
  }
}
