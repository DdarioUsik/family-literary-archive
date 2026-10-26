(function () {
  "use strict";

  const DB_NAME = "family-heritage-local-archive";
  const DB_VERSION = 1;
  const COLLECTIONS = {
    nadezhda: { label: "Надежда Павловна Соколова", folder: "Надежда Соколова" },
    vsevolod: { label: "Всеволод Бурштейн", folder: "Всеволод Бурштейн" }
  };
  let databasePromise;
  let directoryHandle = null;
  let activeCollection = "nadezhda";
  let activeObjectUrl = null;

  const fileInput = document.getElementById("local-file-input");
  const statusLine = document.getElementById("storage-status");
  const chooseFolderButton = document.getElementById("choose-folder");

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve, reject) {
      if (!("indexedDB" in window)) {
        reject(new Error("Этот браузер не поддерживает локальную базу файлов."));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Не удалось открыть локальную базу.")); };
    });
    return databasePromise;
  }

  function readAllFiles() {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const request = db.transaction("files", "readonly").objectStore("files").getAll();
        request.onsuccess = function () { resolve(request.result || []); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function readSetting(key) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const request = db.transaction("settings", "readonly").objectStore("settings").get(key);
        request.onsuccess = function () { resolve(request.result ? request.result.value : null); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  function writeRecord(storeName, record) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(record);
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error || new Error("Локальное сохранение прервано.")); };
      });
    });
  }

  function deleteRecord(id) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        const transaction = db.transaction("files", "readwrite");
        transaction.objectStore("files").delete(id);
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
      });
    });
  }

  function setStatus(message) {
    statusLine.textContent = message;
  }

  function tell(message) {
    let toast = document.querySelector(".archive-live-status");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "archive-live-status";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    window.clearTimeout(tell.timer);
    tell.timer = window.setTimeout(function () { toast.remove(); }, 5500);
  }

  function prettySize(bytes) {
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " КБ";
    return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
  }

  function prettyDate(value) {
    return new Intl.DateTimeFormat("ru", { dateStyle: "medium" }).format(new Date(value));
  }

  function countLabel(number) {
    const mod100 = number % 100;
    const mod10 = number % 10;
    const noun = mod100 >= 11 && mod100 <= 14 ? "материалов" :
      mod10 === 1 ? "материал" : mod10 >= 2 && mod10 <= 4 ? "материала" : "материалов";
    return number + " " + noun;
  }

  function makeButton(label, action, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = className || "";
    button.addEventListener("click", action);
    return button;
  }

  async function renderFiles() {
    try {
      const records = (await readAllFiles()).sort(function (a, b) { return b.addedAt - a.addedAt; });
      Object.keys(COLLECTIONS).forEach(function (collection) {
        const entries = records.filter(function (record) { return record.collection === collection; });
        const count = document.getElementById("count-" + collection);
        const list = document.getElementById("files-" + collection);
        count.textContent = countLabel(entries.length);
        list.replaceChildren();
        if (!entries.length) {
          const empty = document.createElement("p");
          empty.className = "local-file-empty";
          empty.textContent = "Здесь пока пусто. Добавленные материалы появятся только в вашем локальном архиве.";
          list.appendChild(empty);
          return;
        }
        entries.forEach(function (record) {
          const row = document.createElement("article");
          row.className = "local-file-item";
          const details = document.createElement("div");
          const name = document.createElement("b");
          name.textContent = record.name;
          const meta = document.createElement("small");
          meta.textContent = prettySize(record.size) + " · добавлено " + prettyDate(record.addedAt) +
            (record.storage === "folder" ? " · папка на компьютере" : " · локальная база браузера");
          details.append(name, meta);
          const actions = document.createElement("div");
          actions.className = "local-file-actions";
          actions.appendChild(makeButton("Открыть", function () { openFile(record); }));
          actions.appendChild(makeButton("Удалить", function () { removeFile(record); }));
          row.append(details, actions);
          list.appendChild(row);
        });
      });
    } catch (error) {
      setStatus("Локальная база недоступна: " + error.message);
    }
  }

  function extension(name) {
    const match = /\.([^.]+)$/.exec(name || "");
    return match ? match[1].toLowerCase() : "";
  }

  function localKind(file) {
    const ext = extension(file.name);
    const mime = (file.type || "").toLowerCase();
    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (mime.indexOf("image/") === 0 || ["jpg", "jpeg", "png", "webp", "tif", "tiff"].includes(ext)) return "image";
    if (mime.indexOf("audio/") === 0 || ["mp3", "m4a", "wav", "ogg"].includes(ext)) return "audio";
    if (["txt", "md", "rtf"].includes(ext) || mime.indexOf("text/") === 0) return "text";
    return "download";
  }

  async function getFile(record) {
    if (record.blob) return record.blob;
    if (!record.fileHandle) throw new Error("Файл недоступен. Выберите его снова.");
    if (typeof record.fileHandle.queryPermission === "function") {
      let permission = await record.fileHandle.queryPermission({ mode: "read" });
      if (permission !== "granted" && typeof record.fileHandle.requestPermission === "function") {
        permission = await record.fileHandle.requestPermission({ mode: "read" });
      }
      if (permission !== "granted") throw new Error("Браузер ждёт разрешение на чтение выбранной папки. Выберите папку ещё раз и повторите.");
    }
    return record.fileHandle.getFile();
  }

  async function openFile(record) {
    const reader = document.getElementById("local-reader");
    const body = document.getElementById("local-reader-body");
    const title = document.getElementById("reader-title");
    body.replaceChildren();
    title.textContent = record.name;
    reader.hidden = false;
    setStatus("Открываю локальный файл…");
    try {
      const file = await getFile(record);
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = URL.createObjectURL(file);
      const kind = localKind(file);
      if (kind === "pdf") {
        const frame = document.createElement("iframe");
        frame.src = activeObjectUrl;
        frame.title = record.name;
        body.appendChild(frame);
      } else if (kind === "image") {
        const image = document.createElement("img");
        image.src = activeObjectUrl;
        image.alt = record.name;
        body.appendChild(image);
      } else if (kind === "audio") {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.src = activeObjectUrl;
        body.appendChild(audio);
      } else if (kind === "text" && file.size <= 8 * 1024 * 1024) {
        const pre = document.createElement("pre");
        pre.textContent = await file.text();
        body.appendChild(pre);
      } else {
        const note = document.createElement("p");
        note.textContent = kind === "text" ? "Текстовый файл слишком велик для встроенного просмотра. Скачайте его и откройте на компьютере." :
          "Для этого формата используйте скачивание и откройте файл приложением на компьютере.";
        body.appendChild(note);
      }
      const download = document.createElement("a");
      download.className = "local-download";
      download.href = activeObjectUrl;
      download.download = record.name;
      download.textContent = "Скачать локальную копию ↓";
      body.appendChild(download);
      reader.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("Файл открыт из локального хранилища.");
    } catch (error) {
      body.textContent = error.message;
      tell(error.message);
      setStatus("Проверьте доступ к выбранной папке.");
    }
  }

  async function ensurePermission(handle, mode) {
    if (!handle) return false;
    if (typeof handle.queryPermission !== "function") return true;
    let permission = await handle.queryPermission({ mode: mode });
    if (permission !== "granted" && typeof handle.requestPermission === "function") {
      permission = await handle.requestPermission({ mode: mode });
    }
    return permission === "granted";
  }

  async function removeFile(record) {
    if (!window.confirm("Удалить «" + record.name + "» из локальной подборки?")) return;
    try {
      if (record.storage === "folder" && record.folderHandle) {
        if (!(await ensurePermission(record.folderHandle, "readwrite"))) {
          tell("Разрешите доступ к выбранной папке, чтобы удалить файл.");
          return;
        }
        await record.folderHandle.removeEntry(record.savedName);
      }
      await deleteRecord(record.id);
      await renderFiles();
      setStatus("Материал удалён из локальной подборки.");
    } catch (error) {
      tell("Не удалось удалить файл: " + error.message);
    }
  }

  function sanitizedName(name) {
    return name.replace(/[\\/:*?\"<>|]/g, "_").replace(/^\.+/, "").trim() || "material";
  }

  async function uniqueName(folder, sourceName) {
    const cleaned = sanitizedName(sourceName);
    const dot = cleaned.lastIndexOf(".");
    const stem = dot > 0 ? cleaned.slice(0, dot) : cleaned;
    const suffix = dot > 0 ? cleaned.slice(dot) : "";
    let candidate = cleaned;
    let number = 2;
    while (true) {
      try {
        await folder.getFileHandle(candidate);
        candidate = stem + " (" + number + ")" + suffix;
        number += 1;
      } catch (error) {
        return candidate;
      }
    }
  }

  async function storeInFolder(file, collection) {
    const permission = await ensurePermission(directoryHandle, "readwrite");
    if (!permission) throw new Error("Нет разрешения на запись в выбранную папку.");
    const folder = await directoryHandle.getDirectoryHandle(COLLECTIONS[collection].folder, { create: true });
    const savedName = await uniqueName(folder, file.name);
    const fileHandle = await folder.getFileHandle(savedName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
    const record = {
      id: crypto.randomUUID(),
      collection: collection,
      name: file.name,
      size: file.size,
      type: file.type || "",
      addedAt: Date.now(),
      storage: "folder",
      savedName: savedName,
      fileHandle: fileHandle,
      folderHandle: folder
    };
    await writeRecord("files", record);
    return record;
  }

  async function storeInBrowser(file, collection) {
    const record = {
      id: crypto.randomUUID(),
      collection: collection,
      name: file.name,
      size: file.size,
      type: file.type || "",
      addedAt: Date.now(),
      storage: "browser",
      blob: file
    };
    await writeRecord("files", record);
    return record;
  }

  async function importFiles(fileList, collection) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    let saved = 0;
    let usedBrowserStore = false;
    for (const file of files) {
      try {
        if (directoryHandle) {
          try {
            await storeInFolder(file, collection);
          } catch (error) {
            await storeInBrowser(file, collection);
            usedBrowserStore = true;
          }
        } else {
          await storeInBrowser(file, collection);
          usedBrowserStore = true;
        }
        saved += 1;
      } catch (error) {
        tell("Не удалось сохранить " + file.name + ": " + error.message);
      }
    }
    await renderFiles();
    if (usedBrowserStore) {
      setStatus(saved + " файл(ов) сохранено локально в профиле этого браузера. Папка на компьютере не выбрана.");
    } else {
      setStatus(saved + " файл(ов) записано в выбранную папку на компьютере.");
    }
    if (saved) tell(countLabel(saved) + " добавлено в подборку. Файлы остались на этом устройстве.");
  }

  async function chooseFolder() {
    if (typeof window.showDirectoryPicker !== "function") {
      tell("Этот браузер не даёт сайту доступ к папкам. Файлы будут храниться в локальной базе браузера на этом компьютере.");
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: "family-literary-archive", mode: "readwrite" });
      directoryHandle = handle;
      await writeRecord("settings", { key: "directory", value: handle });
      setStatus("Папка «" + handle.name + "» выбрана. Новые файлы будут сохранены в ней.");
      tell("Выбрана папка «" + handle.name + "» на этом компьютере.");
    } catch (error) {
      if (error.name !== "AbortError") tell("Не удалось выбрать папку: " + error.message);
    }
  }

  async function initialize() {
    chooseFolderButton.hidden = typeof window.showDirectoryPicker !== "function";
    document.querySelectorAll(".upload-button").forEach(function (button) {
      button.addEventListener("click", function () {
        activeCollection = button.getAttribute("data-collection");
        fileInput.click();
      });
    });
    fileInput.addEventListener("change", function () {
      importFiles(fileInput.files, activeCollection);
      fileInput.value = "";
    });
    document.getElementById("close-reader").addEventListener("click", function () {
      document.getElementById("local-reader").hidden = true;
      document.getElementById("local-reader-body").replaceChildren();
      if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    });
    chooseFolderButton.addEventListener("click", chooseFolder);
    try {
      directoryHandle = await readSetting("directory");
      await readAllFiles();
      if (directoryHandle) {
        setStatus("Выбранная папка: «" + directoryHandle.name + "». При следующем сохранении браузер может попросить подтвердить доступ.");
      } else if (typeof window.showDirectoryPicker === "function") {
        setStatus("Файлы пока будут храниться в локальной базе этого браузера. Выберите папку, чтобы сохранять копии в отдельное место на компьютере.");
      } else {
        setStatus("Файлы будут храниться в локальной базе этого браузера на этом компьютере.");
      }
      await renderFiles();
    } catch (error) {
      setStatus("Локальное хранилище не удалось запустить: " + error.message);
    }
  }

  initialize();
})();
