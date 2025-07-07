import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
// @ts-ignore
import ePub from 'epubjs';

// Import modules
import { 
	EPUB_READER_VIEW_TYPE, 
	HighlightData, 
	AnnotationData, 
	EpubReaderState,
	MAX_HIGHLIGHT_LENGTH,
	HIGHLIGHT_DISPLAY_DELAY,
	SUCCESS_FEEDBACK_DURATION,
	ERROR_FEEDBACK_DURATION
} from './types';
import { HighlightLogic } from './highlight-logic';
import { AnnotationParser } from './annotation-parser';
import { FileOperations } from './file-operations';
import { EpubNavigation } from './navigation';
import { UIOverlay } from './ui-overlay';
import { ReaderDisplay } from './reader-display';

// Re-export for main.ts
export { EPUB_READER_VIEW_TYPE };

export class EpubReaderView extends ItemView {
	private epubPath: string = '';
	private noteFilePath: string = '';
	private savedProgress: string | undefined;
	private pluginInstance: any = null;
	private book: any = null;
	private spineItems: any = null;
	private currentIndex: number = 0;
	private currentCfi: string = '';
	private highlightOverlay: HTMLElement | null = null;

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
		
		// Add keyboard navigation
		this.containerEl.tabIndex = 0; // Make it focusable
		this.containerEl.addEventListener('keydown', (e) => {
			// Only handle arrow keys and only when no text is selected
			const selection = window.getSelection();
			const hasSelection = selection && selection.toString().length > 0;
			
			if (!hasSelection && e.key === 'ArrowLeft') {
				this.handlePrevious();
				e.preventDefault();
			} else if (!hasSelection && e.key === 'ArrowRight') {
				this.handleNext();
				e.preventDefault();
			}
		});
		this.containerEl.focus();
		
		// Add text selection handling
		this.containerEl.addEventListener('mouseup', this.handleTextSelection.bind(this));
		this.containerEl.addEventListener('keyup', this.handleTextSelection.bind(this));
		
