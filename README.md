# X Video Tracker Chrome Extension

A Chrome extension that automatically tracks your progress on videos watched on Twitter/X, allowing you to resume playback where you left off.

## Features

- **Automatic Video Progress Tracking**: The extension automatically tracks your progress when watching videos on Twitter/X.
- **Resume Where You Left Off**: When revisiting a previously watched video, you'll be prompted to resume from where you left off.
- **Save Videos Manually**: You can manually add videos to your saved list for future viewing.
- **Manage Watched & Saved Videos**: Easily view, organize, and delete your watched and saved videos.

## Installation

### Developer Mode Installation

1. **Download/Clone this repository**:
   - Download the ZIP file and extract it, or clone the repository to your local machine.

2. **Open Chrome Extensions Page**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Alternatively, click on the three dots in the top right corner > More tools > Extensions

3. **Enable Developer Mode**:
   - Toggle on "Developer mode" in the top right corner of the Extensions page.

4. **Load the Extension**:
   - Click "Load unpacked"
   - Navigate to the folder where you extracted/cloned this repository and select the `x-video-tracker` folder
   - Click "Open"

5. **Verify Installation**:
   - The extension should now appear in your extensions list and be active.
   - You should see the extension icon in your Chrome toolbar.

## Usage

### Watching Videos on X

1. **Browse Twitter/X as usual**:
   - The extension automatically detects and monitors videos as you watch them.
   
2. **Resume Watching**:
   - When you revisit a video you've previously watched, you'll see a resume overlay.
   - Click "Resume from XX:XX" to continue from where you left off.
   - Click "Start from beginning" to watch from the start.

### Managing Videos via the Extension Popup

1. **Open the Extension Popup**:
   - Click the X Video Tracker icon in your Chrome toolbar to open the popup.

2. **View Watched Videos**:
   - The "Watched" tab shows all videos you've watched on Twitter/X.
   - See the progress, duration, and when you watched each video.

3. **Manage Saved Videos**:
   - Switch to the "Saved" tab to view and manage your manually saved videos.

4. **Add Videos Manually**:
   - In the "Saved" tab, scroll down to find the "Add Video" form.
   - Enter a video URL (required) and optional title.
   - Click "Add Video" to save it to your list.

5. **Watch or Delete Videos**:
   - Click "Watch" on any video to open it in a new tab.
   - Click "Delete" to remove it from your list.

## Privacy

- All video progress data is stored locally on your device. 
- The extension does not collect or send any personal data.
- The extension only runs on Twitter/X domains (twitter.com and x.com).

## Development

### Project Structure

```
x-video-tracker/
├── manifest.json        # Extension manifest file
├── src/
│   ├── content.js       # Content script for tracking videos on X
│   ├── background.js    # Background script for handling extension events
│   ├── popup.html       # HTML for the extension popup
│   ├── popup.js         # JavaScript for the extension popup
├── icons/
│   ├── icon16.png       # Extension icon (16×16)
│   ├── icon48.png       # Extension icon (48×48)
│   ├── icon128.png      # Extension icon (128×128)
```

### Known Limitations

- The extension might not work with all types of video players on X, especially if X changes their video player implementation.
- The extension only works on the Twitter/X website and not on embedded tweets or videos on other sites.

## License

This project is released under the MIT License. See the LICENSE file for details. 