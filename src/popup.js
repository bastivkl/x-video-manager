// Popup JavaScript for X Video Tracker

// DOM Elements
const watchedTab = document.getElementById('tab-watched');
const savedTab = document.getElementById('tab-saved');
const foldersTab = document.getElementById('tab-folders');
const watchedContent = document.getElementById('watched-content');
const savedContent = document.getElementById('saved-content');
const foldersContent = document.getElementById('folders-content');
const watchedVideosList = document.getElementById('watched-videos-list');
const savedVideosList = document.getElementById('saved-videos-list');
const folderVideosList = document.getElementById('folder-videos-list');
const watchedEmptyState = document.getElementById('watched-empty-state');
const savedEmptyState = document.getElementById('saved-empty-state');
const folderEmptyState = document.getElementById('folder-empty-state');
const addVideoForm = document.getElementById('add-video-form');
const folderList = document.getElementById('folder-list');
const currentFolderName = document.getElementById('current-folder-name');
const addFolderBtn = document.getElementById('add-folder-btn');
const addFolderContainer = document.getElementById('add-folder-container');
const addFolderForm = document.getElementById('add-folder-form');
const folderModal = document.getElementById('folder-modal');
const modalFolderList = document.getElementById('modal-folder-list');
const modalCancel = document.getElementById('modal-cancel');
const closeModal = document.querySelector('.close');

// Global state
let allVideos = [];
let allFolders = [];
let currentFolder = 'Watch Later';
let currentVideoForFolder = null;
let currentActiveTab = 'watched';

// Tab switching with smooth animation
function switchTab(tab) {
  // Remove active class from all tabs
  [watchedTab, savedTab, foldersTab].forEach(t => t.classList.remove('active'));
  
  // Add active class to selected tab
  tab.classList.add('active');
  
  // Hide all content
  [watchedContent, savedContent, foldersContent].forEach(c => c.style.display = 'none');
  
  // Show selected content and track current tab
  if (tab === watchedTab) {
    watchedContent.style.display = 'block';
    loadAllVideos();
    currentActiveTab = 'watched';
  } else if (tab === savedTab) {
    savedContent.style.display = 'block';
    loadSavedVideos();
    currentActiveTab = 'saved';
  } else if (tab === foldersTab) {
    foldersContent.style.display = 'block';
    loadFolders();
    currentActiveTab = 'folders';
  }
}

// Tab event listeners
watchedTab.addEventListener('click', () => switchTab(watchedTab));
savedTab.addEventListener('click', () => switchTab(savedTab));
foldersTab.addEventListener('click', () => switchTab(foldersTab));

// Form submission for adding a video
addVideoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const urlInput = document.getElementById('video-url');
  const titleInput = document.getElementById('video-title');
  const thumbnailInput = document.getElementById('video-thumbnail');
  const folderSelect = document.getElementById('video-folder');
  
  const url = urlInput.value.trim();
  let title = titleInput.value.trim();
  const thumbnailUrl = thumbnailInput.value.trim();
  const folder = folderSelect.value;
  
  // Validate URL
  if (!url) {
    showMessage(addVideoForm, 'Please enter a valid URL', 'error');
    return;
  }
  
  // Try to extract a title from the URL if none provided
  if (!title) {
    try {
      const urlObj = new URL(url);
      title = `Video from ${urlObj.hostname}`;
      
      // Try to extract post ID if it's an X/Twitter URL
      const match = url.match(/\/status\/(\d+)/);
      if (match && match[1]) {
        title = `X Video #${match[1].substring(0, 8)}...`;
      }
    } catch {
      title = 'Saved Video';
    }
  }
  
  // Add loading state to button
  const submitBtn = addVideoForm.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Adding...';
  submitBtn.disabled = true;
  
  // Send message to background script to add the video
  chrome.runtime.sendMessage({
    action: 'addManualVideo',
    url,
    title,
    thumbnailUrl,
    folder
  }, (response) => {
    // Restore button
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    
    if (response && response.success) {
      // Clear form
      urlInput.value = '';
      titleInput.value = '';
      thumbnailInput.value = '';
      
      // Show success message
      showMessage(addVideoForm, 'Video added successfully!', 'success');
      
      // Refresh all views to ensure consistency
      refreshAllViews();
    } else {
      showMessage(addVideoForm, 'Failed to add video', 'error');
    }
  });
});

