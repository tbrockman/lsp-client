import type * as lsp from "vscode-languageserver-protocol"
import {EditorState} from "@codemirror/state"
import {CompletionSource, Completion, CompletionContext, snippet} from "@codemirror/autocomplete"
import {LSPFeature} from "./feature"
import {LSPClient} from "./client"

export function lspCompletion(): LSPFeature {
  return {
    extension(client) {
      let source = lspCompletionSource(client)
      let data = [{autocomplete: source}]
      return [EditorState.languageData.of(() => data)]
    }
  }
}

function lspCompletionSource(client: LSPClient): CompletionSource {
  return async context => {
    if (!context.view) return null
    let result = await client.completions(context.view, context.pos, context.explicit)
    if (!result) return null
    if (Array.isArray(result)) result = {items: result} as lsp.CompletionList
    let {from, to} = completionResultRange(context, result)
    let defaultCommitChars = result.itemDefaults?.commitCharacters

    return {
      from, to,
      options: result.items.map<Completion>(item => {
        let text = item.textEdit?.newText || item.textEditText || item.insertText || item.label
        let option: Completion = {
          label: text,
          type: item.kind && kindToType[item.kind],
        }
        if (item.commitCharacters && item.commitCharacters != defaultCommitChars)
          option.commitCharacters = item.commitCharacters
        if (item.detail) option.detail = item.detail
        if (item.insertTextFormat == 2) option.apply = (view, c, from, to) => snippet(text)(view, c, from, to)
        if (item.documentation) option.info = () => renderDocInfo(client, item.documentation!)
        // FIXME info
        return option
      }),
      commitCharacters: defaultCommitChars,
      validFor: /^\.?\w*$/, // FIXME
      map: (result, changes) => ({...result, from: changes.mapPos(result.from)}),
    }
  }
}

function completionResultRange(cx: CompletionContext, result: lsp.CompletionList): {from: number, to: number} {
  if (!result.items.length) return {from: cx.pos, to: cx.pos}
  let defaultRange = result.itemDefaults?.editRange, item0 = result.items[0]
  let range = defaultRange ? ("insert" in defaultRange ? defaultRange.insert : defaultRange)
    : item0.textEdit ? ("range" in item0.textEdit ? item0.textEdit.range : item0.textEdit.insert)
    : null
  if (!range) return cx.state.wordAt(cx.pos) || {from: cx.pos, to: cx.pos}
  let line = cx.state.doc.lineAt(cx.pos)
  return {from: line.from + range.start.character, to: line.from + range.end.character}
}

function renderDocInfo(client: LSPClient, doc: string | lsp.MarkupContent) {
  let elt = document.createElement("div")
  elt.className = "cm-lsp-documentation cm-lsp-completion-documentation"
  elt.innerHTML = client.docToHTML(doc)
  return elt
}

const kindToType: {[kind: number]: string} = {
  1: "text", // Text
  2: "method", // Method
  3: "function", // Function
  4: "class", // Constructor
  5: "property", // Field
  6: "variable", // Variable
  7: "class", // Class
  8: "interface", // Interface
  9: "namespace", // Module
  10: "property", // Property
  11: "keyword", // Unit
  12: "constant", // Value
  13: "constant", // Enum
  14: "keyword", // Keyword
  16: "constant", // Color
  20: "constant", // EnumMember
  21: "constant", // Constant
  22: "class", // Struct
  25: "type" // TypeParameter
}
