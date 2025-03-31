// Content script for X Video Tracker

// Configuration
const SAVE_INTERVAL_MS = 3000; // Save progress more frequently (every 3 seconds)
const SELECTOR_VIDEO = 'video'; // CSS selector for video elements on X
const PROGRESS_THRESHOLD = 2; // Lower threshold to 2 seconds
const DEBUG = true; // Enable console logging
const DEFAULT_FOLDER = 'Watch Later'; // Default folder for videos

// Variables
let videoElements = [];
let progressData = {};
let saveIntervalId = null;
let pendingVideoCheck = false;

// Log messages in debug mode
function log(...args) {
  if (DEBUG) {
    console.log('[X Video Tracker]', ...args);
  }
}

// Generate a unique ID for the video based on its source or post context
function getVideoId(videoElement) {
  const videoSrc = videoElement.src || videoElement.querySelector('source')?.src;
  
  // Try to find the post ID from the URL or DOM
  let postId = '';
  
  // Check URL first - most reliable method
  const urlMatch = window.location.href.match(/\/status\/(\d+)/);
  if (urlMatch && urlMatch[1]) {
    postId = urlMatch[1];
    log('Found post ID from URL:', postId);
    return `x-video-${postId}`;
  }
  
  // Try to extract from closest tweet container
  const tweetContainer = videoElement.closest('[data-testid="tweet"]');
  if (tweetContainer) {
    const tweetLink = tweetContainer.querySelector('a[href*="/status/"]');
    if (tweetLink) {
      const match = tweetLink.href.match(/\/status\/(\d+)/);
      if (match && match[1]) {
        postId = match[1];
        log('Found post ID from tweet container:', postId);
        return `x-video-${postId}`;
      }
    }
  }
  
  // If we have video source, use a hash of that
  if (videoSrc) {
    log('Using video source for ID');
    return `x-video-${btoa(videoSrc).substr(0, 20)}`;
  }
  
  // Last resort: use page URL and position
  log('Using fallback ID method');
  const pageUrl = window.location.href;
  const videoIndex = Array.from(document.querySelectorAll(SELECTOR_VIDEO)).indexOf(videoElement);
  return `x-video-${btoa(pageUrl + videoIndex).substr(0, 20)}`;
}

// Try to find a thumbnail image for the video
function findThumbnailForVideo(videoEl) {
  try {
    // Method 1: Check if the video has a poster attribute
    if (videoEl.poster) {
      return videoEl.poster;
    }
    
    // Method 2: Look for an image near the video in the tweet
    const tweetContainer = videoEl.closest('[data-testid="tweet"]');
    if (tweetContainer) {
      // Check for images in the tweet that might be thumbnails
      const nearbyImages = tweetContainer.querySelectorAll('img');
      for (const img of nearbyImages) {
        // Skip small icons and profile pictures
        if (img.width > 60 && img.height > 60 && !img.src.includes('profile_images')) {
          return img.src;
        }
      }
    }
    
    // Method 3: Try to find image from media container
    const mediaContainer = videoEl.closest('div[data-testid="videoPlayer"]') || 
                           videoEl.closest('div[role="group"]');
    if (mediaContainer) {
      const mediaImg = mediaContainer.querySelector('img:not([data-testid="profileImage"])');
      if (mediaImg && mediaImg.src) {
        return mediaImg.src;
      }
    }
    
    // Method 4: Generate a thumbnail using canvas (only if video has loaded)
    if (videoEl.readyState >= 2) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 169; // 16:9 aspect ratio
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPEG
      } catch (e) {
        log('Failed to generate thumbnail from canvas:', e);
      }
    }
    
    return null;
  } catch (e) {
    log('Error finding thumbnail:', e);
    return null;
  }
}

// Save the current progress of all tracked videos
function saveVideoProgress() {
  videoElements.forEach(videoEl => {
    // Skip videos that aren't loaded or don't have duration
    if (!videoEl.duration || isNaN(videoEl.duration) || videoEl.duration === 0) {
      return;
    }
    
    // Only save progress if the video has been watched for some time
    if (videoEl.currentTime > PROGRESS_THRESHOLD) {
      const videoId = getVideoId(videoEl);
      
      // Get page title or tweet text for better identification
      let title = document.title;
      const tweetContainer = videoEl.closest('[data-testid="tweet"]');
      if (tweetContainer) {
        const tweetText = tweetContainer.querySelector('[data-testid="tweetText"]');
        if (tweetText) {
          title = tweetText.textContent.substring(0, 100) + '...';
        }
      }
      
      // Try to get thumbnail
      const thumbnailUrl = findThumbnailForVideo(videoEl);
      
      // Get the folder (default to Watch Later instead of Uncategorized)
      let folder = DEFAULT_FOLDER;
      
      // Check if we already have data for this video to preserve folder
      if (progressData[videoId] && progressData[videoId].folder) {
        folder = progressData[videoId].folder;
      }
      
      progressData[videoId] = {
        currentTime: videoEl.currentTime,
        duration: videoEl.duration,
        timestamp: Date.now(),
        url: window.location.href,
        title: title,
        thumbnailUrl: thumbnailUrl,
        folder: folder
      };
      
      // Save to Chrome storage
      chrome.storage.local.set({ [videoId]: progressData[videoId] }, () => {
        if (chrome.runtime.lastError) {
          log('Error saving progress:', chrome.runtime.lastError);
        } else {
          log('Saved progress for video', videoId, 'at', videoEl.currentTime.toFixed(1), 'seconds');
        }
      });
    }
  });
}