// Function to refresh all views based on current state
function refreshAllViews() {
  // First refresh data
  chrome.runtime.sendMessage({ action: 'getAllSavedVideos' }, (response) => {
    if (response && response.videos) {
      allVideos = response.videos;
      allFolders = response.folders || ['Favorites', 'Watch Later', 'Uncategorized'];
      
      // Update dropdown
      updateFolderDropdown();
      
      // Update lists based on current tab
      if (currentActiveTab === 'watched') {
        displayVideos(allVideos);
      } else if (currentActiveTab === 'saved') {
        const savedVideos = allVideos.filter(v => v.manuallyAdded);
        displaySavedVideos(savedVideos);
      } else if (currentActiveTab === 'folders') {
        displayFolderList();
        displayFolderContents(currentFolder);
      }
    }
  });
}

// Show message with animation
function showMessage(form, message, type = 'success') {
  // Remove any existing messages
  const existingMsg = form.querySelector('.success-message, .error-message');
  if (existingMsg) {
    form.removeChild(existingMsg);
  }
  
  // Create message element
  const msgEl = document.createElement('div');
  msgEl.className = type === 'success' ? 'success-message' : 'error-message';
  
  // Add icon and text
  if (type === 'success') {
    msgEl.innerHTML = '<span class="success-icon"></span>' + message;
  } else {
    msgEl.innerHTML = message;
    msgEl.style.color = '#E0245E';
  }
  
  // Add to form
  form.appendChild(msgEl);
  
  // Remove after delay
  setTimeout(() => {
    if (form.contains(msgEl)) {
      // Fade out
      msgEl.style.transition = 'opacity 0.5s ease';
      msgEl.style.opacity = '0';
      
      setTimeout(() => {
        if (form.contains(msgEl)) {
          form.removeChild(msgEl);
        }
      }, 500);
    }
  }, 3000);
}

// Format time (seconds) to MM:SS
function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Format timestamp to relative time (e.g. "2 hours ago")
function formatRelativeTime(timestamp) {
  if (!timestamp) return '';
  
  const now = Date.now();
  const diff = now - timestamp;
  
  // Convert to appropriate units
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  } else if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  } else if (minutes > 0) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  } else {
    return 'Just now';
  }
}

// Create video thumbnail element
function createThumbnail(video) {
  const thumbnailContainer = document.createElement('div');
  thumbnailContainer.className = 'video-thumbnail';
  
  if (video.thumbnailUrl) {
    const img = document.createElement('img');
    img.src = video.thumbnailUrl;
    img.alt = 'Video thumbnail';
    img.onerror = () => {
      // If image fails to load, show placeholder
      thumbnailContainer.innerHTML = '<div class="video-thumbnail-placeholder">▶</div>';
    };
    thumbnailContainer.appendChild(img);
  } else {
    // No thumbnail available, show placeholder
    thumbnailContainer.innerHTML = '<div class="video-thumbnail-placeholder">▶</div>';
  }
  
  return thumbnailContainer;
}

// Show folder selection modal
function showFolderModal(videoId) {
  currentVideoForFolder = videoId;
  
  // Populate modal with folders
  modalFolderList.innerHTML = '';
  
  allFolders.forEach(folder => {
    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item';
    folderItem.innerHTML = `<div class="folder-name">${folder}</div>`;
    
    folderItem.addEventListener('click', () => {
      moveVideoToFolder(currentVideoForFolder, folder);
      folderModal.style.display = 'none';
    });
    
    modalFolderList.appendChild(folderItem);
  });
  
  folderModal.style.display = 'block';
}

