const {app, BrowserWindow, ipcMain, dialog} = require("electron");
const fs = require("fs");

let win

ipcMain.handle("save-seg-file", async (event, defaultPath, content) => {
    let result = await dialog.showSaveDialog(win, {
        defaultPath: defaultPath,
        filters: [{ name: "Segmented Text", extensions: ["seg"] }]
    });
    if (result.canceled || !result.filePath) {
        return null;
    }
    fs.writeFileSync(result.filePath, content, "utf8");
    return result.filePath;
});

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    });
    win.loadFile("index.html");

    // Re-emit the renderer's DevTools console to this process's stdout/stderr,
    // so console output is visible wherever `npm start` is running instead of
    // only inside the (often-closed) DevTools window.
    const levelNames = ["log", "warn", "error", "info"];
    win.webContents.on("console-message", (event) => {
        const label = levelNames[event.level] || "log";
        const location = event.sourceId ? ` (${event.sourceId}:${event.lineNumber})` : "";
        console.log(`[renderer:${label}]${location} ${event.message}`);
    });
}

app.whenReady().then(createWindow);