// Add resume overlay to a video that has saved progress
function addResumeOverlay(videoEl, savedData) {
  // Don't add overlay if:
  // - It's already near the saved position
  // - We're near the end of the video
  // - The video has invalid duration
  if (
    Math.abs(videoEl.currentTime - savedData.currentTime) < 3 ||
    savedData.currentTime > savedData.duration - 5 ||
    !savedData.duration ||
    savedData.duration <= 0
  ) {
    return;
  }
  
  log(`Adding resume overlay for video at ${savedData.currentTime.toFixed(1)}/${savedData.duration.toFixed(1)} seconds`);
  
  // Create resume overlay
  const overlay = document.createElement('div');
  overlay.classList.add('x-video-tracker-overlay');
  overlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  
  // Create resume button
  const resumeBtn = document.createElement('button');
  resumeBtn.textContent = 'Resume from ' + Math.floor(savedData.currentTime / 60) + ':' + 
                          (Math.floor(savedData.currentTime % 60)).toString().padStart(2, '0');
  resumeBtn.style.cssText = `
    background: #1DA1F2;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: bold;
    cursor: pointer;
    margin: 10px;
  `;
  
  // Create restart button
  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Start from beginning';
  restartBtn.style.cssText = `
    background: transparent;
    color: white;
    border: 1px solid white;
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: bold;
    cursor: pointer;
    margin: 10px;
  `;
  
  overlay.appendChild(resumeBtn);
  overlay.appendChild(restartBtn);
  
  // Add the overlay to the video container
  const videoContainer = videoEl.parentElement;
  if (!videoContainer) return;
  
  videoContainer.style.position = 'relative';
  videoContainer.appendChild(overlay);
  
  // Add event listeners to buttons
  resumeBtn.addEventListener('click', () => {
    videoEl.currentTime = savedData.currentTime;
    if (videoContainer.contains(overlay)) {
      videoContainer.removeChild(overlay);
    }
    videoEl.play();
  });
  
  restartBtn.addEventListener('click', () => {
    videoEl.currentTime = 0;
    if (videoContainer.contains(overlay)) {
      videoContainer.removeChild(overlay);
    }
    videoEl.play();
  });
  
  // Auto-remove overlay after 15 seconds if no action taken
  setTimeout(() => {
    if (videoContainer.contains(overlay)) {
      videoContainer.removeChild(overlay);
    }
  }, 15000);
}

