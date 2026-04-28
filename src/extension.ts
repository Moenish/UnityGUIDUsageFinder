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

let usageTreeProvider: UsageTreeProvider;
let lastScriptUri: vscode.Uri | undefined;
let lastGuid: string | undefined;
type ScanHistoryEntry = {
	scriptPath: string;
	scriptName: string;
	guid: string;
	scannedAt: Date;
	results: UsageResult[];
};

let scanHistory: ScanHistoryEntry[] = [];
let historyTreeProvider: HistoryTreeProvider;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	loadScanHistory();

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

	historyTreeProvider = new HistoryTreeProvider();

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider(
			"unityGuidUsageFinder.historyView",
			historyTreeProvider
		)
	);

	historyTreeProvider.refresh();

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

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.refreshLastSearch",
			async () => {
				if (!lastScriptUri || !lastGuid) {
					vscode.window.showInformationMessage("No previous Unity GUID search to refresh.");
					return;
				}

				await findGuidUsages(lastScriptUri, lastGuid);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.clearResults",
			() => {
				usageTreeProvider.clearResults();
				vscode.window.showInformationMessage("Unity GUID usage results cleared.");
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.copyCurrentScriptGuid",
			async (uri?: vscode.Uri) => {
				const scriptUri = getTargetScriptUri(uri);

				if (!scriptUri || path.extname(scriptUri.fsPath).toLowerCase() !== ".cs") {
					vscode.window.showErrorMessage("Open or right-click a Unity .cs script first.");
					return;
				}

				const metaUri = vscode.Uri.file(scriptUri.fsPath + ".meta");
				const metaText = await readTextFile(metaUri);
				const guid = extractGuid(metaText);

				if (!guid) {
					vscode.window.showErrorMessage(`Could not find guid in ${path.basename(metaUri.fsPath)}.`);
					return;
				}

				await vscode.env.clipboard.writeText(guid);
				vscode.window.showInformationMessage(`Copied Unity script GUID: ${guid}`);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.showScanHistory",
			async () => {
				if (scanHistory.length === 0) {
					vscode.window.showInformationMessage("No Unity GUID scan history yet.");
					return;
				}

				const selected = await vscode.window.showQuickPick(
					scanHistory.map(entry => ({
						label: entry.scriptName,
						description: `${entry.results.length} result(s)`,
						detail: `${entry.scriptPath} — ${entry.scannedAt.toLocaleString()}`,
						entry
					})),
					{
						placeHolder: "Select a previous Unity GUID scan"
					}
				);

				if (!selected) {
					return;
				}

				const grouped = groupMatches(selected.entry.results);
				usageTreeProvider.setResults(grouped);

				vscode.window.showInformationMessage(
					`Restored scan: ${selected.entry.scriptName} (${selected.entry.results.length} result(s))`
				);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.loadHistoryEntry",
			(entry: ScanHistoryEntry) => {
				const grouped = groupMatches(entry.results);
				usageTreeProvider.setResults(grouped);

				lastScriptUri = vscode.Uri.file(entry.scriptPath);
				lastGuid = entry.guid;
				historyTreeProvider.refresh();
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.revealUsageInExplorer",
			async (item?: UsageTreeItem | vscode.Location | vscode.Uri) => {
				let uri: vscode.Uri | undefined;

				if (item instanceof vscode.Uri) {
					uri = item;
				} else if (item instanceof vscode.Location) {
					uri = item.uri;
				} else if (item instanceof UsageTreeItem && item.location) {
					uri = item.location.uri;
				}

				if (!uri) {
					vscode.window.showErrorMessage("Could not determine which usage to reveal.");
					return;
				}

				await vscode.commands.executeCommand("revealInExplorer", uri);
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.openAllUsages",
			async () => {
				const results = usageTreeProvider.getAllResults();

				if (results.length === 0) {
					vscode.window.showInformationMessage("No Unity GUID usage results to open.");
					return;
				}

				for (const result of results) {
					await vscode.window.showTextDocument(result.location.uri, {
						preview: false,
						preserveFocus: true
					});
				}
			}
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"unityGuidUsageFinder.clearScanHistory",
			() => {
				scanHistory = [];
				saveScanHistory();
				historyTreeProvider.refresh();
				vscode.window.showInformationMessage("Unity GUID scan history cleared.");
			}
		)
	);

	context.subscriptions.push(disposable);
}

export function deactivate() { }

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
	lastScriptUri = scriptUri;
	lastGuid = guid;

	const output = vscode.window.createOutputChannel("Unity GUID Usage Finder");
	output.clear();
	output.show(true);

	output.appendLine(`Script: ${scriptUri.fsPath}`);
	output.appendLine(`GUID: ${guid}`);
	output.appendLine("");

	const includePattern = getIncludePattern();
	const excludePattern = getExcludePattern();
	const files = await vscode.workspace.findFiles(includePattern, excludePattern);

	const matchesByFile = new Map<string, UsageResult>();

	const batchSize = 12;
	const batches = chunkArray(files, batchSize);
	let scannedCount = 0;

	await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Scanning Unity serialized assets",
			cancellable: true
		},
		async (progress, token) => {
			for (const batch of batches) {
				if (token.isCancellationRequested) {
					output.appendLine("Scan cancelled.");
					return;
				}

				const results = await Promise.all(
					batch.map(async file => {
						if (token.isCancellationRequested) {
							return undefined;
						}

						const result = await scanFileForGuid(file, guid);
						scannedCount++;

						progress.report({
							message: `${scannedCount}/${files.length}`
						});

						return result;
					})
				);

				for (const result of results) {
					if (!result) {
						continue;
					}

					if (!matchesByFile.has(result.location.uri.fsPath)) {
						matchesByFile.set(result.location.uri.fsPath, result);
					}
				}
			}
		}
	);

	const matches = [...matchesByFile.values()];
	const locations = matches.map(m => m.location);

	if (matches.length === 0) {
		output.appendLine("No Unity serialized usages found.");
		vscode.window.showInformationMessage("No Unity serialized usages found for this script GUID.");
		return;
	}

	const grouped = groupMatches(matches);
	usageTreeProvider.setResults(grouped);
	addScanToHistory(scriptUri, guid, matches);
	historyTreeProvider.refresh();

	for (const [groupName, groupLocations] of grouped) {
		output.appendLine(groupName);
		output.appendLine("=".repeat(groupName.length));

		for (const result of groupLocations) {
			const location = result.location;
			const relativePath = vscode.workspace.asRelativePath(location.uri);
			const gameObject = result.gameObjectName ? ` — ${result.gameObjectName}` : "";
			output.appendLine(`${relativePath}:${location.range.start.line + 1}:${location.range.start.character + 1}${gameObject}`);
		}

		output.appendLine("");
	}

	output.appendLine(
		`Found ${matches.length} GUID reference(s) in ${new Set(locations.map(m => m.uri.fsPath)).size} file(s).`
	);

	const selected = await vscode.window.showQuickPick(
		matches.map((result) => {
			const location = result.location;
			const relativePath = vscode.workspace.asRelativePath(location.uri);

			return {
				label: path.basename(location.uri.fsPath),
				description: result.gameObjectName
					? `GameObject: ${result.gameObjectName}`
					: getFileGroup(location.uri.fsPath),
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

function groupMatches(matches: UsageResult[]): Map<string, UsageResult[]> {
	const grouped = new Map<string, UsageResult[]>();

	for (const match of matches) {
		const group = getFileGroup(match.location.uri.fsPath);

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
		public readonly location?: vscode.Location,
		public readonly groupName?: string
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
			this.iconPath = new vscode.ThemeIcon("go-to-file", new vscode.ThemeColor("charts.foreground"));
		} else {
			this.contextValue = "usageGroup";
			this.iconPath = getGroupIcon(groupName ?? label);
		}
	}
}

class UsageTreeProvider implements vscode.TreeDataProvider<UsageTreeItem> {
	private readonly emitter = new vscode.EventEmitter<UsageTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData = this.emitter.event;

	private groupedResults = new Map<string, UsageResult[]>();

	setResults(groupedResults: Map<string, UsageResult[]>) {
		this.groupedResults = groupedResults;
		this.emitter.fire();
	}

	clearResults() {
		this.groupedResults.clear();
		this.emitter.fire();
	}

	getAllResults(): UsageResult[] {
		return [...this.groupedResults.values()].flat();
	}

	getTreeItem(element: UsageTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: UsageTreeItem): UsageTreeItem[] {
		if (!element) {
			return [...this.groupedResults.keys()].map(
				group => new UsageTreeItem(
					group,
					vscode.TreeItemCollapsibleState.Expanded,
					undefined,
					group
				)
			);
		}

		const results = this.groupedResults.get(element.label) ?? [];

		return results.map(result => {
			const relativePath = vscode.workspace.asRelativePath(result.location.uri);
			const label = result.gameObjectName
				? `${path.basename(result.location.uri.fsPath)} — ${result.gameObjectName}`
				: relativePath;

			const item = new UsageTreeItem(
				label,
				vscode.TreeItemCollapsibleState.None,
				result.location
			);

			item.description = result.gameObjectName
				? relativePath
				: `Line ${result.location.range.start.line + 1}`;

			return item;
		});
	}
}

type UsageResult = {
	location: vscode.Location;
	gameObjectName?: string;
};

function findGameObjectNameForScript(text: string, guid: string): string | undefined {
	const scriptIndex = text.indexOf(guid);

	if (scriptIndex < 0) {
		return undefined;
	}

	const componentStart = text.lastIndexOf("--- !u!", scriptIndex);
	const componentBlock = text.slice(componentStart, scriptIndex);

	const gameObjectMatch = componentBlock.match(/m_GameObject:\s*\{fileID:\s*(-?\d+)\}/);

	if (!gameObjectMatch) {
		return undefined;
	}

	const gameObjectFileId = gameObjectMatch[1];

	const gameObjectHeaderRegex = new RegExp(`--- !u!1 &${escapeRegExp(gameObjectFileId)}\\s+GameObject:[\\s\\S]*?(?=--- !u!|$)`);
	const gameObjectMatchBlock = text.match(gameObjectHeaderRegex);

	if (!gameObjectMatchBlock) {
		return undefined;
	}

	const nameMatch = gameObjectMatchBlock[0].match(/m_Name:\s*(.+)/);

	return nameMatch?.[1]?.trim();
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getIncludePattern(): string {
	const config = vscode.workspace.getConfiguration("unityGuidUsageFinder");
	const globs = config.get<string[]>("includeGlobs") ?? [];

	if (globs.length === 0) {
		return "{Assets/**/*.unity,Assets/**/*.prefab,Assets/**/*.asset}";
	}

	return `{${globs.join(",")}}`;
}

function getExcludePattern(): string {
	const config = vscode.workspace.getConfiguration("unityGuidUsageFinder");
	return config.get<string>("excludeGlob") ?? "**/{Library,Temp,Obj,Build,Builds,Logs,Packages}/**";
}

function getGroupIcon(groupName: string): vscode.ThemeIcon {
	switch (groupName) {
		case "Scenes":
			return new vscode.ThemeIcon("symbol-namespace", new vscode.ThemeColor("charts.blue"));
		case "Prefabs":
			return new vscode.ThemeIcon("package", new vscode.ThemeColor("charts.green"));
		case "Assets / ScriptableObjects":
			return new vscode.ThemeIcon("database", new vscode.ThemeColor("charts.orange"));
		case "Animators":
			return new vscode.ThemeIcon("symbol-event", new vscode.ThemeColor("charts.purple"));
		case "Animations":
			return new vscode.ThemeIcon("play-circle", new vscode.ThemeColor("charts.yellow"));
		case "Materials":
			return new vscode.ThemeIcon("symbol-color", new vscode.ThemeColor("charts.red"));
		default:
			return new vscode.ThemeIcon("files");
	}
}

function addScanToHistory(scriptUri: vscode.Uri, guid: string, results: UsageResult[]) {
	const entry: ScanHistoryEntry = {
		scriptPath: scriptUri.fsPath,
		scriptName: path.basename(scriptUri.fsPath),
		guid,
		scannedAt: new Date(),
		results
	};

	scanHistory = [
		entry,
		...scanHistory.filter(existing => existing.scriptPath !== scriptUri.fsPath)
	].slice(0, 20);

	saveScanHistory();
	historyTreeProvider?.refresh();
}

class HistoryTreeProvider implements vscode.TreeDataProvider<UsageTreeItem> {
	private readonly emitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.emitter.event;

	refresh() {
		this.emitter.fire();
	}

	getTreeItem(element: UsageTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): UsageTreeItem[] {
		return scanHistory.map(entry => {
			const label = `${entry.scriptName} (${entry.results.length})`;

			const item = new UsageTreeItem(
				label,
				vscode.TreeItemCollapsibleState.None
			);

			item.tooltip = `${entry.scriptPath}\n${entry.scannedAt.toLocaleString()}`;
			item.iconPath = isCurrentHistoryEntry(entry)
				? new vscode.ThemeIcon("star-full", new vscode.ThemeColor("charts.yellow"))
				: new vscode.ThemeIcon("history", new vscode.ThemeColor("charts.blue"));
			item.description = isCurrentHistoryEntry(entry)
				? "current"
				: entry.scannedAt.toLocaleTimeString();

			item.command = {
				command: "unityGuidUsageFinder.loadHistoryEntry",
				title: "Load History",
				arguments: [entry]
			};

			return item;
		});
	}
}

type SerializedUsageResult = {
	filePath: string;
	line: number;
	column: number;
	gameObjectName?: string;
};

type SerializedScanHistoryEntry = {
	scriptPath: string;
	scriptName: string;
	guid: string;
	scannedAt: string;
	results: SerializedUsageResult[];
};

function saveScanHistory() {
	const serialized: SerializedScanHistoryEntry[] = scanHistory.map(entry => ({
		scriptPath: entry.scriptPath,
		scriptName: entry.scriptName,
		guid: entry.guid,
		scannedAt: entry.scannedAt.toISOString(),
		results: entry.results.map(result => ({
			filePath: result.location.uri.fsPath,
			line: result.location.range.start.line,
			column: result.location.range.start.character,
			gameObjectName: result.gameObjectName
		}))
	}));

	extensionContext.globalState.update("scanHistory", serialized);
}

function loadScanHistory() {
	const serialized = extensionContext.globalState.get<SerializedScanHistoryEntry[]>("scanHistory") ?? [];

	scanHistory = serialized.map(entry => ({
		scriptPath: entry.scriptPath,
		scriptName: entry.scriptName,
		guid: entry.guid,
		scannedAt: new Date(entry.scannedAt),
		results: entry.results.map(result => ({
			location: new vscode.Location(
				vscode.Uri.file(result.filePath),
				new vscode.Position(result.line, result.column)
			),
			gameObjectName: result.gameObjectName
		}))
	}));
}

function isCurrentHistoryEntry(entry: ScanHistoryEntry): boolean {
	return lastScriptUri?.fsPath === entry.scriptPath && lastGuid === entry.guid;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
	const chunks: T[][] = [];

	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}

	return chunks;
}

async function scanFileForGuid(file: vscode.Uri, guid: string): Promise<UsageResult | undefined> {
	const text = await readTextFile(file);

	if (!text.includes(guid)) {
		return undefined;
	}

	const lines = text.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const column = lines[i].indexOf(guid);

		if (column >= 0) {
			const position = new vscode.Position(i, column);

			return {
				location: new vscode.Location(file, position),
				gameObjectName: findGameObjectNameForScript(text, guid)
			};
		}
	}

	return undefined;
}