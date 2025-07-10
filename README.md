# EPUB Annotator

An advanced EPUB reading plugin for Obsidian that seamlessly integrates e-book reading with note-taking and annotation workflows.

## Features

- **EPUB Reading**: Read EPUB files directly within Obsidian using the powerful EPUB.js library
- **Smart Highlighting**: Select and highlight text with multiple color options that automatically save to your notes
- **Note Integration**: Associate EPUB files with markdown notes using Obsidian properties
- **Structured Annotations**: Highlights are saved in human-readable format with configurable templates
- **CFI-based Positioning**: Uses EPUB Canonical Fragment Identifiers for precise text location tracking
- **Color-coded Sections**: Map different highlight colors to specific sections in your notes
- **Persistent Highlights**: All highlights are preserved and reloaded when reopening EPUBs

## How to Use

### 1. Install and Enable
1. In Obsidian, open **Settings → Community Plugins → Browse**.
2. Search for **EPUB Annotator** and click **Install**.
3. Click **Enable** to activate the plugin.
4. Configure highlight colors and note sections in the plugin settings.

### 2. Reading EPUBs
1. Open an EPUB file in Obsidian
2. The plugin will render the EPUB in a custom reader view
3. Navigate through pages using the built-in controls

### 3. Creating Highlights
1. Select any text in the EPUB reader
2. Choose a highlight color from the overlay menu
3. The highlight is automatically saved to the associated markdown note
4. Add optional annotation text to enhance your notes

### 4. Note Association
Configure in plugin settings how EPUB files are linked to markdown notes using Obsidian properties. This allows seamless integration between your reading and note-taking workflow.

## Configuration

### Highlight Colors and Sections
In the plugin settings, you can:
- Define custom highlight colors
- Map each color to a specific section in your notes
- Customize annotation templates with variables like `{{text}}`, `{{cfi}}`, `{{timestamp}}`

### Default Highlight Types
- **Important** (Yellow): For key passages and important information
- **Question** (Orange): For content that raises questions or needs clarification  
- **Note** (Blue): For general observations and thoughts


## Technical Details

### EPUB.js Integration
This plugin uses [EPUB.js](http://epubjs.org/documentation/0.3/) for EPUB parsing and rendering. Key features:
- CFI (Canonical Fragment Identifier) for precise text positioning
- Section-based rendering for performance
- Cross-platform compatibility

### Annotation Storage
Highlights are stored as HTML comments in markdown files with structured JSON data:
```html
> Highlighted text appears here
<!-- EPUB_ANNOTATION: {"id":"123","cfi":"epubcfi(...)","text":"...","color":"#4caf50"} -->
```

## Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

### Reporting Issues
When reporting bugs, please include:
- Obsidian version
- Plugin version  
- EPUB file details (if relevant)
- Steps to reproduce
- Expected vs actual behavior

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- Built with [EPUB.js](https://github.com/futurepress/epub.js/) for EPUB parsing and rendering
- Developed for the [Obsidian](https://obsidian.md) knowledge management platform
- Inspired by the need for seamless reading and note-taking integration
