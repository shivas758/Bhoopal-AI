// Runs before the app, in plain ES5 so even very old Android browsers can run it. If the browser is too old for
// the app (the styles need Chrome 111+), the farmer sees how to fix it, in every app language, instead of a
// broken or blank page. Kept outside index.html because the Content-Security-Policy forbids inline scripts.
;(function () {
  var modern = false
  try {
    modern = !!(window.CSS && CSS.supports && CSS.supports('color', 'oklch(50% 0.1 100)') && window.fetch && window.Promise)
  } catch (e) {
    modern = false
  }
  if (modern) return
  var lines = [
    'Please update Google Chrome from the Play Store to use BhooPal.',
    'भूपाल इस्तेमाल करने के लिए Play Store से Google Chrome अपडेट करें।',
    'భూపాల్ వాడటానికి Play Store నుండి Google Chrome అప్‌డేట్ చేయండి.',
    'பூபாலைப் பயன்படுத்த Play Store-இல் Google Chrome-ஐப் புதுப்பிக்கவும்.',
    'ಭೂಪಾಲ್ ಬಳಸಲು Play Store ನಿಂದ Google Chrome ಅಪ್‌ಡೇಟ್ ಮಾಡಿ.',
    'ഭൂപാൽ ഉപയോഗിക്കാൻ Play Store-ൽ നിന്ന് Google Chrome അപ്ഡേറ്റ് ചെയ്യുക.',
  ]
  var html = '<div class="old-browser"><h1>BhooPal</h1>'
  for (var i = 0; i < lines.length; i++) html += '<p>' + lines[i] + '</p>'
  html += '<p>Kisan Call Centre (free): <a href="tel:18001801551">1800-180-1551</a></p></div>'
  var root = document.getElementById('root')
  if (root) root.innerHTML = html
  // Stop the app from replacing the message (it would fail on this browser anyway).
  window.__bhoopalOldBrowser = true
})()
