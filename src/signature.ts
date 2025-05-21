import type * as lsp from "vscode-languageserver-protocol"
import {StateField, StateEffect} from "@codemirror/state"
import {EditorView, ViewPlugin, ViewUpdate, keymap, Tooltip, showTooltip, Command} from "@codemirror/view"
import {LSPFeature} from "./feature.js"
import {LSPClient} from "./client.js"
import {lspPlugin} from "./plugin.js"

const signaturePlugin = ViewPlugin.fromClass(class {
  activeRequest: {pos: number, drop: boolean} | null = null
  delayedRequest: number = 0

  update(update: ViewUpdate) {
    if (this.activeRequest) {
      if (update.selectionSet) {
        this.activeRequest.drop = true
        this.activeRequest = null
      } else if (update.docChanged) {
        this.activeRequest.pos = update.changes.mapPos(this.activeRequest.pos)
      }
    }

    let plugin = update.view.plugin(lspPlugin)!
    let sigState = update.view.state.field(signatureState)
    if (sigState) {
      if (update.selectionSet) {
        if (this.delayedRequest) clearTimeout(this.delayedRequest)
        this.delayedRequest = setTimeout(() => {
          this.startRequest(plugin.client, update.view, {
            triggerKind: 3 /* ContentChange */,
            isRetrigger: true,
            activeSignatureHelp: sigState.data,
          })
        }, 250)
      }
    } else if (update.docChanged && update.transactions.some(tr => tr.isUserEvent("input.type"))) {
      let serverConf = plugin.client.serverCapabilities?.signatureHelpProvider
      if (serverConf && serverConf.triggerCharacters) {
        let triggered: string | undefined
        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          let ins = inserted.toString()
          if (ins) for (let ch of serverConf.triggerCharacters!) {
            if (ins.indexOf(ch) > -1) triggered = ch
          }
        })
        if (triggered) this.startRequest(plugin.client, update.view, {
          triggerKind: 2 /* TriggerCharacter */,
          isRetrigger: false,
          triggerCharacter: triggered,
        })
      }
    }
  }

  startRequest(client: LSPClient, view: EditorView, context: lsp.SignatureHelpContext) {
    if (this.delayedRequest) clearTimeout(this.delayedRequest)
    let pos = view.state.selection.main.head
    if (this.activeRequest) this.activeRequest.drop = true
    let req = this.activeRequest = {pos, drop: false}
    client.signatureHelp(view, pos, context).then(result => {
      if (req.drop) return
      if (result && result.signatures.length) {
        let cur = view.state.field(signatureState)
        let same = cur && sameSignatures(cur.data, result)
        // FIXME don't update at all if active sig and param also unchanged
        view.dispatch({effects: signatureEffect.of({data: result, pos: same ? cur!.tooltip.pos : req.pos})})
      } else if (view.state.field(signatureState)) {
        view.dispatch({effects: signatureEffect.of(null)})
      }
    })
  }

  destroy() {
    if (this.delayedRequest) clearTimeout(this.delayedRequest)
    if (this.activeRequest) this.activeRequest.drop = true
  }
})

function sameSignatures(a: lsp.SignatureHelp, b: lsp.SignatureHelp) {
  if (a.signatures.length != b.signatures.length) return false
  return a.signatures.every((s, i) => s.label == b.signatures[i].label)
}

class SignatureState {
  constructor(
    readonly data: lsp.SignatureHelp,
    readonly active: number,
    readonly tooltip: Tooltip
  ) {}
}

const signatureState = StateField.define<SignatureState | null>({
  create() { return null },
  update(sig, tr) {
    for (let e of tr.effects) if (e.is(signatureEffect)) {
      if (e.value) {
        let active = e.value.data.activeSignature ?? 0
        return new SignatureState(e.value.data, active, signatureTooltip(e.value.data, active, e.value.pos))
      } else {
        return null
      }
    }
    if (sig && tr.docChanged)
      return new SignatureState(sig.data, sig.active, {...sig.tooltip, pos: tr.changes.mapPos(sig.tooltip.pos)})
    return sig
  },
  provide: f => showTooltip.from(f, sig => sig && sig.tooltip)
})

const signatureEffect = StateEffect.define<{data: lsp.SignatureHelp, pos: number} | null>()

function signatureTooltip(data: lsp.SignatureHelp, active: number, pos: number): Tooltip {
  return {
    pos,
    above: true,
    create: (view) => drawSignatureTooltip(view, data, active)
  }
}

function drawSignatureTooltip(view: EditorView, data: lsp.SignatureHelp, mainParam?: number) {
  // FIXME show when multiple
  let signature = data.signatures[data.activeSignature ?? 0]
  let dom = document.createElement("div")
  dom.className = "cm-lsp-signature-tooltip"
  let sig = dom.appendChild(document.createElement("div"))
  sig.className = "cm-lsp-signature"
  let activeFrom = 0, activeTo = 0
  let activeParam = signature.activeParameter ?? data.activeParameter
  let active = activeParam != null && signature.parameters ? signature.parameters[activeParam] : null
  if (active && Array.isArray(active.label)) {
    ;[activeFrom, activeTo] = active.label
  } else if (active) {
    let found = signature.label.indexOf(active.label as string)
    if (found > -1) {
      activeFrom = found
      activeTo = found + active.label.length
    }
  }
  if (activeTo) {
    sig.appendChild(document.createTextNode(signature.label.slice(0, activeFrom)))
    let activeElt = sig.appendChild(document.createElement("span"))
    activeElt.className = "cm-lsp-active-parameter"
    activeElt.textContent = signature.label.slice(activeFrom, activeTo)
    sig.appendChild(document.createTextNode(signature.label.slice(activeTo)))
  } else {
    sig.textContent = signature.label
  }
  if (signature.documentation) {
    let plugin = view.plugin(lspPlugin)
    if (plugin) {
      let docs = dom.appendChild(document.createElement("div"))
      docs.className = "cm-lsp-signature-documentation cm-lsp-documentation"
      docs.innerHTML = plugin.client.docToHTML(view, signature.documentation)
    }
  }
  return {dom}
}

export const lspShowSignatureHelp: Command = view => {
  let plugin = view.plugin(signaturePlugin)
  let field = view.state.field(signatureState)
  if (!plugin || field === undefined) return false
  plugin.startRequest(view.plugin(lspPlugin)!.client, view, {
    triggerKind: 1 /* Invoked */,
    activeSignatureHelp: field ? field.data : undefined,
    isRetrigger: !!field
  })
  return true
}

// FIXME make trigger characters configurable
export function lspSignatureHelp(): LSPFeature {
  return {
    extension: () => [
      signatureState,
      signaturePlugin,
      // FIXME keys to change active signature
      keymap.of([{key: "Ctrl-Shift-Space", run: lspShowSignatureHelp}])
    ]
  }
}
