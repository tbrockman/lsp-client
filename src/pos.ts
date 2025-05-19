import type * as lsp from "vscode-languageserver-protocol"
import {EditorState} from "@codemirror/state"

export function toPos(state: EditorState, pos: number): lsp.Position {
  let line = state.doc.lineAt(pos)
  return {line: line.number - 1, character: pos - line.from}
}

export function fromPos(state: EditorState, pos: lsp.Position): number {
  let line = state.doc.line(pos.line + 1)
  return line.from + pos.character
}

