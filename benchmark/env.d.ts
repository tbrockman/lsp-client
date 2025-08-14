import { Transaction } from "@codemirror/state";
import { EditorView } from "codemirror";

declare global {
    interface Window {
        view: EditorView;
        userEvent: typeof Transaction.userEvent;
        benchmark: (caseName: string) => Promise<any>;
    }
}