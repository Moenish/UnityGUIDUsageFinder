"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const SEARCH_GLOBS = [
    "**/*.unity",
    "**/*.prefab",
    "**/*.asset",
    "**/*.controller",
    "**/*.overrideController",
    "**/*.anim",
    "**/*.mat"
];
function activate(context) {
    const disposable = vscode.commands.registerCommand("unityGuidUsageFinder.findScriptUsages", async (uri) => {
        try {
            const scriptUri = getTargetScriptUri(uri);
            if (!scriptUri) {
                vscode.window.showErrorMessage("Open or right-click a Unity .cs script first.");
                return;
            }
            if (path.extname(scriptUri.fsPath).toLowerCase() !== ".cs") {
                vscode.window.showErrorMessage("Selected file is not a .cs script.");
                return;
            }
            const metaUri = vscode.Uri.file(scriptUri.fsPath + ".meta");
            const metaText = await readTextFile(metaUri);
            const guid = extractGuid(metaText);
            if (!guid) {
                vscode.window.showErrorMessage(`Could not find guid in ${path.basename(metaUri.fsPath)}.`);
                return;
            }
            await findGuidUsages(scriptUri, guid);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unity GUID Usage Finder failed: ${message}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
function getTargetScriptUri(uri) {
    if (uri) {
        return uri;
    }
    const editor = vscode.window.activeTextEditor;
    return editor?.document.uri;
}
async function readTextFile(uri) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString("utf8");
}
function extractGuid(metaText) {
    const match = metaText.match(/^guid:\s*([a-fA-F0-9]+)\s*$/m);
    return match?.[1];
}
async function findGuidUsages(scriptUri, guid) {
    const output = vscode.window.createOutputChannel("Unity GUID Usage Finder");
    output.clear();
    output.show(true);
    output.appendLine(`Script: ${scriptUri.fsPath}`);
    output.appendLine(`GUID: ${guid}`);
    output.appendLine("");
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
    }
    const includePattern = `{${SEARCH_GLOBS.join(",")}}`;
    const files = await vscode.workspace.findFiles(includePattern, "**/Library/**");
    const matches = [];
    for (const file of files) {
        const text = await readTextFile(file);
        if (!text.includes(guid)) {
            continue;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const column = lines[i].indexOf(guid);
            if (column >= 0) {
                const position = new vscode.Position(i, column);
                matches.push(new vscode.Location(file, position));
                const relativePath = vscode.workspace.asRelativePath(file);
                output.appendLine(`${relativePath}:${i + 1}:${column + 1}`);
                output.appendLine(`  ${lines[i].trim()}`);
            }
        }
    }
    output.appendLine("");
    output.appendLine(`Found ${matches.length} GUID reference(s).`);
    if (matches.length === 0) {
        vscode.window.showInformationMessage("No Unity serialized usages found for this script GUID.");
        return;
    }
    const selected = await vscode.window.showQuickPick(matches.map((location) => ({
        label: vscode.workspace.asRelativePath(location.uri),
        description: `Line ${location.range.start.line + 1}`,
        location
    })), {
        placeHolder: "Select a Unity usage to open"
    });
    if (selected) {
        const doc = await vscode.workspace.openTextDocument(selected.location.uri);
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = new vscode.Selection(selected.location.range.start, selected.location.range.start);
        editor.revealRange(selected.location.range, vscode.TextEditorRevealType.InCenter);
    }
}
//# sourceMappingURL=extension.js.map