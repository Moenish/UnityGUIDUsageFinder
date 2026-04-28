import * as vscode from "vscode";
import * as path from "path";

const SEARCH_GLOBS = [
	"**/*.unity",
	"**/*.prefab",
	"**/*.asset",
	"**/*.controller",
	"**/*.overrideController",
	"**/*.anim",
	"**/*.mat"
];

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"unityGuidUsageFinder.findScriptUsages",
		async (uri?: vscode.Uri) => {
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
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Unity GUID Usage Finder failed: ${message}`);
			}
		}
	);

	usageTreeProvider = new UsageTreeProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			"unityGuidUsageFinder.resultsView",
			usageTreeProvider
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.openUsage",
			async (location: vscode.Location) => {
				const doc = await vscode.workspace.openTextDocument(location.uri);
				const editor = await vscode.window.showTextDocument(doc);
				editor.selection = new vscode.Selection(location.range.start, location.range.start);
				editor.revealRange(location.range, vscode.TextEditorRevealType.InCenter);
			}
		)
	);

	context.subscriptions.push(disposable);
}

export function deactivate() { }
let usageTreeProvider: UsageTreeProvider;

function getTargetScriptUri(uri?: vscode.Uri): vscode.Uri | undefined {
	if (uri) {
		return uri;
	}

	const editor = vscode.window.activeTextEditor;
	return editor?.document.uri;
}

async function readTextFile(uri: vscode.Uri): Promise<string> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	return Buffer.from(bytes).toString("utf8");
}

function extractGuid(metaText: string): string | undefined {
	const match = metaText.match(/^guid:\s*([a-fA-F0-9]+)\s*$/m);
	return match?.[1];
}

async function findGuidUsages(scriptUri: vscode.Uri, guid: string): Promise<void> {
	const output = vscode.window.createOutputChannel("Unity GUID Usage Finder");
	output.clear();
	output.show(true);

	output.appendLine(`Script: ${scriptUri.fsPath}`);
	output.appendLine(`GUID: ${guid}`);
	output.appendLine("");

	const includePattern = "{Assets/**/*.unity,Assets/**/*.prefab,Assets/**/*.asset,Assets/**/*.controller,Assets/**/*.overrideController,Assets/**/*.anim,Assets/**/*.mat}";
	const files = await vscode.workspace.findFiles(includePattern, "**/{Library,Temp,Obj,Build,Builds,Logs,Packages}/**");

	const matchesByFile = new Map<string, vscode.Location>();

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
				if (!matchesByFile.has(file.fsPath)) {
					matchesByFile.set(file.fsPath, new vscode.Location(file, position));
				}
			}
		}
	}

	const matches = [...matchesByFile.values()];

	if (matches.length === 0) {
		output.appendLine("No Unity serialized usages found.");
		vscode.window.showInformationMessage("No Unity serialized usages found for this script GUID.");
		return;
	}

	const grouped = groupMatches(matches);
	usageTreeProvider.setResults(grouped);

	for (const [groupName, locations] of grouped) {
		output.appendLine(groupName);
		output.appendLine("=".repeat(groupName.length));

		for (const location of locations) {
			const relativePath = vscode.workspace.asRelativePath(location.uri);
			output.appendLine(`${relativePath}:${location.range.start.line + 1}:${location.range.start.character + 1}`);
		}

		output.appendLine("");
	}

	output.appendLine(`Found ${matches.length} GUID reference(s) in ${new Set(matches.map(m => m.uri.fsPath)).size} file(s).`);

	const selected = await vscode.window.showQuickPick(
		matches.map((location) => {
			const relativePath = vscode.workspace.asRelativePath(location.uri);
			return {
				label: path.basename(location.uri.fsPath),
				description: getFileGroup(location.uri.fsPath),
				detail: `${relativePath}:${location.range.start.line + 1}`,
				location
			};
		}),
		{
			placeHolder: "Select a Unity usage to open"
		}
	);

	if (selected) {
		const doc = await vscode.workspace.openTextDocument(selected.location.uri);
		const editor = await vscode.window.showTextDocument(doc);

		editor.selection = new vscode.Selection(
			selected.location.range.start,
			selected.location.range.start
		);

		editor.revealRange(selected.location.range, vscode.TextEditorRevealType.InCenter);
	}
}

function groupMatches(matches: vscode.Location[]): Map<string, vscode.Location[]> {
	const grouped = new Map<string, vscode.Location[]>();

	for (const match of matches) {
		const group = getFileGroup(match.uri.fsPath);

		if (!grouped.has(group)) {
			grouped.set(group, []);
		}

		grouped.get(group)!.push(match);
	}

	return new Map([...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function getFileGroup(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();

	switch (ext) {
		case ".unity":
			return "Scenes";
		case ".prefab":
			return "Prefabs";
		case ".asset":
			return "Assets / ScriptableObjects";
		case ".controller":
		case ".overridecontroller":
			return "Animators";
		case ".anim":
			return "Animations";
		case ".mat":
			return "Materials";
		default:
			return "Other";
	}
}

class UsageTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly location?: vscode.Location
	) {
		super(label, collapsibleState);

		if (location) {
			this.command = {
				command: "unityGuidUsageFinder.openUsage",
				title: "Open Usage",
				arguments: [location]
			};

			this.description = `Line ${location.range.start.line + 1}`;
			this.tooltip = location.uri.fsPath;
			this.contextValue = "usage";
		}
	}
}

class UsageTreeProvider implements vscode.TreeDataProvider<UsageTreeItem> {
	private readonly emitter = new vscode.EventEmitter<UsageTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this.emitter.event;

	private groupedResults = new Map<string, vscode.Location[]>();

	setResults(groupedResults: Map<string, vscode.Location[]>) {
		this.groupedResults = groupedResults;
		this.emitter.fire();
	}

	getTreeItem(element: UsageTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: UsageTreeItem): UsageTreeItem[] {
		if (!element) {
			return [...this.groupedResults.keys()].map(
				group => new UsageTreeItem(group, vscode.TreeItemCollapsibleState.Expanded)
			);
		}

		const locations = this.groupedResults.get(element.label) ?? [];

		return locations.map(location => {
			const relativePath = vscode.workspace.asRelativePath(location.uri);
			return new UsageTreeItem(
				relativePath,
				vscode.TreeItemCollapsibleState.None,
				location
			);
		});
	}
}