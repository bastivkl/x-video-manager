// Background script for X Video Tracker

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('X Video Tracker installed');
    
    // Initialize storage with empty watched videos and default folders
    chrome.storage.local.set({ 
      'watchedVideos': [],
      'manuallyAddedVideos': [],
      'folders': ['Favorites', 'Watch Later', 'Uncategorized']
    });
  }
});

// Listen for tab events to save progress
chrome.tabs.onRemoved.addListener((tabId) => {
  // When a tab is closed, make sure we save any last progress
  console.log('Tab closed, ensuring progress is saved');
  chrome.tabs.query({}, (tabs) => {
    // Check if there are any Twitter/X tabs still open
    const xTabs = tabs.filter(tab => 
      tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))
    );
    
    // For each Twitter/X tab, send a message to save progress
    xTabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'forceSaveProgress' }, () => {
        if (chrome.runtime.lastError) {
          // Ignore errors, as the content script might not be loaded
          console.log('Could not send message to tab', chrome.runtime.lastError);
        }
      });
    });
  });
});

// Clean up old entries periodically
function cleanupOldVideos() {
  console.log('Running periodic cleanup of old videos');
  
  chrome.storage.local.get(null, (data) => {
    const now = Date.now();
    const ONE_MONTH = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const keysToRemove = [];
    
    // Find video entries older than one month
    Object.entries(data).forEach(([key, value]) => {
      if (key.startsWith('x-video-') && value.timestamp && (now - value.timestamp > ONE_MONTH)) {
        keysToRemove.push(key);
      }
    });
    
    // Remove old entries
    if (keysToRemove.length > 0) {
      console.log(`Removing ${keysToRemove.length} old video entries`);
      chrome.storage.local.remove(keysToRemove);
    }
  });
}

// Run cleanup once a week
setInterval(cleanupOldVideos, 7 * 24 * 60 * 60 * 1000);
// Also run cleanup on startup after a delay
setTimeout(cleanupOldVideos, 10 * 60 * 1000);

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle getting all saved videos
  if (message.action === 'getAllSavedVideos') {
    chrome.storage.local.get(null, (data) => {
      // Get all folders
      const folders = data.folders || ['Favorites', 'Watch Later', 'Uncategorized'];
      
      // Filter out only video entries (keys starting with 'x-video-')
      const videoEntries = Object.entries(data)
        .filter(([key]) => key.startsWith('x-video-'))
        .map(([key, value]) => ({
          id: key,
          ...value,
          folder: value.folder || 'Watch Later' // Use Watch Later as default folder instead of Uncategorized
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by most recent first
        
      sendResponse({ videos: videoEntries, folders: folders });
    });
    return true; // Return true to indicate async response
  }
  
  // Handle manually adding a video
  if (message.action === 'addManualVideo') {
    const { url, title, thumbnailUrl, folder } = message;
    const videoId = `x-video-manual-${Date.now()}`;
    
    // Save the manually added video
    chrome.storage.local.set({ 
      [videoId]: {
        url,
        title,
        thumbnailUrl: thumbnailUrl || null,
        timestamp: Date.now(),
        manuallyAdded: true,
        currentTime: 0,
        duration: 0,
        folder: folder || 'Watch Later' // Default to Watch Later if no folder specified
      }
    }, () => {
      // Update the list of manually added videos
      chrome.storage.local.get(['manuallyAddedVideos'], (data) => {
        const manualVideos = data.manuallyAddedVideos || [];
        manualVideos.push(videoId);
        
        chrome.storage.local.set({ 'manuallyAddedVideos': manualVideos }, () => {
          sendResponse({ success: true, videoId });
        });
      });
    });
    return true; // Return true to indicate async response
  }
  
  // Handle adding a new folder
  if (message.action === 'addFolder') {
    const { folderName } = message;
    
    if (!folderName || folderName.trim() === '') {
      sendResponse({ success: false, error: 'Folder name cannot be empty' });
      return true;
    }
    
    chrome.storage.local.get(['folders'], (data) => {
      const folders = data.folders || ['Favorites', 'Watch Later', 'Uncategorized'];
      
      // Check if folder already exists
      if (folders.includes(folderName)) {
        sendResponse({ success: false, error: 'Folder already exists' });
        return;
      }
      
      // Add new folder and save
      folders.push(folderName);
      chrome.storage.local.set({ 'folders': folders }, () => {
        sendResponse({ success: true, folders });
      });
    });
    return true; // Return true to indicate async response
  }
  
  // Handle deleting a folder
  if (message.action === 'deleteFolder') {
    const { folderName } = message;
    
    // Don't allow deleting the default folders
    if (folderName === 'Uncategorized' || folderName === 'Favorites' || folderName === 'Watch Later') {
      sendResponse({ success: false, error: 'Cannot delete default folders' });
      return true;
    }
    
    chrome.storage.local.get(['folders'], (data) => {
      let folders = data.folders || ['Favorites', 'Watch Later', 'Uncategorized'];
      
      // Remove folder from the list
      folders = folders.filter(f => f !== folderName);
      
      chrome.storage.local.set({ 'folders': folders }, () => {
        // Now update all videos in this folder to 'Watch Later' instead of 'Uncategorized'
        chrome.storage.local.get(null, (allData) => {
          const updates = {};
          
          Object.entries(allData).forEach(([key, value]) => {
            if (key.startsWith('x-video-') && value.folder === folderName) {
              value.folder = 'Watch Later';
              updates[key] = value;
            }
          });
          
          if (Object.keys(updates).length > 0) {
            chrome.storage.local.set(updates, () => {
              sendResponse({ success: true, folders });
            });
          } else {
            sendResponse({ success: true, folders });
          }
        });
      });
    });
    return true; // Return true to indicate async response
  }
  
  // Handle moving a video to a folder
  if (message.action === 'moveVideoToFolder') {
    const { videoId, folder } = message;
    
    chrome.storage.local.get([videoId], (data) => {
      if (!data[videoId]) {
        sendResponse({ success: false, error: 'Video not found' });
        return;
      }
      
      const videoData = data[videoId];
      videoData.folder = folder;
      
      chrome.storage.local.set({ [videoId]: videoData }, () => {
        sendResponse({ success: true });
      });
    });
    return true; // Return true to indicate async response
  }
  
  // Handle deleting a video
  if (message.action === 'deleteVideo') {
    const { videoId } = message;
    
    // Remove the video from storage
    chrome.storage.local.remove(videoId, () => {
      // If it was manually added, remove from that list too
      if (videoId.startsWith('x-video-manual-')) {
        chrome.storage.local.get(['manuallyAddedVideos'], (data) => {
          const manualVideos = data.manuallyAddedVideos || [];
          const updatedVideos = manualVideos.filter(id => id !== videoId);
          
          chrome.storage.local.set({ 'manuallyAddedVideos': updatedVideos }, () => {
            sendResponse({ success: true });
          });
        });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // Return true to indicate async response
  }
  
  // Handle opening a video
  if (message.action === 'openVideo') {
    const { videoId, url } = message;
    
    // Open the URL in a new tab
    chrome.tabs.create({ url }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true; // Return true to indicate async response
  }
}); 