import { BenchmarkContext } from "./utils";

export const sampleText = `const channel = new MessageChannel();
const output = document.querySelector(".output");
const iframe = document.querySelector("iframe");

// Wait for the iframe to load
iframe.addEventListener("load", onLoad);

function onLoad() {
  // Listen for messages on port1
  channel.port1.onmessage = onMessage;

  // Transfer port2 to the iframe
  iframe.contentWindow.postMessage("Hello from the main page!", "*", [
    channel.port2,
  ]);
}

// Handle messages received on port1
function onMessage(e) {
  output.innerHTML = e.data;
}
`;

export const largeCodeBlock = `enum Role {
    User = "user",
    Admin = "admin",
    Moderator = "moderator"
}

interface AppUser {
    id: number;
    name: string;
    email: string;
    role: Role;
}

type AdminUser = AppUser & { role: Role.Admin };
type ModeratorUser = AppUser & { role: Role.Moderator };

namespace Database {
  export function createAdmin(id: number, name: string, email: string): AdminUser {
    return { id, name, email, role: Role.Admin };
  }
  
  function createModerator(id: number, name: string, email: string): ModeratorUser {
    return { id, name, email, role: Role.Moderator };
  }
}

// Good
const result = Database.createAdmin(0, 'admin', 'admin@example.com')

// Bad, \`createModerator\` not exported
const mod = Database.createModerator(1, 'mod', 'mod@notexported.ca')
`;


