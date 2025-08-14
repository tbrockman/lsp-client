import { Page } from "puppeteer";


export class BenchmarkContext {
    constructor(public page: Page) { }

    async setStatusText(text: string) {
        await this.page.evaluate((text) => {
            const statusEl = document.getElementById("status");
            if (statusEl) {
                statusEl.textContent = text;
            }
        }, text);
    }
}