// Move video to a different folder
function moveVideoToFolder(videoId, folder) {
  // Find the video in our local data
  const videoToUpdate = allVideos.find(v => v.id === videoId);
  if (videoToUpdate) {
    // Optimistically update UI first for better responsiveness
    videoToUpdate.folder = folder;
    
    // If we're in folders view, update the displayed folder contents
    if (currentActiveTab === 'folders') {
      displayFolderContents(currentFolder);
    } else if (currentActiveTab === 'watched' || currentActiveTab === 'saved') {
      // Update badge on the relevant video item
      const videoItem = document.querySelector(`[data-video-id="${videoId}"]`);
      if (videoItem) {
        const badge = videoItem.querySelector('.folder-badge');
        if (badge) {
          badge.textContent = folder;
        }
      }
    }
  }
  
  // Then send to background script
  chrome.runtime.sendMessage({
    action: 'moveVideoToFolder',
    videoId,
    folder
  }, (response) => {
    if (response && response.success) {
      // Refresh all data to ensure everything is in sync
      refreshAllViews();
    } else {
      // If it failed, refresh to revert changes
      refreshAllViews();
    }
  });
}

// Create a video item element with improved UI
function createVideoItem(video) {
  const videoItem = document.createElement('div');
  videoItem.className = 'video-item';
  videoItem.dataset.videoId = video.id; // Add data attribute for easy selection
  
  // Calculate progress percentage
  let progressPercent = 0;
  if (video.duration && video.currentTime) {
    progressPercent = Math.min(100, (video.currentTime / video.duration) * 100);
  }
  
  // Format the time display
  const currentTimeFormatted = formatTime(video.currentTime);
  const durationFormatted = formatTime(video.duration);
  const timeDisplay = video.duration ? `${currentTimeFormatted} / ${durationFormatted}` : currentTimeFormatted;
  
  // Create inner HTML structure
  videoItem.innerHTML = `
    <div class="video-flex">
      <div class="video-thumbnail-container"></div>
      <div class="video-info">
        <div class="video-title">${video.title || 'Untitled Video'}</div>
        <span class="folder-badge">${video.folder || 'Uncategorized'}</span>
        <div class="video-meta">
          ${formatRelativeTime(video.timestamp)} • ${timeDisplay}
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
      </div>
    </div>
    <div class="video-actions">
      <div class="action-buttons">
        <button class="secondary watch-btn">Watch</button>
        <button class="secondary folder-btn">Move</button>
      </div>
      <button class="danger delete-btn">Delete</button>
    </div>
  `;
  
  // Add the thumbnail
  const thumbnailContainer = videoItem.querySelector('.video-thumbnail-container');
  thumbnailContainer.appendChild(createThumbnail(video));
  
  // Add event listeners
  const watchBtn = videoItem.querySelector('.watch-btn');
  const folderBtn = videoItem.querySelector('.folder-btn');
  const deleteBtn = videoItem.querySelector('.delete-btn');
  
  // Add ripple effect to buttons
  [watchBtn, folderBtn, deleteBtn].forEach(btn => {
    btn.addEventListener('mousedown', createRippleEffect);
  });
  
  watchBtn.addEventListener('click', () => {
    // Add loading state
    watchBtn.textContent = 'Opening...';
    watchBtn.disabled = true;
    
    chrome.runtime.sendMessage({
      action: 'openVideo',
      videoId: video.id,
      url: video.url
    }, () => {
      // Restore button
      setTimeout(() => {
        watchBtn.textContent = 'Watch';
        watchBtn.disabled = false;
      }, 1000);
    });
  });
  
  folderBtn.addEventListener('click', () => {
    showFolderModal(video.id);
  });
  
  deleteBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete this video?')) {
      // Add loading state
      deleteBtn.textContent = 'Deleting...';
      deleteBtn.disabled = true;
      
      chrome.runtime.sendMessage({
        action: 'deleteVideo',
        videoId: video.id
      }, (response) => {
        if (response && response.success) {
          // Animate removal
          videoItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          videoItem.style.opacity = '0';
          videoItem.style.transform = 'translateX(10px)';
          
          setTimeout(() => {
            videoItem.remove();
            
            // Refresh all views to ensure everything is in sync
            refreshAllViews();
          }, 300);
        } else {
          // Restore button
          deleteBtn.textContent = 'Delete';
          deleteBtn.disabled = false;
        }
      });
    }
  });
  
  return videoItem;
}

