// Projects saved on the phone, in IndexedDB.
//
//   projects   { id, data, thumb, modified }   data = the project.json object
//   files      "<id>/source"    the picked photo, as the original file
//              "<id>/prepped"   { w, h, rgba, mask }   output of Prep
//              "<id>/solved"    { w, h, heights }      output of Solve
//
// The same split as a desktop project folder, so a project can be packed
// into one later (see projectzip.js). Storage belongs to the address the
// app was opened from: http://192.168.x.x:5173 and an installed app each
// keep their own projects.

const DB_NAME = "huelite";
const DB_VERSION = 1;
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" });
        if (!d.objectStoreNames.contains("files")) d.createObjectStore("files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // ask once to be exempt from eviction; browsers may quietly say no
    navigator.storage?.persist?.().catch(() => {});
  }
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("storage transaction aborted"));
    result = fn(...[stores].flat().map((s) => t.objectStore(s)));
  });
}

const req2promise = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function listProjects() {
  const d = await db();
  const all = await req2promise(d.transaction("projects").objectStore("projects").getAll());
  return all.sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
}

/** Save the project.json, and a new thumbnail if one is given. */
export async function saveProject(data, thumb = undefined) {
  const old = thumb === undefined ? await getProject(data.id) : null;
  const record = { id: data.id, data: JSON.parse(JSON.stringify(data)), modified: data.modified,
                   thumb: thumb === undefined ? old?.thumb ?? null : thumb };
  return tx("projects", "readwrite", (s) => s.put(record));
}

export const putFile = (id, name, value) => tx("files", "readwrite", (s) => s.put(value, `${id}/${name}`));
export const deleteFile = (id, name) => tx("files", "readwrite", (s) => s.delete(`${id}/${name}`));

export async function getFile(id, name) {
  const d = await db();
  return req2promise(d.transaction("files").objectStore("files").get(`${id}/${name}`));
}

export async function getProject(id) {
  const d = await db();
  return req2promise(d.transaction("projects").objectStore("projects").get(id));
}

export async function deleteProject(id) {
  await tx(["projects", "files"], "readwrite", (p, f) => {
    p.delete(id);
    for (const name of ["source", "prepped", "solved", "side"]) f.delete(`${id}/${name}`);
  });
}

/** File a project under a folder ("" = none) without touching anything else. */
export async function setGroup(id, group) {
  const rec = await getProject(id);
  if (!rec) return;
  rec.data.group = String(group || "").trim().slice(0, 60);
  await saveProject(rec.data);
}

/** Rename a folder: every project in it follows. newName "" empties it. */
export async function renameGroup(oldName, newName) {
  for (const rec of await listProjects()) {
    if ((rec.data.group || "") === oldName) await setGroup(rec.id, newName);
  }
}
