import { Plugin, MarkdownView } from 'obsidian';
import { EpubReaderSettings, DEFAULT_SETTINGS, EpubReaderSettingTab } from './src/settings';
import { EpubReaderView, EPUB_READER_VIEW_TYPE } from './src/epub-reader-view';

// Remember to rename these classes and interfaces!

export default class EpubReaderPlugin extends Plugin {
	settings: EpubReaderSettings;

	async onload() {
		console.log('EPUB Reader Plugin loading...');
		await this.loadSettings();

		// Register the EPUB reader view
		this.registerView(
			EPUB_READER_VIEW_TYPE,
			(leaf) => new EpubReaderView(leaf)
		);

		// Add command to open EPUB reader
		this.addCommand({
			id: 'open-epub-reader',
			name: 'Open EPUB Reader',
			checkCallback: (checking: boolean) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file) {
					const frontmatter = this.app.metadataCache.getFileCache(activeView.file)?.frontmatter;
					const epubProperty = frontmatter?.[this.settings.epubPropertyName];
					
					if (epubProperty) {
						if (!checking) {
							console.log('EPUB Reader command triggered');
							this.activateEpubReaderView();
						}
						return true;
					}
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EpubReaderSettingTab(this.app, this));
		
		console.log('EPUB Reader Plugin loaded successfully');
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateEpubReaderView() {
		console.log('Activating EPUB reader view...');
		const { workspace } = this.app;

		let leaf = workspace.getLeavesOfType(EPUB_READER_VIEW_TYPE)[0];

		if (!leaf) {
			console.log('Creating new EPUB reader leaf in main workspace...');
			leaf = workspace.getLeaf();
			await leaf.setViewState({ type: EPUB_READER_VIEW_TYPE, active: true });
		} else {
			console.log('Found existing EPUB reader leaf');
		}

		workspace.revealLeaf(leaf);
		console.log('EPUB reader view activated');
	}
}