// Create ripple effect for buttons
function createRippleEffect(e) {
  const button = e.currentTarget;
  const ripple = document.createElement('span');
  const rect = button.getBoundingClientRect();
  
  const size = Math.max(rect.width, rect.height);
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;
  
  ripple.style.cssText = `
    position: absolute;
    top: ${y}px;
    left: ${x}px;
    width: ${size}px;
    height: ${size}px;
    background-color: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    transform: scale(0);
    animation: ripple 0.6s linear;
    pointer-events: none;
  `;
  
  button.style.position = 'relative';
  button.style.overflow = 'hidden';
  button.appendChild(ripple);
  
  setTimeout(() => {
    ripple.remove();
  }, 600);
}

// Add ripple animation to styles
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    to {
      transform: scale(2);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Load all saved videos and separate them into watched vs. manually saved
function loadAllVideos() {
  // Show loading state
  watchedVideosList.innerHTML = '<div class="empty-state">Loading videos...</div>';
  
  chrome.runtime.sendMessage({ action: 'getAllSavedVideos' }, (response) => {
    if (response && response.videos) {
      allVideos = response.videos;
      allFolders = response.folders || ['Favorites', 'Watch Later', 'Uncategorized'];
      
      // Make sure active tabs save their current progress first
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const currentTab = tabs[0];
        if (currentTab && (currentTab.url.includes('twitter.com') || currentTab.url.includes('x.com'))) {
          chrome.tabs.sendMessage(currentTab.id, { action: 'forceSaveProgress' }, () => {
            // Ignore errors and continue with display
            displayVideos(allVideos);
            
            // Update folder dropdown for the add form
            updateFolderDropdown();
          });
        } else {
          displayVideos(allVideos);
          
          // Update folder dropdown for the add form
          updateFolderDropdown();
        }
      });
    }
  });
}

// Update the folder dropdown in the add video form
function updateFolderDropdown() {
  const folderSelect = document.getElementById('video-folder');
  if (!folderSelect) return;
  
  folderSelect.innerHTML = '';
  
  // Don't select any folder by default (remove Uncategorized as default)
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select a folder --';
  folderSelect.appendChild(defaultOption);
  
  // Give preference to Watch Later in dropdown
  const orderedFolders = [...allFolders].sort((a, b) => {
    if (a === 'Watch Later') return -1;
    if (b === 'Watch Later') return 1;
    if (a === 'Favorites') return -1;
    if (b === 'Favorites') return 1;
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    return a.localeCompare(b);
  });
  
  orderedFolders.forEach(folder => {
    const option = document.createElement('option');
    option.value = folder;
    option.textContent = folder;
    // Preselect Watch Later
    if (folder === 'Watch Later') {
      option.selected = true;
    }
    folderSelect.appendChild(option);
  });
}

// Display the videos in the appropriate lists
function displayVideos(videos) {
  // Separate videos into watched and manually added
  const watchedVideos = videos.filter(v => !v.manuallyAdded);
  const savedVideos = videos.filter(v => v.manuallyAdded);
  
  // Update watched videos list
  watchedVideosList.innerHTML = '';
  if (watchedVideos.length > 0) {
    watchedEmptyState.style.display = 'none';
    watchedVideos.forEach(video => {
      watchedVideosList.appendChild(createVideoItem(video));
    });
  } else {
    watchedEmptyState.style.display = 'block';
  }
  
  // Also update saved videos list if we're viewing it
  if (currentActiveTab === 'saved') {
    displaySavedVideos(savedVideos);
  }
}

