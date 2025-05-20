import type * as lsp from "vscode-languageserver-protocol"
import {EditorView, Tooltip, hoverTooltip} from "@codemirror/view"
import {language as languageFacet, highlightingFor} from "@codemirror/language"
import {highlightCode} from "@lezer/highlight"
import {fromPos} from "./pos.js"
import {escHTML} from "./text.js"
import {LSPFeature} from "./feature.js"
import {LSPClient} from "./client.js"

export function lspHoverTooltips(): LSPFeature {
  return {
    extension(client: LSPClient) {
      return hoverTooltip(lspTooltipSource(client))
    }
  }
}

function lspTooltipSource(client: LSPClient) {
  return async (view: EditorView, pos: number): Promise<Tooltip | null> => {
    let result = await client.hover(view, pos)
    if (!result) return null
    // FIXME mapping
    return {
      pos: result.range ? fromPos(view.state, result.range.start) : pos,
      end: result.range ? fromPos(view.state, result.range.end) : pos,
      create() {
        let elt = document.createElement("div")
        elt.className = "cm-lsp-hover-tooltip cm-lsp-documentation"
        elt.innerHTML = renderTooltipContent(client, view, result.contents)
        return {dom: elt}
      },
      above: true
    }
  }
}

function renderTooltipContent(
  client: LSPClient,
  view: EditorView,
  value: string | lsp.MarkupContent | lsp.MarkedString | lsp.MarkedString[]
) {
  if (Array.isArray(value)) return value.map(m => renderCode(view, m)).join("<br>")
  if (typeof value == "string" || typeof value == "object" && "language" in value) return renderCode(view, value)
  return client.docToHTML(value)
} 

function renderCode(view: EditorView, code: lsp.MarkedString) {
  let lang = view.state.facet(languageFacet)
  let {language, value} = typeof code == "string" ? {language: null, value: code} : code
  if (!lang || language != null && lang.name != language) return escHTML(value)
  let result = ""
  highlightCode(value, lang.parser.parse(value), {style: tags => highlightingFor(view.state, tags)}, (text, cls) => {
    result += cls ? `<span class="${cls}">${escHTML(text)}</span>` : escHTML(text)
  }, () => {
    result += "<br>"
  })
  return result
}
