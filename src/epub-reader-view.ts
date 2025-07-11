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
	
	// Pagination properties
	private currentPage: number = 0;
	private totalPages: number = 0;
	private currentChapterContent: string = '';
	private viewportWidth: number = 0;
	private resizeTimeout: NodeJS.Timeout | null = null;
	private navigationMode: 'page' | 'chapter' = 'page';
	
	// Touch/swipe detection properties
	private touchStartX: number = 0;
	private touchStartY: number = 0;
	private touchStartTime: number = 0;
	private isSwipeInProgress: boolean = false;

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
		
		// Add text selection handling - different approach for mobile
		if (UIOverlay.isMobile()) {
			// Mobile-specific touch handling
			this.containerEl.addEventListener('touchend', this.handleTextSelection.bind(this));
			document.addEventListener('selectionchange', this.handleTextSelection.bind(this));
			
			// Add swipe gesture detection for navigation
			this.setupSwipeGestures();
		} else {
			// Desktop handling
			this.containerEl.addEventListener('mouseup', this.handleTextSelection.bind(this));
			this.containerEl.addEventListener('keyup', this.handleTextSelection.bind(this));
		}
		
		// Add resize observer to recalculate pagination when viewport changes
		const resizeObserver = new ResizeObserver(() => {
			if (this.currentChapterContent) {
				// Debounce resize events
				if (this.resizeTimeout) {
					clearTimeout(this.resizeTimeout);
				}
				this.resizeTimeout = setTimeout(() => {
					if (this.navigationMode === 'page') {
						this.setupPaginationAndRender();
					} else {
						this.setupChapterScrollAndRender();
					}
				}, 300);
			}
		});
		
		const contentDiv = this.containerEl.querySelector('#epub-content');
		if (contentDiv) {
			resizeObserver.observe(contentDiv);
		}
		
		// Hide overlay when clicking outside
		document.addEventListener('click', (e) => {
			if (this.highlightOverlay && !this.highlightOverlay.contains(e.target as Node)) {
				this.hideHighlightOverlay();
			}
		});
		
		// Update status bar visibility when view opens
		setTimeout(() => {
			if (this.pluginInstance) {
				this.pluginInstance.updateStatusBarVisibility();
			}
		}, 100);
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
			this.navigationMode = this.pluginInstance?.settings?.navigationMode || 'page';
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
				await this.navigateToSavedProgress(this.savedProgress);
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
					trimmed.includes('.epub-pagination-wrapper') ||
					trimmed.includes('.epub-chapter-wrapper') ||
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

	/**
	 * Process HTML content to resolve image URLs and other resources
	 */
	private async processHtmlContent(htmlContent: string): Promise<string> {
		let processedContent = htmlContent;
		
		// Debug: Log available resources in manifest
		if (this.book && this.book.resources && this.book.resources.manifest) {
			console.debug('Available resources in manifest:');
			for (const [path, resource] of Object.entries(this.book.resources.manifest)) {
				const resourceItem = resource as any;
				if (resourceItem.type && resourceItem.type.startsWith('image/')) {
					console.debug('Image resource:', path, 'href:', resourceItem.href, 'type:', resourceItem.type);
				}
			}
		}
		
		// Process image src attributes
		const imageMatches = [...processedContent.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi)];
		for (const match of imageMatches) {
			const [fullMatch, src] = match;
			
			// Skip absolute URLs and data URLs
			if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('blob:')) {
				continue;
			}
			
			try {
				let resolvedUrl = null;
				
				// First try to resolve the path using book.resolve() to get the absolute path
				if (this.book && this.book.resolve) {
					const absolutePath = this.book.resolve(src);
					console.debug('Resolved absolute path:', src, '->', absolutePath);
					
					// Then try to create URL using the resolved path
					if (this.book.resources && this.book.resources.createUrl) {
						try {
							resolvedUrl = await this.book.resources.createUrl(absolutePath);
							console.debug('Created URL from absolute path:', absolutePath, '->', resolvedUrl);
						} catch (e1) {
							console.debug('createUrl failed for absolute path:', absolutePath, e1.message);
							
							// Fallback: try with original relative path
							try {
								resolvedUrl = await this.book.resources.createUrl(src);
								console.debug('Created URL from relative path:', src, '->', resolvedUrl);
							} catch (e2) {
								console.debug('createUrl failed for relative path:', src, e2.message);
							}
						}
					}
				}
				
				if (resolvedUrl) {
					console.debug('Successfully resolved image URL:', src, '->', resolvedUrl);
					processedContent = processedContent.replace(fullMatch, fullMatch.replace(src, resolvedUrl));
				} else {
					console.warn('Could not resolve image URL:', src);
				}
			} catch (error) {
				console.warn('Failed to resolve image URL:', src, error);
			}
		}
		
		return processedContent;
	}

	private async renderPage(index: number, pageNumber: number = 0) {
		console.log('renderPage called with index:', index, 'page:', pageNumber);
		if (!this.spineItems) {
			console.error('spineItems is undefined');
			return;
		}
		if (index < 0 || index >= this.spineItems.length) {
			console.warn('Index out of bounds:', index);
			return;
		}
		
		// If switching chapters, reset pagination
		if (this.currentIndex !== index) {
			this.currentPage = 0;
			this.currentChapterContent = '';
		}
		
		this.currentIndex = index;
		this.currentPage = pageNumber;
		const item = this.spineItems[index];
		console.log('Loading spine item:', item);
		
		try {
			// Load chapter content if not cached
			if (!this.currentChapterContent) {
				await item.load(this.book.load.bind(this.book));
				const text = await item.render();
				const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
				const rawContent = bodyMatch ? bodyMatch[1] : text;
				// Process HTML content to resolve image URLs and other resources
				this.currentChapterContent = await this.processHtmlContent(rawContent);
			}
			
			// Setup rendering based on navigation mode
			if (this.navigationMode === 'page') {
				await this.setupPaginationAndRender();
			} else {
				await this.setupChapterScrollAndRender();
			}
			
			this.currentCfi = item.cfiBase;
			console.log('Rendered html for index', index, 'page', pageNumber, 'CFI:', this.currentCfi);
			
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

	/**
	 * Setup column-based pagination and render the current page
	 */
	private async setupPaginationAndRender(): Promise<void> {
		const contentDiv = this.containerEl.querySelector('#epub-content') as HTMLElement;
		if (!contentDiv) return;
		
		// Get viewport dimensions - use offsetWidth/Height to get actual content size
		// Get parent container size to avoid accumulating padding calculations
		const container = this.containerEl.children[1] as HTMLElement;
		this.viewportWidth = container.clientWidth - 32; // Only account for content div padding once
		
		// Calculate height based on whether navigation header is shown
		const hideNavigation = this.pluginInstance?.settings?.hideNavigationHeader || false;
		const navHeight = hideNavigation ? 0 : 50; // Navigation header height
		const viewportHeight = container.clientHeight - navHeight - 32; // Account for nav + content padding
		
		// Create temporary container to measure content
		const tempContainer = document.createElement('div');
		tempContainer.style.position = 'absolute';
		tempContainer.style.top = '-9999px';
		tempContainer.style.left = '-9999px';
		tempContainer.style.width = `${this.viewportWidth}px`;
		tempContainer.style.height = `${viewportHeight}px`;
		tempContainer.style.overflow = 'hidden';
		tempContainer.style.columnWidth = `${this.viewportWidth}px`;
		tempContainer.style.columnGap = '0px';
		tempContainer.className = 'epub-reader-content';
		
		// Add stylesheets and content to temp container
		tempContainer.innerHTML = this.epubStylesheets + this.currentChapterContent;
		
		document.body.appendChild(tempContainer);
		
		// Calculate total pages needed
		await new Promise(resolve => setTimeout(resolve, 100)); // Wait for layout
		const scrollWidth = tempContainer.scrollWidth;
		this.totalPages = Math.max(1, Math.ceil(scrollWidth / this.viewportWidth));
		
		console.log('Pagination calculated:', {
			viewportWidth: this.viewportWidth,
			scrollWidth,
			totalPages: this.totalPages,
			currentPage: this.currentPage
		});
		
		// Setup main content container with pagination
		contentDiv.style.width = `${this.viewportWidth}px`;
		contentDiv.style.height = `${viewportHeight}px`;
		contentDiv.style.overflow = 'hidden';
		contentDiv.style.position = 'relative';
		contentDiv.style.boxSizing = 'border-box';
		
		// Create inner wrapper for column layout
		const innerWrapper = document.createElement('div');
		innerWrapper.style.width = `${this.totalPages * this.viewportWidth}px`;
		innerWrapper.style.height = `${viewportHeight}px`;
		innerWrapper.style.columnWidth = `${this.viewportWidth}px`;
		innerWrapper.style.columnGap = '0px';
		innerWrapper.style.columnFill = 'auto';
		innerWrapper.style.position = 'absolute';
		innerWrapper.style.top = '0';
		innerWrapper.style.left = '0';
		innerWrapper.className = 'epub-pagination-wrapper';
		
		// Apply content to inner wrapper
		innerWrapper.innerHTML = this.epubStylesheets + this.currentChapterContent;
		
		// Clear and set content
		contentDiv.innerHTML = '';
		contentDiv.appendChild(innerWrapper);
		
		// Navigate to current page by adjusting scroll position
		const offsetX = this.currentPage * this.viewportWidth;
		contentDiv.scrollLeft = offsetX;
		
		// Clean up temp container
		document.body.removeChild(tempContainer);
	}

	/**
	 * Setup chapter scroll mode and render the content
	 */
	private async setupChapterScrollAndRender(): Promise<void> {
		const contentDiv = this.containerEl.querySelector('#epub-content') as HTMLElement;
		if (!contentDiv) return;
		
		// Get viewport dimensions
		const container = this.containerEl.children[1] as HTMLElement;
		const viewportWidth = container.clientWidth - 32;
		
		// Calculate height based on whether navigation header is shown
		const hideNavigation = this.pluginInstance?.settings?.hideNavigationHeader || false;
		const navHeight = hideNavigation ? 0 : 50; // Navigation header height
		const viewportHeight = container.clientHeight - navHeight - 32; // Account for nav + content padding
		
		// Setup content container for scrolling
		contentDiv.style.width = `${viewportWidth}px`;
		contentDiv.style.height = `${viewportHeight}px`;
		contentDiv.style.overflow = 'auto';
		contentDiv.style.position = 'relative';
		contentDiv.style.boxSizing = 'border-box';
		
		// Create wrapper for content
		const contentWrapper = document.createElement('div');
		contentWrapper.className = 'epub-chapter-wrapper';
		contentWrapper.style.width = '100%';
		contentWrapper.style.padding = '0';
		contentWrapper.style.lineHeight = '1.6';
		
		// Apply content to wrapper
		contentWrapper.innerHTML = this.epubStylesheets + this.currentChapterContent;
		
		// Clear and set content
		contentDiv.innerHTML = '';
		contentDiv.appendChild(contentWrapper);
		
		// Add scroll event listener for automatic progress saving
		let scrollTimeout: NodeJS.Timeout | null = null;
		contentDiv.addEventListener('scroll', () => {
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
			}
			scrollTimeout = setTimeout(async () => {
				await this.saveProgress();
			}, 1000); // Save progress 1 second after scroll stops
		});
		
		// For chapter mode, we don't have pages
		this.totalPages = 1;
		this.currentPage = 0;
	}

	private async navigateToCfi(cfi: string) {
		await EpubNavigation.navigateToCfi(cfi, this.spineItems, (index: number) => this.renderPage(index, 0));
	}

	private async saveProgress() {
		// Save progress based on navigation mode
		let progressCfi: string;
		if (this.navigationMode === 'page') {
			// Save actual page number for page mode
			progressCfi = `${this.currentCfi}@${this.currentPage}`;
		} else {
			// For chapter mode, save scroll position if available
			const contentDiv = this.containerEl.querySelector('#epub-content') as HTMLElement;
			const scrollTop = contentDiv ? contentDiv.scrollTop : 0;
			progressCfi = `${this.currentCfi}@scroll:${scrollTop}`;
		}
		await FileOperations.saveProgress(this.app, this.noteFilePath, progressCfi, this.pluginInstance);
	}

	/**
	 * Get the base CFI for the current chapter (without page/scroll info)
	 * This is used for highlights to ensure compatibility across navigation modes
	 */
	private getBaseCfi(): string {
		return this.currentCfi;
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
		if (this.navigationMode === 'page') {
			// Page-based navigation
			if (this.currentPage < this.totalPages - 1) {
				this.renderPage(this.currentIndex, this.currentPage + 1);
			} else {
				// Move to next chapter if available
				if (this.currentIndex < this.spineItems.length - 1) {
					this.currentChapterContent = '';
					this.renderPage(this.currentIndex + 1, 0);
				}
			}
		} else {
			// Chapter-based navigation
			if (this.currentIndex < this.spineItems.length - 1) {
				this.currentChapterContent = '';
				this.renderPage(this.currentIndex + 1, 0);
			}
		}
	}

	private handlePrevious() {
		if (this.navigationMode === 'page') {
			// Page-based navigation
			if (this.currentPage > 0) {
				this.renderPage(this.currentIndex, this.currentPage - 1);
			} else {
				// Move to previous chapter if available
				if (this.currentIndex > 0) {
					this.currentChapterContent = '';
					this.loadPreviousChapterLastPage();
				}
			}
		} else {
			// Chapter-based navigation
			if (this.currentIndex > 0) {
				this.currentChapterContent = '';
				this.renderPage(this.currentIndex - 1, 0);
			}
		}
	}

	/**
	 * Update the plugin's status bar with current position
	 */
	private updatePluginStatusBar() {
		if (!this.pluginInstance) {
			return;
		}
		
		let positionText = '';
		if (this.navigationMode === 'page') {
			const chapterInfo = `Ch ${this.currentIndex + 1}/${this.spineItems?.length || 0}`;
			const pageInfo = `Page ${this.currentPage + 1}/${this.totalPages}`;
			positionText = `${chapterInfo} - ${pageInfo}`;
		} else {
			positionText = `Chapter ${this.currentIndex + 1}/${this.spineItems?.length || 0}`;
		}
		
		this.pluginInstance.updateStatusBarPosition(positionText);
	}

	private updateNavigationState() {
		// Always update status bar with current position
		this.updatePluginStatusBar();
		
		// Early return if navigation header is hidden
		const hideNavigation = this.pluginInstance?.settings?.hideNavigationHeader || false;
		if (hideNavigation) return;
		
		const prevBtn = this.containerEl.querySelector('#prev-btn') as HTMLButtonElement;
		const nextBtn = this.containerEl.querySelector('#next-btn') as HTMLButtonElement;
		const positionSpan = this.containerEl.querySelector('#position-indicator') as HTMLElement;

		if (this.navigationMode === 'page') {
			// Previous button: disabled if at first page of first chapter
			const atFirstPage = this.currentIndex === 0 && this.currentPage === 0;
			if (prevBtn) prevBtn.disabled = atFirstPage;

			// Next button: disabled if at last page of last chapter
			const atLastPage = this.currentIndex === this.spineItems.length - 1 && this.currentPage === this.totalPages - 1;
			if (nextBtn) nextBtn.disabled = atLastPage;

			// Update position indicator to show page info
			if (positionSpan) {
				const chapterInfo = `Ch ${this.currentIndex + 1}/${this.spineItems.length}`;
				const pageInfo = `Page ${this.currentPage + 1}/${this.totalPages}`;
				positionSpan.textContent = `${chapterInfo} - ${pageInfo}`;
			}
		} else {
			// Chapter-based navigation
			// Previous button: disabled if at first chapter
			const atFirstChapter = this.currentIndex === 0;
			if (prevBtn) prevBtn.disabled = atFirstChapter;

			// Next button: disabled if at last chapter
			const atLastChapter = this.currentIndex === this.spineItems.length - 1;
			if (nextBtn) nextBtn.disabled = atLastChapter;

			// Update position indicator to show chapter info only
			if (positionSpan) {
				positionSpan.textContent = `Chapter ${this.currentIndex + 1}/${this.spineItems.length}`;
			}
		}
		
		// Update the plugin's status bar with the current position
		this.updatePluginStatusBar();
	}

	private renderView() {
		const container = this.containerEl.children[1];
		container.empty();
		
		if (this.epubPath) {
			const hideNavigation = this.pluginInstance?.settings?.hideNavigationHeader || false;
			const navigationPosition = this.pluginInstance?.settings?.navigationHeaderPosition || 'top';
			
			// Create navigation controls
			let navDiv: HTMLElement | null = null;
			if (!hideNavigation) {
				navDiv = document.createElement('div');
				navDiv.style.display = 'flex';
				navDiv.style.justifyContent = 'space-between';
				navDiv.style.alignItems = 'center';
				navDiv.style.padding = '0.5em';
				
				// Apply border based on position
				if (navigationPosition === 'top') {
					navDiv.style.borderBottom = '1px solid #ccc';
				} else {
					navDiv.style.borderTop = '1px solid #ccc';
				}
				
				const prevBtn = navDiv.createEl('button', { text: 'Previous' });
				prevBtn.id = 'prev-btn';
				prevBtn.onclick = () => this.handlePrevious();
				
				const positionSpan = navDiv.createEl('span');
				positionSpan.id = 'position-indicator';
				positionSpan.setText('');
				
				const nextBtn = navDiv.createEl('button', { text: 'Next' });
				nextBtn.id = 'next-btn';
				nextBtn.onclick = () => this.handleNext();
			}
			
			// Add content area for EPUB content
			const contentDiv = container.createEl('div');
			contentDiv.id = 'epub-content';
			contentDiv.className = 'epub-reader-content'; // Add class for CSS scoping
			contentDiv.style.width = '100%';
			// Adjust height based on whether navigation is shown
			contentDiv.style.height = hideNavigation ? '100%' : 'calc(100% - 50px)';
			contentDiv.style.padding = '1em';
			contentDiv.style.overflow = 'auto';
			contentDiv.style.userSelect = 'text'; // Explicitly enable text selection
			contentDiv.style.webkitUserSelect = 'text'; // For webkit browsers
			
			// Add navigation div to container based on position
			if (!hideNavigation && navDiv) {
				if (navigationPosition === 'top') {
					// Insert navigation before content
					container.insertBefore(navDiv, contentDiv);
				} else {
					// Append navigation after content
					container.appendChild(navDiv);
				}
			}
			
			// Setup swipe gestures for mobile after content div is created
			if (UIOverlay.isMobile()) {
				console.debug('Setting up swipe gestures for mobile');
				// Use setTimeout to ensure DOM is ready
				setTimeout(() => {
					this.setupSwipeGestures();
				}, 100);
			} else {
				console.debug('Not mobile, skipping swipe gestures');
			}
			
		} else {
			container.createEl('div', { text: 'EPUB Reader - No EPUB file specified' });
		}
	}

	private handleTextSelection(event: Event) {
		// Prevent default behavior on mobile text selection, but not on buttons
		if (UIOverlay.isMobile() && event.type === 'touchend') {
			const target = event.target as HTMLElement;
			// Don't prevent default if touching buttons or interactive elements
			if (!target.closest('button') && !target.closest('[role="button"]') && !target.closest('a')) {
				event.preventDefault();
			}
		}
		
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
		
		// Clear resize timeout
		if (this.resizeTimeout) {
			clearTimeout(this.resizeTimeout);
			this.resizeTimeout = null;
		}
		
		// Update status bar visibility when view closes
		if (this.pluginInstance) {
			this.pluginInstance.updateStatusBarVisibility();
		}
	}

	private async navigateToHighlight(cfi: string) {
		await EpubNavigation.navigateToHighlight(cfi, this.spineItems, (index: number) => this.renderPage(index, 0));
	}

	private clearDisplayedHighlights() {
		ReaderDisplay.clearDisplayedHighlights(this.containerEl);
	}

	/**
	 * Load previous chapter and navigate to its last page
	 */
	private async loadPreviousChapterLastPage(): Promise<void> {
		try {
			const prevIndex = this.currentIndex - 1;
			const item = this.spineItems[prevIndex];
			
			// Load previous chapter content
			await item.load(this.book.load.bind(this.book));
			const text = await item.render();
			const bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
			const rawContent = bodyMatch ? bodyMatch[1] : text;
			this.currentChapterContent = await this.processHtmlContent(rawContent);
			
			// Calculate total pages for this chapter
			const contentDiv = this.containerEl.querySelector('#epub-content') as HTMLElement;
			if (!contentDiv) return;
			
			const container = this.containerEl.children[1] as HTMLElement;
			const viewportWidth = container.clientWidth - 32;
			
			// Calculate height based on whether navigation header is shown
			const hideNavigation = this.pluginInstance?.settings?.hideNavigationHeader || false;
			const navHeight = hideNavigation ? 0 : 50; // Navigation header height
			const viewportHeight = container.clientHeight - navHeight - 32; // Account for nav + content padding
			
			// Create temporary container to measure content
			const tempContainer = document.createElement('div');
			tempContainer.style.position = 'absolute';
			tempContainer.style.top = '-9999px';
			tempContainer.style.left = '-9999px';
			tempContainer.style.width = `${viewportWidth}px`;
			tempContainer.style.height = `${viewportHeight}px`;
			tempContainer.style.overflow = 'hidden';
			tempContainer.style.columnWidth = `${viewportWidth}px`;
			tempContainer.style.columnGap = '0px';
			tempContainer.className = 'epub-reader-content';
			
			tempContainer.innerHTML = this.epubStylesheets + this.currentChapterContent;
			document.body.appendChild(tempContainer);
			
			await new Promise(resolve => setTimeout(resolve, 100));
			const scrollWidth = tempContainer.scrollWidth;
			const totalPages = Math.max(1, Math.ceil(scrollWidth / viewportWidth));
			
			document.body.removeChild(tempContainer);
			item.unload();
			
			// Navigate to last page of previous chapter
			this.renderPage(prevIndex, totalPages - 1);
			
		} catch (error) {
			console.error('Error loading previous chapter last page:', error);
		}
	}

	/**
	 * Navigate to saved progress which may include page position
	 */
	private async navigateToSavedProgress(savedProgress: string): Promise<void> {
		try {
			let cfi = savedProgress;
			let savedPageNumber = 0;
			let savedScrollTop = 0;
			
			// Check if saved progress includes position information
			if (savedProgress.includes('@')) {
				const parts = savedProgress.split('@');
				cfi = parts[0];
				const positionValue = parts[1] || '';
				
				if (positionValue.startsWith('scroll:')) {
					// Scroll position for chapter mode
					savedScrollTop = parseFloat(positionValue.replace('scroll:', '')) || 0;
				} else {
					// Page number for page mode
					const pageValue = parseFloat(positionValue) || 0;
					
					// If pageValue is < 1, it's the old ratio format, otherwise it's page number
					if (pageValue < 1) {
						// Old ratio format - convert to page number
						savedPageNumber = Math.round(pageValue * 100); // Rough conversion
					} else {
						// New page number format
						savedPageNumber = Math.floor(pageValue);
					}
				}
			}
			
			// First navigate to the chapter
			await EpubNavigation.navigateToCfi(cfi, this.spineItems, async (index: number) => {
				// Load the chapter and setup based on navigation mode
				await this.renderPage(index, 0);
				
				if (this.navigationMode === 'page') {
					// Page-based navigation - navigate to saved page
					if (savedPageNumber > 0 && this.totalPages > 1) {
						const clampedPage = Math.min(Math.max(0, savedPageNumber), this.totalPages - 1);
						console.log('Navigating to saved page:', {
							savedPageNumber,
							totalPages: this.totalPages,
							clampedPage
						});
						await this.renderPage(index, clampedPage);
					}
				} else {
					// Chapter-based navigation - restore scroll position
					if (savedScrollTop > 0) {
						setTimeout(() => {
							const contentDiv = this.containerEl.querySelector('#epub-content') as HTMLElement;
							if (contentDiv) {
								contentDiv.scrollTop = savedScrollTop;
								console.log('Restored scroll position:', savedScrollTop);
							}
						}, 100); // Small delay to ensure content is rendered
					}
				}
			});
			
		} catch (error) {
			console.error('Error navigating to saved progress:', error);
			await this.renderPage(0);
		}
	}

	/**
	 * Updates the navigation mode and refreshes the view
	 */
	async updateNavigationMode(newMode: 'page' | 'chapter'): Promise<void> {
		if (this.navigationMode === newMode) return;
		
		this.navigationMode = newMode;
		
		// If we have content loaded, re-render with the new mode
		if (this.currentChapterContent && this.spineItems) {
			await this.renderPage(this.currentIndex, 0);
		}
	}

	/**
	 * Update settings and refresh the view
	 */
	updateSettingsAndRefresh(newSettings: any): void {
		if (!this.pluginInstance) return;
		
		// Update plugin instance settings
		this.pluginInstance.settings = newSettings;
		this.navigationMode = newSettings?.navigationMode || 'page';
		
		// Always re-render when settings change to ensure UI is up-to-date
		this.renderView();
		
		// If we have content loaded, re-render the current page
		if (this.currentChapterContent && this.spineItems) {
			// Use setTimeout to ensure DOM update happens after renderView
			setTimeout(() => {
				this.renderPage(this.currentIndex, this.currentPage);
			}, 100);
		}
	}

	/**
	 * Setup swipe gesture detection for mobile navigation
	 */
	private setupSwipeGestures(): void {
		const contentDiv = this.containerEl.querySelector('#epub-content') as HTMLElement;
		if (!contentDiv) {
			console.debug('No content div found for swipe gestures');
			return;
		}
		
		console.debug('Setting up swipe gestures on content div');
		
		// Disable Obsidian's global touch gestures more aggressively
		this.containerEl.style.touchAction = 'pan-y'; // Allow vertical scrolling but prevent horizontal gestures
		this.containerEl.style.userSelect = 'none'; // Prevent text selection issues
		
		// Add a high-priority capture event to block Obsidian's gestures
		this.containerEl.addEventListener('touchstart', (e: TouchEvent) => {
			// Only prevent if this looks like a horizontal gesture
			if (e.touches.length === 1) {
				const touch = e.touches[0];
				// Store for later comparison
				(this.containerEl as any)._startX = touch.clientX;
				(this.containerEl as any)._startY = touch.clientY;
			}
		}, { capture: true, passive: false });
		
		this.containerEl.addEventListener('touchmove', (e: TouchEvent) => {
			if (e.touches.length === 1 && (this.containerEl as any)._startX !== undefined) {
				const touch = e.touches[0];
				const deltaX = Math.abs(touch.clientX - (this.containerEl as any)._startX);
				const deltaY = Math.abs(touch.clientY - (this.containerEl as any)._startY);
				
				// If it's more horizontal than vertical and significant, block Obsidian
				if (deltaX > deltaY && deltaX > 20) {
					e.preventDefault();
					e.stopPropagation();
					console.debug('Blocking Obsidian gesture, deltaX:', deltaX);
				}
			}
		}, { capture: true, passive: false });
		
		// Add event listeners to both container and content to catch all touches
		const elements = [this.containerEl, contentDiv];
		
		elements.forEach(element => {
			element.addEventListener('touchstart', (e) => {
				this.handleTouchStart(e as TouchEvent);
			}, { passive: false });
			
			element.addEventListener('touchmove', (e) => {
				this.handleTouchMove(e as TouchEvent);
			}, { passive: false });
			
			element.addEventListener('touchend', (e) => {
				this.handleTouchEnd(e as TouchEvent);
			}, { passive: false });
		});
		
		console.debug('Swipe gesture event listeners added');
	}

	/**
	 * Handle touch start for swipe detection
	 */
	private handleTouchStart(e: TouchEvent): void {
		if (e.touches.length !== 1) return;
		
		// Don't start swipe detection if touching overlay buttons or interactive elements
		const target = e.target as HTMLElement;
		if (target.closest('button') || target.closest('[role="button"]') || target.closest('.highlight-overlay')) {
			return;
		}
		
		const touch = e.touches[0];
		this.touchStartX = touch.clientX;
		this.touchStartY = touch.clientY;
		this.touchStartTime = Date.now();
		this.isSwipeInProgress = false;
		
		console.debug('Touch start at:', this.touchStartX, this.touchStartY);
	}

	/**
	 * Handle touch move to distinguish between swipe and scroll
	 */
	private handleTouchMove(e: TouchEvent): void {
		if (e.touches.length !== 1) return;
		
		const touch = e.touches[0];
		const deltaX = Math.abs(touch.clientX - this.touchStartX);
		const deltaY = Math.abs(touch.clientY - this.touchStartY);
		
		// If the movement is more horizontal than vertical, it might be a swipe
		if (deltaX > deltaY && deltaX > 30) {
			this.isSwipeInProgress = true;
			console.debug('Swipe in progress detected, deltaX:', deltaX, 'deltaY:', deltaY);
			
			// Prevent Obsidian's menu from appearing during horizontal swipes
			e.preventDefault();
			e.stopPropagation();
		}
	}

	/**
	 * Handle touch end to detect swipe gestures
	 */
	private handleTouchEnd(e: TouchEvent): void {
		const touch = e.changedTouches[0];
		const deltaX = touch.clientX - this.touchStartX;
		const deltaY = touch.clientY - this.touchStartY;
		const deltaTime = Date.now() - this.touchStartTime;
		
		// Swipe detection parameters
		const minSwipeDistance = 50;
		const maxSwipeTime = 500;
		const maxVerticalDistance = 100;
		
		// Check if it's a valid swipe
		const isHorizontalSwipe = Math.abs(deltaX) > minSwipeDistance;
		const isWithinTimeLimit = deltaTime < maxSwipeTime;
		const isNotTooVertical = Math.abs(deltaY) < maxVerticalDistance;
		
		// Check if there's text selection (don't navigate if user is selecting text)
		const selection = window.getSelection();
		const hasTextSelection = selection && selection.toString().length > 0;
		
		if (isHorizontalSwipe && isWithinTimeLimit && isNotTooVertical && !hasTextSelection) {
			// Prevent any default behavior
			e.preventDefault();
			e.stopPropagation();
			
			console.debug('Swipe detected:', deltaX > 0 ? 'right' : 'left', 'deltaX:', deltaX);
			
			if (deltaX > 0) {
				// Swipe right - go to previous page/chapter
				this.handlePrevious();
			} else {
				// Swipe left - go to next page/chapter
				this.handleNext();
			}
		}
		
		this.isSwipeInProgress = false;
	}
}
