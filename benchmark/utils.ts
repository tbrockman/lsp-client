import { Page } from "playwright";

export class Context {
    constructor(public page: Page) {
        this.page = page;
    }

    async setStatusText(text: string) {
        await this.page.evaluate((text) => {
            const statusEl = document.getElementById("status");
            if (statusEl) {
                statusEl.textContent = text;
            }
        }, text);
    }
}