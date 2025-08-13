import { Context } from "./utils";

// Sample text for progressive typing phase
export const sampleText = `
const channel = new MessageChannel();
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

export const largeCodeBlock = `

enum Role {
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

// Bad
const mod = Database.createModerator(1, 'mod', 'mod@notexported.ca')
`;

export const diagnosticCode = `
// Code with intentional errors for diagnostic testing
const undefinedVar = someUndefinedVariable;
function duplicateFunction() {}
function duplicateFunction() {} // Duplicate declaration
const invalidSyntax = {
    property: value, // Missing quotes
    anotherProp:
}; // Missing value
let unusedVariable = 'never used';
`;

export const completionTriggers = [
    'document.',
    'console.',
    'window.',
    'channel.port1.',
    'iframe.contentWindow.',
    'JSON.',
    'Array.',
    'Object.'
];

export const rapidEditingSequence = [
    'const temp = ',
    'const tempVar = ',
    'const tempVariable = ',
    'const tempVariable = "hello"',
    'const tempVariable = "hello world"',
    'const tempVariable = "hello world";'
];

export async function simulateTyping(context: Context) {
    await context.setStatusText('Running regular typing...');

    await context.page.evaluate(async (text) => {
        if (!window.view) return;

        for (let i = 0; i < text.length; i++) {
            window.view.dispatch({
                changes: { from: window.view.state.doc.length, insert: text[i] },
                annotations: (window.view.state as any).t.userEvent.of('input.type')
            });
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }, sampleText);
}

export async function simulateHoverOperations(context: Context) {
    await context.setStatusText('Running hover operations...');

    const hoverPositions = [
        { line: 1, character: 6 }, // "channel" variable
        { line: 3, character: 8 }, // "iframe" variable
        { line: 6, character: 2 }, // "addEventListener" method
        { line: 11, character: 2 }, // "channel.port1" property access
        { line: 14, character: 2 }, // "iframe.contentWindow" method call
    ];

    await context.page.evaluate(async (positions) => {
        if (!window.view) return;

        for (const pos of positions) {
            // Simulate cursor movement to trigger hover
            const offset = window.view.state.doc.line(pos.line).from + pos.character;
            if (offset < window.view.state.doc.length) {
                window.view.dispatch({
                    selection: { anchor: offset, head: offset },
                    annotations: (window.view.state as any).t.userEvent.of('select.pointer')
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }, hoverPositions);
}

export async function simulateCompletionRequests(context: Context) {
    await context.setStatusText('Running completion requests...');

    await context.page.evaluate(async (triggers) => {
        if (!window.view) return;

        for (const trigger of triggers) {
            // Insert partial text to trigger completions
            window.view.dispatch({
                changes: { from: window.view.state.doc.length, insert: trigger },
                annotations: (window.view.state as any).t.userEvent.of('input.type')
            });

            // Wait for completion to potentially trigger
            await new Promise(resolve => setTimeout(resolve, 150));

            // Clear the partial text
            window.view.dispatch({
                changes: {
                    from: window.view.state.doc.length - trigger.length,
                    to: window.view.state.doc.length,
                    insert: ""
                }
            });

            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }, completionTriggers);
}

export async function simulateLargeBlockOperations(context: Context) {
    await context.setStatusText('Running large block operations...');

    await context.page.evaluate(async (codeBlock) => {
        if (!window.view) return;

        // Insert large code block
        window.view.dispatch({
            changes: { from: window.view.state.doc.length, insert: codeBlock },
            annotations: (window.view.state as any).t.userEvent.of('input.paste')
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        // Delete the large block
        window.view.dispatch({
            changes: {
                from: window.view.state.doc.length - codeBlock.length,
                to: window.view.state.doc.length,
                insert: ""
            }
        });

        await new Promise(resolve => setTimeout(resolve, 1500));
    }, largeCodeBlock);
}

export async function simulateRapidEditing(context: Context) {
    await context.setStatusText('Running rapid editing patterns...');

    await context.page.evaluate(async (sequence) => {
        if (!window.view) return;

        for (let i = 0; i < sequence.length; i++) {
            // Clear previous if not first
            if (i > 0) {
                window.view.dispatch({
                    changes: {
                        from: window.view.state.doc.length - sequence[i - 1].length,
                        to: window.view.state.doc.length,
                        insert: ""
                    }
                });
            }

            // Insert new text
            window.view.dispatch({
                changes: { from: window.view.state.doc.length, insert: sequence[i] },
                annotations: (window.view.state as any).t.userEvent.of('input.type')
            });

            await new Promise(resolve => setTimeout(resolve, 80));
        }

        // Clean up final text
        window.view.dispatch({
            changes: {
                from: window.view.state.doc.length - sequence[sequence.length - 1].length,
                to: window.view.state.doc.length,
                insert: ""
            }
        });
    }, rapidEditingSequence);
}

export async function simulateDiagnosticGeneration(context: Context) {
    await context.setStatusText('Running diagnostic generation...');

    await context.page.evaluate(async (errorCode) => {
        if (!window.view) return;

        // Insert code with errors
        window.view.dispatch({
            changes: { from: window.view.state.doc.length, insert: errorCode },
            annotations: (window.view.state as any).t.userEvent.of('input.paste')
        });

        // Wait for diagnostics to be generated
        await new Promise(resolve => setTimeout(resolve, 500));

        // Remove the error code
        window.view.dispatch({
            changes: {
                from: window.view.state.doc.length - errorCode.length,
                to: window.view.state.doc.length,
                insert: ""
            }
        });

        await new Promise(resolve => setTimeout(resolve, 200));
    }, diagnosticCode);
}

// Benchmark phases configuration
export const benchmarkPhases = [
    { name: 'regular-typing', fn: simulateTyping },
    { name: 'hover-operations', fn: simulateHoverOperations },
    { name: 'completion-requests', fn: simulateCompletionRequests },
    { name: 'large-block-operations', fn: simulateLargeBlockOperations },
    { name: 'rapid-editing', fn: simulateRapidEditing },
    { name: 'diagnostic-generation', fn: simulateDiagnosticGeneration }
];