export async function simulateTyping(context: BenchmarkContext) {
    await context.setStatusText('Running regular typing...');

    await context.page.evaluate(async (text) => {
        if (!window.view) return;

        for (let i = 0; i < text.length; i++) {
            window.view.dispatch({
                changes: { from: i == 0 ? 0 : window.view.state.doc.length, to: i == 0 ? window.view.state.doc.length : undefined, insert: text[i] },
                annotations: window.userEvent.of('input.type')
            });
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }, sampleText);
}

export async function simulateHoverOperations(context: BenchmarkContext) {
    await context.setStatusText('Running hover operations...');

    // First, insert some code to hover over
    await context.page.evaluate(async (text) => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: text },
            annotations: window.userEvent.of('input.paste')
        });
    }, sampleText);

    // Hover over different parts of the code
    const hoverTargets = [
        'channel',
        'MessageChannel',
        'iframe',
        'addEventListener',
        'onLoad',
        'onmessage',
        'postMessage',
        'innerHTML'
    ];

    for (const target of hoverTargets) {
        try {
            const textElement = context.page.getByText(target).first();

            if (await textElement.isVisible()) {
                // Use the textElement to create a range and get exact coordinates
                const hoverCoords = await textElement.evaluate((element, searchTarget) => {
                    // Create a tree walker to find text nodes within this specific element
                    const walker = document.createTreeWalker(
                        element,
                        NodeFilter.SHOW_TEXT
                    );

                    let textNode;
                    while (textNode = walker.nextNode()) {
                        const textContent = textNode.textContent || '';
                        const targetIndex = textContent.toLowerCase().indexOf(searchTarget.toLowerCase());

                        if (targetIndex >= 0) {
                            // Create a range for the exact target text
                            const range = document.createRange();
                            range.setStart(textNode, targetIndex);
                            range.setEnd(textNode, targetIndex + searchTarget.length);

                            // Get the bounding rectangle of the range
                            const rect = range.getBoundingClientRect();

                            return {
                                x: rect.left + rect.width / 2,
                                y: rect.top + rect.height / 2,
                                found: true,
                                textContent: textContent,
                                targetIndex: targetIndex
                            };
                        }
                    }

                    return { found: false };
                }, target);

                if (hoverCoords.found && hoverCoords.x !== undefined && hoverCoords.y !== undefined) {
                    // Hover at the exact calculated position
                    await context.page.mouse.move(hoverCoords.x, hoverCoords.y);
                } else {
                    await textElement.hover();
                }
            } else {
                console.log(`Element not visible for "${target}"`);
            }
        } catch (error) {
            console.log(`Strategy failed for "${target}": ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 400)); // Wait for hover info to appear
    }
}

export async function simulateCompletionRequests(context: BenchmarkContext) {
    await context.setStatusText('Running completion requests...');

    // Clear editor and add some base content
    await context.page.evaluate(async () => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: "" }
        });

        // Add some basic content to work with
        const baseContent = `const obj = {
    prop: "value"
};
const arr = [1, 2, 3];
`;
        window.view.dispatch({
            changes: { from: 0, insert: baseContent },
            annotations: window.userEvent.of('input.paste')
        });
    });

    const completionTriggers = [
        'document.',
        'console.',
        'window.',
        'obj.',
        'obj.prop.',
        'arr.',
        'arr[0].',
        'JSON.',
        'Array.',
        'Object.'
    ];
    // Test completion triggers with actual Control-Space
    for (const trigger of completionTriggers) {
        await context.page.evaluate(async (trigger) => {
            if (!window.view) return;

            // Insert partial text to trigger completions
            const insertPos = window.view.state.doc.length;
            window.view.dispatch({
                changes: { from: insertPos, insert: trigger },
                selection: { anchor: insertPos + trigger.length },
                annotations: window.userEvent.of('input.type')
            });
        }, trigger);

        // Small delay to ensure the text is processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Trigger completion with Control-Space
        await context.page.keyboard.press('Control+Space');
        await new Promise(resolve => setTimeout(resolve, 250));

        // Press Escape to close any completion popup
        await context.page.keyboard.press('Escape');

        // Clear the partial text
        await context.page.evaluate(async (trigger) => {
            if (!window.view) return;

            const docLength = window.view.state.doc.length;
            window.view.dispatch({
                changes: {
                    from: docLength - trigger.length,
                    to: docLength,
                    insert: ""
                },
                selection: { anchor: docLength - trigger.length }
            });
        }, trigger);

        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

export async function simulateLargeBlockOperations(context: BenchmarkContext) {
    await context.setStatusText('Running large block operations...');

    await context.page.evaluate(async ([codeBlock, sampleText]) => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: codeBlock.repeat(100) },
            annotations: window.userEvent.of('input.paste')
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: sampleText.repeat(20) },
            annotations: window.userEvent.of('input.paste')
        });

    }, [largeCodeBlock, sampleText]);
}

export async function simulateDiagnosticGeneration(context: BenchmarkContext) {
    await context.setStatusText('Running diagnostic generation...');

    const codeWithErrors = `// Code with intentional errors for diagnostic testing
const undefinedVar = someUndefinedVariable;
function duplicateFunction() {}
function duplicateFunction() {} // Duplicate declaration
const invalidSyntax = {
    property: value, // Missing quotes
    anotherProp:
}; // Missing value
let unusedVariable = 'never used';
`;

    await context.page.evaluate(async (errorCode) => {
        if (!window.view) return;

        // Insert code with errors
        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: errorCode },
            annotations: window.userEvent.of('input.paste')
        });

        // Wait some amount of time for diagnostics to be generated
        await new Promise(resolve => setTimeout(resolve, 500));

        window.view.dispatch({
            changes: {
                from: 0,
                to: window.view.state.doc.length,
                insert: ""
            }
        });
    }, codeWithErrors);
}

export async function simulateGoToDefinition(context: BenchmarkContext) {
    await context.setStatusText('Running go-to-definition tests...');

    // Insert code with definitions to test
    await context.page.evaluate(async (code) => {
        if (!window.view) return;

        // Replace any existing code
        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: code },
            selection: { anchor: 0 },
            annotations: window.userEvent.of('input.paste')
        });
    }, largeCodeBlock);

    // Test go-to-definition on various symbols by positioning cursor precisely
    const definitionTargets = [
        { symbol: 'Role', line: 1 },      // enum Role
        { symbol: 'AppUser', line: 7 },   // interface AppUser
        { symbol: 'Database', line: 17 }, // namespace Database
        { symbol: 'createAdmin', line: 18 } // function createAdmin
    ];

    for (const target of definitionTargets) {
        try {
            // Position cursor at the symbol using line/character positioning
            const positioned = await context.page.evaluate(async (targetInfo) => {
                if (!window.view) return false;

                const doc = window.view.state.doc;

                if (targetInfo.line > doc.lines) {
                    return false;
                }

                const line = doc.line(targetInfo.line);
                const text = line.text;

                const symbolIndex = text.indexOf(targetInfo.symbol);

                if (symbolIndex >= 0) {
                    const pos = line.from + symbolIndex + Math.floor(targetInfo.symbol.length / 2);
                    window.view.dispatch({
                        selection: { anchor: pos },
                        scrollIntoView: true
                    });
                    window.view.focus();
                    return true;
                }
                return false;
            }, target);

            if (!positioned) {
                console.log(`Could not position cursor for "${target.symbol}"`);
                continue;
            }
            // Press F12 for go-to-definition
            await context.page.keyboard.press('F12');
            await new Promise(resolve => setTimeout(resolve, 150));

        } catch (error) {
            console.log(`Could not test go-to-definition for "${target.symbol}": ${error.message}`);
        }
    }
}

export async function simulateFindReferences(context: BenchmarkContext) {
    await context.setStatusText('Running find references tests...');

    // Use the same code as go-to-definition
    await context.page.evaluate(async (code) => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: code },
            selection: { anchor: 0 },
            annotations: window.userEvent.of('input.paste')
        });
    }, largeCodeBlock);

    const referenceTargets = [
        { symbol: 'Role', line: 1 },
        { symbol: 'AppUser', line: 7 },
        { symbol: 'createAdmin', line: 18 }
    ];

    for (const target of referenceTargets) {
        try {
            // Position cursor at the symbol
            const positioned = await context.page.evaluate(async (targetInfo) => {
                if (!window.view) return false;

                const doc = window.view.state.doc;
                if (targetInfo.line > doc.lines) return false;

                const line = doc.line(targetInfo.line);
                const text = line.text;
                const symbolIndex = text.indexOf(targetInfo.symbol);

                if (symbolIndex >= 0) {
                    const pos = line.from + symbolIndex + Math.floor(targetInfo.symbol.length / 2);
                    window.view.dispatch({
                        selection: { anchor: pos },
                        scrollIntoView: true
                    });
                    window.view.focus();
                    return true;
                }
                return false;
            }, target);

            if (!positioned) continue;

            // Press Shift+F12 for find references
            await context.page.keyboard.press('Shift+F12');
            await new Promise(resolve => setTimeout(resolve, 250));

        } catch (error) {
            console.log(`Could not test find references for "${target.symbol}": ${error.message}`);
        }
    }
    await context.page.keyboard.press('Escape');
}

export async function simulateRename(context: BenchmarkContext) {
    await context.setStatusText('Running rename tests...');

    // Insert simple code for renaming
    const renameCode = `
function testFunction() {
    const localVar = 42;
    return localVar * 2;
}

const result = testFunction();
`;

    await context.page.evaluate(async (code) => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: code },
            selection: { anchor: 0 },
            annotations: window.userEvent.of('input.paste')
        });
    }, renameCode);

    // Test rename on various symbols with precise positioning
    const renameTargets = [
        { symbol: 'testFunction', line: 2 },
        { symbol: 'localVar', line: 3 }
    ];

    for (const target of renameTargets) {
        try {
            // Position cursor precisely at the symbol
            const positioned = await context.page.evaluate(async (targetInfo) => {
                if (!window.view) return false;

                const doc = window.view.state.doc;
                if (targetInfo.line > doc.lines) return false;

                const line = doc.line(targetInfo.line);
                const text = line.text;
                const symbolIndex = text.indexOf(targetInfo.symbol);

                if (symbolIndex >= 0) {
                    const pos = line.from + symbolIndex + Math.floor(targetInfo.symbol.length / 2);
                    window.view.dispatch({
                        selection: { anchor: pos },
                        scrollIntoView: true
                    });
                    window.view.focus();
                    return true;
                }
                return false;
            }, target);

            if (!positioned) continue;

            // Press F2 for rename
            await context.page.keyboard.press('F2');
            await new Promise(resolve => setTimeout(resolve, 300));

            // Type a new name and press Escape to cancel
            await context.page.keyboard.type(`${target.symbol}Renamed`);
            await new Promise(resolve => setTimeout(resolve, 200));
            await context.page.keyboard.press('Enter');
            await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
            console.log(`Could not test rename for "${target.symbol}": ${error.message}`);
        }
    }
}

export async function simulateFormatDocument(context: BenchmarkContext) {
    await context.setStatusText('Running format document tests...');

    // Insert poorly formatted code
    const unformattedCode = `
function   badlyFormatted(  ){
const x=1;
if(x>0){
console.log("test");
}
return x;
}
`;

    await context.page.evaluate(async (code) => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: code },
            annotations: window.userEvent.of('input.paste')
        });
        window.view.focus();
    }, unformattedCode);

    await context.page.keyboard.press('Control+Shift+K');
    await new Promise(resolve => setTimeout(resolve, 500));
}

export async function simulateSignatureNavigation(context: BenchmarkContext) {
    await context.setStatusText('Running signature navigation tests...');

    // Insert code with multiple overloads
    const overloadCode = `function overloadedFunction(x: number): number;
function overloadedFunction(x: boolean): boolean;
function overloadedFunction(x: string): string;
function overloadedFunction(x: string, param2: number, param3: boolean): string;
function overloadedFunction(x: number | boolean | string, param2?: number, param3?: boolean): any {
    return String(x);
}

// Test overload navigation here
`;

    await context.page.evaluate(async (code) => {
        if (!window.view) return;

        window.view.dispatch({
            changes: { from: 0, to: window.view.state.doc.length, insert: code },
            selection: { anchor: 0 },
            annotations: window.userEvent.of('input.paste')
        });
    }, overloadCode);

    // Type function call with proper cursor positioning
    await context.page.evaluate(async () => {
        if (!window.view) return;

        const insertPos = window.view.state.doc.length;
        window.view.dispatch({
            changes: { from: insertPos, insert: "overloadedFunction(" },
            selection: { anchor: insertPos + "overloadedFunction(".length },
            annotations: window.userEvent.of('input.type')
        });
        window.view.focus();
    });

    await new Promise(resolve => setTimeout(resolve, 200));

    // Ensure cursor is positioned correctly
    await context.page.keyboard.press('End');

    const isMac = await context.page.evaluate(() => navigator.platform.includes('Mac'));
    const modKey = isMac ? 'Meta' : 'Control';

    // Trigger signature help first
    await context.page.keyboard.press(`${modKey}+Shift+Space`);
    await new Promise(resolve => setTimeout(resolve, 250));

    // Navigate through signatures
    for (let i = 0; i < 3; i++) {
        await context.page.keyboard.press(`${modKey}+Shift+ArrowDown`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    for (let i = 0; i < 3; i++) {
        await context.page.keyboard.press(`${modKey}+Shift+ArrowUp`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Clean up
    await context.page.keyboard.press('Escape');
}

export const simulations = [
    { name: 'regular-typing', fn: simulateTyping },
    { name: 'hover-operations', fn: simulateHoverOperations },
    { name: 'completion-requests', fn: simulateCompletionRequests },
    { name: 'go-to-definition', fn: simulateGoToDefinition },
    { name: 'find-references', fn: simulateFindReferences },
    { name: 'rename', fn: simulateRename },
    { name: 'format-document', fn: simulateFormatDocument },
    { name: 'signature-navigation', fn: simulateSignatureNavigation },
    { name: 'large-block-operations', fn: simulateLargeBlockOperations },
    { name: 'diagnostic-generation', fn: simulateDiagnosticGeneration }
];