		// Hide overlay when clicking outside
		document.addEventListener('click', (e) => {
			if (this.highlightOverlay && !this.highlightOverlay.contains(e.target as Node)) {
				this.hideHighlightOverlay();
			}
		});
	}

	getState() {
		return {
			epubPath: this.epubPath,
			noteFile: this.noteFilePath,
			savedProgress: this.savedProgress
		};
	}

	async setState(state: any, result: any) {
		if (state?.epubPath) {
			this.epubPath = state.epubPath;
			this.noteFilePath = state.noteFile || '';
			this.savedProgress = state.savedProgress;
			this.pluginInstance = state.plugin;
			this.renderView();
			if (this.epubPath) {
				await this.loadEpub();
			}
		}
		return super.setState(state, result);
	}

	async setEpubPath(path: string) {
		this.epubPath = path;
		this.renderView();
		if (this.epubPath) {
			await this.loadEpub();
		}
	}

	private async loadEpub() {
		console.log('Loading EPUB:', this.epubPath);
		
		try {
			// Get the full path to the file
			const file = this.app.vault.getAbstractFileByPath(this.epubPath);
			if (!file || !(file instanceof TFile)) {
				console.error('EPUB file not found:', this.epubPath);
				return;
			}

			console.log('Loading EPUB...');
			
			// Read the file as ArrayBuffer
			const arrayBuffer = await this.app.vault.readBinary(file as TFile);
			console.log('EPUB file loaded as ArrayBuffer, size:', arrayBuffer.byteLength);

			// Create book object using ePub.js
			this.book = ePub(arrayBuffer);
			console.log('Book object created:', this.book);

			// Wait for book to be ready with timeout
			let readyResolved = false;
			const readyPromise = this.book.ready.then(() => { readyResolved = true; });
			
			await Promise.race([
				readyPromise,
				new Promise((_, reject) => setTimeout(() => {
					if (!readyResolved) reject(new Error('book.ready timeout'));
				}, 5000))
			]);

			console.log('Book loaded successfully:', this.book);
			
			// Get spine items
			this.spineItems = this.book.spine && this.book.spine.spineItems;
			if (!this.spineItems || this.spineItems.length === 0) {
				console.error('No spine items found!');
				return;
			}

			console.log('Spine items loaded:', this.spineItems.length, 'items');
			
			// Navigate to saved position or start from beginning
			if (this.savedProgress) {
				console.log('Navigating to saved CFI:', this.savedProgress);
				await this.navigateToCfi(this.savedProgress);
			} else {
				console.log('Starting at first chapter');
				await this.renderPage(0);
			}
			
		} catch (error) {
			console.error('Error loading EPUB:', error);
		}
	}

	private async renderPage(index: number) {
		console.log('renderPage called with index:', index);
		if (!this.spineItems) {
			console.error('spineItems is undefined');
			return;
		}
		if (index < 0 || index >= this.spineItems.length) {
			console.warn('Index out of bounds:', index);
			return;
		}
		
		this.currentIndex = index;
		const item = this.spineItems[index];
		console.log('Loading spine item:', item);
		
		try {
			await item.load(this.book.load.bind(this.book));
			const text = await item.render();
			const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
			const body = bodyMatch ? bodyMatch[1] : text;
			
			// Update the content area
			const contentDiv = this.containerEl.querySelector('#epub-content');
			if (contentDiv) {
				contentDiv.innerHTML = body;
			}
			
			this.currentCfi = item.cfiBase;
			console.log('Rendered html for index', index, 'CFI:', this.currentCfi);
			
			// Update navigation state
			this.updateNavigationState();
			
			// Load and display existing highlights for this page
			if (this.noteFilePath) {
				const annotations = await this.loadExistingHighlights();
				await this.displayHighlightsInReader(annotations);
			}
			
			// Save progress
			await this.saveProgress();
			
		} catch (e) {
			console.error('Error rendering page:', e);
		} finally {
			item.unload();
		}
	}

	private async navigateToCfi(cfi: string) {
		await EpubNavigation.navigateToCfi(cfi, this.spineItems, (index: number) => this.renderPage(index));
	}

	private async saveProgress() {
		await FileOperations.saveProgress(this.app, this.noteFilePath, this.currentCfi, this.pluginInstance);
	}

	private async saveHighlight(selection: Selection, config: any): Promise<void> {
		HighlightLogic.validateHighlightRequirements(this.noteFilePath, this.pluginInstance, this.spineItems);

		const range = selection.getRangeAt(0);
		const selectedText = HighlightLogic.validateSelectedText(selection.toString().trim());
		
		const cfi = await HighlightLogic.generateCfiFromRange(range, this.spineItems, this.currentIndex, this.book);
		const file = await FileOperations.getAndValidateNoteFile(this.app, this.noteFilePath);
		
		await this.removeExistingHighlight(cfi);
		
		const highlightData = HighlightLogic.createHighlightData(selectedText, cfi, config, this.currentIndex);
		const annotationData = HighlightLogic.createAnnotationData(highlightData, config);
		
		await FileOperations.insertHighlightIntoNote(this.app, file, highlightData, annotationData, config);
		
		console.debug('Highlight saved successfully:', highlightData);
	}

	private async removeExistingHighlight(cfi: string) {
		if (!this.noteFilePath) return;

		try {
			const file = this.app.vault.getAbstractFileByPath(this.noteFilePath);
			if (!file || !(file instanceof TFile)) {
				return;
			}

			const content = await this.app.vault.read(file);
			const lines = content.split('\n');
			
			// Find and remove existing annotation with same CFI
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.includes('<!-- EPUB_ANNOTATION:') && line.includes(`"cfi":"${cfi}"`)) {
					// Remove the annotation comment and the preceding highlight text
					lines.splice(i - 1, 2); // Remove highlight text and comment
					// Also remove empty line if present before the highlight
					if (i - 2 >= 0 && lines[i - 2].trim() === '') {
						lines.splice(i - 2, 1);
					}
					break;
				}
			}

			await this.app.vault.modify(file, lines.join('\n'));
		} catch (error) {
			console.error('Error removing existing highlight:', error);
		}
	}

	private async loadExistingHighlights(): Promise<AnnotationData[]> {
		return await AnnotationParser.loadExistingHighlights(this.app, this.noteFilePath);
	}

	private async displayHighlightsInReader(annotations: AnnotationData[]): Promise<void> {
		if (!this.spineItems || !annotations.length) return;
		
		const currentItem = this.spineItems[this.currentIndex];
		if (!currentItem) return;

		const currentSectionAnnotations = AnnotationParser.filterAnnotationsForCurrentSection(annotations, currentItem.cfiBase);

		if (currentSectionAnnotations.length === 0) return;

		AnnotationParser.scheduleHighlightDisplay(currentSectionAnnotations, (annotations) => ReaderDisplay.applyHighlightsToPage(annotations, this.containerEl));
	}

	// Reader display methods moved to ReaderDisplay module

	// File operations moved to FileOperations module

	private handleNext() {
		EpubNavigation.handleNext(this.currentIndex, this.spineItems, (index: number) => this.renderPage(index));
	}

	private handlePrevious() {
		EpubNavigation.handlePrevious(this.currentIndex, this.spineItems, (index: number) => this.renderPage(index));
	}

	private updateNavigationState() {
		EpubNavigation.updateNavigationState(this.currentIndex, this.spineItems, this.containerEl);
	}

	private renderView() {
		const container = this.containerEl.children[1];
		container.empty();
		
		if (this.epubPath) {
			// Add navigation controls
			const navDiv = container.createEl('div');
			navDiv.style.display = 'flex';
			navDiv.style.justifyContent = 'space-between';
			navDiv.style.alignItems = 'center';
			navDiv.style.padding = '0.5em';
			navDiv.style.borderBottom = '1px solid #ccc';
			
			const prevBtn = navDiv.createEl('button', { text: 'Previous' });
			prevBtn.id = 'prev-btn';
			prevBtn.onclick = () => this.handlePrevious();
			
			const positionSpan = navDiv.createEl('span');
			positionSpan.id = 'position-indicator';
			positionSpan.setText('');
			
			const nextBtn = navDiv.createEl('button', { text: 'Next' });
			nextBtn.id = 'next-btn';
			nextBtn.onclick = () => this.handleNext();
			
			// Add content area for EPUB content only
			const contentDiv = container.createEl('div');
			contentDiv.id = 'epub-content';
			contentDiv.style.width = '100%';
			contentDiv.style.height = 'calc(100% - 50px)'; // Account for navigation height
			contentDiv.style.padding = '1em';
			contentDiv.style.overflow = 'auto';
			contentDiv.style.userSelect = 'text'; // Explicitly enable text selection
			contentDiv.style.webkitUserSelect = 'text'; // For webkit browsers
			
		} else {
			container.createEl('div', { text: 'EPUB Reader - No EPUB file specified' });
		}
	}

	private handleTextSelection(event: Event) {
		UIOverlay.handleTextSelection(event, this.containerEl, (selection) => this.showHighlightOverlay(selection));
	}

	private showHighlightOverlay(selection: Selection | null) {
		this.highlightOverlay = UIOverlay.showHighlightOverlay(
			selection, 
			this.pluginInstance, 
			this.containerEl, 
			(e, sel, config, button) => this.handleHighlightButtonClick(e, sel, config, button)
		);
	}

	private showLoadingState(button: HTMLButtonElement): void {
		UIOverlay.showLoadingState(button);
	}

	private showSuccessState(button: HTMLButtonElement): void {
		UIOverlay.showSuccessState(button);
		setTimeout(() => {
			this.hideHighlightOverlay();
		}, SUCCESS_FEEDBACK_DURATION);
	}

	private showErrorState(button: HTMLButtonElement, config: any): void {
		UIOverlay.showErrorState(button, config);
	}

	private async handleHighlightButtonClick(e: Event, selection: Selection, config: any, button: HTMLButtonElement): Promise<void> {
		e.stopPropagation();
		
		this.showLoadingState(button);
		
		try {
			await this.saveHighlight(selection, config);
			this.showSuccessState(button);
		} catch (error) {
			console.error('Error saving highlight:', error);
			this.showErrorState(button, config);
		}
	}

	private hideHighlightOverlay() {
		UIOverlay.hideHighlightOverlay(this.containerEl);
		this.highlightOverlay = null;
	}

	async onClose() {
		// Clean up any resources
		this.hideHighlightOverlay();
	}

	private async navigateToHighlight(cfi: string) {
		await EpubNavigation.navigateToHighlight(cfi, this.spineItems, (index: number) => this.renderPage(index));
	}

	private clearDisplayedHighlights() {
		ReaderDisplay.clearDisplayedHighlights(this.containerEl);
	}
}