// Display saved videos only
function displaySavedVideos(savedVideos) {
  savedVideosList.innerHTML = '';
  if (savedVideos && savedVideos.length > 0) {
    savedEmptyState.style.display = 'none';
    savedVideos.forEach(video => {
      savedVideosList.appendChild(createVideoItem(video));
    });
  } else {
    savedEmptyState.style.display = 'block';
  }
}

// Load only saved videos (for tab switching)
function loadSavedVideos() {
  // Show loading state
  savedVideosList.innerHTML = '<div class="empty-state">Loading videos...</div>';
  
  chrome.runtime.sendMessage({ action: 'getAllSavedVideos' }, (response) => {
    if (response && response.videos) {
      allVideos = response.videos;
      allFolders = response.folders || ['Favorites', 'Watch Later', 'Uncategorized'];
      
      const savedVideos = allVideos.filter(v => v.manuallyAdded);
      
      // Update saved videos list
      displaySavedVideos(savedVideos);
      
      // Update folder dropdown
      updateFolderDropdown();
    }
  });
}

// Load folders and create UI for folder management
function loadFolders() {
  chrome.runtime.sendMessage({ action: 'getAllSavedVideos' }, (response) => {
    if (response && response.videos && response.folders) {
      allVideos = response.videos;
      allFolders = response.folders;
      
      // Display the folder list
      displayFolderList();
      
      // Display the current selected folder contents
      displayFolderContents(currentFolder);
    }
  });
}

// Display the list of folders with counts
function displayFolderList() {
  folderList.innerHTML = '';
  
  // Count videos in each folder
  const folderCounts = {};
  allFolders.forEach(folder => {
    folderCounts[folder] = allVideos.filter(v => v.folder === folder).length;
  });
  
  // Create UI for each folder
  allFolders.forEach(folder => {
    const folderItem = document.createElement('div');
    folderItem.className = 'folder-item';
    if (folder === currentFolder) {
      folderItem.classList.add('active');
    }
    
    folderItem.innerHTML = `
      <div class="folder-name">${folder}</div>
      <div class="folder-count">${folderCounts[folder] || 0}</div>
    `;
    
    // Make the folder selectable
    folderItem.addEventListener('click', () => {
      currentFolder = folder;
      
      // Update active state
      document.querySelectorAll('.folder-item').forEach(item => {
        item.classList.remove('active');
      });
      folderItem.classList.add('active');
      
      // Display contents of this folder
      displayFolderContents(folder);
    });
    
    // Add a delete button for custom folders (not uncategorized)
    if (folder !== 'Uncategorized' && folder !== 'Favorites' && folder !== 'Watch Later') {
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '✕';
      deleteBtn.className = 'secondary icon-btn';
      deleteBtn.style.fontSize = '10px';
      deleteBtn.title = `Delete folder "${folder}"`;
      
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger the folder click
        
        if (confirm(`Are you sure you want to delete the folder "${folder}"?\nVideos will be moved to Watch Later.`)) {
          chrome.runtime.sendMessage({
            action: 'deleteFolder',
            folderName: folder
          }, (response) => {
            if (response && response.success) {
              // Refresh the folder list
              loadFolders();
              
              // If we deleted the current folder, switch to Watch Later
              if (folder === currentFolder) {
                currentFolder = 'Watch Later';
              }
              
              // Refresh other views
              refreshAllViews();
            } else if (response && response.error) {
              showMessage(addFolderForm, response.error, 'error');
            }
          });
        }
      });
      
      folderItem.appendChild(deleteBtn);
    }
    
    folderList.appendChild(folderItem);
  });
}

