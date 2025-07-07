import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
// @ts-ignore
import ePub from 'epubjs';

export const EPUB_READER_VIEW_TYPE = 'epub-reader-view';

const MAX_HIGHLIGHT_LENGTH = 5000;
const HIGHLIGHT_DISPLAY_DELAY = 100;
const SUCCESS_FEEDBACK_DURATION = 500;
const ERROR_FEEDBACK_DURATION = 1000;

interface HighlightData {
	text: string;
	cfi: string;
	color: string;
	timestamp: string;
	section: number;
}

interface AnnotationData {
	id: string;
	cfi: string;
	text: string;
	color: string;
	timestamp: number;
	type: string;
}

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
		try {
			// Find which spine item contains this CFI by finding the best match
			let bestMatch = -1;
			let bestMatchLength = 0;
			
			for (let i = 0; i < this.spineItems.length; i++) {
				const item = this.spineItems[i];
				const itemCfi = item.cfiBase;
				
				// Check if the saved CFI starts with this spine item's CFI
				// and if this is a better (longer) match than what we found before
				if (cfi.startsWith(itemCfi) && itemCfi.length > bestMatchLength) {
					bestMatch = i;
					bestMatchLength = itemCfi.length;
				}
			}
			
			if (bestMatch !== -1) {
				console.log('Found CFI in spine item:', bestMatch, this.spineItems[bestMatch].cfiBase);
				await this.renderPage(bestMatch);
			} else {
				// If CFI not found, start from beginning
				console.warn('CFI not found, starting from beginning');
				await this.renderPage(0);
			}
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

	private validateHighlightRequirements(): void {
		if (!this.noteFilePath || !this.pluginInstance || !this.spineItems) {
			throw new Error('Missing required components for saving highlight');
		}
	}

	private validateSelectedText(text: string): string {
		if (!text) {
			throw new Error('No text selected');
		}
		
		if (text.length > MAX_HIGHLIGHT_LENGTH) {
			console.warn('Selected text is very long, truncating to 5000 characters');
			return text.substring(0, MAX_HIGHLIGHT_LENGTH) + '...';
		}
		
		return text;
	}

	private async generateCfiFromRange(range: Range): Promise<string> {
		const currentItem = this.spineItems[this.currentIndex];
		if (!currentItem) {
			throw new Error('Current section not available');
		}

		try {
			await currentItem.load(this.book.load.bind(this.book));
			const cfi = currentItem.cfiFromRange(range);
			
			if (!cfi || typeof cfi !== 'string') {
				throw new Error('Invalid CFI generated');
			}
			
			console.debug('Generated CFI for highlight:', cfi);
			return cfi;
		} catch (error) {
			console.error('Error generating CFI:', error);
			throw new Error('Failed to generate position reference');
		} finally {
			currentItem.unload();
		}
	}

	private createHighlightData(text: string, cfi: string, config: any): HighlightData {
		return {
			text,
			cfi,
			color: config.color,
			timestamp: new Date().toISOString(),
			section: this.currentIndex + 1
		};
	}

	private createAnnotationData(highlightData: HighlightData, config: any): AnnotationData {
		const timestampMs = Date.now();
		return {
			id: timestampMs.toString(),
			cfi: highlightData.cfi,
			text: highlightData.text,
			color: config.color,
			timestamp: timestampMs,
			type: config.name.toLowerCase()
		};
	}

	private applyTemplate(template: string, data: HighlightData): string {
		return template
			.replace(/\{\{text\}\}/g, data.text)
			.replace(/\{\{cfi\}\}/g, data.cfi)
			.replace(/\{\{timestamp\}\}/g, data.timestamp)
			.replace(/\{\{section\}\}/g, data.section.toString())
			.replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
			.replace(/\{\{time\}\}/g, new Date().toLocaleTimeString());
	}

	private async saveHighlight(selection: Selection, config: any): Promise<void> {
		this.validateHighlightRequirements();

		const range = selection.getRangeAt(0);
		const selectedText = this.validateSelectedText(selection.toString().trim());
		
		const cfi = await this.generateCfiFromRange(range);
		const file = await this.getAndValidateNoteFile();
		
		await this.removeExistingHighlight(cfi);
		
		const highlightData = this.createHighlightData(selectedText, cfi, config);
		const annotationData = this.createAnnotationData(highlightData, config);
		
		await this.insertHighlightIntoNote(file, highlightData, annotationData, config);
		
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
		if (!this.noteFilePath) return [];

		try {
			const file = this.app.vault.getAbstractFileByPath(this.noteFilePath);
			if (!file || !(file instanceof TFile)) {
				return [];
			}

			const content = await this.app.vault.read(file);
			const annotations: AnnotationData[] = [];
			
			// Parse annotation comments
			const annotationRegex = /<!-- EPUB_ANNOTATION: (.+?) -->/g;
			let match;
			
			while ((match = annotationRegex.exec(content)) !== null) {
				try {
					const annotationData = JSON.parse(match[1]) as AnnotationData;
					annotations.push(annotationData);
				} catch (error) {
					console.warn('Failed to parse annotation:', match[1], error);
				}
			}
			
			console.debug('Loaded existing highlights:', annotations.length);
			return annotations;
		} catch (error) {
			console.error('Error loading existing highlights:', error);
			return [];
		}
	}

	private async displayHighlightsInReader(annotations: AnnotationData[]): Promise<void> {
		if (!this.spineItems || !annotations.length) return;
		
		const currentItem = this.spineItems[this.currentIndex];
		if (!currentItem) return;

		const currentSectionAnnotations = annotations.filter(annotation => 
			annotation.cfi.startsWith(currentItem.cfiBase)
		);

		if (currentSectionAnnotations.length === 0) return;

		setTimeout(() => this.applyHighlightsToPage(currentSectionAnnotations), HIGHLIGHT_DISPLAY_DELAY);
	}

	private async applyHighlightsToPage(annotations: AnnotationData[]): Promise<void> {
		try {
			for (const annotation of annotations) {
				await this.applyHighlightToContent(annotation);
			}
		} catch (error) {
			console.error('Error displaying highlights in reader:', error);
		}
	}

	private async applyHighlightToContent(annotation: AnnotationData) {
		const contentDiv = this.containerEl.querySelector('#epub-content');
		if (!contentDiv) return;

		try {
			// Create a simple text-based highlight by finding and wrapping the text
			// This is a simplified approach since we have the text content directly
			const walker = document.createTreeWalker(
				contentDiv,
				NodeFilter.SHOW_TEXT,
				null
			);

			const textNodes: Text[] = [];
			let node;
			while (node = walker.nextNode()) {
				textNodes.push(node as Text);
			}

			// Find text nodes that contain the annotation text
			for (const textNode of textNodes) {
				const nodeText = textNode.textContent || '';
				const annotationText = annotation.text;
				
				if (nodeText.includes(annotationText)) {
					const startIndex = nodeText.indexOf(annotationText);
					if (startIndex !== -1) {
						// Split the text node and wrap the matching part
						const range = document.createRange();
						range.setStart(textNode, startIndex);
						range.setEnd(textNode, startIndex + annotationText.length);
						
						this.applyHighlightStyling(range, annotation);
						break; // Only highlight the first occurrence
					}
				}
			}
		} catch (error) {
			console.warn('Error applying highlight to content:', error);
		}
	}

	private createHighlightSpan(annotation: AnnotationData): HTMLSpanElement {
		const span = document.createElement('span');
		span.style.backgroundColor = annotation.color;
		span.style.opacity = '0.3';
		span.style.cursor = 'pointer';
		span.title = `${annotation.type}: ${annotation.text}`;
		span.dataset.annotationId = annotation.id;
		span.dataset.cfi = annotation.cfi;
		
		span.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showAnnotationDetails(annotation);
		};
		
		return span;
	}

	private wrapRangeWithHighlight(range: Range, span: HTMLSpanElement): void {
		try {
			range.surroundContents(span);
		} catch (error) {
			const contents = range.extractContents();
			span.appendChild(contents);
			range.insertNode(span);
		}
	}

	private applyHighlightStyling(range: Range, annotation: AnnotationData): void {
		try {
			const highlightSpan = this.createHighlightSpan(annotation);
			this.wrapRangeWithHighlight(range, highlightSpan);
		} catch (error) {
			console.warn('Failed to apply highlight styling:', error);
		}
	}

	private showAnnotationDetails(annotation: AnnotationData) {
		// Create a simple modal or tooltip showing annotation details
		console.log('Annotation details:', annotation);
		// TODO: Implement a proper modal/tooltip UI for annotation details
	}

	private async getAndValidateNoteFile(): Promise<TFile> {
		const file = this.app.vault.getAbstractFileByPath(this.noteFilePath);
		if (!file || !(file instanceof TFile)) {
			throw new Error('Note file not found');
		}
		return file;
	}

	private findSectionIndex(lines: string[], sectionHeader: string): number {
		const sectionPattern = new RegExp(`^\\s*${sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
		return lines.findIndex(line => sectionPattern.test(line));
	}

	private createSectionIfMissing(lines: string[], sectionHeader: string): number {
		if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
			lines.push('');
		}
		lines.push(sectionHeader, '');
		return lines.length - 2;
	}

	private findInsertionIndex(lines: string[], sectionIndex: number): number {
		let insertIndex = sectionIndex + 1;
		
		while (insertIndex < lines.length && 
			   lines[insertIndex].trim() !== '' && 
			   !lines[insertIndex].match(/^#+\s/)) {
			insertIndex++;
		}
		
		return insertIndex;
	}

	private insertHighlightWithSpacing(lines: string[], insertIndex: number, highlightEntry: string, sectionIndex: number): void {
		if (insertIndex > sectionIndex + 1 && lines[insertIndex - 1].trim() !== '') {
			lines.splice(insertIndex, 0, '');
			insertIndex++;
		}

		lines.splice(insertIndex, 0, highlightEntry);
		
		if (insertIndex + 1 < lines.length && lines[insertIndex + 1].trim() !== '') {
			lines.splice(insertIndex + 1, 0, '');
		}
	}

	private async insertHighlightIntoNote(file: TFile, highlightData: HighlightData, annotationData: AnnotationData, config: any): Promise<void> {
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');
		
		let sectionIndex = this.findSectionIndex(lines, config.section);
		if (sectionIndex === -1) {
			sectionIndex = this.createSectionIfMissing(lines, config.section);
		}

		const highlightText = this.applyTemplate(config.template, highlightData);
		const annotationComment = `<!-- EPUB_ANNOTATION: ${JSON.stringify(annotationData)} -->`;
		const fullHighlightEntry = `${highlightText}\n${annotationComment}`;
		
		const insertIndex = this.findInsertionIndex(lines, sectionIndex);
		this.insertHighlightWithSpacing(lines, insertIndex, fullHighlightEntry, sectionIndex);
		
		await this.app.vault.modify(file, lines.join('\n'));
	}

	// ...existing code...

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
		
		this.hideHighlightOverlay();
		
		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		
		this.highlightOverlay = document.body.createDiv('highlight-overlay');
		
		let top = rect.top + window.scrollY - 50;
		let left = rect.left + window.scrollX;
		
		if (top < window.scrollY + 10) {
			top = rect.bottom + window.scrollY + 10;
		}
		if (left + 200 > window.innerWidth) {
			left = window.innerWidth - 210;
		}
		if (left < 10) {
			left = 10;
		}
		
		this.highlightOverlay.style.left = `${left}px`;
		this.highlightOverlay.style.top = `${top}px`;
		
		const configs = this.pluginInstance.settings.highlightConfigs;
		configs.forEach((config: any) => {
			const button = this.highlightOverlay!.createEl('button');
			button.className = 'highlight-btn';
			button.style.backgroundColor = config.color;
			button.title = config.name;
			button.textContent = config.name.charAt(0).toUpperCase();
			
			button.onclick = (e) => this.handleHighlightButtonClick(e, selection, config, button);
		});
	}

	private showLoadingState(button: HTMLButtonElement): void {
		button.textContent = '...';
		button.disabled = true;
	}

	private showSuccessState(button: HTMLButtonElement): void {
		button.textContent = '✓';
		button.style.backgroundColor = '#4caf50';
		setTimeout(() => {
			this.hideHighlightOverlay();
		}, SUCCESS_FEEDBACK_DURATION);
	}

	private showErrorState(button: HTMLButtonElement, config: any): void {
		button.textContent = '✗';
		button.style.backgroundColor = '#f44336';
		setTimeout(() => {
			button.textContent = config.name.charAt(0).toUpperCase();
			button.style.backgroundColor = config.color;
			button.disabled = false;
		}, ERROR_FEEDBACK_DURATION);
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
		if (this.highlightOverlay) {
			this.highlightOverlay.remove();
			this.highlightOverlay = null;
		}
	}

	async onClose() {
		// Clean up any resources
		this.hideHighlightOverlay();
	}

	private async navigateToHighlight(cfi: string) {
		try {
			await this.navigateToCfi(cfi);
			// TODO: In future, we could also scroll to the exact position within the page
			// using the CFI to identify the specific range and scroll to it
		} catch (error) {
			console.error('Error navigating to highlight:', error);
		}
	}

	private clearDisplayedHighlights() {
		const contentDiv = this.containerEl.querySelector('#epub-content');
		if (!contentDiv) return;

		// Remove all highlight spans
		const highlightSpans = contentDiv.querySelectorAll('span[data-annotation-id]');
		highlightSpans.forEach(span => {
			// Unwrap the span, keeping only its text content
			const parent = span.parentNode;
			if (parent) {
				while (span.firstChild) {
					parent.insertBefore(span.firstChild, span);
				}
				parent.removeChild(span);
			}
		});
	}
}
