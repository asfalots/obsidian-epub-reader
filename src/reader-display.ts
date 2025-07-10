import { AnnotationData } from './types';
import { HighlightLogic } from './highlight-logic';

export class ReaderDisplay {
	
	/**
	 * Applies highlights to the current page content using regex-based approach
	 */
	static async applyHighlightsToPage(annotations: AnnotationData[], containerEl: HTMLElement): Promise<void> {
		try {
			const contentDiv = containerEl.querySelector('#epub-content .epub-pagination-wrapper');
			if (!contentDiv) return;

			// Get current HTML content
			const currentHtml = contentDiv.innerHTML;
			
			// Apply highlights using regex-based approach
			const highlightedHtml = HighlightLogic.applyHighlightsToHtml(currentHtml, annotations);
			
			if (highlightedHtml !== currentHtml) {
				// Update the content with highlighted HTML
				contentDiv.innerHTML = highlightedHtml;
			}
			
		} catch (error) {
			console.error('Error displaying highlights in reader:', error);
		}
	}

	/**
	 * Clears all displayed highlights from the page
	 */
	static clearDisplayedHighlights(containerEl: HTMLElement): void {
		const contentDiv = containerEl.querySelector('#epub-content .epub-pagination-wrapper');
		if (!contentDiv) return;

		// Remove all mark tags with annotation data
		const currentHtml = contentDiv.innerHTML;
		const cleanedHtml = currentHtml.replace(/<mark[^>]*data-annotation-id[^>]*>(.*?)<\/mark>/gi, '$1');
		contentDiv.innerHTML = cleanedHtml;
	}

	/**
	 * Refreshes all highlights on the current page
	 */
	static async refreshHighlights(annotations: AnnotationData[], containerEl: HTMLElement): Promise<void> {
		// Clear existing highlights first
		this.clearDisplayedHighlights(containerEl);
		
		// Reapply all highlights
		await this.applyHighlightsToPage(annotations, containerEl);
	}

	/**
	 * Renders the main EPUB reader UI structure
	 */
	static renderReaderUI(containerEl: HTMLElement): void {
		containerEl.innerHTML = `
			<div id="epub-reader">
				<div id="epub-toolbar" style="padding: 10px; border-bottom: 1px solid var(--background-modifier-border); display: flex; justify-content: center; align-items: center; gap: 10px;">
					<button id="prev-btn">← Previous</button>
					<span id="chapter-info">Loading...</span>
					<button id="next-btn">Next →</button>
				</div>
				<div id="epub-content" style="padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.6; overflow-y: auto; height: calc(100vh - 100px);">
					<p>Loading EPUB...</p>
				</div>
			</div>
		`;
	}
}