// Display videos in the selected folder
function displayFolderContents(folder) {
  currentFolderName.textContent = `${folder} Contents`;
  
  // Show loading state
  folderVideosList.innerHTML = '<div class="empty-state">Loading videos...</div>';
  
  // Get videos in this folder
  const folderVideos = allVideos.filter(v => v.folder === folder);
  
  // Display the videos
  folderVideosList.innerHTML = '';
  
  if (folderVideos.length > 0) {
    folderEmptyState.style.display = 'none';
    folderVideos.forEach(video => {
      folderVideosList.appendChild(createVideoItem(video));
    });
  } else {
    folderEmptyState.style.display = 'block';
  }
}

// Handle "Add Folder" button
addFolderBtn.addEventListener('click', () => {
  addFolderContainer.style.display = addFolderContainer.style.display === 'none' ? 'block' : 'none';
  if (addFolderContainer.style.display === 'block') {
    document.getElementById('folder-name').focus();
  }
});

// Handle adding a new folder
addFolderForm.addEventListener('submit', (e) => {
  e.preventDefault();
  
  const folderNameInput = document.getElementById('folder-name');
  const folderName = folderNameInput.value.trim();
  
  if (!folderName) {
    showMessage(addFolderForm, 'Please enter a folder name', 'error');
    return;
  }
  
  // Add loading state
  const submitBtn = addFolderForm.querySelector('button[type="submit"]');
  submitBtn.textContent = 'Adding...';
  submitBtn.disabled = true;
  
  chrome.runtime.sendMessage({
    action: 'addFolder',
    folderName
  }, (response) => {
    // Restore button
    submitBtn.textContent = 'Add';
    submitBtn.disabled = false;
    
    if (response && response.success) {
      // Clear the input
      folderNameInput.value = '';
      
      // Hide the form
      addFolderContainer.style.display = 'none';
      
      // Show success message
      showMessage(addFolderForm, 'Folder added successfully!', 'success');
      
      // Update folder dropdown in add video form before refreshing the UI
      allFolders.push(folderName);
      updateFolderDropdown();
      
      // Refresh the folder list
      loadFolders();
    } else if (response && response.error) {
      showMessage(addFolderForm, response.error, 'error');
    }
  });
});

// Modal event handlers
closeModal.addEventListener('click', () => {
  folderModal.style.display = 'none';
});

modalCancel.addEventListener('click', () => {
  folderModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === folderModal) {
    folderModal.style.display = 'none';
  }
});

// Force refresh data when popup opens to get latest progress
function refreshData() {
  // Ask any active X/Twitter tabs to save their current progress
  chrome.tabs.query({}, (tabs) => {
    const xTabs = tabs.filter(tab => 
      tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))
    );
    
    let pendingTabs = xTabs.length;
    
    if (pendingTabs === 0) {
      // No X/Twitter tabs, just load videos
      loadAllVideos();
      return;
    }
    
    // For each active tab, request a save
    xTabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { action: 'forceSaveProgress' }, () => {
        pendingTabs--;
        if (pendingTabs <= 0) {
          // All tabs have processed, now load videos
          loadAllVideos();
        }
      });
    });
    
    // Set a timeout in case some tabs don't respond
    setTimeout(() => {
      if (pendingTabs > 0) {
        loadAllVideos();
      }
    }, 500);
  });
}

// Add keyboard navigation support
document.addEventListener('keydown', (e) => {
  // Escape key closes modals
  if (e.key === 'Escape') {
    folderModal.style.display = 'none';
  }
  
  // Tab switching with 1-2-3 keys
  if (e.key === '1') {
    switchTab(watchedTab);
  } else if (e.key === '2') {
    switchTab(savedTab);
  } else if (e.key === '3') {
    switchTab(foldersTab);
  }
});

// Load videos when popup opens
document.addEventListener('DOMContentLoaded', refreshData); 