// Find and initialize all video elements on the page
function findVideos() {
  if (pendingVideoCheck) return;
  pendingVideoCheck = true;
  
  // Use requestAnimationFrame to avoid multiple checks in the same frame
  requestAnimationFrame(() => {
    // Find all video elements
    const allVideoElements = Array.from(document.querySelectorAll(SELECTOR_VIDEO));
    
    if (allVideoElements.length > 0) {
      log(`Found ${allVideoElements.length} total video elements`);
    }
    
    // Filter out videos we're already tracking
    const untracked = allVideoElements.filter(v => !videoElements.includes(v));
    
    if (untracked.length > 0) {
      log(`Found ${untracked.length} new video elements`);
      
      untracked.forEach(videoEl => {
        // Add to our tracking list
        videoElements.push(videoEl);
        
        // Add event listeners for this video
        videoEl.addEventListener('pause', saveVideoProgress);
        videoEl.addEventListener('ended', saveVideoProgress);
        videoEl.addEventListener('timeupdate', () => {
          // Save on timeupdate, but less frequently
          if (videoEl.currentTime % 5 < 0.5) {  // Save roughly every 5 seconds of video time
            saveVideoProgress();
          }
        });
        
        // Check for saved progress when video metadata is loaded
        const checkForSavedProgress = () => {
          const videoId = getVideoId(videoEl);
          
          chrome.storage.local.get([videoId], (result) => {
            if (chrome.runtime.lastError) {
              log('Error retrieving saved data:', chrome.runtime.lastError);
              return;
            }
            
            if (result[videoId]) {
              const savedData = result[videoId];
              log(`Found saved progress for ${videoId}: ${savedData.currentTime.toFixed(1)}/${savedData.duration.toFixed(1)} seconds`);
              
              // If the video has loaded and has a valid duration
              if (videoEl.readyState >= 1 && videoEl.duration > 0) {
                // Check if we need to add a resume overlay
                if (videoEl.currentTime < 1 && savedData.currentTime > PROGRESS_THRESHOLD) {
                  // Make sure there's no existing overlay
                  const existingOverlay = videoEl.parentElement?.querySelector('.x-video-tracker-overlay');
                  if (!existingOverlay) {
                    addResumeOverlay(videoEl, savedData);
                  }
                }
              }
            }
          });
        };
        
        // Check for saved progress when video has loaded
        if (videoEl.readyState >= 1) {
          checkForSavedProgress();
        } else {
          videoEl.addEventListener('loadedmetadata', checkForSavedProgress);
          
          // Also try after a short delay in case the event already fired
          setTimeout(checkForSavedProgress, 500);
        }
      });
    }
    
    // Start the interval for periodic saving if we have videos and haven't started yet
    if (videoElements.length > 0 && !saveIntervalId) {
      saveIntervalId = setInterval(saveVideoProgress, SAVE_INTERVAL_MS);
      log('Started progress tracking interval');
    }
    
    pendingVideoCheck = false;
  });
}

// Clean up resources when the page is unloaded
function cleanup() {
  if (saveIntervalId) {
    clearInterval(saveIntervalId);
    saveIntervalId = null;
  }
  saveVideoProgress(); // Final save before unloading
  log('Cleaned up and saved final progress');
}

// Initialize the tracker
function init() {
  log('Initializing X Video Tracker');
  
  // Initial scan for videos
  findVideos();
  
  // Set up a mutation observer to detect dynamically added videos
  const observer = new MutationObserver((mutations) => {
    let shouldCheckVideos = false;
    
    for (const mutation of mutations) {
      // Check for added nodes
      if (mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          // Check if the added node is a video or contains videos
          if (node.nodeName === 'VIDEO' || 
              (node.nodeType === 1 && node.querySelector(SELECTOR_VIDEO))) {
            shouldCheckVideos = true;
            break;
          }
        }
      }
      
      // Check for attribute changes on videos (for dynamic sources)
      if (mutation.type === 'attributes' && 
          mutation.target.nodeName === 'VIDEO') {
        shouldCheckVideos = true;
      }
      
      if (shouldCheckVideos) break;
    }
    
    if (shouldCheckVideos) {
      findVideos();
    }
  });
  
  // Start observing the document with the configured parameters
  observer.observe(document.body, { 
    childList: true, 
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'currentSrc']
  });
  
  // Set up event listeners for page unload
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('visibilitychange', () => {
    // When the page becomes hidden, save progress
    if (document.visibilityState === 'hidden') {
      saveVideoProgress();
    }
    // When the page becomes visible again, rescan for videos
    else if (document.visibilityState === 'visible') {
      // Use a timeout to give the page time to load/stabilize
      setTimeout(findVideos, 500);
    }
  });
  
  // Handle url changes (Twitter is a SPA - Single Page Application)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      log('URL changed, rechecking videos');
      // Reset video tracking on URL change
      videoElements = [];
      progressData = {};
      // Use a timeout to allow content to load
      setTimeout(findVideos, 1000);
    }
  }).observe(document, {subtree: true, childList: true});
  
  // Message listener for communication with popup and background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getProgress') {
      sendResponse(progressData);
    } else if (message.action === 'forceSaveProgress') {
      saveVideoProgress();
      sendResponse({success: true});
    } else if (message.action === 'updateVideoFolder') {
      const { videoId, folder } = message;
      if (progressData[videoId]) {
        progressData[videoId].folder = folder;
        saveVideoProgress();
        sendResponse({success: true});
      } else {
        // Try to get from storage and update
        chrome.storage.local.get([videoId], (result) => {
          if (result[videoId]) {
            const updatedData = result[videoId];
            updatedData.folder = folder;
            chrome.storage.local.set({ [videoId]: updatedData }, () => {
              sendResponse({success: true});
            });
          } else {
            sendResponse({success: false, error: 'Video not found'});
          }
        });
        return true; // Async response
      }
    }
  });
  
  // Run a check every few seconds to catch any missed videos
  // This helps with dynamically loaded content
  setInterval(findVideos, 5000);
}

// Start when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
} 