// "Install as an app": Chrome and Edge can install the site as a desktop app (own window, Start-menu icon,
// works offline through sw.js). The browser offers it through the beforeinstallprompt event; the buttons
// (Settings menu and start screen) open that prompt, and hide once the app is installed or opened as one.
let prompt = null;
const BUTTONS = ["btnInstall", "startInstall"];
const installed = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function update() {
  for (const id of BUTTONS) {
    const b = document.getElementById(id);
    if (b) b.hidden = installed();
  }
}

window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); prompt = e; update(); });
window.addEventListener("appinstalled", () => { prompt = null; for (const id of BUTTONS) { const b = document.getElementById(id); if (b) b.hidden = true; } });

async function install() {
  if (prompt) {
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    return;
  }
  // no prompt from the browser (Firefox, Safari, or Chrome has not offered it yet): say how to do it by hand
  alert("To install PRISMA Scoping Review Studio as an app, open it in Chrome or Edge and choose \"Install\" in the address bar or in the browser menu (⋮ → Cast, save and share → Install page as app). It then opens in its own window and works offline.");
}

for (const id of BUTTONS) document.getElementById(id)?.addEventListener("click", install);
update();
