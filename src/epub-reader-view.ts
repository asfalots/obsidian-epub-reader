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
	private epubStylesheets: string = ''; // Cache for extracted CSS

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
		this.epubStylesheets = ''; // Reset cached stylesheets for new EPUB
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
			
			// Extract stylesheets once and cache them
			await this.extractStylesheets();
			
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

	/**
	 * Extract stylesheets from the EPUB and cache them for reuse
	 */
	private async extractStylesheets(): Promise<void> {
		if (!this.book || !this.book.resources) {
			console.warn('Book or resources not available for stylesheet extraction');
			return;
		}

		try {
			let stylesheets = '';
			
			// Get all CSS resources from the manifest
			const resources = this.book.resources;
			console.debug('Resources object:', resources);
			console.debug('Manifest keys:', resources.manifest ? Object.keys(resources.manifest) : 'No manifest');
			
			if (resources.manifest) {
				for (const [path, resource] of Object.entries(resources.manifest)) {
					const resourceItem = resource as any;
					console.debug('Checking resource:', path, 'type:', resourceItem.type, 'href:', resourceItem.href);
					
					if (resourceItem.type === 'text/css' || path.endsWith('.css')) {
						try {
							const cssHref = resourceItem.href || path;
							console.debug('Loading stylesheet:', path, 'with href:', cssHref);
							
							// Try multiple methods to load the CSS
							let cssContent = null;
							
							// Method 1: Try resources.get() with href
							try {
								cssContent = await resources.get(cssHref);
								console.debug('resources.get(href) result:', typeof cssContent, cssContent?.constructor?.name);
							} catch (e1) {
								console.debug('resources.get(href) failed:', e1.message);
								
								// Method 2: Try book.load() with the href from resource
								try {
									cssContent = await this.book.load(cssHref);
									console.debug('book.load() with href result:', typeof cssContent);
								} catch (e2) {
									console.debug('book.load() with href failed:', e2.message);
									
									// Method 3: Try archive.getText() if available
									try {
										if (this.book.archive && this.book.archive.getText) {
											cssContent = await this.book.archive.getText(cssHref);
											console.debug('archive.getText() result:', typeof cssContent);
										}
									} catch (e3) {
										console.debug('archive.getText() failed:', e3.message);
									}
								}
							}
							
							if (cssContent) {
								// Convert to text if it's a blob or other format
								const cssText = typeof cssContent === 'string' ? cssContent : await this.extractTextFromResource(cssContent);
								if (cssText) {
									// Process URLs in CSS and scope to container
									const processedCss = this.processCssUrls(cssText, path);
									const scopedCss = this.scopeCssToContainer(processedCss);
									stylesheets += `<style type="text/css">\n/* From: ${path} */\n${scopedCss}\n</style>\n`;
									console.debug('Successfully loaded stylesheet:', path, 'length:', cssText.length);
								}
							}
						} catch (error) {
							console.warn('Failed to load stylesheet:', path, error);
						}
					}
				}
			}
			
			this.epubStylesheets = stylesheets;
			console.debug('Extracted stylesheets:', this.epubStylesheets.length, 'characters');
			
			// Fallback: Try loading CSS files directly from cssUrls array
			if (stylesheets === '' && resources.cssUrls && resources.cssUrls.length > 0) {
				console.debug('Fallback: Loading CSS from cssUrls array:', resources.cssUrls);
				for (const cssUrl of resources.cssUrls) {
					try {
						console.debug('Loading CSS file directly:', cssUrl);
						let cssContent = null;
						
						// Try different loading methods
						try {
							cssContent = await this.book.load(cssUrl);
							console.debug('Direct book.load() result:', typeof cssContent);
						} catch (e1) {
							try {
								if (this.book.archive && this.book.archive.getText) {
									cssContent = await this.book.archive.getText(cssUrl);
									console.debug('Direct archive.getText() result:', typeof cssContent);
								}
							} catch (e2) {
								console.debug('Direct loading failed for:', cssUrl, e2.message);
							}
						}
						
						if (cssContent) {
							const cssText = typeof cssContent === 'string' ? cssContent : await this.extractTextFromResource(cssContent);
							if (cssText) {
								const processedCss = this.processCssUrls(cssText, cssUrl);
								const scopedCss = this.scopeCssToContainer(processedCss);
								stylesheets += `<style type="text/css">\n/* From: ${cssUrl} */\n${scopedCss}\n</style>\n`;
								console.debug('Successfully loaded CSS from cssUrls:', cssUrl, 'length:', cssText.length);
							}
						}
					} catch (error) {
						console.warn('Failed to load CSS from cssUrls:', cssUrl, error);
					}
				}
				this.epubStylesheets = stylesheets;
				console.debug('Final extracted stylesheets:', this.epubStylesheets.length, 'characters');
			}
			
		} catch (error) {
			console.error('Error extracting stylesheets:', error);
			this.epubStylesheets = '';
		}
	}

	/**
	 * Extract text content from various resource formats
	 */
	private async extractTextFromResource(resource: any): Promise<string> {
		try {
			if (typeof resource === 'string') {
				return resource;
			}
			
			if (resource instanceof Blob) {
				return await resource.text();
			}
			
			if (resource instanceof ArrayBuffer) {
				return new TextDecoder().decode(resource);
			}
			
			// Try to convert other formats
			return String(resource);
		} catch (error) {
			console.warn('Failed to extract text from resource:', error);
			return '';
		}
	}

	/**
	 * Scope CSS rules to the epub-reader-content container
	 */
	private scopeCssToContainer(css: string): string {
		// Simple CSS scoping - prepend .epub-reader-content to all selectors
		// This prevents EPUB styles from affecting Obsidian's UI
		return css.replace(/([^{}]+)\{/g, (match, selector) => {
			// Skip @rules like @media, @import, @font-face
			if (selector.trim().startsWith('@')) {
				return match;
			}
			
			// Split multiple selectors and scope each one
			const selectors = selector.split(',').map((s: string) => {
				const trimmed = s.trim();
				// Don't scope pseudo-elements and already scoped selectors
				if (trimmed.includes('.epub-reader-content') || 
					trimmed.startsWith(':') || 
					trimmed.startsWith('::')) {
					return trimmed;
				}
				return `.epub-reader-content ${trimmed}`;
			}).join(', ');
			
			return `${selectors} {`;
		});
	}

	/**
	 * Process CSS to resolve relative URLs and make them absolute within the EPUB context
	 */
	private processCssUrls(css: string, cssPath: string): string {
		// Handle url() references in CSS (fonts, images, etc.)
		return css.replace(/url\(['"]?([^'"`)]+)['"]?\)/g, (match, url) => {
			// Skip absolute URLs and data URLs
			if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) {
				return match;
			}
			
			try {
				// Resolve relative URL against the CSS file's path
				const resolvedUrl = this.book.resolve(url, cssPath);
				return `url('${resolvedUrl}')`;
			} catch (error) {
				console.warn('Failed to resolve CSS URL:', url, 'in', cssPath, error);
				return match;
			}
		});
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
			
			// Update the content area with stylesheets and content
			const contentDiv = this.containerEl.querySelector('#epub-content');
			if (contentDiv) {
				// Apply cached stylesheets and body content
				contentDiv.innerHTML = this.epubStylesheets + body;
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
		
		// Refresh highlights to show the new one immediately
		const annotations = await this.loadExistingHighlights();
		await this.displayHighlightsInReader(annotations);
		
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
			
			// Clear and refresh highlights immediately to reflect the removal
			ReaderDisplay.clearDisplayedHighlights(this.containerEl);
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
			contentDiv.className = 'epub-reader-content'; // Add class for CSS scoping
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
