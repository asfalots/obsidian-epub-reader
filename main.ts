import { Plugin, MarkdownView, TFile } from 'obsidian';
import { EpubReaderSettings, DEFAULT_SETTINGS, EpubReaderSettingTab } from './src/settings';
import { EpubReaderView, EPUB_READER_VIEW_TYPE } from './src/epub-reader-view';

// Remember to rename these classes and interfaces!

export default class EpubReaderPlugin extends Plugin {
	settings: EpubReaderSettings;
	statusBarItem: HTMLElement | null = null;

	async onload() {
		console.log('EPUB Reader Plugin loading...');
		await this.loadSettings();

		// Create status bar item for reading position
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.style.display = 'none'; // Initially hidden

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
							this.activateEpubReaderView(epubProperty, activeView.file);
						}
						return true;
					}
				}
				return false;
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new EpubReaderSettingTab(this.app, this));
		
		// Listen for active leaf changes to update status bar visibility
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updateStatusBarVisibility();
			})
		);
		
		console.log('EPUB Reader Plugin loaded successfully');
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Refresh all open EPUB reader views to apply new settings
		this.refreshEpubReaderViews();
	}

	/**
	 * Refresh all open EPUB reader views to apply updated settings
	 */
	private refreshEpubReaderViews() {
		const { workspace } = this.app;
		const leaves = workspace.getLeavesOfType(EPUB_READER_VIEW_TYPE);
		
		leaves.forEach((leaf) => {
			const view = leaf.view as EpubReaderView;
			if (view && typeof view.updateSettingsAndRefresh === 'function') {
				// Update the view with current settings and re-render
				view.updateSettingsAndRefresh(this.settings);
			}
		});
	}

	async activateEpubReaderView(epubProperty: string, noteFile: TFile) {
		console.log('Activating EPUB reader view...');
		const { workspace } = this.app;

		// Resolve the EPUB path
		const epubPath = this.resolveEpubPath(epubProperty);
		console.log('Resolved EPUB path:', epubPath);

		// Get current progress if it exists
		const frontmatter = this.app.metadataCache.getFileCache(noteFile)?.frontmatter;
		const savedProgress = frontmatter?.[this.settings.progressPropertyName];

		// Always create a new tab
		console.log('Creating new EPUB reader leaf in main workspace...');
		const leaf = workspace.getLeaf('tab');
		await leaf.setViewState({ 
			type: EPUB_READER_VIEW_TYPE, 
			active: true,
			state: { 
				epubPath,
				noteFile: noteFile.path,
				savedProgress: savedProgress,
				plugin: this
			}
		});

		workspace.revealLeaf(leaf);
		console.log('EPUB reader view activated');
	}

	resolveEpubPath(epubProperty: string): string {
		// Check if it's a wiki link [[filename]]
		const wikiLinkMatch = epubProperty.match(/^\[\[(.+)\]\]$/);
		
		if (wikiLinkMatch) {
			const linkPath = wikiLinkMatch[1];
			console.log('Found wiki link:', linkPath);
			
			// Try to find the file in the vault
			const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, '');
			if (file) {
				return file.path;
			} else {
				console.warn('Wiki link file not found:', linkPath);
				return linkPath; // Return the raw link path if file not found
			}
		}
		
		// Return as-is if it's not a wiki link (assume it's a direct path)
		return epubProperty;
	}

	/**
	 * Update the status bar with reading position
	 */
	updateStatusBarPosition(text: string) {
		if (this.statusBarItem) {
			this.statusBarItem.textContent = text;
		}
	}

	/**
	 * Show or hide the status bar item based on active view
	 */
	updateStatusBarVisibility() {
		if (!this.statusBarItem) return;
		
		const { workspace } = this.app;
		const activeLeaf = workspace.activeLeaf;
		const isEpubReaderActive = activeLeaf?.view?.getViewType() === EPUB_READER_VIEW_TYPE;
		
		this.statusBarItem.style.display = isEpubReaderActive ? 'block' : 'none';
		
		if (!isEpubReaderActive) {
			this.statusBarItem.textContent = '';
		}
	}
}
