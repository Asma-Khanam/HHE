// Clicking the toolbar icon opens the side panel. A side panel rather than a
// popup for one reason that matters: a popup closes the moment you click the
// page, and this whole flow is "click a document here, then click a field
// over there". A popup would shut halfway through, every time.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
