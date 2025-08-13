import { EditorView } from "codemirror";

declare global {
    interface Window {
        view: EditorView;
        benchmark: (caseName: string) => Promise<any>;
    }
}