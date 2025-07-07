import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
// @ts-ignore
import ePub from 'epubjs';

export const EPUB_READER_VIEW_TYPE = 'epub-reader-view';

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
			
			// Save progress
			await this.saveProgress();
			
		} catch (e) {
			console.error('Error rendering page:', e);
		} finally {
			item.unload();
		}
	}

	private async navigateToCfi(cfi: string) {
		try {
			// Find which spine item contains this CFI
			for (let i = 0; i < this.spineItems.length; i++) {
				const item = this.spineItems[i];
				if (cfi.startsWith(item.cfiBase)) {
					console.log('Found CFI in spine item:', i, item.cfiBase);
					await this.renderPage(i);
					return;
				}
			}
			// If CFI not found, start from beginning
			console.warn('CFI not found, starting from beginning');
			await this.renderPage(0);
		} catch (error) {
			console.error('Error navigating to CFI:', error);
			await this.renderPage(0);
		}
	}

	private async saveProgress() {
		if (!this.noteFilePath || !this.pluginInstance) {
			console.log('No note file path or plugin instance, skipping progress save');
			return;
		}

		try {
			const file = this.app.vault.getAbstractFileByPath(this.noteFilePath);
			if (!file || !(file instanceof TFile)) {
				console.error('Note file not found:', this.noteFilePath);
				return;
			}

			// Read current file content
			const content = await this.app.vault.read(file);
			
			// Parse front-matter and update progress
			const lines = content.split('\n');
			let frontmatterStart = -1;
			let frontmatterEnd = -1;
			
			for (let i = 0; i < lines.length; i++) {
				if (lines[i].trim() === '---') {
					if (frontmatterStart === -1) {
						frontmatterStart = i;
					} else {
						frontmatterEnd = i;
						break;
					}
				}
			}
			
			const progressProperty = this.pluginInstance.settings.progressPropertyName;
			
			if (frontmatterStart !== -1 && frontmatterEnd !== -1) {
				// Update existing front-matter
				const frontmatterLines = lines.slice(frontmatterStart + 1, frontmatterEnd);
				let progressLineIndex = -1;
				
				for (let i = 0; i < frontmatterLines.length; i++) {
					if (frontmatterLines[i].startsWith(`${progressProperty}:`)) {
						progressLineIndex = i;
						break;
					}
				}
				
				if (progressLineIndex !== -1) {
					frontmatterLines[progressLineIndex] = `${progressProperty}: "${this.currentCfi}"`;
				} else {
					frontmatterLines.push(`${progressProperty}: "${this.currentCfi}"`);
				}
				
				const newLines = [
					...lines.slice(0, frontmatterStart + 1),
					...frontmatterLines,
					...lines.slice(frontmatterEnd)
				];
				
				await this.app.vault.modify(file, newLines.join('\n'));
				console.log('Progress saved with CFI:', this.currentCfi);
			}
			
		} catch (error) {
			console.error('Error saving progress:', error);
		}
	}

	private handleNext() {
		console.log('handleNext called');
		if (this.spineItems && this.currentIndex < this.spineItems.length - 1) {
			this.renderPage(this.currentIndex + 1);
		}
	}

	private handlePrevious() {
		console.log('handlePrevious called');
		if (this.spineItems && this.currentIndex > 0) {
			this.renderPage(this.currentIndex - 1);
		}
	}

	private updateNavigationState() {
		const prevBtn = this.containerEl.querySelector('#prev-btn') as HTMLButtonElement;
		const nextBtn = this.containerEl.querySelector('#next-btn') as HTMLButtonElement;
		const positionSpan = this.containerEl.querySelector('#position-indicator') as HTMLSpanElement;
		
		if (prevBtn && nextBtn && positionSpan && this.spineItems) {
			// Update position indicator
			positionSpan.setText(`${this.currentIndex + 1} / ${this.spineItems.length}`);
			
			// Update button states
			prevBtn.disabled = this.currentIndex === 0;
			nextBtn.disabled = this.currentIndex === this.spineItems.length - 1;
		}
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
		// Small delay to ensure selection is finalized
		setTimeout(() => {
			const selection = window.getSelection();
			const selectedText = selection?.toString().trim();
			
			if (selectedText && selectedText.length > 0) {
				this.showHighlightOverlay(selection);
			} else {
				this.hideHighlightOverlay();
			}
		}, 10);
	}

	private showHighlightOverlay(selection: Selection | null) {
		if (!selection || !this.pluginInstance) return;
		
		this.hideHighlightOverlay(); // Remove any existing overlay
		
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		
		// Create overlay element
		this.highlightOverlay = document.body.createDiv('highlight-overlay');
		
		// Calculate position - show above selection, but handle edge cases
		let top = rect.top + window.scrollY - 50;
		let left = rect.left + window.scrollX;
		
		// Ensure overlay doesn't go off-screen
		if (top < window.scrollY + 10) {
			top = rect.bottom + window.scrollY + 10; // Show below if no space above
		}
		if (left + 200 > window.innerWidth) {
			left = window.innerWidth - 210; // Adjust if too far right
		}
		if (left < 10) {
			left = 10; // Ensure minimum left margin
		}
		
		this.highlightOverlay.style.left = `${left}px`;
		this.highlightOverlay.style.top = `${top}px`;
		
		// Create buttons for each highlight config
		const configs = this.pluginInstance.settings.highlightConfigs;
		configs.forEach((config: any) => {
			const button = this.highlightOverlay!.createEl('button');
			button.className = 'highlight-btn';
			button.style.backgroundColor = config.color;
			button.title = config.name;
			button.textContent = config.name.charAt(0).toUpperCase(); // First letter as icon
			
			button.onclick = (e) => {
				e.stopPropagation();
				console.log(`Highlight with ${config.name}:`, selection.toString());
				// TODO: Implement actual highlighting functionality
				this.hideHighlightOverlay();
			};
		});
	}

	private hideHighlightOverlay() {
		if (this.highlightOverlay) {
			this.highlightOverlay.remove();
			this.highlightOverlay = null;
		}
	}

	async onClose() {
		// Clean up any resources
		this.hideHighlightOverlay();
	}
}
