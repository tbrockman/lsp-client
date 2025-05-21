import {EditorView} from "@codemirror/view"

export const lspTheme = EditorView.baseTheme({
  ".cm-lsp-documentation": {
    padding: "0 7px"
  },

  ".cm-lsp-signature-tooltip": {
    padding: "2px 6px",
    borderRadius: "2.5px",
  },

  ".cm-lsp-signature": {
    fontFamily: "monospace",
  },

  ".cm-lsp-active-parameter": {
    fontWeight: "bold"
  },

  ".cm-panel.cm-rename-prompt": {
    padding: "2px 6px 4px",
    position: "relative",
    "& label": { fontSize: "80%" },
    "& [name=close]": {
      position: "absolute",
      top: "0", bottom: "0",
      right: "4px",
      backgroundColor: "inherit",
      border: "none",
      font: "inherit",
      padding: "0"
    }
  }
})
