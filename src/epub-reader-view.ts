import { ItemView, WorkspaceLeaf } from 'obsidian';

export const EPUB_READER_VIEW_TYPE = 'epub-reader-view';

export class EpubReaderView extends ItemView {
	private epubPath: string = '';

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
		console.log('EpubReaderView constructor called');
	}

	getViewType() {
		return EPUB_READER_VIEW_TYPE;
	}

	getDisplayText() {
		return 'Epub Reader';
	}

	async onOpen() {
		console.log('EpubReaderView onOpen called');
		this.renderView();
	}

	getState() {
		return {
			epubPath: this.epubPath
		};
	}

	async setState(state: any, result: any) {
		if (state?.epubPath) {
			this.epubPath = state.epubPath;
			this.renderView();
		}
		return super.setState(state, result);
	}

	setEpubPath(path: string) {
		this.epubPath = path;
		this.renderView();
	}

	private renderView() {
		const container = this.containerEl.children[1];
		container.empty();
		
		if (this.epubPath) {
			container.createEl('h3', { text: 'EPUB Reader' });
			container.createEl('p', { text: `EPUB Path: ${this.epubPath}` });
			container.createEl('div', { text: 'Ready to load EPUB content...' });
		} else {
			container.createEl('div', { text: 'EPUB Reader - No EPUB file specified' });
		}
	}

	async onClose() {
		// Clean up any resources
	}
}
